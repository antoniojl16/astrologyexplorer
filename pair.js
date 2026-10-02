// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Pair Explorer: two library charts compared through each system — a synastry
// wheel (Astrology), a composite (Human Design), side-by-side diagrams (Gene
// Keys) and stacked, synchronised maps (Astrocartography). The chart picker at
// the top is shared by every system tab. No timeline: the two birth moments are
// compared as they are.

// (Life Events: the two timelines side by side, pair-life.js.)
const PAIR_SYSTEMS = ['Astrology', 'Human Design', 'Gene Keys', 'Astrocartography', 'Life Events'];
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
  return `${formatDate(chart.birthDate)} · ${chart.birthTime || t('Time unknown')} · ${chart.location}`;
}

// ── Chart picker (type-to-filter combo box, or click to browse) ──────────
// One combo box design for every "choose a chart" spot: the Pair Explorer's two slots
// and the Chart Explorer's title. Focus lists the whole library; typing filters it by
// name, place or date; arrows + Enter pick, Escape cancels.
function chartComboMarkup(ariaLabel, inputClass = 'pair-input') {
  return `
      <div class="pair-combo">
        <input type="text" class="${inputClass}" data-chart-combo-input autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-label="${ariaLabel}" placeholder="${t('Type a name, place or date…')}">
        <button type="button" class="pair-toggle" data-chart-combo-toggle tabindex="-1" aria-label="${t('Show all charts')}">▾</button>
        <div class="pair-options" data-chart-combo-options role="listbox" hidden></div>
      </div>`;
}
// selectedId(): the chart shown; onPick(id): a chart was chosen; onShow(chart): refresh
// anything else that describes the selection. Returns { showSelection }.
function bindChartCombo(root, { selectedId, onPick, onShow = () => {} }) {
  const input = root.querySelector('[data-chart-combo-input]');
  const list = root.querySelector('[data-chart-combo-options]');
  let matches = [];
  let highlighted = 0;
  const selectedChart = () => chartById(selectedId());
  const showSelection = () => {
    const chart = selectedChart();
    input.value = chart ? chart.name : '';
    onShow(chart);
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const paint = () => {
    list.innerHTML = matches.length
      ? matches
          .map((chart, index) => `<div class="pair-option${index === highlighted ? ' highlighted' : ''}${chart.id === selectedId() ? ' selected' : ''}" role="option" data-id="${chart.id}"><b>${escapeHtml(chart.name)}</b><small>${escapeHtml(pairChartDetails(chart))}</small></div>`)
          .join('')
      : `<div class="pair-empty">${t('No matching charts')}</div>`;
    list.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' });
  };
  // An empty query (or the current selection's own name) lists the whole library.
  const open = (query = '') => {
    const text = searchFold(query).trim();
    const all = activeCharts();
    matches = text && text !== searchFold(selectedChart()?.name || '')
      ? all.filter((chart) => searchMatches([`${chart.name} ${chart.location} ${chart.birthDate} ${formatDate(chart.birthDate)}`], query))
      : all;
    highlighted = Math.max(0, matches.findIndex((chart) => chart.id === selectedId()));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    paint();
  };
  const pick = (chart) => {
    close();
    input.blur();
    onPick(chart.id);
    showSelection();
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
  root.querySelector('[data-chart-combo-toggle]').addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (list.hidden) input.focus();
    else input.blur();
  });
  showSelection();
  return { showSelection };
}

function pairSlotMarkup(slot) {
  return `
    <div class="pair-slot" data-pair-slot="${slot}">
      <span class="eyebrow">${t('CHART {letter}', { letter: slot.toUpperCase() })}</span>
      ${chartComboMarkup(t('Chart {letter}', { letter: slot.toUpperCase() }))}
      <p class="pair-details" data-pair-details></p>
    </div>`;
}
function bindPairSlot(slotEl, onPick) {
  const slot = slotEl.dataset.pairSlot;
  return bindChartCombo(slotEl, {
    selectedId: () => pairSelection()[slot],
    onPick: (id) => {
      setPairSelection(slot, id);
      onPick();
    },
    onShow: (chart) => {
      slotEl.querySelector('[data-pair-details]').textContent = chart ? pairChartDetails(chart) : t('No chart selected');
    },
  });
}

// Chart Explorer: the chart's name is itself the picker, to switch charts in place.
let explorerChartCombo = null;
function syncExplorerChartPicker() {
  const heading = document.getElementById('explorerName');
  if (!heading) return;
  if (!explorerChartCombo) {
    heading.classList.add('explorer-name-picker');
    heading.innerHTML = chartComboMarkup(t('Chart'), 'pair-input explorer-name-input');
    explorerChartCombo = bindChartCombo(heading, {
      selectedId: () => selectedChartId,
      onPick: (id) => {
        selectedChartId = id;
        setView('explorer');
      },
    });
  }
  explorerChartCombo.showSelection();
}
syncExplorerChartPicker();

// ── Page ────────────────────────────────────────────────────────────────
let pairSlots = null;
function renderPairExplorer() {
  const body = document.getElementById('pairBody');
  if (!body) return;
  if (!pairSlots) {
    body.innerHTML = `
      <div class="pair-picker">
        ${pairSlotMarkup('a')}
        <button type="button" class="pair-swap" data-pair-swap title="${t('Swap charts A and B')}" aria-label="${t('Swap charts A and B')}">⇄</button>
        ${pairSlotMarkup('b')}
      </div>
      <div class="explorer-system-tabs" role="tablist" aria-label="${t('Pair system')}">${PAIR_SYSTEMS.map((system) => `<button type="button" role="tab" data-pair-system="${system}">${tName(system)}</button>`).join('')}</div>
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
    surface.innerHTML = `<p class="intro-copy pair-message">${t('Add at least two charts to the library to compare them here.')}</p>`;
    return;
  }
  const entries = [
    { chart: chartA, label: `${t('CHART {letter}', { letter: 'A' })} · ${escapeHtml(chartA.name)}` },
    { chart: chartB, label: `${t('CHART {letter}', { letter: 'B' })} · ${escapeHtml(chartB.name)}` },
  ];
  if (pairActiveSystem === 'Life Events') return renderPairLifeEvents(surface, chartA, chartB);
  if (pairActiveSystem === 'Gene Keys') return renderGeneKeysPair(surface, entries);
  if (pairActiveSystem === 'Astrocartography') return renderAstrocartographyPairPanel(surface, entries);
  if (pairActiveSystem === 'Astrology') return renderAstrologyPair(surface, entries);
  renderHumanDesignPair(surface, entries);
}

// ── Astrology: synastry bi-wheel and cross-aspect grid ───────────────────
// Chart A always sits inside (its houses and Ascendant orient the wheel), Chart B
// in a ring around it; only aspects BETWEEN the two charts are drawn. "Chart A" /
// "Chart B" alone show that chart's own natal wheel and aspects instead.
// Per-person colors. Human Design (composite bodygraph and mandala, legend, comparison):
// Chart A a light blue, Chart B green — kept clear of the red used for Design activations
// in a single chart. The synastry views (wheel, grid, lists, legend): Chart A blue, Chart B red.
const PAIR_PEOPLE = { A: { color: 'var(--pair-blue)' }, B: { color: 'var(--pair-green)' } };
const PAIR_ASTRO_PEOPLE = { A: { color: 'var(--blue)' }, B: { color: 'var(--accent)' } };
const PAIR_ASTRO_SUBJECTS = [['synastry', t('Synastry')], ['composite', t('Composite')], ['A', t('Chart A')], ['B', t('Chart B')]];
const PAIR_ASTRO_VIEWS = [['wheel', t('Wheel')], ['grid', t('Aspect grid')], ['both', t('Both')]];
let pairAstroSubject = 'synastry';
let pairAstroView = 'wheel';

// Which color belongs to which chart; `notes` adds a small hint per chart key.
function pairLegendMarkup(people, notes = {}) {
  return people.map((person) => `<span><i class="legend-dot" style="background:${person.color}"></i>${t('Chart {letter}', { letter: person.key })} · ${escapeHtml(person.chart.name)}${notes[person.key] ? ` <small>${notes[person.key]}</small>` : ''}</span>`).join('');
}
function pairSegmentedMarkup(attribute, options, current) {
  return `<div class="pair-seg" ${attribute}>${options.map(([value, label]) => `<button type="button" data-value="${value}" class="${value === current ? 'active' : ''}">${label}</button>`).join('')}</div>`;
}

// The Pair Explorer's view-button state lives in the router-visible globals above.
const pairAstroState = {
  get subject() { return pairAstroSubject; },
  set subject(value) { pairAstroSubject = value; },
  get view() { return pairAstroView; },
  set view(value) { pairAstroView = value; },
};
function renderAstrologyPair(container, entries) {
  const person = (key, entry) => ({ ...PAIR_ASTRO_PEOPLE[key], key, chart: entry.chart, name: t('Chart {letter}', { letter: key }), tag: key, legend: `${t('Chart {letter}', { letter: key })} · ${escapeHtml(entry.chart.name)}`, offset: 0 });
  const [chartA, chartB] = [entries[0].chart, entries[1].chart];
  const composite = { person: () => pairCompositePerson(chartA, chartB), bind: (box, redraw) => bindPairCompositeControls(box, chartA, chartB, redraw) };
  renderSynastryView(container, { A: person('A', entries[0]), B: person('B', entries[1]) }, { subjects: PAIR_ASTRO_SUBJECTS, state: pairAstroState, wheelId: 'pairWheel', composite });
}
// A bi-wheel view shared by the Pair Explorer (two charts) and the Cycle Explorer (a
// natal chart and its cycle moment). Each person: { key: 'A'|'B', chart, color, name
// (e.g. "Chart A", "Natal"), tag (short, for lists: "A", "natal"), legend text, offset
// (minutes after that chart's birth at which to draw it) }. config: { subjects (view
// button labels), state ({ subject, view }, kept by the caller), wheelId, footer
// (markup under the wheel), composite (the Pair Explorer's: { person() → the composite
// chart as a person, bind(box, redraw) → its settings over the wheel }), extra (more
// settings under the filters, always shown: { bind(box, redraw) }, e.g. the Cycle
// Explorer's Cast for) }.
// Returns { draw } for callers that change a person's offset.
function renderSynastryView(container, people, { subjects, state, wheelId, footer = '', composite = null, extra = null }) {
  container.innerHTML = `
    <div class="pair-astro-layout">
      <div class="chart-panel">
        <div class="panel-toolbar pair-astro-toolbar">
          ${pairSegmentedMarkup('data-pair-subject', subjects, state.subject)}
          ${pairSegmentedMarkup('data-pair-view', PAIR_ASTRO_VIEWS, state.view)}
          <div class="chart-toolbar-right">
            <label class="fix-zodiac-toggle"><input type="checkbox" data-pair-fix-zodiac ${astroWheelFixedToAries ? 'checked' : ''}>${t('Fix Zodiac')}</label>
          </div>
        </div>
        <div class="wheel-stage pair-astro-stage">
          <div class="pair-legend" data-pair-legend></div>
          <svg id="${wheelId}" class="synastry-wheel" viewBox="45 45 510 510" role="img" aria-label="${t('Synastry wheel')}"></svg>
          <div class="pair-aspect-grid-wrap" data-pair-grid></div>
        </div>
        ${footer}
      </div>
      <div class="acg-filters wheel-filters" data-pair-wheel-filters>${wheelFiltersMarkup()}${composite ? '<div class="pair-composite-controls" data-pair-composite hidden></div>' : ''}${extra ? '<div class="pair-composite-controls" data-extra-controls></div>' : ''}</div>
      <div class="acg-filters wheel-positions" data-wheel-positions></div>
      <aside class="detail-panel pair-aspect-panel">
        <div class="detail-content">
          <div class="section-heading"><span data-pair-aspect-title></span></div>
          <div class="aspect-list" data-pair-aspect-list tabindex="0" role="region" aria-label="${t('Cross-aspects')}"></div>
        </div>
      </aside>
    </div>`;
  const draw = () => {
    const compositeShown = !!composite && state.subject === 'composite';
    const subject = state.subject === 'synastry' ? [people.A, people.B] : compositeShown ? [composite.person()] : [people[state.subject] || people.A];
    const svg = container.querySelector('.synastry-wheel');
    const controls = container.querySelector('[data-pair-composite]');
    if (controls) controls.hidden = !compositeShown;
    const aspects = renderPairWheel(svg, subject).filter(aspectIntensityShown);
    const showWheel = state.view !== 'grid', showGrid = state.view !== 'wheel';
    // toggleAttribute, not .hidden: SVG elements have no `hidden` property.
    svg.toggleAttribute('hidden', !showWheel);
    const legend = container.querySelector('[data-pair-legend]');
    legend.hidden = !showWheel;
    legend.innerHTML = subject.map((person) => `<span><i class="legend-dot" style="background:${person.color}"></i>${person.legend}${subject.length > 1 ? ` <small>${person.key === 'A' ? t('inner') : t('outer')}</small>` : ''}</span>`).join('');
    const grid = container.querySelector('[data-pair-grid]');
    grid.hidden = !showGrid;
    grid.innerHTML = showGrid ? pairAspectGridMarkup(subject, aspects) : '';
    container.querySelector('[data-pair-aspect-title]').textContent = subject.length > 1
      ? `${t('CROSS-ASPECTS')} · ${aspects.length}`
      : `${t('{name} ASPECTS', { name: subject[0].name.toUpperCase() })} · ${aspects.length}`;
    container.querySelector('[data-pair-aspect-list]').innerHTML = pairAspectListMarkup(subject, aspects);
    container.querySelector('[data-wheel-positions]').innerHTML = wheelPositionsMarkup(subject);
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
  bindSegmented('data-pair-subject', (value) => { state.subject = value; });
  if (composite) composite.bind(container.querySelector('[data-pair-composite]'), () => draw());
  if (extra) extra.bind(container.querySelector('[data-extra-controls]'), () => draw());
  bindSegmented('data-pair-view', (value) => { state.view = value; });
  // Both checkboxes drive the Chart Explorer's own settings (shared state), so its
  // checkboxes are kept in step too.
  container.querySelector('[data-pair-fix-zodiac]').addEventListener('change', (event) => {
    astroWheelFixedToAries = event.target.checked;
    const explorerToggle = document.getElementById('fixZodiacToggleChart');
    if (explorerToggle) explorerToggle.checked = astroWheelFixedToAries;
    draw();
  });
  // The planet and aspect filters are shared with the Chart Explorer (one set of each);
  // applyWheelFilterChange keeps every filter panel on the page in step.
  const filters = container.querySelector('[data-pair-wheel-filters]');
  syncWheelFilterInputs(filters);
  filters.addEventListener('change', (event) => {
    if (applyWheelFilterChange(event.target)) draw();
  });
  draw();
  return { draw };
}

// Tightest orb first (calculate*Aspects already sort them); within a fifth of its max orb reads as exact (aspectIntensity).
function pairAspectListMarkup(people, aspects) {
  if (!aspects.length) return `<div class="aspect-empty">${t('No aspects in this filter.')}</div>`;
  const [first, second = people[0]] = people;
  const name = (person, body) => `<i class="pair-aspect-name" style="color:${person.color}">${tName(body)}${people.length > 1 ? ` ${person.tag}` : ''}</i>`;
  return aspects.map((aspect) => `
    <div class="aspect-row${aspect.intensity === 'exact' ? ' exact' : ''}" ${aspectRowAttributes(aspect, people.length > 1 ? first.chart.name : '', people.length > 1 ? second.chart.name : '')}>
      <span><b class="aspect-glyph" style="color:${aspect.color}">${aspect.glyph}</b>${name(first, aspect.first)} ${tName(aspect.name).toLowerCase()} ${name(second, aspect.second)}</span>
      <span>${t('{orb}° orb', { orb: aspect.orb.toFixed(1) })}</span>
    </div>`).join('');
}

// Draws one chart (people = [person]) as a natal wheel, or two (people = [A, B]) as
// a bi-wheel with B's ring between A's planets and the zodiac. Returns the aspects
// drawn: natal ones for one chart, A×B cross-aspects for two.
function renderPairWheel(svg, people) {
  const cx = 300, cy = 300, outer = 250;
  const [inside, outside] = people;
  // Radii, outside in. One chart: the Chart Explorer's own proportions, with each
  // body's degree and sign under its glyph. Two: a slightly narrower zodiac, then B's
  // ring (40), then A's ring (48), then aspects — no labels (too busy for two charts).
  const zodiacInner = outside ? 206 : 202;
  const outsideRingWidth = 40;
  const insideOuter = outside ? zodiacInner - outsideRingWidth : zodiacInner;
  const insideRingWidth = outside ? 48 : WHEEL_LABELLED_RING;
  const aspectR = insideOuter - insideRingWidth - (outside ? 0 : WHEEL_HOUSE_BAND);
  const ascendant = inside.chart.positions.find((position) => position.name === 'Ascendant');
  const ascendantAngle = ascendant ? positionAngleAtTime(ascendant, inside.offset || 0) : 0;
  const wheelRotation = astroWheelFixedToAries ? 270 : (270 + ascendantAngle + 360) % 360;
  // Each chart's own houses (its own birth time and place). None for a ring whose angles
  // are left out (an imprecise moment).
  const cuspsOf = (person) => person && !person.omit?.has('Ascendant') ? houseCuspsAtTime(person.chart, person.offset || 0) : null;
  const houseCusps = cuspsOf(inside), outsideCusps = cuspsOf(outside);
  const circle = (r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1"${extra}/>`;
  let markup = circle(outer) + circle(zodiacInner) + (outside ? circle(insideOuter) : '') + circle(aspectR, ' opacity=".8"');
  markup += wheelZodiacMarkup(cx, cy, outer, zodiacInner, wheelRotation);
  // Each ring carries its own chart's cusps and house numbers: A's inside, B's outside.
  if (houseCusps) markup += outside
    ? wheelHousesMarkup(cx, cy, aspectR, insideOuter, houseCusps, wheelRotation)
    : wheelHouseBandMarkup(cx, cy, aspectR, aspectR + WHEEL_HOUSE_BAND, zodiacInner, houseCusps, wheelRotation);
  if (outsideCusps) markup += wheelHousesMarkup(cx, cy, insideOuter, zodiacInner, outsideCusps, wheelRotation);
  // `person.omit` (optional): bodies left out of that ring (an imprecise moment's angles).
  const ringPositions = (person) => person.chart.positions
    .filter((position) => wheelBodyVisible(position.name) && !person.omit?.has(position.name) && bodyShownAt(position, person.offset || 0))
    .map((position) => {
      const offset = person.offset || 0;
      const longitude = positionAngleAtTime(position, offset);
      return { ...position, key: `${person.key}:${position.name}`, person, color: person.color, longitude, angle: (wheelRotation - longitude + 360) % 360, motion: wheelMotion(position, offset) };
    });
  const insidePositions = ringPositions(inside);
  const outsidePositions = outside ? ringPositions(outside) : [];
  spreadClusteredAngles(insidePositions, outside ? 7 : WHEEL_LABELLED_SPREAD);
  if (outside) spreadClusteredAngles(outsidePositions);
  // Orbs come from the true longitudes; the lines join the true (unspread) wheel angles.
  const withLongitude = (positions) => positions.map((position) => ({ ...position, angle: position.longitude }));
  const aspects = outside
    ? calculateCrossAspects(withLongitude(insidePositions), withLongitude(outsidePositions))
    : calculateAspects({ positions: withLongitude(insidePositions) });
  const insideByName = new Map(insidePositions.map((position) => [position.name, position]));
  const outsideByName = outside ? new Map(outsidePositions.map((position) => [position.name, position])) : insideByName;
  // Every aspect is returned for the lists, but only those between planets are drawn.
  const drawn = aspects.filter(aspectDrawnOnWheel);
  markup += wheelAspectLinesMarkup(cx, cy, aspectR, drawn, (aspect) => [insideByName.get(aspect.first).angle, outsideByName.get(aspect.second).angle]);
  insidePositions.forEach((position) => { markup += planetMarkerMarkup(cx, cy, insideOuter, position, insideRingWidth, !outside); });
  outsidePositions.forEach((position) => { markup += planetMarkerMarkup(cx, cy, zodiacInner, position, outsideRingWidth); });
  svg.innerHTML = markup;
  const byKey = new Map([...insidePositions, ...outsidePositions].map((position) => [position.key, position]));
  svg._wheelHover = {
    planet: (key) => byKey.has(key) && (() => pairPlanetTooltip(byKey.get(key), byKey.get(key).person === inside ? houseCusps : outsideCusps, houseCusps, inside)),
    aspect: (index) => drawn[index] && (() => pairAspectTooltip(drawn[index], insideByName.get(drawn[index].first), outsideByName.get(drawn[index].second), people.length > 1)),
  };
  bindWheelHover(svg).hidden = true;
  return aspects;
}

// Its own chart's house, and for the outer chart's bodies also the inner chart's house
// they fall in ("in Chart A's house 7").
function pairPlanetTooltip(position, ownCusps, insideCusps, inside) {
  const { glyph, degree } = wheelSignText(position.longitude);
  const mark = WHEEL_MOTION_MARKS[position.motion];
  const own = ownCusps && wheelHouseOf(position.longitude, ownCusps);
  const across = position.person !== inside && insideCusps && wheelHouseOf(position.longitude, insideCusps);
  const where = `${own ? ` · ${t('House {house}', { house: own })}` : ''}${across ? ` · ${inside.housesName ? t('in {houses} {house}', { houses: inside.housesName, house: across }) : t("in {name}'s house {house}", { name: inside.name, house: across })}` : ''}`;
  return `<div class="wheel-tooltip-main">${tName(position.name)} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div><div class="wheel-tooltip-sub">${position.person.name}${where}</div>`;
}
function pairAspectTooltip(aspect, first, second, synastry) {
  const side = (position) => `${tName(position.name)}${wheelSignText(position.longitude).glyph}${synastry ? ` (${position.person.tag})` : ''}`;
  return `<div class="wheel-tooltip-main">${side(first)} ${tName(aspect.name)} ${side(second)}</div><div class="wheel-tooltip-sub">${t('Orb {orb}°', { orb: aspect.orb.toFixed(1) })}</div>`;
}

// Rows are the inner (or only) chart's bodies; columns are Chart B's for synastry,
// or the same chart again (upper and lower halves mirrored) for a single chart.
function pairAspectGridMarkup(people, aspects) {
  const [rowsPerson, columnsPerson = people[0]] = people;
  const synastry = people.length > 1;
  const bodies = (person) => aspectBodies(person.chart.positions.filter((position) => wheelBodyVisible(position.name) && bodyShownAt(position, person.offset || 0)));
  const rows = bodies(rowsPerson), columns = bodies(columnsPerson);
  const lookup = new Map();
  aspects.forEach((aspect) => {
    const key = `${aspect.first}|${aspect.second}`;
    if (!lookup.has(key)) lookup.set(key, aspect);
    if (!synastry && !lookup.has(`${aspect.second}|${aspect.first}`)) lookup.set(`${aspect.second}|${aspect.first}`, aspect);
  });
  // Letter "glyphs" (Asc, MC) would only repeat the name.
  const label = (person, position, row) => `<div class="grid-label${row ? ' row-label' : ''}" style="color:${person.color}">${/^[A-Za-z]+$/.test(position.glyph) ? '' : `${position.glyph} `}${tName(position.name)}</div>`;
  const cell = (row, column) => {
    const aspect = !synastry && row.name === column.name ? null : lookup.get(`${row.name}|${column.name}`);
    const title = aspect
      ? `${tName(row.name)}${synastry ? ` (${rowsPerson.tag})` : ''} ${tName(aspect.name)} ${tName(column.name)}${synastry ? ` (${columnsPerson.tag})` : ''} · ${t('orb {orb}°', { orb: aspect.orb.toFixed(1) })}`
      : t('No aspect');
    return `<div class="aspect-cell${aspect ? ' has-aspect' : ''}" title="${title}"${aspect ? ` style="color:${aspect.color}"` : ''}>${aspect ? aspect.glyph : '·'}</div>`;
  };
  const heading = synastry
    ? `${t('CROSS-ASPECTS')} · ${aspects.length} · <span style="color:${rowsPerson.color}">${t('rows {name}', { name: rowsPerson.name })}</span> · <span style="color:${columnsPerson.color}">${t('columns {name}', { name: columnsPerson.name })}</span>`
    : `${t('{name} ASPECTS', { name: rowsPerson.name.toUpperCase() })} · ${aspects.length}`;
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
const PAIR_HD_SUBJECTS = [['composite', t('Composite')], ['A', t('Chart A')], ['B', t('Chart B')]];
const PAIR_HD_VIEWS = [['bodygraph', t('Bodygraph')], ['mandala', t('Mandala')]];
const PAIR_CONNECTION_KINDS = [
  ['electromagnetic', t('Electromagnetic'), t('Each brings one gate — the channel exists only together.')],
  ['companionship', t('Companionship'), t('Both have the whole channel.')],
  ['dominance', t('Dominance'), t('One has the whole channel; the other neither gate.')],
  ['compromise', t('Compromise'), t('One has the whole channel; the other one of its gates.')],
];
let pairHdSubject = 'composite';
let pairHdView = 'bodygraph';

function renderHumanDesignPair(container, entries) {
  const people = { A: { ...PAIR_PEOPLE.A, key: 'A', name: t('Chart A'), tag: 'A', chart: entries[0].chart }, B: { ...PAIR_PEOPLE.B, key: 'B', name: t('Chart B'), tag: 'B', chart: entries[1].chart } };
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
      legend.innerHTML = `${pairLegendMarkup([people.A, people.B])}<span><i class="legend-swatch halo"></i>${t('Electromagnetic — formed only together')}</span>`;
      info.innerHTML = pairCompositeInfoMarkup(composite);
      details.innerHTML = pairCompositeDetailsMarkup(people, composite);
    } else {
      const person = people[pairHdSubject];
      state = computeBodygraphState(person.chart, 0);
      glyphMap = humanDesignGateGlyphMap(person.chart, 0);
      legend.innerHTML = `<span><i class="legend-dot" style="background:${person.color}"></i>${t('Chart {letter}', { letter: person.key })} · ${escapeHtml(person.chart.name)}</span><span><i class="legend-swatch" style="background:var(--ink)"></i>${t('Personality')}</span><span><i class="legend-swatch" style="background:var(--accent)"></i>${t('Design')}</span>`;
      const typology = computeHumanDesignTypology(state.hd);
      info.innerHTML = hdTypologyAsideMarkup(typology, { showFilter: false });
      details.innerHTML = hdTypologyDetailsMarkup(typology);
    }
    graphic.innerHTML = pairHdView === 'mandala'
      ? hdMandalaSvgMarkup(state, glyphMap)
      : `<svg class="bodygraph hd-bodygraph pair-bodygraph" viewBox="0 0 440 640" role="img" aria-label="${t('Bodygraph')}">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-bodygraph-layers>${hdBodygraphLayersMarkup(state)}</g>
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
        ...entry.personality.map((glyph) => ({ glyph, color: person.color, side: t('Chart {letter} Personality', { letter: person.key }) })),
        ...entry.design.map((glyph) => ({ glyph, color: person.color, side: t('Chart {letter} Design', { letter: person.key }) })),
      );
    });
  });
  return map;
}

const pairCenterName = (id) => tName(HD_CENTERS.find((center) => center.id === id)?.name || id);
const pairCentersSplit = (definedCount) => `${definedCount} / ${9 - definedCount}`;

// Side panel: the composite at a glance; the full lists sit below the chart.
function pairCompositeInfoMarkup(composite) {
  const { structure, connections, newlyDefinedCenters } = composite;
  const stat = (label, value) => `<div class="system-stat"><span>${label}</span><strong>${value}</strong></div>`;
  return `
    <span class="eyebrow">${t('COMPOSITE')}</span>
    <h3>${t('{type} composite', { type: tName(structure.type) })}</h3>
    <p>${tName(structure.definition)}</p>
    ${stat(t('CENTERS DEFINED / UNDEFINED'), pairCentersSplit(structure.definedCenters.size))}
    ${stat(t('DEFINED CHANNELS'), `${structure.definedChannels.length} / 36`)}
    ${stat(t('DEFINED ONLY TOGETHER'), newlyDefinedCenters.length ? newlyDefinedCenters.map(pairCenterName).join(', ') : t('None'))}
    ${PAIR_CONNECTION_KINDS.map(([kind, label]) => stat(label.toUpperCase(), connections[kind].length)).join('')}
    <div class="system-note">${t('Side-by-side comparison and every connection channel are listed below the chart.')}</div>`;
}

// Under the chart: A / B / composite side by side, then each connection kind's channels.
function pairCompositeDetailsMarkup(people, composite) {
  const { structure, connections } = composite;
  const [typologyA, typologyB] = [people.A, people.B].map((person) => computeHumanDesignTypology(computeHumanDesignChart(person.chart, 0)));
  const none = '<span class="pair-compare-none">—</span>';
  const pick = (typology, read) => (typology ? read(typology) : none);
  // Rows with a tooltip kind (hdTypologyTipHtml) explain the feature, and each value, on hover.
  const rows = [
    [t('Type'), (typology) => tName(typology.type), structure.type, 'type', (typology) => typology.type],
    [t('Aura'), (typology) => tName(typology.aura), HD_TYPE_INFO[structure.type]?.aura || none, 'aura', () => ''],
    [t('Strategy'), (typology) => tName(typology.strategy), none, 'strategy', () => ''],
    [t('Definition'), (typology) => tName(typology.definition), structure.definition, 'definition', (typology) => typology.definition],
    [t('Inner authority'), (typology) => tName(typology.authority), none, 'authority', (typology) => typology.authority],
    [t('Profile'), (typology) => `${typology.profile} · ${hdProfileNamesText(typology.profileNames)}`, none, 'profile', (typology) => typology.profile],
    [t('Incarnation cross'), (typology) => `${tName(typology.cross.angle)} · ${typology.cross.gates}`, none],
    [t('Quadrant'), (typology) => tName(typology.quadrant.name), none],
    [t('Centers defined / undefined'), (typology) => pairCentersSplit(typology.definedCenters.size), pairCentersSplit(structure.definedCenters.size)],
    [t('Defined channels'), (typology) => `${typology.definedChannels.length} / 36`, `${structure.definedChannels.length} / 36`],
  ];
  const table = `
    <div class="pair-compare">
      <table class="pair-compare-table">
        <thead><tr><th><span class="visually-hidden">${t('Feature')}</span></th>${[people.A, people.B].map((person) => `<th class="pair-person-head" style="--person-color:${person.color}">${t('Chart {letter}', { letter: person.key })} · ${escapeHtml(person.chart.name)}</th>`).join('')}<th>${t('Composite')}</th></tr></thead>
        <tbody>${rows.map(([label, read, compositeValue, kind, tipValue]) => {
          const cell = (typology) => (kind && typology ? `<td><span class="hd-tip-value" ${hdTipAttributes(kind, tipValue(typology), typology.type)}>${read(typology)}</span></td>` : `<td>${pick(typology, read)}</td>`);
          const composite = kind && compositeValue !== none ? `<span class="hd-tip-value" ${hdTipAttributes(kind, kind === 'aura' ? '' : compositeValue, structure.type)}>${tName(compositeValue)}</span>` : compositeValue;
          return `<tr><th>${kind ? `<span class="hd-tip-value" ${hdTipAttributes(kind)}>${label}</span>` : label}</th>${cell(typologyA)}${cell(typologyB)}<td>${composite}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  const notes = {
    electromagnetic: (channel) => `A ${channel.fromA} · B ${channel.fromB}`,
    companionship: () => t('both charts'),
    dominance: (channel) => t('Chart {letter}', { letter: channel.owner }),
    compromise: (channel) => `${t('Chart {letter}', { letter: channel.owner })} · ${t('other has {gates}', { gates: channel.partial.join(', ') })}`,
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
