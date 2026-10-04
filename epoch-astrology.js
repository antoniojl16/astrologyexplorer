// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer: Astrology ────────────────────────────────────────────
// The cycles of the five slow planets. Each of the ten pairs starts a cycle when the
// two meet (conjunction) and ends it when they meet again; in between, the faster one
// pulls ahead through the waxing sextile, square and trine, the opposition, and the
// waning trine, square and sextile. Two moments share one bi-wheel. The inner one, in
// purple, is the reference: a pair's cycle, stepped pass by pass through its exact
// conjunctions and aspects. The outer one, in green, is the moment analysed against it:
// one planet, stepped to each time it reaches the reference conjunction's degree, with
// the time since the reference as a share of the way to the pair's next conjunction.
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
  { key: 'inner', label: 'Reference', color: 'var(--epoch-inner)' },
  { key: 'outer', label: 'Moment', color: 'var(--epoch-outer)' },
];
const EPOCH_ASTRO_LINES = [['inner', 'Reference'], ['between', 'Between'], ['outer', 'Moment']];
const EPOCH_ASTRO_MIN = epochUtFromCalendar(-5000, 1, 1);
const EPOCH_ASTRO_MAX = epochUtFromCalendar(3000, 12, 31, 23.99);
const EPOCH_ELEMENTS = ['Fire', 'Earth', 'Air', 'Water'];

const epochAstro = {
  times: null, // { inner: the reference, outer: the moment }, set on first render
  pair: 'Jupiter-Saturn', // the reference's cycle
  planet: 'Saturn', // the moment's planet, stepped to the reference conjunction's degree
  // The exact pass the reference was stepped to, and the crossing the moment was: each
  // holds only while its moment stays there (epochReferenceFocus, epochMomentFocus).
  focus: null, // { pair, ut, phase, pass, passes }
  momentFocus: null, // { planet, degree, ut, crossing, crossings, retrograde }
  active: 'inner', // the moment the keys move
  together: false, // moving the reference moves the moment by as much
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
  // Sampled every `step` days near a phase angle, but far from all of them the scan leaps
  // ahead: the angle can't change faster than the two planets' top speeds together, so
  // it can't reach a phase sooner than its distance allows.
  const [first, second] = epochPairBodies(pair);
  const fastest = EPOCH_MAX_SPEED[first] + EPOCH_MAX_SPEED[second];
  const samples = [];
  for (let ut = start; ut <= end;) {
    const angle = epochPhaseAngle(pair, ut);
    samples.push([ut, angle]);
    const nearest = Math.min(...EPOCH_PHASES.map((phase) => Math.abs(epochWrap180(angle - phase.angle))));
    ut += Math.max(step, nearest / fastest);
  }
  if (samples[samples.length - 1][0] < end) samples.push([end, epochPhaseAngle(pair, end)]);
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
  // The reference conjunction's degree, across both rings: where the moment's planet is headed.
  const focus = epochReferenceFocus();
  if (focus?.phase.angle === 0) {
    const rad = ((rotation - epochConjunctionLongitude(focus.pair, focus.ut) - 90) * Math.PI) / 180;
    markup += `<line x1="${cx + aspectR * Math.cos(rad)}" y1="${cy + aspectR * Math.sin(rad)}" x2="${cx + zodiacInner * Math.cos(rad)}" y2="${cy + zodiacInner * Math.sin(rad)}" class="epoch-reference-degree"/>`;
  }
  inner.forEach(marker(insideOuter));
  outerRing.forEach(marker(zodiacInner));
  // The two dates, in the strip under the wheel.
  EPOCH_MARKERS.forEach((item, index) => {
    const y = 596 + index * 16;
    markup += `<circle cx="28" cy="${y - 4}" r="4" fill="${item.color}"/><text x="38" y="${y}" class="epoch-wheel-legend">${item.label} — ${epochShortDate(epochAstro.times[item.key])}</text>`;
  });
  // The reference's pass as the wheel's title, in the band above it (kept when empty,
  // so the wheel doesn't change size as the reference moves).
  if (focus) {
    const [title, details] = epochReferenceFocusLines(focus);
    markup += `<text x="${cx}" y="-12" class="epoch-wheel-title" text-anchor="middle">${escapeHtml(title)}</text><text x="${cx}" y="9" class="epoch-wheel-subtitle" text-anchor="middle">${escapeHtml(details)}</text>`;
  }
  svg.innerHTML = markup;
  const all = new Map([...inner, ...outerRing].map((position) => [position.key, position]));
  svg._wheelHover = {
    planet: (key) => all.has(key) && (() => {
      const position = all.get(key);
      const { glyph, degree } = wheelSignText(position.longitude);
      const mark = WHEEL_MOTION_MARKS[position.motion];
      return `<div class="wheel-tooltip-main">${position.name} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div><div class="wheel-tooltip-sub">${position.marker.label} · ${epochDateText(epochAstro.times[position.marker.key], { time: false, calendar: true })}</div>`;
    }),
    aspect: (index) => aspects[index] && (() => {
      const aspect = aspects[index];
      const side = (ring) => (epochAstro.lines === 'between' ? ` (${ring === inner ? 'reference' : 'moment'})` : '');
      return `<div class="wheel-tooltip-main">${aspect.first}${side(firstRing)} ${aspect.name} ${aspect.second}${side(secondRing)}</div><div class="wheel-tooltip-sub">Orb ${aspect.orb.toFixed(1)}°</div>`;
    }),
  };
  bindWheelHover(svg).hidden = true;
  return aspects;
}

// ── Reference: exact passes ──────────────────────────────────────────────
// Every exact pass of the pair's conjunctions, in order, each as { ut, phase, pass,
// passes } (pass 2 of 3 of a retrograde loop, say).
const EPOCH_STEP_EPSILON = 1 / 1440; // a minute: a step always moves past the current pass
const epochPassCache = {};
function epochConjunctionPasses(pair) {
  if (!epochPassCache[pair]) {
    epochPassCache[pair] = epochConjunctions(pair).flatMap((event) => event.passes.map((ut, index) => ({ ut, phase: EPOCH_PHASES[0], pass: index + 1, passes: event.passes.length })));
  }
  return epochPassCache[pair];
}
// The next (direction 1) or previous (−1) exact pass of the conjunction or a shown aspect
// from `ut`: looked for in its own cycle first, then (only if need be) the neighbouring
// one, since working out a slow pair's cycle takes a moment.
function epochAspectPassFrom(pair, ut, direction) {
  const count = epochConjunctions(pair).length;
  const passesOf = (i) => (i < 0 || i >= count ? [] : epochCyclePhases(pair, i).filter((entry) => epochPhaseShown(entry.phase))
    .flatMap((entry) => entry.passes.map((pass, k) => ({ ut: pass, phase: entry.phase, pass: k + 1, passes: entry.passes.length }))));
  const index = epochCycleIndex(pair, ut);
  const own = passesOf(index);
  const found = epochPassFrom(own.sort((a, b) => a.ut - b.ut), ut, direction);
  return found || epochPassFrom([...own, ...passesOf(index + direction)].sort((a, b) => a.ut - b.ut), ut, direction);
}
// The next (direction 1) or previous (−1) pass from `ut` in a time-ordered list.
function epochPassFrom(list, ut, direction) {
  if (direction > 0) return list.find((entry) => entry.ut > ut + EPOCH_STEP_EPSILON) || null;
  for (let index = list.length - 1; index >= 0; index -= 1) if (list[index].ut < ut - EPOCH_STEP_EPSILON) return list[index];
  return null;
}
// The pass the reference sits on, while it still does (dragging the slider or choosing
// another pair lets it go).
function epochReferenceFocus() {
  const focus = epochAstro.focus;
  return focus && focus.ut === epochAstro.times.inner && focus.pair === epochAstro.pair ? focus : null;
}
// The reference's pass in two lines: "Neptune–Pluto conjunction 1892" and
// "1892 Apr 30 · ♊ 7°42′ · pass 3 of 3" (for an aspect, both planets' positions).
function epochReferenceFocusLines(focus) {
  const [first, second] = epochPairBodies(focus.pair);
  const pass = focus.passes > 1 ? ` · pass ${focus.pass} of ${focus.passes}` : '';
  const title = `${epochPairName(focus.pair)} ${focus.phase.angle === 0 ? 'conjunction' : focus.phase.label.toLowerCase()} ${epochYearLabel(epochCalendar(focus.ut).year)}`;
  const date = epochDateText(focus.ut, { time: false });
  if (focus.phase.angle === 0) return [title, `${date} · ${epochPositionText(epochConjunctionLongitude(focus.pair, focus.ut))}${pass}`];
  const time = epochTime(focus.ut);
  return [title, `${date} · ${EPOCH_GLYPHS[first]} ${epochPositionText(epochLongitude(first, time))} · ${EPOCH_GLYPHS[second]} ${epochPositionText(epochLongitude(second, time))}${pass}`];
}

// ── Moment: the planet's returns to the reference degree ─────────────────
// Every planet, outermost first. A scan step per planet (short enough that it can't
// skip a crossing, retrograde loops included) and its time round the zodiac.
const EPOCH_RETURN_BODIES = ['Pluto', 'Neptune', 'Uranus', 'Saturn', 'Jupiter', 'Mars', 'Venus', 'Mercury', 'Sun', 'Moon'];
const EPOCH_RETURN_STEP = { Pluto: 20, Neptune: 20, Uranus: 15, Saturn: 8, Jupiter: 4, Mars: 2, Venus: 1, Mercury: 0.5, Sun: 4, Moon: 0.5 };
// The fastest each one moves (degrees a day): measured over 5000 BC – 3000 AD, plus 10%.
const EPOCH_MAX_SPEED = { Pluto: 0.046, Neptune: 0.042, Uranus: 0.07, Saturn: 0.15, Jupiter: 0.27, Mars: 0.88, Venus: 1.4, Mercury: 2.45, Sun: 1.13, Moon: 17 };
const EPOCH_ORBIT_DAYS = { Pluto: 90560, Neptune: 60190, Uranus: 30687, Saturn: 10759, Jupiter: 4333, Mars: 687, Venus: 365.25, Mercury: 365.25, Sun: 365.25, Moon: 27.32 };
// Crossings of the planet over `degree` between `from` and `to`, each { ut, retrograde }.
// Sampled every step near the degree; further away the scan leaps ahead by as long as
// the planet, at its top speed, needs to get there.
function epochCrossings(body, degree, from, to) {
  const offset = (ut) => epochWrap180(epochLongitude(body, ut) - degree);
  const step = EPOCH_RETURN_STEP[body];
  const crossings = [];
  let before = offset(from);
  for (let ut = from; ut < to;) {
    const next = Math.min(ut + Math.max(step, Math.abs(before) / EPOCH_MAX_SPEED[body]), to), after = offset(next);
    if ((before <= 0) !== (after <= 0) && Math.abs(before - after) < 180) {
      let lo = ut, hi = next, fLo = before;
      for (let k = 0; k < 40 && hi - lo > 1 / 1440; k += 1) {
        const mid = (lo + hi) / 2, fMid = offset(mid);
        if ((fLo <= 0) === (fMid <= 0)) { lo = mid; fLo = fMid; } else hi = mid;
      }
      crossings.push({ ut: (lo + hi) / 2, retrograde: after < before });
    }
    before = after;
    ut = next;
  }
  return crossings;
}
// Crossings less than this far apart belong to one retrograde loop.
const epochLoopWindow = (body) => Math.min(EPOCH_ORBIT_DAYS[body] / 2, 400);
// The next (direction 1) or previous (−1) crossing from `ut`, searched a stretch at a
// time, with where it falls in its loop (crossing 2 of 3).
function epochNextCrossing(body, degree, ut, direction) {
  const chunk = Math.max(EPOCH_RETURN_STEP[body] * 40, Math.min(EPOCH_ORBIT_DAYS[body] * 0.6, 3650));
  let found = null;
  for (let from = ut; !found && (direction > 0 ? from < EPOCH_ASTRO_MAX : from > EPOCH_ASTRO_MIN); from += direction * chunk) {
    const range = direction > 0 ? [from, Math.min(EPOCH_ASTRO_MAX, from + chunk)] : [Math.max(EPOCH_ASTRO_MIN, from - chunk), from];
    const list = epochCrossings(body, degree, ...range).filter((crossing) => (direction > 0 ? crossing.ut > ut + EPOCH_STEP_EPSILON : crossing.ut < ut - EPOCH_STEP_EPSILON));
    found = direction > 0 ? list[0] : list[list.length - 1];
  }
  if (!found) return null;
  // Its loop: the crossings chained to it by gaps shorter than the loop window.
  const window = epochLoopWindow(body);
  const around = epochCrossings(body, degree, found.ut - window * 2, found.ut + window * 2);
  let index = around.findIndex((crossing) => Math.abs(crossing.ut - found.ut) < 1 / 24);
  if (index < 0) { around.push(found); around.sort((a, b) => a.ut - b.ut); index = around.indexOf(found); }
  let first = index, last = index;
  while (first > 0 && around[first].ut - around[first - 1].ut < window) first -= 1;
  while (last < around.length - 1 && around[last + 1].ut - around[last].ut < window) last += 1;
  return { planet: body, degree, ut: found.ut, retrograde: found.retrograde, crossing: index - first + 1, crossings: last - first + 1 };
}
// The crossing the moment sits on, while it still does.
function epochMomentFocus() {
  const focus = epochAstro.momentFocus, reference = epochReferenceFocus();
  return focus && reference?.phase.angle === 0 && focus.ut === epochAstro.times.outer && focus.planet === epochAstro.planet
    && focus.degree === epochConjunctionLongitude(reference.pair, reference.ut) ? focus : null;
}
// "♄ reaches ♊ 8°38′ · 1921 Jun 3 · crossing 2 of 3 ℞"
function epochMomentFocusText(focus) {
  const loop = focus.crossings > 1 ? ` · crossing ${focus.crossing} of ${focus.crossings}` : '';
  return `${EPOCH_WHEEL_GLYPHS[focus.planet]} reaches ${epochPositionText(focus.degree)} · ${epochDateText(focus.ut, { time: false })}${loop}${focus.retrograde ? ' ℞' : ''}`;
}
// The moment slider's marks, while the reference is on a conjunction: the reference
// itself and the planet's crossings of its degree, up to 200 years either side (and no
// more than 40 times round the zodiac, for the fast ones).
let epochMomentMarksCache = { key: null, marks: [] };
function epochMomentMarks() {
  const reference = epochReferenceFocus();
  if (!reference) return [];
  const key = `${reference.pair}:${reference.ut}:${reference.phase.angle}:${epochAstro.planet}`;
  if (epochMomentMarksCache.key !== key) epochMomentMarksCache = { key, marks: epochMomentMarksFor(reference) };
  return epochMomentMarksCache.marks;
}
function epochMomentMarksFor(reference) {
  const marks = [{ from: reference.ut, color: 'var(--epoch-inner)', label: `Reference · ${epochReferenceFocusLines(reference).join(' · ')}` }];
  if (reference.phase.angle !== 0) return marks;
  const body = epochAstro.planet, degree = epochConjunctionLongitude(reference.pair, reference.ut);
  const reach = Math.min(200 * EPOCH_YEAR_DAYS, EPOCH_ORBIT_DAYS[body] * 40);
  epochCrossings(body, degree, Math.max(EPOCH_ASTRO_MIN, reference.ut - reach), Math.min(EPOCH_ASTRO_MAX, reference.ut + reach)).forEach((crossing) => marks.push({
    from: crossing.ut, color: 'var(--epoch-outer)',
    label: `${EPOCH_WHEEL_GLYPHS[body]} reaches ${epochPositionText(degree)} · ${epochDateText(crossing.ut, { time: false, calendar: true })}${crossing.retrograde ? ' ℞' : ''}`,
  }));
  return marks;
}

// ── Panels ───────────────────────────────────────────────────────────────
// The reference, beside the wheel: its pair, a conjunction to jump to, steps pass by pass,
// what it's on, and its slider.
function epochReferencePanelMarkup() {
  const marker = EPOCH_MARKERS[0];
  return `<div class="epoch-panel epoch-moment-panel epoch-reference-panel" data-epoch-moment="inner" style="--thumb:${marker.color}">
    <button type="button" class="epoch-moment-pick" data-epoch-activate="inner" title="The keys move the reference (1)"><i class="legend-dot" style="background:${marker.color}"></i>Reference</button>
    <div class="epoch-select-row">
      <select class="epoch-compact-select" data-epoch-pair aria-label="Pair" title="The pair whose cycle is the reference">${EPOCH_PAIRS.map((pair) => `<option value="${pair}">${epochPairGlyphs(pair)}  ${epochPairName(pair)}</option>`).join('')}</select>
      <select class="epoch-compact-select" data-epoch-jump aria-label="Go to conjunction" title="Go to a conjunction of this pair"></select>
    </div>
    <div class="epoch-steppers">
      <div class="epoch-stepper"><span>Conjunction</span><button type="button" data-epoch-step="inner:event:-1" title="Previous exact conjunction of this pair, pass by pass (,)" aria-label="Previous conjunction">◀</button><button type="button" data-epoch-step="inner:event:1" title="Next exact conjunction of this pair, pass by pass (.)" aria-label="Next conjunction">▶</button></div>
      <div class="epoch-stepper"><span>Aspect</span><button type="button" data-epoch-step="inner:phase:-1" title="Previous exact aspect of this pair: the conjunction or a shown aspect, pass by pass ([)" aria-label="Previous aspect">◀</button><button type="button" data-epoch-step="inner:phase:1" title="Next exact aspect of this pair, pass by pass (])" aria-label="Next aspect">▶</button></div>
    </div>
    <div data-epoch-slider="inner">${epochSliderMarkup('DATE')}</div>
  </div>`;
}
// The moment, under the wheel: its planet, steps to the planet's crossings of the
// reference conjunction's degree, what it's on, the time from the reference, and its slider.
function epochMomentPanelMarkup() {
  const marker = EPOCH_MARKERS[1];
  return `<div class="epoch-moment-panel" data-epoch-moment="outer" style="--thumb:${marker.color}">
    <div class="epoch-moment-head">
      <button type="button" class="epoch-moment-pick" data-epoch-activate="outer" title="The keys move the moment (2)"><i class="legend-dot" style="background:${marker.color}"></i>Moment</button>
      <select class="epoch-compact-select" data-epoch-planet aria-label="Planet" title="The planet to follow to the reference conjunction's degree">${EPOCH_RETURN_BODIES.map((body) => `<option value="${body}">${EPOCH_WHEEL_GLYPHS[body]}  ${body}</option>`).join('')}</select>
      <div class="epoch-stepper"><span>Return</span><button type="button" data-epoch-step="outer:return:-1" aria-label="Previous time the planet reaches the reference degree">◀</button><button type="button" data-epoch-step="outer:return:1" aria-label="Next time the planet reaches the reference degree">▶</button></div>
      <label class="epoch-lock" title="Moving the reference moves the moment by as much"><input type="checkbox" data-epoch-together ${epochAstro.together ? 'checked' : ''}>Follows the reference</label>
      <span class="epoch-focus" data-epoch-focus="outer"></span>
      <span class="epoch-cycle-progress" data-epoch-cycle-progress></span>
    </div>
    <div data-epoch-slider="outer">${epochSliderMarkup('DATE')}</div>
  </div>`;
}
// The moment against the reference: "+5.8 years (29%)", the time since the reference and
// that as a share of the way to the pair's next conjunction (negative before it).
function epochReferenceProgress() {
  const reference = epochAstro.times.inner, ut = epochAstro.times.outer;
  const next = epochConjunctions(epochAstro.pair).find((event) => event.start > reference + EPOCH_STEP_EPSILON)?.start;
  const years = (ut - reference) / EPOCH_YEAR_DAYS;
  const sign = (value, text) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`;
  return {
    text: `${sign(years, `${Math.abs(years).toFixed(1)} years`)}${next ? ` (${sign(ut - reference, `${Math.abs(Math.round(((ut - reference) / (next - reference)) * 100))}%`)})` : ''}`,
    title: next ? `From the reference to the moment, and its share of the ${epochAstro.pair.replace('-', '–')} cycle from the reference to the next conjunction (${epochShortDate(next)})` : 'From the reference to the moment',
  };
}
// Where every pair stands in its cycle at each moment: the conjunction that opened the
// cycle (each pass, with where it fell), the aspect in orb (its symbol and orb), and how
// far through the cycle the moment is, as a bar (exact share on hover). The reference's
// pair is marked; clicking a cell makes that pair the reference's.
function epochCycleTableMarkup() {
  const cell = (pair, key) => {
    const ut = epochAstro.times[key];
    const events = epochConjunctions(pair);
    const index = epochCycleIndex(pair, ut);
    const chosen = key === 'inner' && epochAstro.pair === pair ? ' selected' : '';
    const attributes = `class="epoch-cycle-cell${chosen}" data-epoch-pair-cell="${pair}" tabindex="0" title="Make the ${epochPairName(pair)} cycle the reference"`;
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
  const head = (marker) => `<th><i class="legend-dot" style="background:${marker.color}"></i>${marker.label} <small>${epochShortDate(epochAstro.times[marker.key])}</small></th>`;
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
// A conjunction's Set Reference button: the reference takes the pair and the first pass.
function epochSetButtonsMarkup(ut, pair) {
  return `<button type="button" class="epoch-set-button" data-epoch-set data-ut="${ut}" data-pair="${pair}" title="Make this conjunction the reference" style="--thumb:var(--epoch-inner)">Set Reference</button>`;
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
      return `<tr><td>${event.passes.map((pass) => `<span class="epoch-pass">${epochDateText(pass, { time: false, calendar: true })}</span>`).join('')}</td><td>${epochPositionText(longitude)}</td><td>${EPOCH_ELEMENTS[sign % 4]}</td><td class="epoch-set">${epochSetButtonsMarkup(event.start, pair)}</td></tr>`;
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
    const event = epochConjunctions(epochAstro.pair)[epochCycleIndex(epochAstro.pair, now)];
    epochAstro.times = { inner: event?.start ?? now, outer: now };
    if (event) epochAstro.focus = { pair: epochAstro.pair, ut: event.start, phase: EPOCH_PHASES[0], pass: 1, passes: event.passes.length };
  }
  epochAstro.bodies.add(epochAstro.planet);
  // The wheel with its filters and the reference beside it; under it the moment; then
  // where every cycle stands, the conjunction lists and the notes.
  surface.innerHTML = `
    <div class="epoch-astro-layout">
      <div class="chart-panel epoch-wheel-panel">
        <div class="panel-toolbar">
          <div class="chart-toolbar-right"><span class="eyebrow">LINES</span>${pairSegmentedMarkup('data-epoch-lines', EPOCH_ASTRO_LINES, epochAstro.lines)}</div>
        </div>
        <div class="wheel-stage"><svg class="synastry-wheel epoch-wheel" viewBox="20 -36 560 652" role="img" aria-label="Epoch bi-wheel: the planets at the reference and the moment" data-epoch-wheel></svg></div>
      </div>
      <div class="epoch-side">
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
        ${epochReferencePanelMarkup()}
      </div>
    </div>
    <div class="chart-panel epoch-time-panel">${epochMomentPanelMarkup()}</div>
    <div class="epoch-panel epoch-cycles-panel">
      <span class="eyebrow">WHERE EACH CYCLE STANDS</span>
      <div data-epoch-cycles></div>
    </div>
    <h3 class="epoch-heading">All conjunctions, 5000 BC – 3000 AD</h3>
    <div data-epoch-lists>${epochConjunctionListMarkup()}</div>
    ${epochAstrologyNotesMarkup()}`;

  const svg = surface.querySelector('[data-epoch-wheel]');
  const sliders = {};
  const fillPair = () => {
    const pair = epochAstro.pair;
    surface.querySelector('[data-epoch-pair]').value = pair;
    surface.querySelector('[data-epoch-jump]').innerHTML = `<option value="">Go to…</option>${epochConjunctions(pair).map((event, index) => `<option value="${index}">${epochDateText(event.start, { time: false })} · ${epochPositionText(epochConjunctionLongitude(pair, event.start))}</option>`).join('')}`;
  };
  // The moment slider's marks follow the reference's pass and the planet.
  let markedFor = null;
  const draw = () => {
    renderEpochWheel(svg);
    EPOCH_MARKERS.forEach((marker) => surface.querySelector(`[data-epoch-moment="${marker.key}"]`).classList.toggle('active', epochAstro.active === marker.key));
    const reference = epochReferenceFocus(), moment = epochMomentFocus();
    surface.querySelector('[data-epoch-focus="outer"]').textContent = moment ? epochMomentFocusText(moment) : '';
    // The planet steps only while the reference is on a conjunction: to its degree.
    const degree = reference?.phase.angle === 0 ? epochConjunctionLongitude(reference.pair, reference.ut) : null;
    surface.querySelectorAll('[data-epoch-step^="outer:return"]').forEach((button) => {
      button.disabled = degree == null;
      button.title = degree == null
        ? 'Step the reference to a conjunction first: the planet then steps to each time it reaches that degree'
        : `${button.dataset.epochStep.endsWith('-1') ? 'Previous' : 'Next'} time ${epochAstro.planet} reaches ${epochPositionText(degree)}, the reference conjunction's degree, crossing by crossing (${button.dataset.epochStep.endsWith('-1') ? ',' : '.'})`;
    });
    const progress = epochReferenceProgress();
    const progressNode = surface.querySelector('[data-epoch-cycle-progress]');
    progressNode.textContent = progress.text;
    progressNode.title = progress.title;
    surface.querySelector('[data-epoch-cycles]').innerHTML = epochCycleTableMarkup();
    const markKey = `${reference?.ut}:${reference?.phase.angle}:${epochAstro.planet}`;
    if (markKey !== markedFor) { markedFor = markKey; sliders.outer?.refresh(); }
  };
  // A moment moved (by its slider, or set here). With "Follows the reference", moving the
  // reference moves the moment by as much (not the other way round: the moment's steps
  // are measured from the reference).
  const moved = (key, ut) => {
    const clamped = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, ut));
    const delta = clamped - epochAstro.times[key];
    epochAstro.times[key] = clamped;
    if (key === 'inner' && epochAstro.together && delta) {
      epochAstro.times.outer = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, epochAstro.times.outer + delta));
      sliders.outer?.moveTo(epochAstro.times.outer);
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
      range: [EPOCH_ASTRO_MIN, EPOCH_ASTRO_MAX], initialYears: 100, wheelZoom: false,
      get: () => epochAstro.times[key],
      set: (ut) => { epochAstro.active = key; moved(key, ut); },
      // The reference: its pair's conjunctions, from the first pass to the last. The
      // moment: the reference, and the planet's crossings of its degree.
      markers: key === 'inner'
        ? () => epochConjunctions(epochAstro.pair).map((event) => ({
          from: event.start, to: event.passes[event.passes.length - 1], color: marker.color,
          label: `${epochPairName(epochAstro.pair)} conjunction · ${epochDateText(event.start, { time: false, calendar: true })}${event.passes.length > 1 ? ` (${event.passes.length} passes)` : ''}`,
        }))
        : epochMomentMarks,
    });
  });
  fillPair();
  surface.querySelector('[data-epoch-planet]').value = epochAstro.planet;
  // The reference onto an exact pass, which it then names.
  const focusOn = (entry) => {
    epochAstro.focus = { pair: epochAstro.pair, ...entry };
    epochAstro.active = 'inner';
    jumpTo('inner', entry.ut);
  };
  // Steps: the reference to the previous/next exact pass of its pair's conjunctions, or
  // of its conjunctions and shown aspects; the moment to the previous/next crossing of
  // the reference conjunction's degree by its planet.
  const step = (key, action, direction) => {
    if (key === 'inner') {
      const ut = epochAstro.times.inner;
      const entry = action === 'event' ? epochPassFrom(epochConjunctionPasses(epochAstro.pair), ut, direction) : epochAspectPassFrom(epochAstro.pair, ut, direction);
      if (!entry) return false;
      focusOn(entry);
      return true;
    }
    const reference = epochReferenceFocus();
    if (reference?.phase.angle !== 0) return false;
    const crossing = epochNextCrossing(epochAstro.planet, epochConjunctionLongitude(reference.pair, reference.ut), epochAstro.times.outer, direction);
    if (!crossing) return false;
    epochAstro.momentFocus = crossing;
    epochAstro.active = 'outer';
    jumpTo('outer', crossing.ut);
    return true;
  };
  const choosePair = (pair) => {
    epochAstro.pair = pair;
    fillPair();
    sliders.inner.refresh();
    draw();
  };
  // A conjunction from a list or the jump menu: the reference goes to its first pass.
  const setReference = (pair, ut) => {
    if (pair !== epochAstro.pair) choosePair(pair);
    const event = epochConjunctions(pair).find((item) => item.start === ut);
    focusOn({ ut, phase: EPOCH_PHASES[0], pass: 1, passes: event?.passes.length ?? 1 });
  };
  epochKeyHandler = (action, direction) => {
    if (action === 'event') return step(epochAstro.active, epochAstro.active === 'inner' ? 'event' : 'return', direction);
    if (action === 'phase') return step('inner', 'phase', direction);
    if (action === 'now') { jumpTo(epochAstro.active, epochNow()); return true; }
    if (action === 'marker') { activate(EPOCH_MARKERS[direction].key); return true; }
    return false;
  };

  surface.addEventListener('click', (event) => {
    const target = event.target;
    const set = target.closest('[data-epoch-set]');
    if (set) {
      setReference(set.dataset.pair, Number(set.dataset.ut));
      // Up to the wheel, to show what just changed.
      surface.querySelector('.epoch-wheel-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const activator = target.closest('[data-epoch-activate]');
    if (activator) return activate(activator.dataset.epochActivate);
    const stepButton = target.closest('[data-epoch-step]');
    if (stepButton) {
      const [key, action, direction] = stepButton.dataset.epochStep.split(':');
      step(key, action, Number(direction));
      return;
    }
    const cell = target.closest('[data-epoch-pair-cell]');
    if (cell && !target.closest('[data-epoch-progress]')) choosePair(cell.dataset.epochPairCell);
  });
  surface.addEventListener('keydown', (event) => {
    const cell = event.target.closest?.('[data-epoch-pair-cell]');
    if (cell && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      choosePair(cell.dataset.epochPairCell);
    }
  });
  surface.querySelector('[data-epoch-pair]').addEventListener('change', (event) => choosePair(event.target.value));
  surface.querySelector('[data-epoch-jump]').addEventListener('change', (event) => {
    const conjunction = epochConjunctions(epochAstro.pair)[Number(event.target.value)];
    event.target.value = '';
    if (conjunction) setReference(epochAstro.pair, conjunction.start);
  });
  surface.querySelector('[data-epoch-planet]').addEventListener('change', (event) => {
    epochAstro.planet = event.target.value;
    // The chosen planet shows on the wheel.
    if (!epochAstro.bodies.has(epochAstro.planet)) {
      epochAstro.bodies.add(epochAstro.planet);
      surface.querySelector(`[data-epoch-body="${epochAstro.planet}"]`).checked = true;
    }
    draw();
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
