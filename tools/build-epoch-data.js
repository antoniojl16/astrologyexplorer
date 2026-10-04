#!/usr/bin/env node
// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Builds the Epoch Explorer's astrology data:
//
//     node tools/build-epoch-data.js [work-dir]
//
//   1. epoch-ephemeris-data.js — corrections that bring Astronomy Engine's heliocentric
//      positions of the slow planets onto NASA JPL's DE441 ephemeris from 5000 BC to
//      3100 AD, and Pluto's DE441 positions themselves (Astronomy Engine is far too slow
//      for Pluto in antiquity; see epoch-ephemeris.js). DE441 positions come from the JPL Horizons API
//      (ssd.jpl.nasa.gov; planet-system barycenters, which DE441 covers back to 13,200
//      BC — the planets' own centers only from 1600). Responses are cached in work-dir.
//      Each table is checked against DE441 halfway between its samples, and a planet is
//      only corrected where Astronomy Engine is off by more than CORRECTION_THRESHOLD.
//   2. epoch-conjunctions.js — every geocentric conjunction of the ten pairs among
//      Jupiter, Saturn, Uranus, Neptune and Pluto in that range, from the corrected
//      positions, grouped into events (a retrograde loop can bring up to three exact
//      passes within a year or so).
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..');
const work = process.argv[2] || '/tmp/orbital-study-epoch';
fs.mkdirSync(work, { recursive: true });
const Astronomy = require(path.join(root, 'astronomy-engine.js'));
const ephemeris = require(path.join(root, 'epoch-ephemeris.js'));
const { EPOCH_BODIES, EPOCH_RANGE_START, EPOCH_RANGE_END } = ephemeris;

const J2000 = 2451545.0;
// Samples per planet: dense enough along each orbit for a cubic to follow the error.
const SAMPLE_STEP_DAYS = { Jupiter: 300, Saturn: 600, Uranus: 1600, Neptune: 3200, Pluto: 1000 };
// Tabulated outright rather than corrected.
const TABULATED = new Set(['Pluto']);
const HORIZONS_ID = { Jupiter: '5', Saturn: '6', Uranus: '7', Neptune: '8', Pluto: '9' };
const CORRECTION_THRESHOLD = 1 / 60; // degrees (1′)
const SCALE = 1e-5; // AU per stored unit (1.5 million km: under 1″ at Jupiter)

// With a few retries: Horizons sometimes drops a connection.
async function fetchText(url) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fetchOnce(url); } catch (error) {
      if (attempt >= 4) throw error;
      process.stdout.write(`  retrying (${error.message})…\n`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}
function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}
// Heliocentric J2000-equatorial vectors (AU), TT, every `step` days from `startTT`
// (days from J2000) to `stopTT`, as [tt, x, y, z] rows.
async function horizonsVectors(body, startTT, stopTT, step) {
  const file = path.join(work, `horizons-${body}-${startTT}-${stopTT}-${step}.txt`);
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (!text) {
    const params = {
      format: 'text', COMMAND: `'${HORIZONS_ID[body]}'`, CENTER: "'500@10'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
      REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", VEC_TABLE: "'1'", VEC_CORR: "'NONE'", OUT_UNITS: "'AU-D'", CSV_FORMAT: "'YES'",
      TIME_TYPE: "'TT'", START_TIME: `'JD${(startTT + J2000).toFixed(1)}'`, STOP_TIME: `'JD${(stopTT + J2000).toFixed(1)}'`, STEP_SIZE: `'${step} d'`,
    };
    const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    process.stdout.write(`  fetching ${body} (${step}-day steps)…\n`);
    text = await fetchText(`https://ssd.jpl.nasa.gov/api/horizons.api?${query}`);
    if (!text.includes('$$SOE')) throw new Error(`Horizons gave no ephemeris for ${body}:\n${text.slice(-800)}`);
    fs.writeFileSync(file, text);
  }
  return text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return [Number(cells[0]) - J2000, Number(cells[2]), Number(cells[3]), Number(cells[4])];
  });
}
function engineHelio(body, tt) {
  return Astronomy.HelioVector(Astronomy.Body[body], Astronomy.AstroTime.FromTerrestrialTime(tt));
}
// Angle (degrees) between two heliocentric directions.
function angleBetween(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;
}

async function buildCorrections() {
  const corrections = {}, positions = {};
  const encode = (vectors) => {
    const encoded = [];
    const previous = [0, 0, 0];
    vectors.forEach((vector) => vector.forEach((value, axis) => {
      const unit = Math.round(value / SCALE);
      encoded.push(unit - previous[axis]);
      previous[axis] = unit;
    }));
    return encoded.join(',');
  };
  // Margins of a few samples beyond the range, so the cubic has neighbours at both ends.
  for (const body of EPOCH_BODIES) {
    const step = SAMPLE_STEP_DAYS[body];
    const start = Math.floor(EPOCH_RANGE_START / step) * step - 3 * step;
    const stop = Math.ceil(EPOCH_RANGE_END / step) * step + 3 * step;
    const rows = await horizonsVectors(body, start, stop, step);
    if (TABULATED.has(body)) {
      positions[body] = { start: rows[0][0], step, scale: SCALE, data: encode(rows.map(([, x, y, z]) => [x, y, z])) };
      console.log(`${body}: tabulated from DE441; ${rows.length} samples`);
      continue;
    }
    let worst = 0;
    const offsets = rows.map(([tt, x, y, z]) => {
      const engine = engineHelio(body, tt);
      worst = Math.max(worst, angleBetween([x, y, z], [engine.x, engine.y, engine.z]));
      return [x - engine.x, y - engine.y, z - engine.z];
    });
    if (worst < CORRECTION_THRESHOLD) {
      console.log(`${body}: Astronomy Engine within ${(worst * 60).toFixed(2)}′ of DE441 — no correction`);
      continue;
    }
    corrections[body] = { start: rows[0][0], step, scale: SCALE, data: encode(offsets) };
    console.log(`${body}: up to ${(worst * 60).toFixed(1)}′ off; ${rows.length} samples`);
  }
  const tables = { corrections, positions };
  ephemeris.epochEphemerisSetup(Astronomy, tables);
  // Check halfway between samples, where the interpolation is weakest.
  for (const body of [...Object.keys(corrections), ...Object.keys(positions)]) {
    const step = SAMPLE_STEP_DAYS[body];
    const start = Math.floor(EPOCH_RANGE_START / step) * step + step / 2;
    const stop = Math.ceil(EPOCH_RANGE_END / step) * step - step / 2;
    const rows = await horizonsVectors(body, start, stop, step * 7);
    let worst = 0, worstAt = 0;
    rows.forEach(([tt, x, y, z]) => {
      const ours = TABULATED.has(body) ? ephemeris.epochCorrectionAt(body, tt, 'positions') : (() => {
        const engine = engineHelio(body, tt), offset = ephemeris.epochCorrectionAt(body, tt);
        return [engine.x + offset[0], engine.y + offset[1], engine.z + offset[2]];
      })();
      const error = angleBetween([x, y, z], ours);
      if (error > worst) { worst = error; worstAt = tt; }
    });
    console.log(`  ${body} checked halfway between samples: worst ${(worst * 3600).toFixed(1)}″ (year ${(2000 + worstAt / 365.25).toFixed(0)})`);
  }
  return tables;
}

// ── Conjunctions ─────────────────────────────────────────────────────────
const SCAN_STEP = 4; // days
function wrap180(degrees) { return ((((degrees + 180) % 360) + 360) % 360) - 180; }
function separation(first, second, ut) {
  const time = ephemeris.epochTime(ut);
  return wrap180(ephemeris.epochLongitude(first, time) - ephemeris.epochLongitude(second, time));
}
function refine(first, second, lo, hi) {
  let fLo = separation(first, second, lo);
  for (let i = 0; i < 40 && hi - lo > 1 / 1440; i += 1) {
    const mid = (lo + hi) / 2, fMid = separation(first, second, mid);
    if ((fLo <= 0) === (fMid <= 0)) { lo = mid; fLo = fMid; } else hi = mid;
  }
  return (lo + hi) / 2;
}
function buildConjunctions() {
  const pairs = [];
  EPOCH_BODIES.forEach((first, index) => EPOCH_BODIES.slice(index + 1).forEach((second) => pairs.push([first, second])));
  const crossings = Object.fromEntries(pairs.map((pair) => [pair.join('-'), []]));
  let previous = null;
  for (let ut = EPOCH_RANGE_START; ut <= EPOCH_RANGE_END; ut += SCAN_STEP) {
    const longitudes = ephemeris.epochLongitudes(ut);
    if (previous) {
      pairs.forEach(([first, second]) => {
        const before = wrap180(previous[first] - previous[second]), after = wrap180(longitudes[first] - longitudes[second]);
        // A sign change near 0° (not the ±180° wrap) is an exact conjunction.
        if ((before <= 0) !== (after <= 0) && Math.abs(before) < 90) crossings[`${first}-${second}`].push(refine(first, second, ut - SCAN_STEP, ut));
      });
    }
    previous = longitudes;
    if ((ut - EPOCH_RANGE_START) % (SCAN_STEP * 50000) === 0) process.stdout.write(`  scanning… ${(2000 + ut / 365.25).toFixed(0)}\n`);
  }
  // Passes belong to one event while the two planets stay within 15° of each other.
  const events = {};
  for (const [key, times] of Object.entries(crossings)) {
    const [first, second] = key.split('-');
    const grouped = [];
    times.forEach((time) => {
      const last = grouped[grouped.length - 1];
      const together = last && (() => {
        const from = last[last.length - 1];
        for (let ut = from; ut <= time; ut += 5) if (Math.abs(separation(first, second, ut)) > 15) return false;
        return true;
      })();
      if (together) last.push(time); else grouped.push([time]);
    });
    events[key] = grouped;
    console.log(`${key}: ${grouped.length} conjunctions (${times.length} exact passes)`);
  }
  return events;
}

(async () => {
  const header = (what) => `// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.\n// Generated by tools/build-epoch-data.js — don't edit by hand. ${what}\n`;
  const corrections = await buildCorrections();
  fs.writeFileSync(path.join(root, 'epoch-ephemeris-data.js'), `${header('Source: NASA JPL DE441 via the Horizons API.')}const EPOCH_EPHEMERIS_CORRECTIONS = ${JSON.stringify(corrections)};\n`);
  const events = buildConjunctions();
  // Times as days from J2000 (UT), to the minute; each event is its list of passes.
  const compact = Object.fromEntries(Object.entries(events).map(([key, list]) => [key, list.map((passes) => passes.map((time) => Math.round(time * 1440) / 1440))]));
  fs.writeFileSync(path.join(root, 'epoch-conjunctions.js'), `${header('Conjunction passes as days from J2000 (UT).')}const EPOCH_CONJUNCTIONS = ${JSON.stringify(compact)};\n`);
  console.log('Wrote epoch-ephemeris-data.js and epoch-conjunctions.js');
})().catch((error) => { console.error(error); process.exit(1); });
