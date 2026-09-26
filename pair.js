// Pair Explorer: two library charts compared through each system — a synastry
// wheel (Astrology), a composite (Human Design), side-by-side diagrams (Gene
// Keys) and stacked, synchronised maps (Astrocartography). The chart picker at
// the top is shared by every system tab. No timeline: the two birth moments are
// compared as they are.

const PAIR_SYSTEMS = ['Astrology', 'Human Design', 'Gene Keys', 'Astrocartography'];
let pairActiveSystem = PAIR_SYSTEMS[0];

// The chosen pair is saved with the workspace state (state.pairSelection = {a, b}
// chart ids), falling back to the first two library charts when unset or when a
// chosen chart has since been deleted.
function pairSelection() {
  const charts = activeCharts();
  const selection = state.pairSelection || {};
  const valid = (id) => charts.some((chart) => chart.id === id);
  const a = valid(selection.a) ? selection.a : charts[0]?.id;
  const b = valid(selection.b) ? selection.b : charts.find((chart) => chart.id !== a)?.id;
  return { a, b };
}
function setPairSelection(slot, id) {
  state.pairSelection = { ...pairSelection(), [slot]: id };
  saveState();
}
function pairChartDetails(chart) {
  return `${formatDate(chart.birthDate)} · ${chart.birthTime || 'Time unknown'} · ${chart.location}`;
}

// ── Chart picker (type-to-filter combo box, or click to browse) ──────────
function pairSlotMarkup(slot) {
  return `
    <div class="pair-slot" data-pair-slot="${slot}">
      <span class="eyebrow">CHART ${slot.toUpperCase()}</span>
      <div class="pair-combo">
        <input type="text" class="pair-input" data-pair-input autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-label="Chart ${slot.toUpperCase()}" placeholder="Type a name, place or date…">
        <button type="button" class="pair-toggle" data-pair-toggle tabindex="-1" aria-label="Show all charts">▾</button>
        <div class="pair-options" data-pair-options role="listbox" hidden></div>
      </div>
      <p class="pair-details" data-pair-details></p>
    </div>`;
}

function bindPairSlot(slotEl, onPick) {
  const slot = slotEl.dataset.pairSlot;
  const input = slotEl.querySelector('[data-pair-input]');
  const list = slotEl.querySelector('[data-pair-options]');
  let matches = [];
  let highlighted = 0;
  const selectedChart = () => chartById(pairSelection()[slot]);
  const showSelection = () => {
    const chart = selectedChart();
    input.value = chart ? chart.name : '';
    slotEl.querySelector('[data-pair-details]').textContent = chart ? pairChartDetails(chart) : 'No chart selected';
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const paint = () => {
    list.innerHTML = matches.length
      ? matches
          .map((chart, index) => `<div class="pair-option${index === highlighted ? ' highlighted' : ''}${chart.id === pairSelection()[slot] ? ' selected' : ''}" role="option" data-id="${chart.id}"><b>${chart.name}</b><small>${pairChartDetails(chart)}</small></div>`)
          .join('')
      : '<div class="pair-empty">No matching charts</div>';
    list.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' });
  };
  // An empty query (or the current selection's own name) lists the whole library.
  const open = (query = '') => {
    const text = query.trim().toLowerCase();
    const all = activeCharts();
    matches = text && text !== (selectedChart()?.name || '').toLowerCase()
      ? all.filter((chart) => `${chart.name} ${chart.location} ${chart.birthDate} ${formatDate(chart.birthDate)}`.toLowerCase().includes(text))
      : all;
    highlighted = Math.max(0, matches.findIndex((chart) => chart.id === pairSelection()[slot]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    paint();
  };
  const pick = (chart) => {
    setPairSelection(slot, chart.id);
    close();
    showSelection();
    input.blur();
    onPick();
  };
  input.addEventListener('focus', () => {
    input.select();
    open();
  });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) return open();
      highlighted = (highlighted + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(1, matches.length);
      paint();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!list.hidden && matches[highlighted]) pick(matches[highlighted]);
    } else if (event.key === 'Escape') {
      close();
      showSelection();
      input.blur();
    }
  });
  // Leaving the field without picking restores the current selection's name.
  input.addEventListener('blur', () => {
    close();
    showSelection();
  });
  // mousedown (not click) with preventDefault keeps focus in the input, so blur
  // doesn't close the list before the pick registers.
  list.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const option = event.target.closest('.pair-option');
    if (option) pick(chartById(option.dataset.id));
  });
  slotEl.querySelector('[data-pair-toggle]').addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (list.hidden) input.focus();
    else input.blur();
  });
  showSelection();
  return { showSelection };
}

// ── Page ────────────────────────────────────────────────────────────────
let pairSlots = null;
function renderPairExplorer() {
  const body = document.getElementById('pairBody');
  if (!body) return;
  if (!pairSlots) {
    body.innerHTML = `
      <div class="pair-picker">
        ${pairSlotMarkup('a')}
        <button type="button" class="pair-swap" data-pair-swap title="Swap charts A and B" aria-label="Swap charts A and B">⇄</button>
        ${pairSlotMarkup('b')}
      </div>
      <div class="explorer-system-tabs" role="tablist" aria-label="Pair system">${PAIR_SYSTEMS.map((system) => `<button type="button" role="tab" data-pair-system="${system}">${system}</button>`).join('')}</div>
      <div id="pairSystemSurface"></div>`;
    pairSlots = [...body.querySelectorAll('[data-pair-slot]')].map((slotEl) => bindPairSlot(slotEl, renderPairSystem));
    body.querySelector('[data-pair-swap]').addEventListener('click', () => {
      const { a, b } = pairSelection();
      state.pairSelection = { a: b, b: a };
      saveState();
      pairSlots.forEach((slot) => slot.showSelection());
      renderPairSystem();
    });
    body.querySelectorAll('[data-pair-system]').forEach((button) =>
      button.addEventListener('click', () => {
        pairActiveSystem = button.dataset.pairSystem;
        renderPairSystem();
      }),
    );
  }
  // The library may have changed since the last visit (charts added, renamed, deleted).
  pairSlots.forEach((slot) => slot.showSelection());
  renderPairSystem();
}

function renderPairSystem() {
  const surface = document.getElementById('pairSystemSurface');
  if (!surface) return;
  document.querySelectorAll('[data-pair-system]').forEach((button) => button.classList.toggle('active', button.dataset.pairSystem === pairActiveSystem));
  const { a, b } = pairSelection();
  const chartA = chartById(a), chartB = chartById(b);
  if (!chartA || !chartB) {
    surface.innerHTML = '<p class="intro-copy pair-message">Add at least two charts to the library to compare them here.</p>';
    return;
  }
  const entries = [
    { chart: chartA, label: `CHART A · ${chartA.name}` },
    { chart: chartB, label: `CHART B · ${chartB.name}` },
  ];
  if (pairActiveSystem === 'Gene Keys') return renderGeneKeysPair(surface, entries);
  if (pairActiveSystem === 'Astrocartography') return renderAstrocartographyPairPanel(surface, entries);
  if (pairActiveSystem === 'Astrology') return renderAstrologyPair(surface, entries);
  renderHumanDesignPair(surface, entries);
}

// ── Astrology: synastry bi-wheel and cross-aspect grid ───────────────────
// Chart A always sits inside (its houses and Ascendant orient the wheel), Chart B
// in a ring around it; only aspects BETWEEN the two charts are drawn. "Chart A" /
// "Chart B" alone show that chart's own natal wheel and aspects instead.
const PAIR_PEOPLE = { A: { color: 'var(--accent)' }, B: { color: 'var(--blue)' } };
const PAIR_ASTRO_SUBJECTS = [['synastry', 'Synastry'], ['A', 'Chart A'], ['B', 'Chart B']];
const PAIR_ASTRO_VIEWS = [['wheel', 'Wheel'], ['grid', 'Aspect grid'], ['both', 'Both']];
let pairAstroSubject = 'synastry';
let pairAstroView = 'wheel';

// Which color belongs to which chart; `notes` adds a small hint per chart key.
function pairLegendMarkup(people, notes = {}) {
  return people.map((person) => `<span><i class="legend-dot" style="background:${person.color}"></i>Chart ${person.key} · ${person.chart.name}${notes[person.key] ? ` <small>${notes[person.key]}</small>` : ''}</span>`).join('');
}
function pairSegmentedMarkup(attribute, options, current) {
  return `<div class="pair-seg" ${attribute}>${options.map(([value, label]) => `<button type="button" data-value="${value}" class="${value === current ? 'active' : ''}">${label}</button>`).join('')}</div>`;
}

function renderAstrologyPair(container, entries) {
  const people = { A: { ...PAIR_PEOPLE.A, key: 'A', chart: entries[0].chart }, B: { ...PAIR_PEOPLE.B, key: 'B', chart: entries[1].chart } };
  container.innerHTML = `
    <div class="pair-astro-layout">
      <div class="chart-panel">
        <div class="panel-toolbar pair-astro-toolbar">
          ${pairSegmentedMarkup('data-pair-subject', PAIR_ASTRO_SUBJECTS, pairAstroSubject)}
          ${pairSegmentedMarkup('data-pair-view', PAIR_ASTRO_VIEWS, pairAstroView)}
          <div class="chart-toolbar-right">
            <label class="fix-zodiac-toggle"><input type="checkbox" data-pair-fix-zodiac ${astroWheelFixedToAries ? 'checked' : ''}>Fix Zodiac</label>
            <label class="fix-zodiac-toggle"><input type="checkbox" data-all-aspects ${aspectMode === 'all' ? 'checked' : ''}>All aspects</label>
          </div>
        </div>
        <div class="wheel-stage pair-astro-stage">
          <div class="pair-legend" data-pair-legend></div>
          <svg id="pairWheel" viewBox="0 0 600 600" role="img" aria-label="Synastry wheel"></svg>
          <div class="pair-aspect-grid-wrap" data-pair-grid></div>
        </div>
      </div>
      <div class="acg-filters wheel-filters" data-pair-wheel-filters>${wheelFiltersMarkup()}</div>
      <aside class="detail-panel pair-aspect-panel">
        <div class="detail-content">
          <div class="section-heading"><span data-pair-aspect-title></span></div>
          <div class="aspect-list" data-pair-aspect-list></div>
        </div>
      </aside>
    </div>`;
  const draw = () => {
    const subject = pairAstroSubject === 'synastry' ? [people.A, people.B] : [people[pairAstroSubject]];
    const svg = container.querySelector('#pairWheel');
    const aspects = renderPairWheel(svg, subject, aspectMode === 'all');
    const showWheel = pairAstroView !== 'grid', showGrid = pairAstroView !== 'wheel';
    // toggleAttribute, not .hidden: SVG elements have no `hidden` property.
    svg.toggleAttribute('hidden', !showWheel);
    const legend = container.querySelector('[data-pair-legend]');
    legend.hidden = !showWheel;
    legend.innerHTML = pairLegendMarkup(subject, subject.length > 1 ? { A: 'inner', B: 'outer' } : {});
    const grid = container.querySelector('[data-pair-grid]');
    grid.hidden = !showGrid;
    grid.innerHTML = showGrid ? pairAspectGridMarkup(subject, aspects) : '';
    container.querySelector('[data-pair-aspect-title]').textContent = subject.length > 1
      ? `CROSS-ASPECTS · ${aspects.length}`
      : `CHART ${subject[0].key} ASPECTS · ${aspects.length}`;
    container.querySelector('[data-pair-aspect-list]').innerHTML = pairAspectListMarkup(subject, aspects);
  };
  const bindSegmented = (attribute, set) => {
    const group = container.querySelector(`[${attribute}]`);
    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      set(button.dataset.value);
      group.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      draw();
    });
  };
  bindSegmented('data-pair-subject', (value) => { pairAstroSubject = value; });
  bindSegmented('data-pair-view', (value) => { pairAstroView = value; });
  // Both checkboxes drive the Chart Explorer's own settings (shared state), so its
  // checkboxes are kept in step too.
  container.querySelector('[data-pair-fix-zodiac]').addEventListener('change', (event) => {
    astroWheelFixedToAries = event.target.checked;
    const explorerToggle = document.getElementById('fixZodiacToggleChart');
    if (explorerToggle) explorerToggle.checked = astroWheelFixedToAries;
    draw();
  });
  container.querySelector('[data-all-aspects]').addEventListener('change', (event) => {
    setAspectMode(event.target.checked ? 'all' : 'main');
    draw();
  });
  // The planet filters are the Chart Explorer's own (one shared set), so its
  // checkboxes are kept in step too.
  container.querySelector('[data-pair-wheel-filters]').addEventListener('change', (event) => {
    const key = event.target.dataset.wheelBody;
    if (!key) return;
    if (event.target.checked) wheelHiddenBodies.delete(key);
    else wheelHiddenBodies.add(key);
    document.querySelectorAll(`[data-wheel-body="${key}"]`).forEach((input) => { input.checked = event.target.checked; });
    draw();
  });
  draw();
}

// Tightest orb first (calculate*Aspects already sort them); within 2° reads as exact.
function pairAspectListMarkup(people, aspects) {
  if (!aspects.length) return '<div class="aspect-empty">No aspects in this filter.</div>';
  const [first, second = people[0]] = people;
  const name = (person, body) => `<i class="pair-aspect-name" style="color:${person.color}">${body}${people.length > 1 ? ` ${person.key}` : ''}</i>`;
  return aspects.map((aspect) => `
    <div class="aspect-row${aspect.intensity === 'exact' ? ' exact' : ''}">
      <span><b class="aspect-glyph" style="color:${aspect.color}">${aspect.glyph}</b>${name(first, aspect.first)} ${aspect.name.toLowerCase()} ${name(second, aspect.second)}</span>
      <span>${aspect.orb.toFixed(1)}° orb</span>
    </div>`).join('');
}

// Draws one chart (people = [person]) as a natal wheel, or two (people = [A, B]) as
// a bi-wheel with B's ring between A's planets and the zodiac. Returns the aspects
// drawn: natal ones for one chart, A×B cross-aspects for two.
function renderPairWheel(svg, people, includeAll) {
  const cx = 300, cy = 300, outer = 250;
  const [inside, outside] = people;
  // Radii, outside in. One chart: the Chart Explorer's own proportions. Two: a
  // slightly narrower zodiac, then B's ring (40), then A's ring (48), then aspects.
  const zodiacInner = outside ? 206 : 202;
  const outsideRingWidth = 40;
  const insideOuter = outside ? zodiacInner - outsideRingWidth : zodiacInner;
  const insideRingWidth = outside ? 48 : Math.round((outer - zodiacInner) * 1.1);
  const aspectR = insideOuter - insideRingWidth;
  const ascendant = inside.chart.positions.find((position) => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, 0) : 0;
  const wheelRotation = astroWheelFixedToAries ? 270 : (270 + ascendantAngle + 360) % 360;
  const houseCusps = houseCuspsAtTime(inside.chart, 0);
  const circle = (r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1"${extra}/>`;
  let markup = circle(outer) + circle(zodiacInner) + (outside ? circle(insideOuter) : '') + circle(aspectR, ' opacity=".8"');
  markup += wheelZodiacMarkup(cx, cy, outer, zodiacInner, wheelRotation);
  // A's house cusps run across both planet rings, so B's planets read as falling in A's houses.
  markup += wheelHousesMarkup(cx, cy, aspectR, zodiacInner, houseCusps, wheelRotation);
  const ringPositions = (person) => person.chart.positions
    .filter((position) => wheelBodyVisible(position.name))
    .map((position) => {
      const longitude = positionAngleAtTime(position, 0);
      return { ...position, key: `${person.key}:${position.name}`, person, color: person.color, longitude, angle: (wheelRotation - longitude + 360) % 360, motion: wheelMotion(position, 0) };
    });
  const insidePositions = ringPositions(inside);
  const outsidePositions = outside ? ringPositions(outside) : [];
  spreadClusteredAngles(insidePositions, outside ? 7 : 6);
  if (outside) spreadClusteredAngles(outsidePositions);
  // Orbs come from the true longitudes; the lines join the true (unspread) wheel angles.
  const withLongitude = (positions) => positions.map((position) => ({ ...position, angle: position.longitude }));
  const aspects = outside
    ? calculateCrossAspects(withLongitude(insidePositions), withLongitude(outsidePositions), includeAll)
    : calculateAspects({ positions: withLongitude(insidePositions) }, includeAll);
  const insideByName = new Map(insidePositions.map((position) => [position.name, position]));
  const outsideByName = outside ? new Map(outsidePositions.map((position) => [position.name, position])) : insideByName;
  markup += wheelAspectLinesMarkup(cx, cy, aspectR, aspects, (aspect) => [insideByName.get(aspect.first).angle, outsideByName.get(aspect.second).angle]);
  insidePositions.forEach((position) => { markup += planetMarkerMarkup(cx, cy, insideOuter, position, insideRingWidth); });
  outsidePositions.forEach((position) => { markup += planetMarkerMarkup(cx, cy, zodiacInner, position, outsideRingWidth); });
  svg.innerHTML = markup;
  const byKey = new Map([...insidePositions, ...outsidePositions].map((position) => [position.key, position]));
  svg._wheelHover = {
    planet: (key) => byKey.has(key) && (() => pairPlanetTooltip(byKey.get(key), houseCusps, inside)),
    aspect: (index) => aspects[index] && (() => pairAspectTooltip(aspects[index], insideByName.get(aspects[index].first), outsideByName.get(aspects[index].second), people.length > 1)),
  };
  bindWheelHover(svg).hidden = true;
  return aspects;
}

function pairPlanetTooltip(position, cusps, housesOf) {
  const { glyph, degree } = wheelSignText(position.longitude);
  const mark = WHEEL_MOTION_MARKS[position.motion];
  const house = wheelHouseOf(position.longitude, cusps);
  const where = !house ? '' : position.person === housesOf ? ` · House ${house}` : ` · in Chart ${housesOf.key}'s house ${house}`;
  return `<div class="wheel-tooltip-main">${position.name} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div><div class="wheel-tooltip-sub">Chart ${position.person.key}${where}</div>`;
}
function pairAspectTooltip(aspect, first, second, synastry) {
  const side = (position) => `${position.name}${wheelSignText(position.longitude).glyph}${synastry ? ` (${position.person.key})` : ''}`;
  return `<div class="wheel-tooltip-main">${side(first)} ${aspect.name} ${side(second)}</div><div class="wheel-tooltip-sub">Orb ${aspect.orb.toFixed(1)}°</div>`;
}

// Rows are the inner (or only) chart's bodies; columns are Chart B's for synastry,
// or the same chart again (upper and lower halves mirrored) for a single chart.
function pairAspectGridMarkup(people, aspects) {
  const [rowsPerson, columnsPerson = people[0]] = people;
  const synastry = people.length > 1;
  const bodies = (person) => aspectBodies(person.chart.positions.filter((position) => wheelBodyVisible(position.name)));
  const rows = bodies(rowsPerson), columns = bodies(columnsPerson);
  const lookup = new Map();
  aspects.forEach((aspect) => {
    const key = `${aspect.first}|${aspect.second}`;
    if (!lookup.has(key)) lookup.set(key, aspect);
    if (!synastry && !lookup.has(`${aspect.second}|${aspect.first}`)) lookup.set(`${aspect.second}|${aspect.first}`, aspect);
  });
  // Letter "glyphs" (Asc, MC) would only repeat the name.
  const label = (person, position, row) => `<div class="grid-label${row ? ' row-label' : ''}" style="color:${person.color}">${/^[A-Za-z]+$/.test(position.glyph) ? '' : `${position.glyph} `}${position.name}</div>`;
  const cell = (row, column) => {
    const aspect = !synastry && row.name === column.name ? null : lookup.get(`${row.name}|${column.name}`);
    const title = aspect
      ? `${row.name}${synastry ? ' (A)' : ''} ${aspect.name} ${column.name}${synastry ? ' (B)' : ''} · orb ${aspect.orb.toFixed(1)}°`
      : 'No aspect';
    return `<div class="aspect-cell${aspect ? ' has-aspect' : ''}" title="${title}"${aspect ? ` style="color:${aspect.color}"` : ''}>${aspect ? aspect.glyph : '·'}</div>`;
  };
  const heading = synastry
    ? `CROSS-ASPECTS · ${aspects.length} · <span style="color:${rowsPerson.color}">rows chart A</span> · <span style="color:${columnsPerson.color}">columns chart B</span>`
    : `CHART ${rowsPerson.key} ASPECTS · ${aspects.length}`;
  return `<p class="eyebrow pair-grid-heading">${heading}</p>
    <div class="pair-aspect-grid" style="grid-template-columns:96px repeat(${columns.length},minmax(30px,1fr))">
      <div class="grid-corner"></div>${columns.map((position) => label(columnsPerson, position, false)).join('')}
      ${rows.map((row) => label(rowsPerson, row, true) + columns.map((column) => cell(row, column)).join('')).join('')}
    </div>`;
}

// ── Human Design: composite bodygraph and mandala ────────────────────────
// Composite: both charts' activations together, gate halves colored by person (A,
// B, or both as parallel strokes), electromagnetic channels haloed, and the side
// panel classifying every connection. "Chart A" / "Chart B" show that chart alone,
// colored by personality/design as in the Chart Explorer.
const PAIR_HD_SUBJECTS = [['composite', 'Composite'], ['A', 'Chart A'], ['B', 'Chart B']];
const PAIR_HD_VIEWS = [['bodygraph', 'Bodygraph'], ['mandala', 'Mandala']];
const PAIR_CONNECTION_KINDS = [
  ['electromagnetic', 'Electromagnetic', 'Each brings one gate — the channel exists only together.'],
  ['companionship', 'Companionship', 'Both have the whole channel.'],
  ['dominance', 'Dominance', 'One has the whole channel; the other neither gate.'],
  ['compromise', 'Compromise', 'One has the whole channel; the other one of its gates.'],
];
let pairHdSubject = 'composite';
let pairHdView = 'bodygraph';

function renderHumanDesignPair(container, entries) {
  const people = { A: { ...PAIR_PEOPLE.A, key: 'A', chart: entries[0].chart }, B: { ...PAIR_PEOPLE.B, key: 'B', chart: entries[1].chart } };
  container.innerHTML = `
    <div class="pair-hd-layout">
      <div class="system-visual">
        <div class="panel-toolbar pair-astro-toolbar">
          ${pairSegmentedMarkup('data-pair-subject', PAIR_HD_SUBJECTS, pairHdSubject)}
          ${pairSegmentedMarkup('data-pair-view', PAIR_HD_VIEWS, pairHdView)}
        </div>
        <div class="pair-hd-stage">
          <div class="pair-legend" data-pair-legend></div>
          <div data-pair-hd-graphic></div>
        </div>
      </div>
      <aside class="system-info" data-pair-hd-info></aside>
    </div>
    <div data-pair-hd-details></div>`;
  const draw = () => {
    const graphic = container.querySelector('[data-pair-hd-graphic]');
    const legend = container.querySelector('[data-pair-legend]');
    const info = container.querySelector('[data-pair-hd-info]');
    const details = container.querySelector('[data-pair-hd-details]');
    let state, glyphMap;
    if (pairHdSubject === 'composite') {
      const composite = computeCompositeHumanDesign(people.A.chart, people.B.chart);
      state = composite.state;
      glyphMap = pairCompositeGlyphMap(people);
      legend.innerHTML = `${pairLegendMarkup([people.A, people.B])}<span><i class="legend-swatch halo"></i>Electromagnetic — formed only together</span>`;
      info.innerHTML = pairCompositeInfoMarkup(composite);
      details.innerHTML = pairCompositeDetailsMarkup(people, composite);
    } else {
      const person = people[pairHdSubject];
      state = computeBodygraphState(person.chart, 0);
      glyphMap = humanDesignGateGlyphMap(person.chart, 0);
      legend.innerHTML = `<span><i class="legend-dot" style="background:${person.color}"></i>Chart ${person.key} · ${person.chart.name}</span><span><i class="legend-swatch" style="background:var(--ink)"></i>Personality</span><span><i class="legend-swatch" style="background:var(--accent)"></i>Design</span>`;
      const typology = computeHumanDesignTypology(state.hd);
      info.innerHTML = hdTypologyAsideMarkup(typology, { showFilter: false });
      details.innerHTML = hdTypologyDetailsMarkup(typology);
    }
    graphic.innerHTML = pairHdView === 'mandala'
      ? hdMandalaSvgMarkup(state, glyphMap)
      : `<svg class="bodygraph hd-bodygraph pair-bodygraph" viewBox="0 0 440 640" role="img" aria-label="Bodygraph">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-center-layer>${hdBodygraphCenterMarkup(state)}</g>
          <g data-gate-layer>${hdBodygraphGateMarkup(state)}</g>
        </svg>`;
  };
  [['data-pair-subject', (value) => { pairHdSubject = value; }], ['data-pair-view', (value) => { pairHdView = value; }]].forEach(([attribute, set]) => {
    const group = container.querySelector(`[${attribute}]`);
    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      set(button.dataset.value);
      group.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      draw();
    });
  });
  draw();
}

// Mandala glyphs for the composite: each chart's planets (personality and design
// alike) in that chart's color, A's stacked outermost.
function pairCompositeGlyphMap(people) {
  const map = new Map();
  [people.A, people.B].forEach((person) => {
    humanDesignGateGlyphMap(person.chart, 0).forEach((entry, gate) => {
      if (!map.has(gate)) map.set(gate, { items: [] });
      map.get(gate).items.push(
        ...entry.personality.map((glyph) => ({ glyph, color: person.color, side: `Chart ${person.key} Personality` })),
        ...entry.design.map((glyph) => ({ glyph, color: person.color, side: `Chart ${person.key} Design` })),
      );
    });
  });
  return map;
}

const pairCenterName = (id) => HD_CENTERS.find((center) => center.id === id)?.name || id;
const pairCentersSplit = (definedCount) => `${definedCount} / ${9 - definedCount}`;

// Side panel: the composite at a glance; the full lists sit below the chart.
function pairCompositeInfoMarkup(composite) {
  const { structure, connections, newlyDefinedCenters } = composite;
  const stat = (label, value) => `<div class="system-stat"><span>${label}</span><strong>${value}</strong></div>`;
  return `
    <span class="eyebrow">COMPOSITE</span>
    <h3>${structure.type} composite</h3>
    <p>${structure.definition}</p>
    ${stat('CENTERS DEFINED / UNDEFINED', pairCentersSplit(structure.definedCenters.size))}
    ${stat('DEFINED CHANNELS', `${structure.definedChannels.length} / 36`)}
    ${stat('DEFINED ONLY TOGETHER', newlyDefinedCenters.length ? newlyDefinedCenters.map(pairCenterName).join(', ') : 'None')}
    ${PAIR_CONNECTION_KINDS.map(([kind, label]) => stat(label.toUpperCase(), connections[kind].length)).join('')}
    <div class="system-note">Side-by-side comparison and every connection channel are listed below the chart.</div>`;
}

// Under the chart: A / B / composite side by side, then each connection kind's channels.
function pairCompositeDetailsMarkup(people, composite) {
  const { structure, connections } = composite;
  const [typologyA, typologyB] = [people.A, people.B].map((person) => computeHumanDesignTypology(computeHumanDesignChart(person.chart, 0)));
  const none = '<span class="pair-compare-none">—</span>';
  const pick = (typology, read) => (typology ? read(typology) : none);
  const rows = [
    ['Type', (t) => t.type, structure.type],
    ['Aura', (t) => t.aura, HD_TYPE_INFO[structure.type]?.aura || none],
    ['Strategy', (t) => t.strategy, none],
    ['Definition', (t) => t.definition, structure.definition],
    ['Inner authority', (t) => t.authority, none],
    ['Profile', (t) => `${t.profile} · ${t.profileNames}`, none],
    ['Incarnation cross', (t) => `${t.cross.angle} · ${t.cross.gates}`, none],
    ['Quadrant', (t) => t.quadrant.name, none],
    ['Centers defined / undefined', (t) => pairCentersSplit(t.definedCenters.size), pairCentersSplit(structure.definedCenters.size)],
    ['Defined channels', (t) => `${t.definedChannels.length} / 36`, `${structure.definedChannels.length} / 36`],
  ];
  const table = `
    <div class="pair-compare">
      <table class="pair-compare-table">
        <thead><tr><th></th>${[people.A, people.B].map((person) => `<th style="color:${person.color}">Chart ${person.key} · ${person.chart.name}</th>`).join('')}<th>Composite</th></tr></thead>
        <tbody>${rows.map(([label, read, compositeValue]) => `<tr><th>${label}</th><td>${pick(typologyA, read)}</td><td>${pick(typologyB, read)}</td><td>${compositeValue}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  const notes = {
    electromagnetic: (channel) => `A ${channel.fromA} · B ${channel.fromB}`,
    companionship: () => 'both charts',
    dominance: (channel) => `Chart ${channel.owner}`,
    compromise: (channel) => `Chart ${channel.owner} · other has ${channel.partial.join(', ')}`,
  };
  const cards = PAIR_CONNECTION_KINDS.map(([kind, label, description]) => `
    <div class="pair-connection-card ${kind}">
      <h3><span>${label}</span> <small>${connections[kind].length}</small></h3>
      <p>${description}</p>
      ${hdChannelListMarkup(connections[kind], notes[kind])}
    </div>`).join('');
  return `${table}<div class="pair-connection-grid">${cards}</div>`;
}

// Chart Explorer's "Pair chart" button: open Pair Explorer with the chart being
// viewed as Chart A, keeping the current Chart B unless it's the same chart.
document.getElementById('pairButton')?.addEventListener('click', () => {
  const current = selectedChartId;
  const { b } = pairSelection();
  const other = b && b !== current ? b : activeCharts().find((chart) => chart.id !== current)?.id;
  state.pairSelection = { a: current, b: other };
  saveState();
  setView('pair');
});
