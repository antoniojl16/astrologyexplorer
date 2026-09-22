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

function calculateAspects(chart, includeAll = false) {
  const nonAspectPlanets=['Earth', 'North Node', 'South Node', 'Ascendant', 'Midheaven', 'Lilith', 'Chiron', 'Vertex', 'Fortuna'];
  const positions = chart.positions.filter(position => typeof position.angle === 'number' || position.sign).filter(position => nonAspectPlanets.indexOf(position.name) === -1);
  const aspects = [];
  positions.forEach((first, firstIndex) => positions.slice(firstIndex + 1).forEach(second => {
    const firstAngle = first.angle ?? SIGNS.indexOf(first.sign) * 30 + first.degree;
    const secondAngle = second.angle ?? SIGNS.indexOf(second.sign) * 30 + second.degree;
    const distance = angularDistance(firstAngle, secondAngle);
    ASPECT_DEFINITIONS.forEach(definition => {
      const orb = Math.abs(distance - definition.angle);
      if ((!includeAll && !MAIN_ASPECTS.has(definition.name)) || orb > definition.orb) return;
      aspects.push({
        ...definition, first: first.name, second: second.name, orb, maxOrb: definition.orb,
        intensity: aspectIntensity(orb, definition.orb), color: ASPECT_COLORS[definition.name] || 'var(--line)'
      });
    });
  }));
  return aspects.sort((first, second) => first.orb - second.orb);
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

function initAspectEngine() {
  const segmented = document.querySelector('.segmented');
  const bothButton = document.createElement('button');
  bothButton.type = 'button';
  bothButton.textContent = 'Both';
  segmented.appendChild(bothButton);
  segmented.querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => setChartView(['wheel', 'aspects', 'both'][index])));
  document.querySelectorAll('.aspect-filters button').forEach((button, index) => button.addEventListener('click', () => {
    aspectMode = index === 0 ? 'main' : 'all';
    document.querySelectorAll('.aspect-filters button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    renderCalculatedAspects();
  }));
  const originalRenderExplorer = renderExplorer;
  window.renderExplorer = function renderExplorerWithAspects() {
    originalRenderExplorer();
    renderCalculatedAspects();
  };
  renderCalculatedAspects();
}

initAspectEngine();