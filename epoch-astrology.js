// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer: Astrology ────────────────────────────────────────────
// The cycles of the five slow planets. Each of the ten pairs starts a cycle when the
// two meet (conjunction) and ends it when they meet again; in between, the faster one
// pulls ahead through the waxing sextile, square and trine, the opposition, and the
// waning trine, square and sextile. Two moments are compared on one bi-wheel — the
// inner one in purple, the outer one in green — each set from the conjunction lists,
// the cycle tables, the date fields, or by dragging its marker on the shared timeline.
//
// Conjunctions are stored (EPOCH_CONJUNCTIONS, epoch-conjunctions.js, every exact pass
// from 5000 BC to 3100 AD); the other phases are found on demand from the positions
// (epochLongitude, epoch-ephemeris.js), one cycle at a time.

const EPOCH_PAIRS = [];
EPOCH_BODIES.forEach((first, index) => EPOCH_BODIES.slice(index + 1).forEach((second) => EPOCH_PAIRS.push(`${first}-${second}`)));
// The phases of a cycle, by how far the faster planet (the first of the pair) is ahead.
const EPOCH_PHASES = [
  { angle: 0, aspect: 'Conjunction', label: 'Conjunction' },
  { angle: 60, aspect: 'Sextile', label: 'Waxing sextile' },
  { angle: 90, aspect: 'Square', label: 'Waxing square' },
  { angle: 120, aspect: 'Trine', label: 'Waxing trine' },
  { angle: 180, aspect: 'Opposition', label: 'Opposition' },
  { angle: 240, aspect: 'Trine', label: 'Waning trine' },
  { angle: 270, aspect: 'Square', label: 'Waning square' },
  { angle: 300, aspect: 'Sextile', label: 'Waning sextile' },
];
const EPOCH_OPTIONAL_ASPECTS = ['Sextile', 'Square', 'Trine', 'Opposition'];
const EPOCH_MARKERS = [
  { key: 'inner', label: 'Inner moment', color: 'var(--epoch-inner)' },
  { key: 'outer', label: 'Outer moment', color: 'var(--epoch-outer)' },
];
const EPOCH_ASTRO_LINES = [['inner', 'Inner'], ['between', 'Between'], ['outer', 'Outer']];
const EPOCH_ASTRO_ZOOMS = [['8000 y', 8001 * EPOCH_YEAR_DAYS], ['1000 y', 1000 * EPOCH_YEAR_DAYS], ['200 y', 200 * EPOCH_YEAR_DAYS], ['50 y', 50 * EPOCH_YEAR_DAYS], ['10 y', 10 * EPOCH_YEAR_DAYS], ['1 y', EPOCH_YEAR_DAYS]];
const EPOCH_ASTRO_MIN = epochUtFromCalendar(-5000, 1, 1);
const EPOCH_ASTRO_MAX = epochUtFromCalendar(3000, 12, 31, 23.99);
const EPOCH_ELEMENTS = ['Fire', 'Earth', 'Air', 'Water'];

const epochAstro = {
  pair: 'Jupiter-Saturn',
  times: null, // { inner, outer }, set on first render
  active: 'inner',
  aspects: new Set(EPOCH_OPTIONAL_ASPECTS),
  lines: 'between',
  // Bodies on the wheel: the slow planets, until others are ticked (not remembered).
  bodies: new Set(EPOCH_BODIES),
};
let epochAstroTimeline = null;

const epochPairBodies = (pair) => pair.split('-');
const epochPairName = (pair, joiner = '–') => epochPairBodies(pair).join(joiner);
const epochPairGlyphs = (pair) => epochPairBodies(pair).map((body) => EPOCH_GLYPHS[body]).join(' ☌ ');
const epochWrap360 = (degrees) => ((degrees % 360) + 360) % 360;
const epochWrap180 = (degrees) => epochWrap360(degrees + 180) - 180;
// How far the faster planet is ahead of the slower one (0–360°): 0 at the conjunction.
function epochPhaseAngle(pair, ut) {
  const [first, second] = epochPairBodies(pair);
  const time = epochTime(ut);
  return epochWrap360(epochLongitude(first, time) - epochLongitude(second, time));
}
function epochPhaseShown(phase) {
  return phase.angle === 0 || epochAstro.aspects.has(phase.aspect);
}
// "♑ 0°29′" for a longitude.
function epochPositionText(longitude) {
  const sign = Math.floor(epochWrap360(longitude) / 30);
  const within = epochWrap360(longitude) - sign * 30;
  let degrees = Math.floor(within), minutes = Math.round((within - degrees) * 60);
  if (minutes === 60) { degrees += 1; minutes = 0; }
  return `${SIGN_GLYPHS[sign]}︎ ${degrees}°${epochPad(minutes)}′`;
}

// ── Conjunctions (stored) ────────────────────────────────────────────────
// Each event: { passes: [ut…], start: first pass }.
const epochEventCache = {};
function epochConjunctions(pair) {
  if (!epochEventCache[pair]) epochEventCache[pair] = (EPOCH_CONJUNCTIONS[pair] || []).map((passes) => ({ passes, start: passes[0] }));
  return epochEventCache[pair];
}
// Index of the cycle (conjunction) in effect at `ut`: the last one starting at or before it.
function epochCycleIndex(pair, ut) {
  const events = epochConjunctions(pair);
  let lo = 0, hi = events.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].start <= ut) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}
function epochMeanCycleYears(pair) {
  const events = epochConjunctions(pair);
  return events.length > 1 ? (events[events.length - 1].start - events[0].start) / (events.length - 1) / EPOCH_YEAR_DAYS : null;
}
const epochLongitudeCache = new Map();
function epochConjunctionLongitude(pair, ut) {
  const key = `${pair}@${ut}`;
  if (!epochLongitudeCache.has(key)) epochLongitudeCache.set(key, epochLongitude(epochPairBodies(pair)[0], ut));
  return epochLongitudeCache.get(key);
}

// ── Phases (found on demand) ─────────────────────────────────────────────
// Scan step per pair: fine enough to catch every pass of a retrograde loop.
function epochScanStep(pair) {
  return pair.startsWith('Jupiter') ? 4 : pair.startsWith('Saturn') ? 8 : 20;
}
// Every phase of one cycle (from its conjunction up to the next one), each as
// { phase, passes: [ut…], start }. Passes of one phase less than EPOCH_LOOP_DAYS apart
// belong to one retrograde loop (the same phase never comes round again that soon).
const EPOCH_LOOP_DAYS = 400;
const epochCycleCache = {};
function epochCyclePhases(pair, index) {
  const key = `${pair}#${index}`;
  if (epochCycleCache[key]) return epochCycleCache[key];
  const events = epochConjunctions(pair);
  const start = events[index].passes[events[index].passes.length - 1];
  const end = index + 1 < events.length ? events[index + 1].start : Math.min(EPOCH_ASTRO_MAX, start + epochMeanCycleYears(pair) * EPOCH_YEAR_DAYS);
  const step = epochScanStep(pair);
  const result = [{ phase: EPOCH_PHASES[0], passes: events[index].passes, start: events[index].start }];
  const samples = [];
  for (let ut = start; ut <= end; ut += step) samples.push([ut, epochPhaseAngle(pair, ut)]);
  EPOCH_PHASES.slice(1).forEach((phase) => {
    const passes = [];
    for (let i = 1; i < samples.length; i += 1) {
      const before = epochWrap180(samples[i - 1][1] - phase.angle), after = epochWrap180(samples[i][1] - phase.angle);
      if ((before <= 0) === (after <= 0) || Math.abs(before) > 90) continue;
      let lo = samples[i - 1][0], hi = samples[i][0], fLo = before;
      for (let k = 0; k < 30 && hi - lo > 1 / 1440; k += 1) {
        const mid = (lo + hi) / 2, fMid = epochWrap180(epochPhaseAngle(pair, mid) - phase.angle);
        if ((fLo <= 0) === (fMid <= 0)) { lo = mid; fLo = fMid; } else hi = mid;
      }
      passes.push((lo + hi) / 2);
    }
    // Group into events (a loop can make up to three passes).
    passes.forEach((pass) => {
      const last = result[result.length - 1];
      if (last.phase === phase && pass - last.passes[last.passes.length - 1] < EPOCH_LOOP_DAYS) last.passes.push(pass);
      else result.push({ phase, passes: [pass], start: pass });
    });
  });
  result.sort((a, b) => a.start - b.start);
  return (epochCycleCache[key] = result);
}
// "Waxing square +2.4°" / "212°, 32° past the opposition" for a phase angle.
function epochPhaseText(angle) {
  const shown = EPOCH_PHASES.filter(epochPhaseShown);
  const nearest = shown.reduce((best, phase) => (Math.abs(epochWrap180(angle - phase.angle)) < Math.abs(epochWrap180(angle - best.angle)) ? phase : best), shown[0]);
  const offset = epochWrap180(angle - nearest.angle);
  const orb = ASPECT_DEFINITIONS.find((definition) => definition.name === nearest.aspect)?.orb ?? 10;
  const half = angle < 180 ? 'waxing' : 'waning';
  if (Math.abs(offset) <= orb) return { text: `${nearest.label} ${offset >= 0 ? '+' : '−'}${Math.abs(offset).toFixed(1)}°`, close: true };
  return { text: `${angle.toFixed(0)}° · ${half}`, close: false };
}

// ── Wheel ────────────────────────────────────────────────────────────────
// Fixed zodiac (0° Aries at the left), no houses: an inner ring for the inner moment,
// an outer ring for the outer one, each body with its degree, sign and minutes as in
// the Chart Explorer's wheel, the sign cusps running in across both rings, and aspect
// lines within either moment or between them. The slow planets are always available;
// the Sun, Moon, Mercury, Venus and Mars can be added (EPOCH_EXTRA_BODIES).
const EPOCH_EXTRA_BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];
const EPOCH_WHEEL_BODIES = [...EPOCH_EXTRA_BODIES, ...EPOCH_BODIES];
const EPOCH_WHEEL_GLYPHS = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', ...EPOCH_GLYPHS };
function epochMotion(body, ut) {
  if (body === 'Sun' || body === 'Moon') return null;
  const daily = epochWrap180(epochLongitude(body, ut + 0.5) - epochLongitude(body, ut - 0.5));
  if (Math.abs(daily) < (WHEEL_MEAN_DAILY_MOTION[body] || 0.01) * WHEEL_STATION_FRACTION) return 'stationary';
  return daily < 0 ? 'retrograde' : null;
}
function renderEpochWheel(svg) {
  const cx = 300, cy = 300, outer = 278, zodiacInner = 236, ringWidth = 76;
  const insideOuter = zodiacInner - ringWidth, aspectR = insideOuter - ringWidth;
  const rotation = 270;
  const circle = (r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  let markup = circle(outer) + circle(zodiacInner) + circle(insideOuter) + circle(aspectR);
  markup += wheelZodiacMarkup(cx, cy, outer, zodiacInner, rotation);
  // The sign cusps, carried in across both planet rings.
  for (let sign = 0; sign < 12; sign += 1) {
    const rad = ((rotation - sign * 30 - 90) * Math.PI) / 180;
    markup += `<line x1="${cx + zodiacInner * Math.cos(rad)}" y1="${cy + zodiacInner * Math.sin(rad)}" x2="${cx + aspectR * Math.cos(rad)}" y2="${cy + aspectR * Math.sin(rad)}" class="epoch-sign-cusp"/>`;
  }
  const bodies = EPOCH_WHEEL_BODIES.filter((body) => epochAstro.bodies.has(body));
  const ring = (marker) => bodies.map((body) => {
    const ut = epochAstro.times[marker.key];
    const longitude = epochLongitude(body, ut);
    return { name: body, glyph: EPOCH_WHEEL_GLYPHS[body], key: `${marker.key}:${body}`, marker, color: marker.color, longitude, angle: (rotation - longitude + 360) % 360, motion: epochMotion(body, ut) };
  });
  const inner = ring(EPOCH_MARKERS[0]), outerRing = ring(EPOCH_MARKERS[1]);
  // The inner ring is smaller, so its labels need a wider angle to stay apart.
  spreadClusteredAngles(inner, 10);
  spreadClusteredAngles(outerRing, 7.5);
  const visible = (name) => name === 'Conjunction' || epochAstro.aspects.has(name);
  const asBodies = (positions) => positions.map((position) => ({ name: position.name, angle: position.longitude }));
  const aspects = epochAstro.lines === 'between'
    ? calculateCrossAspects(asBodies(inner), asBodies(outerRing), visible)
    : calculateAspects({ positions: asBodies(epochAstro.lines === 'inner' ? inner : outerRing) }, visible);
  const firstRing = epochAstro.lines === 'outer' ? outerRing : inner;
  const secondRing = epochAstro.lines === 'inner' ? inner : outerRing;
  const byName = (positions) => new Map(positions.map((position) => [position.name, position]));
  const firstByName = byName(firstRing), secondByName = byName(secondRing);
  markup += wheelAspectLinesMarkup(cx, cy, aspectR, aspects, (aspect) => [firstByName.get(aspect.first).angle, secondByName.get(aspect.second).angle]);
  // Degree, sign and minutes under each glyph (planetDegreeLabelMarkup, as in the Chart Explorer).
  const marker = (ringOuter) => (position) => {
    const rad = ((position.displayAngle - 90) * Math.PI) / 180;
    markup += planetMarkerMarkup(cx, cy, ringOuter, position, ringWidth) + planetDegreeLabelMarkup(cx, cy, ringOuter - 3, rad, position.longitude, position.color);
  };
  inner.forEach(marker(insideOuter));
  outerRing.forEach(marker(zodiacInner));
  svg.innerHTML = markup;
  const all = new Map([...inner, ...outerRing].map((position) => [position.key, position]));
  svg._wheelHover = {
    planet: (key) => all.has(key) && (() => {
      const position = all.get(key);
      const { glyph, degree } = wheelSignText(position.longitude);
      const mark = WHEEL_MOTION_MARKS[position.motion];
      return `<div class="wheel-tooltip-main">${position.name} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div><div class="wheel-tooltip-sub">${position.marker.label} · ${epochDateText(epochAstro.times[position.marker.key], { calendar: true })}</div>`;
    }),
    aspect: (index) => aspects[index] && (() => {
      const aspect = aspects[index];
      const side = (ring) => (epochAstro.lines === 'between' ? ` (${ring === inner ? 'inner' : 'outer'})` : '');
      return `<div class="wheel-tooltip-main">${aspect.first}${side(firstRing)} ${aspect.name} ${aspect.second}${side(secondRing)}</div><div class="wheel-tooltip-sub">Orb ${aspect.orb.toFixed(1)}°</div>`;
    }),
  };
  bindWheelHover(svg).hidden = true;
  return aspects;
}

// ── Panels ───────────────────────────────────────────────────────────────
function epochMomentRowMarkup(marker) {
  return `<div class="epoch-moment" data-epoch-moment="${marker.key}">
    <button type="button" class="epoch-moment-pick" data-epoch-activate="${marker.key}" title="Keys and buttons move this moment (${marker.key === 'inner' ? '1' : '2'})"><i class="legend-dot" style="background:${marker.color}"></i>${marker.label}</button>
    ${epochDateFieldsMarkup(marker.key)}
    <button type="button" class="secondary-button epoch-now" data-epoch-now="${marker.key}" title="Set to now">Now</button>
    <small class="epoch-moment-note" data-epoch-moment-note="${marker.key}"></small>
  </div>`;
}
// Where every pair stands in its cycle at each moment.
function epochCycleTableMarkup() {
  const cell = (pair, key) => {
    const ut = epochAstro.times[key];
    const index = epochCycleIndex(pair, ut);
    const { text, close } = epochPhaseText(epochPhaseAngle(pair, ut));
    const since = index >= 0 ? `since ${epochDateText(epochConjunctions(pair)[index].start, { time: false })}` : '';
    return `<td class="${close ? 'epoch-close' : ''}"><span>${text}</span><small>${since}</small></td>`;
  };
  return `<table class="epoch-table epoch-cycles-table">
    <thead><tr><th>Cycle</th><th><i class="legend-dot" style="background:var(--epoch-inner)"></i>Inner</th><th><i class="legend-dot" style="background:var(--epoch-outer)"></i>Outer</th></tr></thead>
    <tbody>${EPOCH_PAIRS.map((pair) => `<tr class="${pair === epochAstro.pair ? 'selected' : ''}" data-epoch-pair-row="${pair}" tabindex="0" title="Choose the ${epochPairName(pair)} cycle"><th>${epochPairGlyphs(pair)}<small>${epochPairName(pair)}</small></th>${cell(pair, 'inner')}${cell(pair, 'outer')}</tr>`).join('')}</tbody>
  </table>`;
}
// The cycle of the chosen pair that contains the active moment, phase by phase.
function epochCurrentCycleMarkup() {
  const pair = epochAstro.pair;
  const ut = epochAstro.times[epochAstro.active];
  const index = epochCycleIndex(pair, ut);
  const events = epochConjunctions(pair);
  if (index < 0) return '<p class="intro-copy">Before the first conjunction in range.</p>';
  const next = events[index + 1];
  const rows = epochCyclePhases(pair, index).filter((entry) => epochPhaseShown(entry.phase)).map((entry) => {
    const longitude = epochLongitude(epochPairBodies(pair)[0], entry.passes[0]);
    return `<tr><td>${entry.phase.label}</td><td>${entry.passes.map((pass) => `<span class="epoch-pass">${epochDateText(pass, { calendar: true })}</span>`).join('')}</td><td>${epochPositionText(longitude)}</td><td class="epoch-set">${epochSetButtonsMarkup(entry.passes[0])}</td></tr>`;
  }).join('');
  return `<p class="epoch-cycle-span">${epochPairName(pair)} cycle from <strong>${epochDateText(events[index].start, { time: false, calendar: true })}</strong>${next ? ` to <strong>${epochDateText(next.start, { time: false, calendar: true })}</strong> (${((next.start - events[index].start) / EPOCH_YEAR_DAYS).toFixed(1)} years)` : ''}</p>
    <table class="epoch-table"><thead><tr><th>Phase</th><th>Exact (each pass)</th><th>${EPOCH_GLYPHS[epochPairBodies(pair)[0]]} at</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function epochSetButtonsMarkup(ut) {
  return EPOCH_MARKERS.map((marker) => `<button type="button" class="epoch-set-button" data-epoch-set="${marker.key}" data-ut="${ut}" title="Set the ${marker.key} moment here" style="--thumb:${marker.color}">${marker.key === 'inner' ? 'Inner' : 'Outer'}</button>`).join('');
}
// Every conjunction of every pair, by pair and millennium (rows built when opened).
function epochConjunctionListMarkup() {
  return EPOCH_PAIRS.map((pair) => {
    const events = epochConjunctions(pair);
    const cycle = epochMeanCycleYears(pair);
    return `<details class="cycle-life epoch-pair-list" data-epoch-pair-list="${pair}"><summary><strong>${epochPairGlyphs(pair)} ${epochPairName(pair, ' – ')}</strong><small>${events.length} conjunctions · about every ${cycle >= 100 ? Math.round(cycle) : cycle.toFixed(1)} years</small></summary><div class="epoch-pair-list-body"></div></details>`;
  }).join('');
}
function epochPairListBodyMarkup(pair) {
  const events = epochConjunctions(pair);
  const groups = new Map();
  events.forEach((event) => {
    const year = epochCalendar(event.start).year;
    const millennium = Math.floor((year - 1) / 1000);
    if (!groups.has(millennium)) groups.set(millennium, []);
    groups.get(millennium).push(event);
  });
  const now = epochNow();
  const label = (millennium) => {
    const first = millennium * 1000 + 1, last = first + 999;
    return `${epochYearLabel(first)} – ${epochYearLabel(last)}`;
  };
  return [...groups.entries()].map(([millennium, list]) => {
    const containsNow = list[0].start <= now && (list[list.length - 1].start >= now || millennium === Math.floor((epochCalendar(now).year - 1) / 1000));
    const rows = list.map((event) => {
      const longitude = epochConjunctionLongitude(pair, event.start);
      const sign = Math.floor(epochWrap360(longitude) / 30);
      return `<tr><td>${event.passes.map((pass) => `<span class="epoch-pass">${epochDateText(pass, { calendar: true })}</span>`).join('')}</td><td>${epochPositionText(longitude)}</td><td>${EPOCH_ELEMENTS[sign % 4]}</td><td class="epoch-set">${epochSetButtonsMarkup(event.start)}</td></tr>`;
    }).join('');
    return `<details class="epoch-millennium"${containsNow ? ' open' : ''}><summary>${label(millennium)} <small>${list.length}</small></summary><table class="epoch-table"><thead><tr><th>Exact (each pass)</th><th>Position</th><th>Element</th><th></th></tr></thead><tbody>${rows}</tbody></table></details>`;
  }).join('');
}
function epochAstrologyNotesMarkup() {
  return `<details class="cycle-life epoch-notes"><summary><strong>About these calculations</strong><small>sources and accuracy</small></summary><div class="epoch-notes-body">
    <p>Positions are geocentric and tropical (measured from the equinox of date, as in the rest of the app), with light-time and aberration, as an observer on Earth sees them. A conjunction is the moment both planets have the same ecliptic longitude; retrograde loops can bring two or three exact passes within a year or so, listed together as one conjunction. A cycle runs from one conjunction (its first pass) to the next; the other phases are the moments the faster planet is 60°, 90°, 120°, 180°, 240°, 270° and 300° ahead.</p>
    <p>The planets come from <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">Astronomy Engine</a>, corrected towards NASA JPL's <a href="https://ssd.jpl.nasa.gov/planets/eph_export.html" target="_blank" rel="noopener">DE441</a> ephemeris (Park et al. 2021, <a href="https://doi.org/10.3847/1538-3881/abd414" target="_blank" rel="noopener">AJ 161, 105</a>), fetched from <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener">JPL Horizons</a>. Uncorrected, Astronomy Engine drifts by up to 4° for Saturn and over 1° for Jupiter by 5000 BC (and computes Pluto far too slowly there), so Jupiter to Neptune are corrected towards DE441 and Pluto is taken from DE441 directly. Checked against JPL's own apparent positions, they agree within a few arcseconds from 3000 BC on and within an arcminute at 5000 BC. The slower the pair, the more an arcsecond moves its conjunction: minutes for Jupiter–Saturn, hours for the outermost pairs, which close in on each other very slowly.</p>
    <p>The Sun, Moon, Mercury, Venus and Mars (optional on the wheel) come from Astronomy Engine uncorrected: reliable in historical times, but not checked against DE441 in deep antiquity. The Moon there is uncertain anyway — it moves half a degree an hour, and the clock time itself is uncertain (see below).</p>
    <p>Times are in UTC (Universal Time). Before about 1600 the difference between Earth's irregular rotation and uniform time (ΔT) is only estimated, so clock times grow uncertain going back: by minutes in antiquity, by hours to a day or more around 5000 BC. Dates before 15 October 1582 are in the Julian calendar, as historians give them; years BC have no year 0 (1 BC is followed by 1 AD).</p>
  </div></details>`;
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderEpochAstrology(surface) {
  if (!epochAstro.times) {
    const now = epochNow();
    const index = epochCycleIndex('Jupiter-Saturn', now);
    epochAstro.times = { inner: epochConjunctions('Jupiter-Saturn')[index]?.start ?? now, outer: now };
  }
  // Wheel with its controls beside it; the two moments and the timeline under both;
  // then where every cycle stands, next to the chosen cycle phase by phase.
  surface.innerHTML = `
    <div class="epoch-astro-layout">
      <div class="chart-panel epoch-wheel-panel">
        <div class="panel-toolbar">
          <div class="pair-legend epoch-legend">${EPOCH_MARKERS.map((marker) => `<span><i class="legend-dot" style="background:${marker.color}"></i>${marker.key === 'inner' ? 'Inner' : 'Outer'}</span>`).join('')}</div>
          <div class="chart-toolbar-right"><span class="eyebrow">LINES</span>${pairSegmentedMarkup('data-epoch-lines', EPOCH_ASTRO_LINES, epochAstro.lines)}</div>
        </div>
        <div class="wheel-stage"><svg class="synastry-wheel epoch-wheel" viewBox="20 20 560 560" role="img" aria-label="Epoch bi-wheel: the planets at two moments" data-epoch-wheel></svg></div>
      </div>
      <div class="epoch-panel epoch-controls">
        <span class="eyebrow">CYCLE</span>
        <label class="epoch-field">Pair<select data-epoch-pair>${EPOCH_PAIRS.map((pair) => `<option value="${pair}">${epochPairGlyphs(pair)}  ${epochPairName(pair)}</option>`).join('')}</select></label>
        <label class="epoch-field">Go to conjunction<select data-epoch-jump></select></label>
        <div class="epoch-steppers">
          <div class="epoch-stepper"><span>Conjunction</span><button type="button" data-epoch-step="event:-1" title="Previous conjunction of this pair (,)" aria-label="Previous conjunction">◀</button><button type="button" data-epoch-step="event:1" title="Next conjunction of this pair (.)" aria-label="Next conjunction">▶</button></div>
          <div class="epoch-stepper"><span>Phase</span><button type="button" data-epoch-step="phase:-1" title="Previous exact phase of this pair's cycle: conjunction or a shown aspect ([)" aria-label="Previous phase">◀</button><button type="button" data-epoch-step="phase:1" title="Next exact phase of this pair's cycle: conjunction or a shown aspect (])" aria-label="Next phase">▶</button></div>
        </div>
        <span class="eyebrow epoch-panel-section">ASPECTS</span>
        <div class="epoch-check-grid">
          <label><input type="checkbox" checked disabled>☌ Conjunction</label>
          ${EPOCH_OPTIONAL_ASPECTS.map((name) => `<label><input type="checkbox" data-epoch-aspect="${name}" ${epochAstro.aspects.has(name) ? 'checked' : ''}><span style="color:${ASPECT_COLORS[name]}">${ASPECT_DEFINITIONS.find((definition) => definition.name === name).glyph}</span> ${name}</label>`).join('')}
        </div>
        <span class="eyebrow epoch-panel-section">PLANETS</span>
        <div class="epoch-check-grid">
          ${EPOCH_WHEEL_BODIES.map((body) => `<label><input type="checkbox" data-epoch-body="${body}" ${epochAstro.bodies.has(body) ? 'checked' : ''}>${EPOCH_WHEEL_GLYPHS[body]} ${body}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="chart-panel epoch-time-panel">
      <div class="epoch-moments">
        ${epochMomentRowMarkup(EPOCH_MARKERS[0])}
        <button type="button" class="pair-swap epoch-reverse" data-epoch-reverse title="Reverse the two moments (R)" aria-label="Reverse the two moments">⇅</button>
        ${epochMomentRowMarkup(EPOCH_MARKERS[1])}
      </div>
      <div class="timeline-control epoch-timeline-box" data-epoch-timeline></div>
    </div>
    <div class="epoch-astro-lower">
      <div class="epoch-panel">
        <span class="eyebrow">WHERE EACH CYCLE STANDS</span>
        <div data-epoch-cycles></div>
      </div>
      <section class="cycle-life epoch-section">
        <div class="epoch-section-head"><strong data-epoch-cycle-title></strong><small>the cycle containing the active moment</small></div>
        <div class="epoch-section-body" data-epoch-current-cycle></div>
      </section>
    </div>
    <h3 class="epoch-heading">All conjunctions, 5000 BC – 3000 AD</h3>
    <div data-epoch-lists>${epochConjunctionListMarkup()}</div>
    ${epochAstrologyNotesMarkup()}`;

  const svg = surface.querySelector('[data-epoch-wheel]');
  const pairSelect = surface.querySelector('[data-epoch-pair]');
  const jumpSelect = surface.querySelector('[data-epoch-jump]');
  const fillJump = () => {
    pairSelect.value = epochAstro.pair;
    jumpSelect.innerHTML = `<option value="">Choose…</option>${epochConjunctions(epochAstro.pair).map((event, index) => `<option value="${index}">${epochDateText(event.start, { time: false })} · ${epochPositionText(epochConjunctionLongitude(epochAstro.pair, event.start))}</option>`).join('')}`;
  };
  // Light: the wheel, the moment fields and notes, the cycle table. Full: also the
  // chosen cycle and the timeline's track (which follows the pair and aspects).
  const draw = ({ full = false } = {}) => {
    renderEpochWheel(svg);
    EPOCH_MARKERS.forEach((marker) => {
      epochFillDateFields(surface.querySelector(`[data-epoch-date="${marker.key}"]`), epochAstro.times[marker.key]);
      surface.querySelector(`[data-epoch-moment="${marker.key}"]`).classList.toggle('active', epochAstro.active === marker.key);
      const index = epochCycleIndex(epochAstro.pair, epochAstro.times[marker.key]);
      const note = surface.querySelector(`[data-epoch-moment-note="${marker.key}"]`);
      note.textContent = index >= 0 ? `${epochDateText(epochAstro.times[marker.key], { calendar: true })} · ${((epochAstro.times[marker.key] - epochConjunctions(epochAstro.pair)[index].start) / EPOCH_YEAR_DAYS).toFixed(1)} years into the ${epochPairName(epochAstro.pair)} cycle` : epochDateText(epochAstro.times[marker.key], { calendar: true });
    });
    surface.querySelector('[data-epoch-cycles]').innerHTML = epochCycleTableMarkup();
    epochAstroTimeline?.update();
    if (full) {
      surface.querySelector('[data-epoch-cycle-title]').textContent = `${epochPairName(epochAstro.pair, ' – ')} · ${epochAstro.active === 'inner' ? 'inner' : 'outer'} moment`;
      surface.querySelector('[data-epoch-current-cycle]').innerHTML = epochCurrentCycleMarkup();
      epochAstroTimeline?.refresh();
    }
  };
  // The chosen cycle's table changes only when the active moment enters another cycle.
  let shownCycle = null;
  const afterMove = () => {
    const cycle = `${epochAstro.pair}#${epochAstro.active}#${epochCycleIndex(epochAstro.pair, epochAstro.times[epochAstro.active])}`;
    draw({ full: false });
    if (cycle !== shownCycle) {
      shownCycle = cycle;
      surface.querySelector('[data-epoch-cycle-title]').textContent = `${epochPairName(epochAstro.pair, ' – ')} · ${epochAstro.active === 'inner' ? 'inner' : 'outer'} moment`;
      surface.querySelector('[data-epoch-current-cycle]').innerHTML = epochCurrentCycleMarkup();
    }
  };
  const setTime = (key, ut) => {
    epochAstro.times[key] = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, ut));
    afterMove();
  };
  const activate = (key) => {
    epochAstro.active = key;
    epochAstroTimeline.activate(key);
    afterMove();
  };
  epochAstroTimeline = epochTimeline(surface.querySelector('[data-epoch-timeline]'), {
    markers: EPOCH_MARKERS,
    get: (key) => epochAstro.times[key],
    set: (key, ut) => { epochAstro.times[key] = ut; afterMove(); },
    min: EPOCH_ASTRO_MIN, max: EPOCH_ASTRO_MAX, zooms: EPOCH_ASTRO_ZOOMS, zoom: 2, lockable: true,
    active: epochAstro.active,
    onActivate: (key) => { if (epochAstro.active !== key) { epochAstro.active = key; afterMove(); } },
    decorate: epochAstroTrackMarkup,
  });
  const jumpTo = (ut) => {
    setTime(epochAstro.active, ut);
    epochAstroTimeline.reveal(epochAstro.active);
  };

  // Stepping the active moment to the previous/next conjunction or phase.
  const step = (action, direction) => {
    const ut = epochAstro.times[epochAstro.active];
    const events = epochConjunctions(epochAstro.pair);
    let target = null;
    if (action === 'event') {
      const index = epochCycleIndex(epochAstro.pair, ut - (direction < 0 ? 1 / 24 : -1 / 24));
      target = direction > 0 ? events[index + 1]?.start : (events[index]?.start < ut - 1 / 24 ? events[index].start : events[index - 1]?.start);
    } else {
      const index = epochCycleIndex(epochAstro.pair, ut);
      const candidates = [index - 1, index, index + 1].filter((i) => i >= 0 && i < events.length)
        .flatMap((i) => epochCyclePhases(epochAstro.pair, i).filter((entry) => epochPhaseShown(entry.phase)).map((entry) => entry.start));
      target = direction > 0 ? candidates.filter((t) => t > ut + 1 / 24).sort((a, b) => a - b)[0] : candidates.filter((t) => t < ut - 1 / 24).sort((a, b) => b - a)[0];
    }
    if (target == null) return false;
    jumpTo(target);
    return true;
  };
  epochKeyHandler = (action, direction) => {
    if (action === 'event' || action === 'phase') return step(action, direction);
    if (action === 'reverse') { surface.querySelector('[data-epoch-reverse]').click(); return true; }
    if (action === 'now') { jumpTo(epochNow()); return true; }
    if (action === 'marker') { activate(EPOCH_MARKERS[direction].key); return true; }
    return false;
  };

  surface.querySelectorAll('[data-epoch-date]').forEach((box) => epochBindDateFields(box, (ut) => {
    epochAstro.active = box.dataset.epochDate;
    epochAstroTimeline.activate(epochAstro.active);
    jumpTo(ut);
  }));
  surface.addEventListener('click', (event) => {
    const target = event.target;
    const set = target.closest('[data-epoch-set]');
    if (set) {
      epochAstro.active = set.dataset.epochSet;
      epochAstroTimeline.activate(epochAstro.active);
      jumpTo(Number(set.dataset.ut));
      return;
    }
    const activator = target.closest('[data-epoch-activate]');
    if (activator) return activate(activator.dataset.epochActivate);
    const now = target.closest('[data-epoch-now]');
    if (now) {
      epochAstro.active = now.dataset.epochNow;
      epochAstroTimeline.activate(epochAstro.active);
      return jumpTo(epochNow());
    }
    if (target.closest('[data-epoch-reverse]')) {
      epochAstro.times = { inner: epochAstro.times.outer, outer: epochAstro.times.inner };
      afterMove();
      epochAstroTimeline.reveal(epochAstro.active);
      return;
    }
    const stepButton = target.closest('[data-epoch-step]');
    if (stepButton) {
      const [action, direction] = stepButton.dataset.epochStep.split(':');
      step(action, Number(direction));
      return;
    }
    const row = target.closest('[data-epoch-pair-row]');
    if (row) choosePair(row.dataset.epochPairRow);
  });
  surface.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('[data-epoch-pair-row]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choosePair(row.dataset.epochPairRow); }
  });
  const choosePair = (pair) => {
    epochAstro.pair = pair;
    shownCycle = null;
    fillJump();
    draw({ full: true });
    afterMove();
  };
  pairSelect.addEventListener('change', () => choosePair(pairSelect.value));
  jumpSelect.addEventListener('change', () => {
    const event = epochConjunctions(epochAstro.pair)[Number(jumpSelect.value)];
    if (event) jumpTo(event.start);
    jumpSelect.value = '';
  });
  surface.querySelector('[data-epoch-lines]').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    epochAstro.lines = button.dataset.value;
    surface.querySelectorAll('[data-epoch-lines] button').forEach((item) => item.classList.toggle('active', item === button));
    draw();
  });
  surface.querySelectorAll('[data-epoch-body]').forEach((box) => box.addEventListener('change', () => {
    if (box.checked) epochAstro.bodies.add(box.dataset.epochBody); else epochAstro.bodies.delete(box.dataset.epochBody);
    draw();
  }));
  surface.querySelectorAll('[data-epoch-aspect]').forEach((box) => box.addEventListener('change', () => {
    if (box.checked) epochAstro.aspects.add(box.dataset.epochAspect); else epochAstro.aspects.delete(box.dataset.epochAspect);
    shownCycle = null;
    draw({ full: true });
  }));
  surface.querySelectorAll('[data-epoch-pair-list]').forEach((details) => details.addEventListener('toggle', () => {
    const body = details.querySelector('.epoch-pair-list-body');
    if (details.open && !body.innerHTML) body.innerHTML = epochPairListBodyMarkup(details.dataset.epochPairList);
  }));
  fillJump();
  draw({ full: true });
  afterMove();
}

// The timeline's track for the chosen pair: its phase angle over the window as a
// sawtooth (0 at each conjunction, rising to 360°; the shown aspects as faint guides),
// when the window is short enough to draw it, and a tick at every conjunction.
function epochAstroTrackMarkup(from, to) {
  const pair = epochAstro.pair;
  const x = (ut) => (((ut - from) / (to - from)) * 1000).toFixed(2);
  let markup = '';
  const cycleDays = (epochMeanCycleYears(pair) || 20) * EPOCH_YEAR_DAYS;
  const samples = 600;
  if ((to - from) / cycleDays <= 40) {
    markup += EPOCH_PHASES.slice(1).filter(epochPhaseShown).map((phase) => {
      const y = (96 - (phase.angle / 360) * 90).toFixed(2);
      return `<line x1="0" x2="1000" y1="${y}" y2="${y}" class="epoch-guide" stroke="${ASPECT_COLORS[phase.aspect]}"/>`;
    }).join('');
    let path = '', previous = null;
    for (let i = 0; i <= samples; i += 1) {
      const ut = from + ((to - from) * i) / samples;
      const angle = epochPhaseAngle(pair, ut);
      const y = (96 - (angle / 360) * 90).toFixed(2);
      // Lift the pen across the wrap from 360° back to 0°.
      path += `${previous == null || Math.abs(angle - previous) > 180 ? 'M' : 'L'}${x(ut)} ${y}`;
      previous = angle;
    }
    markup += `<path d="${path}" class="epoch-curve"/>`;
  }
  markup += epochConjunctions(pair).filter((event) => event.passes[event.passes.length - 1] >= from && event.start <= to)
    .map((event) => event.passes.map((pass) => `<line x1="${x(pass)}" x2="${x(pass)}" y1="0" y2="100" class="epoch-tick"/>`).join('')).join('');
  return markup;
}
