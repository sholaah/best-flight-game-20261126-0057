// A small seeded random source (mulberry32): the same seed always deals the same
// islands, clouds and gusts, which is what makes the screenshot scenes repeatable
// and every sortie the same chain to learn. Nothing in the game rolls dice from
// Math.random; every random draw comes from a generator built here.

export function createRandom(seed) {
  let state = (seed | 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth value-noise field from one seeded generator: two octaves of interpolated
 *  lattice noise, so hills roll instead of jittering. */
export function createNoise(random, points, span) {
  const lattice = [];
  for (let i = 0; i < points; i += 1) lattice.push(random());
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise(x) {
    const scaled = ((x / span) % points + points) % points;
    const left = Math.floor(scaled);
    const frac = scaled - left;
    const a = lattice[left];
    const b = lattice[(left + 1) % points];
    return a + (b - a) * smooth(frac);
  };
}
