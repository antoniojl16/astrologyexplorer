// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const ORBITAL_PERIODS = {
  Sun: 1,
  Earth: 1,
  Moon: 1 / 13,
  Mercury: 88 / 365,
  Venus: 225 / 365,
  Mars: 687 / 365,
  Jupiter: 12,
  Saturn: 30,
  Uranus: 84,
  Neptune: 165,
  Pluto: 248,
  'North Node': 18.6,
  'South Node': 18.6,
  Chiron: 50,
  Lilith: 9.3
};
const ANGULAR_PERIODS = {Ascendant: 0.997, Midheaven: 1.01, Fortuna: 0.72};
let houseSystem = 'Placidus';
let zodiacMode = 'Tropical';
// When checked, "Fix Zodiac" stops the wheel from rotating with the Ascendant
// (which sweeps ~360° per day due to Earth's rotation) and instead holds the
// Aries cusp at the wheel's leftmost point, the same way wheelRotation holds
// the Ascendant there when unfixed. Shared by every astrology wheel.
let astroWheelFixedToAries = false;
const LAHIRI_AYANAMSHA = 24;


function positionBaseAngle(position) {
  const tropicalAngle = SIGNS.indexOf(position.sign) * 30 + Number(position.degree || 0);
  return zodiacMode === 'Sidereal' ? (tropicalAngle - LAHIRI_AYANAMSHA + 360) % 360 : tropicalAngle;
}

function displaySignAtTime(position, offsetMinutes = 0) {
  const angle = positionAngleAtTime(position, offsetMinutes);
  const signIndex = Math.floor(angle / 30);
  return {sign: SIGNS[signIndex], degree: angle % 30};
}

function syntheticAngleAtTime(position, offsetMinutes) {
  const baseAngle = positionBaseAngle(position);
  // ORBITAL_PERIODS are in years, ANGULAR_PERIODS in days; both become days here.
  const periodDays = ORBITAL_PERIODS[position.name] ? ORBITAL_PERIODS[position.name] * 365.25 : ANGULAR_PERIODS[position.name] || 0;
  return baseAngle + (periodDays ? offsetMinutes / (periodDays * 1440) * 360 : 0);
}
// Single dispatch point for "where is this body right now": tries the real
// ephemeris (ephemeris.js) first, and falls back to the synthetic
// approximation for anything it doesn't cover (see EPHEMERIS_ENGINE).
// Chiron can only be traced for 1000–2999 (its orbit is chaotic; the ephemeris's states
// start in 1800): outside those years it's left off the wheels, aspects and maps.
const CHIRON_FIRST_YEAR = 1000, CHIRON_LAST_YEAR = 2999;
function bodyShownAt(position, offsetMinutes = 0) {
  if (position.name !== 'Chiron' || position.fixedAngle != null || !position.birthMoment) return true;
  const year = new Date(Date.parse(position.birthMoment) + offsetMinutes * 60000).getUTCFullYear();
  return year >= CHIRON_FIRST_YEAR && year <= CHIRON_LAST_YEAR;
}
function positionAngleAtTime(position, offsetMinutes) {
  // A composite midpoint (pair-composite.js) stays where it is.
  if (position.fixedAngle != null) return position.fixedAngle;
  const real = typeof ephemerisAngleAtTime === 'function' ? ephemerisAngleAtTime(position, offsetMinutes) : null;
  const rawAngle = real == null ? syntheticAngleAtTime(position, offsetMinutes) : (zodiacMode === 'Sidereal' ? real - LAHIRI_AYANAMSHA : real);
  return ((rawAngle % 360) + 360) % 360;
}

// "Placidus" only means real Placidus (realPlacidusHouseCusps, ephemeris.js)
// when the real ephemeris engine is actually driving the Ascendant it's built
// from — under the synthetic engine the Ascendant has no real relationship to
// RAMC/latitude at all, so running real trisection math against it would just
// produce a plausible-looking but meaningless result; the old fixed-span
// approximation (still below) is the honest choice there.
function houseCuspsAtTime(chart, offsetMinutes) {
  if (chart.fixedCusps) return chart.fixedCusps; // (composite midpoint cusps, pair-composite.js)
  const ascendant = chart.positions.find(position => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, offsetMinutes) : 0;
  if (houseSystem === 'Equal Houses') return Array.from({length: 12}, (_, index) => (ascendantAngle + index * 30) % 360);
  if (typeof realPlacidusHouseCusps === 'function' && EPHEMERIS_ENGINE === 'astronomy-engine' && ascendant && ascendant.latitude != null && ascendant.longitude != null) {
    const date = new Date(Date.parse(ascendant.birthMoment) + offsetMinutes * 60000);
    const real = realPlacidusHouseCusps(date, Number(ascendant.latitude), Number(ascendant.longitude));
    if (real) return real;
  }
  const latitudeFactor = Math.min(1, Math.abs(Number(chart.latitude) || 0) / 90);
  const baseSpans = [30, 28, 32, 26, 34, 30, 30, 34, 26, 32, 28, 30];
  const spans = baseSpans.map((span, index) => span + (index % 2 === 0 ? latitudeFactor * 2 : -latitudeFactor * 2));
  const scale = 360 / spans.reduce((sum, span) => sum + span, 0);
  return spans.reduce((cusps, span, index) => {
    const previous = cusps[index - 1] ?? ascendantAngle;
    cusps.push(index === 0 ? ascendantAngle : (previous + spans[index - 1] * scale) % 360);
    return cusps;
  }, []);
}

function formatTimelineSpan(minutes) {
  const absoluteMinutes = Math.abs(minutes);
  const units = [
    ['year', 525600], ['month', 43200], ['week', 10080], ['day', 1440], ['hour', 60], ['minute', 1]
  ];
  const unit = units.find(([, size]) => absoluteMinutes >= size) || units[units.length - 1];
  const amount = absoluteMinutes / unit[1];
  const rounded = Math.round(amount * 10) / 10;
  return `${rounded} ${unit[0]}${rounded === 1 ? '' : 's'}`;
}

// ── Shared timeline slider widget ───────────────────────────────────────
// Every timeline slider in the app (the Astrology wheels, the Human Design bodygraph
// and mandala, the Gene Keys spheres, the maps, the Cycle Explorer) is built from this
// markup and wired up by bindTimelineSlider. It shows a window of time that moves:
//   ‹ › shift it by half its width; dragging the thumb against an end keeps scrolling;
//   a trackpad (or Shift + wheel) scrolls through time; the wheel, Ctrl + wheel and
//   − / ＋ zoom around the thumb; arrow keys step (and carry the window along);
//   clicking the date readout lets you type a date and go straight there.
// Its values stay minutes from the view's origin (birth, now, the cycle moment…),
// which is marked on the track (or, out of view, at the side it's on, with how far),
// and "Back to …" (or double-click, or the 0 shortcut) returns to it. The ticks are
// real dates on the view's clock, labelled with only what changes at that scale.
// The whole range runs from 3000 BC to AD 5000. Dates before 15 October 1582 are in
// the Julian calendar, as historians and astronomers give them; years as "44 BC" /
// "AD 800" / "1066". (Far from today the Moon's exact place and the time of day, and
// with them the angles and houses, grow uncertain: the Earth's rotation, ΔT, is only
// estimated back then. The planets stay sound.)
// Arrow-key step units, largest to smallest (see timelineKeySteps).
const TIMELINE_TICK_UNIT_DEFS = [
  {size: 525600, suffix: 'y'},
  {size: 43200, suffix: 'mo'},
  {size: 10080, suffix: 'w'},
  {size: 1440, suffix: 'd'},
  {size: 60, suffix: 'h'},
  {size: 1, suffix: 'm'},
];
function timelineTickUnit(spanMinutes) {
  return TIMELINE_TICK_UNIT_DEFS.find(def => Math.floor(spanMinutes / def.size) * 2 + 1 >= 4)
    || TIMELINE_TICK_UNIT_DEFS[TIMELINE_TICK_UNIT_DEFS.length - 1];
}
// Arrow-key steps (minutes) for a window 2 × spanMinutes wide. Up to 200 years:
// Shift+arrow moves one unit (year, month, week, day, hour, minute) that fits the
// window about four times, a plain arrow one of the next smaller unit. Longer than
// that, by powers of ten years.
const TIMELINE_YEAR_MINUTES = 525600;
function timelineKeySteps(spanMinutes) {
  const years = (2 * spanMinutes) / TIMELINE_YEAR_MINUTES;
  if (years > 200) {
    const large = 10 ** Math.ceil(Math.log10(years / 200) - 1e-9) * TIMELINE_YEAR_MINUTES;
    return { large, small: large / 10 };
  }
  const index = TIMELINE_TICK_UNIT_DEFS.indexOf(timelineTickUnit(spanMinutes));
  return { large: TIMELINE_TICK_UNIT_DEFS[index].size, small: TIMELINE_TICK_UNIT_DEFS[Math.min(index + 1, TIMELINE_TICK_UNIT_DEFS.length - 1)].size };
}

// ── The slider's clock ──
// Wall-clock time on `zone` (the device's when empty), as a "UTC" millisecond count
// whose getUTC* parts read that clock. `correction` (ms) shifts it for a chart whose
// birth time the app converts differently from the browser (historical zones, local
// mean time), so the birth moment reads exactly as entered.
const TIMELINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIMELINE_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMELINE_MAX_UTC = (() => { const date = new Date(0); date.setUTCFullYear(5000, 11, 31); return date.getTime() + 86340000; })();
// ── Calendar: Julian before 15 October 1582 (Julian day 2299161), Gregorian from then ──
// A wall time's parts (month 0–11, astronomical year: 0 = 1 BC), and back.
const TIMELINE_GREGORIAN_START = 2299161;
function timelineDateParts(wall) {
  const dayMs = 86400000;
  const days = Math.floor(wall / dayMs), time = wall - days * dayMs;
  const jdn = days + 2440588;
  const hours = Math.floor(time / 3600000), minutes = Math.floor((time % 3600000) / 60000);
  const weekday = ((jdn + 1) % 7 + 7) % 7;
  if (jdn >= TIMELINE_GREGORIAN_START) {
    const date = new Date(days * dayMs);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hours, minutes, weekday, julian: false };
  }
  // The formula below needs jdn > −32082 (about 4800 BC); earlier dates (the Epoch
  // Explorer's) go through it shifted by whole 4-year Julian cycles.
  if (jdn < 0) {
    const cycles = Math.ceil(-jdn / TIMELINE_JULIAN_SHIFT_DAYS);
    const parts = timelineDateParts(wall + cycles * TIMELINE_JULIAN_SHIFT_DAYS * dayMs);
    return { ...parts, year: parts.year - cycles * TIMELINE_JULIAN_SHIFT_YEARS, weekday };
  }
  const c = jdn + 32082, d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
  return { year: d - 4800 + Math.floor(m / 10), month: m + 2 - 12 * Math.floor(m / 10), day: e - Math.floor((153 * m + 2) / 5) + 1, hours, minutes, weekday, julian: true };
}
// 4000 Julian years (1000 four-year cycles): a shift that keeps a date Julian.
const TIMELINE_JULIAN_SHIFT_YEARS = 4000;
const TIMELINE_JULIAN_SHIFT_DAYS = (TIMELINE_JULIAN_SHIFT_YEARS / 4) * 1461;
function timelineWallFromParts(year, month, day, hours = 0, minutes = 0) {
  if (year < -4000) {
    const cycles = Math.ceil((-4000 - year) / TIMELINE_JULIAN_SHIFT_YEARS);
    return timelineWallFromParts(year + cycles * TIMELINE_JULIAN_SHIFT_YEARS, month, day, hours, minutes) - cycles * TIMELINE_JULIAN_SHIFT_DAYS * 86400000;
  }
  const a = Math.floor((13 - month) / 12), y = year + 4800 - a, m = month + 1 + 12 * a - 3;
  let jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  if (jdn >= TIMELINE_GREGORIAN_START) {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    jdn = Math.floor(date.getTime() / 86400000) + 2440588;
  }
  return (jdn - 2440588) * 86400000 + (hours * 60 + minutes) * 60000;
}
// The range's ends: 1 January 3000 BC (Julian, with half a day's margin for time zones)
// and 31 December AD 5000.
const TIMELINE_MIN_UTC = timelineWallFromParts(-2999, 0, 1) + 43200000;
function timelineYearLabel(year) {
  return year <= 0 ? `${1 - year} BC` : year < 1000 ? `AD ${year}` : String(year);
}
const timelineZoneFormats = new Map();
// Before 1800 every zone keeps its earliest offset (local mean time), which also keeps
// the browser's calendar out of it.
const TIMELINE_ZONE_FLOOR = Date.UTC(1800, 0, 1);
function timelineZoneOffset(utc, zone) {
  if (utc < TIMELINE_ZONE_FLOOR) return timelineZoneOffset(TIMELINE_ZONE_FLOOR, zone);
  const key = zone || '';
  if (!timelineZoneFormats.has(key)) {
    let format;
    try { format = new Intl.DateTimeFormat('en-US', { ...(zone ? { timeZone: zone } : {}), hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' }); }
    catch { format = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' }); }
    timelineZoneFormats.set(key, format);
  }
  const parts = Object.fromEntries(timelineZoneFormats.get(key).formatToParts(new Date(utc)).map(part => [part.type, part.value]));
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
  const wall = new Date(0);
  wall.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
  wall.setUTCHours(Number(parts.hour) % 24, Number(parts.minute), Number(parts.second), 0);
  return wall.getTime() - (utc - (utc % 1000 + 1000) % 1000);
}
function timelineClock(zone = '', correction = 0) {
  const offset = utc => timelineZoneOffset(utc, zone) + correction;
  return {
    zone, correction,
    wall: utc => utc + offset(utc),
    utc: wall => { const guess = wall - offset(wall); return wall - offset(guess); },
  };
}
// The clock of a chart's own time zone, set so its birth reads as entered.
function chartTimelineClock(chart) {
  if (!chart) return timelineClock();
  const birth = chartBirthMomentUTC(chart).getTime();
  const [year, month, day] = String(chart.birthDate || '').split('-').map(Number);
  const [hour, minute] = String(chart.birthTime || '12:00').split(':').map(Number);
  let correction = 0;
  if (year) {
    const entered = new Date(0);
    entered.setUTCFullYear(year, month - 1, day);
    entered.setUTCHours(hour || 0, minute || 0, 0, 0);
    correction = entered.getTime() - (birth + timelineZoneOffset(birth, chart.timezone));
    if (Math.abs(correction) < 60000) correction = 0;
  }
  return timelineClock(chart.timezone || '', correction);
}
const timelinePad = value => String(value).padStart(2, '0');
function timelineWallLabel(wall, withTime = true) {
  const date = timelineDateParts(wall);
  return `${TIMELINE_MONTHS[date.month]} ${date.day}, ${timelineYearLabel(date.year)}${withTime ? `, ${timelinePad(date.hours)}:${timelinePad(date.minutes)}` : ''}${date.julian ? ' (Julian)' : ''}`;
}
// "Feb 1, 1982, 07:00 GMT+1" (or the zone's name, when its history is the app's own).
function timelineMomentLabel(utc, clock) {
  let zoneName = clock.zone || '';
  if (!clock.correction) {
    try { zoneName = new Intl.DateTimeFormat('en-US', { ...(clock.zone ? { timeZone: clock.zone } : {}), timeZoneName: 'short' }).formatToParts(new Date(Math.max(utc, TIMELINE_ZONE_FLOOR))).find(part => part.type === 'timeZoneName')?.value || zoneName; } catch { /* keep the zone's name */ }
  }
  return `${timelineWallLabel(clock.wall(utc))}${zoneName ? ` ${zoneName}` : ''}`;
}
// The moment `offsetMinutes` after the chart's birth, on the chart's own clock.
function exactChartTime(chart, offsetMinutes) {
  const clock = chartTimelineClock(chart);
  return timelineMomentLabel(chartBirthMomentUTC(chart).getTime() + offsetMinutes * 60000, clock);
}

// ── Ticks ──
// Steps, finest first; the first to leave at most TIMELINE_MAX_TICKS in the window wins.
const TIMELINE_MAX_TICKS = 9;
const TIMELINE_TICK_STEPS = [
  ...[1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720].map(minutes => ({ kind: 'minute', n: minutes, size: minutes })),
  { kind: 'day', n: 1, size: 1440 }, { kind: 'day', n: 2, size: 2880 }, { kind: 'week', n: 1, size: 10080 },
  { kind: 'month', n: 1, size: 43830 }, { kind: 'month', n: 3, size: 131490 }, { kind: 'month', n: 6, size: 262980 },
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].map(years => ({ kind: 'year', n: years, size: years * 525960 })),
];
// [{ utc, top, context }] for the window [fromUtc, toUtc]: `top` is what changes from
// tick to tick at this scale, `context` the larger unit, only where it changes.
function timelineWindowTicks(fromUtc, toUtc, clock) {
  const minutes = (toUtc - fromUtc) / 60000;
  const step = TIMELINE_TICK_STEPS.find(item => minutes / item.size <= TIMELINE_MAX_TICKS) || TIMELINE_TICK_STEPS[TIMELINE_TICK_STEPS.length - 1];
  const from = clock.wall(fromUtc), to = clock.wall(toUtc);
  const dayMs = 86400000;
  const walls = [];
  const first = timelineDateParts(from);
  if (step.kind === 'minute') {
    const size = step.n * 60000;
    for (let wall = Math.ceil(from / size) * size; wall <= to; wall += size) walls.push(wall);
  } else if (step.kind === 'day' || step.kind === 'week') {
    let wall = Math.ceil(from / dayMs) * dayMs;
    if (step.kind === 'week') while (timelineDateParts(wall).weekday !== 1) wall += dayMs;
    else if (step.n === 2 && Math.round(wall / dayMs) % 2) wall += dayMs;
    for (; wall <= to; wall += (step.kind === 'week' ? 7 : step.n) * dayMs) walls.push(wall);
  } else if (step.kind === 'month') {
    let y = first.year, m = first.month;
    for (let guard = 0; guard < 400; guard += 1, m += 1) {
      if (m > 11) { m = 0; y += 1; }
      const wall = timelineWallFromParts(y, m, 1);
      if (wall > to) break;
      if (wall >= from && m % step.n === 0) walls.push(wall);
    }
  } else {
    // Round years (1 BC is year 0, so 500 BC falls on −499: counted as historians do).
    for (let y = Math.floor(first.year / step.n) * step.n; ; y += step.n) {
      const shown = y <= 0 && step.n > 1 ? y + 1 : y;
      const wall = timelineWallFromParts(shown, 0, 1);
      if (wall > to) break;
      if (wall >= from) walls.push(wall);
    }
  }
  let previous = null;
  return walls.map(wall => {
    const at = timelineDateParts(wall);
    const { year: y, month: m, day: d } = at;
    let top, context;
    if (step.kind === 'minute') {
      top = `${timelinePad(at.hours)}:${timelinePad(at.minutes)}`;
      const day = `${TIMELINE_MONTHS[m]} ${d}`;
      context = !previous || previous.year !== y ? `${day}, ${timelineYearLabel(y)}` : previous.day !== d || previous.month !== m ? day : '';
    } else if (step.kind === 'day' || step.kind === 'week') {
      top = step.kind === 'day' && minutes <= 16 * 1440 ? `${TIMELINE_WEEKDAYS[at.weekday]} ${d}` : String(d);
      context = !previous || previous.month !== m || previous.year !== y ? `${TIMELINE_MONTHS[m]} ${timelineYearLabel(y)}` : '';
    } else if (step.kind === 'month') {
      top = TIMELINE_MONTHS[m];
      context = !previous || previous.year !== y ? timelineYearLabel(y) : '';
    } else {
      top = timelineYearLabel(y);
      context = '';
    }
    previous = at;
    return { utc: clock.utc(wall), top, context };
  });
}

function timelineSliderInnerMarkup(labelText, value = 0) {
  return `<div class="timeline-label"><span>${labelText}</span><strong data-timeline-date></strong></div>
    <div class="timeline-exact-row"><button type="button" class="timeline-exact" data-timeline-exact title="Type a date to go to"></button></div>
    <div class="timeline-zoom" data-timeline-zoom><button type="button" class="timeline-center" data-timeline-center title="Back to the view's own moment (0)">Center</button><button type="button" data-timeline-zoom-out aria-label="Show a longer stretch of time" title="Zoom out (longer stretch)">−</button><span data-timeline-span>ZOOM</span><button type="button" data-timeline-zoom-in aria-label="Show a shorter stretch of time" title="Zoom in (shorter stretch)">＋</button></div>
    <div class="timeline-track">
      <button type="button" class="timeline-pan" data-timeline-pan="-1" aria-label="Earlier" title="Earlier (half the window)">‹</button>
      <div class="timeline-rail">
        <input data-timeline-slider type="range" aria-label="${labelText.charAt(0) + labelText.slice(1).toLowerCase()}" min="-1440" max="1440" step="1" value="${value}">
        <div class="timeline-markers" data-timeline-markers hidden></div>
        <div class="timeline-ticks" data-timeline-ticks></div>
      </div>
      <button type="button" class="timeline-pan" data-timeline-pan="1" aria-label="Later" title="Later (half the window)">›</button>
    </div>
    <div class="timeline-ends" data-timeline-ends></div>`;
}
function timelineSliderMarkup(labelText, value = 0) {
  return `<div class="timeline-control">${timelineSliderInnerMarkup(labelText, value)}</div>`;
}
// Fills in the date/exact-time readout the same way for every slider.
function updateTimelineReadout(container, chart, offsetMinutes) {
  container.querySelector('[data-timeline-date]').textContent = timelineOffsetLabel(offsetMinutes);
  container.querySelector('[data-timeline-exact]').textContent = exactChartTime(chart, offsetMinutes);
}
// `container` already holds the markup above. `onChange(offsetMinutes)` redraws the view
// at that offset from the origin; it fires once right away. Options:
//   originLabel — the origin's name (tooltip of its mark); anchorName — short, for
//     "Back to …" ("birth", "now"…); initialSpan — half the window's width, in minutes;
//   originTime (ms) and clock (timelineClock) — the origin as a real moment, and the
//     clock the ticks and typed dates use (default: the explorer chart's birth, on
//     its own clock);
//   initial { value, center, span } — to start where the view was left; onView(state)
//     — told whenever the window or thumb moves (the Cycle Explorer carries it across tabs);
//   markers() — moments to show along the track: [{ from, to, label, color, current }],
//     minutes from the origin (to > from for a period); clicking one goes there;
//   range [fromUtc, toUtc] (ms) — instead of the ephemeris's 3000 BC – AD 5000 (the
//     Epoch Explorer's reaches further back); minSpan — the shortest half-window, in
//     minutes; dateOnly — typed dates have no time of day.
// Returns the range input, with `timeline` = { moveTo(value, recentre), refresh() } for
// views that move it themselves (and redraw its markers).
function bindTimelineSlider(container, { onChange, originLabel = 'Birth moment', anchorName = null, initialSpan = 1440, markers = null, originTime = null, clock = null, initial = null, onView = null, range = null, minSpan = 5, dateOnly = false }) {
  const slider = container.querySelector('[data-timeline-slider]');
  if (!slider) return null;
  // Without an originTime, the origin is the explorer's chart, looked up as it's needed
  // (the Chart and Timeline explorers keep one slider while their chart changes).
  let origin, theClock, name, lowest, highest, MIN_SPAN = minSpan, MAX_SPAN;
  const resolveOrigin = () => {
    const chart = originTime == null ? currentExplorerChart() : null;
    const next = originTime ?? (chart ? chartBirthMomentUTC(chart).getTime() : Date.now());
    if (next === origin && theClock) return false;
    origin = next;
    theClock = clock || chartTimelineClock(chart);
    name = anchorName || (explorerMode === 'timeline' ? 'now' : 'birth');
    // The ephemeris's range, as offsets from the origin.
    lowest = Math.ceil(((range ? range[0] : TIMELINE_MIN_UTC) - origin) / 60000);
    highest = Math.floor(((range ? range[1] : TIMELINE_MAX_UTC) - origin) / 60000);
    MAX_SPAN = Math.max(MIN_SPAN, Math.floor((highest - lowest) / 2));
    return true;
  };
  resolveOrigin();
  let span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, initial?.span || initialSpan));
  let center = initial?.center ?? 0;
  const clampCenter = () => { center = Math.max(lowest + span, Math.min(highest - span, center)); };
  clampCenter();
  slider.min = String(Math.round(center - span));
  slider.max = String(Math.round(center + span));
  slider.value = String(initial?.value ?? 0);
  const tickList = container.querySelector('[data-timeline-ticks]');
  const markerList = container.querySelector('[data-timeline-markers]');
  const ends = container.querySelector('[data-timeline-ends]');
  const spanLabel = container.querySelector('[data-timeline-span]');
  const centerButton = container.querySelector('[data-timeline-center]');
  const nameButton = () => { if (centerButton) { centerButton.textContent = `Back to ${name}`; centerButton.title = `Back to ${originLabel} (0)`; } };
  nameButton();
  const percent = value => ((value - (center - span)) / (2 * span)) * 100;
  const utcOf = value => origin + value * 60000;
  const updateRange = () => {
    clampCenter();
    slider.min = String(Math.round(center - span));
    slider.max = String(Math.round(center + span));
    slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), Number(slider.value))));
    if (spanLabel) spanLabel.textContent = formatTimelineSpan(2 * span).toUpperCase();
    if (tickList) {
      const ticks = timelineWindowTicks(utcOf(center - span), utcOf(center + span), theClock);
      const anchor = percent(0);
      tickList.innerHTML = ticks.map(tick => {
        const at = percent((tick.utc - origin) / 60000);
        const edge = at < 6 ? ' start' : at > 94 ? ' end' : '';
        return `<span class="timeline-tick${edge}" style="left:${at}%"><i></i><b>${tick.top}</b>${tick.context ? `<small>${tick.context}</small>` : ''}</span>`;
      }).join('') + (anchor >= 0 && anchor <= 100 ? `<span class="timeline-anchor" style="left:${anchor}%" title="${escapeHtml(originLabel)}"></span>` : '');
    }
    if (ends) {
      const away = value => formatTimelineSpan(value);
      ends.innerHTML = center - span > 0
        ? `<button type="button" class="timeline-away" data-timeline-back title="Back to ${escapeHtml(originLabel)}">◂ ${escapeHtml(name)} · ${away(center - span)} earlier</button><span></span>`
        : center + span < 0
          ? `<span></span><button type="button" class="timeline-away" data-timeline-back title="Back to ${escapeHtml(originLabel)}">${escapeHtml(name)} · ${away(-(center + span))} later ▸</button>`
          : `<span class="timeline-origin">${escapeHtml(originLabel)}</span>`;
    }
    drawMarkers();
    onView?.({ value: Number(slider.value), center, span });
  };
  const drawMarkers = () => {
    if (!markerList || !markers) return;
    const lo = center - span, hi = center + span;
    const shown = markers().filter(marker => marker.to >= lo && marker.from <= hi);
    markerList.hidden = !shown.length;
    markerList.innerHTML = shown.map(marker => {
      const from = percent(Math.max(lo, marker.from)), to = percent(Math.min(hi, marker.to));
      const band = to - from > 0.8;
      const target = Math.round(band ? (marker.from + marker.to) / 2 : marker.from);
      return `<button type="button" class="timeline-marker${band ? ' band' : ''}${marker.current ? ' current' : ''}" style="left:${band ? from : (from + to) / 2}%;${band ? `width:${to - from}%;` : ''}--marker-color:${marker.color || 'var(--accent)'}" data-marker-offset="${target}" title="${escapeHtml(marker.label)}" aria-label="Move the slider to ${escapeHtml(marker.label)}"></button>`;
    }).join('');
  };
  // Screen readers announce the moment (the date readout), not the raw minute offset.
  const dateReadout = container.querySelector('[data-timeline-date]');
  const change = () => {
    // A new chart in the explorer: a new origin, so the window starts again around it.
    if (resolveOrigin()) { nameButton(); center = Number(slider.value); updateRange(); }
    onChange(Number(slider.value));
    if (dateReadout) slider.setAttribute('aria-valuetext', dateReadout.textContent);
    onView?.({ value: Number(slider.value), center, span });
  };
  // Goes to `value` (clamped to the ephemeris's range), moving the window along only as
  // far as needed, or centring it there (`recentre`).
  const moveTo = (value, recentre = false) => {
    const target = Math.max(lowest, Math.min(highest, Math.round(value)));
    if (recentre) center = target;
    else if (target > center + span) center = target - span;
    else if (target < center - span) center = target + span;
    updateRange();
    slider.value = String(target);
    change();
  };
  const shift = minutes => { center += minutes; const before = center; clampCenter(); moveTo(Number(slider.value) + minutes - (before - center)); };
  const zoomTo = next => {
    const value = Number(slider.value);
    const ratio = Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(next))) / span;
    center = value - (value - center) * ratio;
    span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(next)));
    updateRange();
  };
  markerList?.addEventListener('click', event => {
    const marker = event.target.closest('[data-marker-offset]');
    if (marker) moveTo(Number(marker.dataset.markerOffset));
  });
  container.querySelector('[data-timeline-zoom-out]')?.addEventListener('click', () => zoomTo(span * 2));
  container.querySelector('[data-timeline-zoom-in]')?.addEventListener('click', () => zoomTo(span / 2));
  container.querySelectorAll('[data-timeline-pan]').forEach(button => button.addEventListener('click', () => shift(Number(button.dataset.timelinePan) * span)));
  const recenter = () => moveTo(0, true);
  centerButton?.addEventListener('click', recenter);
  ends?.addEventListener('click', event => { if (event.target.closest('[data-timeline-back]')) recenter(); });
  slider.addEventListener('dblclick', recenter);
  // A trackpad's sideways scroll (or Shift + wheel) moves through time; the wheel zooms.
  container.querySelector('.timeline-track')?.addEventListener('wheel', event => {
    event.preventDefault();
    const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (sideways) shift(Math.round((sideways / 400) * 2 * span));
    else if (event.deltaY) zoomTo(event.deltaY < 0 ? span / 1.5 : span * 1.5);
  }, { passive: false });
  // Holding the thumb against an end keeps the window scrolling that way.
  let dragging = false, scrolling = 0;
  const stopScrolling = () => { clearInterval(scrolling); scrolling = 0; };
  slider.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; stopScrolling(); });
  const edgeScroll = () => {
    const value = Number(slider.value), room = span * 0.01;
    const direction = value >= Number(slider.max) - room ? 1 : value <= Number(slider.min) + room ? -1 : 0;
    if (!dragging || !direction) return stopScrolling();
    if (scrolling) return;
    scrolling = setInterval(() => {
      const edge = Number(direction > 0 ? slider.max : slider.min);
      if (!dragging || Math.abs(Number(slider.value) - edge) > span * 0.01) return stopScrolling();
      center += direction * span * 0.04;
      updateRange();
      slider.value = direction > 0 ? slider.max : slider.min;
      change();
    }, 60);
  };
  // Arrow keys step by the zoom's units (timelineKeySteps), carrying the window along.
  const ARROW_DIRECTIONS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  slider.addEventListener('keydown', event => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const steps = timelineKeySteps(span);
    moveTo(Number(slider.value) + direction * (event.shiftKey ? steps.large : steps.small));
  });
  // Clicking the readout: type a date (on the slider's clock) and go there.
  const exact = container.querySelector('[data-timeline-exact]');
  // (Year, BC/AD, month, day and time fields: the browser's date picker has no BC years.)
  exact?.addEventListener('click', () => {
    if (container.querySelector('[data-timeline-goto]')) return;
    const at = timelineDateParts(theClock.wall(utcOf(Number(slider.value))));
    const form = document.createElement('span');
    form.className = 'timeline-goto';
    form.dataset.timelineGoto = '';
    form.innerHTML = `<input type="number" data-goto="year" min="1" max="${range ? 99999 : 5000}" value="${at.year <= 0 ? 1 - at.year : at.year}" aria-label="Year">
      <select data-goto="era" aria-label="Era"><option value="AD"${at.year > 0 ? ' selected' : ''}>AD</option><option value="BC"${at.year <= 0 ? ' selected' : ''}>BC</option></select>
      <select data-goto="month" aria-label="Month">${TIMELINE_MONTHS.map((month, index) => `<option value="${index}"${index === at.month ? ' selected' : ''}>${month}</option>`).join('')}</select>
      <input type="number" data-goto="day" min="1" max="31" value="${at.day}" aria-label="Day">
      ${dateOnly ? '' : `<input type="time" data-goto="time" value="${timelinePad(at.hours)}:${timelinePad(at.minutes)}" aria-label="Time${theClock.zone ? ` (${theClock.zone})` : ''}">`}
      <button type="button" data-goto="go">Go</button><small>${dateOnly ? '' : `${theClock.zone ? escapeHtml(theClock.zone) : 'your time'} · `}Julian before 15 Oct 1582</small>`;
    exact.hidden = true;
    exact.after(form);
    form.querySelector('[data-goto="year"]').select();
    const close = () => { form.remove(); exact.hidden = false; };
    const go = () => {
      const field = name => form.querySelector(`[data-goto="${name}"]`).value;
      const year = Number(field('year')), day = Number(field('day'));
      if (!Number.isInteger(year) || year < 1 || !Number.isInteger(day) || day < 1 || day > 31) return;
      const [hours, minutes] = (dateOnly ? '12:00' : field('time') || '12:00').split(':').map(Number);
      const wall = timelineWallFromParts(field('era') === 'BC' ? 1 - year : year, Number(field('month')), day, hours || 0, minutes || 0);
      close();
      moveTo((theClock.utc(wall) - origin) / 60000, true);
    };
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); go(); }
      else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    form.querySelector('[data-goto="go"]').addEventListener('click', go);
    form.addEventListener('focusout', () => setTimeout(() => { if (form.isConnected && !form.contains(document.activeElement)) close(); }, 150));
  });
  slider.addEventListener('input', () => { change(); edgeScroll(); });
  updateRange();
  change();
  slider.timeline = { moveTo, refresh: updateRange };
  return slider;
}

// Planet filters for the astrology wheel, grouped like the Astrocartography ones, in
// display order. Earth starts hidden (it's always exactly opposite the Sun); everything
// else starts shown. Remembered for the session.
const WHEEL_FILTER_BODIES = [
  { key: 'Sun', glyph: '☉', group: 'Primary' },
  { key: 'Moon', glyph: '☽', group: 'Primary' },
  { key: 'Mercury', glyph: '☿', group: 'Primary' },
  { key: 'Venus', glyph: '♀', group: 'Primary' },
  { key: 'Mars', glyph: '♂', group: 'Primary' },
  { key: 'Jupiter', glyph: '♃', group: 'Primary' },
  { key: 'Saturn', glyph: '♄', group: 'Primary' },
  { key: 'Uranus', glyph: '♅', group: 'Primary' },
  { key: 'Neptune', glyph: '♆', group: 'Primary' },
  { key: 'Pluto', glyph: '♇', group: 'Primary' },
  { key: 'Ascendant', glyph: 'Asc', group: 'Primary' },
  { key: 'Midheaven', glyph: 'MC', group: 'Primary' },
  { key: 'Lunar Nodes', glyph: '☊', group: 'Secondary', members: ['North Node', 'South Node'] },
  { key: 'Chiron', glyph: '⚷', group: 'Secondary' },
  { key: 'Lilith', glyph: '⚸', group: 'Secondary' },
  { key: 'Fortuna', glyph: '⊗', group: 'Secondary' },
  { key: 'Vertex', glyph: 'Vx', group: 'Secondary' },
];
const wheelHiddenBodies = new Set();
// Earth (always opposite the Sun) is kept for Human Design and Gene Keys, but never
// drawn on an astrology wheel or offered as a filter.
function wheelBodyVisible(name) {
  if (name === 'Earth') return false;
  const body = WHEEL_FILTER_BODIES.find(item => (item.members || [item.key]).includes(name));
  return !body || !wheelHiddenBodies.has(body.key);
}

// ── Wheel hover tooltips ────────────────────────────────────────────────
// \uFE0E asks for the text (not emoji) form of the sign glyph.
function wheelSignText(longitude) {
  const index = Math.floor((((longitude % 360) + 360) % 360) / 30);
  return { glyph: `${SIGN_GLYPHS[index]}\uFE0E`, degree: longitude - index * 30 };
}
function wheelHouseOf(longitude, cusps) {
  for (let index = 0; index < cusps.length; index += 1) {
    const start = cusps[index], end = cusps[(index + 1) % cusps.length];
    const span = (((end - start) % 360) + 360) % 360;
    if ((((longitude - start) % 360) + 360) % 360 < span) return index + 1;
  }
  return null;
}
// Retrograde / stationary, for the bodies where either is meaningful (not the Sun,
// Moon or Earth, which never go retrograde; not the chart angles; not the lunar
// nodes, whose normal motion is backwards). Stationary = daily motion below
// WHEEL_STATION_FRACTION of the body's mean daily motion — about ±1 day around a
// Mercury station, ±3 days for Venus/Mars, ±5 days for the outer planets.
const WHEEL_MEAN_DAILY_MOTION = { Mercury: 0.9856, Venus: 0.9856, Mars: 0.524, Jupiter: 0.0831, Saturn: 0.0335, Uranus: 0.0117, Neptune: 0.006, Pluto: 0.004, Chiron: 0.0195 };
const WHEEL_STATION_FRACTION = 0.1;
function wheelMotion(position, offsetMinutes) {
  const meanMotion = WHEEL_MEAN_DAILY_MOTION[position.name];
  if (!meanMotion || position.fixedAngle != null) return null;
  const dailyMotion = ((positionAngleAtTime(position, offsetMinutes + 720) - positionAngleAtTime(position, offsetMinutes - 720) + 540) % 360) - 180;
  if (Math.abs(dailyMotion) < meanMotion * WHEEL_STATION_FRACTION) return 'stationary';
  return dailyMotion < 0 ? 'retrograde' : null;
}
const WHEEL_MOTION_MARKS = { retrograde: '℞', stationary: 'ST' };
// "Jupiter ♍5.64° ℞", then the house.
function wheelPlanetTooltip(position, longitude, cusps) {
  const { glyph, degree } = wheelSignText(longitude);
  const mark = WHEEL_MOTION_MARKS[position.motion];
  const house = wheelHouseOf(longitude, cusps);
  return `<div class="wheel-tooltip-main">${position.name} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div>${house ? `<div class="wheel-tooltip-sub">House ${house}</div>` : ''}`;
}
// "Venus♏ Trine Neptune♓", then the orb and whether it's tightening (applying)
// or widening (separating) over the next hour.
function wheelAspectTooltip(aspect, positionsByName, longitudes, offsetMinutes) {
  const first = wheelSignText(longitudes.get(aspect.first)), second = wheelSignText(longitudes.get(aspect.second));
  const later = name => positionAngleAtTime(positionsByName.get(name), offsetMinutes + 60);
  const separation = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const orbLater = Math.abs(separation(later(aspect.first), later(aspect.second)) - aspect.angle);
  return `<div class="wheel-tooltip-main">${aspect.first}${first.glyph} ${aspect.name} ${aspect.second}${second.glyph}</div><div class="wheel-tooltip-sub">Orb ${aspect.orb.toFixed(1)}° · ${orbLater < aspect.orb ? 'applying' : 'separating'}</div>`;
}
// One tooltip per wheel, driven by whatever the latest render stored in svg._wheelHover.
function bindWheelHover(svg) {
  if (svg._wheelTooltip) return svg._wheelTooltip;
  const tooltip = document.createElement('div');
  tooltip.className = 'wheel-tooltip';
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  svg._wheelTooltip = tooltip;
  svg.addEventListener('mousemove', event => {
    const data = svg._wheelHover;
    const planet = event.target.closest('.planet-marker'), aspect = event.target.closest('.aspect-hit');
    const build = !data ? null : planet ? data.planet(planet.dataset.planet) : aspect ? data.aspect(Number(aspect.dataset.aspect)) : null;
    const html = build && build();
    if (!html) { tooltip.hidden = true; return; }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const x = event.clientX + 14 + tooltip.offsetWidth > window.innerWidth ? event.clientX - 14 - tooltip.offsetWidth : event.clientX + 14;
    const y = event.clientY + 14 + tooltip.offsetHeight > window.innerHeight ? event.clientY - 14 - tooltip.offsetHeight : event.clientY + 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
  svg.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  return tooltip;
}

// Zodiac ring (inner..outer), rotated so zodiac degree d sits at wheel angle
// wheelRotation - d. Degree ticks on the ring's inner side: long & bold at 10°/20° of
// each sign, short & bold at 5°/15°/25°, short & thin at every other whole degree.
// A faint tint behind each sign in the zodiac ring (inner..outer), in its element's
// color (see .zodiac-sector in styles.css). Zodiac degree d sits at wheel angle
// wheelRotation - d, so a sign's wedge runs from its cusp toward decreasing angles.
function wheelZodiacSectorsMarkup(cx, cy, outer, inner, wheelRotation) {
  const point = (r, degree) => {
    const rad = (wheelRotation - degree - 90) * Math.PI / 180;
    return `${cx + r * Math.cos(rad)} ${cy + r * Math.sin(rad)}`;
  };
  return SIGN_ELEMENTS.map((element, index) => {
    const start = index * 30, end = start + 30;
    return `<path d="M ${point(outer, start)} A ${outer} ${outer} 0 0 0 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 1 ${point(inner, start)} Z" class="zodiac-sector ${element}"/>`;
  }).join('');
}
function wheelZodiacMarkup(cx, cy, outer, inner, wheelRotation) {
  const zodiacWidth = outer - inner;
  let markup = wheelZodiacSectorsMarkup(cx, cy, outer, inner, wheelRotation);
  for (let degree = 0; degree < 360; degree += 1) {
    const withinSign = degree % 30;
    if (withinSign === 0) continue;
    const long = withinSign % 10 === 0;
    const bold = withinSign % 5 === 0;
    const tickAngle = (wheelRotation - degree - 90) * Math.PI / 180;
    const tickOuter = inner + zodiacWidth * (long ? 0.4 : 0.25);
    markup += `<line x1="${cx + inner * Math.cos(tickAngle)}" y1="${cy + inner * Math.sin(tickAngle)}" x2="${cx + tickOuter * Math.cos(tickAngle)}" y2="${cy + tickOuter * Math.sin(tickAngle)}" class="zodiac-tick ${bold ? 'bold' : 'thin'}"/>`;
  }
  for (let index = 0; index < 12; index += 1) {
    const zodiacAngle = (wheelRotation - index * 30 - 90) * Math.PI / 180;
    const x1 = cx + inner * Math.cos(zodiacAngle), y1 = cy + inner * Math.sin(zodiacAngle);
    const x2 = cx + outer * Math.cos(zodiacAngle), y2 = cy + outer * Math.sin(zodiacAngle);
    // -PI/12 (not +): zodiacAngle is this sign's OWN starting cusp, and bearing
    // decreases with index (signs sweep counterclockwise) — so centering the
    // label within its own 30° wedge means going further in the decreasing
    // direction. +PI/12 would land it in the previous sign's wedge instead.
    const labelR = outer - zodiacWidth * 0.375;
    const labelX = cx + labelR * Math.cos(zodiacAngle - Math.PI / 12);
    const labelY = cy + labelR * Math.sin(zodiacAngle - Math.PI / 12);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)" class="zodiac-boundary"/><text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="wheel-sign ${SIGN_ELEMENTS[index]}" data-zodiac-sign="${index}">${SIGN_GLYPHS[index]}</text>`;
  }
  return markup;
}
// Hovering a sign's glyph in any astrology wheel's zodiac ring shows what the sign is about — text from zodiac-data.js.
function zodiacSignTooltipHtml(index) {
  const info = ZODIAC_SIGN_INFO[index];
  const element = SIGN_ELEMENTS[index][0].toUpperCase() + SIGN_ELEMENTS[index].slice(1);
  const part = (title, text) => `<div class="gk-tip-title">${title}</div><div class="gk-tip-text">${text}</div>`;
  return `<div class="gk-tip-title">${SIGNS[index]} ${SIGN_GLYPHS[index]}\uFE0E — ${info.symbol}</div>
    <div class="gk-tip-text">${info.modality} ${element} · ruled by ${info.ruler}</div>
    <div class="gk-tip-text">${info.summary}</div>
    ${part("Psychological", info.psychological)}${part("Esoteric", info.esoteric)}${part("Material", info.material)}`;
}
(() => {
  let tooltip = null;
  document.addEventListener("mousemove", event => {
    const sign = event.target.closest?.("[data-zodiac-sign]");
    if (!sign) {
      if (tooltip) tooltip.hidden = true;
      return;
    }
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "wheel-tooltip gk-tooltip";
      document.body.appendChild(tooltip);
    }
    if (tooltip.dataset.sign !== sign.dataset.zodiacSign) {
      tooltip.dataset.sign = sign.dataset.zodiacSign;
      tooltip.innerHTML = zodiacSignTooltipHtml(Number(sign.dataset.zodiacSign));
    }
    tooltip.hidden = false;
    const x = event.clientX + 14 + tooltip.offsetWidth > window.innerWidth ? event.clientX - 14 - tooltip.offsetWidth : event.clientX + 14;
    const y = event.clientY + 14 + tooltip.offsetHeight > window.innerHeight ? event.clientY - 14 - tooltip.offsetHeight : event.clientY + 14;
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  });
})();
// House cusps drawn from fromR out to toR. The numbers sit near fromR, just inside
// each house's starting cusp (houses run in increasing zodiac degree, so "inside"
// is +degrees).
function wheelHousesMarkup(cx, cy, fromR, toR, cusps, wheelRotation) {
  const houseLabelR = fromR + 9;
  const houseLabelOffset = (10 / houseLabelR) * 180 / Math.PI;
  return cusps.map((cusp, index) => {
    const houseAngle = (wheelRotation - cusp - 90) * Math.PI / 180;
    const x1 = cx + fromR * Math.cos(houseAngle), y1 = cy + fromR * Math.sin(houseAngle);
    const x2 = cx + toR * Math.cos(houseAngle), y2 = cy + toR * Math.sin(houseAngle);
    const labelAngle = (wheelRotation - cusp - houseLabelOffset - 90) * Math.PI / 180;
    const labelX = cx + houseLabelR * Math.cos(labelAngle), labelY = cy + houseLabelR * Math.sin(labelAngle);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="house-cusp"/><text x="${labelX}" y="${labelY}" class="house-number" text-anchor="middle" dominant-baseline="middle">${index + 1}</text>`;
  }).join('');
}
// Single-chart wheels: a narrow shaded band (fromR..toR) holding only the house numbers,
// each centered in its house, with the cusps running from the band's inner edge out
// across the planet ring to the zodiac (cuspR).
function wheelHouseBandMarkup(cx, cy, fromR, toR, cuspR, cusps, wheelRotation) {
  const point = (r, longitude) => {
    const rad = (wheelRotation - longitude - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const middle = (fromR + toR) / 2;
  let markup = `<circle cx="${cx}" cy="${cy}" r="${middle}" class="house-band" stroke-width="${toR - fromR}"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${toR}" class="house-band-edge"/><circle cx="${cx}" cy="${cy}" r="${fromR}" class="house-band-edge"/>`;
  cusps.forEach((cusp, index) => {
    const [x1, y1] = point(fromR, cusp), [x2, y2] = point(cuspR, cusp);
    const span = (((cusps[(index + 1) % cusps.length] - cusp) % 360) + 360) % 360;
    const [lx, ly] = point(middle, cusp + span / 2);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="house-cusp"/><text x="${lx}" y="${ly}" class="house-number house-band-number" text-anchor="middle" dominant-baseline="central">${index + 1}</text>`;
  });
  return markup;
}
// Aspect lines on the circle of radius r, between the TRUE wheel angles anglesOf(aspect)
// returns (traditional wheels never spread the lines with the glyphs), plus invisible,
// wider twins (.aspect-hit, data-aspect = index) so even the thinnest line is easy to hover.
function wheelAspectLinesMarkup(cx, cy, r, aspects, anglesOf) {
  const point = angle => {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const ends = aspects.map(aspect => anglesOf(aspect).map(point));
  const lines = aspects.map((aspect, index) => {
    const [p1, p2] = ends[index];
    const strokeWidth = { exact: 4, strong: 1.8, normal: 1.1 }[aspect.intensity] || 0.8;
    const dash = aspect.intensity === 'weak' ? ' stroke-dasharray="3 3"' : '';
    return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${aspect.color}" stroke-width="${strokeWidth}" opacity=".7"${dash} class="aspect-line"/>`;
  }).join('');
  const hits = ends.map(([p1, p2], index) => `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="aspect-hit" data-aspect="${index}"/>`).join('');
  return lines + hits;
}

function renderPreciseWheel(chart, offsetMinutes, targetId = 'chartWheel') {
  const svg = document.getElementById(targetId);
  // Rings, outside in: zodiac (inner..outer), planets + houses (aspectR..inner, about
  // 10% wider than the zodiac ring), then the aspect lines inside aspectR.
  const cx = 300, cy = 300, outer = 250, inner = 202;
  const planetRingWidth = WHEEL_LABELLED_RING;
  const aspectR = inner - planetRingWidth - WHEEL_HOUSE_BAND;
  if (!svg) return;
  let markup = `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${aspectR}" fill="none" stroke="var(--line)" stroke-width="1" opacity=".8"/>`;
  const ascendant = chart.positions.find(position => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, offsetMinutes) : 0;
  // Fixed: the Aries cusp (0°) occupies the same leftmost point the Ascendant
  // normally does. Unfixed, the Ascendant sits leftmost at equivalent-angle 270
  // (wheelRotation - ascendantAngle = 270 + ascendantAngle - ascendantAngle);
  // fixed, the Aries cusp (trueAngle 0) needs that same equivalent-angle 270,
  // so wheelRotation - 0 = 270.
  const wheelRotation = astroWheelFixedToAries ? 270 : (270 + ascendantAngle + 360) % 360;
  const houseCusps = houseCuspsAtTime(chart, offsetMinutes);
  markup += wheelZodiacMarkup(cx, cy, outer, inner, wheelRotation);
  markup += wheelHouseBandMarkup(cx, cy, aspectR, aspectR + WHEEL_HOUSE_BAND, inner, houseCusps, wheelRotation);
  // Hidden bodies are dropped before clustering and aspects, so they neither push
  // neighbouring glyphs aside nor leave aspect lines behind.
  const markerPositions = chart.positions
    .filter(position => wheelBodyVisible(position.name) && bodyShownAt(position, offsetMinutes))
    .map(position => {
      const longitude = positionAngleAtTime(position, offsetMinutes);
      return {...position, color: 'var(--ink)', longitude, angle: (wheelRotation - longitude + 360) % 360, motion: wheelMotion(position, offsetMinutes)};
    });
  spreadClusteredAngles(markerPositions, WHEEL_LABELLED_SPREAD);
  const longitudes = new Map(markerPositions.map(position => [position.name, positionAngleAtTime(position, offsetMinutes)]));
  let aspects = [];
  // Aspect lines connect planets' TRUE positions (position.angle), not the spread-out
  // display markers — traditional wheels never spread the lines themselves. Distances
  // between angles are rotation-invariant, so reusing this wheel-space `angle` (rather
  // than re-deriving the raw zodiac angle) gives the same aspect orbs calculateAspects
  // would compute from the unrotated positions.
  if (typeof calculateAspects === 'function') {
    const angleByName = new Map(markerPositions.map(position => [position.name, position.angle]));
    aspects = calculateAspects({positions: markerPositions}).filter(aspectDrawnOnWheel);
    markup += wheelAspectLinesMarkup(cx, cy, aspectR, aspects, aspect => [angleByName.get(aspect.first), angleByName.get(aspect.second)]);
  }
  markerPositions.forEach(position => { markup += planetMarkerMarkup(cx, cy, inner, position, planetRingWidth, true); });
  //markup += `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--accent)"/>`;
  svg.innerHTML = markup;
  svg.querySelectorAll('.planet-marker').forEach(node => node.addEventListener('click', () => showToast(`${node.dataset.planet} · click for placement details`)));
  const positionsByName = new Map(markerPositions.map(position => [position.name, position]));
  // Built on demand when hovered, so redrawing the wheel (every timeline tick) stays cheap.
  svg._wheelHover = {
    planet: name => positionsByName.has(name) && (() => wheelPlanetTooltip(positionsByName.get(name), longitudes.get(name), houseCusps)),
    aspect: index => aspects[index] && (() => wheelAspectTooltip(aspects[index], positionsByName, longitudes, offsetMinutes)),
  };
  // The wheel under the pointer just changed (timeline, filter, zodiac mode…): drop the stale tooltip.
  bindWheelHover(svg).hidden = true;
  const list = targetId === 'chartWheel' && document.getElementById('chartPositions');
  if (list) list.innerHTML = wheelPositionsMarkup([{ chart, offset: offsetMinutes }]);
}

// ── The positions list beside the wheel's filters ─────────────────────────
// Every body shown on the wheel with its sign, degree and minutes, house and motion,
// then the house cusps — for one chart; for two (synastry), both side by side with the
// four angles. people: [{ chart, offset, name?, color?, omit? }] as the wheels take them.
const WHEEL_POSITION_ANGLES = new Set(['Ascendant', 'Midheaven']);
function wheelDegreeMarkup(longitude, motion) {
  const { sign, degrees, minutes } = zodiacDegreeParts(longitude);
  const mark = WHEEL_MOTION_MARKS[motion];
  return `<span class="pos-value"><b class="pos-sign ${SIGN_ELEMENTS[sign]}" title="${SIGNS[sign]}">${SIGN_GLYPHS[sign]}\uFE0E</b>${degrees}°${String(minutes).padStart(2, '0')}′</span><span class="pos-motion"${mark ? ` title="${motion === 'retrograde' ? 'Retrograde' : 'Stationary'}"` : ''}>${mark || ''}</span>`;
}
function wheelPositionsMarkup(people) {
  const order = (name) => {
    const index = WHEEL_FILTER_BODIES.findIndex(item => (item.members || [item.key]).includes(name));
    return index < 0 ? 99 : index;
  };
  const shown = (person) => person.chart.positions.filter(position => wheelBodyVisible(position.name) && !person.omit?.has(position.name) && bodyShownAt(position, person.offset || 0));
  const chironGone = people.some(person => person.chart.positions.some(position => position.name === 'Chiron' && wheelBodyVisible('Chiron') && !bodyShownAt(position, person.offset || 0)));
  const chironNote = chironGone ? `<p class="pos-note">⚷ Chiron is shown for ${CHIRON_FIRST_YEAR}–${CHIRON_LAST_YEAR} only: its orbit can't be traced reliably further.</p>` : '';
  const readings = people.map(person => {
    const offset = person.offset || 0;
    const housed = !person.omit?.has('Ascendant');
    const cusps = housed ? houseCuspsAtTime(person.chart, offset) : null;
    const byName = new Map(shown(person).map(position => {
      const longitude = positionAngleAtTime(position, offset);
      return [position.name, { position, longitude, motion: wheelMotion(position, offset), house: cusps ? wheelHouseOf(longitude, cusps) : null }];
    }));
    const midheaven = person.chart.positions.find(position => position.name === 'Midheaven');
    return { person, cusps, byName, midheaven: cusps && (midheaven ? positionAngleAtTime(midheaven, offset) : cusps[9]) };
  });
  const names = [...new Set(readings.flatMap(reading => [...reading.byName.keys()]))]
    .filter(name => !WHEEL_POSITION_ANGLES.has(name))
    .sort((a, b) => order(a) - order(b));
  const glyphOf = name => readings.map(reading => reading.byName.get(name)?.position.glyph).find(Boolean) || '';
  const system = `<span class="pos-system">(${escapeHtml(houseSystem)})</span>`;
  if (readings.length === 1) {
    const [{ byName, cusps, midheaven }] = readings;
    const rows = names.map(name => {
      const body = byName.get(name);
      return `<div class="pos-row"><span class="pos-glyph">${body.position.glyph}</span><span class="pos-name">${escapeHtml(name)}</span>${wheelDegreeMarkup(body.longitude, body.motion)}<span class="pos-house" title="House">${body.house || ''}</span></div>`;
    }).join('');
    // Cusps 1–6 beside 7–12, as ephemerides print them; the angles by their names
    // (Equal houses: the Midheaven isn't a cusp, so it gets a row of its own).
    const placidus = houseSystem !== 'Equal Houses';
    const labels = { 1: 'AC', 7: 'DC', ...(placidus ? { 4: 'IC', 10: 'MC' } : {}) };
    const cusp = index => `<div class="pos-cusp"><span class="pos-name">${labels[index + 1] || index + 1}</span>${wheelDegreeMarkup(cusps[index])}</div>`;
    const houses = cusps ? `<span class="eyebrow wheel-filter-section">HOUSES ${system}</span>
      <div class="pos-cusps">${[0, 1, 2, 3, 4, 5].map(index => cusp(index) + cusp(index + 6)).join('')}</div>
      ${placidus ? '' : `<div class="pos-cusps"><div class="pos-cusp"><span class="pos-name">MC</span>${wheelDegreeMarkup(midheaven)}</div></div>`}` : '';
    return `<span class="eyebrow">POSITIONS</span><div class="pos-list">${rows}</div>${chironNote}${houses}`;
  }
  // Two charts: a column each, in their colors.
  const head = `<div class="pos-row pos-pair pos-head"><span></span><span></span>${readings.map(({ person }) => `<span class="pos-who" style="color:${person.color}" title="${escapeHtml(person.chart.name)}">${escapeHtml(person.name || person.tag)}</span>`).join('')}</div>`;
  const short = { 'North Node': 'N. Node', 'South Node': 'S. Node' };
  const rows = names.map(name => `<div class="pos-row pos-pair"><span class="pos-glyph">${glyphOf(name)}</span><span class="pos-name" title="${escapeHtml(name)}">${escapeHtml(short[name] || name)}</span>${readings.map(reading => {
    const body = reading.byName.get(name);
    return `<span class="pos-cell">${body ? wheelDegreeMarkup(body.longitude, body.motion) : '<span class="pos-value">—</span>'}</span>`;
  }).join('')}</div>`).join('');
  const angle = (label, of) => `<div class="pos-row pos-pair"><span></span><span class="pos-name">${label}</span>${readings.map(reading => `<span class="pos-cell">${reading.cusps ? wheelDegreeMarkup(of(reading)) : '<span class="pos-value">—</span>'}</span>`).join('')}</div>`;
  const plus = (value, degrees) => (value + degrees) % 360;
  const angles = readings.some(reading => reading.cusps)
    ? `<span class="eyebrow wheel-filter-section">ANGLES ${system}</span><div class="pos-list">${angle('ASC', r => r.cusps[0])}${angle('IC', r => plus(r.midheaven, 180))}${angle('DSC', r => plus(r.cusps[0], 180))}${angle('MC', r => r.midheaven)}</div>`
    : '';
  return `<span class="eyebrow">POSITIONS</span><div class="pos-list">${head}${rows}</div>${chironNote}${angles}`;
}

function initPreciseTimeline() {
  const container = document.querySelector('[data-astro-timeline]');
  if (!container) return;
  container.innerHTML = timelineSliderInnerMarkup('CHART TIMELINE', 0);
  const houseControl = document.querySelector('.chart-toolbar-right .zodiac-chip:nth-child(2)');
  const zodiacControl = document.querySelector('.chart-toolbar-right .zodiac-chip:nth-child(1)');
  const slider = container.querySelector('[data-timeline-slider]');
  // These chips act as buttons: Enter and Space press them, as they would a real button.
  const pressOnKeys = control => control.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
  });
  if (zodiacControl) {
    pressOnKeys(zodiacControl);
    zodiacControl.classList.add('zodiac-mode-toggle');
    zodiacControl.setAttribute('role', 'button');
    zodiacControl.tabIndex = 0;
    zodiacControl.title = 'Switch zodiac';
    zodiacControl.addEventListener('click', () => {
      zodiacMode = zodiacMode === 'Tropical' ? 'Sidereal' : 'Tropical';
      zodiacControl.textContent = `♈ ${zodiacMode}`;
      const chart = currentExplorerChart();
      if (chart) {
        renderPreciseWheel(chart, Number(slider.value));
        renderCalculatedAspects(Number(slider.value));
        updateDisplayedSigns(chart, Number(slider.value));
      }
    });
  }
  if (houseControl) {
    pressOnKeys(houseControl);
    houseControl.classList.add('house-system-toggle');
    houseControl.setAttribute('role', 'button');
    houseControl.tabIndex = 0;
    houseControl.title = 'Switch house system';
    houseControl.addEventListener('click', () => {
      houseSystem = houseSystem === 'Placidus' ? 'Equal Houses' : 'Placidus';
      houseControl.textContent = `⌂ ${houseSystem}`;
      const chart = currentExplorerChart();
      if (chart) {
        renderPreciseWheel(chart, Number(slider.value));
        updateDisplayedSigns(chart, Number(slider.value));
      }
    });
  }
  // The planet/aspect filter panel is set up by initAspectEngine (aspects.js), which
  // loads after this file and knows the aspects too.
  const fixZodiacToggle = document.getElementById('fixZodiacToggleChart');
  if (fixZodiacToggle) {
    fixZodiacToggle.checked = astroWheelFixedToAries;
    fixZodiacToggle.addEventListener('change', () => {
      astroWheelFixedToAries = fixZodiacToggle.checked;
      const chart = currentExplorerChart();
      if (chart) renderPreciseWheel(chart, Number(slider.value));
    });
  }
  bindTimelineSlider(container, {
    originLabel: timelineOriginLabel(),
    onChange: offsetMinutes => {
      const chart = currentExplorerChart();
      if (!chart) return;
      window.timelineOffsetMinutes = offsetMinutes;
      updateTimelineReadout(container, chart, offsetMinutes);
      renderPreciseWheel(chart, offsetMinutes);
      // aspects.js loads after timeline.js, and bindTimelineSlider's initial onChange
      // fires synchronously at page load (before aspects.js has run) — guard so that
      // first call doesn't throw; every later call (real slider input) is unaffected.
      if (typeof renderCalculatedAspects === 'function') renderCalculatedAspects(offsetMinutes);
      updateDisplayedSigns(chart, offsetMinutes);
    }
  });
}

// Called from app.js's renderExplorer() every time the shared explorer surface is
// (re)mounted, whether that's the Chart Explorer opening a chart or the Timeline
// Explorer opening on the current moment — resets the slider to its origin (birth,
// or "now"), which (via the slider's own 'input' listener) refreshes every
// time-aware piece (wheel, aspects, signs, exact time) the same way a dblclick would.
function refreshExplorerTimeline(chart) {
  const slider = document.querySelector('[data-astro-timeline] [data-timeline-slider]');
  if (!chart || !slider) return;
  slider.value = '0';
  slider.dispatchEvent(new Event('input'));
}

// The signature strip above the wheel: the Sun's sign, degree and house, and the
// Rising sign (Ascendant) and degree, at the timeline's moment — so it follows the
// slider and the zodiac / house-system toggles.
function ordinalHouse(number) {
  return `${number}${number === 1 ? 'st' : number === 2 ? 'nd' : number === 3 ? 'rd' : 'th'}`;
}
function updateDisplayedSigns(chart, offsetMinutes) {
  const fill = (name, glyphId, signId, degreeId, withHouse) => {
    const position = chart.positions.find(item => item.name === name);
    const glyph = document.getElementById(glyphId), sign = document.getElementById(signId), degree = document.getElementById(degreeId);
    if (!glyph || !sign || !degree) return;
    if (!position) {
      glyph.textContent = '';
      sign.textContent = '—';
      degree.textContent = '';
      return;
    }
    const longitude = positionAngleAtTime(position, offsetMinutes);
    const index = Math.floor(longitude / 30);
    glyph.textContent = SIGN_GLYPHS[index];
    sign.textContent = SIGNS[index];
    const house = withHouse ? wheelHouseOf(longitude, houseCuspsAtTime(chart, offsetMinutes)) : null;
    degree.textContent = `${(longitude - index * 30).toFixed(2)}°${house ? ` · ${ordinalHouse(house)} house` : ''}`;
  };
  fill('Sun', 'sunGlyph', 'sunSign', 'sunDegree', true);
  fill('Ascendant', 'risingGlyph', 'risingSign', 'risingDegree', false);
}

initPreciseTimeline();