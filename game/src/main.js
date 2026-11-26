// Boot and the one loop: input is read every frame, the flight advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and sortie over (landed or crashed).
//
// ?seed=N fixes the island chain. ?shot=start|play|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, RINGS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createAircraft, EVENT_CRASHED, EVENT_LANDED, EVENT_RING } from './aircraft.js';
import { createSortie } from './missions.js';
import { ACTION_CONFIRM, ACTION_DROP, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The chain is the same every visit unless a seed is asked for. */
const DEFAULT_SEED = 20261126;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

/** One flight: terrain, plane, sortie and the clock, stepped together. */
function createFlight(seedValue) {
  const random = createRandom(seedValue);
  const terrain = createTerrain(random);
  // One rings array, shared by the aircraft (which detects fly-throughs) and
  // the sortie (which scores them and draws them).
  const rings = RINGS.map((ring) => ({ ...ring, done: false }));
  const aircraft = createAircraft(terrain, rings);
  const plane = aircraft.state;
  const sortie = createSortie(plane, rings);
  const flight = {
    plane,
    sortie: sortie.sortie,
    rings,
    terrain,
    elapsed: 0,
    reset() {
      aircraft.reset();
      sortie.reset();
      flight.elapsed = 0;
    },
    step(dt, controls) {
      flight.elapsed += dt;
      const events = aircraft.step(dt, controls, flight.elapsed);
      sortie.applyEvents(events, flight.elapsed);
      return events;
    },
  };
  return flight;
}

const flight = createFlight(seed);
const renderer = createRenderer(canvas, flight.terrain);
const audio = createAudio();
// The title scene idles with the engine turning over, prop spinning.
flight.plane.throttle = 0.3;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight);
  // Paint synchronously, twice, so the frame is on the canvas by the time the
  // page finishes loading — headless screenshots must not wait on rAF.
  for (let painted = 0; painted < 2; painted += 1) {
    renderer.draw({
      plane: flight.plane,
      sortie: flight.sortie,
      rings: flight.rings,
      screen: scene.screen,
      best: scene.best,
      elapsed: flight.elapsed,
    });
  }
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startSortie() {
    flight.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Take off from runway A, then fly the rings.');
  }

  function endSortie() {
    screen = SCREEN_OVER;
    if (flight.sortie.score > best) {
      best = flight.sortie.score;
      saveBest(best);
    }
    announce(
      flight.plane.state === 'crashed'
        ? `Crashed. ${flight.plane.crashReason} Score ${flight.sortie.score}.`
        : `Sortie complete. Score ${flight.sortie.score}. Best ${best}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_DROP) {
      audio.unlock();
      if (screen === SCREEN_PLAY) {
        if (flight.sortie.tryDrop(flight.elapsed)) audio.dropThud();
      } else if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
        startSortie();
      }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.unlock();
      startSortie();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    const controls = {
      throttleDelta: input.throttleDelta(),
      pitchCommand: input.pitchCommand(canvas.clientHeight),
    };
    const events = flight.step(STEP, controls);
    if (events & EVENT_RING) audio.chime();
    if (events & EVENT_LANDED) {
      audio.landThud();
      endSortie();
    } else if (events & EVENT_CRASHED) {
      audio.crashBang();
      endSortie();
    }
    audio.setFlight(flight.plane.throttle, flight.plane.speed, !flight.plane.grounded);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The title scene idles: the prop turns, the clouds drift, the plane waits.
      flight.elapsed += STEP;
      flight.plane.propAngle += (2 + flight.plane.throttle * 38) * STEP;
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw({
      plane: flight.plane,
      sortie: flight.sortie,
      rings: flight.rings,
      screen,
      best,
      elapsed: flight.elapsed,
    });
  }

  // Leaving the tab pauses a running sortie rather than letting fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Island Hopper. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
