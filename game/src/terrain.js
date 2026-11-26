// The island chain: where the land is, how high it stands, and what stands on it.
// One seeded build fills a height table (one sample every few metres) plus the
// houses, palms and clouds, so the world is identical for a given seed and cheap
// to read while flying: heightAt(x) is a table lookup, never a fresh calculation.

import { LANDMARKS, RUNWAYS, WORLD } from './config.js';
import { createNoise } from './random.js';

/** The islands: centre, half-width and peak height, in metres. Gaps between them are sea. */
const ISLANDS = [
  { centre: 600, half: 700, peak: 42 }, // home island, runway A on its flat top
  { centre: 2600, half: 950, peak: 68 }, // beach island, ring 1 above it
  { centre: 6000, half: 1100, peak: 55 }, // town island
  { centre: 7600, half: 800, peak: 185 }, // Mt. Bara
  { centre: 9900, half: 750, peak: 48 }, // lighthouse point
  { centre: 11500, half: 900, peak: 38 }, // Kota Bay, runway B
];

function islandProfile(x, island, noise) {
  const d = (x - island.centre) / island.half;
  if (d <= -1 || d >= 1) return 0;
  // A raised-cosine dome, roughened by noise so no two slopes match.
  const dome = (Math.cos(d * Math.PI) + 1) / 2;
  const rough = 0.72 + 0.56 * noise(x);
  return island.peak * dome * rough;
}

function flattenRunway(heights, runway) {
  // Carve the runway strip dead flat at 6 m above the sea, with a gentle ramp in.
  // The height table is sampled every WORLD.sampleEvery metres, so work in samples.
  const ramp = 130;
  const x0 = Math.max(0, runway.x0 - ramp);
  const x1 = Math.min(WORLD.length, runway.x1 + ramp);
  const i0 = Math.floor(x0 / WORLD.sampleEvery);
  const i1 = Math.ceil(x1 / WORLD.sampleEvery);
  for (let i = i0; i <= i1; i += 1) {
    const x = i * WORLD.sampleEvery;
    const inside = x >= runway.x0 && x <= runway.x1;
    const edge = inside ? 1 : 1 - Math.min(1, (x < runway.x0 ? runway.x0 - x : x - runway.x1) / ramp);
    heights[i] = Math.max(0, heights[i] * (1 - edge) + 6 * edge);
  }
}

export function createTerrain(random) {
  const noise = createNoise(random, 64, 900);
  const count = Math.floor(WORLD.length / WORLD.sampleEvery) + 1;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = i * WORLD.sampleEvery;
    let h = 0;
    for (const island of ISLANDS) h = Math.max(h, islandProfile(x, island, noise));
    heights[i] = h;
  }
  for (const runway of RUNWAYS) flattenRunway(heights, runway);

  // Town houses: seeded plots along the town island's flat, each with a width,
  // a height and a roof pitch. Palms cluster on the beaches at the waterline.
  const houses = [];
  for (let x = LANDMARKS.town.x0 + 60; x < LANDMARKS.town.x1 - 60; x += 95 + random() * 70) {
    houses.push({
      x,
      w: 34 + random() * 26,
      h: 22 + random() * 20,
      roof: 10 + random() * 10,
      lit: random() < 0.6,
    });
  }
  const palms = [];
  for (let i = 0; i < 46; i += 1) {
    const x = 120 + random() * (WORLD.length - 240);
    const h = heightAtX(x);
    if (h > 2 && h < 14) palms.push({ x, h: 12 + random() * 9, lean: (random() - 0.5) * 0.5 });
  }
  // Clouds: seeded puffs drifting east on the wind, far above the highest peak.
  const clouds = [];
  for (let i = 0; i < 18; i += 1) {
    clouds.push({
      x: random() * WORLD.length,
      y: 380 + random() * 240,
      size: 30 + random() * 42,
      speed: 4 + random() * 5,
    });
  }
  // A few birds riding the thermals above the town island.
  const birds = [];
  for (let i = 0; i < 7; i += 1) {
    birds.push({ x: 5200 + random() * 1600, y: 120 + random() * 90, speed: 6 + random() * 5, phase: random() * 6.28 });
  }

  function heightAtX(x) {
    if (x <= 0) return heights[0];
    if (x >= WORLD.length) return heights[count - 1];
    const at = x / WORLD.sampleEvery;
    const i = Math.floor(at);
    const frac = at - i;
    return heights[i] + (heights[Math.min(count - 1, i + 1)] - heights[i]) * frac;
  }

  function groundAt(x) {
    return heightAtX(x);
  }

  return { heights, heightAt: heightAtX, groundAt, houses, palms, clouds, birds };
}
