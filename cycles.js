// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
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
// Which system tab the Cycle Explorer shows, and the Human Design / Gene Keys views' own state.
let cycleActiveSystem = 'Astrology';
let cycleHdView = 'bodygraph';
let cycleGkTab = 'All Paths';
const cycleAstroState = { subject: 'synastry', view: 'wheel' };

// Exact cycle moments, computed on demand from the same ephemeris every view uses: each
// time the cycle planet reaches its natal degree (a return) or the degree opposite it (an
// opposition), from birth to age 101. The planet's position is sampled every few days,
// each crossing is refined by bisection to the minute, and crossings close together —
// the planet going back and forth over the degree while retrograde — are grouped into one
// occurrence, dated by its first crossing, with every crossing kept in `passes`.
const CYCLE_MAX_AGE_YEARS = 101;
const CYCLE_DAY_MINUTES = 1440, CYCLE_YEAR_MINUTES = 365.25 * 1440;
const cycleOccurrenceCache = new Map();
function computeCycleOccurrences(chart, cycleDef, maxAgeYears = CYCLE_MAX_AGE_YEARS) {
  const position = chart.positions.find(item => item.name === cycleDef.planet);
  if (!position) return [];
  const cacheKey = [chart.id, cycleDef.key, position.birthMoment, EPHEMERIS_ENGINE, LUNAR_NODE_MODE, maxAgeYears].join('|');
  if (cycleOccurrenceCache.has(cacheKey)) return cycleOccurrenceCache.get(cacheKey);
  const birth = chartBirthMomentUTC(chart).getTime();
  const target = (positionAngleAtTime(position, 0) + (cycleDef.kind === 'opposition' ? 180 : 0)) % 360;
  // Signed distance (−180..180°) from the target degree, `minutes` after birth.
  const gap = minutes => ((positionAngleAtTime(position, minutes) - target + 540) % 360) - 180;
  // The true lunar node wobbles back and forth within days, so it's sampled daily.
  const step = (cycleDef.planet === 'North Node' ? 1 : 4) * CYCLE_DAY_MINUTES;
  // A return can't happen in the first half of the planet's period (skips the birth moment itself).
  const start = cycleDef.kind === 'return' ? cycleDef.periodYears * 0.5 * CYCLE_YEAR_MINUTES : 0;
  const end = maxAgeYears * CYCLE_YEAR_MINUTES;
  const crossings = [];
  let previousTime = start, previousGap = gap(start);
  for (let time = start + step; time <= end; time += step) {
    const currentGap = gap(time);
    // A sign change near 0° is a crossing; one near ±180° is just the wrap-around.
    if (Math.sign(currentGap) !== Math.sign(previousGap) && Math.abs(currentGap) < 90 && Math.abs(previousGap) < 90) {
      let low = previousTime, high = time, lowGap = previousGap;
      while (high - low > 1) {
        const middle = (low + high) / 2, middleGap = gap(middle);
        if (Math.sign(middleGap) === Math.sign(lowGap)) { low = middle; lowGap = middleGap; } else high = middle;
      }
      crossings.push((low + high) / 2);
    }
    previousTime = time;
    previousGap = currentGap;
  }
  // Crossings within a quarter of the period (at most two years) of the previous one
  // belong to the same occurrence.
  const window = Math.min(cycleDef.periodYears * 0.25, 2) * CYCLE_YEAR_MINUTES;
  const groups = [];
  crossings.forEach(time => {
    const group = groups[groups.length - 1];
    if (group && time - group[group.length - 1] < window) group.push(time);
    else groups.push([time]);
  });
  const occurrences = groups.map((group, index) => ({
    index,
    date: new Date(birth + group[0] * 60000),
    ageYears: group[0] / CYCLE_YEAR_MINUTES,
    passes: group.map(time => new Date(birth + time * 60000)),
  }));
  cycleOccurrenceCache.set(cacheKey, occurrences);
  return occurrences;
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

function renderCycleExplorer() {
  const view = document.getElementById('cycleView');
  if (!view) return;
  const charts = activeCharts();
  const surface = document.getElementById('cycleSystemSurface');
  const signature = document.getElementById('cycleSignature');
  if (!charts.length) { surface.innerHTML = '<p class="intro-copy">Add a chart to the library before exploring its cycles.</p>'; return; }
  if (!cycleChartId || !charts.some(chart => chart.id === cycleChartId)) cycleChartId = selectedChartId && charts.some(chart => chart.id === selectedChartId) ? selectedChartId : charts[0].id;
  const chart = chartById(cycleChartId);
  const select = document.getElementById('cycleChartSelect');
  if (select) {
    select.innerHTML = charts.map(item => `<option value="${item.id}" ${item.id === cycleChartId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    select.onchange = () => { cycleChartId = select.value; activeOccurrenceIndex = 0; renderCycleExplorer(); };
  }
  const tabs = document.getElementById('cycleTypeTabs');
  if (tabs) {
    tabs.innerHTML = CYCLE_DEFINITIONS.map(def => `<button type="button" class="${def.key === activeCycleKey ? 'active' : ''}" data-cycle-key="${def.key}">${def.label}</button>`).join('');
    tabs.querySelectorAll('[data-cycle-key]').forEach(button => button.addEventListener('click', () => { activeCycleKey = button.dataset.cycleKey; activeOccurrenceIndex = 0; renderCycleExplorer(); }));
  }
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  const occurrences = computeCycleOccurrences(chart, cycleDef);
  const occurrenceRow = document.getElementById('cycleOccurrenceRow');
  if (!occurrences.length) {
    if (occurrenceRow) occurrenceRow.innerHTML = `<p class="intro-copy">No ${cycleDef.label} happens before age ${CYCLE_MAX_AGE_YEARS} for this chart.</p>`;
    if (signature) signature.innerHTML = '';
    return;
  }
  if (activeOccurrenceIndex >= occurrences.length) activeOccurrenceIndex = defaultOccurrenceIndex(occurrences);
  if (occurrenceRow) {
    occurrenceRow.innerHTML = occurrences.map((occurrence, index) => `<button type="button" class="cycle-chip ${index === activeOccurrenceIndex ? 'active' : ''} ${occurrence.date.getTime() < Date.now() ? 'past' : 'future'}" data-occurrence-index="${index}">${occurrence.date.getFullYear()} <small>age ${Math.round(occurrence.ageYears)}</small></button>`).join('');
    occurrenceRow.querySelectorAll('[data-occurrence-index]').forEach(button => button.addEventListener('click', () => {
      activeOccurrenceIndex = Number(button.dataset.occurrenceIndex);
      occurrenceRow.querySelectorAll('.cycle-chip').forEach((chip, index) => chip.classList.toggle('active', index === activeOccurrenceIndex));
      renderCycleSignature();
      renderCycleSystemView();
    }));
  }
  renderCycleSignature();
  renderCycleSystemView();
}

// Top and center, above the system tabs: which cycle this is, when it's exact, and what
// it means — shared by every system tab.
function renderCycleSignature() {
  const signature = document.getElementById('cycleSignature');
  const context = cycleContext();
  if (!signature || !context) return;
  const { cycleDef, occurrence } = context;
  const passes = occurrence.passes.map(pass => formatDate(pass.toISOString().slice(0, 10))).join(' · ');
  const how = `Transiting ${cycleDef.planet} reaches ${cycleDef.kind === 'opposition' ? 'the degree opposite ' : ''}its natal degree — exact ${occurrence.passes.length > 1 ? `${occurrence.passes.length} times while retrograde` : 'once'}: ${passes}.`;
  signature.innerHTML = `
    <span class="eyebrow">${escapeHtml(context.chart.name.toUpperCase())} · AGE ${occurrence.ageYears.toFixed(1)}</span>
    <h3>${context.cycleName}</h3>
    <p>${cycleDef.description}</p>
    <p class="cycle-signature-note">${how}</p>`;
}

function switchCycleSystem(system) {
  const surface = document.getElementById('cycleSystemSurface');
  if (!surface) return;
  cycleActiveSystem = system;
  document.querySelectorAll('[data-cycle-system]').forEach(item => item.classList.toggle('active', item.dataset.cycleSystem === system));
  if (system === 'Astrocartography') { renderAstrocartographyPanel(surface, chartById(cycleChartId)); return; }
  renderCycleSystemView();
}

// ── Human Design and Gene Keys at the cycle moment ─────────────────────────
// The selected chart, cycle and occurrence, and the occurrence's moment as minutes after
// birth — what the Human Design and Gene Keys cycle views draw from.
function cycleContext() {
  const chart = chartById(cycleChartId);
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  if (!chart || !cycleDef) return null;
  const occurrence = computeCycleOccurrences(chart, cycleDef)[activeOccurrenceIndex];
  if (!occurrence) return null;
  const anchorOffset = (occurrence.date.getTime() - chartBirthMomentUTC(chart).getTime()) / 60000;
  return {
    chart, cycleDef, occurrence, anchorOffset,
    anchorLabel: `${cycleDef.label} · ${formatDate(occurrence.date.toISOString().slice(0, 10))}`,
    cycleName: `${cycleDef.label} ${occurrence.date.getFullYear()}`,
  };
}
// Re-renders the Astrology, Human Design or Gene Keys cycle view for the current selection
// (the Astrocartography tab is left as it is).
function renderCycleSystemView() {
  const surface = document.getElementById('cycleSystemSurface');
  const context = cycleContext();
  if (!surface || !context) return;
  if (cycleActiveSystem === 'Astrology') renderCycleAstrology(surface, context);
  if (cycleActiveSystem === 'Human Design') renderCycleHumanDesign(surface, context);
  if (cycleActiveSystem === 'Gene Keys') renderCycleGeneKeys(surface, context);
}
// The slider under each cycle chart moves only the cycle moment (the natal chart stays
// put); its readout shows the offset from the exact cycle moment and the date.
function bindCycleSlider(container, context, onChange) {
  bindTimelineSlider(container, {
    originLabel: context.anchorLabel,
    initialSpan: 30 * 1440,
    onChange: offset => {
      container.querySelector('[data-timeline-date]').textContent = offset === 0
        ? 'Exact cycle moment'
        : `${offset > 0 ? '+' : '-'}${formatTimelineSpan(offset)} from the cycle moment`;
      container.querySelector('[data-timeline-exact]').textContent = exactChartTime(context.chart, context.anchorOffset + offset);
      onChange(context.anchorOffset + offset);
    },
  });
}
const CYCLE_NATAL_COLOR = 'var(--pair-blue)', CYCLE_MOMENT_COLOR = 'var(--pair-green)';

// Astrology: the Pair Explorer's synastry view with the natal chart inside (blue) and the
// sky at the cycle moment around it (red), cross-aspects between them, and a slider that
// moves only the cycle moment.
const CYCLE_ASTRO_SUBJECTS = [['synastry', 'Synastry'], ['A', 'Natal'], ['B', 'Cycle']];
function renderCycleAstrology(surface, context) {
  const { chart } = context;
  const people = {
    A: { key: 'A', chart, color: 'var(--blue)', name: 'Natal', tag: 'natal', housesName: 'natal house', legend: `Natal · ${escapeHtml(chart.name)}`, offset: 0 },
    B: { key: 'B', chart, color: 'var(--accent)', name: 'Cycle', tag: 'cycle', legend: `Cycle moment · ${context.cycleName}`, offset: context.anchorOffset },
  };
  const view = renderSynastryView(surface, people, { subjects: CYCLE_ASTRO_SUBJECTS, state: cycleAstroState, wheelId: 'cycleWheel', footer: timelineSliderMarkup('CYCLE MOMENT', 0) });
  bindCycleSlider(surface.querySelector('.timeline-control'), context, offset => {
    people.B.offset = offset;
    view.draw();
  });
}

function renderCycleHumanDesign(surface, context) {
  const { chart, cycleDef } = context;
  surface.innerHTML = `
    <div class="pair-hd-layout cycle-system-layout">
      <div class="system-visual">
        <div class="panel-toolbar pair-astro-toolbar">
          ${pairSegmentedMarkup('data-cycle-hd-view', PAIR_HD_VIEWS, cycleHdView)}
          <span class="eyebrow cycle-toolbar-label">${context.anchorLabel.toUpperCase()}</span>
        </div>
        <div class="pair-hd-stage">
          <div class="pair-legend">
            <span><i class="legend-dot" style="background:${CYCLE_NATAL_COLOR}"></i>Natal · ${escapeHtml(chart.name)}</span>
            <span><i class="legend-dot" style="background:${CYCLE_MOMENT_COLOR}"></i>Cycle moment · ${context.cycleName}</span>
            <span><i class="legend-swatch halo"></i>Electromagnetic — formed only together</span>
          </div>
          <div data-cycle-graphic></div>
        </div>
        ${timelineSliderMarkup('CYCLE MOMENT', 0)}
      </div>
      <aside class="system-info" data-cycle-info></aside>
    </div>`;
  let momentOffset = context.anchorOffset;
  const draw = () => {
    const composite = computeCycleHumanDesign(chart, momentOffset);
    const graphic = surface.querySelector('[data-cycle-graphic]');
    if (cycleHdView === 'mandala') {
      // Natal planets (both sides) in the natal color, the cycle moment's planets in the cycle color.
      const glyphs = new Map();
      const add = (entryMap, color, label, sides) => entryMap.forEach((entry, gate) => {
        if (!glyphs.has(gate)) glyphs.set(gate, { items: [] });
        sides.forEach(side => glyphs.get(gate).items.push(...entry[side].map(glyph => ({ glyph, color, side: label }))));
      });
      add(humanDesignGateGlyphMap(chart, 0), CYCLE_NATAL_COLOR, 'Natal', ['personality', 'design']);
      add(humanDesignGateGlyphMap(chart, momentOffset), CYCLE_MOMENT_COLOR, 'Cycle moment', ['personality']);
      graphic.innerHTML = hdMandalaSvgMarkup(composite.state, glyphs);
    } else {
      graphic.innerHTML = `<svg class="bodygraph hd-bodygraph pair-bodygraph" viewBox="0 0 440 640" role="img" aria-label="Cycle composite bodygraph">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-bodygraph-layers>${hdBodygraphLayersMarkup(composite.state)}</g>
        </svg>`;
    }
    const { structure, newlyDefinedCenters, cycleChannels } = composite;
    const centerName = id => HD_CENTERS.find(center => center.id === id)?.name || id;
    const stat = (label, value) => `<div class="system-stat"><span>${label}</span><strong>${value}</strong></div>`;
    surface.querySelector('[data-cycle-info]').innerHTML = `
      <span class="eyebrow">CYCLE COMPOSITE</span>
      <h3>${structure.type} composite</h3>
      <p>${structure.definition}</p>
      ${stat('CENTERS DEFINED / UNDEFINED', `${structure.definedCenters.size} / ${9 - structure.definedCenters.size}`)}
      ${stat('DEFINED CHANNELS', `${structure.definedChannels.length} / 36`)}
      ${stat('DEFINED ONLY WITH THE CYCLE', newlyDefinedCenters.length ? newlyDefinedCenters.map(centerName).join(', ') : 'None')}
      <span class="eyebrow cycle-info-subhead">CHANNELS THE CYCLE COMPLETES · ${cycleChannels.length}</span>
      ${hdChannelListMarkup(cycleChannels)}`;
  };
  surface.querySelector('[data-cycle-hd-view]').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    cycleHdView = button.dataset.value;
    surface.querySelectorAll('[data-cycle-hd-view] button').forEach(item => item.classList.toggle('active', item === button));
    draw();
  });
  bindCycleSlider(surface.querySelector('.timeline-control'), context, offset => { momentOffset = offset; draw(); });
}

function renderCycleGeneKeys(surface, context) {
  const { chart } = context;
  const tabs = Object.keys(GENE_KEYS_TAB_ACTIVE_INDEXES);
  if (!tabs.includes(cycleGkTab)) cycleGkTab = tabs[0];
  const natalHd = computeHumanDesignChart(chart, 0);
  surface.innerHTML = `
    <div class="system-tabs">${tabs.map(tab => `<button type="button" class="${tab === cycleGkTab ? 'active' : ''}" data-cycle-gk-tab="${tab}">${tab}</button>`).join('')}</div>
    <div class="system-layout cycle-system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar"><span class="eyebrow">${cycleGkTab.toUpperCase()}</span><span class="sample-badge">${context.anchorLabel.toUpperCase()}</span></div>
        <div class="pair-hd-stage">
          <div class="pair-legend">
            <span><i class="legend-dot" style="background:var(--muted)"></i>Natal gate (in each sphere) · ${escapeHtml(chart.name)}</span>
            <span><i class="legend-dot" style="background:${CYCLE_MOMENT_COLOR}"></i>Cycle moment gate (below) · ${context.cycleName}</span>
          </div>
          <div data-cycle-graphic>${geneKeysDiagramSvg(natalHd, cycleGkTab, `Gene Keys ${cycleGkTab} at the cycle moment`, computeHumanDesignChart(chart, context.anchorOffset))}</div>
        </div>
        ${timelineSliderMarkup('CYCLE MOMENT', 0)}
      </div>
      <aside class="system-info"><span class="eyebrow">CYCLE READING</span><h3>${cycleGkTab}</h3></aside>
    </div>`;
  const card = surface.querySelector('.gene-visual');
  bindGeneKeysAllPathsClicks(card);
  bindGeneKeysHoverDebug(card.querySelector('svg'));
  surface.querySelectorAll('[data-cycle-gk-tab]').forEach(button => button.addEventListener('click', () => {
    cycleGkTab = button.dataset.cycleGkTab;
    renderCycleGeneKeys(surface, context);
  }));
  bindCycleSlider(surface.querySelector('.timeline-control'), context, offset => {
    const layer = surface.querySelector('[data-gene-spheres]');
    layer.innerHTML = geneKeysSpheresLayerMarkup(natalHd, cycleGkTab, computeHumanDesignChart(chart, offset));
    bindGeneKeysAllPathsClicks(layer);
  });
}

function initCycleExplorer() {
  document.querySelectorAll('[data-cycle-system]').forEach(button => button.addEventListener('click', () => switchCycleSystem(button.dataset.cycleSystem)));
  document.getElementById('cycleButton')?.addEventListener('click', () => {
    if (selectedChartId) { cycleChartId = selectedChartId; activeOccurrenceIndex = 0; }
    setView('cycle');
  });
}

initCycleExplorer();
