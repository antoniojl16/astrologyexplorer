// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer: Astrology ────────────────────────────────────────────
// The cycles of the five slow planets. Each of the ten pairs starts a cycle when the
// two meet (conjunction) and ends it when they meet again; in between, the faster one
// pulls ahead through the waxing sextile, square and trine, the opposition, and the
// waning trine, square and sextile. Two moments are compared on one bi-wheel — the
// inner one in purple, the outer one in green. Each moment is its own little cycle
// explorer: its own pair, steps from conjunction to conjunction or aspect to aspect, and
// its own timeline slider; they can be moved together, or swapped (Reverse).
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
const EPOCH_ASTRO_MIN = epochUtFromCalendar(-5000, 1, 1);
const EPOCH_ASTRO_MAX = epochUtFromCalendar(3000, 12, 31, 23.99);
const EPOCH_ELEMENTS = ['Fire', 'Earth', 'Air', 'Water'];

const epochAstro = {
  times: null, // { inner, outer }, set on first render
  pairs: { inner: 'Jupiter-Saturn', outer: 'Jupiter-Saturn' }, // each moment's cycle
  active: 'inner', // the moment the keys move
  together: false, // moving one moment moves the other by as much
  aspects: new Set(EPOCH_OPTIONAL_ASPECTS),
  lines: 'between',
  // Bodies on the wheel: the slow planets, until others are ticked (not remembered).
  bodies: new Set(EPOCH_BODIES),
};

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
// The shown phase whose aspect is within orb at this phase angle (the nearest), with
// how far past it the angle is — or null between aspects.
function epochAspectAt(angle) {
  const within = EPOCH_PHASES.filter(epochPhaseShown).map((phase) => {
    const offset = epochWrap180(angle - phase.angle);
    const orb = ASPECT_DEFINITIONS.find((definition) => definition.name === phase.aspect)?.orb ?? 10;
    return { phase, offset, inOrb: Math.abs(offset) <= orb };
  }).filter((entry) => entry.inOrb);
  return within.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0] || null;
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
// One moment: its pair, a conjunction to jump to, steps, and its slider; under the
// slider, how far into its cycle it is.
function epochMomentPanelMarkup(marker) {
  const key = marker.key;
  return `<div class="epoch-moment-panel" data-epoch-moment="${key}" style="--thumb:${marker.color}">
    <div class="epoch-moment-head">
      <button type="button" class="epoch-moment-pick" data-epoch-activate="${key}" title="The keys move this moment (${key === 'inner' ? '1' : '2'})"><i class="legend-dot" style="background:${marker.color}"></i>${key === 'inner' ? 'Inner' : 'Outer'}</button>
      <select class="epoch-compact-select" data-epoch-pair="${key}" aria-label="Pair" title="The pair whose cycle this moment follows">${EPOCH_PAIRS.map((pair) => `<option value="${pair}">${epochPairGlyphs(pair)}  ${epochPairName(pair)}</option>`).join('')}</select>
      <select class="epoch-compact-select" data-epoch-jump="${key}" aria-label="Go to conjunction"></select>
      <div class="epoch-stepper"><span>Conjunction</span><button type="button" data-epoch-step="${key}:event:-1" title="Previous conjunction of this pair (,)" aria-label="Previous conjunction">◀</button><button type="button" data-epoch-step="${key}:event:1" title="Next conjunction of this pair (.)" aria-label="Next conjunction">▶</button></div>
      <div class="epoch-stepper"><span>Aspect</span><button type="button" data-epoch-step="${key}:phase:-1" title="Previous exact aspect of this pair's cycle: the conjunction or a shown aspect ([)" aria-label="Previous aspect">◀</button><button type="button" data-epoch-step="${key}:phase:1" title="Next exact aspect of this pair's cycle (])" aria-label="Next aspect">▶</button></div>
      <span class="epoch-cycle-progress" data-epoch-cycle-progress="${key}" title="Time since this cycle's conjunction, and its share of the cycle"></span>
    </div>
    <div data-epoch-slider="${key}">${epochSliderMarkup('DATE')}</div>
  </div>`;
}
// "11.2 years (2%)": since the conjunction that opened the moment's cycle, and that as a
// share of the time to the next one.
function epochCycleProgressText(pair, ut) {
  const events = epochConjunctions(pair);
  const index = epochCycleIndex(pair, ut);
  if (index < 0) return 'Before the first conjunction in range';
  const start = events[index].start, next = events[index + 1]?.start;
  const years = ((ut - start) / EPOCH_YEAR_DAYS).toFixed(1);
  return next ? `${years} years (${Math.round(((ut - start) / (next - start)) * 100)}%)` : `${years} years`;
}
// Where every pair stands in its cycle at each moment: the conjunction that opened the
// cycle (each pass, with where it fell), the aspect in orb (its symbol and orb), and how
// far through the cycle the moment is, as a bar (exact share on hover). Each column
// marks its own moment's pair; clicking a cell gives that moment that pair.
function epochCycleTableMarkup() {
  const cell = (pair, key) => {
    const ut = epochAstro.times[key];
    const events = epochConjunctions(pair);
    const index = epochCycleIndex(pair, ut);
    const chosen = epochAstro.pairs[key] === pair ? ' selected' : '';
    const attributes = `class="epoch-cycle-cell${chosen}" data-epoch-pair-cell="${key}:${pair}" tabindex="0" title="Follow the ${epochPairName(pair)} cycle in the ${key} moment"`;
    if (index < 0) return `<td ${attributes}>—</td>`;
    const event = events[index], next = events[index + 1];
    const passes = event.passes.map((pass) => `<span class="epoch-pass">${epochShortDate(pass)} <b>${epochPositionText(epochConjunctionLongitude(pair, pass))}</b></span>`).join('');
    const aspect = epochAspectAt(epochPhaseAngle(pair, ut));
    const symbol = aspect
      ? `<span class="epoch-aspect-tag" title="${aspect.phase.label} · ${Math.abs(aspect.offset).toFixed(1)}° ${aspect.offset < 0 ? 'before exact (applying)' : 'past exact (separating)'}"><b class="epoch-aspect-symbol" style="color:${ASPECT_COLORS[aspect.phase.aspect]}">${ASPECT_DEFINITIONS.find((definition) => definition.name === aspect.phase.aspect).glyph}</b><small>${Math.abs(aspect.offset).toFixed(1)}°</small></span>`
      : '<span class="epoch-aspect-tag"></span>';
    const bar = next
      ? `<span class="epoch-progress" data-epoch-progress tabindex="0" data-pair="${pair}" data-from="${event.start}" data-to="${next.start}" data-at="${ut}"><i style="width:${Math.max(0, Math.min(100, ((ut - event.start) / (next.start - event.start)) * 100)).toFixed(1)}%"></i></span>`
      : '<span class="epoch-progress empty"></span>';
    return `<td ${attributes}>${passes}<span class="epoch-progress-row">${bar}${symbol}</span></td>`;
  };
  const head = (marker) => `<th><i class="legend-dot" style="background:${marker.color}"></i>${marker.key === 'inner' ? 'Inner' : 'Outer'} <small>${epochShortDate(epochAstro.times[marker.key])}</small></th>`;
  return `<table class="epoch-table epoch-cycles-table">
    <thead><tr><th>Cycle</th>${head(EPOCH_MARKERS[0])}${head(EPOCH_MARKERS[1])}</tr></thead>
    <tbody>${EPOCH_PAIRS.map((pair) => `<tr><th>${epochPairGlyphs(pair)}<small>${epochPairName(pair)}</small></th>${cell(pair, 'inner')}${cell(pair, 'outer')}</tr>`).join('')}</tbody>
  </table>`;
}
function epochProgressTipHtml(element) {
  const from = Number(element.dataset.from), to = Number(element.dataset.to), at = Number(element.dataset.at);
  const years = (days) => (days / EPOCH_YEAR_DAYS).toFixed(1);
  return `<div class="gk-tip-title">${epochPairName(element.dataset.pair)} · ${(((at - from) / (to - from)) * 100).toFixed(1)}% of the cycle</div>
    <div class="gk-tip-text">${years(at - from)} of ${years(to - from)} years, from the conjunction of ${epochShortDate(from)} to the next, ${epochShortDate(to)}.</div>`;
}
bindHoverTooltips('[data-epoch-progress]', epochProgressTipHtml, 'epochProgressTooltip');
// A conjunction's Inner / Outer buttons: that moment takes the pair and the time.
function epochSetButtonsMarkup(ut, pair) {
  return EPOCH_MARKERS.map((marker) => `<button type="button" class="epoch-set-button" data-epoch-set="${marker.key}" data-ut="${ut}" data-pair="${pair}" title="Set the ${marker.key} moment here" style="--thumb:${marker.color}">${marker.key === 'inner' ? 'Inner' : 'Outer'}</button>`).join('');
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
      return `<tr><td>${event.passes.map((pass) => `<span class="epoch-pass">${epochDateText(pass, { calendar: true })}</span>`).join('')}</td><td>${epochPositionText(longitude)}</td><td>${EPOCH_ELEMENTS[sign % 4]}</td><td class="epoch-set">${epochSetButtonsMarkup(event.start, pair)}</td></tr>`;
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
  // The wheel with its filters beside it; under them the two moments; then where every
  // cycle stands, the conjunction lists and the notes.
  surface.innerHTML = `
    <div class="epoch-astro-layout">
      <div class="chart-panel epoch-wheel-panel">
        <div class="panel-toolbar">
          <div class="chart-toolbar-right"><span class="eyebrow">LINES</span>${pairSegmentedMarkup('data-epoch-lines', EPOCH_ASTRO_LINES, epochAstro.lines)}</div>
        </div>
        <div class="wheel-stage"><svg class="synastry-wheel epoch-wheel" viewBox="20 20 560 560" role="img" aria-label="Epoch bi-wheel: the planets at two moments" data-epoch-wheel></svg><div class="epoch-legend" data-epoch-legend></div></div>
      </div>
      <div class="epoch-panel epoch-controls">
        <span class="eyebrow">ASPECTS</span>
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
      ${epochMomentPanelMarkup(EPOCH_MARKERS[0])}
      <div class="epoch-moment-links">
        <button type="button" class="pair-swap epoch-reverse" data-epoch-reverse title="Reverse the two moments, pairs and all (R)" aria-label="Reverse the two moments">⇅</button>
        <label class="epoch-lock"><input type="checkbox" data-epoch-together ${epochAstro.together ? 'checked' : ''}>Move together</label>
      </div>
      ${epochMomentPanelMarkup(EPOCH_MARKERS[1])}
    </div>
    <div class="epoch-panel epoch-cycles-panel">
      <span class="eyebrow">WHERE EACH CYCLE STANDS</span>
      <div data-epoch-cycles></div>
    </div>
    <h3 class="epoch-heading">All conjunctions, 5000 BC – 3000 AD</h3>
    <div data-epoch-lists>${epochConjunctionListMarkup()}</div>
    ${epochAstrologyNotesMarkup()}`;

  const svg = surface.querySelector('[data-epoch-wheel]');
  const sliders = {};
  const fillPair = (key) => {
    const pair = epochAstro.pairs[key];
    surface.querySelector(`[data-epoch-pair="${key}"]`).value = pair;
    surface.querySelector(`[data-epoch-jump="${key}"]`).innerHTML = `<option value="">Go to conjunction…</option>${epochConjunctions(pair).map((event, index) => `<option value="${index}">${epochDateText(event.start, { time: false })} · ${epochPositionText(epochConjunctionLongitude(pair, event.start))}</option>`).join('')}`;
  };
  const draw = () => {
    renderEpochWheel(svg);
    EPOCH_MARKERS.forEach((marker) => {
      surface.querySelector(`[data-epoch-moment="${marker.key}"]`).classList.toggle('active', epochAstro.active === marker.key);
      surface.querySelector(`[data-epoch-cycle-progress="${marker.key}"]`).textContent = epochCycleProgressText(epochAstro.pairs[marker.key], epochAstro.times[marker.key]);
    });
    surface.querySelector('[data-epoch-cycles]').innerHTML = epochCycleTableMarkup();
    surface.querySelector('[data-epoch-legend]').innerHTML = EPOCH_MARKERS.map((marker) => `<span><i class="legend-dot" style="background:${marker.color}"></i>${marker.key === 'inner' ? 'Inner' : 'Outer'} — ${epochShortDate(epochAstro.times[marker.key])}</span>`).join('');
  };
  // A moment moved (by its slider, or set here): with "Move together", the other one
  // follows by as much.
  let following = false;
  const moved = (key, ut) => {
    const clamped = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, ut));
    const delta = clamped - epochAstro.times[key];
    epochAstro.times[key] = clamped;
    if (epochAstro.together && !following && delta) {
      const other = key === 'inner' ? 'outer' : 'inner';
      following = true;
      epochAstro.times[other] = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, epochAstro.times[other] + delta));
      sliders[other]?.moveTo(epochAstro.times[other]);
      following = false;
    }
    draw();
  };
  const jumpTo = (key, ut) => {
    moved(key, ut);
    sliders[key].moveTo(epochAstro.times[key]);
  };
  const activate = (key) => { epochAstro.active = key; draw(); };
  EPOCH_MARKERS.forEach((marker) => {
    const key = marker.key;
    sliders[key] = epochBindSlider(surface.querySelector(`[data-epoch-slider="${key}"]`), {
      range: [EPOCH_ASTRO_MIN, EPOCH_ASTRO_MAX], initialYears: 100,
      get: () => epochAstro.times[key],
      set: (ut) => { epochAstro.active = key; moved(key, ut); },
      // The moment's pair's conjunctions, from the first pass to the last.
      markers: () => epochConjunctions(epochAstro.pairs[key]).map((event) => ({
        from: event.start, to: event.passes[event.passes.length - 1], color: marker.color,
        label: `${epochPairName(epochAstro.pairs[key])} conjunction · ${epochDateText(event.start, { time: false, calendar: true })}${event.passes.length > 1 ? ` (${event.passes.length} passes)` : ''}`,
      })),
    });
    fillPair(key);
  });
  // Steps for a moment: to the previous/next conjunction or aspect of its own pair.
  const step = (key, action, direction) => {
    const pair = epochAstro.pairs[key];
    const ut = epochAstro.times[key];
    const events = epochConjunctions(pair);
    let target = null;
    if (action === 'event') {
      const index = epochCycleIndex(pair, ut - (direction < 0 ? 1 / 24 : -1 / 24));
      target = direction > 0 ? events[index + 1]?.start : (events[index]?.start < ut - 1 / 24 ? events[index].start : events[index - 1]?.start);
    } else {
      const index = epochCycleIndex(pair, ut);
      const candidates = [index - 1, index, index + 1].filter((i) => i >= 0 && i < events.length)
        .flatMap((i) => epochCyclePhases(pair, i).filter((entry) => epochPhaseShown(entry.phase)).map((entry) => entry.start));
      target = direction > 0 ? candidates.filter((t) => t > ut + 1 / 24).sort((a, b) => a - b)[0] : candidates.filter((t) => t < ut - 1 / 24).sort((a, b) => b - a)[0];
    }
    if (target == null) return false;
    epochAstro.active = key;
    jumpTo(key, target);
    return true;
  };
  const choosePair = (key, pair) => {
    epochAstro.pairs[key] = pair;
    fillPair(key);
    sliders[key].refresh();
    draw();
  };
  const reverse = () => {
    epochAstro.times = { inner: epochAstro.times.outer, outer: epochAstro.times.inner };
    epochAstro.pairs = { inner: epochAstro.pairs.outer, outer: epochAstro.pairs.inner };
    const together = epochAstro.together;
    epochAstro.together = false;
    EPOCH_MARKERS.forEach(({ key }) => { fillPair(key); sliders[key].refresh(); sliders[key].moveTo(epochAstro.times[key]); });
    epochAstro.together = together;
    draw();
  };
  epochKeyHandler = (action, direction) => {
    if (action === 'event' || action === 'phase') return step(epochAstro.active, action, direction);
    if (action === 'reverse') { reverse(); return true; }
    if (action === 'now') { jumpTo(epochAstro.active, epochNow()); return true; }
    if (action === 'marker') { activate(EPOCH_MARKERS[direction].key); return true; }
    return false;
  };

  surface.addEventListener('click', (event) => {
    const target = event.target;
    const set = target.closest('[data-epoch-set]');
    if (set) {
      const key = set.dataset.epochSet;
      epochAstro.active = key;
      if (set.dataset.pair && set.dataset.pair !== epochAstro.pairs[key]) choosePair(key, set.dataset.pair);
      jumpTo(key, Number(set.dataset.ut));
      return;
    }
    const activator = target.closest('[data-epoch-activate]');
    if (activator) return activate(activator.dataset.epochActivate);
    if (target.closest('[data-epoch-reverse]')) return reverse();
    const stepButton = target.closest('[data-epoch-step]');
    if (stepButton) {
      const [key, action, direction] = stepButton.dataset.epochStep.split(':');
      step(key, action, Number(direction));
      return;
    }
    const cell = target.closest('[data-epoch-pair-cell]');
    if (cell && !target.closest('[data-epoch-progress]')) {
      const [key, pair] = cell.dataset.epochPairCell.split(':');
      choosePair(key, pair);
    }
  });
  surface.addEventListener('keydown', (event) => {
    const cell = event.target.closest?.('[data-epoch-pair-cell]');
    if (cell && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const [key, pair] = cell.dataset.epochPairCell.split(':');
      choosePair(key, pair);
    }
  });
  EPOCH_MARKERS.forEach(({ key }) => {
    surface.querySelector(`[data-epoch-pair="${key}"]`).addEventListener('change', (event) => choosePair(key, event.target.value));
    surface.querySelector(`[data-epoch-jump="${key}"]`).addEventListener('change', (event) => {
      const conjunction = epochConjunctions(epochAstro.pairs[key])[Number(event.target.value)];
      event.target.value = '';
      if (conjunction) { epochAstro.active = key; jumpTo(key, conjunction.start); }
    });
  });
  surface.querySelector('[data-epoch-together]').addEventListener('change', (event) => { epochAstro.together = event.target.checked; });
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
    draw();
  }));
  surface.querySelectorAll('[data-epoch-pair-list]').forEach((details) => details.addEventListener('toggle', () => {
    const body = details.querySelector('.epoch-pair-list-body');
    if (details.open && !body.innerHTML) body.innerHTML = epochPairListBodyMarkup(details.dataset.epochPairList);
  }));
  draw();
}
