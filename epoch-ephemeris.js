// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Long-range positions of the slow planets (Epoch Explorer) ─────────────
// Astronomy Engine (astronomy-engine.js) is accurate to about an arcminute from roughly
// 1000 AD on, but its shortened planetary theory drifts further back: by 5000 BC Saturn
// is off by up to 4°, Jupiter by over 1°. The Epoch Explorer reaches back to 5000 BC,
// so it adds a correction to each planet's heliocentric position: the difference
// between NASA JPL's DE441 ephemeris (the reference standard, fetched from JPL
// Horizons) and Astronomy Engine, sampled along the orbit and interpolated in between
// (EPOCH_EPHEMERIS_CORRECTIONS.corrections, epoch-ephemeris-data.js, built by
// tools/build-epoch-data.js). Pluto is different: Astronomy Engine integrates its orbit
// step by step from a table near the present, which takes about a second per position
// in antiquity, so Pluto's heliocentric position is taken from DE441 directly
// (EPOCH_EPHEMERIS_CORRECTIONS.positions), interpolated the same way. Either way the
// positions follow DE441 to well under an arcminute over the whole range.
//
// Loaded in the browser after astronomy-engine.js and epoch-ephemeris-data.js, and by
// the build tool in Node (which supplies both through epochEphemerisSetup).

const EPOCH_BODIES = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const EPOCH_GLYPHS = { Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇' };
// The range the corrections (and the stored conjunctions) cover, as days from J2000 (UT).
const EPOCH_RANGE_START = -2558000; // early 5004 BC
const EPOCH_RANGE_END = 401760; // 3100 AD

let epochAstronomy = typeof Astronomy !== 'undefined' ? Astronomy : null;
let epochCorrections = typeof EPOCH_EPHEMERIS_CORRECTIONS !== 'undefined' ? EPOCH_EPHEMERIS_CORRECTIONS : null;
const epochDecoded = {};
function epochEphemerisSetup(astronomy, corrections) {
  epochAstronomy = astronomy;
  epochCorrections = corrections;
  Object.keys(epochDecoded).forEach((key) => delete epochDecoded[key]);
}

// A table: samples every `step` days (TT) from `start`, each an [x, y, z] vector (AU,
// J2000 equatorial) — a correction, or (for `positions`) the position itself — stored
// as integers of `scale` AU, delta-encoded so the slowly changing values stay short.
// Decoded once, on first use.
function epochCorrectionSamples(body, kind = 'corrections') {
  const cacheKey = `${kind}:${body}`;
  if (epochDecoded[cacheKey]) return epochDecoded[cacheKey];
  const table = epochCorrections?.[kind]?.[body];
  if (!table) return null;
  const values = table.data.split(',').map(Number);
  const samples = new Float64Array(values.length);
  for (let axis = 0; axis < 3; axis += 1) {
    let running = 0;
    for (let index = axis; index < values.length; index += 3) {
      running += values[index];
      samples[index] = running * table.scale;
    }
  }
  return (epochDecoded[cacheKey] = { start: table.start, step: table.step, count: values.length / 3, samples });
}
// The vector at `tt` (days from J2000, TT): a Catmull-Rom cubic through the four
// nearest samples (the samples are dense enough along each orbit for this to stay
// well under an arcminute).
function epochCorrectionAt(body, tt, kind = 'corrections') {
  const table = epochCorrectionSamples(body, kind);
  if (!table) return null;
  const position = (tt - table.start) / table.step;
  const index = Math.max(1, Math.min(table.count - 3, Math.floor(position)));
  const u = Math.max(0, Math.min(1, position - index));
  const u2 = u * u, u3 = u2 * u;
  const weights = [-0.5 * u3 + u2 - 0.5 * u, 1.5 * u3 - 2.5 * u2 + 1, -1.5 * u3 + 2 * u2 + 0.5 * u, 0.5 * u3 - 0.5 * u2];
  const offset = [0, 0, 0];
  weights.forEach((weight, k) => {
    const base = (index - 1 + k) * 3;
    for (let axis = 0; axis < 3; axis += 1) offset[axis] += weight * table.samples[base + axis];
  });
  return offset;
}

// Days from J2000 (UT) → Astronomy Engine time.
function epochTime(ut) {
  return epochAstronomy.MakeTime(ut);
}
// Geocentric apparent tropical longitude (ecliptic of date, 0–360°) of one of
// EPOCH_BODIES at `ut` (days from J2000, UT), DE441-corrected. The correction is a
// small, slowly changing shift of the planet's heliocentric position, so it shifts the
// geocentric vector by the same amount.
function epochLongitude(body, ut) {
  const A = epochAstronomy;
  const time = typeof ut === 'number' ? epochTime(ut) : ut;
  if (epochCorrections?.positions?.[body]) return A.Ecliptic(epochTabulatedGeoVector(body, time)).elon;
  const vector = A.GeoVector(A.Body[body], time, true);
  const offset = epochCorrectionAt(body, time.tt);
  const corrected = offset ? new A.Vector(vector.x + offset[0], vector.y + offset[1], vector.z + offset[2], time) : vector;
  return A.Ecliptic(corrected).elon;
}
// A tabulated planet as seen from Earth, matching Astronomy Engine's GeoVector(…, true)
// for the others (and JPL's apparent positions): planet and Earth both where they were
// when the light left the planet — light-time, plus the aberration of Earth's motion.
function epochTabulatedGeoVector(body, time) {
  const A = epochAstronomy;
  let tau = 0, vector = null;
  for (let pass = 0; pass < 3; pass += 1) {
    const emitted = time.AddDays(-tau);
    const planet = epochCorrectionAt(body, emitted.tt, 'positions');
    const earth = A.HelioVector(A.Body.Earth, emitted);
    vector = [planet[0] - earth.x, planet[1] - earth.y, planet[2] - earth.z];
    tau = Math.hypot(...vector) / EPOCH_LIGHT_AU_PER_DAY;
  }
  return new A.Vector(vector[0], vector[1], vector[2], time);
}
const EPOCH_LIGHT_AU_PER_DAY = 173.1446327;
// All five at once, as { Jupiter: degrees, … }.
function epochLongitudes(ut) {
  const time = epochTime(ut);
  return Object.fromEntries(EPOCH_BODIES.map((body) => [body, epochLongitude(body, time)]));
}

if (typeof module !== 'undefined') {
  module.exports = { EPOCH_BODIES, EPOCH_RANGE_START, EPOCH_RANGE_END, epochEphemerisSetup, epochCorrectionAt, epochTabulatedGeoVector, epochLongitude, epochLongitudes, epochTime };
}
