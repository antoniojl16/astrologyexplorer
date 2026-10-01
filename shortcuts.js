// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Keyboard shortcuts for chart analysis. They're listed only in the "?" guide, not on
// the buttons. Each one presses the same on-screen control a click would (so behaviour,
// the URL and Back/Forward stay consistent), and only controls in the view that's
// showing count. Ignored while typing in a text field or while a dialog is open.
//
// Ctrl + letter (or Alt/Option + letter, for systems where the browser keeps Ctrl):
//   A / H / G / Y / E   Astrology / Human Design / Gene Keys / Astrocartography / Life Events
//                  (the Cycle Explorer has no Life Events tab: E opens or closes its Life Timeline)
//   L / I / P / T / C   Library / Chart / Pair / Timeline / Cycle explorer
// Plain keys:
//   J / K   Library: next / previous chart (↵ opens it), as in Gmail
//   X   Library: select or deselect that chart (for Copy, Move, Export…)
//   E   Library: edit that chart; Chart Explorer: edit the chart
//   Z   Fix Zodiac on the astrology wheel
//   P / D / X   Human Design: Personality / Design / Incarnation Cross only (again: all)
//   D   ACG Local Space: Relocated ↔ Natal directions
//   M   Human Design: Mandala ↔ Bodygraph; Astrocartography: Relief ↔ Plain map
//   T   Astrocartography: ACG Travel ↔ ACG Local Space
//   0   Center the timeline slider
//   ← / →, Shift+← / →   On a timeline slider: step by the zoom's units (timelineKeySteps, timeline.js)
//   R   Pair Explorer: swap the two charts
//   E   Chart Explorer: edit the chart
//   1 / 2 / 3   Pair and Cycle Explorers: first chart / second chart / both together
//               (3 again in the Pair Explorer's Astrology: Synastry ↔ Composite)

const SHORTCUT_SYSTEMS = { KeyA: "Astrology", KeyH: "Human Design", KeyG: "Gene Keys", KeyY: "Astrocartography", KeyE: "Life Events" };
const SHORTCUT_VIEWS = { KeyL: "library", KeyI: "explorer", KeyP: "pair", KeyT: "timeline", KeyC: "cycle" };
const SHORTCUT_HD_FILTERS = { p: "Personality", d: "Design", x: "Incarnation Cross" };

// The first control matching `selector` that's actually on screen.
function shortcutTarget(selector) {
  return [...document.querySelectorAll(selector)].find((element) => element.getClientRects().length > 0) || null;
}
function shortcutPress(selector) {
  const target = shortcutTarget(selector);
  if (target) target.click();
  return Boolean(target);
}
function shortcutTyping(target) {
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes(target.type);
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || shortcutTyping(event.target)) return;
  if (document.querySelector("dialog[open]")) return;

  // Ctrl / Alt + letter: systems and explorers.
  if (event.ctrlKey || event.altKey) {
    const system = SHORTCUT_SYSTEMS[event.code];
    if (system) {
      event.preventDefault();
      const pressed = shortcutPress(`[data-explorer-system="${system}"], [data-pair-system="${system}"], [data-cycle-system="${system}"], [data-library-system="${system}"]`);
      const timeline = !pressed && system === "Life Events" && shortcutTarget("#cycleLifeTimeline");
      if (timeline) timeline.open = !timeline.open;
      return;
    }
    const view = SHORTCUT_VIEWS[event.code];
    if (view) {
      event.preventDefault();
      setView(view);
    }
    return;
  }
  if (event.shiftKey && event.key !== "?") return;

  const key = event.key.toLowerCase();
  let handled = false;
  if (currentView === "library" && (key === "j" || key === "k" || key === "x")) {
    handled = libraryKeyboardStep(key);
  } else if (key === "z") {
    handled = shortcutPress("#fixZodiacToggleChart, [data-pair-fix-zodiac]");
  } else if (SHORTCUT_HD_FILTERS[key]) {
    // Pressing the active filter's key again goes back to the full chart.
    const filter = SHORTCUT_HD_FILTERS[key];
    const current = shortcutTarget(`[data-panel-filter="${filter}"]`);
    handled = current ? shortcutPress(`[data-panel-filter="${current.classList.contains("active") ? "Complete" : filter}"]`) : false;
    // D outside Human Design: ACG Local Space Relocated ↔ Natal directions (the radios only show there).
    if (!current && key === "d") handled = shortcutPress("[data-acg-directions]:not(:checked)");
  } else if (key === "m") {
    const mandala = shortcutTarget('[data-panel-tab="Mandala"], [data-pair-view] [data-value="mandala"], [data-cycle-hd-view] [data-value="mandala"]');
    if (mandala) {
      handled = mandala.classList.contains("active")
        ? shortcutPress('[data-panel-tab="Bodygraph"], [data-pair-view] [data-value="bodygraph"], [data-cycle-hd-view] [data-value="bodygraph"]')
        : shortcutPress('[data-panel-tab="Mandala"], [data-pair-view] [data-value="mandala"], [data-cycle-hd-view] [data-value="mandala"]');
    } else {
      // Astrocartography: Relief ↔ Plain map.
      handled = shortcutPress("[data-acg-style]:not(:checked)");
    }
  } else if (key === "t") {
    // Astrocartography: ACG Travel ↔ ACG Local Space.
    const other = [...document.querySelectorAll("[data-acg-view]")].find((button) => button.getClientRects().length > 0 && !button.classList.contains("active"));
    if (other) { other.click(); handled = true; }
  } else if (key === "0") {
    handled = shortcutPress("[data-timeline-center]");
  } else if (key === "e") {
    if (currentView === "explorer") handled = shortcutPress("#editChartButton");
    // The library's highlighted chart (J / K).
    else if (currentView === "library" && document.querySelector(`#chartRows tr[data-id="${CSS.escape(selectedChartId || "")}"]`)) { editChart(chartById(selectedChartId)); handled = true; }
  } else if (key === "r") {
    handled = currentView === "pair" && shortcutPress("[data-pair-swap]");
  } else if (key === "1" || key === "2") {
    handled = shortcutPress(`[data-pair-subject] [data-value="${key === "1" ? "A" : "B"}"]`);
  } else if (key === "3") {
    // Both together; again (where there are both, as in the Pair Explorer's Astrology): Synastry ↔ Composite.
    const group = shortcutTarget("[data-pair-subject]");
    const options = group ? [...group.querySelectorAll('[data-value="synastry"], [data-value="composite"]')] : [];
    const next = options.length > 1 && options.some((button) => button.classList.contains("active")) ? options.find((button) => !button.classList.contains("active")) : options[0];
    if (next) { next.click(); handled = true; }
  }
  if (handled) event.preventDefault();
});

// The library's highlighted chart (the one ↵ opens): J and K move it down and up the
// rows shown, X ticks or unticks its checkbox (the selection bar follows).
function libraryKeyboardStep(key) {
  const rows = [...document.querySelectorAll("#chartRows tr[data-id]")];
  if (!rows.length) return false;
  let index = rows.findIndex((row) => row.dataset.id === selectedChartId);
  if (key === "x") {
    if (index < 0) return false;
    const box = rows[index].querySelector('input[type="checkbox"]');
    box.checked = !box.checked;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  index = index < 0 ? (key === "j" ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, index + (key === "j" ? 1 : -1)));
  selectedChartId = rows[index].dataset.id;
  selectedRowIndex = index;
  rows.forEach((row, at) => row.classList.toggle("selected", at === index));
  rows[index].scrollIntoView({ block: "nearest" });
  return true;
}

// Keyboard access to the diagrams' tooltips. Planets, gates, centers, spheres and the
// other focusable SVG elements explain themselves on hover; every tooltip here follows
// the mouse, so when one of them gets keyboard focus it's shown as if the pointer were
// resting on its center, and hidden again when focus moves on.
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof SVGElement) || !target.matches(":focus-visible")) return;
  const box = target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
});
document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof SVGElement)) return;
  document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: -1, clientY: -1 }));
  for (let svg = target.ownerSVGElement; svg; svg = svg.ownerSVGElement) svg.dispatchEvent(new MouseEvent("mouseleave"));
});
