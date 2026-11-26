// Island Hopper — every tuning number, colour and mission constant in one place.
// The world is measured in metres: x runs east along the island chain, y is altitude
// above sea level. The renderer maps metres to screen pixels, so no rule below
// depends on the window size.

export const STEP = 1 / 60; // fixed simulation step, in seconds

export const WORLD = {
  length: 14000, // metres of island chain, west to east
  seaLevel: 0,
  sampleEvery: 4, // metres between precomputed terrain samples
  cruiseAltitude: 120,
};

/** The bush plane's flight model, tuned so takeoff, cruise and landing each feel different. */
export const PLANE = {
  stallSpeed: 15, // m/s; below this the nose drops and the wing stops flying
  rotateSpeed: 17, // m/s; the speed at which a pitch-up lifts off the runway
  maxSpeed: 78, // m/s; level-flight top speed at full throttle
  maxThrottleAccel: 7.5, // m/s^2 of thrust at full throttle
  drag: 0.0016, // quadratic drag coefficient (per metre of speed squared)
  climbDrag: 0.9, // extra drag while climbing, per radian of pitch
  gravityPull: 5.4, // m/s^2 the flight path loses while climbing, per radian
  pitchRate: 1.6, // radians per second of pitch authority at full speed
  pitchMin: -0.55, // steepest dive the pilot can command
  pitchMax: 0.5, // steepest climb the pilot can command
  noseDropRate: 0.7, // radians per second the nose falls in a stall
  groundFriction: 6.5, // m/s^2 of braking while rolling on a runway
  gearHeight: 2.2, // metres of landing gear below the plane's reference point
  tank: 200, // fuel units in a full tank
  burnIdle: 0.2, // fuel units per second at idle throttle
  burnFull: 0.85, // extra fuel units per second at full throttle
  brakeThrottle: 0.55, // throttle below this holds the parking brake on the ground
};

export const DAMAGE = {
  hardLandingSink: 3.2, // m/s of sink rate above which a touchdown hurts
  damagePerSink: 14, // damage points per m/s of sink beyond the hard-landing line
  crashSink: 9, // m/s of sink rate that wrecks the plane outright
  terrainSpeed: 26, // m/s of ground speed that wrecks the plane on a terrain strike
};

export const SCORE = {
  ring: 100,
  drop: 150,
  landing: 250,
  fuelBonusPerUnit: 2, // points per unit of fuel left at the end of a sortie
  perfectLandingSink: 1.2, // sink rate at or below which a landing is "perfect"
  perfectBonus: 100,
};

/** The three legs of one sortie, in order. */
export const MISSIONS = [
  { id: 'rings', name: 'RING RUN', blurb: 'Fly through all 5 rings over the islands.' },
  { id: 'drop', name: 'SUPPLY DROP', blurb: 'Drop the crate over the town — low and slow, then press Space.' },
  { id: 'land', name: 'LAND AT KOTA BAY', blurb: 'Put her down gently on runway B, far east.' },
];

/** Target rings: x along the chain, altitude above sea level, radius in metres. */
export const RINGS = [
  { x: 2400, alt: 90, r: 30 },
  { x: 4200, alt: 150, r: 30 },
  { x: 6100, alt: 70, r: 28 },
  { x: 8300, alt: 170, r: 30 },
  { x: 10100, alt: 100, r: 28 },
];

/** The supply-drop zone over the town: x range, and the limits for a good drop. */
export const DROP_ZONE = { x0: 5600, x1: 6400, maxAlt: 95, maxSpeed: 42 };

/** The two runways: flat strips of terrain, with a windsock at each end. */
export const RUNWAYS = [
  { name: 'RUNWAY A · HOME', x0: 250, x1: 950, heading: '090' },
  { name: 'RUNWAY B · KOTA BAY', x0: 11150, x1: 11850, heading: '090' },
];

/** Landmarks the pilot navigates by, drawn on the terrain. */
export const LANDMARKS = {
  town: { x0: 5400, x1: 6600, label: 'TANJUNG TOWN' },
  mountain: { x: 7600, label: 'MT. BARA' },
  lighthouse: { x: 9850, label: 'LIGHTHOUSE PT.' },
};

export const WIND = {
  base: 3, // m/s of steady easterly breeze, pushing the plane along
  gustAmp: 2.5, // m/s of gust, swaying with a slow seeded sine
  gustPeriod: 23, // seconds per gust cycle
};

export const PALETTE = {
  skyTop: '#2f7fc9',
  skyMid: '#7db8e8',
  skyLow: '#cfe8f7',
  sun: '#ffd66b',
  sunGlow: 'rgba(255, 214, 107, 0.35)',
  sea: '#1d7fb8',
  seaDeep: '#14608f',
  seaFoam: '#bfe6f5',
  sand: '#e8d39a',
  grass: '#5da24a',
  grassDark: '#47853a',
  rock: '#8a7d6b',
  snow: '#f4f7fa',
  runway: '#3c4148',
  runwayLine: '#f2f2e8',
  planeRed: '#d8443a',
  planeCream: '#f6ead2',
  planeDark: '#2b2f36',
  glass: '#a8d8ee',
  ring: '#ffb02e',
  ringGlow: 'rgba(255, 176, 46, 0.45)',
  ringDone: '#7ddb6a',
  hudPanel: 'rgba(12, 24, 38, 0.72)',
  hudText: '#eef6fb',
  hudDim: '#9fc3d8',
  hudWarn: '#ffb02e',
  hudBad: '#ff5d4d',
  hudGood: '#7ddb6a',
  panel: 'rgba(10, 22, 34, 0.86)',
  panelEdge: '#3f6d8a',
  cloud: 'rgba(255, 255, 255, 0.92)',
  houseWall: '#f2e3c2',
  houseRoof: '#b4503c',
  palm: '#3f7d33',
  palmTrunk: '#7a5a3a',
  lighthouse: '#e8e4da',
  lighthouseTop: '#c23b2e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best sortie score is kept between visits (this browser only). */
export const BEST_KEY = 'island-hopper.best';
