// The bush plane: its state and the one step that moves it. No drawing and no
// browser here — step() takes the pilot's throttle and pitch commands plus the
// terrain under it and returns what happened as bit flags, so the caller can
// score, sound and announce without the plane knowing about screens.
//
// The flight model is arcade with discipline baked in: thrust fights quadratic
// drag, climbing bleeds speed to gravity, the wing quits below stall speed and
// the nose drops, and the ground is only friendly on a runway, slow and gentle.

import { DAMAGE, PLANE, RUNWAYS, WIND, WORLD } from './config.js';

export const EVENT_RING = 1;
export const EVENT_DROP = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_DAMAGED = 32;

export const STATE_PARKED = 'parked';
export const STATE_FLYING = 'flying';
export const STATE_LANDED = 'landed';
export const STATE_CRASHED = 'crashed';

const KNOTS = 1.94384; // m/s to knots

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function onRunway(x) {
  for (const runway of RUNWAYS) {
    if (x >= runway.x0 && x <= runway.x1) return runway;
  }
  return null;
}

export function createAircraft(terrain, rings) {
  const plane = {
    x: 0, // metres east along the chain
    alt: 0, // metres above sea level
    speed: 0, // m/s along the flight path
    pitch: 0, // radians, positive is nose up
    throttle: 0, // 0..1
    fuel: PLANE.tank,
    damage: 0,
    state: STATE_PARKED,
    vspeed: 0, // m/s, vertical speed (for the HUD and landing judgement)
    heading: 90, // degrees; this sortie flies east, wind nudges the needle
    grounded: true,
    propAngle: 0,
    ringIndex: 0, // next ring to fly through
    ringsDone: 0,
    dropped: false,
    landedAt: null,
    crashReason: '',
    sinkAtTouch: 0,
  };
  const state = plane;

  function reset() {
    plane.x = 380;
    plane.alt = terrain.groundAt(380) + PLANE.gearHeight;
    plane.speed = 0;
    plane.pitch = 0;
    plane.throttle = 0;
    plane.fuel = PLANE.tank;
    plane.damage = 0;
    plane.state = STATE_PARKED;
    plane.vspeed = 0;
    plane.heading = 90;
    plane.grounded = true;
    plane.propAngle = 0;
    plane.ringIndex = 0;
    plane.ringsDone = 0;
    plane.dropped = false;
    plane.landedAt = null;
    plane.crashReason = '';
    plane.sinkAtTouch = 0;
    for (const ring of rings) ring.done = false;
  }

  /** Wind speed at this moment in the sortie: a steady breeze plus a slow gust. */
  function windAt(elapsed) {
    return WIND.base + WIND.gustAmp * Math.sin((elapsed / WIND.gustPeriod) * Math.PI * 2);
  }

  function crash(reason) {
    plane.state = STATE_CRASHED;
    plane.crashReason = reason;
    return EVENT_CRASHED;
  }

  /**
   * One fixed step. `controls` carries throttleDelta (-1/0/1), pitchCommand
   * (-1/0/1) and dropPressed. `elapsed` is the sortie clock, for the wind.
   */
  function step(dt, controls, elapsed) {
    if (plane.state === STATE_CRASHED) return 0;
    if (plane.state === STATE_LANDED) {
      // Rollout: the engine idles down, the brakes bite, the prop slows.
      plane.throttle = Math.max(0, plane.throttle - dt * 0.5);
      plane.speed = Math.max(0, plane.speed - PLANE.groundFriction * dt);
      plane.x += plane.speed * dt;
      plane.propAngle += (2 + plane.throttle * 38) * dt;
      plane.fuel = Math.max(0, plane.fuel - PLANE.burnIdle * dt);
      return 0;
    }
    let events = 0;
    const ground = terrain.groundAt(plane.x);
    const wasGrounded = plane.grounded;

    // --- throttle and fuel -------------------------------------------------
    const fuelBefore = plane.fuel;
    plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt * 0.9, 0, 1);
    plane.fuel = Math.max(0, plane.fuel - (PLANE.burnIdle + plane.throttle * PLANE.burnFull) * dt);
    if (fuelBefore > 0 && plane.fuel === 0) events |= EVENT_FUEL_EMPTY;
    const thrust = plane.fuel > 0 ? plane.throttle * PLANE.maxThrottleAccel : 0;

    // --- pitch: the pilot's command, eased in as the wing gains authority --
    const authority = clamp(plane.speed / 25, 0.15, 1);
    const targetPitch = controls.pitchCommand * PLANE.pitchMax * (controls.pitchCommand < 0 ? 1.1 : 1);
    const wanted = clamp(targetPitch, PLANE.pitchMin, PLANE.pitchMax);
    plane.pitch += clamp(wanted - plane.pitch, -PLANE.pitchRate * authority * dt, PLANE.pitchRate * authority * dt);
    if (plane.speed < PLANE.stallSpeed && !plane.grounded) {
      // Stalled wing: the nose falls on its own until speed comes back.
      plane.pitch = Math.max(PLANE.pitchMin, plane.pitch - PLANE.noseDropRate * dt);
    }

    // --- speed along the flight path ---------------------------------------
    const drag = PLANE.drag * plane.speed * plane.speed;
    const climbCost = plane.grounded ? 0 : PLANE.gravityPull * Math.sin(plane.pitch);
    const extraClimbDrag = plane.pitch > 0 ? PLANE.climbDrag * plane.pitch * plane.speed * 0.12 : 0;
    plane.speed = Math.max(0, plane.speed + (thrust - drag - climbCost - extraClimbDrag) * dt);
    plane.speed = Math.min(plane.speed, PLANE.maxSpeed + windAt(elapsed));

    // --- position -----------------------------------------------------------
    const wind = windAt(elapsed);
    const vx = plane.speed * Math.cos(plane.pitch) + wind;
    const vy = plane.grounded ? 0 : plane.speed * Math.sin(plane.pitch);
    plane.x += vx * dt;
    plane.alt += vy * dt;
    plane.vspeed = vy;
    plane.propAngle += (2 + plane.throttle * 38) * dt;
    plane.heading = 90 + Math.sin(elapsed * 0.5) * 2 * (wind / WIND.base - 1);

    // --- rings ---------------------------------------------------------------
    const ring = rings[plane.ringIndex];
    if (ring && !ring.done && plane.x >= ring.x - 10 && plane.x <= ring.x + 10) {
      if (Math.abs(plane.alt - ring.alt) < ring.r) {
        ring.done = true;
        plane.ringIndex += 1;
        plane.ringsDone += 1;
        events |= EVENT_RING;
      }
    }

    // --- ground contact ------------------------------------------------------
    const floor = ground + PLANE.gearHeight;
    if (plane.alt <= floor) {
      const runway = onRunway(plane.x);
      const sink = -plane.vspeed;
      if (ground <= 0.5) {
        // Water: ditching a bush plane at speed is the end of the sortie.
        plane.alt = floor;
        return events | crash('Ditched in the sea — the floats were only ever a rumour.');
      }
      if (!wasGrounded) {
        // Touchdown: judge it by sink rate and speed, on a runway or rough ground.
        plane.sinkAtTouch = sink;
        if (sink >= DAMAGE.crashSink || plane.speed >= 62) {
          plane.alt = floor;
          return events | crash(sink >= DAMAGE.crashSink ? 'Came down far too hard — the gear folded.' : 'Hit the ground far too fast to stay in one piece.');
        }
        if (sink > DAMAGE.hardLandingSink) {
          plane.damage = Math.min(100, plane.damage + (sink - DAMAGE.hardLandingSink) * DAMAGE.damagePerSink);
          events |= EVENT_DAMAGED;
          if (plane.damage >= 100) {
            plane.alt = floor;
            return events | crash('The hard landings added up — the airframe gave out.');
          }
          plane.vspeed = 0;
          plane.alt = floor + 1.5; // a bounce, not a landing — she settles next touch
          plane.grounded = false;
          return events;
        }
        if (runway) {
          plane.grounded = true;
          plane.alt = floor;
          plane.pitch = 0;
          plane.state = STATE_LANDED;
          plane.landedAt = runway.name;
          return events | EVENT_LANDED;
        }
        // Rough ground, gentle enough to roll out: a bush landing, with a jolt.
        plane.damage = Math.min(100, plane.damage + 8);
        events |= EVENT_DAMAGED;
        plane.grounded = true;
        plane.alt = floor;
        plane.pitch = 0;
        plane.state = STATE_LANDED;
        plane.landedAt = 'rough ground';
        return events | EVENT_LANDED;
      }
      plane.alt = floor;
      plane.grounded = true;
    } else {
      plane.grounded = false;
    }

    // --- rolling on the ground ----------------------------------------------
    if (plane.grounded) {
      const runway = onRunway(plane.x);
      if (plane.throttle < PLANE.brakeThrottle && plane.speed < 1) {
        plane.speed = 0; // parking brake holds until the pilot means it
      } else {
        const rollingDrag = runway ? 0.4 : PLANE.groundFriction;
        plane.speed = Math.max(0, plane.speed + (thrust - rollingDrag - (runway ? 0 : 2)) * dt);
      }
      // Rotation: enough speed and a pull on the stick lifts off.
      if (plane.speed >= PLANE.rotateSpeed && controls.pitchCommand > 0) {
        plane.grounded = false;
        plane.state = STATE_FLYING;
        plane.alt = floor + 0.5;
      }
      if (plane.x >= WORLD.length - 50) {
        plane.speed = 0;
        return events | crash('Ran out of island — the chain ends here.');
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, windAt };
}

export function speedKnots(plane) {
  return Math.round(plane.speed * KNOTS);
}

export function altitudeFeet(plane) {
  return Math.round(plane.alt * 3.28084);
}
