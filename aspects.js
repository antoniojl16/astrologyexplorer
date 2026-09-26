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
let aspectMode = 'main';
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
// Every aspect (within its orb) between two bodies, as calculateAspects reports them.
function aspectsBetween(first, second, includeAll) {
  const distance = angularDistance(aspectLongitude(first), aspectLongitude(second));
  return ASPECT_DEFINITIONS.flatMap(definition => {
    const orb = Math.abs(distance - definition.angle);
    if ((!includeAll && !MAIN_ASPECTS.has(definition.name)) || orb > definition.orb) return [];
    return [{
      ...definition, first: first.name, second: second.name, orb, maxOrb: definition.orb,
      intensity: aspectIntensity(orb, definition.orb), color: ASPECT_COLORS[definition.name] || 'var(--line)'
    }];
  });
}
function calculateAspects(chart, includeAll = false) {
  const positions = aspectBodies(chart.positions);
  const aspects = [];
  positions.forEach((first, firstIndex) => positions.slice(firstIndex + 1).forEach(second => {
    if (isNodalAxis(first, second)) return;
    aspects.push(...aspectsBetween(first, second, includeAll));
  }));
  return aspects.sort((first, second) => first.orb - second.orb);
}
// Synastry: only aspects between chart A's bodies (`first`) and chart B's (`second`),
// never within one chart, so the same body name can appear on both sides.
function calculateCrossAspects(positionsA, positionsB, includeAll = false) {
  const bodiesB = aspectBodies(positionsB);
  return aspectBodies(positionsA)
    .flatMap(first => bodiesB.flatMap(second => aspectsBetween(first, second, includeAll)))
    .sort((first, second) => first.orb - second.orb);
}

function renderCalculatedAspects(offsetMinutes = window.timelineOffsetMinutes || 0) {
  const chart = chartById(selectedChartId);
  const list = document.getElementById('aspectList');
  if (!chart || !list) return;
  const transientChart = {...chart, positions: chart.positions.map(position => {
    return {...position, angle: positionAngleAtTime(position, offsetMinutes)};
  })};
  const aspects = calculateAspects(transientChart, aspectMode === 'all').slice(0, 18);
  list.innerHTML = aspects.length ? aspects.map(aspect => `<div class="aspect-row"><span><b class="aspect-glyph">${aspect.glyph}</b>${aspect.first} ${aspect.name.toLowerCase()} ${aspect.second}</span><span>${aspect.orb.toFixed(1)}° orb</span></div>`).join('') : '<div class="aspect-empty">No aspects in this filter.</div>';
  if (chartViewMode !== 'wheel') renderAspectGrid(transientChart, aspectMode === 'all');
}

function renderAspectGrid(chart, includeAll) {
  // Scoped to #chartSystemSurface: an unscoped document.querySelector('.wheel-stage')
  // would match whichever .wheel-stage comes first in the DOM, and the Cycle Explorer
  // has its own (always-present, just usually hidden) .wheel-stage too.
  const stage = document.querySelector('#chartSystemSurface .wheel-stage');
  if (!stage) return;
  let grid = document.getElementById('aspectGrid');
  if (!grid) { grid = document.createElement('div'); grid.id = 'aspectGrid'; stage.appendChild(grid); }
  const positions = chart.positions.slice(0, 17);
  const aspects = calculateAspects(chart, includeAll);
  const lookup = new Map(aspects.map(aspect => [`${aspect.first}|${aspect.second}`, aspect]));
  const shortName = name => name === 'North Node' ? 'N.Node' : name === 'South Node' ? 'S.Node' : name;
  grid.innerHTML = `<div class="grid-corner"></div>${positions.map(position => `<div class="grid-label">${shortName(position.name)}</div>`).join('')}${positions.map((row, rowIndex) => `<div class="grid-label row-label">${shortName(row.name)}</div>${positions.map((column, columnIndex) => { const aspect = rowIndex === columnIndex ? null : (lookup.get(`${row.name}|${column.name}`) || lookup.get(`${column.name}|${row.name}`)); return `<div class="aspect-cell ${aspect ? 'has-aspect' : ''}" title="${aspect ? `${aspect.name}, ${aspect.orb.toFixed(1)}° orb` : 'No aspect'}">${aspect ? aspect.glyph : '·'}</div>`; }).join('')}`).join('')}`;
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

function setAspectMode(mode) {
  aspectMode = mode;
  document.querySelectorAll('[data-all-aspects]').forEach(input => { input.checked = mode === 'all'; });
}

function initAspectEngine() {
  const segmented = document.querySelector('.segmented');
  const bothButton = document.createElement('button');
  bothButton.type = 'button';
  bothButton.textContent = 'Both';
  segmented.appendChild(bothButton);
  segmented.querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => setChartView(['wheel', 'aspects', 'both'][index])));
  // "All aspects" checkbox: one shared aspectMode, so every [data-all-aspects] box
  // (Chart Explorer and Pair Explorer alike) is kept in step.
  document.querySelectorAll('#chartSystemSurface [data-all-aspects]').forEach(input => {
    input.checked = aspectMode === 'all';
    input.addEventListener('change', () => {
      setAspectMode(input.checked ? 'all' : 'main');
      const chart = currentExplorerChart();
      if (chart) renderPreciseWheel(chart, window.timelineOffsetMinutes || 0);
      renderCalculatedAspects();
    });
  });
  const originalRenderExplorer = renderExplorer;
  window.renderExplorer = function renderExplorerWithAspects() {
    originalRenderExplorer();
    renderCalculatedAspects();
  };
  renderCalculatedAspects();
}

initAspectEngine();