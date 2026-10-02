// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The Cycle Explorer's studied moment, beyond the cycles and life events:
//   Transits · now — the chart against the sky at the moment it's opened. It stays at
//     that moment (the slider moves around it, "Jump to now" brings it to the present),
//     and can be saved to the Life Timeline as an event, to the minute, on the device's
//     clock and time zone.
//   Cast for — where the moment's angles and houses (Ascendant, MC, Vertex, Fortune,
//     cusps) are cast; the planets are the same anywhere. A life event (or an annotated
//     cycle) with a place is cast there, anything else at the birthplace; either way
//     the birthplace or any other place is one click away (remembered while the app is
//     open). "Now" keeps its place with the chart (chart.transitPlace, exported with it).
//   Transit | Full chart — how Human Design and Gene Keys read the moment: its 13
//     Personality activations only (a transit), or as a chart of its own, with its
//     Design side too. Remembered per kind of moment: now, cycles, life events.

// ── Now ──────────────────────────────────────────────────────────────────
function openCycleTransits(chartId) {
  if (chartId) cycleChartId = chartId;
  cycleEventAnchor = { now: true, time: Date.now() };
}
const CYCLE_DEVICE_ZONE = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
})();
// "Sep 29, 2026, 14:32 GMT+2" on the clock of `zone` (the device's by default).
function cycleClockLabel(date, zone = null, withDate = true) {
  const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short", ...(withDate ? { year: "numeric", month: "short", day: "numeric" } : {}) };
  try {
    return new Intl.DateTimeFormat(LOCALE, zone ? { ...options, timeZone: zone } : options).format(date);
  } catch {
    return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
}
// Where the slider is, from the studied moment, with its window ({ value, center, span },
// minutes from the moment): carried from tab to tab while the moment stays the same.
// (The Summary tab has no slider: it reads the moment itself.)
let cycleSliderMoment = null;
function noteCycleSliderMoment(context, view) {
  cycleSliderMoment = { chartId: context.chart.id, anchor: context.anchorOffset, ...view };
}
function cycleSliderView(context) {
  return cycleSliderMoment && cycleSliderMoment.chartId === context.chart.id && cycleSliderMoment.anchor === context.anchorOffset ? cycleSliderMoment : null;
}
function cycleStudiedDate(context) {
  const moved = cycleSliderView(context)?.value || 0;
  return new Date(chartBirthMomentUTC(context.chart).getTime() + (context.anchorOffset + moved) * 60000);
}
// The heading for "now": the moment on the device's clock (and on the clock where it's
// cast, when that's another time zone), with Jump to now and Add to Life Timeline.
function cycleNowSignatureMarkup(context) {
  const date = new Date(context.time);
  const { place } = cycleCastPlace(context);
  const zone = place ? place.zone : context.chart.timezone;
  const where = place ? place.name : context.chart.location || t("the birthplace");
  const elsewhere = zone && zone !== CYCLE_DEVICE_ZONE ? t("{time} in {place}", { time: cycleClockLabel(date, zone, false), place: escapeHtml(where) }) : "";
  const tip = t("The sky at the moment this was opened, against the natal chart. Times are on this device's clock; the slider moves around the moment, and Jump to now brings it back to the present.");
  return `${cycleSignatureMarkup(context.anchorOffset / CYCLE_YEAR_MINUTES, t("Transits · now"), [t("{time} (your time)", { time: cycleClockLabel(date) }), elsewhere, `⌖ ${t("cast for {place}", { place: escapeHtml(where) })}`], tip)}
    <p class="cycle-signature-actions"><button type="button" class="acg-origin-button" data-cycle-now-refresh>${t("Jump to now")}</button><button type="button" class="acg-origin-button" data-cycle-now-save title="${t("Save the moment on the slider as a life event, to the minute")}">＋ ${t("Add to Life Timeline")}</button></p>`;
}
// Saves the moment on the slider as a life event: the event dialog opens with its date
// and time on the device's clock and time zone, and the place it's cast for (if one was
// chosen); saved, the explorer studies it.
function saveCycleMomentToTimeline() {
  const context = cycleContext();
  if (!context?.now) return;
  const date = cycleStudiedDate(context);
  const { place } = cycleCastPlace(context);
  const start = lifeLocalMoment(date, CYCLE_DEVICE_ZONE);
  openLifeEventDialog(context.chart, null, {
    draft: {
      title: `Transits · ${lifeDateLabel(start.date)}`, start, zone: CYCLE_DEVICE_ZONE, instant: date,
      place: place ? { name: place.name, lat: String(place.lat), lon: String(place.lon) } : null,
    },
    onSave: (record) => {
      if (record) cycleEventAnchor = { eventId: record.id, part: "start" };
      refreshCycleMoment();
    },
  });
}

// ── Cast for ─────────────────────────────────────────────────────────────
// Per chart and moment: "birthplace", or a place { name, lat, lon, zone } (this session only).
const cycleCastChoices = new Map();
function cycleMomentKey(context) {
  if (context.now) return "now";
  if (context.birth) return "birth";
  if (context.event) return `event:${context.event.id}:${context.part}`;
  return `cycle:${context.cycleDef.key}:${context.occurrence?.index}`;
}
function cyclePlaceOf(place) {
  if (!place || place.lat === "" || place.lon === "" || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return null;
  return { name: place.name || lifeUnnamedPlace(place), lat: Number(place.lat), lon: Number(place.lon), zone: place.zone || "" };
}
// { place (null: the birthplace), own (the moment's own place, if it has one), kind: "birth" | "own" | "other" }.
function cycleCastPlace(context) {
  const { chart } = context;
  if (context.birth) return { place: null, own: null, kind: "birth" };
  if (context.now) {
    const saved = cyclePlaceOf(chart.transitPlace);
    return saved && !chart.transitPlace.off ? { place: saved, own: saved, kind: "own" } : { place: null, own: saved, kind: "birth" };
  }
  const own = cyclePlaceOf(cycleAcgMoment()?.place);
  const choice = cycleCastChoices.get(`${chart.id}|${cycleMomentKey(context)}`);
  if (choice === "birthplace") return { place: null, own, kind: "birth" };
  if (choice) return { place: choice, own, kind: "other" };
  return own ? { place: own, own, kind: "own" } : { place: null, own, kind: "birth" };
}
// value: "birthplace", "own", or a place.
function setCycleCastPlace(context, value) {
  const { chart } = context;
  if (context.now) {
    if (value === "birthplace") { if (chart.transitPlace) chart.transitPlace = { ...chart.transitPlace, off: true }; }
    else if (value === "own") { if (chart.transitPlace) { const { off, ...place } = chart.transitPlace; chart.transitPlace = place; } }
    else chart.transitPlace = { name: value.name, lat: value.lat, lon: value.lon, zone: value.zone || "" };
    saveState();
    return;
  }
  const key = `${chart.id}|${cycleMomentKey(context)}`;
  if (value === "own") cycleCastChoices.delete(key);
  else cycleCastChoices.set(key, value);
}
// The chart whose moment is drawn: the natal chart, its angles cast for the chosen place.
function cycleCastChart(context) {
  const { place } = cycleCastPlace(context);
  const { chart } = context;
  if (!place) return chart;
  return { ...chart, latitude: String(place.lat), longitude: String(place.lon), positions: chart.positions.map((position) => ({ ...position, latitude: place.lat, longitude: place.lon })) };
}
// The setting, at the bottom of the astrology filter column (as the composite's).
function cycleCastControlsMarkup(context) {
  const { chart } = context;
  const cast = cycleCastPlace(context);
  const radio = (value, label, checked) => `<label class="acg-filter"><input type="radio" name="cycle-cast" value="${value}" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
  const ownLabel = cast.own ? `${cast.own.name}${context.now ? "" : context.event ? ` (${t("the event's place")})` : ` (${t("where you were")})`}` : "";
  return `<span class="eyebrow wheel-filter-section" title="${t("Where the moment's angles and houses are cast. The planets are the same anywhere.")}">${t("CAST FOR")}</span>
    <div class="acg-filter-group">
      ${radio("birthplace", `${t("Birthplace")}${chart.location ? ` (${chart.location})` : ""}`, cast.kind === "birth")}
      ${cast.own ? radio("own", ownLabel, cast.kind === "own") : ""}
      ${cast.kind === "other" ? radio("other", cast.place.name, true) : ""}
      <span class="pair-composite-find"><input type="search" class="pair-composite-search" data-cast-search placeholder="${t("Another place…")}" aria-label="${t("Search for a place to cast the moment for")}"></span>
    </div>`;
}
function bindCycleCastControls(box, context, redraw) {
  const bindSearch = () => {
    const search = box.querySelector("[data-cast-search]");
    if (search) bindPlaceSearch(search, (place) => {
      setCycleCastPlace(context, { name: placeLabel(place), lat: Number(place.lat), lon: Number(place.lon), zone: place.zone || "" });
      refresh();
    });
  };
  const refresh = () => { box.innerHTML = cycleCastControlsMarkup(context); bindSearch(); redraw(); };
  box.addEventListener("change", (event) => {
    if (event.target.name !== "cycle-cast" || event.target.value === "other") return;
    setCycleCastPlace(context, event.target.value);
    refresh();
  });
  box.innerHTML = cycleCastControlsMarkup(context);
  bindSearch();
}

// ── Transit | Full chart ──────────────────────────────────────────────────
const CYCLE_READINGS = [["transit", t("Transit")], ["full", t("Full chart")]];
const cycleReadings = (() => {
  const defaults = { now: "transit", cycle: "transit", event: "transit" };
  try { return { ...defaults, ...JSON.parse(acgStoredSetting("orbital-study-cycle-readings", "{}")) }; } catch { return defaults; }
})();
const cycleReadingKind = (context) => context.now ? "now" : context.occurrence ? "cycle" : "event";
// Birth is the natal chart itself: nothing to choose.
function cycleReading(context) {
  return !context.birth && cycleReadings[cycleReadingKind(context)] === "full" ? "full" : "transit";
}
function setCycleReading(context, value) {
  cycleReadings[cycleReadingKind(context)] = value === "full" ? "full" : "transit";
  acgStoreSetting("orbital-study-cycle-readings", JSON.stringify(cycleReadings));
}
function cycleReadingSwitchMarkup(context) {
  if (context.birth) return "";
  return `<span class="cycle-reading" title="${t("Transit: the moment's 13 planets (its Personality side only), as Human Design reads transits. Full chart: the moment as a chart of its own, its Design side (88° of the Sun earlier) included.")}">${pairSegmentedMarkup("data-cycle-reading", CYCLE_READINGS, cycleReading(context))}</span>`;
}
// The moment's activations as read: a transit has only the Personality set, used for
// both sides (so a Design sphere reads its planet's transit); a full chart has both.
function cycleMomentHd(chart, offset, reading) {
  const hd = computeHumanDesignChart(chart, offset);
  return reading === "full" ? hd : { personality: hd.personality, design: hd.personality };
}
// Clicking the switch: remember the choice, redraw the tab.
function bindCycleReadingSwitch(surface, context, redraw) {
  surface.querySelector("[data-cycle-reading]")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    setCycleReading(context, button.dataset.value);
    redraw();
  });
}
