// Sound, synthesized live with WebAudio — no audio files, no network. The engine
// is a sawtooth through a low-pass filter whose pitch follows the throttle, the
// wind is looped noise whose gain follows airspeed, and rings, drops, landings
// and crashes are short note bursts. Everything is a no-op until the first
// user gesture creates the audio context, so headless screenshots stay silent.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(context.destination);
      engineOsc.start();

      // Two seconds of white noise, looped, for the wind.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const wind = context.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 480;
      windGain = context.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter).connect(windGain).connect(context.destination);
      wind.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  /** Call on every user gesture; resumes a suspended context. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  /** Continuous engine + wind, following throttle and airspeed. */
  function setFlight(throttle, speed, flying) {
    if (context === null || muted) return;
    const now = context.currentTime;
    engineOsc.frequency.setTargetAtTime(48 + throttle * 95, now, 0.08);
    engineFilter.frequency.setTargetAtTime(280 + throttle * 900, now, 0.08);
    engineGain.gain.setTargetAtTime(flying || throttle > 0.05 ? 0.05 + throttle * 0.06 : 0, now, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0016), now, 0.15);
  }

  function note(frequency, start, duration, type, volume) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function chime() {
    if (context === null || muted) return;
    const now = context.currentTime;
    note(880, now, 0.35, 'sine', 0.16);
    note(1318, now + 0.09, 0.4, 'sine', 0.12);
  }

  function dropThud() {
    if (context === null || muted) return;
    const now = context.currentTime;
    note(392, now, 0.3, 'triangle', 0.18);
    note(523, now + 0.12, 0.4, 'triangle', 0.14);
  }

  function landThud() {
    if (context === null || muted) return;
    const now = context.currentTime;
    note(180, now, 0.25, 'sine', 0.22);
    note(262, now + 0.08, 0.3, 'sine', 0.14);
  }

  function crashBang() {
    if (context === null || muted) return;
    const now = context.currentTime;
    note(90, now, 0.6, 'sawtooth', 0.2);
    note(55, now + 0.1, 0.7, 'square', 0.14);
  }

  function toggleMute() {
    muted = !muted;
    if (context !== null && muted) {
      engineGain.gain.value = 0;
      windGain.gain.value = 0;
    }
    return muted;
  }

  return { unlock, setFlight, chime, dropThud, landThud, crashBang, toggleMute };
}
