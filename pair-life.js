// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The Pair Explorer's Life Events tab: the two charts' lives side by side, as one
// timeline running down the page — Chart A's column on the left, Chart B's on the right,
// and the date between them with both ages. Each column has that person's birth,
// annotated cycles and dated life events; an event they share spans both columns.
// Every entry opens in the Cycle Explorer for the person whose side it's on (a shared
// one, from either side), and a shared event can be added with both charts in it.

const pairLifeShow = { events: true, cycles: true, sharedOnly: false };
let pairLifeSort = acgStoredSetting("orbital-study-pair-life-sort", "asc") === "desc" ? "desc" : "asc";

// [{ key, sides: { a?, b? }, shared, date }] in time order: a record linked to both
// charts is one shared entry (matched by its stored record; birth records by chart).
// Every computed cycle moment is listed, annotated or not (the "Cycles" filter hides them).
function pairLifeEntries(chartA, chartB) {
  const entries = new Map();
  [["a", chartA], ["b", chartB]].forEach(([side, chart]) => {
    const cycles = CYCLE_DEFINITIONS.flatMap((cycleDef) => computeCycleOccurrences(chart, cycleDef).map((occurrence, index) => lifeCycleRecord(chart, cycleDef.key, index + 1)));
    [...chartRecordsWithBirth(chart), ...cycles].filter((record) => record?.start).forEach((record) => {
      const key = lifeStoredRecord(record)?.id || record.id;
      if (!entries.has(key)) entries.set(key, { key, sides: {}, date: lifeMomentRange(record, "start", chart).mid });
      if (!entries.get(key).sides[side]) entries.get(key).sides[side] = record;
    });
  });
  return [...entries.values()]
    .map((entry) => ({ ...entry, shared: !!(entry.sides.a && entry.sides.b) }))
    .sort((x, y) => x.date - y.date);
}
// Birth, a cycle, or a life event: what an entry is, for the filters.
function pairLifeKind(record) {
  return record.cycle ? "cycles" : "events";
}

function renderPairLifeEvents(surface, chartA, chartB) {
  surface.innerHTML = `
    <div class="pair-life">
      <div class="pair-life-toolbar">
        <span class="cycle-life-show">${[["events", "Life events"], ["cycles", "Cycles"], ["sharedOnly", "Shared only"]].map(([key, label]) =>
          `<label class="acg-filter"><input type="checkbox" data-pair-life-show="${key}" ${pairLifeShow[key] ? "checked" : ""}><span>${label}</span></label>`).join("")}</span>
        <span class="pair-life-count" data-pair-life-count></span>
        <button type="button" class="acg-origin-button" data-pair-life-sort></button>
        <button type="button" class="primary-button" data-pair-life-add>＋ Shared event</button>
      </div>
      <div class="pair-life-head">
        <span style="--pair-color:${PAIR_PEOPLE.A.color}"><i class="legend-dot"></i>CHART A · ${escapeHtml(chartA.name)}</span>
        <span>DATE · AGES</span>
        <span style="--pair-color:${PAIR_PEOPLE.B.color}"><i class="legend-dot"></i>CHART B · ${escapeHtml(chartB.name)}</span>
      </div>
      <ol class="pair-life-list" data-pair-life-list></ol>
    </div>`;
  const list = surface.querySelector("[data-pair-life-list]");
  const charts = { a: chartA, b: chartB };
  let shown = [];
  const age = (chart, date) => {
    const years = (date - chartBirthMomentUTC(chart)) / 60000 / CYCLE_YEAR_MINUTES;
    return years < 0 ? "—" : years.toFixed(1);
  };
  const cardMarkup = (entry, side) => {
    const record = entry.sides[side];
    const chart = charts[side];
    // Other people in it (besides these two).
    const others = record.people.filter((person) => person.chartId !== chartA.id && person.chartId !== chartB.id)
      .map((person) => (person.chartId ? chartById(person.chartId)?.name : person.name)).filter(Boolean);
    const kind = record.cycle ? "Cycle" : isBirthRecord(record) || record.anchor?.birth ? "Birth" : LIFE_EVENT_KIND_LABELS.get(record.kind) || "";
    const title = isBirthRecord(record) && entry.shared ? `${chart.name}'s birth` : lifeEventTitle(record);
    const meta = [
      record.end ? lifeWhenLabel(record) : "",
      record.place ? `⌖ ${escapeHtml(record.place.name || lifeUnnamedPlace(record.place))}` : "",
      others.length ? `with ${escapeHtml(others.join(", "))}` : "",
    ].filter(Boolean).join(" · ");
    return `<div class="pair-life-card">
      <div class="pair-life-title"><strong>${escapeHtml(title)}</strong>${kind && kind !== title ? `<span class="life-kind">${escapeHtml(kind)}</span>` : ""}${entry.shared ? `<span class="life-kind shared">Shared</span>` : ""}</div>
      ${meta ? `<div class="pair-life-meta">${meta}</div>` : ""}
      ${record.tags.length ? `<div class="life-tags">${record.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    </div>`;
  };
  const buttons = (entry, side, label = "↻ Open in Cycle Explorer") =>
    `<span class="pair-life-buttons"><button type="button" class="acg-origin-button" data-pair-life-open="${side}" data-pair-life-key="${escapeHtml(entry.key)}" title="Study this moment for ${escapeHtml(charts[side].name)}">${label}</button><button type="button" class="acg-origin-button" data-pair-life-edit="${side}" data-pair-life-key="${escapeHtml(entry.key)}">${entry.sides[side].anchor && !entry.sides[side].stored ? "Annotate" : "Edit"}</button></span>`;

  const draw = () => {
    const all = pairLifeEntries(chartA, chartB);
    shown = all.filter((entry) => {
      const record = entry.sides.a || entry.sides.b;
      if (pairLifeShow.sharedOnly && !entry.shared) return false;
      if (isBirthRecord(record) && !entry.shared) return true;
      return pairLifeShow[pairLifeKind(record)];
    });
    if (pairLifeSort === "desc") shown.reverse();
    const shared = all.filter((entry) => entry.shared).length;
    surface.querySelector("[data-pair-life-count]").textContent = `${shared} shared · ${all.length - shared} not shared`;
    const sort = surface.querySelector("[data-pair-life-sort]");
    sort.textContent = `Date ${pairLifeSort === "asc" ? "↑" : "↓"}`;
    sort.setAttribute("aria-label", `Sorted by date, ${pairLifeSort === "asc" ? "oldest" : "newest"} first; switch`);
    const now = Date.now();
    let nowShown = false;
    list.innerHTML = shown.map((entry) => {
      const crossed = pairLifeSort === "asc" ? entry.date.getTime() > now : entry.date.getTime() <= now;
      const marker = !nowShown && crossed ? (nowShown = true, `<li class="pair-life-now"><span>Today</span></li>`) : "";
      const record = entry.sides.a || entry.sides.b;
      const when = `<div class="pair-life-when"><strong>${lifeDateLabel(record.start.date)}</strong><small>${age(chartA, entry.date)} · ${age(chartB, entry.date)}</small></div>`;
      if (entry.shared) {
        // Across both columns: the date and each side's buttons, then the event.
        return `${marker}<li class="pair-life-item shared">
          <div class="pair-life-side a">${buttons(entry, "a", "↻ Cycle Explorer")}</div>
          ${when}
          <div class="pair-life-side b">${buttons(entry, "b", "↻ Cycle Explorer")}</div>
          <div class="pair-life-shared">${cardMarkup(entry, "a")}</div>
        </li>`;
      }
      const side = entry.sides.a ? "a" : "b";
      const content = `${cardMarkup(entry, side)}${buttons(entry, side)}`;
      return `${marker}<li class="pair-life-item">
        <div class="pair-life-side a">${side === "a" ? content : ""}</div>
        ${when}
        <div class="pair-life-side b">${side === "b" ? content : ""}</div>
      </li>`;
    }).join("") + (nowShown || !shown.length ? "" : `<li class="pair-life-now"><span>Today</span></li>`);
    if (!shown.length) list.innerHTML = `<li class="life-empty">Nothing to show with these filters.</li>`;
  };

  surface.querySelector(".cycle-life-show").addEventListener("change", (event) => {
    const key = event.target.dataset.pairLifeShow;
    if (!key) return;
    pairLifeShow[key] = event.target.checked;
    draw();
  });
  surface.querySelector("[data-pair-life-sort]").addEventListener("click", () => {
    pairLifeSort = pairLifeSort === "asc" ? "desc" : "asc";
    acgStoreSetting("orbital-study-pair-life-sort", pairLifeSort);
    draw();
  });
  surface.querySelector("[data-pair-life-add]").addEventListener("click", () =>
    openLifeEventDialog(chartA, null, { onSave: draw, withChartIds: [chartB.id] }),
  );
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pair-life-key]");
    if (!button) return;
    const side = button.dataset.pairLifeOpen || button.dataset.pairLifeEdit;
    const entry = shown.find((item) => item.key === button.dataset.pairLifeKey);
    const record = entry?.sides[side];
    if (!record) return;
    if (button.dataset.pairLifeEdit) openLifeEventDialog(charts[side], record, { onSave: draw });
    else pairOpenInCycleExplorer(charts[side], record);
  });
  draw();
}

// Studies `record`'s moment for `chart` in the Cycle Explorer (a period: its start).
function pairOpenInCycleExplorer(chart, record) {
  cycleChartId = chart.id;
  if (isBirthRecord(record)) {
    cycleEventAnchor = { birth: true };
  } else if (record.cycle) {
    activeCycleKey = record.anchor.cycle;
    activeOccurrenceIndex = record.anchor.n - 1;
    cycleEventAnchor = null;
  } else {
    cycleEventAnchor = { eventId: record.id, part: "start" };
  }
  setView("cycle");
}
