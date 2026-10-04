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
  const text = `${date.day} ${EPOCH_MONTHS[date.month - 1]} ${epochYearLabel(date.year)}`;
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

// A date editor: day, month, year, era and UTC time. `onChange(ut)` gets the new moment.
function epochDateFieldsMarkup(key) {
  return `<span class="epoch-date-fields" data-epoch-date="${key}">
    <input type="number" min="1" max="31" data-part="day" aria-label="Day">
    <select data-part="month" aria-label="Month">${EPOCH_MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join('')}</select>
    <input type="number" min="1" max="9999" data-part="year" aria-label="Year">
    <select data-part="era" aria-label="Era"><option value="AD">AD</option><option value="BC">BC</option></select>
    <input type="time" data-part="time" aria-label="Time (UTC)"><small>UTC</small>
  </span>`;
}
function epochFillDateFields(box, ut) {
  const date = epochCalendar(ut);
  const set = (part, value) => { const field = box.querySelector(`[data-part="${part}"]`); if (field && document.activeElement !== field) field.value = value; };
  set('day', date.day);
  set('month', date.month);
  set('year', date.year <= 0 ? 1 - date.year : date.year);
  set('era', date.year <= 0 ? 'BC' : 'AD');
  set('time', `${epochPad(date.hours)}:${epochPad(date.minutes)}`);
  box.title = date.julian ? 'Julian calendar (dates before 15 October 1582)' : 'Gregorian calendar';
}
function epochBindDateFields(box, onChange) {
  box.addEventListener('change', () => {
    const value = (part) => box.querySelector(`[data-part="${part}"]`).value;
    const year = Number(value('year')), day = Number(value('day'));
    if (!Number.isInteger(year) || year < 1 || !Number.isInteger(day) || day < 1 || day > 31) return;
    const [hours, minutes] = (value('time') || '00:00').split(':').map(Number);
    onChange(epochUtFromCalendar(value('era') === 'BC' ? 1 - year : year, Number(value('month')), day, hours + minutes / 60));
  });
}

// ── Timeline with markers ────────────────────────────────────────────────
// A time track showing a window of [from, to] within [min, max], at one of several
// zoom levels, with a draggable, keyboard-operable marker per moment (role="slider").
// options: {
//   markers: [{ key, label, color }],
//   get(key) → the marker's time; set(key, ut) → move it (the caller redraws);
//   min, max, zooms: [[label, span in days]], zoom (index),
//   lockable: offer "Move together" (both markers keep their gap),
//   decorate(from, to) → SVG markup for the track (viewBox 0 0 1000 100; a curve, ticks),
//   labels(from, to) → [{ ut, text }] shown in a row above the track,
//   active (key of the marker that keys and buttons act on), onActivate(key) }
// Returns { update() — reposition the markers; refresh() — redraw the track;
// reveal(key) — bring a marker into view; window(); active() }.
function epochTimeline(container, options) {
  const { markers, min, max, zooms } = options;
  let zoom = options.zoom ?? zooms.length - 1;
  let activeKey = options.active || markers[0].key;
  let from = min, to = max;
  container.innerHTML = `
    <div class="epoch-timeline">
      <div class="epoch-timeline-bar">
        <div class="pair-seg" data-epoch-zoom role="group" aria-label="Zoom">${zooms.map(([label], index) => `<button type="button" data-value="${index}">${label}</button>`).join('')}</div>
        <div class="epoch-pan"><button type="button" data-epoch-pan="-1" title="Earlier" aria-label="Earlier">◀</button><button type="button" data-epoch-pan="1" title="Later" aria-label="Later">▶</button></div>
        ${options.lockable ? '<label class="epoch-lock"><input type="checkbox" data-epoch-lock>Move together</label>' : ''}
      </div>
      ${options.labels ? '<div class="epoch-track-labels" data-epoch-labels aria-hidden="true"></div>' : ''}
      <div class="epoch-track" data-epoch-track>
        <svg class="epoch-track-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" data-epoch-track-svg></svg>
        ${markers.map((marker) => `<button type="button" class="epoch-thumb" role="slider" data-epoch-thumb="${marker.key}" style="--thumb:${marker.color}" aria-label="${marker.label}"></button>`).join('')}
      </div>
      <div class="epoch-axis" data-epoch-axis aria-hidden="true"></div>
    </div>`;
  const track = container.querySelector('[data-epoch-track]');
  const svg = container.querySelector('[data-epoch-track-svg]');
  const axis = container.querySelector('[data-epoch-axis]');
  const labelRow = container.querySelector('[data-epoch-labels]');
  const lock = container.querySelector('[data-epoch-lock]');
  const thumbs = Object.fromEntries(markers.map((marker) => [marker.key, container.querySelector(`[data-epoch-thumb="${marker.key}"]`)]));
  const clamp = (ut) => Math.max(min, Math.min(max, ut));
  const span = () => Math.min(zooms[zoom][1], max - min);
  const centerOn = (ut) => {
    const width = span();
    from = Math.max(min, Math.min(max - width, ut - width / 2));
    to = from + width;
  };
  const move = (key, ut) => {
    const target = clamp(ut);
    if (lock?.checked && markers.length > 1) {
      const delta = target - options.get(key);
      const others = markers.filter((marker) => marker.key !== key);
      // Keep the gap: stop at the range's ends.
      const allowed = others.reduce((value, marker) => {
        const moved = options.get(marker.key) + value;
        return moved < min ? value + (min - moved) : moved > max ? value - (moved - max) : value;
      }, delta);
      options.set(key, options.get(key) + allowed);
      others.forEach((marker) => options.set(marker.key, options.get(marker.key) + allowed));
    } else {
      options.set(key, target);
    }
  };
  const activate = (key) => {
    activeKey = key;
    Object.entries(thumbs).forEach(([thumbKey, thumb]) => thumb.classList.toggle('active', thumbKey === key));
    options.onActivate?.(key);
  };
  const axisMarkup = () => {
    const years = (to - from) / EPOCH_YEAR_DAYS;
    const place = (ut, label) => `<span style="left:${(((ut - from) / (to - from)) * 100).toFixed(3)}%">${label}</span>`;
    if (years > 2.5) {
      const raw = years / 6;
      const power = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 5, 10].map((f) => f * power).find((value) => value >= raw);
      const first = Math.ceil(epochYearOf(from) / step) * step;
      const labels = [];
      for (let year = first; year <= epochYearOf(to); year += step) {
        const ut = epochUtFromCalendar(year);
        if (ut >= from && ut <= to) labels.push(place(ut, epochYearLabel(year)));
      }
      return labels.join('');
    }
    const months = years * 12, step = [1, 2, 3, 6, 12].find((value) => value >= months / 6) || 12;
    const start = epochCalendar(from);
    const labels = [];
    for (let index = 0, y = start.year, m = start.month; index < 40; index += 1) {
      m += 1; if (m > 12) { m = 1; y += 1; }
      if ((m - 1) % step) continue;
      const ut = epochUtFromCalendar(y, m, 1);
      if (ut > to) break;
      labels.push(place(ut, `${EPOCH_MONTHS[m - 1]} ${epochYearLabel(y)}`));
    }
    return labels.join('');
  };
  const update = () => {
    markers.forEach((marker) => {
      const ut = options.get(marker.key), thumb = thumbs[marker.key];
      const inside = ut >= from && ut <= to;
      thumb.hidden = !inside;
      thumb.style.left = `${(((ut - from) / (to - from)) * 100).toFixed(3)}%`;
      thumb.setAttribute('aria-valuetext', `${marker.label}: ${epochDateText(ut)}`);
      thumb.setAttribute('aria-valuemin', String(Math.round(min)));
      thumb.setAttribute('aria-valuemax', String(Math.round(max)));
      thumb.setAttribute('aria-valuenow', String(Math.round(ut)));
    });
  };
  const refresh = () => {
    container.querySelectorAll('[data-epoch-zoom] button').forEach((button) => button.classList.toggle('active', Number(button.dataset.value) === zoom));
    svg.innerHTML = options.decorate ? options.decorate(from, to) : '';
    axis.innerHTML = axisMarkup();
    if (labelRow) labelRow.innerHTML = options.labels(from, to).map(({ ut, text }) => `<span style="left:${(((ut - from) / (to - from)) * 100).toFixed(3)}%">${text}</span>`).join('');
    update();
  };
  const reveal = (key = activeKey) => {
    const ut = options.get(key);
    if (ut < from || ut > to) { centerOn(ut); refresh(); } else update();
  };
  const timeAt = (clientX) => {
    const box = track.getBoundingClientRect();
    return clamp(from + ((clientX - box.left) / box.width) * (to - from));
  };
  // Dragging a marker, or pressing on the track (which brings the active marker there).
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const thumb = event.target.closest('[data-epoch-thumb]');
    const key = thumb ? thumb.dataset.epochThumb : activeKey;
    activate(key);
    if (!thumb) move(key, timeAt(event.clientX));
    thumbs[key].focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => move(key, timeAt(moveEvent.clientX));
    const onUp = () => { track.removeEventListener('pointermove', onMove); track.removeEventListener('pointerup', onUp); track.removeEventListener('pointercancel', onUp); };
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
    event.preventDefault();
  });
  Object.entries(thumbs).forEach(([key, thumb]) => {
    thumb.addEventListener('focus', () => activate(key));
    thumb.addEventListener('keydown', (event) => {
      const width = to - from;
      const steps = { ArrowLeft: -width / 200, ArrowRight: width / 200, ArrowDown: -width / 200, ArrowUp: width / 200, PageDown: -width / 10, PageUp: width / 10 };
      if (!(event.key in steps)) return;
      event.preventDefault();
      event.stopPropagation();
      move(key, options.get(key) + steps[event.key] * (event.shiftKey ? 10 : 1));
      reveal(key);
    });
  });
  container.querySelector('[data-epoch-zoom]').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    zoom = Number(button.dataset.value);
    centerOn(options.get(activeKey));
    refresh();
  });
  container.querySelectorAll('[data-epoch-pan]').forEach((button) => button.addEventListener('click', () => {
    const width = span();
    from = Math.max(min, Math.min(max - width, from + (Number(button.dataset.epochPan) * width) / 2));
    to = from + width;
    refresh();
  }));
  centerOn(options.get(activeKey));
  activate(activeKey);
  refresh();
  return {
    update, refresh, reveal,
    window: () => [from, to],
    active: () => activeKey,
    activate: (key) => { activate(key); reveal(key); },
    zoomTo: (index) => { zoom = index; centerOn(options.get(activeKey)); refresh(); },
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
    if (system === 'Astrology') renderEpochAstrology(surface);
    else renderEpochHumanDesign(surface);
  }).catch((error) => {
    surface.innerHTML = `<p class="intro-copy">${escapeHtml(error.message)}. Check the connection and try again.</p>`;
  });
}

// ── Keyboard ─────────────────────────────────────────────────────────────
//   , / .   previous / next event: a conjunction of the chosen pair (Astrology), a
//           sub-epoch (Human Design)
//   [ / ]   Astrology: previous / next aspect of the chosen pair; Human Design: line
//   { / }   Human Design: previous / next gate (epoch)
//   1 / 2   Astrology: the inner / outer moment is the one keys and buttons move
//   R       Astrology: reverse the two moments
//   N       the active moment to now
const EPOCH_KEYS = { ',': ['event', -1], '.': ['event', 1], '[': ['phase', -1], ']': ['phase', 1], '{': ['gate', -1], '}': ['gate', 1] };
let epochKeyHandler = null; // set by the active system: (action, direction) → handled
document.addEventListener('keydown', (event) => {
  if (currentView !== 'epoch' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (shortcutTyping(event.target) || document.querySelector('dialog[open]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const [action, direction] = EPOCH_KEYS[event.key] || ({ r: ['reverse', 0], n: ['now', 0], 1: ['marker', 0], 2: ['marker', 1] })[key] || [];
  if (action && epochKeyHandler?.(action, direction)) event.preventDefault();
});
