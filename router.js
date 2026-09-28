// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// URL routing: every explorer, chart, system and view has a direct link in the URL's
// hash (the part after "#"), which the page reads itself — so it works without a web
// server, straight from file://. The address bar follows along as you navigate, Back /
// Forward step through views, and opening a link restores that view.
//
//   #/library
//   #/chart/<chart>/<system>/<view>[/<filter>]
//   #/timeline/<system>/<view>[/<filter>]
//   #/pair/<chart-a>/<chart-b>/<system>/<view…>
//   #/cycle/<chart>/<cycle>/<occurrence>/<system>[/<map view>]
//   #/cycle/<chart>/event/<event id>/<start|end>/<system>[/<map view>]
//   #/cycle/<chart>/birth/<system>[/<map view>]
//
// e.g. #/chart/mira-mercer/human-design/mandala/design
//      #/pair/mira-mercer/jonas-sol/astrology/synastry/both
//      #/cycle/mira-mercer/saturn-return/1/astrocartography/travel  (the first Saturn return)
// Charts are named by a slug of their name ("Mira Mercer" → mira-mercer; duplicates get
// -2, -3… in library order); a chart id is accepted too. Parts left off fall back to
// the app's defaults.

// ── Names ↔ slugs ────────────────────────────────────────────────────────
function routeSlug(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function chartSlugs() {
  const counts = new Map();
  return activeCharts().map((chart) => {
    const base = routeSlug(chart.name) || "chart";
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return { chart, slug: count === 1 ? base : `${base}-${count}` };
  });
}
function chartSlug(id) {
  return chartSlugs().find(({ chart }) => chart.id === id)?.slug || "";
}
function chartFromSlug(slug) {
  if (!slug) return null;
  const entries = chartSlugs();
  return (entries.find((entry) => entry.slug === slug) || entries.find((entry) => entry.chart.id === slug))?.chart || null;
}
// The option (from `options`) whose slug is `slug`; `trim` strips a shared prefix
// such as "ACG " so the URL reads /travel rather than /acg-travel.
function routeOption(options, slug, trim = "") {
  return options.find((option) => routeSlug(option.replace(trim, "")) === slug);
}

const ROUTE_SYSTEMS = ["Astrology", "Human Design", "Gene Keys", "Astrocartography"];
// The Chart Explorer also has Life Events (#/chart/<chart>/life-events).
const ROUTE_EXPLORER_SYSTEMS = [...ROUTE_SYSTEMS, "Life Events"];
// The Cycle Explorer starts with its Summary (#/cycle/<chart>/<moment…>/summary).
const ROUTE_CYCLE_SYSTEMS = ["Summary", ...ROUTE_SYSTEMS];
const ROUTE_CHART_VIEWS = { wheel: "wheel", aspects: "aspects", both: "both" };
const ROUTE_PAIR_SUBJECTS = { synastry: "synastry", composite: "composite", A: "chart-a", B: "chart-b" };
const ROUTE_PAIR_ASTRO_VIEWS = { wheel: "wheel", grid: "aspect-grid", both: "both" };

// ── Reading the current view into a hash ─────────────────────────────────
// The part after the system for the Chart and Timeline Explorers (they share one surface).
function routeSystemPath(system) {
  if (system === "Astrology") return [ROUTE_CHART_VIEWS[chartViewMode] || "wheel"];
  if (system === "Human Design") return [routeSlug(activeSystemTab), routeSlug(activeSystemFilter)];
  if (system === "Gene Keys") return [routeSlug(activeSystemTab)];
  if (system === "Astrocartography") return [routeSlug(acgActiveView.replace("ACG ", ""))];
  return [];
}
function currentRoute() {
  const parts = [currentView];
  if (currentView === "explorer" || currentView === "timeline") {
    if (currentView === "explorer") {
      parts[0] = "chart";
      parts.push(chartSlug(selectedChartId));
    }
    parts.push(routeSlug(activeSystemPanelTab), ...routeSystemPath(activeSystemPanelTab));
  } else if (currentView === "pair") {
    const { a, b } = pairSelection();
    parts.push(chartSlug(a), chartSlug(b), routeSlug(pairActiveSystem));
    if (pairActiveSystem === "Astrology") parts.push(ROUTE_PAIR_SUBJECTS[pairAstroSubject], ROUTE_PAIR_ASTRO_VIEWS[pairAstroView]);
    if (pairActiveSystem === "Human Design") parts.push(ROUTE_PAIR_SUBJECTS[pairHdSubject], pairHdView);
    if (pairActiveSystem === "Gene Keys") parts.push(routeSlug(geneKeysPairTab));
    if (pairActiveSystem === "Astrocartography") parts.push(routeSlug(acgActiveView.replace("ACG ", "")));
  } else if (currentView === "library") {
    parts.push(routeSlug(librarySystem));
  } else if (currentView === "cycle") {
    const system = document.querySelector("[data-cycle-system].active")?.dataset.cycleSystem || "Summary";
    // The studied moment: birth, a life event (its start or end), or a cycle's occurrence (from 1).
    const moment = cycleEventAnchor?.birth ? ["birth"]
      : cycleEventAnchor?.eventId ? ["event", cycleEventAnchor.eventId, cycleEventAnchor.part === "end" ? "end" : "start"]
      : [activeCycleKey, String(activeOccurrenceIndex + 1)];
    parts.push(chartSlug(cycleChartId), ...moment, routeSlug(system));
    if (system === "Astrocartography") parts.push(routeSlug(acgActiveView.replace("ACG ", "")));
  }
  return `#/${parts.filter(Boolean).map(encodeURIComponent).join("/")}`;
}

// ── Applying a hash ──────────────────────────────────────────────────────
function routeNotice(message) {
  if (typeof showToast === "function") showToast(message);
}
// Clicks the surface's own tab button (so its usual handler runs) unless already active.
function routeClick(root, attribute, value) {
  const button = [...root.querySelectorAll(`[${attribute}]`)].find((node) => node.getAttribute(attribute) === value);
  if (button && !button.classList.contains("active")) button.click();
}
// Chart / Timeline Explorer: the system tab, then its view (and filter).
function applyExplorerSystem(systemSlug, view, filter) {
  let system = routeOption(ROUTE_EXPLORER_SYSTEMS, systemSlug) || "Astrology";
  if (system === "Life Events" && explorerMode !== "chart") system = "Astrology";
  if (activeSystemPanelTab !== system) switchExplorerSystem(system);
  const surface = document.getElementById("chartSystemSurface");
  if (system === "Astrology") {
    const mode = Object.keys(ROUTE_CHART_VIEWS).find((key) => ROUTE_CHART_VIEWS[key] === view);
    if (mode) setChartView(mode);
  } else if (system === "Human Design") {
    const tab = routeOption(SYSTEM_TABS["Human Design"].views, view);
    if (tab) routeClick(surface, "data-panel-tab", tab);
    const chosen = routeOption(SYSTEM_TABS["Human Design"].filters, filter);
    if (chosen) routeClick(surface, "data-panel-filter", chosen);
  } else if (system === "Gene Keys") {
    const tab = routeOption(SYSTEM_TABS["Gene Keys"], view);
    if (tab) routeClick(surface, "data-panel-tab", tab);
  } else if (system === "Astrocartography") {
    const tab = routeOption(SYSTEM_TABS.Astrocartography, view, "ACG ");
    if (tab) routeClick(surface, "data-acg-view", tab);
  }
}
function applyRoute(hash) {
  const [view, ...rest] = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const missing = (slug) => routeNotice(`No chart called “${slug}” in this library`);
  if (view === "chart") {
    const [slug, system, subview, filter] = rest;
    const chart = chartFromSlug(slug);
    if (slug && !chart) missing(slug);
    if (chart) selectedChartId = chart.id;
    setView("explorer");
    applyExplorerSystem(system, subview, filter);
  } else if (view === "timeline") {
    const [system, subview, filter] = rest;
    setView("timeline");
    applyExplorerSystem(system, subview, filter);
  } else if (view === "pair") {
    const [slugA, slugB, system, first, second] = rest;
    const [chartA, chartB] = [chartFromSlug(slugA), chartFromSlug(slugB)];
    [[slugA, chartA], [slugB, chartB]].forEach(([slug, chart]) => { if (slug && !chart) missing(slug); });
    const current = pairSelection();
    state.pairSelection = { a: chartA?.id || current.a, b: chartB?.id || current.b };
    saveState();
    pairActiveSystem = routeOption(PAIR_SYSTEMS, system) || pairActiveSystem;
    const subject = (map) => Object.keys(map).find((key) => ROUTE_PAIR_SUBJECTS[key] === first);
    if (pairActiveSystem === "Astrology") {
      const chosen = subject(ROUTE_PAIR_SUBJECTS);
      if (["synastry", "A", "B"].includes(chosen)) pairAstroSubject = chosen;
      const astroView = Object.keys(ROUTE_PAIR_ASTRO_VIEWS).find((key) => ROUTE_PAIR_ASTRO_VIEWS[key] === second);
      if (astroView) pairAstroView = astroView;
    } else if (pairActiveSystem === "Human Design") {
      const chosen = subject(ROUTE_PAIR_SUBJECTS);
      if (["composite", "A", "B"].includes(chosen)) pairHdSubject = chosen;
      if (["bodygraph", "mandala"].includes(second)) pairHdView = second;
    } else if (pairActiveSystem === "Gene Keys") {
      geneKeysPairTab = routeOption(SYSTEM_TABS["Gene Keys"], first) || geneKeysPairTab;
    } else if (pairActiveSystem === "Astrocartography") {
      acgActiveView = routeOption(SYSTEM_TABS.Astrocartography, first, "ACG ") || acgActiveView;
    }
    setView("pair");
  } else if (view === "cycle") {
    const [slug, first, ...more] = rest;
    const chart = chartFromSlug(slug);
    if (slug && !chart) missing(slug);
    if (chart) cycleChartId = chart.id;
    let system, subview;
    if (first === "birth") {
      cycleEventAnchor = { birth: true };
      [system, subview] = more;
    } else if (first === "event") {
      const [id, part] = more;
      [system, subview] = more.slice(2);
      const event = chartLifeEvents(chartById(cycleChartId)).find((item) => item.id === id && item.start);
      if (event) cycleEventAnchor = { eventId: event.id, part: part === "end" && event.end ? "end" : "start" };
      else routeNotice("That life event isn't in this chart's timeline");
    } else {
      const cycle = CYCLE_DEFINITIONS.find((def) => def.key === first);
      // An occurrence number (from 1) picks it; old links without one start from the first.
      const numbered = /^\d+$/.test(more[0] || "");
      if (numbered) [, system, subview] = more;
      else [system, subview] = more;
      if (cycle) activeCycleKey = cycle.key;
      activeOccurrenceIndex = numbered ? Math.max(0, Number(more[0]) - 1) : 0;
      cycleEventAnchor = null;
    }
    const chosenSystem = routeOption(ROUTE_CYCLE_SYSTEMS, system) || "Summary";
    if (chosenSystem === "Astrocartography") acgActiveView = routeOption(SYSTEM_TABS.Astrocartography, subview, "ACG ") || acgActiveView;
    setView("cycle");
    switchCycleSystem(chosenSystem);
  } else {
    const [system] = rest;
    setLibrarySystem(routeOption(LIBRARY_SYSTEMS, system) || "Astrology");
    setView("library");
  }
}

// ── Keeping the URL in step ──────────────────────────────────────────────
// After any interaction the current view is read back and, if it changed, written to
// the address bar as a new history entry. Our own writes are recognised (lastHash)
// so they aren't applied back; anything else (Back/Forward, an edited or pasted URL)
// is applied.
let routeLastHash = null;
let routeApplying = false;
let routeSyncTimer = 0;
function syncRoute({ replace = false } = {}) {
  if (routeApplying) return;
  // The address changed from outside (a link, Back/Forward) and its hashchange hasn't
  // been handled yet — a click's sync can run first; applying it wins, not overwriting it.
  if (routeLastHash !== null && location.hash !== routeLastHash) return;
  const hash = currentRoute();
  if (hash === location.hash) {
    routeLastHash = hash;
    return;
  }
  routeLastHash = hash;
  if (replace) {
    try { history.replaceState(null, "", hash); } catch { location.replace(hash); }
  } else {
    location.hash = hash;
  }
}
function scheduleRouteSync() {
  clearTimeout(routeSyncTimer);
  routeSyncTimer = setTimeout(syncRoute, 0);
}
function applyLocationHash() {
  routeLastHash = location.hash;
  routeApplying = true;
  try {
    applyRoute(location.hash);
  } finally {
    routeApplying = false;
  }
  // Rewrite in canonical form (defaults filled in, unknown parts dropped) without
  // adding another history entry.
  syncRoute({ replace: true });
}
window.addEventListener("hashchange", () => {
  if (location.hash !== routeLastHash) applyLocationHash();
});
["click", "change", "mousedown", "keydown"].forEach((type) => document.addEventListener(type, scheduleRouteSync));
// Views also change without a click (keyboard shortcuts, buttons that call setView).
const setViewWithoutRoute = setView;
setView = function setViewWithRoute(view) {
  setViewWithoutRoute(view);
  scheduleRouteSync();
};

if (location.hash.length > 1) applyLocationHash();
else syncRoute({ replace: true });
