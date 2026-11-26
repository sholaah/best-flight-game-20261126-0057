// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh sortie for a fixed stretch, steered by a simple
// autopilot (point the nose at the next ring's altitude, hold a cruise speed,
// ride the glide slope onto runway B), so the frame is what a real flight
// looks like and the same seed always gives the same frame.
//
// start: parked on runway A, engine idling, title panel up.
// play:  a full takeoff and ring run, frozen mid-flight over Tanjung Town.
// end:   a staged final approach onto runway B, flared and landed.

import { RUNWAYS, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 3;
const PLAY_MAX_SECONDS = 130;
const PLAY_FREEZE_X = 5600; // freeze the frame over the town, ring 3 ahead
const END_MAX_SECONDS = 90; // firm glide-slope flying lands in ~30 s; the cap is slack
const END_STAGE = { x: 10200, alt: 150, speed: 40, throttle: 0.35 };

/** Pitch and throttle that chase a desired altitude and speed. Gentle gains
 *  keep the nose near level, which is what a frozen screenshot wants. */
function flyToward(plane, desiredAlt, desiredSpeed) {
  const altError = desiredAlt - plane.alt;
  const pitch = Math.max(-0.6, Math.min(0.6, altError * 0.012 - plane.vspeed * 0.1));
  const speedError = desiredSpeed - plane.speed;
  const throttleDelta = Math.max(-1, Math.min(1, speedError * 0.06));
  return { throttleDelta, pitchCommand: pitch };
}

/** The same chase with firm gains: the landing scene must ride the glide
 *  slope down firmly and flare, not float above it. */
function flyTowardFirm(plane, desiredAlt, desiredSpeed) {
  const altError = desiredAlt - plane.alt;
  const pitch = Math.max(-0.8, Math.min(0.8, altError * 0.03 - plane.vspeed * 0.05));
  const speedError = desiredSpeed - plane.speed;
  const throttleDelta = Math.max(-1, Math.min(1, speedError * 0.06));
  return { throttleDelta, pitchCommand: pitch };
}

function autopilot(flight) {
  const plane = flight.plane;
  const nextRing = flight.rings[plane.ringIndex];
  if (plane.grounded) {
    // On the runway: full throttle, pull up once she is fast enough to fly.
    return { throttleDelta: 1, pitchCommand: plane.speed >= 17 ? 1 : 0 };
  }
  if (nextRing) {
    const ahead = nextRing.x - plane.x;
    const desiredAlt = ahead < 1500 ? nextRing.alt : 120;
    return flyToward(plane, desiredAlt, 44);
  }
  // Rings done: hold a cruise altitude and speed toward the far runway.
  return flyToward(plane, 110, 40);
}

/** Glide-slope autopilot for the landing scene: ride a steady slope down to
 *  the runway threshold, then flare flat over the strip. */
function landingAutopilot(flight) {
  const plane = flight.plane;
  const threshold = RUNWAYS[1].x0;
  const toThreshold = threshold - plane.x;
  if (plane.grounded) return { throttleDelta: -1, pitchCommand: 0 };
  const desiredAlt = toThreshold > 150 ? 6 + toThreshold * 0.12 : 6 + Math.max(0, toThreshold) * 0.02;
  return flyTowardFirm(plane, desiredAlt, 30);
}

/**
 * Set `flight` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, flight) {
  flight.reset();
  const plane = flight.plane;

  if (name !== 'play' && name !== 'end') {
    // Parked, engine idling at 30%, prop turning: the title scene.
    plane.throttle = 0.3;
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      flight.step(STEP, { throttleDelta: 0, pitchCommand: 0 });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'play') {
    for (let i = 0; i < PLAY_MAX_SECONDS / STEP; i += 1) {
      flight.step(STEP, autopilot(flight));
      if (plane.x >= PLAY_FREEZE_X || plane.state === 'crashed') break;
    }
    return { screen: SCREEN_PLAY, best: flight.sortie.score };
  }

  // end: place the plane on final approach to runway B and fly her down.
  plane.x = END_STAGE.x;
  plane.alt = END_STAGE.alt;
  plane.speed = END_STAGE.speed;
  plane.throttle = END_STAGE.throttle;
  plane.pitch = -0.08;
  plane.grounded = false;
  plane.state = 'flying';
  plane.fuel = 60;
  plane.ringIndex = flight.rings.length;
  for (const ring of flight.rings) ring.done = true;
  flight.sortie.leg = 2;
  flight.sortie.ringsDone = flight.rings.length;
  for (let i = 0; i < END_MAX_SECONDS / STEP; i += 1) {
    flight.step(STEP, landingAutopilot(flight));
    if (plane.state === 'landed') {
      // Two seconds of rollout so the panel reads over a stopped plane.
      for (let j = 0; j < 2 / STEP; j += 1) flight.step(STEP, { throttleDelta: -1, pitchCommand: 0 });
      break;
    }
    if (plane.state === 'crashed') break;
  }
  return { screen: SCREEN_OVER, best: flight.sortie.score };
}
