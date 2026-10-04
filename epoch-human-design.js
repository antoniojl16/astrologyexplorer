// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer: Human Design ─────────────────────────────────────────
// The equinox drifts backwards through the star-fixed mandala (precession), about one
// gate every ~400 years and one line every ~67. Human Design reads it as a global
// incarnation cross: the equinox is the Personality Sun, its opposite the Personality
// Earth, and 88° behind it the Design Sun (and its opposite, the Design Earth). Because
// 88° isn't a whole number of lines, each line splits into two sub-epochs with
// different Design lines — the twelve profiles, alternating ~58 and ~9 years — and from
// the 4/1 profile on, the Design gates move one gate over.
//
// Where the equinox sits among the gates comes from EPOCH_PRECESSION
// (epoch-precession.js, tools/build-epoch-precession.py): the IAU long-term precession
// model, anchored to Human Design's own time for the 37 → 55 transition (15 Feb 2027
// 22:10 UTC). In ayanamsa terms (how far the equinox has drifted, in degrees), every
// boundary falls on a fixed grid:
//   gate (epoch)        ayanamsa = 1.75 + 5.625·n       (equinox on a gate cusp)
//   Personality line    ayanamsa = 0.8125 + 0.9375·n
//   Design line         ayanamsa = 0.9375·n             (equinox − 88° on a line cusp)

const EPOCH_HD_GATE_GRID = [1.75, 5.625];
const EPOCH_HD_LINE_GRID = [0.8125, 0.9375];
const EPOCH_HD_DESIGN_GRID = [0, 0.9375];
const EPOCH_HD_DESIGN_ARC = 88;
const EPOCH_HD_ANCHOR = epochUtFromCalendar(2027, 2, 15, 22 + 10 / 60);
// The range: whole epochs within the precession table (set by epochHdInit, once the
// table has loaded) — about 16,800 BC to 3600 AD, around Human Design's whole table.
let EPOCH_HD_MIN = null, EPOCH_HD_MAX = null;
const EPOCH_HD_RIGHT = new Set(['1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/6']);

// Human Design's published table of global cycles (Jovian Archive), as printed: start
// year (BC as negative, counted with a year 0 — their "33 BC" is year −33), whether
// it's one of the two "Lock" crosses, the four gates (Personality Sun, Personality
// Earth, Design Sun, Design Earth), and the Right Angle Cross name. Each row starts 412
// years after the one before; the printed 2927 BC breaks that pattern (2917 BC fits
// it), a typo in the source.
const EPOCH_HD_PUBLISHED = [
  [-16513, 1, [1, 2, 7, 13], 'the Sphinx'], [-16101, 0, [44, 24, 33, 19], 'the Four Ways'], [-15689, 0, [28, 27, 31, 41], 'the Unexpected'],
  [-15277, 0, [50, 3, 56, 60], 'Laws'], [-14865, 0, [32, 42, 62, 61], 'Maya'], [-14453, 0, [57, 51, 53, 54], 'Penetration'],
  [-14041, 0, [48, 21, 39, 38], 'Tension'], [-13629, 0, [18, 17, 52, 58], 'Service'], [-13217, 1, [46, 25, 15, 10], 'the Vessel of Love'],
  [-12805, 0, [6, 36, 12, 11], 'Eden'], [-12393, 0, [47, 22, 45, 26], 'Rulership'], [-11981, 0, [64, 63, 35, 5], 'Consciousness'],
  [-11569, 0, [40, 37, 16, 9], 'Planning'], [-11157, 0, [59, 55, 20, 34], 'the Sleeping Phoenix'], [-10745, 0, [29, 30, 8, 14], 'Contagion'],
  [-10333, 0, [4, 49, 23, 43], 'Explanation'], [-9921, 1, [7, 13, 2, 1], 'the Sphinx'], [-9509, 0, [33, 19, 24, 44], 'the Four Ways'],
  [-9097, 0, [31, 41, 27, 28], 'the Unexpected'], [-8685, 0, [56, 60, 3, 50], 'Laws'], [-8273, 0, [62, 61, 42, 32], 'Maya'],
  [-7861, 0, [53, 54, 51, 57], 'Penetration'], [-7449, 0, [39, 38, 21, 48], 'Tension'], [-7037, 0, [52, 58, 17, 18], 'Service'],
  [-6625, 1, [15, 10, 25, 46], 'the Vessel of Love'], [-6213, 0, [12, 11, 36, 6], 'Eden'], [-5801, 0, [45, 26, 22, 47], 'Rulership'],
  [-5389, 0, [35, 5, 63, 64], 'Consciousness'], [-4977, 0, [16, 9, 37, 40], 'Planning'], [-4565, 0, [20, 34, 55, 59], 'the Sleeping Phoenix'],
  [-4153, 0, [8, 14, 30, 29], 'Contagion'], [-3741, 0, [23, 43, 49, 4], 'Explanation'], [-3329, 1, [2, 1, 13, 7], 'the Sphinx'],
  [-2927, 0, [24, 44, 19, 33], 'the Four Ways'], [-2505, 0, [27, 28, 41, 31], 'the Unexpected'], [-2093, 0, [3, 50, 60, 56], 'Laws'],
  [-1681, 0, [42, 32, 61, 62], 'Maya'], [-1269, 0, [51, 57, 54, 53], 'Penetration'], [-857, 0, [21, 48, 38, 39], 'Tension'],
  [-445, 0, [17, 18, 58, 52], 'Service'], [-33, 1, [25, 46, 10, 15], 'the Vessel of Love'], [379, 0, [36, 6, 11, 12], 'Eden'],
  [791, 0, [22, 47, 26, 45], 'Rulership'], [1203, 0, [63, 64, 5, 35], 'Consciousness'], [1615, 0, [37, 40, 9, 16], 'Planning'],
  [2027, 0, [55, 59, 34, 20], 'the Sleeping Phoenix'], [2439, 0, [30, 29, 14, 8], 'Contagion'], [2851, 0, [49, 4, 43, 23], 'Explanation'],
  [3263, 1, [13, 7, 1, 2], 'the Sphinx'],
];
const EPOCH_HD_TYPO_YEAR = -2927;
const EPOCH_HD_TYPO_FIX = -2917;
// The 16 Right Angle Cross names, each covering its four gates (whichever is the Sun).
const EPOCH_HD_CROSS_NAMES = {};
const EPOCH_HD_LOCK_GATES = new Set();
EPOCH_HD_PUBLISHED.forEach(([, lock, gates, name]) => gates.forEach((gate) => {
  EPOCH_HD_CROSS_NAMES[gate] = name;
  if (lock) EPOCH_HD_LOCK_GATES.add(gate);
}));
const epochHdCrossName = (gate) => `Cross of ${EPOCH_HD_CROSS_NAMES[gate] || '?'}`;

const epochHd = { time: null };
let epochHdSlider = null;

// ── Precession ───────────────────────────────────────────────────────────
// The ayanamsa (degrees) at `ut`: a Catmull-Rom cubic through EPOCH_PRECESSION's
// samples (every 25 years; ΔT, under two weeks even at 17,000 BC, is ignored).
// The cubic misses the anchor by about a thousandth of an arcsecond (minutes of time);
// a constant shift (epochAyanamsaFix) puts the 37 → 55 crossing exactly on it.
let epochAyanamsaFix = null;
function epochAyanamsa(ut) {
  if (epochAyanamsaFix == null) { epochAyanamsaFix = 0; epochAyanamsaFix = 24.25 - epochAyanamsa(EPOCH_HD_ANCHOR); }
  return epochAyanamsaRaw(ut) + epochAyanamsaFix;
}
function epochAyanamsaRaw(ut) {
  const { start, step, values } = EPOCH_PRECESSION;
  const position = (epochYearOf(ut) - start) / step;
  const index = Math.max(1, Math.min(values.length - 3, Math.floor(position)));
  const u = Math.max(0, Math.min(1, position - index)), u2 = u * u, u3 = u2 * u;
  const [p0, p1, p2, p3] = values.slice(index - 1, index + 3);
  return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (3 * p1 - p0 - 3 * p2 + p3) * u3);
}
// The precession table's own span, as days from J2000.
function epochPrecessionSpan() {
  const { start, step, values } = EPOCH_PRECESSION;
  return [(start + step - 2000) * EPOCH_YEAR_DAYS, (start + step * (values.length - 2) - 2000) * EPOCH_YEAR_DAYS];
}
// When the ayanamsa reaches `value` (it only grows).
function epochAyanamsaTime(value) {
  let [lo, hi] = epochPrecessionSpan();
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (epochAyanamsa(mid) < value) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const epochGridFloor = ([offset, step], value) => offset + step * Math.floor((value - offset) / step + 1e-9);
function epochHdInit() {
  if (EPOCH_HD_MIN != null) return;
  const [start, end] = epochPrecessionSpan();
  const first = epochGridFloor(EPOCH_HD_GATE_GRID, epochAyanamsa(start)) + EPOCH_HD_GATE_GRID[1];
  const last = epochGridFloor(EPOCH_HD_GATE_GRID, epochAyanamsa(end));
  EPOCH_HD_MIN = epochAyanamsaTime(first);
  EPOCH_HD_MAX = epochAyanamsaTime(last) - 1;
}

// The global cross at `ut`.
function epochHdState(ut) {
  const ayanamsa = epochAyanamsa(ut);
  const equinox = epochWrap360(360 - ayanamsa);
  const design = epochWrap360(equinox - EPOCH_HD_DESIGN_ARC);
  const at = (longitude) => ({ longitude, ...computeGateLineColorToneBase(longitude) });
  const sides = { personalitySun: at(equinox), personalityEarth: at(epochWrap360(equinox + 180)), designSun: at(design), designEarth: at(epochWrap360(design + 180)) };
  const profile = `${sides.personalitySun.line}/${sides.designSun.line}`;
  return { ut, ayanamsa, equinox, ...sides, profile, angle: EPOCH_HD_RIGHT.has(profile) ? 'Right angle' : profile === '4/1' ? 'Juxtaposition' : 'Left angle' };
}
// The span [from, to] (as ayanamsa values) of the gate, line or sub-epoch around `ayanamsa`.
function epochHdSpan(kind, ayanamsa) {
  if (kind === 'gate') { const from = epochGridFloor(EPOCH_HD_GATE_GRID, ayanamsa); return [from, from + EPOCH_HD_GATE_GRID[1]]; }
  if (kind === 'line') { const from = epochGridFloor(EPOCH_HD_LINE_GRID, ayanamsa); return [from, from + EPOCH_HD_LINE_GRID[1]]; }
  const line = epochGridFloor(EPOCH_HD_LINE_GRID, ayanamsa), design = epochGridFloor(EPOCH_HD_DESIGN_GRID, ayanamsa);
  return [Math.max(line, design), Math.min(line, design) + EPOCH_HD_LINE_GRID[1]];
}
// Every epoch (gate) in range, oldest first: { from, to (ut), sun gate, n (gates before the 37 → 55 one, negative after) }.
let epochHdEpochList = null;
function epochHdEpochs() {
  if (epochHdEpochList) return epochHdEpochList;
  const first = epochGridFloor(EPOCH_HD_GATE_GRID, epochAyanamsa(EPOCH_HD_MIN + 1));
  const last = epochAyanamsa(EPOCH_HD_MAX);
  const list = [];
  for (let value = first; value < last - 1e-9; value += EPOCH_HD_GATE_GRID[1]) {
    const state = epochHdState(epochAyanamsaTime(value + 0.01));
    list.push({ fromValue: value, from: epochAyanamsaTime(value), to: epochAyanamsaTime(value + EPOCH_HD_GATE_GRID[1]), gate: state.personalitySun.gate, n: Math.round((24.25 - value) / EPOCH_HD_GATE_GRID[1]) });
  }
  return (epochHdEpochList = list);
}
// The 12 sub-epochs of an epoch, oldest first.
function epochHdSubEpochs(epoch) {
  const bounds = new Set();
  for (let k = 0; k <= 6; k += 1) {
    bounds.add(+(epoch.fromValue + k * EPOCH_HD_LINE_GRID[1]).toFixed(6));
    const design = EPOCH_HD_DESIGN_GRID[1] * Math.ceil((epoch.fromValue + k * EPOCH_HD_LINE_GRID[1]) / EPOCH_HD_DESIGN_GRID[1]);
    if (design < epoch.fromValue + EPOCH_HD_GATE_GRID[1] - 1e-9) bounds.add(+design.toFixed(6));
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((value, index) => {
    const from = epochAyanamsaTime(value), to = epochAyanamsaTime(sorted[index + 1]);
    return { from, to, state: epochHdState((from + to) / 2) };
  });
}
// Human Design's published row for an epoch, if the table covers it.
function epochHdPublished(epoch) {
  const row = EPOCH_HD_PUBLISHED.find(([year]) => year === 2027 - 412 * epoch.n || (year === EPOCH_HD_TYPO_YEAR && 2027 - 412 * epoch.n === EPOCH_HD_TYPO_FIX));
  return row ? { year: row[0], printed: row[0] <= 0 ? `${-row[0]} BC` : `${row[0]} AD`, lock: Boolean(row[1]), gates: row[2], name: row[3], value: row[0] === EPOCH_HD_TYPO_YEAR ? EPOCH_HD_TYPO_FIX : row[0] } : null;
}

// ── Tooltips: gates and lines ────────────────────────────────────────────
function epochHdGateTipHtml(element) {
  const gate = Number(element.dataset.epochGate), line = Number(element.dataset.epochLine || 0);
  const center = HD_CENTERS.find((item) => item.id === HD_GATE_CENTER[gate])?.name;
  const key = GENE_KEYS[gate];
  const channels = HD_CHANNELS.filter((pair) => pair.includes(gate)).map((pair) => { const info = hdChannelInfo(pair); return `${info.gates} ${info.name}`; });
  const row = (title, text) => `<div class="gk-tip-title">${title}</div><div class="gk-tip-text">${text}</div>`;
  return `<div class="gk-tip-title">Gate ${gate}${line ? `.${line}` : ''} · ${center} center</div>
    ${line ? row(`Line ${line}`, escapeHtml(HD_LINE_MEANINGS[line - 1])) : ''}
    ${row('Incarnation cross', `${epochHdCrossName(gate)}${EPOCH_HD_LOCK_GATES.has(gate) ? ' (a Lock)' : ''} — one of its four gates`)}
    ${channels.length ? row('Channels', channels.join(' · ')) : ''}
    ${key ? row(`Gene Key ${gate}`, `${key.shadow} → ${key.gift} → ${key.siddhi}`) : ''}`;
}
bindHoverTooltips('[data-epoch-gate]', epochHdGateTipHtml, 'epochGateTooltip');
const epochHdGateText = (side, withLine = true) => `<span class="epoch-gate" data-epoch-gate="${side.gate}"${withLine ? ` data-epoch-line="${side.line}"` : ''} tabindex="0">${side.gate}${withLine ? `.${side.line}` : ''}</span>`;

// ── Mandala ──────────────────────────────────────────────────────────────
// The app's mandala, with only the four gates of the global cross lit (Personality in
// ink, Design in the accent color, as everywhere), pointers to the equinox's exact
// place and the Design Sun's, and the gates in the bodygraph at its center.
function epochMandalaAngle(longitude) {
  const gate55Angle = MANDALA_GATE25_ANGLE - MANDALA_GATE_ORDER.indexOf(55) * MANDALA_GATE_STEP;
  return gate55Angle - epochWrap360(longitude - HD_GATE55_START);
}
function epochHdMandalaMarkup(state) {
  const sides = [['personality', state.personalitySun, '☉'], ['personality', state.personalityEarth, '⊕'], ['design', state.designSun, '☉'], ['design', state.designEarth, '⊕']];
  const glyphMap = new Map();
  const gateSides = {};
  sides.forEach(([side, influence, glyph]) => {
    if (!glyphMap.has(influence.gate)) glyphMap.set(influence.gate, { personality: [], design: [] });
    glyphMap.get(influence.gate)[side].push(glyph);
    gateSides[influence.gate] = gateSides[influence.gate] && gateSides[influence.gate] !== side ? 'both' : side;
  });
  const active = (gate) => Boolean(gateSides[gate]);
  const defined = new Set();
  HD_CHANNELS.forEach(([a, b]) => { if (active(a) && active(b)) { defined.add(HD_GATE_CENTER[a]); defined.add(HD_GATE_CENTER[b]); } });
  const bodygraph = { hd: null, filter: 'Incarnation Cross', gateSide: (gate) => gateSides[gate] || null, centerDefined: (id) => defined.has(id) };
  const pointer = (longitude, className, label) => {
    const angle = epochMandalaAngle(longitude);
    const inner = mandalaPolar(132, angle), outer = mandalaPolar(276, angle), text = mandalaPolar(300, angle);
    return `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" class="epoch-pointer ${className}"/>${label ? `<text x="${text.x}" y="${text.y}" class="epoch-pointer-label ${className}" text-anchor="middle" dominant-baseline="middle">${label}</text>` : ''}`;
  };
  const pointers = `<g class="epoch-pointers">${pointer(state.equinox, 'personality', '♈︎')}${pointer(state.personalityEarth.longitude, 'personality', '')}${pointer(state.designSun.longitude, 'design', '')}${pointer(state.designEarth.longitude, 'design', '')}</g>`;
  return hdMandalaSvgMarkup(bodygraph, glyphMap).replace(/<\/svg>\s*<\/svg>\s*$/, `</svg>${pointers}</svg>`);
}

// ── Panels ───────────────────────────────────────────────────────────────
function epochHdSummaryMarkup(state) {
  const epoch = epochHdEpochs().find((item) => item.from <= state.ut && state.ut < item.to);
  const sub = epochHdSpan('sub', state.ayanamsa).map(epochAyanamsaTime);
  const published = epoch && epochHdPublished(epoch);
  const years = (from, to) => `${((to - from) / EPOCH_YEAR_DAYS).toFixed(0)} years`;
  const stat = (label, value) => `<div class="system-stat"><span>${label}</span><strong>${value}</strong></div>`;
  const signText = (longitude) => epochPositionText(longitude);
  return `
    <span class="eyebrow">GLOBAL CROSS</span>
    <h3 class="epoch-cross-name">${epochHdCrossName(state.personalitySun.gate)}${EPOCH_HD_LOCK_GATES.has(state.personalitySun.gate) ? ' <small>Lock</small>' : ''}</h3>
    <p class="epoch-cross-gates">${epochHdGateText(state.personalitySun)} / ${epochHdGateText(state.personalityEarth)} | ${epochHdGateText(state.designSun)} / ${epochHdGateText(state.designEarth)}</p>
    ${epoch ? stat('EPOCH', `${epochDateText(epoch.from, { time: false, calendar: true })} – ${epochDateText(epoch.to, { time: false, calendar: true })}`) + stat('LASTS', years(epoch.from, epoch.to)) : ''}
    ${published ? stat('HD PUBLISHED START', `${published.printed}${published.year === EPOCH_HD_TYPO_YEAR ? ' (2917 BC by its own pattern)' : ''}`) : ''}
    <span class="eyebrow epoch-panel-section">LINE</span>
    ${stat('PROFILE', `${state.profile} · ${state.angle}`)}
    ${stat('FROM', epochDateText(sub[0], { calendar: true }))}
    ${stat('TO', epochDateText(sub[1], { calendar: true }))}
    ${stat('LASTS', years(sub[0], sub[1]))}
    <span class="eyebrow epoch-panel-section">POSITIONS</span>
    ${stat('EQUINOX (PERSONALITY SUN)', signText(state.equinox))}
    ${stat('DESIGN SUN (−88°)', signText(state.designSun.longitude))}
    ${stat('AYANAMSA', `${state.ayanamsa.toFixed(4)}°`)}
    <p class="system-note">Positions are on the star-fixed mandala: the gates as they lie among the stars, which the equinox crosses backwards. Hover a gate for its center, channels, cross and Gene Key.</p>`;
}
// The epochs, newest first, each as two rows in time order reversed: its Right angle
// part (profiles 4/6 to 1/3, ~260 years, with the Right Angle Cross's four gates) and,
// before it, its Juxtaposition and Left angle part (6/3 to 4/1, ~140 years, where the
// equinox enters the gate: the Design gates are still the neighbouring ones). Hovering a
// row lists its lines (EPOCH_HD_ROW_TIP).
function epochHdEpochParts(epoch) {
  const subs = epochHdSubEpochs(epoch);
  const part = (list, label) => ({ epoch, label, subs: list, from: list[0].from, to: list[list.length - 1].to, state: list[0].state });
  const right = subs.filter((sub) => sub.state.angle === 'Right angle');
  const other = subs.filter((sub) => sub.state.angle !== 'Right angle');
  return [part(right, 'Right angle'), part(other, 'Juxtaposition · Left angle')];
}
function epochHdEpochTableMarkup() {
  const epochs = epochHdEpochs();
  const rows = [...epochs].reverse().flatMap((epoch) => {
    const index = epochs.indexOf(epoch);
    const published = epochHdPublished(epoch);
    return epochHdEpochParts(epoch).map((part, partIndex) => {
      const s = part.state;
      const gates = `${epochHdGateText(s.personalitySun, false)} / ${epochHdGateText(s.personalityEarth, false)} | ${epochHdGateText(s.designSun, false)} / ${epochHdGateText(s.designEarth, false)}`;
      const name = `${epochHdCrossName(epoch.gate)}${EPOCH_HD_LOCK_GATES.has(epoch.gate) ? ' <small class="epoch-lock-tag">Lock</small>' : ''}<small>${part.label}</small>`;
      return `<tr class="${partIndex === 0 ? 'epoch-hd-right' : 'epoch-hd-other'}" data-epoch-hd-row="${index}:${partIndex}" data-from="${part.from}" data-to="${part.to}" tabindex="0"><td>${name}</td><td class="epoch-hd-gates">${gates}</td><td>${epochDateText(part.from, { time: false, calendar: true })}</td><td>${epochDateText(part.to, { time: false, calendar: true })}</td><td>${((part.to - part.from) / EPOCH_YEAR_DAYS).toFixed(0)} y</td><td>${partIndex === 1 && published ? `${published.printed}${published.year === EPOCH_HD_TYPO_YEAR ? ' *' : ''}` : ''}</td><td><button type="button" class="epoch-set-button" data-epoch-hd-go="${part.from + 1 / 1440}" style="--thumb:var(--accent)">Go</button></td></tr>`;
    });
  }).join('');
  return `<div class="epoch-panel epoch-hd-table-panel"><table class="epoch-table epoch-hd-table">
    <thead><tr><th>Cross</th><th>Gates (P ☉ / ⊕ | D ☉ / ⊕)</th><th>Starts</th><th>Ends</th><th>Lasts</th><th>HD published start</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="system-note">Newest first. Each cross takes two rows: the equinox enters a gate in its Juxtaposition and Left angle profiles (6/3 to 4/1), whose Design gates are still the neighbouring ones, then moves into its Right angle profiles (4/6 to 1/3). Hover a row for its lines. * printed as 2927 BC; 2917 BC by the table's own pattern.</p></div>`;
}
function epochHdRowTipHtml(row) {
  const [index, partIndex] = row.dataset.epochHdRow.split(':').map(Number);
  const part = epochHdEpochParts(epochHdEpochs()[index])[partIndex];
  const lines = [...part.subs].reverse().map((sub) => {
    const s = sub.state;
    return `<tr><td>${s.profile}</td><td>${s.personalitySun.gate}.${s.personalitySun.line} | ${s.designSun.gate}.${s.designSun.line}</td><td>${epochShortDate(sub.from)} – ${epochShortDate(sub.to)}</td><td>${((sub.to - sub.from) / EPOCH_YEAR_DAYS).toFixed(0)} y</td></tr>`;
  }).join('');
  return `<div class="gk-tip-title">${epochHdCrossName(part.epoch.gate)} · ${part.label}</div>
    <table class="epoch-tip-table"><thead><tr><th>Profile</th><th>P ☉ | D ☉</th><th>Dates</th><th></th></tr></thead><tbody>${lines}</tbody></table>`;
}
bindHoverTooltips('[data-epoch-hd-row]', epochHdRowTipHtml, 'epochHdRowTooltip');
// The appendix: method, sources, and every published date against the computed one.
function epochHdNotesMarkup() {
  const epochs = epochHdEpochs();
  const rows = EPOCH_HD_PUBLISHED.map(([year, lock, gates, name]) => {
    const epoch = epochs.find((item) => item.gate === gates[0] && Math.abs(item.n - (2027 - (year === EPOCH_HD_TYPO_YEAR ? EPOCH_HD_TYPO_FIX : year)) / 412) < 0.5);
    if (!epoch) return '';
    const hd = year === EPOCH_HD_TYPO_YEAR ? EPOCH_HD_TYPO_FIX : year;
    const astro = epochYearOf(epoch.from);
    const difference = hd - astro;
    const interval = astro - epochYearOf(EPOCH_HD_ANCHOR);
    const printed = `${year <= 0 ? `${-year} BC` : `${year} AD`}${year === EPOCH_HD_TYPO_YEAR ? ' *' : ''}`;
    return `<tr class="${lock ? 'epoch-lock-row' : ''}"><td>Cross of ${name} (${gates[0]})${lock ? ' · Lock' : ''}</td><td>${printed}</td><td>${epochDateText(epoch.from, { time: false, calendar: true })}</td><td>${epoch.n === 0 ? '0' : `${difference >= 0 ? '+' : '−'}${Math.abs(difference).toFixed(0)}`}</td><td>${epoch.n === 0 ? '—' : `${((difference / interval) * 100).toFixed(2)}%`}</td><td>${((epoch.to - epoch.from) / EPOCH_YEAR_DAYS).toFixed(0)}</td></tr>`;
  }).join('');
  return `<details class="cycle-life epoch-notes"><summary><strong>Astronomy notes</strong><small>Human Design's published dates against the computed ones, method and sources</small></summary><div class="epoch-notes-body">
    <p><strong>What moves.</strong> Earth's axis wobbles like a spinning top, circling once in about 25,800 years, because the Sun and Moon pull on Earth's equatorial bulge (the planets add a little by slowly tilting Earth's orbit). The equinox — where the equator crosses the ecliptic — slides backwards along the stars with it, about 50.3″ a year today: one degree in ~72 years, one line in ~67, one gate in ~403. In the tropical zodiac used for charts the equinox is 0° Aries by definition and never moves; these cycles measure it against the stars instead.</p>
    <p><strong>How it's computed.</strong> The drift comes from the IAU's long-term precession model (Vondrák, Capitaine & Wallace 2011, <a href="https://doi.org/10.1051/0004-6361/201117274" target="_blank" rel="noopener">A&amp;A 534, A22</a>), valid for ±200,000 years, as implemented by <a href="https://github.com/liberfa/erfa" target="_blank" rel="noopener">ERFA</a>, the open-source edition of the IAU's <a href="https://www.iausofa.org" target="_blank" rel="noopener">SOFA</a> library. The equinox is measured against a fixed direction among the stars (the star Spica, as in the Lahiri ayanamsa), on the mean ecliptic of date. Only one number is a convention: the zero point, set so the equinox crosses from gate 37 into gate 55 at Human Design's own time, <strong>15 February 2027, 22:10 UTC</strong> — 50.45″ (about a year of drift) beyond the Lahiri ayanamsa, which would put the crossing on 17 February 2028. The Design Sun is 88° of arc behind the equinox.</p>
    <p><strong>Is the drift uniform?</strong> Not quite. Over a few centuries it barely changes (50.20″ a year in 1620, 50.29″ today), but over millennia it does: around 7000 BC it was about 48.9″ a year, and a gate took ~414 years, against ~403 today. That's mostly because the planets slowly tilt Earth's orbit and Earth's own tilt changes, on cycles of tens of thousands of years. An older model (Laskar 1986) gives the same rates. The 18.6-year nodding of the axis (nutation, ±17″) cancels out over time and is left out; it would move a single crossing by a few months at most.</p>
    <p><strong>Human Design's dates.</strong> The published table steps back a flat 412 years per gate (2027 − 412, − 824, …): about the real length around 12,000–4,500 BC, but 2–3% longer than today's. So it puts every earlier transition too early and every later one too late, by up to 82 years in the range below. Its 1615 for the start of the Cross of Planning, for instance, comes out as 4 January 1624. HD's BC years count a year 0 (their 33 BC is year −33, historians' 34 BC); the differences below are on the same scale. * The table prints 2927 BC, but its own pattern gives 2917 BC (the rows on either side would otherwise last 402 and 422 years), so the comparison uses 2917.</p>
    <div class="epoch-table-scroll"><table class="epoch-table epoch-compare-table">
      <thead><tr><th>Cross (Personality Sun gate)</th><th>HD start</th><th>Astronomical start</th><th>Δ years (HD − astronomy)</th><th>Δ % of the time to 2027</th><th>Astronomical length (years)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="system-note">Δ % is the difference divided by the time between the astronomical start and February 2027: positive throughout, HD always places the boundary too far from 2027. Times before 1582 are in the Julian calendar; the slow drift makes ΔT (under two weeks even at 17,000 BC) irrelevant here.</p>
    <p><strong>Sources.</strong> Human Design global cycles table: Jovian Archive (Ra Uru Hu). Precession: Vondrák et al. 2011 (above); Capitaine et al. 2003, IAU 2006 precession, <a href="https://doi.org/10.1051/0004-6361:20031539" target="_blank" rel="noopener">A&amp;A 412, 567</a>; Laskar 1986, <a href="https://ui.adsabs.harvard.edu/abs/1986A%26A...157...59L" target="_blank" rel="noopener">A&amp;A 157, 59</a>. Ayanamsa and Lahiri: <a href="https://en.wikipedia.org/wiki/Ayanamsa" target="_blank" rel="noopener">overview</a>; precession: <a href="https://en.wikipedia.org/wiki/Axial_precession" target="_blank" rel="noopener">overview</a>.</p>
  </div></details>`;
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderEpochHumanDesign(surface) {
  epochHdInit();
  if (epochHd.time == null) epochHd.time = epochNow();
  surface.innerHTML = `
    <div class="epoch-hd-layout">
      <div class="system-visual hd-mandala-visual epoch-mandala-panel">
        <div class="system-toolbar"><span class="eyebrow">MANDALA / THE EQUINOX AMONG THE GATES</span></div>
        <div data-epoch-mandala></div>
        <div class="epoch-hd-moment">
          <div class="epoch-steppers epoch-hd-steps">
            <div class="epoch-stepper"><span>Line</span><button type="button" data-epoch-hd-step="event:-1" title="Previous line: the profile changes whenever the Personality or the Design line does, alternately after ~9 and ~58 years (,)" aria-label="Previous line">◀</button><button type="button" data-epoch-hd-step="event:1" title="Next line (.)" aria-label="Next line">▶</button></div>
            <div class="epoch-stepper"><span>Gate</span><button type="button" data-epoch-hd-step="gate:-1" title="Previous gate: the epoch, ~400 years ([)" aria-label="Previous gate">◀</button><button type="button" data-epoch-hd-step="gate:1" title="Next gate (])" aria-label="Next gate">▶</button></div>
          </div>
        </div>
        <div data-epoch-hd-slider>${epochSliderMarkup('DATE')}</div>
      </div>
      <aside class="system-info epoch-hd-summary" data-epoch-hd-summary></aside>
    </div>
    <h3 class="epoch-heading">Epochs, ${epochYearLabel(epochCalendar(EPOCH_HD_MAX).year)} back to ${epochYearLabel(epochCalendar(EPOCH_HD_MIN).year)}</h3>
    <div data-epoch-hd-table></div>
    ${epochHdNotesMarkup()}`;
  const mandala = surface.querySelector('[data-epoch-mandala]');
  const summary = surface.querySelector('[data-epoch-hd-summary]');
  const table = surface.querySelector('[data-epoch-hd-table]');
  let shownSub = null, markedEpoch = null;
  table.innerHTML = epochHdEpochTableMarkup();
  const draw = () => {
    const state = epochHdState(epochHd.time);
    // The mandala follows every move; the panel and the table's highlight change with the line.
    const sub = epochHdSpan('sub', state.ayanamsa)[0];
    mandala.innerHTML = epochHdMandalaMarkup(state);
    mandala.querySelectorAll('.mandala-gate').forEach((node) => { node.dataset.epochGate = node.textContent; node.setAttribute('tabindex', '0'); });
    // The signs explain themselves on hover, as on every astrology wheel (zodiacSignTooltipHtml).
    mandala.querySelectorAll('.mandala-zodiac').forEach((node, index) => { node.dataset.zodiacSign = index; });
    if (sub !== shownSub) {
      shownSub = sub;
      summary.innerHTML = epochHdSummaryMarkup(state);
      // The slider marks the current epoch's lines: redrawn when the epoch changes.
      const epoch = epochHdSpan('gate', state.ayanamsa)[0];
      if (epoch !== markedEpoch) { markedEpoch = epoch; epochHdSlider?.refresh(); }
      table.querySelectorAll('tr[data-from]').forEach((row) => row.classList.toggle('selected', Number(row.dataset.from) <= epochHd.time && epochHd.time < Number(row.dataset.to)));
    }
  };
  const setTime = (ut) => {
    epochHd.time = Math.max(EPOCH_HD_MIN, Math.min(EPOCH_HD_MAX, ut));
    draw();
  };
  // The app's timeline slider, marking every gate boundary (and, within the current
  // epoch, every line boundary); clicking a mark goes there.
  epochHdSlider = epochBindSlider(surface.querySelector('[data-epoch-hd-slider]'), {
    range: [EPOCH_HD_MIN, EPOCH_HD_MAX], initialYears: 800,
    get: () => epochHd.time,
    set: setTime,
    markers: epochHdSliderMarks,
  });
  const jumpTo = (ut) => { setTime(ut); epochHdSlider.moveTo(epochHd.time); };
  // Previous / next line (sub-epoch: the Personality or the Design line changes) or gate:
  // to the start of the next one, or back to
  // the start of the current one (if more than a day in), else of the previous one.
  const step = (kind, direction) => {
    const ayanamsa = epochAyanamsa(epochHd.time);
    const span = kind === 'event' ? 'sub' : 'gate';
    const [from, to] = epochHdSpan(span, ayanamsa);
    let target;
    if (direction > 0) target = epochAyanamsaTime(to);
    else {
      const start = epochAyanamsaTime(from);
      target = epochHd.time - start > 1 ? start : epochAyanamsaTime(epochHdSpan(span, from - 1e-6)[0]);
    }
    // Land just inside the new span, so it reads as that span.
    jumpTo(target + 1 / 1440);
    return true;
  };
  // , . step by line; [ ] by gate.
  epochKeyHandler = (action, direction) => {
    if (action === 'event') return step('event', direction);
    if (action === 'phase') return step('gate', direction);
    if (action === 'now') { jumpTo(epochNow()); return true; }
    return false;
  };
  surface.addEventListener('click', (event) => {
    const go = event.target.closest('[data-epoch-hd-go]');
    if (go) return jumpTo(Number(go.dataset.epochHdGo));
    const stepButton = event.target.closest('[data-epoch-hd-step]');
    if (stepButton) {
      const [kind, direction] = stepButton.dataset.epochHdStep.split(':');
      step(kind, Number(direction));
    }
  });
  draw();
}

// The slider's marks: every gate boundary (the equinox entering the next gate), and the
// line boundaries of the epoch the moment is in.
function epochHdSliderMarks() {
  const epochs = epochHdEpochs();
  const marks = epochs.slice(1).map((epoch, index) => ({
    from: epoch.from, color: 'var(--ink)',
    label: `Gate ${epochs[index].gate} → ${epoch.gate} · ${epochHdCrossName(epoch.gate)} · ${epochDateText(epoch.from, { time: false, calendar: true })}`,
  }));
  const current = epochs.find((epoch) => epoch.from <= epochHd.time && epochHd.time < epoch.to);
  if (current) epochHdSubEpochs(current).slice(1).forEach((sub) => marks.push({
    from: sub.from, color: 'var(--accent)',
    label: `${sub.state.profile} · ${sub.state.personalitySun.gate}.${sub.state.personalitySun.line} | ${sub.state.designSun.gate}.${sub.state.designSun.line} · ${epochDateText(sub.from, { time: false, calendar: true })}`,
  }));
  return marks;
}
