const CYCLE_DEFINITIONS = [
  {key: 'saturn-return', label: 'Saturn Return', planet: 'Saturn', periodYears: 29.457, kind: 'return', description: 'Saturn completes its natal orbit and meets itself again — a marker of maturity and structural reckoning.'},
  {key: 'jupiter-return', label: 'Jupiter Return', planet: 'Jupiter', periodYears: 11.862, kind: 'return', description: 'Jupiter returns to its natal degree roughly every 12 years, opening a fresh cycle of growth and opportunity.'},
  {key: 'chiron-return', label: 'Chiron Return', planet: 'Chiron', periodYears: 50.0, kind: 'return', description: 'Chiron completes its long, eccentric orbit — often felt as a reckoning with the wound and the healer archetype.'},
  {key: 'uranus-opposition', label: 'Uranus Opposition', planet: 'Uranus', periodYears: 84.011, kind: 'opposition', description: 'Transiting Uranus opposes its natal position at the orbital midpoint — the archetypal "midlife" awakening.'},
  {key: 'uranus-return', label: 'Uranus Return', planet: 'Uranus', periodYears: 84.011, kind: 'return', description: 'Uranus completes a full orbit and returns to its natal degree.'},
  {key: 'nodal-return', label: 'Nodal Return', planet: 'North Node', periodYears: 18.6, kind: 'return', description: 'The lunar nodes complete their cycle and return to their natal axis roughly every 18.6 years.'}
];
let cycleChartId = null;
let activeCycleKey = 'saturn-return';
let activeOccurrenceIndex = 0;
let cycleSliderOffsetDays = 0;
const cycleAstrologyMarkup = document.getElementById('cycleSystemSurface')?.innerHTML;

function computeCycleOccurrences(chart, cycleDef, maxAgeYears = 100) {
  const birthMoment = chartBirthMomentUTC(chart);
  const periodMs = cycleDef.periodYears * 365.25 * 86400000;
  const startMultiplier = cycleDef.kind === 'opposition' ? 0.5 : 1;
  const raw = Array.from({length: 10}, (_, index) => {
    const multiplier = startMultiplier + index;
    return {index, date: new Date(birthMoment.getTime() + multiplier * periodMs), ageYears: multiplier * cycleDef.periodYears};
  });
  const withinLifetime = raw.filter(occurrence => occurrence.ageYears <= maxAgeYears);
  return withinLifetime.length ? withinLifetime : raw.slice(0, 1);
}

function defaultOccurrenceIndex(occurrences) {
  const now = Date.now();
  let bestIndex = 0, bestDiff = Infinity;
  occurrences.forEach((occurrence, index) => {
    const diff = Math.abs(occurrence.date.getTime() - now);
    if (diff < bestDiff) { bestDiff = diff; bestIndex = index; }
  });
  return bestIndex;
}

function renderCycleWheel(chart, offsetMinutes) {
  const svg = document.getElementById('cycleWheel');
  if (!svg) return;
  const cx = 300, cy = 300, outer = 250, houseInner = 202;
  let markup = `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${houseInner}" fill="none" stroke="var(--line)" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${houseInner - 34}" fill="none" stroke="var(--line)" stroke-width="1" opacity=".8"/><circle cx="${cx}" cy="${cy}" r="${houseInner - 70}" fill="none" stroke="var(--line)" stroke-width="1" opacity=".6"/>`;
  const ascendant = chart.positions.find(position => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, 0) : 0;
  const wheelRotation = cycleWheelFixedToAries ? 270 : (270 + ascendantAngle + 360) % 360;
  const houseCusps = houseCuspsAtTime(chart, 0);
  for (let index = 0; index < 12; index += 1) {
    const zodiacAngle = (wheelRotation - index * 30 - 90) * Math.PI / 180;
    const x1 = cx + houseInner * Math.cos(zodiacAngle), y1 = cy + houseInner * Math.sin(zodiacAngle);
    const x2 = cx + outer * Math.cos(zodiacAngle), y2 = cy + outer * Math.sin(zodiacAngle);
    // -PI/12, not +: centers the label in its OWN wedge rather than the previous
    // sign's (see the matching comment in timeline.js's renderPreciseWheel).
    const labelX = cx + (outer - 18) * Math.cos(zodiacAngle - Math.PI / 12), labelY = cy + (outer - 18) * Math.sin(zodiacAngle - Math.PI / 12);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)"/><text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="wheel-sign ${SIGN_ELEMENTS[index]}">${SIGN_GLYPHS[index]}</text>`;
  }
  houseCusps.forEach((cusp, index) => {
    const houseAngle = (wheelRotation - cusp - 90) * Math.PI / 180;
    const x1 = cx + (houseInner - 70) * Math.cos(houseAngle), y1 = cy + (houseInner - 70) * Math.sin(houseAngle);
    const x2 = cx + houseInner * Math.cos(houseAngle), y2 = cy + houseInner * Math.sin(houseAngle);
    const labelAngle = (wheelRotation - cusp - 15 - 90) * Math.PI / 180;
    const labelX = cx + (houseInner - 86) * Math.cos(labelAngle), labelY = cy + (houseInner - 86) * Math.sin(labelAngle);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="house-cusp"/><text x="${labelX}" y="${labelY}" class="house-number" text-anchor="middle" dominant-baseline="middle">${index + 1}</text>`;
  });
  const natalPositions = chart.positions.map(position => ({...position, design: false, angle: (wheelRotation - positionAngleAtTime(position, 0) + 360) % 360}));
  spreadClusteredAngles(natalPositions);
  natalPositions.forEach(position => { markup += planetMarkerMarkup(cx, cy, houseInner, position); });
  const transitPositions = chart.positions.map(position => ({...position, design: true, angle: (wheelRotation - positionAngleAtTime(position, offsetMinutes) + 360) % 360}));
  spreadClusteredAngles(transitPositions);
  transitPositions.forEach(position => { markup += planetMarkerMarkup(cx, cy, houseInner - 33, position); });
  // markup += `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--accent)"/>`;
  svg.innerHTML = markup;
  svg.querySelectorAll('.planet-marker').forEach(node => node.addEventListener('click', () => showToast(`${node.dataset.planet} · click for placement details`)));
}

function updateCycleMoment(chart, cycleDef, occurrence) {
  const displayedDate = new Date(occurrence.date.getTime() + cycleSliderOffsetDays * 86400000);
  const birthMoment = chartBirthMomentUTC(chart);
  const offsetMinutes = (displayedDate.getTime() - birthMoment.getTime()) / 60000;
  document.getElementById('cycleDate').textContent = new Intl.DateTimeFormat('en-US', {year: 'numeric', month: 'long', day: 'numeric'}).format(displayedDate);
  renderCycleWheel(chart, offsetMinutes);
  const focusPlanet = chart.positions.find(position => position.name === cycleDef.planet);
  const info = document.getElementById('cycleInfoPanel');
  if (!info) return;
  const viewingLabel = cycleSliderOffsetDays === 0 ? 'Exact cycle moment' : `${cycleSliderOffsetDays > 0 ? '+' : ''}${cycleSliderOffsetDays} days from anchor`;
  info.innerHTML = `<div class="signature-card"><span class="eyebrow">${cycleDef.label.toUpperCase()}</span><h3>${chart.name}</h3><p>${cycleDef.description}</p></div><div class="system-stat"><span>CYCLE PLANET</span><strong>${focusPlanet ? focusPlanet.glyph + ' ' + cycleDef.planet : cycleDef.planet}</strong></div><div class="system-stat"><span>ANCHOR DATE</span><strong>${formatDate(occurrence.date.toISOString().slice(0, 10))}</strong></div><div class="system-stat"><span>AGE AT CYCLE</span><strong>${Math.round(occurrence.ageYears)}</strong></div><div class="system-stat"><span>CURRENTLY VIEWING</span><strong>${viewingLabel}</strong></div><div class="system-note">Cycle dates are approximated from average orbital periods against sample planetary positions — not yet a true ephemeris lookup.</div>`;
}

function renderCycleExplorer() {
  const view = document.getElementById('cycleView');
  if (!view) return;
  const charts = activeCharts();
  const surface = document.getElementById('cycleSystemSurface');
  if (!charts.length) { surface.innerHTML = '<p class="intro-copy">Add a chart to the library before exploring its cycles.</p>'; return; }
  if (!cycleChartId || !charts.some(chart => chart.id === cycleChartId)) cycleChartId = selectedChartId && charts.some(chart => chart.id === selectedChartId) ? selectedChartId : charts[0].id;
  const chart = chartById(cycleChartId);
  const select = document.getElementById('cycleChartSelect');
  if (select) {
    select.innerHTML = charts.map(item => `<option value="${item.id}" ${item.id === cycleChartId ? 'selected' : ''}>${item.name}</option>`).join('');
    select.onchange = () => { cycleChartId = select.value; activeOccurrenceIndex = 0; cycleSliderOffsetDays = 0; renderCycleExplorer(); };
  }
  const tabs = document.getElementById('cycleTypeTabs');
  if (tabs) {
    tabs.innerHTML = CYCLE_DEFINITIONS.map(def => `<button type="button" class="${def.key === activeCycleKey ? 'active' : ''}" data-cycle-key="${def.key}">${def.label}</button>`).join('');
    tabs.querySelectorAll('[data-cycle-key]').forEach(button => button.addEventListener('click', () => { activeCycleKey = button.dataset.cycleKey; activeOccurrenceIndex = 0; cycleSliderOffsetDays = 0; renderCycleExplorer(); }));
  }
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  const occurrences = computeCycleOccurrences(chart, cycleDef);
  if (activeOccurrenceIndex >= occurrences.length) activeOccurrenceIndex = defaultOccurrenceIndex(occurrences);
  const occurrenceRow = document.getElementById('cycleOccurrenceRow');
  if (occurrenceRow) {
    occurrenceRow.innerHTML = occurrences.map((occurrence, index) => `<button type="button" class="cycle-chip ${index === activeOccurrenceIndex ? 'active' : ''} ${occurrence.date.getTime() < Date.now() ? 'past' : 'future'}" data-occurrence-index="${index}">${occurrence.date.getFullYear()} <small>age ${Math.round(occurrence.ageYears)}</small></button>`).join('');
    occurrenceRow.querySelectorAll('[data-occurrence-index]').forEach(button => button.addEventListener('click', () => {
      activeOccurrenceIndex = Number(button.dataset.occurrenceIndex);
      cycleSliderOffsetDays = 0;
      const slider = document.getElementById('cycleSlider');
      if (slider) slider.value = '0';
      occurrenceRow.querySelectorAll('.cycle-chip').forEach((chip, index) => chip.classList.toggle('active', index === activeOccurrenceIndex));
      updateCycleMoment(chart, cycleDef, occurrences[activeOccurrenceIndex]);
    }));
  }
  const occurrence = occurrences[activeOccurrenceIndex];
  cycleSliderOffsetDays = 0;
  const slider = document.getElementById('cycleSlider');
  if (slider) slider.value = '0';
  // The cycle slider's span is fixed (±180 days, no zoom), so its ticks never
  // change — but the surface (and this tick row) gets rebuilt from scratch every
  // time switchCycleSystem() returns to Astrology, so it still needs refilling
  // here rather than once at load. timelineTicksMarkup works in minutes, so the
  // ±180-day span is converted going in.
  const tickList = document.getElementById('cycleTicks');
  if (tickList && typeof timelineTicksMarkup === 'function') tickList.innerHTML = timelineTicksMarkup(180 * 1440);
  const summaryLabel = document.getElementById('cycleSummaryLabel');
  if (summaryLabel) summaryLabel.textContent = `${cycleDef.label.toUpperCase()} · AGE ${Math.round(occurrence.ageYears)}`;
  const anchorLabel = document.getElementById('cycleAnchorLabel');
  if (anchorLabel) anchorLabel.textContent = `${cycleDef.label} · ${formatDate(occurrence.date.toISOString().slice(0, 10))}`;
  // switchCycleSystem() rebuilds this surface from a cached markup string when
  // returning to Astrology, wiping any previously bound listener — rebind here,
  // on every render, same as the tabs/occurrence-row buttons above.
  const fixZodiacToggle = document.getElementById('fixZodiacToggleCycle');
  if (fixZodiacToggle) {
    fixZodiacToggle.checked = cycleWheelFixedToAries;
    fixZodiacToggle.onchange = () => {
      cycleWheelFixedToAries = fixZodiacToggle.checked;
      updateCycleMoment(chart, cycleDef, occurrences[activeOccurrenceIndex]);
    };
  }
  updateCycleMoment(chart, cycleDef, occurrence);
}

function switchCycleSystem(system) {
  const surface = document.getElementById('cycleSystemSurface');
  if (!surface) return;
  document.querySelectorAll('[data-cycle-system]').forEach(item => item.classList.toggle('active', item.dataset.cycleSystem === system));
  if (system === 'Astrology') { surface.innerHTML = cycleAstrologyMarkup; renderCycleExplorer(); return; }
  surface.innerHTML = `<div class="system-visual" style="padding:40px"><p class="intro-copy">${system} cycle overlays (a composite bodygraph or dual Gene Keys reading at the cycle moment) are coming in a future iteration. For now, explore the Astrology cycle wheel.</p></div>`;
}

function initCycleExplorer() {
  document.querySelectorAll('[data-cycle-system]').forEach(button => button.addEventListener('click', () => switchCycleSystem(button.dataset.cycleSystem)));
  document.getElementById('cycleSlider')?.addEventListener('input', event => {
    cycleSliderOffsetDays = Number(event.target.value);
    const chart = chartById(cycleChartId);
    if (!chart) return;
    const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
    const occurrence = computeCycleOccurrences(chart, cycleDef)[activeOccurrenceIndex];
    updateCycleMoment(chart, cycleDef, occurrence);
  });
  document.getElementById('cycleButton')?.addEventListener('click', () => {
    if (selectedChartId) { cycleChartId = selectedChartId; activeOccurrenceIndex = 0; cycleSliderOffsetDays = 0; }
    setView('cycle');
  });
}

initCycleExplorer();
