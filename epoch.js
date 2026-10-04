// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer ───────────────────────────────────────────────────────
// Long collective cycles, with no birth chart: the conjunctions and aspect cycles of
// the five slow planets (epoch-astrology.js), and the equinox drifting backwards
// through the Human Design gates (epoch-human-design.js). This file holds what both
// share: the view's shell and system tabs, its data files (loaded on first visit), the
// calendar (Julian before 15 October 1582, Gregorian after; BC years as historians
// count them, with no year 0), and the timeline with one or two draggable markers.
//
// Every moment here is a number: days from J2000 (1 Jan 2000, 12:00 UT), in UT — the
// same scale Astronomy Engine's MakeTime takes, and safe for any year (unlike Date).

const EPOCH_SYSTEMS = ['Astrology', 'Human Design'];
let epochActiveSystem = 'Astrology';
let epochMounted = false;
const EPOCH_J2000_JD = 2451545.0;
const EPOCH_J2000_MS = Date.UTC(2000, 0, 1, 12);
const EPOCH_YEAR_DAYS = 365.25;
function epochNow() {
  return (Date.now() - EPOCH_J2000_MS) / 86400000;
}

// ── Data files, loaded on first visit ────────────────────────────────────
const EPOCH_DATA_FILES = {
  Astrology: ['epoch-ephemeris-data.js', 'epoch-conjunctions.js'],
  'Human Design': ['epoch-precession.js'],
};
const epochScriptLoads = {};
function epochLoadScript(file) {
  if (!epochScriptLoads[file]) {
    epochScriptLoads[file] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${file}?v=${ORBITAL_VERSION}`;
      script.onload = resolve;
      script.onerror = () => { delete epochScriptLoads[file]; reject(new Error(`Couldn't load ${file}`)); };
      document.head.appendChild(script);
    });
  }
  return epochScriptLoads[file];
}
function epochLoadSystem(system) {
  return Promise.all(EPOCH_DATA_FILES[system].map(epochLoadScript)).then(() => {
    if (system === 'Astrology') epochEphemerisSetup(Astronomy, EPOCH_EPHEMERIS_CORRECTIONS);
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────
// Julian Day ↔ calendar date (Meeus, Astronomical Algorithms ch. 7). Years are
// astronomical (year 0 = 1 BC, -1 = 2 BC); dates before 15 Oct 1582 are Julian. Meeus's
// formulas need a positive Julian Day, so earlier dates are shifted by whole 4-year
// Julian cycles (EPOCH_JULIAN_SHIFT_YEARS) and back.
const EPOCH_GREGORIAN_START_JD = 2299160.5;
const EPOCH_JULIAN_SHIFT_YEARS = 24000;
const EPOCH_JULIAN_SHIFT_DAYS = (EPOCH_JULIAN_SHIFT_YEARS / 4) * 1461;
const EPOCH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function epochJdFromCalendar(year, month, day, hours = 0) {
  const gregorian = year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)));
  let y = year + (gregorian ? 0 : EPOCH_JULIAN_SHIFT_YEARS), m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = gregorian ? 2 - a + Math.floor(a / 4) : 0;
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5 + hours / 24;
  return gregorian ? jd : jd - EPOCH_JULIAN_SHIFT_DAYS;
}
function epochCalendarFromJd(jd) {
  const julian = jd < EPOCH_GREGORIAN_START_JD;
  const shifted = julian && jd < 0;
  const z = Math.floor(jd + 0.5 + (shifted ? EPOCH_JULIAN_SHIFT_DAYS : 0));
  const f = jd + 0.5 + (shifted ? EPOCH_JULIAN_SHIFT_DAYS : 0) - z;
  let a = z;
  if (!julian) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524, c = Math.floor((b - 122.1) / 365.25), d = Math.floor(365.25 * c), e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = (month > 2 ? c - 4716 : c - 4715) - (shifted ? EPOCH_JULIAN_SHIFT_YEARS : 0);
  const minutes = Math.min(1439, Math.floor(f * 1440 + 1e-6));
  return { year, month, day, hours: Math.floor(minutes / 60), minutes: minutes % 60, julian };
}
function epochUtFromCalendar(year, month = 1, day = 1, hours = 0) {
  return epochJdFromCalendar(year, month, day, hours) - EPOCH_J2000_JD;
}
function epochCalendar(ut) {
  return epochCalendarFromJd(ut + EPOCH_J2000_JD);
}
// Astronomical year → "5001 BC", "379 AD", "2027".
function epochYearLabel(year) {
  if (year <= 0) return `${1 - year} BC`;
  return year < 1000 ? `${year} AD` : String(year);
}
const epochPad = (value) => String(value).padStart(2, '0');
// "15 Feb 2027 · 22:10 UTC"; `time: false` drops the time, `calendar: true` marks Julian dates.
function epochDateText(ut, { time = true, calendar = false } = {}) {
  const date = epochCalendar(ut);
  const text = `${epochYearLabel(date.year)} ${EPOCH_MONTHS[date.month - 1]} ${date.day}`;
  return `${text}${time ? ` · ${epochPad(date.hours)}:${epochPad(date.minutes)} UTC` : ''}${calendar && date.julian ? ' (Julian)' : ''}`;
}
// Approximate astronomical year (for axes and spans).
function epochYearOf(ut) {
  return 2000 + ut / EPOCH_YEAR_DAYS;
}
// "in 412 years", "38 years ago", "in 3 months".
function epochRelativeText(fromUt, toUt) {
  const days = toUt - fromUt, years = Math.abs(days) / EPOCH_YEAR_DAYS;
  const amount = years >= 2 ? `${Math.round(years)} years` : years >= 1 / 6 ? `${Math.round(years * 12)} months` : `${Math.round(Math.abs(days))} days`;
  return days >= 0 ? `in ${amount}` : `${amount} ago`;
}

// "2027.12.17", "146.10.18 BC": a compact date for tables and legends.
function epochShortDate(ut) {
  const date = epochCalendar(ut);
  const year = date.year <= 0 ? 1 - date.year : date.year;
  return `${year}.${epochPad(date.month)}.${epochPad(date.day)}${date.year <= 0 ? ' BC' : ''}`;
}
// ── Sliders ──────────────────────────────────────────────────────────────
// The app's own timeline slider (timeline.js), set up for these spans: values are
// minutes from now ("Back to now"), the range is the view's, and the ticks and typed
// dates are UTC (the exact time shows only in the date form "Go to a date…" opens). options: { label (above the slider),
// range [fromUt, toUt], get() → the moment, set(ut), initialYears (the window's width),
// markers() → [{ from, to (ut), label, color }], wheelZoom (false: no zooming with the
// mouse wheel) }. Returns { moveTo(ut) } (the window
// follows), plus refresh() to redraw the markers.
const EPOCH_UTC_CLOCK = timelineClock('UTC');
const epochUtc = (ut) => EPOCH_J2000_MS + ut * 86400000;
function epochSliderMarkup(label) {
  return `<div class="timeline-control epoch-slider">${timelineSliderInnerMarkup(label)}</div>`;
}
function epochBindSlider(container, options) {
  // Now, to the whole minute, so the slider's minutes fall on the clock's minutes.
  const origin = Math.floor(Date.now() / 60000) * 60000;
  const minutes = (ut) => (epochUtc(ut) - origin) / 60000;
  const fromMinutes = (value) => (origin + value * 60000 - EPOCH_J2000_MS) / 86400000;
  const span = (options.initialYears / 2) * 525960;
  const slider = bindTimelineSlider(container, {
    originTime: origin, clock: EPOCH_UTC_CLOCK, anchorName: 'now', originLabel: 'Now',
    range: options.range.map(epochUtc), minSpan: 15 * 1440, wheelZoom: options.wheelZoom ?? true,
    initialSpan: span, initial: { value: Math.round(minutes(options.get())), center: Math.round(minutes(options.get())), span },
    markers: options.markers && (() => options.markers().map((marker) => ({ ...marker, from: minutes(marker.from), to: minutes(marker.to ?? marker.from) }))),
    onChange: (value) => {
      const ut = fromMinutes(value);
      // The moment keeps its exact time unless the slider really moved it.
      if (Math.abs(minutes(options.get()) - value) >= 1) options.set(ut);
      container.querySelector('[data-timeline-date]').textContent = epochDateText(options.get(), { time: false, calendar: true });
      container.querySelector('[data-timeline-exact]').textContent = 'Go to a date…';
    },
  });
  return {
    moveTo: (ut) => slider.timeline.moveTo(minutes(ut)),
    refresh: () => slider.timeline.refresh(),
  };
}

// ── The view ─────────────────────────────────────────────────────────────
function renderEpochExplorer() {
  const body = document.getElementById('epochBody');
  if (!body) return;
  if (!epochMounted) {
    epochMounted = true;
    body.innerHTML = `
      <div class="explorer-system-tabs" role="tablist" aria-label="Epoch system">${EPOCH_SYSTEMS.map((system) => `<button type="button" role="tab" data-epoch-system="${system}">${system}</button>`).join('')}</div>
      <div id="epochSystemSurface"></div>`;
    body.querySelectorAll('[data-epoch-system]').forEach((button) => button.addEventListener('click', () => switchEpochSystem(button.dataset.epochSystem)));
  }
  switchEpochSystem(epochActiveSystem, true);
}
function switchEpochSystem(system, force = false) {
  if (!EPOCH_SYSTEMS.includes(system)) system = 'Astrology';
  if (system === epochActiveSystem && !force && document.querySelector('#epochSystemSurface > *')) return;
  epochActiveSystem = system;
  document.querySelectorAll('[data-epoch-system]').forEach((button) => button.classList.toggle('active', button.dataset.epochSystem === system));
  const surface = document.getElementById('epochSystemSurface');
  surface.innerHTML = '<p class="intro-copy epoch-loading">Loading…</p>';
  epochLoadSystem(system).then(() => {
    if (epochActiveSystem !== system) return;
    // A fresh container each time: the views bind their listeners to it, and they go
    // with it (binding them to the long-lived surface would stack them up, one more
    // set per visit, so one click would act two, three, four times).
    const host = document.createElement('div');
    surface.replaceChildren(host);
    if (system === 'Astrology') renderEpochAstrology(host);
    else renderEpochHumanDesign(host);
  }).catch((error) => {
    surface.innerHTML = `<p class="intro-copy">${escapeHtml(error.message)}. Check the connection and try again.</p>`;
  });
}

// ── Keyboard ─────────────────────────────────────────────────────────────
//   , / .   Astrology: the reference to the previous / next conjunction pass of its pair,
//           or the moment to its planet's previous / next crossing of the reference
//           degree; Human Design: previous / next line (the Personality or Design line changes)
//   [ / ]   Astrology: the reference to the previous / next aspect pass; Human Design: gate
//   1 / 2   Astrology: the reference / the moment is the one , . and N move
//   N       the active moment to now
const EPOCH_KEYS = { ',': ['event', -1], '.': ['event', 1], '[': ['phase', -1], ']': ['phase', 1] };
let epochKeyHandler = null; // set by the active system: (action, direction) → handled
document.addEventListener('keydown', (event) => {
  if (currentView !== 'epoch' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (shortcutTyping(event.target) || document.querySelector('dialog[open]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const [action, direction] = EPOCH_KEYS[event.key] || ({ n: ['now', 0], 1: ['marker', 0], 2: ['marker', 1] })[key] || [];
  if (action && epochKeyHandler?.(action, direction)) event.preventDefault();
});
