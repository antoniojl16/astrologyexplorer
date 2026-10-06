// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const STORAGE_KEY = 'astrology-explorer-v1';
const PLANETS = [
  ['Sun', '☉', 'Leo'],
  ['Moon', '☽', 'Pisces'],
  ['Mercury', '☿', 'Virgo'],
  ['Venus', '♀', 'Cancer'],
  ['Mars', '♂', 'Gemini'],
  ['Jupiter', '♃', 'Libra'],
  ['Saturn', '♄', 'Aries'],
  ['Uranus', '♅', 'Aquarius'],
  ['Neptune', '♆', 'Capricorn'],
  ['Pluto', '♇', 'Scorpio'],
  ['North Node', '☊', 'Taurus'],
  ['Chiron', '⚷', 'Aries'],
];
const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];
const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const SIGN_ELEMENTS = [
  'fire',
  'earth',
  'air',
  'water',
  'fire',
  'earth',
  'air',
  'water',
  'fire',
  'earth',
  'air',
  'water',
];
const FIRST_NAMES = [
  'Mira',
  'Jonas',
  'Elena',
  'Tomas',
  'Sana',
  'Ravi',
  'Clara',
  'Noah',
  'Iris',
  'Mateo',
];
const LAST_NAMES = [
  'Vale',
  'Orion',
  'Mercer',
  'Sol',
  'North',
  'Aster',
  'Rowan',
  'Dawn',
  'Quill',
  'Marlowe',
];
const SAMPLE_CITIES = [
  { location: 'Lisbon, Portugal', latitude: '38.7223', longitude: '-9.1393', timezone: 'Europe/Lisbon' },
  { location: 'Oslo, Norway', latitude: '59.9139', longitude: '10.7522', timezone: 'Europe/Oslo' },
  { location: 'Austin, USA', latitude: '30.2672', longitude: '-97.7431', timezone: 'America/Chicago' },
  { location: 'Kyoto, Japan', latitude: '35.0116', longitude: '135.7681', timezone: 'Asia/Tokyo' },
  { location: 'Cape Town, South Africa', latitude: '-33.9249', longitude: '18.4241', timezone: 'Africa/Johannesburg' },
];
let state = loadState();
let selectedChartId = state.charts[0]?.id || null;
let selectedRowIndex = 0;
let currentView = 'library';
// 'chart' shows the library-selected chart in the shared explorer surface;
// 'timeline' shows a synthetic chart anchored to the current moment instead.
let explorerMode = 'chart';
let timelineReferenceChart = null;

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seeded(seed) {
  let value = hashString(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// ── Zone-aware birth moment ───────────────────────────────────────────────
// Converts chart.birthDate + chart.birthTime — a WALL-CLOCK reading in
// chart.timezone — into the real UTC instant it corresponds to. Every other
// "when is this chart's birth, exactly" computation in the app (positions,
// design time, cycles, the timeline slider's exact-time readout) is built on
// top of this, so the birth location's own timezone determines what "birth
// moment" means, not whatever zone the viewing browser happens to be in.
//
// This app is buildless/offline with no timezone-database library bundled,
// so rather than hand-roll DST rules, it leans on a well-known Intl trick:
// format a guessed UTC instant back out through the target zone, see how far
// that reading drifts from the wall-clock we actually want, and correct by
// that drift. One pass is enough for almost every zone (a fixed, non-DST
// offset), but a couple of iterations make it exact across a DST transition
// too, where the offset at the guessed instant can differ from the offset at
// the true answer.
function isValidTimeZone(timeZone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch (error) { return false; }
}
function chartBirthMomentUTC(chart) {
  // A chart carrying a stale or hand-typed timezone from before the dropdown
  // existed (see timezoneOptionsMarkup) could hold something Intl rejects —
  // that used to throw here and, since this runs for every chart during
  // page-load normalization (normalizePositionModel in editing.js), it could
  // silently abort the rest of that script's top-level code, including the
  // line that wires up the "Edit chart" button. Falling back to UTC instead
  // keeps one bad chart from being able to break the whole page.
  const timeZone = chart.timezone && isValidTimeZone(chart.timezone) ? chart.timezone : 'UTC';
  const wallClockAsUTC = new Date(`${chart.birthDate}T${chart.birthTime || '12:00'}:00Z`).getTime();
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  // UTC offset (ms) in force at a UTC instant: the pre-1970 corrections where they
  // apply (historicalOffsetSeconds), otherwise the browser's own time zone data.
  const offsetAt = (utc) => {
    const historical = historicalOffsetSeconds(timeZone, utc / 1000, Number(chart.longitude));
    if (historical != null) return historical * 1000;
    const parts = format.formatToParts(new Date(utc)).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    const year = Number(parts.year);
    return Date.UTC(year, Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - utc;
  };
  let guess = wallClockAsUTC;
  for (let i = 0; i < 4; i++) guess = wallClockAsUTC - offsetAt(guess);
  return new Date(guess);
}

// ── Pre-1970 time zones ────────────────────────────────────────────────────
// The browser's time zone data is exact from 1970 on but not before (see
// tools/build-tz-history.py): it gives some places another city's history, and it
// uses the main city's local mean time (LMT) for every place in the zone. For a
// birth before 1970 this returns the UTC offset in seconds from tz-history.js:
//   - before standard time was adopted there, the birthplace's own local mean
//     time, from its longitude (4 minutes per degree east of Greenwich);
//   - in zones with a separate pre-1970 history, that history;
// or null to use the browser's data.
function historicalOffsetSeconds(timeZone, utcSeconds, longitude) {
  if (typeof TZ_HISTORY === 'undefined' || !(utcSeconds < 0)) return null;
  const localMeanTime = Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? Math.round(longitude * 240) : null;
  const periods = TZ_HISTORY.zones[timeZone];
  if (periods) {
    const period = periods.find(([until]) => utcSeconds < until);
    if (period) return period[1] ?? localMeanTime;
    return null;
  }
  const lmtUntil = TZ_HISTORY.lmtUntil[timeZone];
  return lmtUntil != null && utcSeconds < lmtUntil ? localMeanTime : null;
}

// Full IANA zone list, read from Intl itself at runtime rather than
// hand-maintained (see the comment block above ensureEditDialog() in
// editing.js for the same list, captured for reference/offline reading).
const ALL_TIMEZONES = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []).concat('UTC');
function timezoneOptionsMarkup(selectedValue) {
  return ALL_TIMEZONES.map(zone => `<option value="${zone}" ${zone === selectedValue ? 'selected' : ''}>${zone}</option>`).join('');
}

// ── Design time ────────────────────────────────────────────────────────
// Human Design's "design" moment isn't a flat 88 days before birth — it's
// the moment the Sun was exactly 88° of ecliptic longitude *behind* wherever
// it sits at birth (traditionally described as "~88-90 days" because the
// Sun's real daily motion isn't perfectly constant, so the exact day count
// varies chart to chart). Solved by fixed-point iteration rather than a
// closed-form formula (none exists once real ephemeris motion is in play):
// guess a time using the Sun's MEAN angular speed, check how far the Sun's
// REAL position at that guess actually is from the 88°-behind target, and
// correct the guess by that remaining error. Converges in only a handful of
// iterations since solar motion is very nearly uniform (varies roughly ±1%
// across the year from Earth's orbital eccentricity), so even a rough first
// guess lands close.
const DESIGN_OFFSET_DEGREES = 88;
const MEAN_YEAR_DAYS = 365.2425; // Gregorian mean year — self-correcting either way (see below), but this is the real constant.
function designTimeFor(chart) {
  const sun = chart.positions.find(position => position.name === 'Sun');
  const birthMoment = chartBirthMomentUTC(chart).getTime();
  // Guard: designTimeFor also runs during app.js's own synchronous bootstrap
  // (building the 10 sample charts for a brand-new user), before timeline.js —
  // which defines positionAngleAtTime — has loaded. Rather than store an
  // approximation, it leaves the design time empty (null); normalizePositionModel
  // (editing.js) fills it in with the real 88°-arc solve later on that same load,
  // and it's saved from then on.
  if (!sun || typeof positionAngleAtTime !== 'function') return null;

  const sunDegreesAt = time => positionAngleAtTime(sun, (time - birthMoment) / 60000);
  const targetSunDegrees = ((sunDegreesAt(birthMoment) - DESIGN_OFFSET_DEGREES) % 360 + 360) % 360;
  const signedAngleTo = (fromDegrees, toDegrees) => ((toDegrees - fromDegrees + 540) % 360) - 180; // shortest signed step, (-180, 180]

  // Epsilon: 1e-5 (the spec's suggested value) turns out to sit below the
  // floating-point noise floor of the real-ephemeris Sun lookup itself —
  // traced iteration-by-iteration before shipping this, and past iteration
  // ~3 the remaining error stops shrinking and just oscillates between two
  // adjacent representable values around 1e-4-1e-3°, forever short of 1e-5.
  // 1e-3° (~3.6 arcsec, a few seconds of solar-time equivalent) is the
  // tightest threshold that actually converges cleanly rather than always
  // exhausting the iteration cap for no further gain.
  const epsilonDegrees = 1e-3;
  let currentTime = birthMoment;
  let currentSunDegrees = sunDegreesAt(birthMoment);
  for (let iteration = 0; iteration < 12; iteration++) {
    const daysStep = signedAngleTo(currentSunDegrees, targetSunDegrees) / 360 * MEAN_YEAR_DAYS;
    const newTime = currentTime + daysStep * 86400000;
    const newSunDegrees = sunDegreesAt(newTime);
    if (Math.abs(signedAngleTo(newSunDegrees, targetSunDegrees)) < epsilonDegrees) return new Date(newTime).toISOString();
    currentTime = newTime;
    currentSunDegrees = newSunDegrees;
  }
  return new Date(currentTime).toISOString(); // safety net: best guess if 12 iterations weren't enough
}
// The Timeline Explorer reuses the exact same "chart" shape (birthDate/birthTime
// drive makePositions' seeded PRNG) so the shared explorer surface never has to
// know whether it's showing a real chart or the current moment.
function createTimelineReferenceChart() {
  const now = new Date();
  const chart = {
    id: 'timeline-now',
    name: 'Current moment',
    location: 'Wherever you are',
    birthDate: now.toISOString().slice(0, 10),
    birthTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    uncertainty: 0,
    latitude: '0.0000',
    longitude: '0.0000',
    tags: [],
    notes: 0,
    noteText: '',
    positions: [],
    designTime: null,
    createdAt: Date.now(),
  };
  chart.positions = makePositions(chart);
  chart.designTime = designTimeFor(chart);
  return chart;
}
function resetTimelineToNow() {
  timelineReferenceChart = createTimelineReferenceChart();
}
function currentExplorerChart() {
  if (explorerMode === 'timeline') {
    if (!timelineReferenceChart) resetTimelineToNow();
    return timelineReferenceChart;
  }
  return chartById(selectedChartId) || activeCharts()[0];
}
function timelineOriginLabel() {
  return explorerMode === 'timeline' ? 'Current moment' : 'Birth moment';
}
// Shared "offset from origin" label text for every timeline slider in the app
// (Astrology, Human Design bodygraph/mandala, Gene Keys) — at 0 it's the origin
// label itself, otherwise "+N <unit> from birth/now" depending on explorerMode.
// The unit itself (minute/hour/day/week/month/year) scales with the offset via
// formatTimelineSpan (timeline.js) — the same picker the zoom end-caps use —
// so a multi-month offset reads as "+3 months" instead of "+129600 min".
function timelineOffsetLabel(offsetMinutes) {
  if (offsetMinutes === 0) return timelineOriginLabel();
  const sign = offsetMinutes > 0 ? '+' : '-';
  const magnitude = typeof formatTimelineSpan === 'function' ? formatTimelineSpan(offsetMinutes) : `${Math.abs(offsetMinutes)} min`;
  return `${sign}${magnitude} from ${explorerMode === 'timeline' ? 'now' : 'birth'}`;
}
function oppositePosition(position, name, glyph) {
  const angle = (SIGNS.indexOf(position.sign) * 30 + position.degree + 180) % 360;
  return {
    name,
    glyph,
    sign: SIGNS[Math.floor(angle / 30)],
    degree: angle % 30,
    speed: position.speed,
    direction: position.direction,
    house: ((position.house + 5) % 12) + 1,
    design: position.design,
  };
}
function makePositions(chart) {
  // Stamped onto every position so positionAngleAtTime (timeline.js) can
  // anchor a real ephemeris lookup to an absolute moment when EPHEMERIS_ENGINE
  // is 'astronomy-engine' — see ephemeris.js. A real UTC ISO string (not a
  // naive local one), via chartBirthMomentUTC, so `new Date(birthMoment)`
  // resolves to the same real instant no matter which timezone the viewing
  // browser happens to be running in.
  const birthMoment = chartBirthMomentUTC(chart).toISOString();
  const random = seeded(chart.id + chart.birthDate + chart.birthTime);
  const base = PLANETS.map(([name, glyph, defaultSign], index) => {
    const angle = Math.round(random() * 3600) / 10;
    const sign = SIGNS[Math.floor(angle / 30)];
    const degree = angle % 30;
    const speed = Number((random() * 1.8 - 0.45).toFixed(2));
    return {
      name,
      glyph,
      sign,
      degree,
      speed,
      direction: Math.abs(speed) < 0.08 ? 'stationary' : speed < 0 ? 'retrograde' : 'direct',
      house: Math.floor(random() * 12) + 1,
      design: index % 3 === 0,
    };
  });
  const sun = base.find((position) => position.name === 'Sun');
  const northNode = base.find((position) => position.name === 'North Node');
  return base.concat([
    oppositePosition(sun, 'Earth', '⊕'),
    oppositePosition(northNode, 'South Node', '☋'),
    {
      name: 'Ascendant',
      glyph: 'Asc',
      sign: SIGNS[Math.floor(random() * 12)],
      degree: Number((random() * 30).toFixed(1)),
      house: 1,
      speed: 0,
      direction: 'direct',
      design: false,
    },
    {
      name: 'Midheaven',
      glyph: 'MC',
      sign: SIGNS[Math.floor(random() * 12)],
      degree: Number((random() * 30).toFixed(1)),
      house: 10,
      speed: 0,
      direction: 'direct',
      design: false,
    },
    {
      name: 'Lilith',
      glyph: '⚸',
      sign: 'Scorpio',
      degree: 17.4,
      house: 8,
      speed: -0.06,
      direction: 'retrograde',
      design: true,
    },
    {
      name: 'Fortuna',
      glyph: '⊗',
      sign: 'Libra',
      degree: 4.8,
      house: 7,
      speed: 0,
      direction: 'direct',
      design: false,
    },
    {
      name: 'Vertex',
      glyph: 'Vx',
      sign: 'Gemini',
      degree: 21.2,
      house: 3,
      speed: 0,
      direction: 'direct',
      design: false,
    },
  // latitude/longitude ride along the same way, for the same reason — the
  // real Ascendant/Midheaven computation (ephemeris.js) needs the birth
  // location, and only has the position object to work with, not the chart.
  ]).map(position => ({...position, birthMoment, latitude: chart.latitude, longitude: chart.longitude}));
}
function makeChart(index, overrides = {}) {
  let iso;
  if (overrides.birthDate) {
    iso = overrides.birthDate;
  } else {
    // In UTC, so the sample birth dates don't shift by a day with the browser's time zone.
    const date = new Date(Date.UTC(1982, 1, 1));
    date.setUTCDate(date.getUTCDate() + index * 617);
    iso = date.toISOString().slice(0, 10);
  }
  const tagSets = [['personal', 'creative'], ['study'], ['family'], ['work'], ['uncertain']];
  const chart = {
    id: 'chart-' + index + '-' + Date.now(),
    name:
      FIRST_NAMES[index % FIRST_NAMES.length] + ' ' + LAST_NAMES[(index + 2) % LAST_NAMES.length],
    birthDate: iso,
    birthTime:
      String(7 + ((index * 3) % 12)).padStart(2, '0') +
      ':' +
      String((index * 17) % 60).padStart(2, '0'),
    uncertainty: index === 4 ? 30 : 0,
    ...SAMPLE_CITIES[index % SAMPLE_CITIES.length],
    tags: tagSets[index % tagSets.length],
    notes: index % 3 === 0 ? 2 : 0,
    positions: [],
    designTime: null,
    createdAt: Date.now(),
    ...overrides,
  };
  chart.positions = makePositions(chart);
  chart.designTime = designTimeFor(chart);
  return chart;
}
// A new library starts empty; "Add 3 sample charts" (shown while it's empty) fills it in.
function initialState() {
  return {
    theme: 'light',
    activeWorkspace: 'Personal',
    workspaces: [{ name: 'Personal', chartIds: [] }],
    charts: [],
    samplesRemoved: true,
  };
}
// One-time clean-up for libraries saved before samples became optional: removes the ten
// built-in sample charts from every workspace, and records that it's done so samples
// added later (Add 3 sample charts) are kept. Runs during loadState, so it declares
// what it needs itself.
function removeBuiltInSamples(saved) {
  if (saved.samplesRemoved) return saved;
  // The built-in samples' ids ("chart-<index>-<timestamp>", from makeChart). Charts people
  // create ("chart-<timestamp>") or import ("chart-<timestamp>-<random>") never match.
  const SAMPLE_CHART_ID = /^chart-\d{1,2}-\d{13}$/;
  const samples = new Set(saved.charts.filter((chart) => SAMPLE_CHART_ID.test(chart.id)).map((chart) => chart.id));
  return {
    ...saved,
    charts: saved.charts.filter((chart) => !samples.has(chart.id)),
    workspaces: saved.workspaces.map((workspace) => ({ ...workspace, chartIds: workspace.chartIds.filter((id) => !samples.has(id)) })),
    samplesRemoved: true,
  };
}
function addSampleCharts() {
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const samples = [0, 1, 2].map((index) => makeChart(index));
  samples.forEach((chart) => {
    state.charts.push(chart);
    workspace.chartIds.push(chart.id);
  });
  selectedChartId = samples[0].id;
  saveState();
  renderRows();
  showToast('3 sample charts added');
}
// ── Untrusted text ─────────────────────────────────────────────────────────
// Chart and workspace text is typed by the user or imported from a file, so it's
// escaped wherever it's placed into HTML: it always shows as text, never as markup.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
// Brings a chart from outside (an imported file, or browser storage) into a known shape:
// plain-text fields of sensible length, a well-formed date/time and coordinates, a safe
// id (it's used in attributes and links), and positions the app itself derives from the
// birth data. `fromFile` rebuilds the positions outright, since a file's can't be trusted;
// stored charts keep theirs unless they're malformed. Returns null if the chart can't be
// used (no valid birth date). Runs during loadState, before most of this file's
// constants exist, so it only relies on functions and the constants declared above it.
function sanitizeChart(raw, { fromFile = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const SAFE_CHART_ID = /^[A-Za-z0-9._-]{1,80}$/;
  const text = (value, max = 120) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const number = (value, min, max) => {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const birthDate = text(raw.birthDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(new Date(`${birthDate}T12:00:00Z`).getTime())) return null;
  const birthTime = text(raw.birthTime, 5);
  const chart = {
    ...raw,
    id: SAFE_CHART_ID.test(String(raw.id)) ? String(raw.id) : `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: text(raw.name) || 'Untitled chart',
    birthDate,
    birthTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime) ? birthTime : '',
    location: text(raw.location),
    timezone: text(raw.timezone, 64),
    // Coordinates are stored as the app writes them (text like "38.7223"); a valid one is
    // kept exactly as it is, an invalid one cleared.
    latitude: number(raw.latitude, -90, 90) == null ? null : raw.latitude,
    longitude: number(raw.longitude, -180, 180) == null ? null : raw.longitude,
    uncertainty: number(raw.uncertainty, 0, 1440) || 0,
    notes: number(raw.notes, 0, 100000) || 0,
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((tag) => text(tag, 40)).filter(Boolean).slice(0, 12),
    createdAt: number(raw.createdAt, 0, 8.64e15) || Date.now(),
  };
  // Where the Cycle Explorer casts this chart's transits (cycle-moment.js); `off`: at the birthplace for now.
  const transit = raw.transitPlace;
  if (transit && number(transit.lat, -90, 90) != null && number(transit.lon, -180, 180) != null) {
    chart.transitPlace = { name: text(transit.name), lat: Number(transit.lat), lon: Number(transit.lon), zone: text(transit.zone, 64), ...(transit.off ? { off: true } : {}) };
  } else delete chart.transitPlace;
  const origin = raw.localSpaceOrigin;
  if (origin && number(origin.lat, -90, 90) != null && number(origin.lon, -180, 180) != null) chart.localSpaceOrigin = { lat: Number(origin.lat), lon: Number(origin.lon) };
  else delete chart.localSpaceOrigin;
  // Saved map locations from before life events: valid lat/lon pairs, kept only until
  // migrateChartLocations turns them into place records in the chart's workspace.
  const locations = (Array.isArray(raw.acgLocations) ? raw.acgLocations : [])
    .filter((location) => location && number(location.lat, -90, 90) != null && number(location.lon, -180, 180) != null)
    .slice(0, 200).map((location) => ({ lat: Number(location.lat), lon: Number(location.lon) }));
  if (locations.length) chart.acgLocations = locations;
  else delete chart.acgLocations;
  if (typeof chart.designTime !== 'string' || Number.isNaN(new Date(chart.designTime).getTime())) chart.designTime = null;
  // Positions: the app's own, derived from the birth data. A stored chart's are kept when
  // every entry is one the app would produce (same body names, glyphs and shape).
  const derived = makePositions(chart);
  const known = new Map(derived.map((position) => [position.name, position.glyph]));
  const wellFormed = Array.isArray(raw.positions) && raw.positions.length > 0 && raw.positions.every((position) =>
    position && known.get(position.name) === position.glyph && SIGNS.includes(position.sign) && Number.isFinite(position.degree));
  if (fromFile || !wellFormed) {
    chart.positions = derived;
    if (fromFile) chart.designTime = null;
  }
  return chart;
}
// ── Life events (records) ──────────────────────────────────────────────────
// A record is a moment, a period, a place, or a dated event at a place, belonging to
// one workspace (workspace.events) and linked to one or more of its charts:
//   { id, title, kind, start?: {date, time}, end?: {date, time}, zone,
//     place?: {name, lat, lon}, tags: [], notes, people: [{chartId, name, role}],
//     createdAt, updatedAt }
// Dates are "YYYY", "YYYY-MM" or "YYYY-MM-DD" (their length is the precision); a time
// ("HH:MM", local to `zone`) only goes with a full date. A person whose chart isn't in
// the workspace keeps just a name (chartId null), shown as an unnamed/unlinked person.
// An annotation of a computed moment has an `anchor` instead of dates —
// { chartId, cycle: "saturn-return", n: 1 } (a chart's nth return or opposition) or
// { chartId, birth: true } — whose date (and, for birth, place) always come from the
// chart; a cycle's annotation holds only a place, tags and notes, birth's tags, notes
// and the people present. An anchor to a chart that isn't in the workspace drops it.
// Like sanitizeChart, this runs during loadState, so it declares what it needs itself.
function sanitizeEvent(raw, chartIds, chartNames = new Map()) {
  if (!raw || typeof raw !== 'object') return null;
  const SAFE_ID = /^[A-Za-z0-9._-]{1,80}$/;
  const text = (value, max = 120) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const number = (value, min, max) => {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const moment = (value) => {
    if (!value || typeof value !== 'object') return null;
    const date = text(value.date, 10);
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date);
    if (!match) return null;
    const [, year, month, day] = match.map((part) => (part === undefined ? undefined : Number(part)));
    if (year < 1000 || year > 2999 || (month !== undefined && (month < 1 || month > 12))) return null;
    if (day !== undefined && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())) return null;
    const time = text(value.time, 5);
    return { date, time: day !== undefined && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '' };
  };
  const start = moment(raw.start);
  let end = start ? moment(raw.end) : null;
  // A period ends after it starts (compared as text: "1990" < "1990-05" < "1990-05-12").
  if (end && `${end.date}T${end.time}` < `${start.date}T${start.time}`) end = null;
  const place = raw.place && number(raw.place.lat, -90, 90) != null && number(raw.place.lon, -180, 180) != null
    ? { name: text(raw.place.name, 160), lat: Number(raw.place.lat), lon: Number(raw.place.lon) } : null;
  let anchor = null;
  if (raw.anchor != null) {
    const owner = raw.anchor && typeof raw.anchor.chartId === 'string' && chartIds.has(raw.anchor.chartId) ? raw.anchor.chartId : null;
    const n = Number(raw.anchor?.n);
    if (owner && raw.anchor.birth === true) anchor = { chartId: owner, birth: true };
    else if (owner && /^[a-z-]{1,40}$/.test(String(raw.anchor.cycle)) && Number.isInteger(n) && n >= 1 && n <= 50) anchor = { chartId: owner, cycle: String(raw.anchor.cycle), n };
    if (!anchor) return null;
  }
  if (!start && !place && !anchor) return null;
  const seen = new Set();
  const people = (Array.isArray(raw.people) ? raw.people : []).slice(0, 50).map((person) => {
    if (!person || typeof person !== 'object') return null;
    const linked = typeof person.chartId === 'string' && chartIds.has(person.chartId) ? person.chartId : null;
    const name = text(person.name) || (person.chartId && chartNames.get(person.chartId)) || '';
    if (linked ? seen.has(linked) : !name) return null;
    if (linked) seen.add(linked);
    return { chartId: linked, name: linked ? '' : name, role: text(person.role, 40) };
  }).filter(Boolean);
  const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map((tag) => text(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 30);
  const event = {
    id: raw.id != null && SAFE_ID.test(String(raw.id)) ? String(raw.id) : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: text(raw.title),
    kind: /^[a-z-]{1,40}$/.test(String(raw.kind)) ? String(raw.kind) : '',
    zone: text(raw.zone, 64),
    tags,
    // Notes keep their line breaks (and tabs); other control characters are dropped.
    notes: (typeof raw.notes === 'string' ? raw.notes : '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 5000),
    people,
    createdAt: number(raw.createdAt, 0, 8.64e15) || Date.now(),
    updatedAt: number(raw.updatedAt, 0, 8.64e15) || Date.now(),
  };
  if (anchor) {
    event.anchor = anchor;
    event.title = ''; event.kind = ''; event.zone = '';
    if (anchor.cycle) {
      event.people = [{ chartId: anchor.chartId, name: '', role: '' }];
      if (place) event.place = place;
    } else if (!event.people.some((person) => person.chartId === anchor.chartId)) {
      event.people.unshift({ chartId: anchor.chartId, name: '', role: '' });
    }
    return event;
  }
  if (start) event.start = start;
  if (end) event.end = end;
  if (place) event.place = place;
  return event;
}
// Turns a chart's old saved map locations (chart.acgLocations) into place records in
// `workspace`, linked to the chart, and removes them from the chart.
function migrateChartLocations(chart, workspace) {
  if (!chart.acgLocations) return;
  workspace.events = workspace.events || [];
  chart.acgLocations.forEach((location, index) => {
    workspace.events.push({
      id: `event-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      title: '', kind: 'place', zone: '', tags: [], notes: '',
      place: { name: '', lat: location.lat, lon: location.lon },
      people: [{ chartId: chart.id, name: '', role: '' }],
      createdAt: Date.now() + index, updatedAt: Date.now() + index,
    });
  });
  delete chart.acgLocations;
}

// The whole saved state: every chart cleaned (unusable ones dropped), workspace names as
// plain text, and workspace chart lists pointing only at charts that exist.
function sanitizeState(saved) {
  const renamed = new Map();
  const charts = (Array.isArray(saved.charts) ? saved.charts : []).map((raw) => {
    const chart = sanitizeChart(raw);
    if (chart && raw.id !== chart.id) renamed.set(raw.id, chart.id);
    return chart;
  }).filter(Boolean);
  const ids = new Set(charts.map((chart) => chart.id));
  const workspaces = (Array.isArray(saved.workspaces) ? saved.workspaces : [])
    .map((workspace) => ({
      ...workspace,
      name: String(workspace?.name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60) || 'Workspace',
      chartIds: (Array.isArray(workspace?.chartIds) ? workspace.chartIds : []).map((id) => renamed.get(id) || id).filter((id) => ids.has(id)),
    }));
  if (!workspaces.length) workspaces.push({ name: 'Personal', chartIds: [...ids] });
  // Each workspace's records link only to its own charts; old saved map locations
  // become place records in the (first) workspace holding their chart.
  const chartNames = new Map(charts.map((chart) => [chart.id, chart.name]));
  const chartsById = new Map(charts.map((chart) => [chart.id, chart]));
  workspaces.forEach((workspace) => {
    const members = new Set(workspace.chartIds);
    const renamedPeople = (event) => ({ ...event, anchor: event?.anchor ? { ...event.anchor, chartId: renamed.get(event.anchor.chartId) || event.anchor.chartId } : undefined, people: (Array.isArray(event?.people) ? event.people : []).map((person) => ({ ...person, chartId: renamed.get(person?.chartId) || person?.chartId })) });
    workspace.events = (Array.isArray(workspace.events) ? workspace.events : []).map((event) => sanitizeEvent(renamedPeople(event), members, chartNames)).filter(Boolean);
    workspace.chartIds.forEach((id) => migrateChartLocations(chartsById.get(id), workspace));
  });
  const activeWorkspace = workspaces.some((workspace) => workspace.name === saved.activeWorkspace) ? saved.activeWorkspace : workspaces[0].name;
  return { ...saved, charts, workspaces, activeWorkspace };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Any saved state counts, including an empty library.
    if (saved && Array.isArray(saved.charts)) {
      // Cleaning must never cost saved charts: if it fails, keep the data as it was.
      try {
        return removeBuiltInSamples(sanitizeState(saved));
      } catch (error) {
        console.error('Could not clean saved state; using it as stored', error);
        return saved;
      }
    }
  } catch (error) {}
  const fresh = initialState();
  fresh.workspaces[0].chartIds = fresh.charts.map((chart) => chart.id);
  return fresh;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.getElementById('saveState').textContent = 'Saved just now';
  setTimeout(() => (document.getElementById('saveState').textContent = 'All changes saved'), 1400);
}
function activeCharts() {
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const ids = workspace?.chartIds || [];
  return ids.map((id) => state.charts.find((chart) => chart.id === id)).filter(Boolean);
}
function chartById(id) {
  return state.charts.find((chart) => chart.id === id);
}
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date + 'T12:00:00'));
}
function getSun(chart) {
  return chart.positions.find((position) => position.name === 'Sun') || chart.positions[0];
}
// Text as search compares it: lowercase, accents dropped (é, ë, è, ê → e; ç → c; ñ → n;
// ő, ô → o…) by Unicode decomposition, and the letters that don't decompose written
// out (ø → o, ß → ss, æ → ae, ł → l…). Both what's typed and what's searched are folded,
// so "Zurich" finds "Zürich" and "Zürich" finds "Zurich".
const SEARCH_LETTERS = { ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h', ŧ: 't', ŋ: 'n', ĸ: 'k' };
function searchFold(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[øßæœłđðþıħŧŋĸ]/g, (letter) => SEARCH_LETTERS[letter]);
}
function searchMatches(values, query) {
  const term = searchFold(query).trim();
  return !term || values.some((value) => value && searchFold(value).includes(term));
}
function renderRows() {
  const rows = document.getElementById('chartRows');
  const query = document.getElementById('searchInput').value;
  const charts = activeCharts().filter((chart) => searchMatches([[chart.name, chart.location, ...chart.tags].join(' ')], query));
  document.getElementById('chartCount').textContent = activeCharts().length;
  document.getElementById('activeChartStat').textContent = activeCharts().length;
  document.getElementById('tableSummary').textContent =
    `Showing ${charts.length} of ${activeCharts().length} charts`;
  const empty = document.getElementById('emptyState');
  empty.hidden = charts.length > 0;
  // An empty library offers a way to start; an empty search just says so.
  empty.innerHTML = activeCharts().length
    ? 'No charts match this search.'
    : '<p class="empty-title">Your library is empty</p><p>Add a chart of your own, or start with three sample charts to explore.</p><div class="empty-actions"><button type="button" class="secondary-button" data-empty-add>Add chart</button><button type="button" class="primary-button" data-empty-samples>Add 3 sample charts</button></div>';
  empty.querySelector('[data-empty-add]')?.addEventListener('click', openChartDialog);
  empty.querySelector('[data-empty-samples]')?.addEventListener('click', addSampleCharts);
  // Columns and rows for the selected system come from library.js once it has loaded.
  const head = document.getElementById('libraryHead');
  if (head && typeof libraryHeaderMarkup === 'function') head.innerHTML = libraryHeaderMarkup();
  rows.innerHTML = typeof libraryRowMarkup === 'function' ? charts.map(libraryRowMarkup).join('') : '';
  rows.querySelectorAll('tr').forEach((row) =>
    row.addEventListener('click', (event) => {
      // A click anywhere on the row makes it the current chart (J / K move from it, X
      // selects it, ↵ opens it); only Open, the name (a real link) and ↵ open it.
      selectedChartId = row.dataset.id;
      selectedRowIndex = [...rows.children].indexOf(row);
      rows.querySelectorAll('tr').forEach((item) => item.classList.toggle('selected', item === row));
      if (event.target.type === 'checkbox') return;
      // Edit opens the chart's edit dialog (where it can also be deleted).
      if (event.target.closest('[data-library-edit]')) { editChart(chartById(row.dataset.id)); return; }
      // The event count links to the chart's Life Events tab (the router follows it).
      if (event.target.closest('.library-events')) return;
      // The name opens the chart (with a modifier key, the browser's own: a new tab…).
      const link = event.target.closest('a');
      if (link && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
      if (link || event.target.closest('[data-library-open]')) { event.preventDefault(); openExplorer(); }
    }),
  );
  // A double-click on a row opens its chart too (the first click has already selected
  // it), except on its checkbox, buttons and links, which do their own thing.
  rows.querySelectorAll('tr').forEach((row) =>
    row.addEventListener('dblclick', (event) => {
      if (event.target.closest('input, button, a, .library-events')) return;
      window.getSelection()?.removeAllRanges();
      selectedChartId = row.dataset.id;
      openExplorer();
    }),
  );
}
// Sets each item's displayAngle so no two sit closer than minSeparation (or 360/n when
// they couldn't all fit), keeping each crowded run centered on its true angles. The
// circle is cut at its widest empty gap and read as a line; a run that grows into its
// neighbour merges with it and is re-centered, until every run is clear of the next.
function spreadClusteredAngles(items, minSeparation = 6) {
  const count = items.length;
  if (!count) return;
  const separation = Math.min(minSeparation, 360 / count);
  const sorted = [...items].sort((a, b) => a.angle - b.angle);
  let cut = 0, widest = -1;
  sorted.forEach((item, index) => {
    const gap = (index + 1 < count ? sorted[index + 1].angle : sorted[0].angle + 360) - item.angle;
    if (gap > widest) { widest = gap; cut = (index + 1) % count; }
  });
  const line = sorted.map((_, step) => {
    const item = sorted[(cut + step) % count];
    return { item, at: item.angle + (cut + step >= count ? 360 : 0) };
  });
  const start = (run) => run.sum / run.members.length - ((run.members.length - 1) * separation) / 2;
  const runs = [];
  line.forEach((entry) => {
    runs.push({ members: [entry], sum: entry.at });
    while (runs.length > 1) {
      const last = runs[runs.length - 1], previous = runs[runs.length - 2];
      if (start(last) - (start(previous) + (previous.members.length - 1) * separation) >= separation - 1e-9) break;
      previous.members.push(...last.members);
      previous.sum += last.sum;
      runs.pop();
    }
  });
  runs.forEach((run) => {
    const first = start(run);
    run.members.forEach((member, index) => { member.item.displayAngle = (((first + index * separation) % 360) + 360) % 360; });
  });
}
// `ringWidth` is the width of the planet ring inside `inner`; the position tick sits
// just inside that ring's inner edge. `labelled`: under the glyph, reading inward, the
// degree, the sign and the minutes (position.longitude) — for single-chart wheels, whose
// ring is widened to fit them (WHEEL_LABELLED_RING). Their house band
// (WHEEL_HOUSE_BAND) sits inside the ring, and the position ticks stick out of both of
// its edges: outward toward the glyph, inward toward the aspect lines.
function planetMarkerMarkup(cx, cy, inner, position, ringWidth = 34, labelled = false) {
  const trueRad = ((position.angle - 90) * Math.PI) / 180;
  const tx = cx + (inner - 4) * Math.cos(trueRad),
    ty = cy + (inner - 4) * Math.sin(trueRad);
  const tickOuterR = inner - ringWidth,
    tickInnerR = tickOuterR - 6;
  const tickOuterX = cx + tickOuterR * Math.cos(trueRad),
    tickOuterY = cy + tickOuterR * Math.sin(trueRad);
  const tickInnerX = cx + tickInnerR * Math.cos(trueRad),
    tickInnerY = cy + tickInnerR * Math.sin(trueRad);
  const displayRad = ((position.displayAngle - 90) * Math.PI) / 180;
  const glyphR = labelled ? inner - 16 : inner - 19;
  const x = cx + glyphR * Math.cos(displayRad),
    y = cy + glyphR * Math.sin(displayRad);
  // A caller-supplied color (e.g. the Pair Explorer's per-person colors) wins over
  // the birth/design default.
  const color = position.color || (position.design ? 'var(--blue)' : 'var(--accent)');
  const tickLine = (from, to) => `<line x1="${cx + from * Math.cos(trueRad)}" y1="${cy + from * Math.sin(trueRad)}" x2="${cx + to * Math.cos(trueRad)}" y2="${cy + to * Math.sin(trueRad)}" stroke="${color}" stroke-width="1.4" opacity=".85" class="planet-tick"/>`;
  const tick = labelled
    ? tickLine(tickOuterR, tickOuterR + 6) + tickLine(tickOuterR - WHEEL_HOUSE_BAND, tickOuterR - WHEEL_HOUSE_BAND - 6)
    : `<line x1="${tickInnerX}" y1="${tickInnerY}" x2="${tickOuterX}" y2="${tickOuterY}" stroke="${color}" stroke-width="1.4" opacity=".85" class="planet-tick"/>`;
  const leader =
    Math.abs(position.displayAngle - position.angle) > 0.5
      ? `<line x1="${tx}" y1="${ty}" x2="${x}" y2="${y}" stroke="${color}" stroke-width=".6" opacity=".4" stroke-dasharray="1 2"/>`
      : '';
  //<circle cx="${x}" cy="${y}" r="${position.name.length > 8 ? 13 : 12}" fill="var(--panel)" stroke="${color}" stroke-width="2"/>
  // Small subscript after the glyph when the caller marked the body retrograde/stationary.
  const motionMark = position.motion === 'retrograde' ? '℞' : position.motion === 'stationary' ? 'ST' : '';
  const motion = motionMark ? `<text x="${x + 7}" y="${y + 9}" fill="${color}" class="planet-motion">${motionMark}</text>` : '';
  // The transparent circle gives the glyph a round hover/click area, rather than
  // only the thin strokes of the glyph itself.
  return `${tick}${leader}<g class="planet-marker" data-planet="${position.key || position.name}" tabindex="0">
  <circle cx="${x}" cy="${y}" r="10" fill="transparent"/>
  <text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" fill="${color}" class="planet-glyph${labelled && /^[A-Za-z]+$/.test(position.glyph) ? ' planet-glyph-letters' : ''}">${position.glyph}</text>${motion}${labelled ? planetDegreeLabelMarkup(cx, cy, inner - (/^[A-Za-z]+$/.test(position.glyph) ? 5 : 0), displayRad, position.longitude, color) : ''}</g>`;
}
// The labelled ring's width, the house band inside it, and the wider spacing its glyphs
// need to keep the labels apart.
const WHEEL_LABELLED_RING = 76;
const WHEEL_HOUSE_BAND = 18;
const WHEEL_LABELLED_SPREAD = 6.5;
// "20° ♏ 31′" stacked along the glyph's radius, upright — further apart where the
// radius runs across (left and right), since the labels are wider than they're tall.
function planetDegreeLabelMarkup(cx, cy, inner, rad, longitude, color) {
  const { sign, degrees, minutes } = zodiacDegreeParts(longitude);
  const across = Math.abs(Math.cos(rad));
  const at = (offset, widen) => `x="${cx + (inner - offset - widen * across) * Math.cos(rad)}" y="${cy + (inner - offset - widen * across) * Math.sin(rad)}" text-anchor="middle" dominant-baseline="middle"`;
  return `<text ${at(32, 3)} fill="${color}" class="planet-degree">${degrees}°</text>`
    + `<text ${at(45, 6)} class="planet-sign ${SIGN_ELEMENTS[sign]}">${SIGN_GLYPHS[sign]}\uFE0E</text>`
    + `<text ${at(57, 9)} fill="${color}" class="planet-minutes">${String(minutes).padStart(2, '0')}′</text>`;
}
// A longitude as its sign index and whole degrees and minutes within the sign
// (truncated, as ephemerides print them: 29°59′ is never rounded up into the next sign).
function zodiacDegreeParts(longitude) {
  const total = Math.floor((((longitude % 360) + 360) % 360) * 60 + 1e-6);
  return { sign: Math.floor(total / 1800) % 12, degrees: Math.floor((total % 1800) / 60), minutes: total % 60 };
}
// Debug aid: hovering the bodygraph shows which SVG element is under the pointer and
// the x,y coordinates of the SVG.
function ensureAstrologyWheelTooltip() {
  let tooltip = document.getElementById('astrologyWheelHoverTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'astrologyWheelHoverTooltip';
    tooltip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;display:none;white-space:nowrap;background:var(--ink);color:var(--paper);font:10px "DM Mono",monospace;padding:6px 9px;border-radius:3px;box-shadow:0 8px 20px rgba(0,0,0,.25)';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function bindAstrologyWheelTooltip(svg) {
  if (!svg || svg.dataset.hoverDebugBound) return;
  svg.dataset.hoverDebugBound = 'true';
  const tooltip = ensureAstrologyWheelTooltip();
  svg.addEventListener('mousemove', event => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    const target = event.target;
    // event.target is always the innermost shape under the cursor (a <rect>,
    // <polygon>, <text>...), never the <g> wrapper the gate/channel/center ids live
    // on — so this has to walk up the ancestor chain to find the id, not just check
    // target.id directly.
    const idHolder = target.closest('[id]');
    const label = idHolder ? `id: ${idHolder.id}` : target.className && target.className.baseVal ? `class: ${target.className.baseVal}` : `<${target.tagName}>`;
    tooltip.textContent = `${label} · (${svgPoint.x.toFixed(1)},${svgPoint.y.toFixed(1)})`;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.display = 'block';
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// The Chart Explorer's title (the chart picker, from pair.js once loaded) and details
// line. Refreshed whenever the explorer opens, whichever system tab is showing.
function renderExplorerHeader() {
  const chart = currentExplorerChart();
  if (!chart || explorerMode !== 'chart') return;
  if (typeof syncExplorerChartPicker === 'function') syncExplorerChartPicker();
  else document.getElementById('explorerName').textContent = chart.name;
  document.getElementById('explorerMeta').textContent =
    `${formatDate(chart.birthDate)} · ${chart.birthTime || 'Time unknown'}${chart.uncertainty ? ' ± ' + chart.uncertainty + ' min' : ''} · ${chart.location}`;
}
function renderExplorer() {
  const chart = currentExplorerChart();
  if (!chart) return;
  renderExplorerHeader();
  if (typeof updateDisplayedSigns === 'function') updateDisplayedSigns(chart, window.timelineOffsetMinutes || 0);
  const aspects = [
    ['Sun', 'Trine', 'Moon', '2° 14′'],
    ['Venus', 'Opposition', 'Saturn', '4° 06′'],
    ['Mercury', 'Sextile', 'Mars', '1° 48′'],
  ];
  document.getElementById('aspectList').innerHTML = aspects
    .map(
      (item) =>
        `<div class="aspect-row"><span>${item[0]} ${item[1].toLowerCase()} ${item[2]}</span><span>${item[3]}</span></div>`,
    )
    .join('');
  if (typeof refreshExplorerTimeline === 'function') refreshExplorerTimeline(chart);
}
function openExplorer() {
  setView('explorer');
}
function mountExplorerBody(view) {
  const body = document.getElementById('explorerBody');
  const mount = document.getElementById(view === 'timeline' ? 'timelineBodyMount' : 'explorerBodyMount');
  if (body && mount && body.parentElement !== mount) mount.appendChild(body);
}
function setView(view) {
  currentView = view;
  if (view === 'explorer') explorerMode = 'chart';
  if (view === 'timeline') {
    explorerMode = 'timeline';
    resetTimelineToNow();
  }
  document.querySelectorAll('.view').forEach((node) => (node.hidden = true));
  document.getElementById(view + 'View').hidden = false;
  document
    .querySelectorAll('.nav-item')
    .forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  document.getElementById('breadcrumbView').textContent =
    view === 'library'
      ? 'CHART LIBRARY'
      : view === 'explorer'
        ? 'CHART EXPLORER'
        : view === 'cycle'
          ? 'CYCLE EXPLORER'
          : view === 'pair'
            ? 'PAIR EXPLORER'
            : view === 'epoch'
              ? 'EPOCH EXPLORER'
              : 'TIMELINE EXPLORER';
  if (view === 'library') renderRows();
  if (view === 'cycle' && typeof renderCycleExplorer === 'function') renderCycleExplorer();
  if (view === 'pair' && typeof renderPairExplorer === 'function') renderPairExplorer();
  if (view === 'epoch' && typeof renderEpochExplorer === 'function') renderEpochExplorer();
  if (view === 'explorer' || view === 'timeline') {
    mountExplorerBody(view);
    // Life Events belong to a chart, so the Timeline Explorer (the current sky) has none.
    const lifeTab = document.querySelector('[data-explorer-system="Life Events"]');
    if (lifeTab) lifeTab.hidden = view === 'timeline';
    if (view === 'timeline' && typeof activeSystemPanelTab !== 'undefined' && activeSystemPanelTab === 'Life Events') switchExplorerSystem('Astrology');
    renderExplorerHeader();
    // Refresh whichever system tab (Astrology/Human Design/Gene Keys) is currently
    // active, not just Astrology — renderExplorer() alone assumes Astrology-only
    // elements (sunGlyph, aspectList, ...) exist, which isn't true if the surface
    // is currently showing a different tab.
    if (typeof refreshActiveSystemPanel === 'function') refreshActiveSystemPanel();
    else renderExplorer();
  }
}
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
function openChartDialog() {
  const form = document.getElementById('chartForm');
  form.reset();
  // Defaults to the browser's own zone — the most likely starting guess for
  // whoever's filling this in — but reset() won't touch <select> contents
  // (only its selection), so the options need populating on every open.
  form.elements.timezone.innerHTML = timezoneOptionsMarkup(Intl.DateTimeFormat().resolvedOptions().timeZone);
  document.getElementById('chartDialog').showModal();
}
function addChart(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const chart = makeChart(Date.now(), {
    id: 'chart-' + Date.now(),
    name: form.get('name'),
    birthDate: form.get('date'),
    birthTime: form.get('time'),
    timezone: form.get('timezone'),
    location: form.get('location'),
    latitude: form.get('latitude'),
    longitude: form.get('longitude'),
    uncertainty: Number(form.get('uncertainty')) || 0,
    tags: String(form.get('tags') || 'study')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  });
  state.charts.push(chart);
  state.workspaces
    .find((workspace) => workspace.name === state.activeWorkspace)
    .chartIds.push(chart.id);
  selectedChartId = chart.id;
  saveState();
  event.target.closest('dialog').close();
  renderRows();
  showToast(`${chart.name} added to ${state.activeWorkspace}`);
}
function renderWorkspaces() {
  const list = document.getElementById('workspaceList');
  list.innerHTML = state.workspaces
    .map(
      (workspace) =>
        `<button type="button" class="workspace-choice ${workspace.name === state.activeWorkspace ? 'active' : ''}" data-workspace="${escapeHtml(workspace.name)}"><span class="workspace-dot"></span>${escapeHtml(workspace.name)}<small>${workspace.chartIds.length} charts</small></button>`,
    )
    .join('');
  list.querySelectorAll('button').forEach((button) =>
    button.addEventListener('click', () => {
      state.activeWorkspace = button.dataset.workspace;
      saveState();
      document.getElementById('workspaceName').textContent = state.activeWorkspace;
      renderWorkspaces();
      renderRows();
      showToast(`Workspace switched to ${state.activeWorkspace}`);
    }),
  );
}
function exportWorkspace() {
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const events = workspace?.events || [];
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    workspace: state.activeWorkspace,
    charts: activeCharts(),
    events,
  };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  link.download = `orbital-study-${state.activeWorkspace.toLowerCase().replace(/\s+/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  // People without a chart in this workspace travel as names only (unlinked).
  const unlinked = events.filter((event) => event.people.some((person) => !person.chartId)).length;
  showToast(`Workspace exported as JSON${unlinked ? ` · ${unlinked} event${unlinked === 1 ? ' includes' : 's include'} people without a chart here (kept as names only)` : ''}`);
}
function importWorkspace(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  // A CSV of charts from another app goes to its review table (csv-import.js).
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    reader.onload = () => openCsvImport(String(reader.result));
    reader.readAsText(file);
    event.target.value = '';
    return;
  }
  reader.onload = () => {
    try {
      // Duplicates of charts already here are reviewed first (workspace-files.js).
      importWorkspaceFile(JSON.parse(reader.result));
    } catch (error) {
      showToast('Could not read that workspace file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
function init() {
  document.body.classList.toggle('dark', state.theme === 'dark');
  // Developer mode (About dialog): the ephemeris banner and SVG id/coordinate hover readouts.
  document.body.classList.toggle('developer-mode', Boolean(state.developerMode));
  document.getElementById('workspaceName').textContent = state.activeWorkspace;
  renderRows();
  document
    .querySelectorAll('[data-view]')
    .forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  document.getElementById('searchInput').addEventListener('input', renderRows);
  document.getElementById('addChartButton').addEventListener('click', openChartDialog);
  document.getElementById('chartForm').addEventListener('submit', addChart);
  document.getElementById('workspaceButton').addEventListener('click', () => {
    renderWorkspaces();
    document.getElementById('workspaceDialog').showModal();
  });
  document.getElementById('newWorkspaceButton').addEventListener('click', () => {
    const name = prompt('Name this workspace');
    if (name && !state.workspaces.some((item) => item.name === name)) {
      state.workspaces.push({ name, chartIds: [] });
      state.activeWorkspace = name;
      saveState();
      document.getElementById('workspaceName').textContent = name;
      renderWorkspaces();
      renderRows();
    }
  });
  document.getElementById('exportButton').addEventListener('click', exportWorkspace);
  document
    .getElementById('importButton')
    .addEventListener('click', () => document.getElementById('importInput').click());
  document.getElementById('importInput').addEventListener('change', importWorkspace);
  document.getElementById('themeButton').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('dark', state.theme === 'dark');
    saveState();
  });
  document
    .getElementById('shortcutsButton')
    .addEventListener('click', () => document.getElementById('shortcutsDialog').showModal());
  document
    .getElementById('closeShortcuts')
    .addEventListener('click', () => document.getElementById('shortcutsDialog').close());
  document.getElementById('aboutButton').addEventListener('click', () => document.getElementById('aboutDialog').showModal());
  document.getElementById('closeAbout').addEventListener('click', () => document.getElementById('aboutDialog').close());
  const developerToggle = document.getElementById('developerModeToggle');
  developerToggle.checked = Boolean(state.developerMode);
  developerToggle.addEventListener('change', () => {
    state.developerMode = developerToggle.checked;
    document.body.classList.toggle('developer-mode', state.developerMode);
    saveState();
    if (typeof updateEphemerisDebugBar === 'function') updateEphemerisDebugBar();
  });
  document.getElementById('timelineToday').addEventListener('click', () => {
    resetTimelineToNow();
    if (typeof refreshActiveSystemPanel === 'function') refreshActiveSystemPanel();
    else renderExplorer();
    showToast('Timeline reset to the current moment');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '?' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      document.getElementById('shortcutsDialog').showModal();
    }
    if (
      event.key.toLowerCase() === 'n' &&
      currentView === 'library' &&
      document.activeElement.tagName !== 'INPUT'
    ) {
      event.preventDefault();
      openChartDialog();
    }
    if (event.key === 'Escape') {
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    }
    // ↵ opens the current chart (selected or not), unless it's pressing a focused
    // button or link, or typing in a field (a checkbox is fine).
    const focused = document.activeElement;
    if (
      event.key === 'Enter' &&
      currentView === 'library' &&
      selectedChartId &&
      !document.querySelector('dialog[open]') &&
      !['BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(focused.tagName) &&
      !(focused.tagName === 'INPUT' && focused.type !== 'checkbox')
    ) {
      event.preventDefault();
      openExplorer();
    }
  });
}
init();
