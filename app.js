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
  let guess = wallClockAsUTC;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(guess)).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
    const shownAsUTC = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`).getTime();
    guess = wallClockAsUTC - (shownAsUTC - guess);
  }
  return new Date(guess);
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
  // Guard: designTimeFor runs during app.js's own synchronous bootstrap (building
  // the 10 sample charts for a brand-new user, before timeline.js — which defines
  // positionAngleAtTime — has even loaded). Falls back to the old flat approximation
  // for that one moment; normalizePositionModel (editing.js) unconditionally
  // recomputes every chart's designTime once the full app is loaded, so this
  // placeholder never survives past the very first paint.
  if (!sun || typeof positionAngleAtTime !== 'function') return new Date(birthMoment - 88 * 86400000).toISOString();

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
      glyph: '⊕',
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
    const date = new Date(1982, 1, 1);
    date.setDate(date.getDate() + index * 617);
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
    location: [
      'Lisbon, Portugal',
      'Oslo, Norway',
      'Austin, USA',
      'Kyoto, Japan',
      'Cape Town, South Africa',
    ][index % 5],
    latitude: (-30 + index * 11.7).toFixed(4),
    longitude: (-120 + index * 23.4).toFixed(4),
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
function initialState() {
  return {
    theme: 'light',
    activeWorkspace: 'Personal',
    workspaces: [{ name: 'Personal', chartIds: [] }],
    charts: Array.from({ length: 10 }, (_, i) => makeChart(i)),
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.charts?.length) return saved;
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
function renderRows() {
  const rows = document.getElementById('chartRows');
  const query = document.getElementById('searchInput').value.toLowerCase();
  const charts = activeCharts().filter((chart) =>
    [chart.name, chart.location, ...chart.tags].join(' ').toLowerCase().includes(query),
  );
  document.getElementById('chartCount').textContent = activeCharts().length;
  document.getElementById('activeChartStat').textContent = activeCharts().length;
  document.getElementById('tableSummary').textContent =
    `Showing ${charts.length} of ${activeCharts().length} charts`;
  document.getElementById('emptyState').hidden = charts.length > 0;
  rows.innerHTML = charts
    .map((chart, index) => {
      const sun = getSun(chart);
      const signIndex = SIGNS.indexOf(sun.sign);
      return `<tr data-id="${chart.id}" class="${selectedChartId === chart.id ? 'selected' : ''}"><td class="check-col"><input type="checkbox" aria-label="Select ${chart.name}"></td><td><div class="chart-cell"><div class="mini-wheel"></div><div><div class="chart-name">${chart.name}${chart.uncertainty ? '<span class="date-note">◌ uncertain time ±' + chart.uncertainty + 'm</span>' : ''}</div><div class="chart-type">INDIVIDUAL / ${chart.tags[0]?.toUpperCase() || 'STUDY'}</div></div></div></td><td class="birth-cell">${formatDate(chart.birthDate)}<br><span class="muted-text">${chart.birthTime || 'Time unknown'}</span></td><td class="location-cell">${chart.location}</td><td><div class="signature-cell"><span class="signature-glyph">${SIGN_GLYPHS[signIndex]}</span><div class="signature-text"><strong>${sun.sign}</strong><small>${sun.degree.toFixed(1)}° · House ${sun.house}</small></div></div></td><td class="note-count">${chart.notes ? `▤ ${chart.notes} notes` : '—'}</td><td><button class="row-menu" aria-label="More options">···</button></td></tr>`;
    })
    .join('');
  rows.querySelectorAll('tr').forEach((row) =>
    row.addEventListener('click', (event) => {
      if (event.target.type === 'checkbox' || event.target.closest('.row-menu')) return;
      selectedChartId = row.dataset.id;
      selectedRowIndex = [...rows.children].indexOf(row);
      openExplorer();
    }),
  );
}
function spreadClusteredAngles(items, minSeparation = 6) {
  const sorted = [...items].sort((a, b) => a.angle - b.angle);
  const groups = [];
  sorted.forEach((item) => {
    const group = groups[groups.length - 1];
    const gap = group
      ? Math.min(
          Math.abs(item.angle - group[group.length - 1].angle),
          360 - Math.abs(item.angle - group[group.length - 1].angle),
        )
      : Infinity;
    if (group && gap < minSeparation) group.push(item);
    else groups.push([item]);
  });
  if (groups.length > 1) {
    const first = groups[0][0],
      last = groups[groups.length - 1][groups[groups.length - 1].length - 1];
    if (360 - last.angle + first.angle < minSeparation) groups[0] = groups.pop().concat(groups[0]);
  }
  groups.forEach((group) => {
    const base = group[0].angle;
    const normalized = group.map((item) => {
      let diff = item.angle - base;
      if (diff < -180) diff += 360;
      if (diff > 180) diff -= 360;
      return diff;
    });
    const centerOffset = normalized.reduce((sum, value) => sum + value, 0) / group.length;
    group.forEach((item, index) => {
      const spread =
        group.length === 1
          ? normalized[index]
          : centerOffset + (index - (group.length - 1) / 2) * minSeparation;
      item.displayAngle = (base + spread + 360) % 360;
    });
  });
}
function planetMarkerMarkup(cx, cy, inner, position) {
  const trueRad = ((position.angle - 90) * Math.PI) / 180;
  const tx = cx + (inner - 4) * Math.cos(trueRad),
    ty = cy + (inner - 4) * Math.sin(trueRad);
  const tickOuterR = inner - 34,
    tickInnerR = tickOuterR - 6;
  const tickOuterX = cx + tickOuterR * Math.cos(trueRad),
    tickOuterY = cy + tickOuterR * Math.sin(trueRad);
  const tickInnerX = cx + tickInnerR * Math.cos(trueRad),
    tickInnerY = cy + tickInnerR * Math.sin(trueRad);
  const displayRad = ((position.displayAngle - 90) * Math.PI) / 180;
  const x = cx + (inner - 19) * Math.cos(displayRad),
    y = cy + (inner - 19) * Math.sin(displayRad);
  const color = position.design ? 'var(--blue)' : 'var(--accent)';
  const tick = `<line x1="${tickInnerX}" y1="${tickInnerY}" x2="${tickOuterX}" y2="${tickOuterY}" stroke="${color}" stroke-width="1.4" opacity=".85" class="planet-tick"/>`;
  const leader =
    Math.abs(position.displayAngle - position.angle) > 0.5
      ? `<line x1="${tx}" y1="${ty}" x2="${x}" y2="${y}" stroke="${color}" stroke-width=".6" opacity=".4" stroke-dasharray="1 2"/>`
      : '';
  //<circle cx="${x}" cy="${y}" r="${position.name.length > 8 ? 13 : 12}" fill="var(--panel)" stroke="${color}" stroke-width="2"/>
  return `${tick}${leader}<g class="planet-marker" data-planet="${position.name}" tabindex="0">
  <text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" fill="${color}" class="planet-glyph">${position.glyph}</text></g>`;
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

function renderExplorer() {
  const chart = currentExplorerChart();
  if (!chart) return;
  const sun = getSun(chart),
    signIndex = SIGNS.indexOf(sun.sign);
  if (explorerMode === 'chart') {
    document.getElementById('explorerName').textContent = chart.name;
    document.getElementById('explorerMeta').textContent =
      `${formatDate(chart.birthDate)} · ${chart.birthTime || 'Time unknown'}${chart.uncertainty ? ' ± ' + chart.uncertainty + ' min' : ''} · ${chart.location}`;
  }
  document.getElementById('sunGlyph').textContent = SIGN_GLYPHS[signIndex];
  document.getElementById('sunSign').textContent = sun.sign;
  document.getElementById('sunDegree').textContent =
    `${sun.degree.toFixed(1)}° · ${sun.house}th house`;
  document.getElementById('signatureCopy').textContent =
    `${sun.sign} energy brings a distinctive rhythm to ${explorerMode === 'timeline' ? 'this moment' : 'this chart'}, with the ${explorerMode === 'timeline' ? 'current' : 'birth'} sky held alongside design influences from ${formatDate(chart.designTime.slice(0, 10))}.`;
  document.getElementById('placementList').innerHTML = chart.positions
    .slice(0, 6)
    .map(
      (position) =>
        `<div class="placement"><span class="placement-glyph">${position.glyph}</span><span class="placement-name">${position.name}<small class="placement-house"> · House ${position.house}</small></span><span class="placement-degree">${position.degree.toFixed(1)}° ${position.direction === 'retrograde' ? '℞' : ''}</span></div>`,
    )
    .join('');
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
          : 'TIMELINE EXPLORER';
  if (view === 'library') renderRows();
  if (view === 'cycle' && typeof renderCycleExplorer === 'function') renderCycleExplorer();
  if (view === 'explorer' || view === 'timeline') {
    mountExplorerBody(view);
    // Refresh whichever system tab (Astrology/Human Design/Gene Keys) is currently
    // active, not just Astrology — renderExplorer() alone assumes Astrology-only
    // elements (sunGlyph, placementList, ...) exist, which isn't true if the surface
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
        `<button type="button" class="workspace-choice ${workspace.name === state.activeWorkspace ? 'active' : ''}" data-workspace="${workspace.name}"><span class="workspace-dot"></span>${workspace.name}<small>${workspace.chartIds.length} charts</small></button>`,
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
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: state.activeWorkspace,
    charts: activeCharts(),
  };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  link.download = `astrology-${state.activeWorkspace.toLowerCase().replace(/\s+/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Workspace exported as JSON');
}
function importWorkspace(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.charts)) throw new Error('No charts');
      const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
      imported.charts.forEach((chart) => {
        if (!chart.id || state.charts.some((existing) => existing.id === chart.id))
          chart.id = 'chart-' + Date.now() + '-' + Math.random();
        if (!chart.positions) chart.positions = makePositions(chart);
        if (!chart.designTime) chart.designTime = designTimeFor(chart);
        state.charts.push(chart);
        workspace.chartIds.push(chart.id);
      });
      saveState();
      renderRows();
      showToast(
        `${imported.charts.length} chart${imported.charts.length === 1 ? '' : 's'} imported`,
      );
    } catch (error) {
      showToast('Could not read that workspace file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
function init() {
  document.body.classList.toggle('dark', state.theme === 'dark');
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
    if (
      (event.key === 'j' || event.key === 'k') &&
      currentView === 'library' &&
      document.activeElement.tagName !== 'INPUT'
    ) {
      const charts = activeCharts();
      selectedRowIndex = Math.max(
        0,
        Math.min(charts.length - 1, selectedRowIndex + (event.key === 'j' ? 1 : -1)),
      );
      selectedChartId = charts[selectedRowIndex]?.id;
      renderRows();
    }
    if (
      event.key === 'Enter' &&
      currentView === 'library' &&
      selectedChartId &&
      document.activeElement.tagName !== 'INPUT'
    ) {
      openExplorer();
    }
  });
}
init();
