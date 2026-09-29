// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const ASPECT_DEFINITIONS = [
  {name: 'Conjunction', angle: 0, orb: 10, glyph: '☌'},
  {name: 'Opposition', angle: 180, orb: 10, glyph: '☍'},
  {name: 'Square', angle: 90, orb: 10, glyph: '□'},
  {name: 'Trine', angle: 120, orb: 10, glyph: '△'},
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

// Intensity, by how much of the aspect's own max orb is used (for a 10° conjunction):
//   exact  — within a tenth (1°);   strong — within a fifth (2°);
//   normal — within three fifths (6°);   weak — the rest, out to the max orb.
const ASPECT_EXACT_FRACTION = 1 / 10;
const ASPECT_STRONG_FRACTION = 1 / 5;
const ASPECT_NORMAL_FRACTION = 3 / 5;
const ASPECT_INTENSITIES = [['exact', 'Exact'], ['strong', 'Strong'], ['normal', 'Normal'], ['weak', 'Weak']];
function aspectIntensity(orb, maxOrb) {
  if (orb <= maxOrb * ASPECT_EXACT_FRACTION) return 'exact';
  if (orb <= maxOrb * ASPECT_STRONG_FRACTION) return 'strong';
  return orb <= maxOrb * ASPECT_NORMAL_FRACTION ? 'normal' : 'weak';
}
// Intensities filtered out of the wheels, aspect lists and grids, shared by every astrology view.
const wheelHiddenIntensities = new Set();
const aspectIntensityShown = (aspect) => !wheelHiddenIntensities.has(aspect.intensity);

// The South Node is always exactly opposite the North Node, so its aspects only repeat
// the North Node's (and crowd the lists); it's left out of aspects altogether.
const NON_ASPECT_BODIES = ['Earth', 'Lilith', 'Vertex', 'Fortuna', 'South Node'];
// Aspects to the Midheaven are listed, but not drawn as lines across the wheel.
const UNDRAWN_ASPECT_BODIES = new Set(['Midheaven']);
// Nor are aspects of an intensity filtered out.
function aspectDrawnOnWheel(aspect) {
  return !UNDRAWN_ASPECT_BODIES.has(aspect.first) && !UNDRAWN_ASPECT_BODIES.has(aspect.second) && !wheelHiddenIntensities.has(aspect.intensity);
}
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

// ── Aspect tooltips (the Overview aspect lists) ───────────────────────────
// Hovering or focusing an aspect row explains it: what the aspect does, and how it
// joins the two bodies' themes. Built from the row's data-aspect-* attributes.
const ASPECT_MEANINGS = {
  Conjunction: { nature: 'Fusion', text: 'The two bodies sit together and act as one, each intensifying the other, for better or worse.', join: 'are fused, acting as one force' },
  Opposition: { nature: 'Tension · polarity', text: 'The two bodies face each other across the zodiac: a pull between opposite needs that asks for balance, often met through other people.', join: 'pull in opposite directions, asking to be balanced' },
  Square: { nature: 'Tension · friction', text: 'The two bodies are at cross purposes. The friction is uncomfortable, but it drives effort, action and growth.', join: 'clash and create friction that pushes for change' },
  Trine: { nature: 'Harmony · flow', text: 'The two bodies share an element and work together easily: a natural gift, though one that can be taken for granted.', join: 'flow easily together, a natural talent' },
  Sextile: { nature: 'Harmony · opportunity', text: 'The two bodies are compatible and support each other when you make the effort: an opportunity rather than a given.', join: 'cooperate and open opportunities when used' },
  Quincunx: { nature: 'Adjustment', text: 'The two bodies have nothing in common (different element and mode), so they need constant small adjustments to get along.', join: 'misunderstand each other and need ongoing adjustment' },
  Semisextile: { nature: 'Minor · subtle link', text: 'Neighbouring signs: a subtle link with mild friction that helps each body grow from the other.', join: 'are subtly linked, learning from each other' },
  Semisquare: { nature: 'Minor · irritation', text: 'Half a square: small, nagging irritations that prompt action.', join: 'rub against each other in small, irritating ways' },
  Sesquiquadrate: { nature: 'Minor · agitation', text: 'A square and a half: an underlying restlessness that flares up from time to time.', join: 'create an underlying agitation that flares now and then' },
  Quintile: { nature: 'Minor · creativity', text: 'A fifth of the circle: a creative, distinctive talent that combines the two bodies in an individual way.', join: 'combine creatively, as a distinctive talent or style' },
};
const ASPECT_BODY_THEMES = {
  Sun: 'identity and purpose',
  Moon: 'emotions and needs',
  Mercury: 'thinking and communication',
  Venus: 'love, values and pleasure',
  Mars: 'drive and assertion',
  Jupiter: 'growth and optimism',
  Saturn: 'discipline and limits',
  Uranus: 'freedom and change',
  Neptune: 'imagination and ideals',
  Pluto: 'power and transformation',
  'North Node': 'direction of growth',
  'South Node': 'familiar patterns',
  Ascendant: 'self-image and approach to life',
  Midheaven: 'vocation and public role',
  Chiron: 'wounds and healing',
  Lilith: 'raw, untamed instinct',
};
function aspectRowAttributes(aspect, ownerFirst = '', ownerSecond = '') {
  const attribute = value => escapeHtml(String(value));
  return `tabindex="0" data-aspect-tip data-aspect-name="${attribute(aspect.name)}" data-aspect-first="${attribute(aspect.first)}" data-aspect-second="${attribute(aspect.second)}" data-aspect-orb="${aspect.orb}" data-aspect-max-orb="${aspect.maxOrb}"${ownerFirst ? ` data-aspect-owner-first="${attribute(ownerFirst)}" data-aspect-owner-second="${attribute(ownerSecond)}"` : ''}`;
}
function aspectTooltipHtml(row) {
  const { aspectName: name, aspectFirst: first, aspectSecond: second, aspectOwnerFirst: ownerFirst, aspectOwnerSecond: ownerSecond } = row.dataset;
  const definition = ASPECT_DEFINITIONS.find(item => item.name === name);
  const meaning = ASPECT_MEANINGS[name];
  if (!definition || !meaning) return '';
  const orb = Number(row.dataset.aspectOrb), maxOrb = Number(row.dataset.aspectMaxOrb);
  const who = (owner, body) => `${owner ? `${escapeHtml(owner)}'s ` : ''}${ASPECT_BODY_THEMES[body] || escapeHtml(body)} (${escapeHtml(body)})`;
  const sentence = `${who(ownerFirst, first)} and ${who(ownerSecond, second)} ${meaning.join}.`;
  const strength = orb <= maxOrb * ASPECT_EXACT_FRACTION ? 'Exact: felt very strongly.' : orb <= maxOrb * ASPECT_STRONG_FRACTION ? 'Very close: strongly felt.' : orb <= maxOrb * ASPECT_NORMAL_FRACTION ? 'Moderate orb: clearly felt.' : 'Wide orb: a milder, background influence.';
  const between = ownerFirst && ownerFirst !== ownerSecond
    ? '<div class="gk-tip-text">Between two charts (synastry), it describes how these two parts of the people meet in the relationship.</div>' : '';
  return `<div class="gk-tip-title">${escapeHtml(first)} <span style="color:${ASPECT_COLORS[name] || 'inherit'}">${definition.glyph}</span> ${escapeHtml(name.toLowerCase())} ${escapeHtml(second)} · ${meaning.nature}</div>
    <div class="gk-tip-text">${definition.angle}°: ${meaning.text}</div>
    <div class="gk-tip-title">Here</div><div class="gk-tip-text">${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}</div>${between}
    <div class="gk-tip-title">Orb ${orb.toFixed(1)}° of ${maxOrb}°</div><div class="gk-tip-text">${strength}</div>`;
}
// A hover tooltip for every element matching `selector` (also shown under one that
// has keyboard focus, and described to screen readers); `htmlFor(element)` builds its
// content when it's first shown. Used for aspect rows and Human Design features.
function bindHoverTooltips(selector, htmlFor, id) {
  let tooltip = null, current = null;
  const place = (x, y) => {
    const left = x + 14 + tooltip.offsetWidth > window.innerWidth ? x - 14 - tooltip.offsetWidth : x + 14;
    const top = y + 14 + tooltip.offsetHeight > window.innerHeight ? y - 14 - tooltip.offsetHeight : y + 14;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  };
  const show = (element, x, y) => {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = id;
      tooltip.className = 'wheel-tooltip gk-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltip);
    }
    if (current !== element) {
      current?.removeAttribute('aria-describedby');
      current = element;
      tooltip.innerHTML = htmlFor(element);
      element.setAttribute('aria-describedby', tooltip.id);
    }
    tooltip.hidden = false;
    place(x, y);
  };
  const hide = () => {
    current?.removeAttribute('aria-describedby');
    current = null;
    if (tooltip) tooltip.hidden = true;
  };
  document.addEventListener('mousemove', event => {
    const element = event.target.closest?.(selector);
    if (element) show(element, event.clientX, event.clientY);
    else if (current && document.activeElement !== current) hide();
  });
  document.addEventListener('focusin', event => {
    const element = event.target.closest?.(selector);
    if (!element) return;
    const box = element.getBoundingClientRect();
    show(element, box.left + 24, box.bottom - 6);
  });
  document.addEventListener('focusout', event => { if (event.target === current) hide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && current && document.activeElement === current) hide(); });
  // A list re-rendered under the tooltip (timeline, filters) takes its element away.
  new MutationObserver(() => { if (current && !current.isConnected) hide(); }).observe(document.body, { childList: true, subtree: true });
}
bindHoverTooltips('[data-aspect-tip]', aspectTooltipHtml, 'aspectTooltip');

function renderCalculatedAspects(offsetMinutes = window.timelineOffsetMinutes || 0) {
  // The chart the explorer is showing: the library chart, or the current sky in the Timeline Explorer.
  const chart = currentExplorerChart();
  const list = document.getElementById('aspectList');
  if (!chart || !list) return;
  // Only the bodies the wheel shows (the planet filters), as in every astrology view.
  const transientChart = {...chart, positions: chart.positions.filter(position => wheelBodyVisible(position.name) && bodyShownAt(position, offsetMinutes)).map(position => {
    return {...position, angle: positionAngleAtTime(position, offsetMinutes)};
  })};
  const aspects = calculateAspects(transientChart).filter(aspectIntensityShown);
  list.innerHTML = aspects.length ? aspects.map(aspect => `<div class="aspect-row" ${aspectRowAttributes(aspect)}><span><b class="aspect-glyph" style="color:${aspect.color}">${aspect.glyph}</b>${aspect.first} ${aspect.name.toLowerCase()} ${aspect.second}</span><span>${aspect.orb.toFixed(1)}° orb</span></div>`).join('') : '<div class="aspect-empty">No aspects in this filter.</div>';
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
  const aspects = calculateAspects(chart).filter(aspectIntensityShown);
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
  const intensity = ([key, label]) => `<label class="acg-filter" title="${label}: within ${{ exact: 'a tenth', strong: 'a fifth', normal: 'three fifths', weak: 'all' }[key]} of the aspect's max orb"><input type="checkbox" data-wheel-intensity="${key}" ${wheelHiddenIntensities.has(key) ? '' : 'checked'}><span><i class="intensity-swatch ${key}"></i>${label}</span></label>`;
  // Two columns: the planets, then the aspects (types and intensities).
  return `<div class="wheel-filter-column"><span class="eyebrow">PLANETS</span>${planets('Primary')}${planets('Secondary')}</div><div class="wheel-filter-column"><span class="eyebrow">ASPECTS</span>${aspects('Primary')}${aspects('Secondary')}<span class="eyebrow wheel-filter-section" title="Which aspects the wheel, the lists and the grids show">INTENSITY</span><div class="acg-filter-group">${ASPECT_INTENSITIES.map(intensity).join('')}</div></div>`;
}
// Brings every filter checkbox under `root` in line with the shared sets, including
// each subheading's ticked / unticked / partly-ticked (dash) state.
function syncWheelFilterInputs(root = document) {
  root.querySelectorAll('[data-wheel-body]').forEach(input => { input.checked = !wheelHiddenBodies.has(input.dataset.wheelBody); });
  root.querySelectorAll('[data-wheel-aspect]').forEach(input => { input.checked = !wheelHiddenAspects.has(input.dataset.wheelAspect); });
  root.querySelectorAll('[data-wheel-intensity]').forEach(input => { input.checked = !wheelHiddenIntensities.has(input.dataset.wheelIntensity); });
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
  const { wheelBody, wheelAspect, wheelIntensity, filterGroup } = input.dataset;
  const set = (hidden, keys, show) => keys.forEach(key => (show ? hidden.delete(key) : hidden.add(key)));
  if (wheelBody) set(wheelHiddenBodies, [wheelBody], input.checked);
  else if (wheelAspect) set(wheelHiddenAspects, [wheelAspect], input.checked);
  else if (wheelIntensity) set(wheelHiddenIntensities, [wheelIntensity], input.checked);
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