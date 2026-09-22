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
// the Ascendant there when unfixed. Two independent toggles since the chart
// wheel and the cycle wheel are separate renderings the user may want set
// differently.
let astroWheelFixedToAries = false;
let cycleWheelFixedToAries = false;
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
  const period = ORBITAL_PERIODS[position.name] || ANGULAR_PERIODS[position.name] || 0;
  return baseAngle + (period ? offsetMinutes / (period * 1440) * 360 : 0);
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
    const date = new Date(ascendant.birthMoment);
    date.setMinutes(date.getMinutes() + offsetMinutes);
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
function timelineTicks(spanMinutes) {
  let unit = TIMELINE_TICK_UNIT_DEFS[TIMELINE_TICK_UNIT_DEFS.length - 1];
  for (const def of TIMELINE_TICK_UNIT_DEFS) {
    if (Math.floor(spanMinutes / def.size) * 2 + 1 >= 4) {
      unit = def;
      break;
    }
  }
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
function timelineTicksMarkup(spanMinutes) {
  return timelineTicks(spanMinutes)
    .map(tick => {
      const percent = ((tick.value + spanMinutes) / (2 * spanMinutes)) * 100;
      return `<span class="timeline-tick${tick.end ? ' end' : ''}" style="left:${percent}%"><i></i><b>${tick.label}</b></span>`;
    })
    .join('');
}
function timelineSliderInnerMarkup(labelText, value = 0) {
  return `<div class="timeline-label"><span>${labelText}</span><strong data-timeline-date></strong></div><div class="timeline-exact" data-timeline-exact></div><div class="timeline-zoom" data-timeline-zoom><button type="button" class="timeline-center" data-timeline-center title="Reset to center">Center</button><button type="button" data-timeline-zoom-out aria-label="Expand timeline" title="Expand timeline">−</button><span>ZOOM</span><button type="button" data-timeline-zoom-in aria-label="Shrink timeline" title="Shrink timeline">＋</button></div><input data-timeline-slider type="range" min="-1440" max="1440" step="1" value="${value}"><div class="timeline-ticks" data-timeline-ticks></div><div class="timeline-ends" data-timeline-ends><span data-timeline-origin></span></div>`;
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
  slider.addEventListener('input', () => onChange(Number(slider.value)));
  updateRange();
  onChange(Number(slider.value));
  return slider;
}

function renderPreciseWheel(chart, offsetMinutes, targetId = 'chartWheel') {
  const svg = document.getElementById(targetId);
  const cx = 300, cy = 300, outer = 250, inner = 202;
  if (!svg) return;
  let markup = `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${inner - 34}" fill="none" stroke="var(--line)" stroke-width="1" opacity=".8"/>`;
  const ascendant = chart.positions.find(position => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, offsetMinutes) : 0;
  // Fixed: the Aries cusp (0°) occupies the same leftmost point the Ascendant
  // normally does. Unfixed, the Ascendant sits leftmost at equivalent-angle 270
  // (wheelRotation - ascendantAngle = 270 + ascendantAngle - ascendantAngle);
  // fixed, the Aries cusp (trueAngle 0) needs that same equivalent-angle 270,
  // so wheelRotation - 0 = 270.
  const wheelRotation = astroWheelFixedToAries ? 270 : (270 + ascendantAngle + 360) % 360;
  const houseCusps = houseCuspsAtTime(chart, offsetMinutes);
  for (let index = 0; index < 12; index += 1) {
    const zodiacAngle = (wheelRotation - index * 30 - 90) * Math.PI / 180;
    const x1 = cx + inner * Math.cos(zodiacAngle), y1 = cy + inner * Math.sin(zodiacAngle);
    const x2 = cx + outer * Math.cos(zodiacAngle), y2 = cy + outer * Math.sin(zodiacAngle);
    // -PI/12 (not +): zodiacAngle is this sign's OWN starting cusp, and bearing
    // decreases with index (signs sweep counterclockwise) — so centering the
    // label within its own 30° wedge means going further in the decreasing
    // direction. +PI/12 would land it in the previous sign's wedge instead.
    const labelX = cx + (outer - 18) * Math.cos(zodiacAngle - Math.PI / 12);
    const labelY = cy + (outer - 18) * Math.sin(zodiacAngle - Math.PI / 12);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)"/><text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="wheel-sign ${SIGN_ELEMENTS[index]}">${SIGN_GLYPHS[index]}</text>`;
  }
  houseCusps.forEach((cusp, index) => {
    const houseAngle = (wheelRotation - cusp - 90) * Math.PI / 180;
    const x1 = cx + (inner - 34) * Math.cos(houseAngle), y1 = cy + (inner - 34) * Math.sin(houseAngle);
    const x2 = cx + inner * Math.cos(houseAngle), y2 = cy + inner * Math.sin(houseAngle);
    const labelAngle = (wheelRotation - cusp - 15 - 90) * Math.PI / 180;
    const labelX = cx + (inner - 50) * Math.cos(labelAngle), labelY = cy + (inner - 50) * Math.sin(labelAngle);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="house-cusp"/><text x="${labelX}" y="${labelY}" class="house-number" text-anchor="middle" dominant-baseline="middle">${index + 1}</text>`;
  });
  const markerPositions = chart.positions.map(position => ({...position, angle: (wheelRotation - positionAngleAtTime(position, offsetMinutes) + 360) % 360}));
  spreadClusteredAngles(markerPositions);
  // Aspect lines connect planets' TRUE positions (position.angle), not the spread-out
  // display markers — traditional wheels never spread the lines themselves. Distances
  // between angles are rotation-invariant, so reusing this wheel-space `angle` (rather
  // than re-deriving the raw zodiac angle) gives the same aspect orbs calculateAspects
  // would compute from the unrotated positions.
  if (typeof calculateAspects === 'function') {
    const aspectRadius = inner - 34;
    const wheelPoint = angle => {
      const rad = (angle - 90) * Math.PI / 180;
      return { x: cx + aspectRadius * Math.cos(rad), y: cy + aspectRadius * Math.sin(rad) };
    };
    const angleByName = new Map(markerPositions.map(position => [position.name, position.angle]));
    const aspects = calculateAspects({positions: markerPositions}, aspectMode === 'all');
    markup += aspects.map(aspect => {
      const p1 = wheelPoint(angleByName.get(aspect.first)), p2 = wheelPoint(angleByName.get(aspect.second));
      const strokeWidth = aspect.intensity === 'exact' ? 4 : aspect.intensity === 'normal' ? 1.1 : 0.8;
      const dash = aspect.intensity === 'weak' ? ' stroke-dasharray="3 3"' : '';
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${aspect.color}" stroke-width="${strokeWidth}" opacity=".7"${dash} class="aspect-line"/>`;
    }).join('');
  }
  markerPositions.forEach(position => { markup += planetMarkerMarkup(cx, cy, inner, position); });
  //markup += `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--accent)"/>`;
  svg.innerHTML = markup;
  svg.querySelectorAll('.planet-marker').forEach(node => node.addEventListener('click', () => showToast(`${node.dataset.planet} · click for placement details`)));
}

function initPreciseTimeline() {
  const container = document.querySelector('[data-astro-timeline]');
  if (!container) return;
  container.innerHTML = timelineSliderInnerMarkup('CHART TIMELINE', 0);
  const houseControl = document.querySelector('.chart-toolbar-right .zodiac-chip:nth-child(2)');
  const zodiacControl = document.querySelector('.chart-toolbar-right .zodiac-chip:nth-child(1)');
  const slider = container.querySelector('[data-timeline-slider]');
  if (zodiacControl) {
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
    houseControl.classList.add('house-system-toggle');
    houseControl.setAttribute('role', 'button');
    houseControl.tabIndex = 0;
    houseControl.title = 'Switch house system';
    houseControl.addEventListener('click', () => {
      houseSystem = houseSystem === 'Placidus' ? 'Equal Houses' : 'Placidus';
      houseControl.textContent = `⌂ ${houseSystem}`;
      const chart = currentExplorerChart();
      if (chart) renderPreciseWheel(chart, Number(slider.value));
    });
  }
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
      const placementList = document.getElementById('placementList');
      if (placementList) placementList.innerHTML = chart.positions.slice(0, 6).map(position => {
        const angle = positionAngleAtTime(position, offsetMinutes);
        return `<div class="placement"><span class="placement-glyph">${position.glyph}</span><span class="placement-name">${position.name}<small class="placement-house"> · House ${position.house}</small></span><span class="placement-degree">${angle.toFixed(1)}°</span></div>`;
      }).join('');
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

function updateDisplayedSigns(chart, offsetMinutes) {
  const sun = chart.positions.find(position => position.name === 'Sun');
  if (!sun) return;
  const displayedSun = displaySignAtTime(sun, offsetMinutes);
  const sunIndex = SIGNS.indexOf(displayedSun.sign);
  const sunGlyph = document.getElementById('sunGlyph');
  const sunSign = document.getElementById('sunSign');
  const sunDegree = document.getElementById('sunDegree');
  if (sunGlyph) sunGlyph.textContent = SIGN_GLYPHS[sunIndex];
  if (sunSign) sunSign.textContent = displayedSun.sign;
  if (sunDegree) sunDegree.textContent = `${displayedSun.degree.toFixed(1)}° · ${sun.house}th house`;
  const placementList = document.getElementById('placementList');
  if (placementList) placementList.innerHTML = chart.positions.slice(0, 6).map(position => {
    const displayed = displaySignAtTime(position, offsetMinutes);
    return `<div class="placement"><span class="placement-glyph">${position.glyph}</span><span class="placement-name">${position.name}<small class="placement-house"> · House ${position.house}</small></span><span class="placement-degree">${displayed.sign} ${displayed.degree.toFixed(1)}°</span></div>`;
  }).join('');
}

initPreciseTimeline();