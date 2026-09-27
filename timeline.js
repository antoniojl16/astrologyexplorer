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

function exactChartTime(chart, offsetMinutes) {
  const base = new Date(`${chart.birthDate}T${chart.birthTime || '12:00'}:00`);
  base.setMinutes(base.getMinutes() + offsetMinutes);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  }).format(base);
}

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
function positionAngleAtTime(position, offsetMinutes) {
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
// Every timeline slider in the app (the Astrology wheel, the Human Design
// bodygraph and mandala, and the Gene Keys spheres) is built from this same
// markup and wired up with this same behavior: zoom (buttons or mouse wheel),
// and double-click to snap back to the origin moment (birth time for a real
// chart, or the current moment in the Timeline Explorer).
// Tick spacing units, largest to smallest (mirrors formatTimelineSpan's own unit
// ladder so a tick's spacing and the zoom-span label always agree), each with the
// short suffix its ticks get labeled with (e.g. "3h", "2w", "1y").
const TIMELINE_TICK_UNIT_DEFS = [
  {size: 525600, suffix: 'y'},
  {size: 43200, suffix: 'mo'},
  {size: 10080, suffix: 'w'},
  {size: 1440, suffix: 'd'},
  {size: 60, suffix: 'h'},
  {size: 1, suffix: 'm'},
];
// Ticks (not counting the 2 end ticks, which are unlabeled edge markers) are
// capped at this count — past it, native <datalist> ticks or dense text labels
// stop being readable, so spacing widens (multiples of the chosen unit) instead.
const TIMELINE_MAX_INNER_TICKS = 20;
// Picks the largest unit (year down to minute) that places at least 4 inner ticks
// across [-spanMinutes, spanMinutes], then widens the spacing (2x, 3x, ... of that
// unit) only as far as needed to stay at or under TIMELINE_MAX_INNER_TICKS. Returns
// {value, label, end} — end marks the two slider extremes (unlabeled unless they
// happen to also land on a regular tick), value is in minutes, label is empty for
// the center tick (already covered by the origin label above the slider).
function timelineTickUnit(spanMinutes) {
  return TIMELINE_TICK_UNIT_DEFS.find(def => Math.floor(spanMinutes / def.size) * 2 + 1 >= 4)
    || TIMELINE_TICK_UNIT_DEFS[TIMELINE_TICK_UNIT_DEFS.length - 1];
}
function timelineTicks(spanMinutes) {
  const unit = timelineTickUnit(spanMinutes);
  let multiplier = 1;
  while (Math.floor(spanMinutes / (unit.size * multiplier)) * 2 + 1 > TIMELINE_MAX_INNER_TICKS) multiplier += 1;
  const step = unit.size * multiplier;
  const byValue = new Map();
  const addTick = (value, label) => {
    const existing = byValue.get(value);
    byValue.set(value, {
      value,
      label: label || existing?.label || '',
      end: existing?.end || Math.abs(value) === spanMinutes,
    });
  };
  for (let value = 0; value <= spanMinutes; value += step) {
    const label = value === 0 ? '' : `${Math.round(value / unit.size)}${unit.suffix}`;
    addTick(value, label);
    if (value !== 0) addTick(-value, label);
  }
  addTick(spanMinutes, '');
  addTick(-spanMinutes, '');
  return Array.from(byValue.values()).sort((a, b) => a.value - b.value);
}
// Arrow-key steps (minutes) for a slider running from -spanMinutes to +spanMinutes.
// Up to 200 years long: Shift+arrow moves one of the tick labels' unit, a plain arrow
// one of the next smaller unit (year → month → week → day → hour → minute). Longer
// than that, by powers of ten years: up to 2,000 years 10 y / 1 y, up to 20,000 years
// 100 y / 10 y, and so on.
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
function timelineTicksMarkup(spanMinutes) {
  return timelineTicks(spanMinutes)
    .map(tick => {
      const percent = ((tick.value + spanMinutes) / (2 * spanMinutes)) * 100;
      return `<span class="timeline-tick${tick.end ? ' end' : ''}" style="left:${percent}%"><i></i><b>${tick.label}</b></span>`;
    })
    .join('');
}
function timelineSliderInnerMarkup(labelText, value = 0) {
  return `<div class="timeline-label"><span>${labelText}</span><strong data-timeline-date></strong></div><div class="timeline-exact" data-timeline-exact></div><div class="timeline-zoom" data-timeline-zoom><button type="button" class="timeline-center" data-timeline-center title="Reset to center">Center</button><button type="button" data-timeline-zoom-out aria-label="Expand timeline" title="Expand timeline">−</button><span>ZOOM</span><button type="button" data-timeline-zoom-in aria-label="Shrink timeline" title="Shrink timeline">＋</button></div><input data-timeline-slider type="range" aria-label="${labelText.charAt(0) + labelText.slice(1).toLowerCase()}" min="-1440" max="1440" step="1" value="${value}"><div class="timeline-ticks" data-timeline-ticks></div><div class="timeline-ends" data-timeline-ends><span data-timeline-origin></span></div>`;
}
function timelineSliderMarkup(labelText, value = 0) {
  return `<div class="timeline-control">${timelineSliderInnerMarkup(labelText, value)}</div>`;
}
// Fills in the date/exact-time readout the same way for every slider.
function updateTimelineReadout(container, chart, offsetMinutes) {
  container.querySelector('[data-timeline-date]').textContent = timelineOffsetLabel(offsetMinutes);
  container.querySelector('[data-timeline-exact]').textContent = exactChartTime(chart, offsetMinutes);
}
// `container` already holds the markup above. `onChange(offsetMinutes)` is whatever
// that particular view needs to re-render at the new offset — this function only
// owns the slider's own mechanics (zoom span, dblclick reset, firing onChange), and
// fires onChange once immediately so callers don't need to separately compute the
// slider's initial state.
function bindTimelineSlider(container, { onChange, originLabel = 'Birth moment', initialSpan = 1440 }) {
  const slider = container.querySelector('[data-timeline-slider]');
  const zoom = container.querySelector('[data-timeline-zoom]');
  const originEl = container.querySelector('[data-timeline-origin]');
  const tickList = container.querySelector('[data-timeline-ticks]');
  if (!slider) return null;
  let span = initialSpan;
  const updateRange = () => {
    slider.min = String(-span);
    slider.max = String(span);
    slider.value = String(Math.max(-span, Math.min(span, Number(slider.value))));
    if (originEl) originEl.textContent = originLabel;
    if (tickList) tickList.innerHTML = timelineTicksMarkup(span);
  };
  if (zoom) {
    zoom.querySelector('[data-timeline-zoom-out]')?.addEventListener('click', () => { span = Math.min(5256000000, span * 2); updateRange(); });
    zoom.querySelector('[data-timeline-zoom-in]')?.addEventListener('click', () => { span = Math.max(5, Math.round(span / 2)); updateRange(); });
  }
  const recenter = () => { slider.value = '0'; slider.dispatchEvent(new Event('input')); };
  container.querySelector('[data-timeline-center]')?.addEventListener('click', recenter);
  slider.addEventListener('wheel', event => {
    event.preventDefault();
    span = event.deltaY < 0 ? Math.max(5, Math.round(span / 2)) : Math.min(525600, span * 2);
    updateRange();
  }, {passive: false});
  slider.addEventListener('dblclick', recenter);
  // Arrow keys step by the zoom's units (timelineKeySteps) instead of the range's 1 minute.
  const ARROW_DIRECTIONS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  slider.addEventListener('keydown', event => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const steps = timelineKeySteps(span);
    const next = Number(slider.value) + direction * (event.shiftKey ? steps.large : steps.small);
    slider.value = String(Math.max(-span, Math.min(span, next)));
    slider.dispatchEvent(new Event('input'));
  });
  // Screen readers announce the moment (the date readout), not the raw minute offset.
  const dateReadout = container.querySelector('[data-timeline-date]');
  const change = () => {
    onChange(Number(slider.value));
    if (dateReadout) slider.setAttribute('aria-valuetext', dateReadout.textContent);
  };
  slider.addEventListener('input', change);
  updateRange();
  change();
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
  { key: 'Earth', glyph: '⊕', group: 'Secondary' },
];
const wheelHiddenBodies = new Set(['Earth']);
function wheelBodyVisible(name) {
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
  if (!meanMotion) return null;
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
    const strokeWidth = aspect.intensity === 'exact' ? 4 : aspect.intensity === 'normal' ? 1.1 : 0.8;
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
  const zodiacWidth = outer - inner;
  const planetRingWidth = Math.round(zodiacWidth * 1.1);
  const aspectR = inner - planetRingWidth;
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
  markup += wheelHousesMarkup(cx, cy, aspectR, inner, houseCusps, wheelRotation);
  // Hidden bodies are dropped before clustering and aspects, so they neither push
  // neighbouring glyphs aside nor leave aspect lines behind.
  const markerPositions = chart.positions
    .filter(position => wheelBodyVisible(position.name))
    .map(position => ({...position, color: 'var(--ink)', angle: (wheelRotation - positionAngleAtTime(position, offsetMinutes) + 360) % 360, motion: wheelMotion(position, offsetMinutes)}));
  spreadClusteredAngles(markerPositions);
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
  markerPositions.forEach(position => { markup += planetMarkerMarkup(cx, cy, inner, position, planetRingWidth); });
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