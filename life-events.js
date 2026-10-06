// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Life events: a chart's moments, periods and places (the record format and its
// cleaning are in app.js, sanitizeEvent). Records belong to a workspace
// (workspace.events) and link to one or more of its charts, so a shared event ("A and
// B met") is stored once and shows up for everyone in it. This file has the Chart
// Explorer's "Life Events" tab, the add/edit dialog, and the helpers the
// Astrocartography saved locations use (every record with a place is a location).

// Event types, grouped as they appear in the dialog.
const LIFE_EVENT_KINDS = [
  { group: "Personal", kinds: [["milestone", "Milestone"], ["achievement", "Achievement"], ["move", "Moved home"], ["travel", "Journey"], ["education-start", "Started studies"], ["graduation", "Graduated"], ["job-start", "Started a job"], ["job-end", "Left a job"], ["health", "Health event"], ["accident", "Accident"], ["spiritual", "Spiritual experience"], ["loss", "Loss"], ["decision", "Decision"], ["turning-point", "Turning point"]] },
  { group: "Relationships", kinds: [["met", "Met"], ["first-date", "First date"], ["relationship-start", "Began a relationship"], ["engaged", "Engaged"], ["married", "Married"], ["moved-in", "Moved in together"], ["separated", "Separated"], ["divorced", "Divorced"], ["reconciled", "Reconciled"], ["last-contact", "Last contact"]] },
  { group: "Family", kinds: [["became-parents", "Became parents"], ["birth", "A birth"], ["adoption", "Adoption"], ["death", "A death"], ["bereavement", "Bereavement"], ["family-reunion", "Family reunion"]] },
  { group: "Work & creativity", kinds: [["work-together", "Started working together"], ["founded", "Founded a business"], ["collaboration", "Collaboration"], ["mentorship-start", "Mentorship began"], ["mentorship-end", "Mentorship ended"], ["hired", "Hired"], ["project", "Project"]] },
  { group: "Shared experiences", kinds: [["travelled-together", "Travelled together"], ["lived-together", "Lived at the same place"], ["shared-crisis", "Shared crisis"], ["conflict", "Conflict"], ["conversation", "Turning-point conversation"], ["reunion", "Reunion"]] },
  { group: "Places", kinds: [["place", "Place of interest"], ["lived-here", "Lived here"], ["visited", "Visited"], ["considering", "Considering"]] },
  { group: "Other", kinds: [["other", "Other"]] },
];
const LIFE_EVENT_KIND_LABELS = new Map(LIFE_EVENT_KINDS.flatMap((group) => group.kinds));
// The starter tags (any other can be typed in).
const LIFE_EVENT_TAGS = [
  "career", "work", "money", "education", "creativity", "spirituality", "health", "body", "mind",
  "love", "relationship", "sexuality", "family", "children", "parents", "friendship", "community",
  "home", "move", "travel", "nature", "loss", "grief", "crisis", "conflict", "healing", "success",
  "milestone", "beginning", "ending", "transformation", "decision", "legal", "public", "private",
];
const LIFE_EVENT_ROLES = ["partner", "spouse", "parent", "child", "sibling", "grandparent", "grandchild", "relative", "friend", "mentor", "student", "colleague", "employer", "employee", "founder", "client", "witness"];
const LIFE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Records ─────────────────────────────────────────────────────────────
function workspaceOfChart(chartId) {
  return state.workspaces.find((workspace) => workspace.chartIds.includes(chartId)) || null;
}
// Every record linked to `chart`, in stored order. Annotations of computed moments
// come resolved (lifeResolveRecord): a cycle's annotation as a dated record, someone
// else's birth annotation as their birth; this chart's own birth annotation is folded
// into lifeBirthRecord instead.
function chartLifeEvents(chart) {
  const workspace = chart && workspaceOfChart(chart.id);
  if (!workspace) return [];
  return (workspace.events || [])
    .filter((event) => event.people.some((person) => person.chartId === chart.id))
    .filter((event) => !(event.anchor?.birth && event.anchor.chartId === chart.id))
    .map(lifeResolveRecord).filter(Boolean);
}
// The stored record behind a (possibly resolved) record, or null for an un-annotated
// computed moment.
function lifeStoredRecord(record) {
  if (!record) return null;
  return record.anchor || record.birth ? record.stored || null : record;
}
// Records with a place (dated or not), birth first: the chart's Astrocartography saved locations.
function chartPlaceRecords(chart) {
  return chartRecordsWithBirth(chart).filter((event) => event.place);
}
// Birth, as a record like any other, but computed from the chart's own birth data each
// time it's needed (never stored): its date, time and place always match the chart's,
// and can't be removed — only the chart can change them. It can be annotated (tags,
// notes, the people present), which is stored separately (an anchored record, found
// here and folded in as `stored`). Its id, "birth:<chart id>", can't clash with a
// stored one (":" is never in those). No place when the chart has no coordinates.
function lifeBirthRecord(chart) {
  if (!chart?.birthDate) return null;
  const coordinate = (value, limit) => {
    const number = value == null || value === "" ? NaN : Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
  };
  const lat = coordinate(chart.latitude, 90), lon = coordinate(chart.longitude, 180);
  const record = {
    id: `birth:${chart.id}`, birth: true, title: "Birth", kind: "",
    start: { date: chart.birthDate, time: chart.birthTime || "" },
    zone: chart.timezone || "", tags: [], notes: "",
    people: [{ chartId: chart.id, name: "", role: "" }],
    createdAt: 0, updatedAt: 0,
    anchor: { chartId: chart.id, birth: true }, stored: null,
  };
  if (chart.birthTime) record.exact = chartBirthMomentUTC(chart);
  if (lat != null && lon != null) record.place = { name: chart.location || "", lat, lon };
  const annotation = lifeFindAnnotation(chart, (anchor) => anchor.birth);
  if (annotation) Object.assign(record, { tags: annotation.tags, notes: annotation.notes, people: annotation.people, stored: annotation });
  return record;
}

// ── Annotations of computed moments ─────────────────────────────────────
// The stored annotation of one of `chart`'s computed moments (birth, or a cycle's nth
// occurrence), found by its anchor.
function lifeFindAnnotation(chart, matches) {
  const workspace = chart && workspaceOfChart(chart.id);
  return (workspace?.events || []).find((event) => event.anchor?.chartId === chart.id && matches(event.anchor)) || null;
}
function lifeCycleAnnotation(chart, cycleKey, n) {
  return lifeFindAnnotation(chart, (anchor) => anchor.cycle === cycleKey && anchor.n === n);
}
// A moment's date and time on the clock of `zone`, as a record date ("YYYY-MM-DD", "HH:MM").
function lifeLocalMoment(date, zone) {
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((part) => [part.type, part.value]));
  } catch {
    return lifeLocalMoment(date, "UTC");
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
// `chart`'s nth occurrence of a cycle (n from 1) as a record: dated to the computed
// moment (`exact`), with its annotation's place, tags and notes, if it has one. Its id
// is the annotation's, else "cycle:<chart>:<cycle>:<n>" (":" never clashes). Without
// that occurrence (the birth data changed), it's undated, titled "<cycle> #n".
function lifeCycleRecord(chart, cycleKey, n, annotation = lifeCycleAnnotation(chart, cycleKey, n)) {
  const cycleDef = CYCLE_DEFINITIONS.find((def) => def.key === cycleKey);
  if (!chart || !cycleDef) return null;
  const occurrence = computeCycleOccurrences(chart, cycleDef)[n - 1];
  const record = {
    id: annotation?.id || `cycle:${chart.id}:${cycleKey}:${n}`, cycle: true,
    anchor: { chartId: chart.id, cycle: cycleKey, n }, stored: annotation,
    title: occurrence ? `${cycleDef.label} ${occurrence.date.getFullYear()}` : `${cycleDef.label} #${n}`, kind: "",
    zone: chart.timezone || "UTC", tags: annotation?.tags || [], notes: annotation?.notes || "",
    people: [{ chartId: chart.id, name: "", role: "" }],
    createdAt: annotation?.createdAt || 0, updatedAt: annotation?.updatedAt || 0,
  };
  if (occurrence) { record.start = lifeLocalMoment(occurrence.date, record.zone); record.exact = occurrence.date; }
  if (annotation?.place) record.place = annotation.place;
  return record;
}
// A stored record as shown: an annotation becomes its moment's record (someone else's
// birth is titled with their name); anything else as it is.
function lifeResolveRecord(record) {
  if (!record?.anchor) return record;
  const owner = chartById(record.anchor.chartId);
  if (!owner) return null;
  if (record.anchor.cycle) return lifeCycleRecord(owner, record.anchor.cycle, record.anchor.n, record);
  const birth = lifeBirthRecord(owner);
  return birth && { ...birth, birth: false, id: record.id, title: `${owner.name}'s birth` };
}
function isBirthRecord(event) {
  return !!event?.birth;
}
// The chart's birth, then its stored records.
function chartRecordsWithBirth(chart) {
  const birth = lifeBirthRecord(chart);
  return birth ? [birth, ...chartLifeEvents(chart)] : chartLifeEvents(chart);
}
// A new place-only record for `chart` (from a map click or the map's place search).
function addPlaceRecord(chart, { lat, lon, name = "" }) {
  const workspace = workspaceOfChart(chart.id);
  if (!workspace) return null;
  // Without a name (a map click), it's titled after the nearest town (lifeNearestTitle) —
  // now if the gazetteer is loaded, else when it arrives (titleUntitledPlaces).
  const title = name || lifeNearestTitle({ lat, lon }) || "";
  const event = sanitizeEvent({ kind: "place", title, place: { name, lat, lon }, people: [{ chartId: chart.id }] }, new Set(workspace.chartIds));
  workspace.events = workspace.events || [];
  workspace.events.push(event);
  saveState();
  return event;
}
// "Lisbon, Portugal (1.0 km)": the place a spot is in or nearest to (acgNearestPlace:
// the most populous within 30 km, else the nearest), and how far. Null until the
// gazetteer (places.js) has loaded.
function lifeNearestTitle(place) {
  if (typeof placeIndex === "undefined" || !placeIndex) return null;
  const nearest = acgNearestPlace(place.lat, place.lon);
  return nearest ? `${placeLabel(nearest.place)} (${acgKm(nearest.km)})` : null;
}
// Places without a title (map clicks, and locations saved before life events) get one
// from lifeNearestTitle, in every workspace. Returns how many changed.
function untitledPlaceRecords() {
  return state.workspaces.flatMap((workspace) => (workspace.events || []).filter((event) =>
    !event.anchor && !event.title && event.place && (!event.kind || LIFE_PLACE_KINDS.has(event.kind))));
}
function titleUntitledPlaces() {
  let changed = 0;
  untitledPlaceRecords().forEach((event) => {
    const title = lifeNearestTitle(event.place);
    if (title) { event.title = title; event.updatedAt = Date.now(); changed += 1; }
  });
  if (changed) saveState();
  return changed;
}
// Takes `chart` out of the record; the record goes when nobody's left in it.
function removeChartFromRecord(chart, record) {
  const workspace = workspaceOfChart(chart.id);
  const event = lifeStoredRecord(record);
  if (!workspace || !event) return;
  event.people = event.people.filter((person) => person.chartId !== chart.id);
  if (!event.people.some((person) => person.chartId)) workspace.events = workspace.events.filter((item) => item !== event);
  saveState();
}
// Asks first (naming anyone else it's shared with), then deletes. Returns whether it did.
function confirmDeleteRecord(chart, record) {
  // An annotation: only the notes go, the computed moment stays.
  if (record.anchor || record.birth) {
    const stored = lifeStoredRecord(record);
    if (!stored || !window.confirm(`Remove the notes on “${lifeEventTitle(record)}”? The moment itself stays.`)) return false;
    deleteRecord(chart, stored);
    showToast("Annotation removed");
    return true;
  }
  const others = record.people.filter((person) => person.chartId && person.chartId !== chart.id).map((person) => chartById(person.chartId)?.name).filter(Boolean);
  const question = others.length
    ? `Delete “${lifeEventTitle(record)}” for everyone in it? It's shared with ${others.join(", ")}.\n\n(To take only ${chart.name} out of it, edit it instead.)`
    : `Delete “${lifeEventTitle(record)}”?`;
  if (!window.confirm(question)) return false;
  deleteRecord(chart, record);
  showToast("Record deleted");
  return true;
}
function deleteRecord(chart, event) {
  const workspace = workspaceOfChart(chart.id);
  if (!workspace) return;
  workspace.events = workspace.events.filter((item) => item !== event);
  saveState();
}

// "12 May 1990", "May 1990" or "1990", from a record date.
function lifeDateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  return [day, month ? LIFE_MONTHS[month - 1] : "", year].filter(Boolean).join(" ");
}
function lifeWhenLabel(event) {
  if (!event.start) return "";
  const start = lifeDateLabel(event.start.date);
  return event.end ? `${start} – ${lifeDateLabel(event.end.date)}` : start;
}
// Its title; else, for an event, its type; for a place, the place's name (or coordinates).
const LIFE_PLACE_KINDS = new Set(LIFE_EVENT_KINDS.find((group) => group.group === "Places").kinds.map(([key]) => key));
function lifeEventTitle(event) {
  if (event.title) return event.title;
  const kind = LIFE_EVENT_KIND_LABELS.get(event.kind);
  if (kind && !LIFE_PLACE_KINDS.has(event.kind)) return kind;
  if (event.place) return event.place.name || lifeUnnamedPlace(event.place);
  return kind || "Untitled";
}
// An unnamed place (saved from a map click): the place it's in or near, else coordinates.
function lifeUnnamedPlace(place) {
  const nearest = typeof acgNearestPlace === "function" ? acgNearestPlace(place.lat, place.lon) : null;
  const coordinates = `${acgCoordinate(place.lat, "N", "S")}, ${acgCoordinate(place.lon, "E", "W")}`;
  return nearest ? `${nearest.km <= ACG_CITY_RADIUS_KM ? "" : "Near "}${placeLabel(nearest.place)}` : coordinates;
}
// Dated records first, in time order (an undated place sorts after them, by when it was added).
function lifeEventOrder(a, b) {
  if (!a.start !== !b.start) return a.start ? -1 : 1;
  if (a.start && b.start) {
    const keyA = `${a.start.date}T${a.start.time}`, keyB = `${b.start.date}T${b.start.time}`;
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

// ── The Life Events tab ─────────────────────────────────────────────────
// Remembered while the app is open.
const lifeEventsFilter = { show: "all", query: "", tag: "" };
function renderLifeEventsPanel(container, chart) {
  if (!chart || explorerMode !== "chart") {
    container.innerHTML = `<div class="life-events"><p class="life-empty">Life events belong to a chart. Open one from the library to see and add its events.</p></div>`;
    return;
  }
  const workspace = workspaceOfChart(chart.id);
  container.innerHTML = `
    <div class="life-events">
      <div class="life-toolbar">
        <div class="segmented" data-life-show>${[["all", "All"], ["events", "Events"], ["places", "Places"], ["tags", "By tag"]].map(([key, label]) => `<button type="button" data-value="${key}" class="${lifeEventsFilter.show === key ? "active" : ""}">${label}</button>`).join("")}</div>
        <input type="search" class="life-search" data-life-query placeholder="Search titles, places, people, tags, notes…" aria-label="Search life events" value="${escapeHtml(lifeEventsFilter.query)}">
        <select class="life-tag-filter" data-life-tag aria-label="Filter by tag"></select>
        <span class="life-toolbar-actions">
          <button type="button" class="primary-button" data-life-add>＋ Add</button>
        </span>
      </div>
      <p class="life-count" data-life-count></p>
      <ol class="life-list" data-life-list></ol>
    </div>`;
  const list = container.querySelector("[data-life-list]");
  const draw = () => {
    const stored = chartLifeEvents(chart);
    const events = chartRecordsWithBirth(chart).sort(lifeEventOrder);
    const tags = [...new Set(events.flatMap((event) => event.tags))].sort();
    const byTag = lifeEventsFilter.show === "tags";
    container.querySelector("[data-life-query]").hidden = byTag;
    container.querySelector("[data-life-tag]").hidden = byTag;
    if (byTag) {
      drawTags(events);
      return;
    }
    if (lifeEventsFilter.tag && !tags.includes(lifeEventsFilter.tag)) lifeEventsFilter.tag = "";
    container.querySelector("[data-life-tag]").innerHTML = `<option value="">All tags</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${tag === lifeEventsFilter.tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}`;
    const query = lifeEventsFilter.query.trim();
    const shown = events.filter((event) => {
      if (lifeEventsFilter.show === "events" && !event.start) return false;
      if (lifeEventsFilter.show === "places" && !event.place) return false;
      if (lifeEventsFilter.tag && !event.tags.includes(lifeEventsFilter.tag)) return false;
      if (!query) return true;
      const people = event.people.map((person) => (person.chartId ? chartById(person.chartId)?.name : person.name) || "");
      return searchMatches([lifeEventTitle(event), event.place?.name, event.notes, ...event.tags, ...people, LIFE_EVENT_KIND_LABELS.get(event.kind)], query);
    });
    container.querySelector("[data-life-count]").textContent = events.length
      ? `${shown.length === events.length ? events.length : `${shown.length} of ${events.length}`} record${events.length === 1 ? "" : "s"}`
      : "";
    list.innerHTML = (shown.length ? shown.map((event) => lifeEventItemMarkup(event, chart)).join("") : `<li class="life-empty">No records match.</li>`)
      + (stored.length ? "" : `<li class="life-empty">No other life events yet. Add moments, periods and places that matter — alone or shared with other charts in this workspace — to study them against the charts. Places saved on the Astrocartography map appear here too.</li>`);
  };
  // By tag: the tags as chips; for the chosen one, what recurs across its dated moments,
  // then each moment with its tight transits (life-patterns.js).
  const drawTags = (events) => {
    const counts = lifeTagCounts(events);
    if (lifeEventsFilter.tag && !counts.some(([tag]) => tag === lifeEventsFilter.tag)) lifeEventsFilter.tag = "";
    const tag = lifeEventsFilter.tag;
    const tagged = events.filter((event) => event.tags.includes(tag));
    container.querySelector("[data-life-count]").textContent = counts.length ? `${counts.length} tag${counts.length === 1 ? "" : "s"}` : "";
    const chips = counts.length
      ? `<li class="life-tag-chips">${counts.map(([name, n]) => `<button type="button" class="life-tag-chip${name === tag ? " active" : ""}" data-life-tag-pick="${escapeHtml(name)}" aria-pressed="${name === tag}">${escapeHtml(name)} <small>${n}</small></button>`).join("")}</li>`
      : `<li class="life-empty">No record has a tag yet. Tag life events (and annotated cycles or Birth) — career, love, move… — to see what the moments with the same tag have in common.</li>`;
    if (!tag) {
      list.innerHTML = chips + (counts.length ? `<li class="life-empty">Choose a tag to see its moments side by side, and the transits that recur among them.</li>` : "");
      return;
    }
    list.innerHTML = `${chips}
      <li class="life-pattern-panel">
        <div class="system-toolbar"><span class="eyebrow">RECURRING TRANSITS · ${escapeHtml(tag.toUpperCase())}</span>${lifePatternControlsMarkup()}</div>
        ${lifeTagPatternsMarkup(chart, tagged, tag)}
        <p class="cycle-summary-foot">${LIFE_PATTERN_FOOT}</p>
      </li>
      ${tagged.map((event) => `<li class="life-tag-moment" data-life-id="${escapeHtml(event.id)}">
        <div class="life-when">${event.start ? `<strong>${lifeWhenLabel(event)}</strong>` : "<strong>Place</strong><small>No date</small>"}</div>
        <div class="life-main"><div class="life-title"><strong>${escapeHtml(lifeEventTitle(event))}</strong></div><div class="life-transits">${lifeMomentTransitsMarkup(chart, event)}</div></div>
        <div class="life-actions">${event.start ? `<button type="button" class="acg-origin-button" data-life-open title="Study this moment in the Cycle Explorer">↻ Cycle Explorer</button>` : ""}<button type="button" class="acg-origin-button" data-life-edit>Edit</button></div>
      </li>`).join("")}`;
  };
  container.querySelector("[data-life-show]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    lifeEventsFilter.show = button.dataset.value;
    container.querySelectorAll("[data-life-show] button").forEach((item) => item.classList.toggle("active", item === button));
    draw();
  });
  container.querySelector("[data-life-query]").addEventListener("input", (event) => { lifeEventsFilter.query = event.target.value; draw(); });
  container.querySelector("[data-life-tag]").addEventListener("change", (event) => { lifeEventsFilter.tag = event.target.value; draw(); });
  container.querySelectorAll("[data-life-add]").forEach((button) =>
    button.addEventListener("click", () => openLifeEventDialog(chart, null, { onSave: draw })),
  );
  list.addEventListener("change", (event) => {
    if (!event.target.matches("[data-life-pattern-fast]")) return;
    lifePatternOptions.includeFast = event.target.checked;
    draw();
  });
  list.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-life-tag-pick]");
    if (pick) {
      lifeEventsFilter.tag = pick.dataset.lifeTagPick === lifeEventsFilter.tag ? "" : pick.dataset.lifeTagPick;
      draw();
      return;
    }
    const edit = event.target.closest("[data-life-edit]");
    const remove = event.target.closest("[data-life-delete]");
    const open = event.target.closest("[data-life-open]");
    const record = chartRecordsWithBirth(chart).find((item) => item.id === (edit || remove || open)?.closest("[data-life-id]")?.dataset.lifeId);
    if (!record) return;
    if (open) openInCycleExplorer(chart, record);
    if (edit) openLifeEventDialog(chart, record, { onSave: draw });
    if (remove && confirmDeleteRecord(chart, record)) draw();
  });
  // Unnamed places are titled by the nearest town, known once places.js has loaded.
  window.addEventListener("orbital-places-loaded", () => { if (list.isConnected) draw(); });
  draw();
}
function lifeEventItemMarkup(event, chart) {
  const kind = LIFE_EVENT_KIND_LABELS.get(event.kind);
  const self = event.people.find((person) => person.chartId === chart.id);
  const others = event.people.filter((person) => person !== self).map((person) => {
    const name = person.chartId ? escapeHtml(chartById(person.chartId)?.name || "") : `<i title="No chart for this person in this workspace">${escapeHtml(person.name)}</i>`;
    return `${name}${person.role ? ` <small>(${escapeHtml(person.role)})</small>` : ""}`;
  });
  const time = event.start?.time ? `${event.start.time}${event.zone ? ` · ${escapeHtml(event.zone)}` : ""}` : event.start ? `${event.start.date.length === 10 ? "Date only" : event.start.date.length === 7 ? "Month only" : "Year only"}` : "";
  // The place line: its name, else its coordinates (an unnamed place's title already names what's near it).
  const coordinates = event.place ? `${acgCoordinate(event.place.lat, "N", "S")}, ${acgCoordinate(event.place.lon, "E", "W")}` : "";
  // (Left out when the title is already the place's name.)
  const placeText = event.place ? event.place.name || coordinates : "";
  const place = placeText && placeText !== lifeEventTitle(event) ? `<span>⌖ ${escapeHtml(placeText)}</span>` : "";
  const birth = isBirthRecord(event);
  // Birth and cycles are computed: their date (and birth's place) come from the chart;
  // Edit annotates them, and × only removes the annotation.
  const computed = !!event.anchor;
  const fixed = computed ? `<span class="life-fixed" title="${birth || event.anchor.birth ? "Birth follows the chart's birth data: edit the chart to change it" : "Computed from the chart: its date can't change"}">${event.cycle ? "Cycle" : "From the chart"}</span>` : "";
  const removable = !computed || event.stored;
  const actions = `${fixed}<button type="button" class="acg-origin-button" data-life-edit>${computed && !event.stored ? "Annotate" : "Edit"}</button>
      ${removable ? `<button type="button" class="acg-location-remove" data-life-delete aria-label="${computed ? "Remove the notes on" : "Delete"} ${escapeHtml(lifeEventTitle(event))}" title="${computed ? "Remove annotation" : "Delete"}">×</button>` : ""}`;
  return `<li class="life-item${event.start ? "" : " place-only"}${birth ? " birth" : ""}" data-life-id="${escapeHtml(event.id)}">
    <div class="life-when">${event.start ? `<strong>${lifeWhenLabel(event)}</strong><small>${time}</small>` : `<strong>Place</strong><small>No date</small>`}</div>
    <div class="life-main">
      <div class="life-title"><strong>${escapeHtml(lifeEventTitle(event))}</strong>${kind && event.title && kind !== event.title ? `<span class="life-kind">${escapeHtml(kind)}</span>` : ""}${event.end ? `<span class="life-kind">Period</span>` : ""}</div>
      <div class="life-meta">${place}${self?.role ? `<span>as ${escapeHtml(self.role)}</span>` : ""}${others.length ? `<span>with ${others.join(", ")}</span>` : ""}</div>
      ${event.tags.length ? `<div class="life-tags">${event.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${event.notes ? `<p class="life-notes">${escapeHtml(event.notes)}</p>` : ""}
    </div>
    <div class="life-actions">
      ${actions}
    </div>
  </li>`;
}

// ── The add / edit dialog ───────────────────────────────────────────────
function lifeMomentFieldsMarkup(prefix, legend) {
  return `<fieldset class="life-moment" data-life-moment="${prefix}">
    <legend>${legend}</legend>
    <label>Year<input name="${prefix}Year" type="number" min="1000" max="2999" inputmode="numeric" placeholder="e.g. 1998"></label>
    <label>Month<select name="${prefix}Month"><option value="">—</option>${LIFE_MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join("")}</select></label>
    <label>Day<input name="${prefix}Day" type="number" min="1" max="31" inputmode="numeric" placeholder="—"></label>
    <label>Time<input name="${prefix}Time" type="time" aria-label="Time (optional)"></label>
  </fieldset>`;
}
function lifeDialog() {
  let dialog = document.getElementById("lifeEventDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "lifeEventDialog";
  dialog.className = "life-dialog";
  dialog.innerHTML = `<form id="lifeEventForm" method="dialog" novalidate>
    <div class="dialog-head"><div><p class="eyebrow accent-label" data-life-eyebrow>LIFE EVENT</p><h2 data-life-heading>Add an event</h2></div><button type="button" class="close-button" data-life-cancel aria-label="Close">×</button></div>
    <div class="form-grid">
      <p class="wide-field life-annotation-note" data-life-annotation hidden></p>
      <label class="wide-field">Title<input name="title" maxlength="120" placeholder="What happened, or what this place is"></label>
      <label>Type<select name="kind"><option value="">—</option>${LIFE_EVENT_KINDS.map((group) => `<optgroup label="${group.group}">${group.kinds.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <label>When<select name="when"><option value="moment">A moment</option><option value="period">A period</option><option value="none">No date (a place)</option></select></label>
      <div class="wide-field" data-life-dates>
        ${lifeMomentFieldsMarkup("start", "Date")}
        ${lifeMomentFieldsMarkup("end", "Until")}
        <small class="life-hint">Leave the day, the month or the time empty when you don't know them. Without an exact time, the planets' positions are approximate and houses and angles aren't shown.</small>
      </div>
      <label class="wide-field">Place<input name="location" placeholder="Search a city or town, or leave empty" autocomplete="off"></label>
      <label>Latitude<input name="latitude" inputmode="decimal" placeholder="e.g. 38.7223"></label>
      <label>Longitude<input name="longitude" inputmode="decimal" placeholder="e.g. -9.1393"></label>
      <label class="wide-field" data-life-zone>Time zone <small>for the time of day</small><select name="timezone"></select></label>
      <div class="wide-field life-people"><span class="life-field-label">People</span><div data-life-people></div>
        <label class="life-inline">Someone without a chart here<input name="personName" maxlength="120" placeholder="Name, then press Add"><button type="button" class="secondary-button" data-life-add-person>Add</button></label>
      </div>
      <div class="wide-field life-tag-picker"><span class="life-field-label">Tags</span><div data-life-tags></div>
        <label class="life-inline">Other tags<input name="customTags" placeholder="comma-separated"></label>
      </div>
      <label class="wide-field">Notes<textarea name="notes" rows="4" maxlength="5000"></textarea></label>
    </div>
    <div class="dialog-actions"><button type="button" class="text-button life-dialog-delete" data-life-dialog-delete hidden>Delete record…</button><button type="button" class="secondary-button" data-life-cancel>Cancel</button><button class="primary-button" type="submit">Save <span>→</span></button></div>
  </form>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll("[data-life-cancel]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  bindPlaceSearch(dialog.querySelector('input[name="location"]'));
  bindRoleSuggestions(dialog.querySelector("[data-life-people]"));
  return dialog;
}
// Suggested roles under any role field in `box` (the app's own list: the browser's
// <datalist> popup lands far from its field inside a scrolling dialog). The fields are
// redrawn often, so one list is moved to whichever field is in use.
function bindRoleSuggestions(box) {
  const list = document.createElement("div");
  list.className = "place-results life-role-results";
  list.id = "lifeRoleResults";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  let input = null, options = [], active = -1;
  const close = () => {
    list.hidden = true;
    input?.setAttribute("aria-expanded", "false");
    input?.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const highlight = (index) => {
    active = index;
    list.querySelectorAll("[role=option]").forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) { input.setAttribute("aria-activedescendant", `lifeRole-${index}`); list.children[index]?.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const open = (field) => {
    input = field;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    const term = input.value.trim().toLowerCase();
    options = LIFE_EVENT_ROLES.filter((role) => role.startsWith(term)).concat(LIFE_EVENT_ROLES.filter((role) => !role.startsWith(term) && term && role.includes(term)));
    if (!options.length || (options.length === 1 && options[0] === term)) return close();
    list.innerHTML = options.map((role, index) => `<div class="place-option" role="option" id="lifeRole-${index}" aria-selected="false" data-index="${index}">${role}</div>`).join("");
    input.insertAdjacentElement("afterend", list);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight(-1);
  };
  const choose = (role) => {
    input.value = role;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  };
  box.addEventListener("focusin", (event) => { if (event.target.matches("[data-life-role]")) open(event.target); });
  box.addEventListener("input", (event) => { if (event.target.matches("[data-life-role]") && event.isTrusted) open(event.target); });
  box.addEventListener("focusout", (event) => { if (event.target === input) close(); });
  box.addEventListener("keydown", (event) => {
    if (event.target !== input || list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      highlight(event.key === "ArrowDown" ? (active + 1) % options.length : (active - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // closes the list, not the dialog
      close();
    }
  });
  // mousedown (not click) so choosing happens before the field loses focus.
  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const option = event.target.closest("[data-index]");
    if (option) choose(options[Number(option.dataset.index)]);
  });
}
// `event` null adds a new record: a moment, until "When" says otherwise. A computed
// moment (birth, a cycle: `event.anchor`) is annotated instead: its date (and birth's
// place) stay locked, and only what it can hold is shown — a cycle's place, tags and
// notes; birth's tags, notes and people. Saving an empty annotation clears it.
// `draft` (a new record only): fields to start from — { title, start, zone, place, instant },
// e.g. the Cycle Explorer's "now". With its exact `instant`, changing the time zone (or
// choosing a place, which sets it) re-expresses the date and time on the new zone's
// clock, so the record keeps meaning the same moment.
function openLifeEventDialog(chart, event, { onSave, withChartIds = [], draft = null } = {}) {
  const dialog = lifeDialog();
  const form = dialog.querySelector("form");
  const workspace = workspaceOfChart(chart.id);
  form.reset();
  const anchor = event?.anchor || null;
  const stored = anchor ? event.stored || null : event;
  const source = event || draft;
  const show = (element, visible) => { if (element) element.hidden = !visible; };
  const field = (name) => form.elements[name].closest("label");
  // An annotation's computed fields (title, date, time zone, and birth's place) are shown
  // but disabled; a cycle has no people.
  const lockedFields = anchor ? ["title", "kind", "when", "startYear", "startMonth", "startDay", "startTime", "timezone", ...(anchor.birth ? ["location", "latitude", "longitude"] : [])] : [];
  ["title", "kind", "when", "startYear", "startMonth", "startDay", "startTime", "endYear", "endMonth", "endDay", "endTime", "timezone", "location", "latitude", "longitude"]
    .forEach((name) => { form.elements[name].disabled = lockedFields.includes(name); });
  show(dialog.querySelector(".life-people"), !anchor?.cycle);
  show(dialog.querySelector(".life-hint"), !anchor);
  const note = dialog.querySelector("[data-life-annotation]");
  show(note, !!anchor);
  if (anchor) {
    const owner = chartById(anchor.chartId);
    note.innerHTML = `<strong>${escapeHtml(lifeEventTitle(event))}</strong> · ${event.start ? `${lifeWhenLabel(event)}${event.start.time ? ` · ${event.start.time} ${escapeHtml(event.zone || "")}` : ""}` : "not computed"}${anchor.birth && event.place?.name ? ` · ⌖ ${escapeHtml(event.place.name)}` : ""}<br><small>${anchor.birth ? `Computed from ${escapeHtml(owner?.name || "the chart")}'s birth data, which only editing the chart changes.` : "Computed from the chart: its date is fixed. Add where you were, tags and notes."}</small>`;
  }
  const heading = dialog.querySelector("[data-life-heading]");
  const set = (name, value) => { form.elements[name].value = value ?? ""; };
  const setMoment = (prefix, moment) => {
    const [year, month, day] = moment ? moment.date.split("-") : [];
    set(`${prefix}Year`, year);
    set(`${prefix}Month`, month ? String(Number(month)) : "");
    set(`${prefix}Day`, day ? String(Number(day)) : "");
    set(`${prefix}Time`, moment?.time);
  };
  set("title", source?.title);
  set("kind", source?.kind);
  set("when", source ? (source.start ? (source.end ? "period" : "moment") : "none") : "moment");
  setMoment("start", source?.start);
  setMoment("end", source?.end);
  set("location", source?.place?.name);
  set("latitude", source?.place ? String(source.place.lat) : "");
  set("longitude", source?.place ? String(source.place.lon) : "");
  form.elements.timezone.innerHTML = timezoneOptionsMarkup(source?.zone || chart.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  set("notes", source?.notes);
  // A draft's exact moment follows the time zone, while its date and time are untouched.
  const startFields = () => ["Year", "Month", "Day", "Time"].map((part) => form.elements[`start${part}`].value).join("|");
  let converted = draft?.instant && draft.start ? (setMoment("start", draft.start), startFields()) : null;
  form.elements.timezone.onchange = () => {
    if (!converted || startFields() !== converted) return;
    const moment = lifeLocalMoment(draft.instant, form.elements.timezone.value);
    setMoment("start", moment);
    converted = startFields();
    showToast(`Time shown on the ${form.elements.timezone.value} clock: ${moment.time}, the same moment`);
  };
  if (anchor) set("title", lifeEventTitle(event));

  // People: every chart in the workspace (this one always in), each with a role, then
  // anyone kept by name only.
  // (A new record can start with other charts in it too: `withChartIds`, e.g. the Pair Explorer's shared event.)
  const people = new Map((event?.people || [chart.id, ...withChartIds].map((chartId) => ({ chartId, name: "", role: "" }))).map((person) => [person.chartId || `name:${person.name}`, { ...person }]));
  const self = anchor?.chartId || chart.id;
  if (!people.has(self)) people.set(self, { chartId: self, name: "", role: "" });
  const peopleBox = dialog.querySelector("[data-life-people]");
  const drawPeople = () => {
    const charts = workspace.chartIds.map(chartById).filter(Boolean);
    peopleBox.innerHTML = `${charts.map((other) => {
      const person = people.get(other.id);
      return `<div class="life-person"><label><input type="checkbox" data-life-person="${escapeHtml(other.id)}" ${person ? "checked" : ""} ${other.id === self ? "disabled" : ""}> ${escapeHtml(other.name)}</label><input placeholder="role" autocomplete="off" aria-label="Role of ${escapeHtml(other.name)}" data-life-role="${escapeHtml(other.id)}" value="${escapeHtml(person?.role || "")}" ${person ? "" : "disabled"}></div>`;
    }).join("")}${[...people.values()].filter((person) => !person.chartId).map((person) =>
      `<div class="life-person unlinked"><span><i>${escapeHtml(person.name)}</i> <small>no chart here</small></span><input placeholder="role" autocomplete="off" aria-label="Role of ${escapeHtml(person.name)}" data-life-role="name:${escapeHtml(person.name)}" value="${escapeHtml(person.role || "")}"><button type="button" class="acg-location-remove" data-life-remove-person="name:${escapeHtml(person.name)}" aria-label="Remove ${escapeHtml(person.name)}">×</button></div>`).join("")}`;
  };
  drawPeople();
  peopleBox.onchange = (change) => {
    const box = change.target.closest("[data-life-person]");
    if (!box) return;
    if (box.checked) people.set(box.dataset.lifePerson, { chartId: box.dataset.lifePerson, name: "", role: "" });
    else people.delete(box.dataset.lifePerson);
    drawPeople();
  };
  peopleBox.oninput = (input) => {
    const role = input.target.closest("[data-life-role]");
    if (role && people.has(role.dataset.lifeRole)) people.get(role.dataset.lifeRole).role = role.value;
  };
  peopleBox.onclick = (click) => {
    const remove = click.target.closest("[data-life-remove-person]");
    if (remove) { people.delete(remove.dataset.lifeRemovePerson); drawPeople(); }
  };
  const addPerson = () => {
    const name = form.elements.personName.value.trim();
    if (name && !people.has(`name:${name}`)) people.set(`name:${name}`, { chartId: null, name, role: "" });
    form.elements.personName.value = "";
    drawPeople();
  };
  dialog.querySelector("[data-life-add-person]").onclick = addPerson;
  form.elements.personName.onkeydown = (key) => { if (key.key === "Enter") { key.preventDefault(); addPerson(); } };

  // Tags: the starter set plus any used in this workspace.
  const used = (workspace.events || []).flatMap((item) => item.tags);
  const allTags = [...new Set([...LIFE_EVENT_TAGS, ...used])];
  const chosen = new Set(event?.tags || []);
  dialog.querySelector("[data-life-tags]").innerHTML = allTags.map((tag) => `<label class="life-tag-choice"><input type="checkbox" value="${escapeHtml(tag)}" ${chosen.has(tag) ? "checked" : ""}><span>${escapeHtml(tag)}</span></label>`).join("");

  // "When" decides what's being added: the heading follows it, and an untyped record
  // becomes a place of interest when it has no date.
  const syncWhen = () => {
    const when = form.elements.when.value;
    heading.textContent = `${event ? "Edit" : "Add"} ${when === "none" ? "a place" : when === "period" ? "a period" : "an event"}`;
    if (anchor) {
      heading.textContent = stored ? "Edit annotation" : "Annotate";
      dialog.querySelector("[data-life-dates]").hidden = !event.start;
      dialog.querySelector('[data-life-moment="end"]').hidden = true;
      return;
    }
    if (when === "none" && !form.elements.kind.value) set("kind", "place");
    if (when !== "none" && form.elements.kind.value === "place" && !event) set("kind", "");
    dialog.querySelector("[data-life-dates]").hidden = when === "none";
    dialog.querySelector('[data-life-moment="end"]').hidden = when !== "period";
    dialog.querySelector('[data-life-moment="start"] legend').textContent = when === "period" ? "From" : "Date";
  };
  form.elements.when.onchange = syncWhen;
  syncWhen();

  // Deleting lives here, behind Edit and a confirmation, not one click away in a list.
  const remove = dialog.querySelector("[data-life-dialog-delete]");
  remove.hidden = !stored;
  remove.textContent = anchor ? "Remove annotation…" : "Delete record…";
  remove.onclick = () => {
    if (!stored || !confirmDeleteRecord(chart, event)) return;
    dialog.close();
    onSave?.(null);
  };
  const readTags = () => [...dialog.querySelectorAll("[data-life-tags] input:checked")].map((box) => box.value)
    .concat(form.elements.customTags.value.split(",").map((tag) => tag.trim()).filter(Boolean));
  const saveAnnotation = () => {
    const lat = form.elements.latitude.value.trim(), lon = form.elements.longitude.value.trim();
    let place = null;
    if (anchor.cycle && (lat !== "" || lon !== "")) {
      if (!(Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180 && lat !== "" && lon !== "")) return showToast("Latitude must be between −90 and 90, and longitude between −180 and 180");
      place = { name: form.elements.location.value.trim(), lat, lon };
    }
    const tags = readTags(), notes = form.elements.notes.value;
    const list = anchor.birth ? [...people.values()] : [];
    const empty = !place && !tags.length && !notes.trim() && !list.some((person) => person.chartId !== self || person.role);
    workspace.events = workspace.events || [];
    const index = stored ? workspace.events.indexOf(stored) : -1;
    if (empty) {
      if (index >= 0) workspace.events.splice(index, 1);
      saveState();
      dialog.close();
      onSave?.(null);
      if (index >= 0) showToast("Annotation cleared");
      return;
    }
    const cleaned = sanitizeEvent({ id: stored?.id, anchor, place, tags, notes, people: list, createdAt: stored?.createdAt, updatedAt: Date.now() }, new Set(workspace.chartIds));
    if (!cleaned) return showToast("This moment's chart isn't in this workspace");
    if (index >= 0) workspace.events[index] = cleaned;
    else workspace.events.push(cleaned);
    saveState();
    dialog.close();
    onSave?.(cleaned);
    showToast(stored ? "Annotation updated" : "Annotation added");
  };
  form.onsubmit = (submit) => {
    submit.preventDefault();
    if (anchor) return saveAnnotation();
    const when = form.elements.when.value;
    const readMoment = (prefix) => {
      const year = form.elements[`${prefix}Year`].value.trim();
      if (!year) return null;
      const month = form.elements[`${prefix}Month`].value;
      const day = month ? form.elements[`${prefix}Day`].value.trim() : "";
      const date = [year.padStart(4, "0"), month && month.padStart(2, "0"), day && day.padStart(2, "0")].filter(Boolean).join("-");
      return { date, time: day ? form.elements[`${prefix}Time`].value : "" };
    };
    const start = when === "none" ? null : readMoment("start");
    const end = when === "period" ? readMoment("end") : null;
    if (when !== "none" && !start) return showToast("Enter at least the year");
    if (when === "period" && !end) return showToast("Enter when the period ended (at least the year)");
    const lat = form.elements.latitude.value.trim(), lon = form.elements.longitude.value.trim();
    if ((lat !== "" || lon !== "") && !(Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180 && lat !== "" && lon !== "")) return showToast("Latitude must be between −90 and 90, and longitude between −180 and 180");
    const place = lat !== "" && lon !== "" ? { name: form.elements.location.value.trim(), lat, lon } : null;
    if (when === "none" && !place) return showToast("Choose a place, or enter its latitude and longitude");
    const tags = readTags();
    const raw = {
      id: event?.id,
      title: form.elements.title.value,
      kind: form.elements.kind.value,
      start, end,
      zone: form.elements.timezone.value,
      place, tags,
      notes: form.elements.notes.value,
      people: [...people.values()],
      createdAt: event?.createdAt,
      updatedAt: Date.now(),
    };
    const cleaned = sanitizeEvent(raw, new Set(workspace.chartIds));
    if (!cleaned) return showToast("Check the date: that day doesn't exist, or the year is outside 1000–2999");
    if (start && !cleaned.start) return showToast("Check the date");
    if (end && !cleaned.end) return showToast("The period has to end after it starts");
    workspace.events = workspace.events || [];
    const index = event ? workspace.events.indexOf(event) : -1;
    if (index >= 0) workspace.events[index] = cleaned;
    else workspace.events.push(cleaned);
    saveState();
    dialog.close();
    onSave?.(cleaned);
    showToast(event ? "Record updated" : "Record added");
  };
  dialog.showModal();
  (anchor ? form.elements.notes : form.elements.title).focus();
}

// ── Moments in time (Cycle Explorer) ────────────────────────────────────
// An event's date as a UTC range: the whole day, month or year it could be (or the
// exact minute when it has a time), converted with the event's time zone the same way
// birth times are (chartBirthMomentUTC: historical zones, local mean time). `mid` is
// the moment used for it: the exact time, else noon, mid-month or mid-year.
function lifeMomentRange(event, part, chart) {
  const moment = part === "end" ? event.end : event.start;
  if (!moment) return null;
  // A computed moment (birth with a time, a cycle) is exact.
  if (event.exact && part !== "end") return { from: event.exact, to: event.exact, mid: event.exact, precision: "time" };
  const toUTC = (date, time) => chartBirthMomentUTC({
    birthDate: date, birthTime: time,
    timezone: event.zone || chart.timezone,
    longitude: event.place ? event.place.lon : chart.longitude,
  });
  const [year, month, day] = moment.date.split("-").map(Number);
  const iso = (y, m, d) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (day && moment.time) {
    const at = toUTC(moment.date, moment.time);
    return { from: at, to: at, mid: at, precision: "time" };
  }
  let from, to;
  if (day) {
    from = toUTC(moment.date, "00:00");
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    to = toUTC(iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()), "00:00");
    return { from, to, mid: toUTC(moment.date, "12:00"), precision: "day" };
  }
  if (month) {
    from = toUTC(iso(year, month, 1), "00:00");
    to = toUTC(month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1), "00:00");
  } else {
    from = toUTC(iso(year, 1, 1), "00:00");
    to = toUTC(iso(year + 1, 1, 1), "00:00");
  }
  return { from, to, mid: new Date((from.getTime() + to.getTime()) / 2), precision: month ? "month" : "year" };
}
const LIFE_PRECISION_NOTES = {
  day: "Date only, so the moment is set at noon: the Moon may be up to about 7° off, and the moment's angles (Ascendant, Midheaven…) are hidden.",
  month: "Month only, so the moment is set mid-month: fast planets (the Moon, and the Sun by up to about 15°) are approximate, and angles are hidden.",
  year: "Year only, so the moment is set mid-year: only the slow planets are meaningful, and angles are hidden.",
};
// Bodies whose position depends on the exact time of day: left out of an imprecise moment.
const LIFE_TIME_OF_DAY_BODIES = new Set(["Ascendant", "Midheaven", "Vertex", "Fortuna"]);

// The chart's Life Timeline: birth, its dated life events (a period's start and end each
// count) and every computed cycle occurrence, in time order —
// [{ type: "birth" | "event" | "cycle", date, event?, cycleDef?, occurrence?, index? }].
function lifeTimelineEntries(chart) {
  const entries = [{ type: "birth", date: chartBirthMomentUTC(chart) }];
  // (This chart's annotated cycles are shown on their cycle entries, not twice.)
  chartLifeEvents(chart).filter((event) => event.start && event.anchor?.chartId !== chart.id).forEach((event) => {
    entries.push({ type: "event", event, date: lifeMomentRange(event, "start", chart).mid });
  });
  // (Yearly cycles, CYCLE_DEFINITIONS' `picker`, would swamp it and stay out.)
  CYCLE_DEFINITIONS.filter((cycleDef) => !cycleDef.picker).forEach((cycleDef) => {
    computeCycleOccurrences(chart, cycleDef).forEach((occurrence, index) => entries.push({ type: "cycle", cycleDef, occurrence, index, date: occurrence.date }));
  });
  return entries.sort((a, b) => a.date - b.date);
}

// At start-up (after everything above exists): when some place still needs a title,
// load the gazetteer (place-search.js, loaded after this file) and title them as soon
// as it arrives, before the views listening for it redraw.
window.addEventListener("orbital-places-loaded", titleUntitledPlaces);
if (untitledPlaceRecords().length) window.addEventListener("DOMContentLoaded", () => loadPlaces());
