// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const CYCLE_DEFINITIONS = [
  {key: 'saturn-return', label: t('Saturn Return'), planet: 'Saturn', periodYears: 29.457, kind: 'return', description: t('Saturn completes its natal orbit and meets itself again — a marker of maturity and structural reckoning.')},
  {key: 'jupiter-return', label: t('Jupiter Return'), planet: 'Jupiter', periodYears: 11.862, kind: 'return', description: t('Jupiter returns to its natal degree roughly every 12 years, opening a fresh cycle of growth and opportunity.')},
  {key: 'chiron-return', label: t('Chiron Return'), planet: 'Chiron', periodYears: 50.0, kind: 'return', description: t('Chiron completes its long, eccentric orbit — often felt as a reckoning with the wound and the healer archetype.')},
  {key: 'uranus-opposition', label: t('Uranus Opposition'), planet: 'Uranus', periodYears: 84.011, kind: 'opposition', description: t('Transiting Uranus opposes its natal position at the orbital midpoint — the archetypal "midlife" awakening.')},
  {key: 'uranus-return', label: t('Uranus Return'), planet: 'Uranus', periodYears: 84.011, kind: 'return', description: t('Uranus completes a full orbit and returns to its natal degree.')},
  {key: 'nodal-return', label: t('Nodal Return'), planet: 'North Node', periodYears: 18.6, kind: 'return', description: t('The lunar nodes complete their cycle and return to their natal axis roughly every 18.6 years.')}
];
let cycleChartId = null;
let activeCycleKey = 'saturn-return';
let activeOccurrenceIndex = 0;
// A life event (or birth) chosen from the Life Timeline replaces the cycle occurrence as
// the moment studied: null, { birth: true }, { eventId, part: "start" | "end" }, or the
// sky at a moment against the chart, { now: true, time } (cycle-moment.js).
let cycleEventAnchor = null;
// Which Life Timeline entries show: life events, cycles, or both.
const cycleLifeShow = { events: true, cycles: true };
// The Life Timeline's order by date, "asc" or "desc" (remembered in this browser).
let cycleLifeSort = acgStoredSetting('orbital-study-life-timeline-sort', 'asc') === 'desc' ? 'desc' : 'asc';
// Which system tab the Cycle Explorer shows, and the Human Design / Gene Keys views' own state.
let cycleActiveSystem = 'Summary';
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
// Fastest apparent motion either way, in °/day, rounded well up: Jupiter ≈ 0.25, Saturn
// ≈ 0.13, Chiron ≈ 0.15, Uranus ≈ 0.06; the true node's wobble reaches about 0.3.
const CYCLE_MAX_SPEED = { Jupiter: 0.4, Saturn: 0.25, Chiron: 0.3, Uranus: 0.12, 'North Node': 1.5 };
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
  // Far from the target degree the search leaps ahead: the planet can't get there sooner
  // than its top speed allows (CYCLE_MAX_SPEED, °/day, with room to spare), so no crossing
  // is skipped — the same crossings are found, with a fraction of the samples.
  const topSpeed = CYCLE_MAX_SPEED[cycleDef.planet] || 2;
  const crossings = [];
  let previousTime = start, previousGap = gap(start);
  for (let time = start + step; time <= end; time += step) {
    const reach = (Math.abs(previousGap) / topSpeed) * CYCLE_DAY_MINUTES - step;
    if (reach > step) time = Math.min(previousTime + reach, end);
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
  if (!charts.length) { surface.innerHTML = `<p class="intro-copy">${t('Add a chart to the library before exploring its cycles.')}</p>`; return; }
  if (!cycleChartId || !charts.some(chart => chart.id === cycleChartId)) cycleChartId = selectedChartId && charts.some(chart => chart.id === selectedChartId) ? selectedChartId : charts[0].id;
  const chart = chartById(cycleChartId);
  const select = document.getElementById('cycleChartSelect');
  if (select) {
    select.innerHTML = charts.map(item => `<option value="${item.id}" ${item.id === cycleChartId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    select.onchange = () => { cycleChartId = select.value; activeOccurrenceIndex = 0; cycleEventAnchor = cycleEventAnchor?.now ? { now: true, time: Date.now() } : null; renderCycleExplorer(); };
  }
  const tabs = document.getElementById('cycleTypeTabs');
  if (tabs) {
    tabs.innerHTML = CYCLE_DEFINITIONS.map(def => `<button type="button" class="${def.key === activeCycleKey ? 'active' : ''}" data-cycle-key="${def.key}">${def.label}</button>`).join('');
    tabs.querySelectorAll('[data-cycle-key]').forEach(button => button.addEventListener('click', () => { activeCycleKey = button.dataset.cycleKey; activeOccurrenceIndex = 0; cycleEventAnchor = null; renderCycleExplorer(); }));
  }
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  const occurrences = computeCycleOccurrences(chart, cycleDef);
  const occurrenceRow = document.getElementById('cycleOccurrenceRow');
  if (!occurrences.length) {
    if (occurrenceRow) occurrenceRow.innerHTML = `<p class="intro-copy">${t('No {cycle} happens before age {age} for this chart.', { cycle: cycleDef.label, age: CYCLE_MAX_AGE_YEARS })}</p>`;
    renderCycleCelestialSummary();
    if (signature) signature.innerHTML = '';
    return;
  }
  if (activeOccurrenceIndex >= occurrences.length) activeOccurrenceIndex = defaultOccurrenceIndex(occurrences);
  if (occurrenceRow) {
    occurrenceRow.innerHTML = occurrences.map((occurrence, index) => `<button type="button" class="cycle-chip ${index === activeOccurrenceIndex && !cycleEventAnchor ? 'active' : ''} ${occurrence.date.getTime() < Date.now() ? 'past' : 'future'}" data-occurrence-index="${index}">${occurrence.date.getFullYear()} <small>${t('age {age}', { age: Math.round(occurrence.ageYears) })}</small></button>`).join('');
    occurrenceRow.querySelectorAll('[data-occurrence-index]').forEach(button => button.addEventListener('click', () => {
      activeOccurrenceIndex = Number(button.dataset.occurrenceIndex);
      cycleEventAnchor = null;
      occurrenceRow.querySelectorAll('.cycle-chip').forEach((chip, index) => chip.classList.toggle('active', index === activeOccurrenceIndex));
      refreshCycleMoment();
    }));
  }
  renderCycleCelestialSummary();
  renderCycleLifeTimeline();
  renderCycleSignature();
  renderCycleSystemView();
}
// The Celestial Cycles header (shown while it's collapsed too): the cycle, and which of
// its occurrences is studied, if one is.
function renderCycleCelestialSummary() {
  const summary = document.querySelector('[data-cycle-celestial-summary]');
  const chart = chartById(cycleChartId);
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  if (!summary || !chart || !cycleDef) return;
  const occurrences = computeCycleOccurrences(chart, cycleDef);
  const occurrence = !cycleEventAnchor && occurrences[activeOccurrenceIndex];
  summary.textContent = occurrence
    ? `${cycleDef.label} · ${occurrence.date.getFullYear()} · ${t('age {age}', { age: occurrence.ageYears.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}`
    : `${cycleDef.label} · ${tn(occurrences.length, '{n} moment', '{n} moments')}`;
}
// After the studied moment changes: the timeline's highlight, the heading and the view.
function refreshCycleMoment() {
  document.querySelectorAll('#cycleOccurrenceRow .cycle-chip').forEach((chip, index) => chip.classList.toggle('active', !cycleEventAnchor && index === activeOccurrenceIndex));
  renderCycleCelestialSummary();
  renderCycleLifeTimeline();
  renderCycleSignature();
  renderCycleSystemView();
}

// ── Life Timeline ───────────────────────────────────────────────────────
// Birth, the chart's dated life events and every cycle occurrence by date (either way,
// cycleLifeSort), with a "Today" line where past meets future, each with Go to (a period: Go to start / Go to end) to study that moment.
function renderCycleLifeTimeline() {
  const box = document.getElementById('cycleLifeTimeline');
  const chart = chartById(cycleChartId);
  if (!box || !chart) return;
  const all = lifeTimelineEntries(chart);
  const entries = all.filter(entry => entry.type === 'birth' || (entry.type === 'event' ? cycleLifeShow.events : cycleLifeShow.cycles));
  if (cycleLifeSort === 'desc') entries.reverse();
  const sort = box.querySelector('[data-cycle-life-sort]');
  sort.textContent = `${t('Date')} ${cycleLifeSort === 'asc' ? '↑' : '↓'}`;
  sort.setAttribute('aria-label', cycleLifeSort === 'asc' ? t('Sorted by date, oldest first; switch') : t('Sorted by date, newest first; switch'));
  const events = all.filter(entry => entry.type === 'event').length;
  box.querySelector('[data-cycle-life-count]').textContent = `${tn(events, '{n} life event', '{n} life events')} · ${tn(all.length - events - 1, '{n} cycle moment', '{n} cycle moments')}`;
  box.querySelector('[data-cycle-life-filters]').innerHTML = [['events', t('Life events')], ['cycles', t('Cycles')]].map(([key, label]) =>
    `<label class="acg-filter"><input type="checkbox" data-cycle-life-show="${key}" ${cycleLifeShow[key] ? 'checked' : ''}><span>${label}</span></label>`).join('');
  renderCycleLifeStrip(box.querySelector('[data-cycle-life-strip]'), chart, all.filter(entry => entries.includes(entry)));
  const now = Date.now();
  const age = date => ((date - chartBirthMomentUTC(chart)) / 60000 / CYCLE_YEAR_MINUTES);
  const button = (label, attributes, current) => `<button type="button" class="acg-origin-button${current ? ' current' : ''}" ${attributes} ${current ? 'aria-current="true"' : ''}>${label}</button>`;
  let nowShown = false;
  box.querySelector('[data-cycle-life-list]').innerHTML = entries.map(entry => {
    // "Today" goes before the first future entry (oldest first) or the first past one (newest first).
    const crossed = cycleLifeSort === 'asc' ? entry.date.getTime() > now : entry.date.getTime() <= now;
    const marker = !nowShown && crossed ? (nowShown = true, `<li class="cycle-life-now"><span>${t('Today')}</span></li>`) : '';
    const when = `<span class="cycle-life-date">${formatDate(entry.date.toISOString().slice(0, 10))}</span><small>${t('age {age}', { age: Math.max(0, age(entry.date)).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</small>`;
    // Birth and cycles can be annotated (their place, tags and notes are shown under them).
    const annotate = (annotation, attributes) => `<button type="button" class="acg-origin-button" ${attributes}>${annotation ? t('Edit') : t('Annotate')}</button>`;
    if (entry.type === 'birth') {
      const annotation = lifeFindAnnotation(chart, anchor => anchor.birth);
      return `${marker}<li class="cycle-life-item birth">${when}<span class="cycle-life-title">${t('Birth')}${cycleAnnotationMarkup(annotation, chart)}</span><span class="cycle-life-buttons">${button(t('Go to'), 'data-cycle-go-birth', cycleEventAnchor?.birth)}${annotate(annotation, 'data-cycle-annotate-birth')}</span></li>`;
    }
    if (entry.type === 'cycle') {
      const current = !cycleEventAnchor && entry.cycleDef.key === activeCycleKey && entry.index === activeOccurrenceIndex;
      const annotation = lifeCycleAnnotation(chart, entry.cycleDef.key, entry.index + 1);
      return `${marker}<li class="cycle-life-item cycle${current ? ' current' : ''}${annotation ? ' annotated' : ''}">${when}<span class="cycle-life-title">${entry.cycleDef.label}${cycleAnnotationMarkup(annotation, chart)}</span><span class="cycle-life-buttons">${button(t('Go to'), `data-cycle-go-cycle="${entry.cycleDef.key}" data-cycle-go-index="${entry.index}"`, current)}${annotate(annotation, `data-cycle-annotate="${entry.cycleDef.key}" data-cycle-annotate-n="${entry.index + 1}"`)}</span></li>`;
    }
    const { event } = entry;
    const at = part => cycleEventAnchor?.eventId === event.id && cycleEventAnchor.part === part;
    const period = event.end ? `<small class="cycle-life-period">${lifeWhenLabel(event)}</small>` : '';
    const buttons = event.end
      ? `${button(t('Go to start'), `data-cycle-go-event="${escapeHtml(event.id)}" data-cycle-go-part="start"`, at('start'))}${button(t('Go to end'), `data-cycle-go-event="${escapeHtml(event.id)}" data-cycle-go-part="end"`, at('end'))}`
      : button(t('Go to'), `data-cycle-go-event="${escapeHtml(event.id)}" data-cycle-go-part="start"`, at('start'));
    const id = escapeHtml(event.id), title = escapeHtml(lifeEventTitle(event));
    const manage = `<button type="button" class="acg-origin-button" data-cycle-life-edit="${id}" aria-label="${t('Edit {name}', { name: title })}">${t('Edit')}</button>`;
    return `${marker}<li class="cycle-life-item event${at('start') || at('end') ? ' current' : ''}">${when}<span class="cycle-life-title">${title}${period}</span><span class="cycle-life-buttons">${buttons}${manage}</span></li>`;
  }).join('') + (nowShown ? '' : `<li class="cycle-life-now"><span>${t('Today')}</span></li>`);
}
// The Life Timeline at a glance: a strip from birth to a little past today (or the
// last event), by age — cycles as ticks on top, periods as bars, moments as dots, with
// lines for today and the studied moment. Each mark studies its moment when clicked
// (a period: its start). Follows the Life events / Cycles checkboxes.
const CYCLE_STRIP_COLORS = { 'saturn-return': '#8a6d3b', 'jupiter-return': '#c07a2c', 'chiron-return': '#5f8a3a', 'uranus-opposition': '#3a86b5', 'uranus-return': '#1f5f8b', 'nodal-return': '#8a63b8' };
function renderCycleLifeStrip(strip, chart, entries) {
  if (!strip) return;
  const birth = chartBirthMomentUTC(chart).getTime();
  const ageOf = date => (date.getTime() - birth) / 60000 / CYCLE_YEAR_MINUTES;
  const endOf = event => event.end ? lifeMomentRange(event, 'end', chart).mid : null;
  const events = entries.filter(entry => entry.type === 'event');
  const last = Math.max(ageOf(new Date()), ...events.map(entry => ageOf(endOf(entry.event) || entry.date)));
  const span = Math.min(CYCLE_MAX_AGE_YEARS, Math.max(10, Math.ceil((last + 3) / 10) * 10));
  const left = age => `${(Math.max(0, Math.min(span, age)) / span * 100).toFixed(2)}%`;
  const label = (title, date) => escapeHtml(`${title} · ${lifeDateLabel(date.toISOString().slice(0, 10))} · ${t('age {age}', { age: Math.max(0, ageOf(date)).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}`);
  const context = cycleContext();
  const studied = context && ((context.birth && 'birth') || (context.event && `${context.event.id}|${context.part}`) || (!cycleEventAnchor && `${activeCycleKey}|${activeOccurrenceIndex}`));
  // Periods on as many rows as they need not to overlap.
  const rows = [];
  const bars = events.filter(entry => entry.event.end).map(entry => {
    const from = ageOf(entry.date), to = Math.max(from, ageOf(endOf(entry.event)));
    let row = rows.findIndex(end => end < from);
    if (row < 0) row = rows.push(0) - 1;
    rows[row] = to;
    const current = studied === `${entry.event.id}|start` || studied === `${entry.event.id}|end`;
    return `<button type="button" class="life-strip-bar${current ? ' current' : ''}" style="left:${left(from)};width:max(6px, calc(${left(to)} - ${left(from)}));top:${row * 9}px" data-cycle-go-event="${escapeHtml(entry.event.id)}" data-cycle-go-part="start" title="${label(`${lifeEventTitle(entry.event)} (${lifeWhenLabel(entry.event)})`, entry.date)}"></button>`;
  }).join('');
  const dots = entries.filter(entry => entry.type === 'birth' || (entry.type === 'event' && !entry.event.end)).map(entry => entry.type === 'birth'
    ? `<button type="button" class="life-strip-dot birth${studied === 'birth' ? ' current' : ''}" style="left:${left(0)}" data-cycle-go-birth title="${label(t('Birth'), entry.date)}"></button>`
    : `<button type="button" class="life-strip-dot${studied === `${entry.event.id}|start` ? ' current' : ''}" style="left:${left(ageOf(entry.date))}" data-cycle-go-event="${escapeHtml(entry.event.id)}" data-cycle-go-part="start" title="${label(lifeEventTitle(entry.event), entry.date)}"></button>`).join('');
  const ticks = entries.filter(entry => entry.type === 'cycle' && ageOf(entry.date) <= span).map(entry =>
    `<button type="button" class="life-strip-tick${studied === `${entry.cycleDef.key}|${entry.index}` ? ' current' : ''}" style="left:${left(ageOf(entry.date))};--tick:${CYCLE_STRIP_COLORS[entry.cycleDef.key] || 'var(--accent)'}" data-cycle-go-cycle="${entry.cycleDef.key}" data-cycle-go-index="${entry.index}" title="${label(entry.cycleDef.label, entry.date)}"></button>`).join('');
  const step = span <= 30 ? 5 : 10;
  const axis = Array.from({ length: Math.floor(span / step) + 1 }, (_, index) => index * step).map(age =>
    `<span style="left:${left(age)}">${age}<small>${new Date(birth + age * CYCLE_YEAR_MINUTES * 60000).getUTCFullYear()}</small></span>`).join('');
  const marker = (age, className, text) => age >= 0 && age <= span ? `<span class="${className}" style="left:${left(age)}" title="${text}"></span>` : '';
  strip.innerHTML = `<div class="life-strip" style="--period-rows:${Math.max(1, rows.length)}" aria-label="${t('Life timeline by age')}">
    ${marker(ageOf(new Date()), 'life-strip-now', t('Today'))}
    ${context ? marker(context.anchorOffset / CYCLE_YEAR_MINUTES, 'life-strip-studied', t('The moment studied')) : ''}
    <div class="life-strip-lane ticks">${ticks}</div>
    <div class="life-strip-lane bars">${bars}</div>
    <div class="life-strip-lane dots">${dots}</div>
    <div class="life-strip-axis">${axis}</div>
  </div>
  <div class="life-strip-legend">${CYCLE_DEFINITIONS.map(def => `<span><i style="background:${CYCLE_STRIP_COLORS[def.key]}"></i>${def.label}</span>`).join('')}<span><i class="bar"></i>${t('Period')}</span><span><i class="dot"></i>${t('Event')}</span></div>`;
}
// What an annotation adds, in one short line: the place, people, tags and whether it has notes.
function cycleAnnotationMarkup(annotation, chart) {
  if (!annotation) return '';
  const others = annotation.people.filter(person => person.chartId !== chart.id).map(person => person.chartId ? chartById(person.chartId)?.name : person.name).filter(Boolean);
  const parts = [
    annotation.place ? `⌖ ${escapeHtml(annotation.place.name || lifeUnnamedPlace(annotation.place))}` : '',
    others.length ? t('with {names}', { names: escapeHtml(others.join(', ')) }) : '',
    annotation.tags.length ? escapeHtml(annotation.tags.join(', ')) : '',
    annotation.notes ? `✎ ${t('notes')}` : '',
  ].filter(Boolean);
  return parts.length ? `<small class="cycle-life-period"${annotation.notes ? ` title="${escapeHtml(annotation.notes)}"` : ''}>${parts.join(' · ')}</small>` : '';
}
function initCycleLifeTimeline() {
  const box = document.getElementById('cycleLifeTimeline');
  if (!box) return;
  box.querySelector('[data-cycle-life-filters]').addEventListener('change', event => {
    const key = event.target.dataset.cycleLifeShow;
    if (!key) return;
    cycleLifeShow[key] = event.target.checked;
    renderCycleLifeTimeline();
  });
  box.querySelector('[data-cycle-life-sort]').addEventListener('click', () => {
    cycleLifeSort = cycleLifeSort === 'asc' ? 'desc' : 'asc';
    acgStoreSetting('orbital-study-life-timeline-sort', cycleLifeSort);
    renderCycleLifeTimeline();
  });
  // Adding, editing or deleting a record redraws the timeline, the heading (the studied
  // event may have changed or gone) and the view (its slider marks the events; the
  // Astrocartography tab lists places).
  const chart = () => chartById(cycleChartId);
  const refreshCycleRecords = () => {
    cycleContext(); // lets go of a studied event that was deleted or lost its date
    refreshCycleMoment();
  };
  box.querySelector('[data-cycle-life-add]').addEventListener('click', () => {
    if (chart()) openLifeEventDialog(chart(), null, { onSave: refreshCycleRecords });
  });
  const onLifeClick = event => {
    const target = event.target.closest('button');
    if (!target) return;
    // (Deleting is in the dialog, behind Edit.)
    if (target.hasAttribute('data-cycle-annotate-birth')) {
      const birth = lifeBirthRecord(chart());
      if (birth) openLifeEventDialog(chart(), birth, { onSave: refreshCycleRecords });
      return;
    }
    if (target.dataset.cycleAnnotate) {
      const record = lifeCycleRecord(chart(), target.dataset.cycleAnnotate, Number(target.dataset.cycleAnnotateN));
      if (record) openLifeEventDialog(chart(), record, { onSave: refreshCycleRecords });
      return;
    }
    const edit = target.dataset.cycleLifeEdit;
    if (edit) {
      const record = chartLifeEvents(chart()).find(item => item.id === edit);
      if (record) openLifeEventDialog(chart(), record, { onSave: refreshCycleRecords });
      return;
    }
    if (target.hasAttribute('data-cycle-go-birth')) {
      cycleEventAnchor = { birth: true };
      refreshCycleMoment();
    } else if (target.dataset.cycleGoCycle) {
      activeCycleKey = target.dataset.cycleGoCycle;
      activeOccurrenceIndex = Number(target.dataset.cycleGoIndex);
      cycleEventAnchor = null;
      renderCycleExplorer();
    } else if (target.dataset.cycleGoEvent) {
      cycleEventAnchor = { eventId: target.dataset.cycleGoEvent, part: target.dataset.cycleGoPart };
      refreshCycleMoment();
    }
  };
  box.querySelector('[data-cycle-life-list]').addEventListener('click', onLifeClick);
  box.querySelector('[data-cycle-life-strip]').addEventListener('click', onLifeClick);
}

// Top and center, above the system tabs, shared by every system tab: the studied
// moment in two lines — its age and name, then its date (and place). The rest (what a
// cycle means, an event's people, tags, notes and date precision) is in its tooltip.
function renderCycleSignature() {
  const signature = document.getElementById('cycleSignature');
  const context = cycleContext();
  if (!signature || !context) return;
  if (context.now) {
    signature.innerHTML = cycleNowSignatureMarkup(context);
    return;
  }
  if (context.event || context.birth) {
    signature.innerHTML = cycleEventSignatureMarkup(context);
    return;
  }
  const { cycleDef, occurrence } = context;
  const passes = occurrence.passes.map(pass => lifeDateLabel(pass.toISOString().slice(0, 10)));
  const how = cycleDef.kind === 'opposition'
    ? tn(passes.length, 'Transiting {planet} reaches the degree opposite its natal degree — exact once.', 'Transiting {planet} reaches the degree opposite its natal degree — exact {n} times while retrograde.', { planet: tName(cycleDef.planet) })
    : tn(passes.length, 'Transiting {planet} reaches its natal degree — exact once.', 'Transiting {planet} reaches its natal degree — exact {n} times while retrograde.', { planet: tName(cycleDef.planet) });
  // An annotated occurrence also shows where it was spent, and its notes in the tooltip.
  const annotation = lifeCycleAnnotation(context.chart, cycleDef.key, activeOccurrenceIndex + 1);
  const where = annotation?.place ? `⌖ ${escapeHtml(annotation.place.name || lifeUnnamedPlace(annotation.place))}` : '';
  const extra = annotation ? [annotation.tags.length ? t('Tags: {tags}', { tags: annotation.tags.join(', ') }) : '', annotation.notes].filter(Boolean) : [];
  signature.innerHTML = cycleSignatureMarkup(occurrence.ageYears, context.cycleName, [passes.join(' · '), where], [cycleDef.description, how, ...extra].join('\n\n'));
}
function cycleSignatureMarkup(ageYears, title, details, tip) {
  return `<p class="cycle-signature-head"${tip ? ` title="${escapeHtml(tip)}"` : ''}><span class="cycle-signature-age">${t('Age {age}', { age: Math.max(0, ageYears).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span> <strong>${escapeHtml(title)}</strong></p>
    <p class="cycle-signature-when">${details.filter(Boolean).join(' · ')}</p>`;
}

// The studied moment for the Astrocartography tab: its lines, and its place if it has
// one (an event's, birth's, or an annotated cycle's), with that record opened in the list.
function cycleAcgMoment() {
  const context = cycleContext();
  if (!context) return null;
  const { chart } = context;
  if (context.now) return { context, label: t('Transits'), place: cycleCastPlace(context).place, recordId: null };
  if (context.birth) {
    const birth = lifeBirthRecord(chart);
    return { context, label: t('Birth'), place: birth?.place || null, recordId: birth?.place ? birth.id : null };
  }
  if (context.event) {
    const { event, part } = context;
    return { context, label: `${lifeEventTitle(event)}${event.end ? ` (${part === 'end' ? t('end') : t('start')})` : ''}`, place: event.place || null, recordId: event.place ? event.id : null };
  }
  const annotation = lifeCycleAnnotation(chart, context.cycleDef.key, activeOccurrenceIndex + 1);
  return { context, label: context.cycleName, place: annotation?.place || null, recordId: annotation?.place ? annotation.id : null };
}
function switchCycleSystem(system) {
  const surface = document.getElementById('cycleSystemSurface');
  if (!surface) return;
  cycleActiveSystem = system;
  document.querySelectorAll('[data-cycle-system]').forEach(item => item.classList.toggle('active', item.dataset.cycleSystem === system));
  if (system === 'Astrocartography') { renderAstrocartographyPanel(surface, chartById(cycleChartId), cycleAcgMoment()); return; }
  renderCycleSystemView();
}

// ── Human Design and Gene Keys at the cycle moment ─────────────────────────
// The selected chart, cycle and occurrence, and the occurrence's moment as minutes after
// birth — what the Human Design and Gene Keys cycle views draw from.
// With a life event (or birth) chosen instead, the same fields describe it, plus:
// `event`/`part` or `birth`; `range` (the event date's uncertainty, as offsets); `omit`
// (bodies to leave out of an imprecise moment); `span` (a slider half-width that fits
// it); `momentNoun`, for labels.
function cycleContext() {
  const chart = chartById(cycleChartId);
  const cycleDef = CYCLE_DEFINITIONS.find(def => def.key === activeCycleKey);
  if (!chart || !cycleDef) return null;
  const birthTime = chartBirthMomentUTC(chart).getTime();
  const offsetOf = date => (date.getTime() - birthTime) / 60000;
  if (cycleEventAnchor?.birth) {
    return { chart, cycleDef, birth: true, anchorOffset: 0, anchorLabel: t('Birth'), cycleName: t('Birth'), momentNoun: t('Birth'), theNoun: t('birth'), theNounTitle: t('Birth moment'), span: 30 * 1440 };
  }
  if (cycleEventAnchor?.now) {
    const time = cycleEventAnchor.time || Date.now();
    return { chart, cycleDef, now: true, time, anchorOffset: offsetOf(new Date(time)), anchorLabel: `${t('Transits')} · ${cycleClockLabel(new Date(time))}`, cycleName: t('Transits'), momentNoun: t('Transits'), theNoun: t('then'), theNounTitle: t('Now (when opened)'), span: 30 * 1440 };
  }
  const event = cycleEventAnchor && chartLifeEvents(chart).find(item => item.id === cycleEventAnchor.eventId && item.start);
  if (event) {
    const part = cycleEventAnchor.part === 'end' && event.end ? 'end' : 'start';
    const range = lifeMomentRange(event, part, chart);
    const anchorOffset = offsetOf(range.mid);
    // Fits the whole period (seen from either end), or the date's uncertainty, with room around it.
    const other = event.end ? lifeMomentRange(event, part === 'start' ? 'end' : 'start', chart) : null;
    const reach = Math.max(
      Math.abs(offsetOf(range.from) - anchorOffset), Math.abs(offsetOf(range.to) - anchorOffset),
      other ? Math.max(Math.abs(offsetOf(other.from) - anchorOffset), Math.abs(offsetOf(other.to) - anchorOffset)) : 0,
    );
    return {
      chart, cycleDef, event, part, range, anchorOffset,
      anchorLabel: `${lifeEventTitle(event)}${event.end ? ` (${part === 'end' ? t('end') : t('start')})` : ''} · ${lifeDateLabel((part === 'end' ? event.end : event.start).date)}`,
      cycleName: lifeEventTitle(event),
      momentNoun: event.end ? (part === 'end' ? t('Event end') : t('Event start')) : t('Event'),
      theNoun: event.end ? (part === 'end' ? t('the event end') : t('the event start')) : t('the event'),
      theNounTitle: event.end ? (part === 'end' ? t('The event end') : t('The event start')) : t('The event'),
      omit: range.precision === 'time' ? null : LIFE_TIME_OF_DAY_BODIES,
      span: Math.max(30 * 1440, Math.ceil(reach * 1.25)),
    };
  }
  if (cycleEventAnchor) cycleEventAnchor = null; // the event was deleted or lost its date
  const occurrence = computeCycleOccurrences(chart, cycleDef)[activeOccurrenceIndex];
  if (!occurrence) return null;
  const anchorOffset = offsetOf(occurrence.date);
  return {
    chart, cycleDef, occurrence, anchorOffset,
    anchorLabel: `${cycleDef.label} · ${formatDate(occurrence.date.toISOString().slice(0, 10))}`,
    cycleName: `${cycleDef.label} ${occurrence.date.getFullYear()}`,
    momentNoun: t('Cycle moment'),
    theNoun: t('the cycle moment'),
    theNounTitle: t('Exact cycle moment'),
    span: 30 * 1440,
  };
}
// The heading for a life event (or birth): its age and title, then its date (a period:
// the end shown) and place; its type, people, tags, notes and date precision in the tooltip.
function cycleEventSignatureMarkup(context) {
  const { chart } = context;
  const age = context.anchorOffset / CYCLE_YEAR_MINUTES;
  const placeName = place => place ? `⌖ ${escapeHtml(place.name || `${acgCoordinate(place.lat, 'N', 'S')}, ${acgCoordinate(place.lon, 'E', 'W')}`)}` : '';
  if (context.birth) {
    const birth = lifeBirthRecord(chart);
    const others = birth.people.filter(person => person.chartId !== chart.id).map(person => `${person.chartId ? chartById(person.chartId)?.name || '' : person.name}${person.role ? ` (${person.role})` : ''}`);
    const tip = [t('The natal chart itself: the moment every cycle and event is measured from.'), others.length ? t('With {names}', { names: others.join(', ') }) : '', birth.tags.length ? t('Tags: {tags}', { tags: birth.tags.join(', ') }) : '', birth.notes].filter(Boolean).join('\n\n');
    return cycleSignatureMarkup(0, t('Birth'), [lifeWhenLabel(birth), birth.start.time, placeName(birth.place)], tip);
  }
  const { event, part, range } = context;
  const kind = LIFE_EVENT_KIND_LABELS.get(event.kind);
  const others = event.people.filter(person => person.chartId !== chart.id).map(person => `${person.chartId ? chartById(person.chartId)?.name || '' : person.name}${person.role ? ` (${person.role})` : ''}`);
  const moment = part === 'end' ? event.end : event.start;
  const tip = [
    kind && event.title && kind !== event.title ? kind : '',
    event.end ? `${lifeWhenLabel(event)} (${part === 'end' ? t('showing its end') : t('showing its start')})` : '',
    others.length ? t('With {names}', { names: others.join(', ') }) : '',
    event.tags.length ? t('Tags: {tags}', { tags: event.tags.join(', ') }) : '',
    event.notes,
    LIFE_PRECISION_NOTES[range.precision] || '',
  ].filter(Boolean).join('\n\n');
  const title = `${lifeEventTitle(event)}${event.end ? ` (${part === 'end' ? t('end') : t('start')})` : ''}`;
  return cycleSignatureMarkup(age, title, [lifeDateLabel(moment.date), moment.time && `${moment.time}${event.zone ? ` ${escapeHtml(event.zone)}` : ''}`, placeName(event.place)], tip);
}
// Re-renders the current system tab's cycle view for the current selection.
function renderCycleSystemView() {
  const surface = document.getElementById('cycleSystemSurface');
  const context = cycleContext();
  if (!surface || !context) return;
  if (cycleActiveSystem === 'Summary') renderCycleSummary(surface, context);
  if (cycleActiveSystem === 'Astrology') renderCycleAstrology(surface, context);
  if (cycleActiveSystem === 'Human Design') renderCycleHumanDesign(surface, context);
  if (cycleActiveSystem === 'Gene Keys') renderCycleGeneKeys(surface, context);
  if (cycleActiveSystem === 'Astrocartography') renderAstrocartographyPanel(surface, context.chart, cycleAcgMoment());
}
// The slider under each cycle chart moves only the cycle moment (the natal chart stays
// put); its readout shows the offset from the exact cycle moment and the date.
// Life events show along it (periods as bands), the chosen one highlighted. Its ticks
// read the birth chart's clock ("now": this device's), and its window and thumb carry
// over from tab to tab while the moment stays the same (cycle-moment.js).
function bindCycleSlider(container, context, onChange) {
  const birth = chartBirthMomentUTC(context.chart).getTime();
  bindTimelineSlider(container, {
    originLabel: context.anchorLabel,
    anchorName: context.theNoun,
    initialSpan: context.span,
    originTime: birth + context.anchorOffset * 60000,
    clock: context.now ? timelineClock() : chartTimelineClock(context.chart),
    initial: cycleSliderView(context),
    onView: view => noteCycleSliderMoment(context, view),
    markers: () => cycleSliderMarkers(context),
    onChange: offset => {
      container.querySelector('[data-timeline-date]').textContent = offset === 0
        ? context.theNounTitle
        : t('{offset} from {moment}', { offset: `${offset > 0 ? '+' : '-'}${formatTimelineSpan(offset)}`, moment: context.theNoun });
      // "Now" is read on this device's clock; the others on the birth chart's.
      container.querySelector('[data-timeline-exact]').textContent = context.now
        ? cycleClockLabel(new Date(context.time + offset * 60000))
        : exactChartTime(context.chart, context.anchorOffset + offset);
      onChange(context.anchorOffset + offset);
    },
  });
}
const CYCLE_NATAL_COLOR = 'var(--pair-blue)', CYCLE_MOMENT_COLOR = 'var(--pair-green)';
// The chart's life events as slider markers, in minutes from the studied moment: a dated
// event over its date's range (a day, month or year unless it has a time), a period
// from its start to its end.
function cycleSliderMarkers(context) {
  const { chart } = context;
  const birthTime = chartBirthMomentUTC(chart).getTime();
  const offset = date => (date.getTime() - birthTime) / 60000 - context.anchorOffset;
  return chartLifeEvents(chart).filter(event => event.start && event.anchor?.chartId !== chart.id).map(event => {
    const start = lifeMomentRange(event, 'start', chart);
    const end = event.end ? lifeMomentRange(event, 'end', chart) : start;
    return {
      from: offset(start.from), to: offset(end.to),
      label: `${lifeEventTitle(event)} · ${lifeWhenLabel(event)}`,
      color: event.end ? 'var(--blue)' : 'var(--accent)',
      current: context.event?.id === event.id,
    };
  });
}

// Astrology: the Pair Explorer's synastry view with the natal chart inside (blue) and the
// sky at the cycle moment around it (red), cross-aspects between them, and a slider that
// moves only the cycle moment.
// The moment's ring is cast for the place chosen under Cast for (cycle-moment.js).
const CYCLE_ASTRO_SUBJECTS = [['synastry', t('Synastry')], ['A', t('Natal')], ['B', t('Cycle')]];
function renderCycleAstrology(surface, context) {
  const { chart } = context;
  const moment = context.now ? t('Transits') : t('Cycle');
  const people = {
    A: { key: 'A', chart, color: 'var(--blue)', name: t('Natal'), tag: t('natal'), housesName: t('natal house'), legend: `${t('Natal')} · ${escapeHtml(chart.name)}`, offset: 0 },
    B: { key: 'B', chart: cycleCastChart(context), color: 'var(--accent)', name: moment, tag: context.now ? t('transits') : t('cycle'), legend: `${context.momentNoun}${context.now ? '' : ` · ${escapeHtml(context.cycleName)}`}`, offset: context.anchorOffset, omit: context.omit },
  };
  const subjects = CYCLE_ASTRO_SUBJECTS.map(([value, label]) => [value, value === 'B' ? moment : label]);
  const extra = context.birth ? null : {
    bind: (box, redraw) => bindCycleCastControls(box, context, () => {
      people.B.chart = cycleCastChart(context);
      renderCycleSignature();
      redraw();
    }),
  };
  const view = renderSynastryView(surface, people, { subjects, state: cycleAstroState, wheelId: 'cycleWheel', footer: timelineSliderMarkup(context.momentNoun.toUpperCase(), 0), extra });
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
          ${cycleReadingSwitchMarkup(context)}
          <span class="eyebrow cycle-toolbar-label">${escapeHtml(context.anchorLabel.toUpperCase())}</span>
        </div>
        <div class="pair-hd-stage">
          <div class="pair-legend">
            <span><i class="legend-dot" style="background:${CYCLE_NATAL_COLOR}"></i>${t('Natal')} · ${escapeHtml(chart.name)}</span>
            <span><i class="legend-dot" style="background:${CYCLE_MOMENT_COLOR}"></i>${context.momentNoun}${context.now ? '' : ` · ${escapeHtml(context.cycleName)}`}</span>
            <span><i class="legend-swatch halo"></i>${t('Electromagnetic — formed only together')}</span>
          </div>
          <div data-cycle-graphic></div>
        </div>
        ${timelineSliderMarkup(context.momentNoun.toUpperCase(), 0)}
      </div>
      <aside class="system-info" data-cycle-info></aside>
    </div>`;
  let momentOffset = context.anchorOffset;
  const full = cycleReading(context) === 'full';
  const draw = () => {
    const composite = computeCycleHumanDesign(chart, momentOffset, full);
    const graphic = surface.querySelector('[data-cycle-graphic]');
    if (cycleHdView === 'mandala') {
      // Natal planets (both sides) in the natal color, the cycle moment's planets in the cycle color.
      const glyphs = new Map();
      const add = (entryMap, color, label, sides) => entryMap.forEach((entry, gate) => {
        if (!glyphs.has(gate)) glyphs.set(gate, { items: [] });
        sides.forEach(side => glyphs.get(gate).items.push(...entry[side].map(glyph => ({ glyph, color, side: label }))));
      });
      add(humanDesignGateGlyphMap(chart, 0), CYCLE_NATAL_COLOR, t('Natal'), ['personality', 'design']);
      add(humanDesignGateGlyphMap(chart, momentOffset), CYCLE_MOMENT_COLOR, context.momentNoun, full ? ['personality', 'design'] : ['personality']);
      graphic.innerHTML = hdMandalaSvgMarkup(composite.state, glyphs);
    } else {
      graphic.innerHTML = `<svg class="bodygraph hd-bodygraph pair-bodygraph" viewBox="0 0 440 640" role="img" aria-label="${t('Cycle composite bodygraph')}">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-bodygraph-layers>${hdBodygraphLayersMarkup(composite.state)}</g>
        </svg>`;
    }
    const { structure, newlyDefinedCenters, cycleChannels } = composite;
    const centerName = id => tName(HD_CENTERS.find(center => center.id === id)?.name || id);
    const stat = (label, value) => `<div class="system-stat"><span>${label}</span><strong>${value}</strong></div>`;
    surface.querySelector('[data-cycle-info]').innerHTML = `
      <span class="eyebrow">${t('CYCLE COMPOSITE')} · ${full ? t('FULL CHART') : t('TRANSIT')}</span>
      <h3>${t('{type} composite', { type: tName(structure.type) })}</h3>
      <p>${tName(structure.definition)}</p>
      ${stat(t('CENTERS DEFINED / UNDEFINED'), `${structure.definedCenters.size} / ${9 - structure.definedCenters.size}`)}
      ${stat(t('DEFINED CHANNELS'), `${structure.definedChannels.length} / 36`)}
      ${stat(t('DEFINED ONLY WITH THE CYCLE'), newlyDefinedCenters.length ? newlyDefinedCenters.map(centerName).join(', ') : t('None'))}
      <span class="eyebrow cycle-info-subhead">${t('CHANNELS THE CYCLE COMPLETES')} · ${cycleChannels.length}</span>
      ${hdChannelListMarkup(cycleChannels)}`;
  };
  surface.querySelector('[data-cycle-hd-view]').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    cycleHdView = button.dataset.value;
    surface.querySelectorAll('[data-cycle-hd-view] button').forEach(item => item.classList.toggle('active', item === button));
    draw();
  });
  bindCycleReadingSwitch(surface, context, () => renderCycleHumanDesign(surface, context));
  bindCycleSlider(surface.querySelector('.timeline-control'), context, offset => { momentOffset = offset; draw(); });
}

function renderCycleGeneKeys(surface, context) {
  const { chart } = context;
  const tabs = Object.keys(GENE_KEYS_TAB_ACTIVE_INDEXES);
  if (!tabs.includes(cycleGkTab)) cycleGkTab = tabs[0];
  const natalHd = computeHumanDesignChart(chart, 0);
  const reading = cycleReading(context);
  surface.innerHTML = `
    <div class="system-tabs">${tabs.map(tab => `<button type="button" class="${tab === cycleGkTab ? 'active' : ''}" data-cycle-gk-tab="${tab}">${tName(tab)}</button>`).join('')}</div>
    <div class="system-layout cycle-system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar"><span class="eyebrow">${tName(cycleGkTab).toUpperCase()}</span>${cycleReadingSwitchMarkup(context)}<span class="sample-badge">${escapeHtml(context.anchorLabel.toUpperCase())}</span></div>
        <div class="pair-hd-stage">
          <div class="pair-legend">
            <span><i class="legend-dot" style="background:var(--muted)"></i>${t('Natal gate (in each sphere)')} · ${escapeHtml(chart.name)}</span>
            <span><i class="legend-dot" style="background:${CYCLE_MOMENT_COLOR}"></i>${t('{moment} gate (below)', { moment: context.momentNoun })}${context.now ? '' : ` · ${escapeHtml(context.cycleName)}`}</span>
          </div>
          <div data-cycle-graphic>${geneKeysDiagramSvg(natalHd, cycleGkTab, t('Gene Keys {tab} at the cycle moment', { tab: tName(cycleGkTab) }), cycleMomentHd(chart, context.anchorOffset, reading))}</div>
        </div>
        ${timelineSliderMarkup(context.momentNoun.toUpperCase(), 0)}
      </div>
      <aside class="system-info"><span class="eyebrow">${t('CYCLE READING')}</span><h3>${tName(cycleGkTab)}</h3></aside>
    </div>`;
  const card = surface.querySelector('.gene-visual');
  bindGeneKeysAllPathsClicks(card);
  bindGeneKeysHoverDebug(card.querySelector('svg'));
  bindCycleReadingSwitch(surface, context, () => renderCycleGeneKeys(surface, context));
  surface.querySelectorAll('[data-cycle-gk-tab]').forEach(button => button.addEventListener('click', () => {
    cycleGkTab = button.dataset.cycleGkTab;
    renderCycleGeneKeys(surface, context);
  }));
  bindCycleSlider(surface.querySelector('.timeline-control'), context, offset => {
    const layer = surface.querySelector('[data-gene-spheres]');
    layer.innerHTML = geneKeysSpheresLayerMarkup(natalHd, cycleGkTab, cycleMomentHd(chart, offset, reading));
    bindGeneKeysAllPathsClicks(layer);
  });
}

function initCycleExplorer() {
  document.querySelectorAll('[data-cycle-system]').forEach(button => button.addEventListener('click', () => switchCycleSystem(button.dataset.cycleSystem)));
  document.getElementById('cycleButton')?.addEventListener('click', () => {
    if (selectedChartId) { cycleChartId = selectedChartId; activeOccurrenceIndex = 0; cycleEventAnchor = null; }
    setView('cycle');
  });
  // Transits: the chart against the sky now — from the Chart Explorer, or the Cycle Explorer's own button.
  document.getElementById('transitsButton')?.addEventListener('click', () => {
    openCycleTransits(selectedChartId);
    setView('cycle');
  });
  document.getElementById('cycleNowButton')?.addEventListener('click', () => {
    openCycleTransits();
    refreshCycleMoment();
  });
  document.getElementById('cycleSignature')?.addEventListener('click', event => {
    if (event.target.closest('[data-cycle-now-refresh]')) { openCycleTransits(); refreshCycleMoment(); }
    else if (event.target.closest('[data-cycle-now-save]')) saveCycleMomentToTimeline();
  });
}

initCycleExplorer();
initCycleLifeTimeline();
