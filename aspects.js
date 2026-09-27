// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const ASPECT_DEFINITIONS = [
  {name: 'Conjunction', angle: 0, orb: 10, glyph: '☌'},
  {name: 'Opposition', angle: 180, orb: 10, glyph: '☍'},
  {name: 'Square', angle: 90, orb: 8, glyph: '□'},
  {name: 'Trine', angle: 120, orb: 8, glyph: '△'},
  {name: 'Sextile', angle: 60, orb: 6, glyph: '⚹'},
  {name: 'Quincunx', angle: 150, orb: 3, glyph: '⚻'},
  {name: 'Semisextile', angle: 30, orb: 2, glyph: '⚺'},
  {name: 'Semisquare', angle: 45, orb: 2, glyph: '∠'},
  {name: 'Sesquiquadrate', angle: 135, orb: 2, glyph: '⚼'},
  {name: 'Quintile', angle: 72, orb: 2, glyph: 'Q'}
];
const MAIN_ASPECTS = new Set(['Conjunction', 'Opposition', 'Square', 'Trine', 'Sextile']);
// Aspect filters: which aspects are drawn and listed, shared by every astrology view.
// By default the Primary (main) aspects are shown and the Secondary ones hidden.
const wheelHiddenAspects = new Set(ASPECT_DEFINITIONS.filter(definition => !MAIN_ASPECTS.has(definition.name)).map(definition => definition.name));
function aspectVisible(name) {
  return !wheelHiddenAspects.has(name);
}
let chartViewMode = 'wheel';

// Traditional red-for-hard / blue-for-soft, extended to the minor aspects:
// orange for the harder minor aspects (semisquare, sesquiquadrate, quincunx),
// green for the softer ones (semisextile, quintile). Conjunction is neither
// harmonious nor discordant, so it gets a neutral violet instead.
const ASPECT_COLORS = {
  Conjunction: '#8a7fc9',
  Opposition: '#c0483f',
  Square: '#c0483f',
  Trine: '#3f7fc0',
  Sextile: '#3f7fc0',
  Quincunx: '#c07a3f',
  Semisquare: '#c07a3f',
  Sesquiquadrate: '#c07a3f',
  Semisextile: '#5a9e5a',
  Quintile: '#5a9e5a'
};

function angularDistance(first, second) {
  const distance = Math.abs(first - second) % 360;
  return Math.min(distance, 360 - distance);
}

// exact: within 2° regardless of aspect type. Beyond that, normal vs. weak
// splits whatever orb range remains for that aspect's own max orb — so a
// wide-orb aspect (e.g. a 10°-orb conjunction) still has room to be "normal"
// well past 2°, while a tight minor aspect (2° max orb) is only ever exact
// or weak, since it's never registered past its own max in the first place.
function aspectIntensity(orb, maxOrb) {
  if (orb <= 2) return 'exact';
  return orb <= maxOrb * 0.6 ? 'normal' : 'weak';
}

const NON_ASPECT_BODIES = ['Earth', 'Lilith', 'Chiron', 'Vertex', 'Fortuna'];
// Within one chart the Nodes are always exactly opposite each other — an axis, not an aspect.
const isNodalAxis = (first, second) => [first.name, second.name].sort().join('|') === 'North Node|South Node';
function aspectBodies(positions) {
  return positions.filter(position => typeof position.angle === 'number' || position.sign).filter(position => NON_ASPECT_BODIES.indexOf(position.name) === -1);
}
function aspectLongitude(position) {
  return position.angle ?? SIGNS.indexOf(position.sign) * 30 + position.degree;
}
// Every aspect (within its orb) between two bodies that `visible` lets through (by
// default, the aspect filters), as calculateAspects reports them.
function aspectsBetween(first, second, visible = aspectVisible) {
  const distance = angularDistance(aspectLongitude(first), aspectLongitude(second));
  return ASPECT_DEFINITIONS.flatMap(definition => {
    const orb = Math.abs(distance - definition.angle);
    if (!visible(definition.name) || orb > definition.orb) return [];
    return [{
      ...definition, first: first.name, second: second.name, orb, maxOrb: definition.orb,
      intensity: aspectIntensity(orb, definition.orb), color: ASPECT_COLORS[definition.name] || 'var(--line)'
    }];
  });
}
function calculateAspects(chart, visible = aspectVisible) {
  const positions = aspectBodies(chart.positions);
  const aspects = [];
  positions.forEach((first, firstIndex) => positions.slice(firstIndex + 1).forEach(second => {
    if (isNodalAxis(first, second)) return;
    aspects.push(...aspectsBetween(first, second, visible));
  }));
  return aspects.sort((first, second) => first.orb - second.orb);
}
// Synastry: only aspects between chart A's bodies (`first`) and chart B's (`second`),
// never within one chart, so the same body name can appear on both sides.
function calculateCrossAspects(positionsA, positionsB, visible = aspectVisible) {
  const bodiesB = aspectBodies(positionsB);
  return aspectBodies(positionsA)
    .flatMap(first => bodiesB.flatMap(second => aspectsBetween(first, second, visible)))
    .sort((first, second) => first.orb - second.orb);
}

function renderCalculatedAspects(offsetMinutes = window.timelineOffsetMinutes || 0) {
  // The chart the explorer is showing: the library chart, or the current sky in the Timeline Explorer.
  const chart = currentExplorerChart();
  const list = document.getElementById('aspectList');
  if (!chart || !list) return;
  const transientChart = {...chart, positions: chart.positions.map(position => {
    return {...position, angle: positionAngleAtTime(position, offsetMinutes)};
  })};
  const aspects = calculateAspects(transientChart).slice(0, 18);
  list.innerHTML = aspects.length ? aspects.map(aspect => `<div class="aspect-row"><span><b class="aspect-glyph" style="color:${aspect.color}">${aspect.glyph}</b>${aspect.first} ${aspect.name.toLowerCase()} ${aspect.second}</span><span>${aspect.orb.toFixed(1)}° orb</span></div>`).join('') : '<div class="aspect-empty">No aspects in this filter.</div>';
  if (chartViewMode !== 'wheel') renderAspectGrid(transientChart);
}

function renderAspectGrid(chart) {
  // Scoped to #chartSystemSurface: an unscoped document.querySelector('.wheel-stage')
  // would match whichever .wheel-stage comes first in the DOM, and the Cycle Explorer
  // has its own (always-present, just usually hidden) .wheel-stage too.
  const stage = document.querySelector('#chartSystemSurface .wheel-stage');
  if (!stage) return;
  let grid = document.getElementById('aspectGrid');
  if (!grid) { grid = document.createElement('div'); grid.id = 'aspectGrid'; stage.appendChild(grid); }
  const positions = chart.positions.slice(0, 17);
  const aspects = calculateAspects(chart);
  const lookup = new Map(aspects.map(aspect => [`${aspect.first}|${aspect.second}`, aspect]));
  const shortName = name => name === 'North Node' ? 'N.Node' : name === 'South Node' ? 'S.Node' : name;
  grid.innerHTML = `<div class="grid-corner"></div>${positions.map(position => `<div class="grid-label">${shortName(position.name)}</div>`).join('')}${positions.map((row, rowIndex) => `<div class="grid-label row-label">${shortName(row.name)}</div>${positions.map((column, columnIndex) => { const aspect = rowIndex === columnIndex ? null : (lookup.get(`${row.name}|${column.name}`) || lookup.get(`${column.name}|${row.name}`)); return `<div class="aspect-cell ${aspect ? 'has-aspect' : ''}" title="${aspect ? `${aspect.name}, ${aspect.orb.toFixed(1)}° orb` : 'No aspect'}"${aspect ? ` style="color:${aspect.color}"` : ''}>${aspect ? aspect.glyph : '·'}</div>`; }).join('')}`).join('')}`;
}

function setChartView(mode) {
  chartViewMode = mode;
  const stage = document.querySelector('#chartSystemSurface .wheel-stage');
  const svg = document.getElementById('chartWheel');
  const caption = document.querySelector('#chartSystemSurface .wheel-caption');
  document.querySelectorAll('.segmented button').forEach((button, index) => button.classList.toggle('active', index === ({wheel: 0, aspects: 1, both: 2}[mode])));
  if (stage) stage.classList.toggle('aspects-only', mode === 'aspects');
  if (svg) svg.hidden = mode === 'aspects';
  if (caption) caption.hidden = mode === 'aspects';
  if (mode !== 'wheel') renderCalculatedAspects(window.timelineOffsetMinutes || 0);
  else document.getElementById('aspectGrid')?.remove();
}

// ── Planet & aspect filter panel ──────────────────────────────────────────
// One panel design for the Chart Explorer and the Pair Explorer, both driving the same
// shared sets (wheelHiddenBodies, wheelHiddenAspects). Each subheading has its own
// checkbox that ticks or unticks every item under it, and shows a dash when only some are.
function wheelFilterMembers(kind, group) {
  if (kind === 'planets') return WHEEL_FILTER_BODIES.filter(body => body.group === group).map(body => body.key);
  return ASPECT_DEFINITIONS.filter(definition => MAIN_ASPECTS.has(definition.name) === (group === 'Primary')).map(definition => definition.name);
}
function wheelFilterHiddenSet(kind) {
  return kind === 'planets' ? wheelHiddenBodies : wheelHiddenAspects;
}
function wheelFiltersMarkup() {
  const planet = body => `<label class="acg-filter"><input type="checkbox" data-wheel-body="${body.key}" ${wheelHiddenBodies.has(body.key) ? '' : 'checked'}><span>${body.glyph} ${body.key}</span></label>`;
  const aspect = definition => `<label class="acg-filter"><input type="checkbox" data-wheel-aspect="${definition.name}" ${wheelHiddenAspects.has(definition.name) ? '' : 'checked'}><span><b class="aspect-filter-glyph" style="color:${ASPECT_COLORS[definition.name] || 'var(--muted)'}">${definition.glyph}</b> ${definition.name}</span></label>`;
  const group = (kind, name, items) => `<div class="acg-filter-group"><label class="acg-filter wheel-filter-group-toggle"><input type="checkbox" data-filter-group="${kind}:${name}"><span>${name}</span></label>${items}</div>`;
  const planets = name => group('planets', name, WHEEL_FILTER_BODIES.filter(body => body.group === name).map(planet).join(''));
  const aspects = name => group('aspects', name, ASPECT_DEFINITIONS.filter(definition => wheelFilterMembers('aspects', name).includes(definition.name)).map(aspect).join(''));
  return `<span class="eyebrow">PLANETS</span>${planets('Primary')}${planets('Secondary')}<span class="eyebrow wheel-filter-section">ASPECTS</span>${aspects('Primary')}${aspects('Secondary')}`;
}
// Brings every filter checkbox under `root` in line with the shared sets, including
// each subheading's ticked / unticked / partly-ticked (dash) state.
function syncWheelFilterInputs(root = document) {
  root.querySelectorAll('[data-wheel-body]').forEach(input => { input.checked = !wheelHiddenBodies.has(input.dataset.wheelBody); });
  root.querySelectorAll('[data-wheel-aspect]').forEach(input => { input.checked = !wheelHiddenAspects.has(input.dataset.wheelAspect); });
  root.querySelectorAll('[data-filter-group]').forEach(input => {
    const [kind, group] = input.dataset.filterGroup.split(':');
    const hidden = wheelFilterHiddenSet(kind);
    const members = wheelFilterMembers(kind, group);
    const shown = members.filter(member => !hidden.has(member)).length;
    input.checked = shown === members.length;
    input.indeterminate = shown > 0 && shown < members.length;
  });
}
// Applies a filter checkbox change to the shared sets and re-syncs every filter panel on
// the page. Returns false for anything that isn't a filter checkbox.
function applyWheelFilterChange(input) {
  const { wheelBody, wheelAspect, filterGroup } = input.dataset;
  const set = (hidden, keys, show) => keys.forEach(key => (show ? hidden.delete(key) : hidden.add(key)));
  if (wheelBody) set(wheelHiddenBodies, [wheelBody], input.checked);
  else if (wheelAspect) set(wheelHiddenAspects, [wheelAspect], input.checked);
  else if (filterGroup) {
    const [kind, group] = filterGroup.split(':');
    set(wheelFilterHiddenSet(kind), wheelFilterMembers(kind, group), input.checked);
  } else return false;
  syncWheelFilterInputs(document);
  return true;
}

function initAspectEngine() {
  const segmented = document.querySelector('.segmented');
  const bothButton = document.createElement('button');
  bothButton.type = 'button';
  bothButton.textContent = 'Both';
  segmented.appendChild(bothButton);
  segmented.querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => setChartView(['wheel', 'aspects', 'both'][index])));
  const wheelFilters = document.querySelector('[data-wheel-filters]');
  if (wheelFilters) {
    wheelFilters.innerHTML = wheelFiltersMarkup();
    syncWheelFilterInputs(wheelFilters);
    wheelFilters.addEventListener('change', event => {
      if (!applyWheelFilterChange(event.target)) return;
      const chart = currentExplorerChart();
      if (chart) renderPreciseWheel(chart, window.timelineOffsetMinutes || 0);
      renderCalculatedAspects();
    });
  }
  const originalRenderExplorer = renderExplorer;
  window.renderExplorer = function renderExplorerWithAspects() {
    originalRenderExplorer();
    renderCalculatedAspects();
  };
  renderCalculatedAspects();
}

initAspectEngine();