// The sortie: three legs in order — ring run, supply drop, landing — plus the
// score. This module owns the objective state and the points; the aircraft owns
// the flying. A leg is done when its condition is met, and the next one lights
// up. Landing anywhere ends the sortie, and the score is judged by where and
// how gently the plane came down.

import { DROP_ZONE, MISSIONS, RINGS, SCORE } from './config.js';

export function createSortie(plane, sharedRings) {
  const rings = sharedRings ?? RINGS.map((ring) => ({ ...ring, done: false }));
  const sortie = {
    leg: 0, // index into MISSIONS: 0 rings, 1 drop, 2 land
    score: 0,
    rings: rings.length,
    ringsDone: 0,
    dropped: false,
    dropX: null,
    dropAlt: 0,
    dropTime: 0,
    elapsed: 0,
    finished: false,
    perfectLanding: false,
    message: '',
    messageUntil: 0,
  };

  function mission() {
    return MISSIONS[Math.min(sortie.leg, MISSIONS.length - 1)];
  }

  function flash(text, elapsed, seconds) {
    sortie.message = text;
    sortie.messageUntil = elapsed + seconds;
  }

  /** The drop key: only counts inside the zone, low and slow, while leg 1 is live. */
  function tryDrop(elapsed) {
    if (sortie.leg !== 1 || sortie.dropped) return false;
    const inZone = plane.x >= DROP_ZONE.x0 && plane.x <= DROP_ZONE.x1;
    const lowEnough = plane.alt <= DROP_ZONE.maxAlt;
    const slowEnough = plane.speed <= DROP_ZONE.maxSpeed;
    const flying = !plane.grounded;
    if (!inZone || !lowEnough || !slowEnough || !flying) {
      if (inZone && flying) flash('Too high or too fast for a drop — slow down below 80 kt and 95 m.', elapsed, 3);
      return false;
    }
    sortie.dropped = true;
    sortie.dropX = plane.x;
    sortie.dropAlt = plane.alt;
    sortie.dropTime = elapsed;
    sortie.score += SCORE.drop;
    sortie.leg = 2;
    flash('Crate away over Tanjung Town! +150 — now land at Kota Bay, runway B.', elapsed, 4);
    return true;
  }

  /** Called with the aircraft's event flags after every step. */
  function applyEvents(events, elapsed) {
    sortie.elapsed = elapsed;
    if (events & 1) {
      // EVENT_RING
      sortie.score += SCORE.ring;
      sortie.ringsDone += 1;
      flash(`Ring ${sortie.ringsDone} of ${sortie.rings}! +100`, elapsed, 2.5);
      if (sortie.ringsDone >= sortie.rings && sortie.leg === 0) {
        sortie.leg = 1;
        flash('All rings! Next: supply drop over Tanjung Town — low and slow.', elapsed, 4);
      }
    }
    if (events & 4) {
      // EVENT_LANDED
      const sink = plane.sinkAtTouch;
      sortie.score += SCORE.landing;
      sortie.perfectLanding = sink <= SCORE.perfectLandingSink;
      if (sortie.perfectLanding) sortie.score += SCORE.perfectBonus;
      sortie.score += Math.round(plane.fuel) * SCORE.fuelBonusPerUnit;
      sortie.finished = true;
      const where = plane.landedAt ?? 'the ground';
      flash(
        sortie.perfectLanding
          ? `Perfect landing at ${where}! +250, +100 smooth bonus, +${Math.round(plane.fuel) * SCORE.fuelBonusPerUnit} fuel left.`
          : `Down at ${where}. +250 landing, +${Math.round(plane.fuel) * SCORE.fuelBonusPerUnit} fuel left.`,
        elapsed,
        6,
      );
    }
    if (events & 8) {
      // EVENT_CRASHED
      sortie.finished = true;
      flash(plane.crashReason, elapsed, 6);
    }
    if (events & 16) {
      // EVENT_FUEL_EMPTY
      flash('Fuel empty! Glide her down — throttle is dead.', elapsed, 4);
    }
    if (events & 32) {
      // EVENT_DAMAGED
      flash(`Hard landing — airframe ${Math.round(plane.damage)}% damaged.`, elapsed, 3);
    }
  }

  function reset() {
    sortie.leg = 0;
    sortie.score = 0;
    sortie.ringsDone = 0;
    sortie.dropped = false;
    sortie.dropX = null;
    sortie.dropAlt = 0;
    sortie.dropTime = 0;
    sortie.elapsed = 0;
    sortie.finished = false;
    sortie.perfectLanding = false;
    sortie.message = '';
    sortie.messageUntil = 0;
    for (const ring of rings) ring.done = false;
  }

  function objectiveLine() {
    if (sortie.leg === 0) return `RING RUN — ${sortie.ringsDone}/${sortie.rings} rings`;
    if (sortie.leg === 1) return 'SUPPLY DROP — over Tanjung Town, below 95 m, under 80 kt, press Space';
    return 'LAND AT KOTA BAY — runway B, far east';
  }
  // The renderer reads the objective line off the state it is handed.
  sortie.objectiveLine = objectiveLine;

  return { sortie, rings, mission, tryDrop, applyEvents, reset, flash, objectiveLine };
}
