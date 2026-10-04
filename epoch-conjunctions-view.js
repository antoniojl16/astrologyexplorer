// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Epoch Explorer: Conjunctions ─────────────────────────────────────────
// Every pair at once, from one moment (now, to start with): where and when each of the
// ten pairs last met — its latest exact pass, whichever pass of a retrograde loop that
// was — or, switched to Next, where each will meet next. One wheel marks them all, with
// the five planets at the moment on a small inner ring, and a table lists them, sortable
// by the pair's mean cycle or by the date. The moment steps from pass to pass of any pair.
//
// The passes come from EPOCH_CONJUNCTIONS (epoch-conjunctions.js), as in the Astrology
// tab (epochConjunctionPasses, epoch-astrology.js).

const epochConj = {
  time: null, // the moment, set on first render
  when: 'past', // 'past': each pair's latest pass; 'next': its next one
  planets: true, // the planets at the moment, on the inner ring
  sort: { key: 'date', descending: null }, // descending null: the natural order for `when`
};
const EPOCH_CONJ_WHEN = [['past', 'Past'], ['next', 'Next']];

// Every pass of every pair, in time order, each { ut, pair, pass, passes }.
let epochAllPassesCache = null;
function epochAllPasses() {
  if (!epochAllPassesCache) {
    epochAllPassesCache = EPOCH_PAIRS.flatMap((pair) => epochConjunctionPasses(pair).map((entry) => ({ ...entry, pair }))).sort((a, b) => a.ut - b.ut);
  }
  return epochAllPassesCache;
}
// Each pair's latest pass at or before `ut` (past) or first one after it (next), with
// its position, the years between, and where the moment stands in the pair's cycle.
function epochConjRows(ut, when) {
  return EPOCH_PAIRS.map((pair) => {
    const passes = epochConjunctionPasses(pair);
    let entry = null;
    if (when === 'past') { for (let index = passes.length - 1; index >= 0; index -= 1) if (passes[index].ut <= ut) { entry = passes[index]; break; } }
    else entry = passes.find((item) => item.ut > ut) || null;
    const events = epochConjunctions(pair);
    const index = epochCycleIndex(pair, ut);
    const cycleShare = index >= 0 && events[index + 1] ? (ut - events[index].start) / (events[index + 1].start - events[index].start) : null;
    return entry && { pair, ...entry, longitude: epochConjunctionLongitude(pair, entry.ut), cycle: epochMeanCycleYears(pair), years: (ut - entry.ut) / EPOCH_YEAR_DAYS, cycleShare };
  }).filter(Boolean);
}
function epochConjPassText(row) {
  return row.passes > 1 ? `pass ${row.pass} of ${row.passes}` : '';
}
function epochConjYearsText(years) {
  const amount = Math.abs(years);
  if (amount * EPOCH_YEAR_DAYS < 1) return 'at the moment';
  const text = amount >= 2 ? `${amount.toFixed(1)} years` : amount * 12 >= 1 ? `${(amount * 12).toFixed(1)} months` : `${Math.round(amount * EPOCH_YEAR_DAYS)} days`;
  return years >= 0 ? `${text} ago` : `in ${text}`;
}
function epochCycleYearsText(years) {
  return `${years >= 100 ? Math.round(years) : years.toFixed(1)} years`;
}

// ── Wheel ────────────────────────────────────────────────────────────────
// The zodiac, fixed (0° Aries at the left); inside it, each pair's conjunction marked
// at its degree, labelled with the two glyphs and the year; inside that, the five
// planets at the moment.
function renderEpochConjWheel(svg, rows) {
  const cx = 300, cy = 300, outer = 278, zodiacInner = 236, markRing = 150, planetRing = 66;
  const rotation = 270;
  const color = epochConj.when === 'past' ? 'var(--epoch-inner)' : 'var(--epoch-outer)';
  const circle = (r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  const polar = (r, angle) => { const rad = ((angle - 90) * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
  let markup = circle(outer) + circle(zodiacInner) + circle(markRing) + (epochConj.planets ? circle(markRing - planetRing) : '');
  markup += wheelZodiacMarkup(cx, cy, outer, zodiacInner, rotation);
  for (let sign = 0; sign < 12; sign += 1) {
    const [x1, y1] = polar(zodiacInner, rotation - sign * 30), [x2, y2] = polar(epochConj.planets ? markRing - planetRing : markRing, rotation - sign * 30);
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="epoch-sign-cusp"/>`;
  }
  // The conjunctions: a tick at the exact degree, the label spread clear of its neighbours.
  const marks = rows.map((row) => ({ row, angle: (rotation - row.longitude + 360) % 360 }));
  spreadClusteredAngles(marks, 13);
  marks.forEach(({ row, angle, displayAngle }) => {
    const [tx1, ty1] = polar(zodiacInner, angle), [tx2, ty2] = polar(zodiacInner - 9, angle);
    // Glyphs over the year, upright, centered a little inside the zodiac.
    const [lx, ly] = polar(zodiacInner - 13, angle), [mx, my] = polar(203, displayAngle), [ex, ey] = polar(222, displayAngle);
    const [gx, gy, yx, yy] = [mx, my - 7, mx, my + 8];
    const [first, second] = epochPairBodies(row.pair);
    markup += `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="${color}" stroke-width="2"/>`
      + (Math.abs(displayAngle - angle) > 0.5 ? `<line x1="${lx}" y1="${ly}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width=".7" opacity=".5" stroke-dasharray="1 2"/>` : '')
      + `<g class="epoch-conj-mark" data-epoch-conj-mark="${row.pair}" tabindex="0"><circle cx="${mx}" cy="${my}" r="17" fill="transparent"/>`
      + `<text x="${gx}" y="${gy}" text-anchor="middle" dominant-baseline="middle" fill="${color}" class="epoch-conj-glyphs">${EPOCH_GLYPHS[first]}${EPOCH_GLYPHS[second]}</text>`
      + `<text x="${yx}" y="${yy}" text-anchor="middle" dominant-baseline="middle" class="epoch-conj-year">${epochYearLabel(epochCalendar(row.ut).year)}</text></g>`;
  });
  // The planets at the moment.
  const positions = [];
  if (epochConj.planets) {
    const time = epochTime(epochConj.time);
    EPOCH_BODIES.forEach((body) => {
      const longitude = epochLongitude(body, time);
      positions.push({ name: body, glyph: EPOCH_GLYPHS[body], key: body, color: 'var(--ink)', longitude, angle: (rotation - longitude + 360) % 360, motion: epochMotion(body, epochConj.time) });
    });
    spreadClusteredAngles(positions, 11);
    positions.forEach((position) => {
      const rad = ((position.displayAngle - 90) * Math.PI) / 180;
      markup += planetMarkerMarkup(cx, cy, markRing, position, planetRing) + planetDegreeLabelMarkup(cx, cy, markRing - 3, rad, position.longitude, position.color);
    });
  }
  // The title, over the wheel.
  markup += `<text x="${cx}" y="-12" class="epoch-wheel-title" text-anchor="middle">${epochConj.when === 'past' ? 'The latest conjunction of each pair' : 'The next conjunction of each pair'}</text>`
    + `<text x="${cx}" y="9" class="epoch-wheel-subtitle" text-anchor="middle" style="fill:${color}">${epochConj.when === 'past' ? 'up to' : 'after'} ${epochDateText(epochConj.time, { time: false })}${epochConj.planets ? ' · planets inside at that moment' : ''}</text>`;
  svg.innerHTML = markup;
  const byName = new Map(positions.map((position) => [position.key, position]));
  svg._wheelHover = {
    planet: (key) => byName.has(key) && (() => {
      const position = byName.get(key);
      const { glyph, degree } = wheelSignText(position.longitude);
      const mark = WHEEL_MOTION_MARKS[position.motion];
      return `<div class="wheel-tooltip-main">${position.name} ${glyph}${degree.toFixed(2)}°${mark ? ` ${mark}` : ''}</div><div class="wheel-tooltip-sub">${epochDateText(epochConj.time, { time: false, calendar: true })}</div>`;
    }),
    aspect: () => null,
  };
  bindWheelHover(svg).hidden = true;
}
// Hovering a conjunction: the pass, all the passes of that conjunction, and the cycle.
function epochConjMarkTipHtml(element) {
  const row = epochConjRows(epochConj.time, epochConj.when).find((item) => item.pair === element.dataset.epochConjMark);
  if (!row) return '';
  const events = epochConjunctions(row.pair);
  const event = events.find((item) => item.passes.includes(row.ut));
  const sign = Math.floor(epochWrap360(row.longitude) / 30);
  const passes = event && event.passes.length > 1
    ? `<div class="gk-tip-title">All passes</div><div class="gk-tip-text">${event.passes.map((pass, index) => `${index + 1}. ${epochDateText(pass, { time: false, calendar: true })} · ${epochPositionText(epochConjunctionLongitude(row.pair, pass))}`).join('<br>')}</div>`
    : '';
  return `<div class="gk-tip-title">${epochPairName(row.pair)} conjunction · ${epochDateText(row.ut, { time: false, calendar: true })}</div>
    <div class="gk-tip-text">${epochPositionText(row.longitude)} · ${EPOCH_ELEMENTS[sign % 4]}${row.passes > 1 ? ` · ${epochConjPassText(row)}` : ''}<br>${epochConjYearsText(row.years)} · the pair meets about every ${epochCycleYearsText(row.cycle)}</div>
    ${passes}`;
}
bindHoverTooltips('[data-epoch-conj-mark]', epochConjMarkTipHtml, 'epochConjTooltip');

// ── Table ────────────────────────────────────────────────────────────────
// The same conjunctions, sortable by the pair's mean cycle or by date.
function epochConjTableMarkup(rows) {
  const { key } = epochConj.sort;
  // Natural order: by date, most recent first (past) or soonest first (next); by cycle, shortest first.
  const descending = epochConj.sort.descending ?? (key === 'date' && epochConj.when === 'past');
  const value = (row) => (key === 'date' ? row.ut : row.cycle);
  const sorted = [...rows].sort((a, b) => (descending ? value(b) - value(a) : value(a) - value(b)));
  const arrow = (column) => (column === key ? ` <span class="epoch-sort-arrow">${descending ? '▼' : '▲'}</span>` : '');
  const header = (column, label, title) => `<th><button type="button" class="epoch-sort${column === key ? ' active' : ''}" data-epoch-sort="${column}" title="${title}">${label}${arrow(column)}</button></th>`;
  const past = epochConj.when === 'past';
  return `<table class="epoch-table epoch-conj-table">
    <thead><tr><th>Pair</th>${header('cycle', 'MEAN CYCLE', 'Sort by the pair’s mean time between conjunctions')}${header('date', past ? 'LATEST PASS' : 'NEXT PASS', 'Sort by the date of the conjunction')}<th>POSITION</th><th>${past ? 'SINCE' : 'UNTIL'}</th><th title="How far the moment is through the pair's current cycle, from its conjunction to the next">THROUGH CYCLE</th><th></th></tr></thead>
    <tbody>${sorted.map((row) => {
      const sign = Math.floor(epochWrap360(row.longitude) / 30);
      const share = row.cycleShare == null ? '' : `<span class="epoch-progress" title="${(row.cycleShare * 100).toFixed(1)}% of the way through the cycle"><i style="width:${(row.cycleShare * 100).toFixed(1)}%"></i></span>${Math.round(row.cycleShare * 100)}%`;
      return `<tr data-epoch-conj-row="${row.pair}"><td><strong>${epochPairGlyphs(row.pair)}</strong> <small>${epochPairName(row.pair)}</small></td>
        <td>${epochCycleYearsText(row.cycle)}</td>
        <td>${epochDateText(row.ut, { time: false, calendar: true })}${row.passes > 1 ? `<small class="epoch-conj-pass">${epochConjPassText(row)}</small>` : ''}</td>
        <td>${epochPositionText(row.longitude)} <small>${EPOCH_ELEMENTS[sign % 4]}</small></td>
        <td>${epochConjYearsText(row.years)}</td>
        <td class="epoch-conj-share">${share}</td>
        <td><button type="button" class="epoch-set-button" data-epoch-conj-go="${row.ut}" title="Move the moment to this pass" style="--thumb:var(--epoch-inner)">Go</button></td></tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderEpochConjunctions(surface) {
  if (epochConj.time == null) epochConj.time = epochNow();
  surface.innerHTML = `
    <div class="epoch-conj-layout">
      <div class="chart-panel epoch-wheel-panel">
        <div class="panel-toolbar">
          <div class="chart-toolbar-right"><span class="eyebrow">CONJUNCTIONS</span>${pairSegmentedMarkup('data-epoch-when', EPOCH_CONJ_WHEN, epochConj.when)}</div>
          <label class="epoch-lock"><input type="checkbox" data-epoch-conj-planets ${epochConj.planets ? 'checked' : ''}>Planets at the moment</label>
        </div>
        <div class="wheel-stage"><svg class="synastry-wheel epoch-wheel" viewBox="20 -36 560 616" role="img" aria-label="The latest or next conjunction of each pair of slow planets" data-epoch-conj-wheel></svg></div>
      </div>
      <div class="epoch-panel epoch-conj-table-panel">
        <span class="eyebrow">THE TEN PAIRS</span>
        <div class="epoch-table-scroll" data-epoch-conj-table></div>
        <p class="system-note">Each pair’s latest exact pass: when a retrograde loop brings two or three passes, whichever came last before the moment (with Next, the first one after it). Click Mean cycle or the date to sort; again to reverse.</p>
      </div>
    </div>
    <div class="chart-panel epoch-time-panel">
      <div class="epoch-moment-panel epoch-conj-moment" style="--thumb:var(--epoch-inner)">
        <div class="epoch-moment-head">
          <span class="epoch-moment-pick"><i class="legend-dot" style="background:var(--epoch-inner)"></i>Moment</span>
          <div class="epoch-stepper"><span>Conjunction</span><button type="button" data-epoch-conj-step="-1" title="The previous exact pass of any pair (,)" aria-label="Previous conjunction pass">◀</button><button type="button" data-epoch-conj-step="1" title="The next exact pass of any pair (.)" aria-label="Next conjunction pass">▶</button></div>
          <span class="epoch-focus" data-epoch-conj-focus></span>
        </div>
        <div data-epoch-conj-slider>${epochSliderMarkup('DATE')}</div>
      </div>
    </div>
    ${epochAstrologyNotesMarkup()}`;
  const svg = surface.querySelector('[data-epoch-conj-wheel]');
  const table = surface.querySelector('[data-epoch-conj-table]');
  const focusNode = surface.querySelector('[data-epoch-conj-focus]');
  let stepped = null; // the pass the moment was stepped to, named while it stays there
  const draw = () => {
    const rows = epochConjRows(epochConj.time, epochConj.when);
    renderEpochConjWheel(svg, rows);
    table.innerHTML = epochConjTableMarkup(rows);
    focusNode.textContent = stepped && stepped.ut === epochConj.time
      ? `${epochPairGlyphs(stepped.pair)} · ${epochDateText(stepped.ut, { time: false })} · ${epochPositionText(epochConjunctionLongitude(stepped.pair, stepped.ut))}${stepped.passes > 1 ? ` · pass ${stepped.pass} of ${stepped.passes}` : ''}`
      : '';
  };
  const setTime = (ut) => {
    epochConj.time = Math.max(EPOCH_ASTRO_MIN, Math.min(EPOCH_ASTRO_MAX, ut));
    draw();
  };
  const slider = epochBindSlider(surface.querySelector('[data-epoch-conj-slider]'), {
    range: [EPOCH_ASTRO_MIN, EPOCH_ASTRO_MAX], initialYears: 100, wheelZoom: false,
    get: () => epochConj.time,
    set: setTime,
    // Every pass of every pair.
    markers: () => epochAllPasses().map((entry) => ({ from: entry.ut, color: 'var(--epoch-inner)', label: `${epochPairName(entry.pair)} conjunction · ${epochDateText(entry.ut, { time: false, calendar: true })}${entry.passes > 1 ? ` · pass ${entry.pass} of ${entry.passes}` : ''}` })),
  });
  const jumpTo = (ut) => { setTime(ut); slider.moveTo(epochConj.time); };
  // To the previous / next exact pass of any pair.
  const step = (direction) => {
    const entry = epochPassFrom(epochAllPasses(), epochConj.time, direction);
    if (!entry) return false;
    stepped = entry;
    jumpTo(entry.ut);
    return true;
  };
  epochKeyHandler = (action, direction) => {
    if (action === 'event') return step(direction);
    if (action === 'now') { jumpTo(epochNow()); return true; }
    return false;
  };
  surface.addEventListener('click', (event) => {
    const target = event.target;
    const stepButton = target.closest('[data-epoch-conj-step]');
    if (stepButton) return step(Number(stepButton.dataset.epochConjStep));
    const go = target.closest('[data-epoch-conj-go]');
    if (go) {
      const ut = Number(go.dataset.epochConjGo);
      stepped = epochAllPasses().find((entry) => entry.ut === ut) || null;
      return jumpTo(ut);
    }
    const sort = target.closest('[data-epoch-sort]');
    if (sort) {
      const key = sort.dataset.epochSort;
      const natural = key === 'date' && epochConj.when === 'past';
      const current = epochConj.sort.key === key ? (epochConj.sort.descending ?? natural) : null;
      epochConj.sort = { key, descending: current == null ? null : !current };
      return draw();
    }
    const when = target.closest('[data-epoch-when] button[data-value]');
    if (when) {
      epochConj.when = when.dataset.value;
      surface.querySelectorAll('[data-epoch-when] button').forEach((item) => item.classList.toggle('active', item === when));
      draw();
    }
  });
  surface.querySelector('[data-epoch-conj-planets]').addEventListener('change', (event) => { epochConj.planets = event.target.checked; draw(); });
  draw();
}
