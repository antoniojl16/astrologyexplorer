// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const SYSTEM_TABS = {
  "Human Design": {
    views: [N_("Bodygraph"), N_("Mandala")],
    filters: [N_("Complete"), N_("Personality"), N_("Design"), N_("Incarnation Cross")],
  },
  "Gene Keys": [
    N_("All Paths"),
    N_("Golden Path"),
    N_("Venus Path"),
    N_("Pearl Path"),
    N_("Star Pearl"),
    N_("Codon Rings"),
  ],
  Astrocartography: [N_("ACG Travel"), N_("ACG Local Space")],
};
let activeSystemTab = "Bodygraph";
let activeSystemFilter = "Complete";
// "Full precision" checkbox: planet influences read G.L.C.T.B instead of G.L.
let hdFullPrecision = false;
function hdInfluenceText(influence) {
  if (!influence || !influence.label) return "—";
  return hdFullPrecision ? influence.label : `${influence.gate}.${influence.line}`;
}
// Rewrites every planet-influence label under `root` for `hd`; remembers `hd` so the
// precision checkbox can redo it later without re-rendering (which would reset the
// timeline slider).
function hdUpdateInfluenceLabels(root, hd) {
  root._hdInfluences = hd;
  ["personality", "design"].forEach((setName) =>
    hd[setName].forEach((influence, index) =>
      root.querySelectorAll(`[data-hd-set="${setName}"][data-hd-index="${index}"]`).forEach((node) => {
        node.textContent = hdInfluenceText(influence);
      }),
    ),
  );
}
// Shared glyph order for the 13 HD_PERSONALITY_PLANETS (human-design.js) — used by
// both the bodygraph columns and the mandala's per-gate glyph stacks.
const HD_PLANET_GLYPHS = [
  "☉",
  "⊕",
  "☽",
  "☊",
  "☋",
  "☿",
  "♀",
  "♂",
  "♃",
  "♄",
  "♅",
  "♆",
  "♇",
];
// Mandala geometry is fixed (no chart dependency), so it's hoisted out of
// renderHumanDesignMandala so the timeline-slider's partial re-render (which only
// needs to redraw the glyph layer, not the whole SVG) can reuse it too.
const MANDALA_GATE_ORDER = [
  25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
  62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44,
  1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30, 55,
  37, 63, 22, 36,
];
const MANDALA_CENTER = 330;
const MANDALA_GATE_STEP = 360 / MANDALA_GATE_ORDER.length;
const MANDALA_GATE25_ANGLE = 180;
function mandalaPolar(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: MANDALA_CENTER + radius * Math.cos(radians),
    y: MANDALA_CENTER + radius * Math.sin(radians),
  };
}
// User-assigned per-gate color, one letter per gate in MANDALA_GATE_ORDER's own
// sequence starting at gate 55 (b=brown, y=yellow, r=red, g=green).
const MANDALA_GATE_COLOR_STRING =
  "bbybbygrrrrrgybbbbbbbybbbbbbbygrrrygbybbbbbbbygrrrrrgybbbybbbybb";
const MANDALA_COLOR_LETTERS = {
  b: "#8a5a34",
  y: "#c9a227",
  r: "#bd4a3d",
  g: "#4f8f6a",
};
const MANDALA_GATE_COLOR_LETTERS = new Map();
(() => {
  const gate55Index = MANDALA_GATE_ORDER.indexOf(55);
  for (let i = 0; i < MANDALA_GATE_ORDER.length; i++) {
    const gate =
      MANDALA_GATE_ORDER[(gate55Index + i) % MANDALA_GATE_ORDER.length];
    MANDALA_GATE_COLOR_LETTERS.set(gate, MANDALA_GATE_COLOR_STRING[i]);
  }
})();
const MANDALA_SECTOR_INNER_R = 128;
const MANDALA_SECTOR_OUTER_R = 218;
// The real bodygraph (viewBox 0 0 440 640, same markup as the Bodygraph view)
// nests inside the mandala's core circle (r=128, diameter 256) via a scaled
// nested <svg>, keeping its own internal coordinates untouched.
const MANDALA_BODYGRAPH_HEIGHT = 248;
const MANDALA_BODYGRAPH_WIDTH = (440 / 640) * MANDALA_BODYGRAPH_HEIGHT;
// Shared per-color radial gradients (not per-gate): gradientUnits="userSpaceOnUse"
// pins them to the wheel's own center/radius, so every gate sector that fills with
// the same letter reuses the same gradient regardless of its angle. Mild screen
// background at the sector's inner edge (128, the core circle) grading to a
// medium-bright hue at its outer edge (218, the inner ring).
const MANDALA_GATE_SECTOR_GRADIENTS = `<defs>${Object.entries(
  MANDALA_COLOR_LETTERS,
)
  .map(
    ([letter, color]) =>
      `<radialGradient id="mandala-grad-${letter}" gradientUnits="userSpaceOnUse" cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="${MANDALA_SECTOR_OUTER_R}"><stop offset="${((MANDALA_SECTOR_INNER_R / MANDALA_SECTOR_OUTER_R) * 100).toFixed(2)}%" style="stop-color:var(--paper)"/><stop offset="100%" style="stop-color:${color}"/></radialGradient>`,
  )
  .join("")}</defs>`;
// Builds an annular-sector <path> from innerR to outerR spanning [angleEnd, angleStart]
// (gate angles decrease with index per MANDALA_GATE_STEP, so angleStart > angleEnd for
// consecutive gates). Increasing angle rotates clockwise on screen (mandalaPolar's
// y-down convention), so sweeping from the larger angle down to the smaller one is
// counterclockwise: sweep-flag 0 on the way out, 1 on the way back in.
function mandalaSectorPath(innerR, outerR, angleStart, angleEnd) {
  const outerStart = mandalaPolar(outerR, angleStart);
  const outerEnd = mandalaPolar(outerR, angleEnd);
  const innerStart = mandalaPolar(innerR, angleStart);
  const innerEnd = mandalaPolar(innerR, angleEnd);
  return `M ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 0 0 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerR} ${innerR} 0 0 1 ${innerStart.x} ${innerStart.y} Z`;
}
// One soft radial-gradient wedge per activated gate (present in glyphMap). Gates with
// no personality/design influence stay unfilled so the background shows through.
function mandalaGateSectorsMarkup(glyphMap) {
  return MANDALA_GATE_ORDER.map((gate, index) => {
    if (!glyphMap.has(gate)) return "";
    const letter = MANDALA_GATE_COLOR_LETTERS.get(gate);
    const angleStart = MANDALA_GATE25_ANGLE - index * MANDALA_GATE_STEP;
    const angleEnd = angleStart - MANDALA_GATE_STEP;
    const path = mandalaSectorPath(
      MANDALA_SECTOR_INNER_R,
      MANDALA_SECTOR_OUTER_R,
      angleStart,
      angleEnd,
    );
    return `<path d="${path}" fill="url(#mandala-grad-${letter})" class="mandala-gate-sector"/>`;
  }).join("");
}
// Debug aid: hovering the mandala shows which SVG element is under the pointer and
// how far it sits from the wheel's center, in the SVG's own coordinate space (so the
// distance lines up with the radii used above, e.g. gate numbers at 250, glyphs
// starting at 208).
function ensureMandalaHoverTooltip() {
  let tooltip = document.getElementById("mandalaHoverTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "mandalaHoverTooltip";
    tooltip.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;display:none;white-space:nowrap;background:var(--ink);color:var(--paper);font:10px "DM Mono",monospace;padding:6px 9px;border-radius:3px;box-shadow:0 8px 20px rgba(0,0,0,.25)';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function bindMandalaHoverDebug(svg) {
  if (!svg || svg.dataset.hoverDebugBound) return;
  svg.dataset.hoverDebugBound = "true";
  const tooltip = ensureMandalaHoverTooltip();
  svg.addEventListener("mousemove", (event) => {
    if (event.target.closest("[data-hd-arrow]")) {
      tooltip.style.display = "none";
      return;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    const distance = Math.hypot(
      svgPoint.x - MANDALA_CENTER,
      svgPoint.y - MANDALA_CENTER,
    );
    const target = event.target;
    const label = target.id
      ? `id: ${target.id}`
      : target.className && target.className.baseVal
        ? `class: ${target.className.baseVal}`
        : `<${target.tagName}>`;
    tooltip.textContent = `${label} · distance ${distance.toFixed(1)}`;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.display = "block";
  });
  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}
// Debug aid: hovering the bodygraph shows which SVG element is under the pointer and
// the x,y coordinates of the SVG.
function ensureBodygraphHoverTooltip() {
  let tooltip = document.getElementById("bodygraphHoverTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "bodygraphHoverTooltip";
    tooltip.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;display:none;white-space:nowrap;background:var(--ink);color:var(--paper);font:10px "DM Mono",monospace;padding:6px 9px;border-radius:3px;box-shadow:0 8px 20px rgba(0,0,0,.25)';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function bindBodygraphHoverDebug(svg) {
  if (!svg || svg.dataset.hoverDebugBound) return;
  svg.dataset.hoverDebugBound = "true";
  const tooltip = ensureBodygraphHoverTooltip();
  svg.addEventListener("mousemove", (event) => {
    if (event.target.closest("[data-hd-arrow]")) {
      tooltip.style.display = "none";
      return;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    const target = event.target;
    // event.target is always the innermost shape under the cursor (a <rect>,
    // <polygon>, <text>...), never the <g> wrapper the gate/channel/center ids live
    // on — so this has to walk up the ancestor chain to find the id, not just check
    // target.id directly.
    const idHolder = target.closest("[id]");
    const label = idHolder
      ? `id: ${idHolder.id}`
      : target.className && target.className.baseVal
        ? `class: ${target.className.baseVal}`
        : `<${target.tagName}>`;
    tooltip.textContent = `${label} · (${svgPoint.x.toFixed(1)},${svgPoint.y.toFixed(1)})`;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.display = "block";
  });
  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

// Shared "PERSONALITY MOMENT" timeline slider markup — identical under the bodygraph
// and the mandala, so moving the slider explores the same offset-from-birth concept
// in both views.
function hdTimelineControlMarkup(chart, offsetMinutes) {
  if (!chart) return "";
  return timelineSliderMarkup(t("PERSONALITY MOMENT"), offsetMinutes);
}
// Which planets (personality and/or design) currently activate each gate, at a given
// offset from birth. Reused by the mandala's initial render and its slider updates.
// `filter`: the Human Design view filter (see hdInfluenceIncluded).
function humanDesignGateGlyphMap(chart, offsetMinutes, filter = "Complete") {
  const map = new Map();
  if (!chart) return map;
  const hd = computeHumanDesignChart(chart, offsetMinutes);
  const addSide = (side, influences) =>
    influences.forEach((influence, index) => {
      if (influence.gate == null || !hdInfluenceIncluded(filter, side, influence.planet)) return;
      if (!map.has(influence.gate))
        map.set(influence.gate, { personality: [], design: [] });
      map.get(influence.gate)[side].push(HD_PLANET_GLYPHS[index]);
    });
  addSide("personality", hd.personality);
  addSide("design", hd.design);
  return map;
}
// Personality glyphs render in ink (black in light mode, white in dark mode, matching
// the bodygraph's personality column) and design glyphs in the accent color (matching
// the bodygraph's design column) — stacked inward from the gate-number radius so
// multiple influences on the same gate don't collide.
function mandalaGlyphLayerMarkup(glyphMap) {
  return MANDALA_GATE_ORDER.map((gate, index) => {
    const entry = glyphMap.get(gate);
    if (!entry) return "";
    const angle =
      MANDALA_GATE25_ANGLE - index * MANDALA_GATE_STEP - MANDALA_GATE_STEP / 2;
    // An entry may carry ready-made items ({glyph, color, side}) — the Pair
    // Explorer composite colors them by person instead of by side.
    const items = entry.items || [
      ...entry.personality.map((glyph) => ({
        glyph,
        color: "var(--ink)",
        side: "Personality",
      })),
      ...entry.design.map((glyph) => ({
        glyph,
        color: "var(--accent)",
        side: "Design",
      })),
    ];
    return items
      .map((item, itemIndex) => {
        const point = mandalaPolar(208 - itemIndex * 13, angle);
        return `<text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="middle" class="mandala-planet-glyph" tabindex="0" data-gate="${gate}" data-side="${item.side}" style="fill:${item.color};font-weight:bold">${item.glyph}</text>`;
      })
      .join("");
  }).join("");
}
function bindMandalaGlyphClicks(container) {
  container.querySelectorAll(".mandala-planet-glyph").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(t('Gate {gate} · {side} influence', { gate: node.dataset.gate, side: tName(node.dataset.side) }));
    }),
  );
}

function systemChart() {
  return currentExplorerChart();
}

function renderSystemPanel(container, system, chart) {
  if (system === "Astrocartography")
    return renderAstrocartographyPanel(container, chart);
  if (system === "Life Events") return renderLifeEventsPanel(container, chart);
  const systemTabs = SYSTEM_TABS[system];
  const tabs = system === "Human Design" ? systemTabs.views : systemTabs;
  activeSystemTab = tabs[0];
  activeSystemFilter = "Complete";
  const selectorMarkup =
    system === "Human Design"
      ? `<div class="system-selector-stack"><div class="selector-row"><span class="selector-label">${t("VIEW")}</span><div class="system-tabs">${tabs.map((tab) => `<button type="button" class="${tab === activeSystemTab ? "active" : ""}" data-panel-tab="${tab}">${tName(tab)}</button>`).join("")}</div></div><div class="selector-row"><span class="selector-label">${t("INFLUENCES")}</span><div class="system-tabs influence-tabs">${systemTabs.filters.map((filter) => `<button type="button" class="${filter === activeSystemFilter ? "active" : ""}" data-panel-filter="${filter}">${tName(filter)}</button>`).join("")}</div></div></div>`
      : `<div class="system-tabs">${tabs.map((tab) => `<button type="button" class="${tab === activeSystemTab ? "active" : ""}" data-panel-tab="${tab}">${tName(tab)}</button>`).join("")}</div>`;
  container.innerHTML = `${selectorMarkup}<div class="system-surface" data-panel-surface></div>`;
  const surface = container.querySelector("[data-panel-surface]");
  const renderInner = () => {
    if (system === "Human Design") renderBodygraph(surface, chart);
    else renderGeneKeys(surface, chart);
  };
  container.querySelectorAll("[data-panel-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      activeSystemTab = button.dataset.panelTab;
      container
        .querySelectorAll("[data-panel-tab]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderInner();
    }),
  );
  container.querySelectorAll("[data-panel-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      activeSystemFilter = button.dataset.panelFilter;
      container
        .querySelectorAll("[data-panel-filter]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderInner();
    }),
  );
  renderInner();
}

// Bodygraph visual layout (positions/shapes for drawing) — chart-independent,
// so it's hoisted out of renderBodygraph and shared with the tick-level
// update, which needs to regenerate the same gate/center markup without
// recomputing pixel geometry each time.
// Center colors: brown for Root, Solar Plexus, Spleen and Throat; red for Sacral
// and Heart; gold for G and Head (Crown); green for Ajna.
const HD_BODYGRAPH_CENTERS = [
  {
    name: N_("Head"),
    id: "head",
    x: 220,
    y: 62,
    shape: "up-triangle",
    color: "#d6a63e",
  },
  {
    name: N_("Ajna"),
    id: "ajna",
    x: 220,
    y: 137,
    shape: "down-triangle",
    color: "#4f7d4c",
  },
  {
    name: N_("Throat"),
    id: "throat",
    x: 220,
    y: 222,
    shape: "square",
    color: "#8a6446",
  },
  { name: N_("G"), id: "g", x: 220, y: 315, shape: "diamond", color: "#d6a63e" },
  {
    name: N_("Heart"),
    id: "heart",
    x: 284,
    y: 356,
    shape: "scalene",
    color: "#b8453b",
  },
  {
    name: N_("Solar Plexus"),
    id: "solar-plexus",
    x: 342,
    y: 421,
    shape: "right-triangle",
    color: "#8a6446",
  },
  {
    name: N_("Spleen"),
    id: "spleen",
    x: 98,
    y: 421,
    shape: "left-triangle",
    color: "#8a6446",
  },
  {
    name: N_("Sacral"),
    id: "sacral",
    x: 220,
    y: 480,
    shape: "square",
    color: "#b8453b",
  },
  {
    name: N_("Root"),
    id: "root",
    x: 220,
    y: 575,
    shape: "square",
    color: "#8a6446",
  },
];
// Each gate's point in the bodygraph: [gate, x, y], where its line meets its center.
const HD_BODYGRAPH_GATE_COORDS = [
  [1, 220, 280],
  [2, 220, 340],
  [3, 220, 505],
  [4, 237, 115],
  [5, 203, 455],
  [6, 314, 425],
  [7, 203, 295],
  [8, 220, 247],
  [9, 237, 505],
  [10, 189, 316],
  [11, 237, 165],
  [12, 248, 223],
  [13, 237, 295],
  [14, 220, 455],
  [15, 203, 340],
  [16, 192, 205],
  [17, 203, 165],
  [18, 78, 446],
  [19, 252, 564],
  [20, 190, 228],
  [21, 286, 340],
  [22, 350, 405],
  [23, 220, 200],
  [24, 220, 115],
  [25, 244, 324],
  [26, 264, 369],
  [27, 194, 483],
  [28, 92, 438],
  [29, 237, 455],
  [30, 365, 443],
  [31, 203, 247],
  [32, 105, 430],
  [33, 237, 247],
  [34, 195, 459],
  [35, 248, 205],
  [36, 365, 396],
  [37, 335, 410],
  [38, 188, 578],
  [39, 252, 578],
  [40, 302, 361],
  [41, 252, 592],
  [42, 203, 505],
  [43, 220, 165],
  [44, 112, 414],
  [45, 246, 239],
  [46, 237, 340],
  [47, 203, 115],
  [48, 77, 399],
  [49, 335, 427],
  [50, 121, 420],
  [51, 270, 350],
  [52, 237, 550],
  [53, 203, 550],
  [54, 188, 564],
  [55, 350, 435],
  [56, 237, 200],
  [57, 95, 405],
  [58, 188, 592],
  [59, 246, 483],
  [60, 220, 550],
  [61, 220, 84],
  [62, 203, 200],
  [63, 237, 84],
  [64, 203, 84],
];
// The gate pairs that form the 36 channels. Order matters: a gate's line runs from its
// point to the midpoint of the FIRST channel listing it, so the integration channels
// come last (their gates are all placed by then), and gates 10 and 34 are then pointed
// at channel 20–57's midpoint below.
const HD_BODYGRAPH_CHANNELS = [
  [1, 8],
  [2, 14],
  [3, 60],
  [4, 63],
  [5, 15],
  [6, 59],
  [7, 31],
  [9, 52],
  [11, 56],
  [12, 22],
  [13, 33],
  [16, 48],
  [17, 62],
  [18, 58],
  [19, 49],
  [20, 57],
  [21, 45],
  [23, 43],
  [24, 61],
  [25, 51],
  [26, 44],
  [27, 50],
  [28, 38],
  [29, 46],
  [30, 41],
  [32, 54],
  [35, 36],
  [37, 40],
  [39, 55],
  [42, 53],
  [47, 64],
  [10, 34],
  // Integration Channels
  [10, 20],
  [10, 57],
  [20, 34],
  [34, 57],
];
function hdGatePointsFrom(gateCoords) {
  const coords = new Map(gateCoords.map(([gate, x, y]) => [gate, { x, y }]));
  const points = {};
  HD_BODYGRAPH_CHANNELS.forEach(([gateA, gateB]) => {
    if (points[gateA] || points[gateB]) return;
    const a = coords.get(gateA), b = coords.get(gateB);
    const midpointX = (a.x + b.x) / 2;
    const midpointY = (a.y + b.y) / 2;
    points[gateA] = { id: gateA, x1: a.x, y1: a.y, x2: midpointX, y2: midpointY };
    points[gateB] = { id: gateB, x1: b.x, y1: b.y, x2: midpointX, y2: midpointY };
  });
  points[10].x2 = points[34].x2 = points[20].x2;
  points[10].y2 = points[34].y2 = points[20].y2;
  return points;
}
const HD_BODYGRAPH_GATE_POINTS = hdGatePointsFrom(HD_BODYGRAPH_GATE_COORDS);
// Where each gate's line ends and where its number sits, computed once from the
// geometry. Gates are drawn UNDER the centers, so each line runs just far enough into
// its center that its full width and round cap are hidden, whatever the angle. Each
// number sits just inside the center, opposite the point where the gate's line
// crosses the outline, stepped inward (away from that edge) until the whole label
// fits inside with a margin and clears the center's other labels.
const HD_GATE_TRACK_HALF_WIDTH = 5; // half of .channel-track's stroke-width
const HD_GATE_LABEL_SIZE = { charWidth: 4.8, height: 6 }; // 8px DM Mono digits
const HD_GATE_LABEL_MARGIN = 2; // from the outline's inner edge (stroke included)
function hdGateGeometryFrom(gatePoints) {
  const edgesOf = (polygon) => {
    const cx = polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length;
    const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length;
    return polygon.map((a, index) => {
      const b = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let n = [(a[1] - b[1]) / length, (b[0] - a[0]) / length];
      if ((cx - a[0]) * n[0] + (cy - a[1]) * n[1] < 0) n = [-n[0], -n[1]];
      return { a, b, n, t: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] };
    });
  };
  const inset = (point, edges) => Math.min(...edges.map(({ a, n }) => (point[0] - a[0]) * n[0] + (point[1] - a[1]) * n[1]));
  // First crossing of the ray origin + s·d with the outline: { s, edge }.
  const entry = (origin, d, edges) => {
    let best = null;
    edges.forEach((edge) => {
      const ex = edge.b[0] - edge.a[0], ey = edge.b[1] - edge.a[1];
      const den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-9) return;
      const s = ((edge.a[0] - origin[0]) * ey - (edge.a[1] - origin[1]) * ex) / den;
      const u = ((edge.a[0] - origin[0]) * d[1] - (edge.a[1] - origin[1]) * d[0]) / den;
      if (s > 0 && u >= 0 && u <= 1 && (!best || s < best.s)) best = { s, edge };
    });
    return best;
  };
  const geometry = {};
  const placed = new Map(); // center id → label boxes already placed there
  const gates = Object.values(gatePoints).map((gate) => {
    const center = HD_BODYGRAPH_CENTERS.find((item) => item.id === HD_GATE_CENTER[gate.id]);
    const polygon = hdCenterPolygon(center);
    const edges = edgesOf(polygon);
    // Ray from the gate's outer end (the channel midpoint) toward the center.
    const origin = [gate.x2, gate.y2];
    const length = Math.hypot(gate.x1 - gate.x2, gate.y1 - gate.y2);
    const d = [(gate.x1 - gate.x2) / length, (gate.y1 - gate.y2) / length];
    const hit = entry(origin, d, edges);
    // A gate whose line doesn't reach its center at all (possible while repositioning
    // gates) is drawn as given, with its number at the center's middle.
    if (!hit) return { gate, center, cornerDistance: Infinity };
    const crossing = [origin[0] + d[0] * hit.s, origin[1] + d[1] * hit.s];
    const cornerDistance = Math.min(...polygon.map(([x, y]) => Math.hypot(x - crossing[0], y - crossing[1])));
    return { gate, center, edges, origin, d, hit, crossing, cornerDistance };
  });
  // Labels nearest a corner have the least room, so they claim their spot first; the
  // rest then shift around them, which keeps labels in the same order as their gates.
  gates.sort((first, second) => first.cornerDistance - second.cornerDistance);
  gates.forEach(({ gate, center, edges, origin, d, hit, crossing }) => {
    if (!hit) {
      geometry[gate.id] = { ...gate, center: center.id, labelX: center.x, labelY: center.y };
      return;
    }
    const side = [-d[1], d[0]];
    // The line's last few units and its round cap must lie under the center (its
    // outline stroke reaches 1 unit outside). Start at the deepest crossing among the
    // centerline and both line edges plus the cap; near a corner, where going deeper
    // pokes out through the next edge, search along the line for a depth that hides it.
    const hidden = (s) => {
      for (let back = -HD_GATE_TRACK_HALF_WIDTH; back <= 0; back += 1)
        for (let k = -1; k <= 1; k += 0.5) {
          const point = [origin[0] + d[0] * (s + back) + side[0] * k * HD_GATE_TRACK_HALF_WIDTH, origin[1] + d[1] * (s + back) + side[1] * k * HD_GATE_TRACK_HALF_WIDTH];
          if (inset(point, edges) < -1) return false;
        }
      return true;
    };
    const deepest = Math.max(...[-1, 0, 1].map((k) => {
      const offset = [origin[0] + side[0] * k * HD_GATE_TRACK_HALF_WIDTH, origin[1] + side[1] * k * HD_GATE_TRACK_HALF_WIDTH];
      return entry(offset, d, edges)?.s ?? hit.s;
    }));
    let end = deepest + HD_GATE_TRACK_HALF_WIDTH + 1;
    if (!hidden(end)) {
      for (let s = hit.s; s <= hit.s + 40; s += 0.5)
        if (hidden(s)) { end = s; break; }
    }
    const halfW = (String(gate.id).length * HD_GATE_LABEL_SIZE.charWidth) / 2 + 0.5;
    const halfH = HD_GATE_LABEL_SIZE.height / 2;
    const { n, t } = hit.edge;
    const base = halfW * Math.abs(n[0]) + halfH * Math.abs(n[1]) + HD_GATE_LABEL_MARGIN;
    const others = placed.get(center.id) || [];
    const fits = ([x, y]) =>
      [[x - halfW, y - halfH], [x + halfW, y - halfH], [x + halfW, y + halfH], [x - halfW, y + halfH]]
        .every((corner) => inset(corner, edges) >= HD_GATE_LABEL_MARGIN) &&
      others.every((box) => Math.abs(box.x - x) >= box.halfW + halfW + 1.5 || Math.abs(box.y - y) >= box.halfH + halfH + 1.5);
    // Cheapest candidate first: straight in from the crossing, then deeper, then
    // (only if needed, near corners) slid along the edge.
    const candidates = [];
    for (let deeper = 0; deeper <= 30; deeper += 0.5)
      for (let slide = 0; slide <= 20; slide += 0.5)
        candidates.push({ deeper, slide, cost: deeper + slide * 1.5 });
    candidates.sort((first, second) => first.cost - second.cost);
    let label = null;
    for (const { deeper, slide } of candidates) {
      for (const sign of slide ? [1, -1] : [1]) {
        const depth = base + deeper;
        const point = [crossing[0] + n[0] * depth + t[0] * slide * sign, crossing[1] + n[1] * depth + t[1] * slide * sign];
        if (fits(point)) { label = point; break; }
      }
      if (label) break;
    }
    label = label || [center.x, center.y];
    placed.set(center.id, [...others, { x: label[0], y: label[1], halfW, halfH }]);
    geometry[gate.id] = {
      ...gate,
      x1: origin[0] + d[0] * end,
      y1: origin[1] + d[1] * end,
      center: center.id,
      labelX: label[0],
      labelY: label[1],
    };
  });
  return geometry;
}
const HD_BODYGRAPH_GATE_GEOMETRY = hdGateGeometryFrom(HD_BODYGRAPH_GATE_POINTS);
const HD_BODYGRAPH_SILHOUETTE =
  '<path class="hd-silhouette" d="M244 28 C218 15 187 24 171 48 C160 64 158 82 163 96 C166 105 161 112 151 118 L126 132 C119 136 121 143 130 147 L148 153 L139 160 L148 166 C143 177 146 191 154 202 C162 213 175 219 190 222 L190 247 C184 263 168 276 143 287 C110 302 87 330 75 365 C64 397 64 432 72 466 C81 505 99 542 111 589 L140 589 C145 550 155 518 171 490 C184 467 198 449 220 438 C243 449 257 467 270 490 C286 518 296 550 301 589 L330 589 C342 542 359 505 368 466 C376 432 376 397 365 365 C353 330 330 302 297 287 C274 276 257 263 250 247 L250 205 C260 187 266 164 264 139 C262 104 266 66 255 42 C252 35 249 31 244 28 Z"/>';

// The four Variable arrows beside the head: Design on the left (accent), Personality on
// the right (ink), each pair's top arrow from the Sun and bottom from the North Node.
// Each points left for a tone of 1–3 and right for 4–6 (typology.variable).
const HD_VARIABLE_ARROWS = [
  { key: "digestion", x: 138, y: 58, color: "var(--accent)", source: "Design Sun", tone: (typology) => [t("Cognition {n}", { n: 1 }), typology.cognitions[0]], phs: (typology) => t("Digestion: {name} - {side}", { name: tName(typology.phs.digestion.name), side: tName(typology.phs.digestion.side) }) },
  { key: "environment", x: 138, y: 86, color: "var(--accent)", source: "Design Node", tone: (typology) => [t("Cognition {n}", { n: 2 }), typology.cognitions[1]], phs: (typology) => t("Environment: {name} - {side}", { name: tName(typology.phs.environment.name), side: tName(typology.phs.environment.side) }) },
  { key: "motivation", x: 302, y: 58, color: "var(--ink)", source: "Personality Sun", tone: (typology) => [t("Sense {n}", { n: 1 }), typology.senses[0]], phs: (typology) => t("Motivation: {name} - {side}", { name: tName(typology.phs.motivation.name), side: tName(typology.phs.motivation.side) }) },
  { key: "perspective", x: 302, y: 86, color: "var(--ink)", source: "Personality Node", tone: (typology) => [t("Sense {n}", { n: 2 }), typology.senses[1]], phs: (typology) => t("Perspective: {name} - {side}", { name: tName(typology.phs.perspective.name), side: tName(typology.phs.perspective.side) }) },
];
const hdAttribute = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// Drawn only for a single chart's state (a composite has no Variable).
function hdVariableArrowsMarkup(state) {
  const typology = state?.hd ? computeHumanDesignTypology(state.hd) : null;
  if (!typology) return "";
  const half = 16, head = 9, wing = 6;
  return HD_VARIABLE_ARROWS.filter((arrow) => {
    const [side, planet] = arrow.source.toLowerCase().split(" ");
    return hdInfluenceIncluded(state.filter || "Complete", side, planet === "sun" ? "Sun" : "North Node");
  }).map((arrow) => {
    const direction = typology.variable[arrow.key];
    const toward = direction === "Left" ? -1 : 1;
    const { x, y } = arrow;
    const tip = x + toward * half, tail = x - toward * half, neck = tip - toward * head;
    const [toneLabel, tone] = arrow.tone(typology);
    const tooltip = [t("{source} · tone {tone} · {direction}", { source: tName(arrow.source), tone: tone.tone, direction: tName(direction) }), arrow.phs(typology), `${toneLabel}: ${tName(tone.name)}`];
    return `<g class="hd-variable-arrow" data-hd-arrow="${arrow.key}" data-direction="${direction.toLowerCase()}" data-tooltip="${hdAttribute(tooltip.join("\n"))}" style="color:${arrow.color}">
      <rect x="${x - half - 4}" y="${y - wing - 4}" width="${half * 2 + 8}" height="${wing * 2 + 8}" class="hd-arrow-hit"/>
      <line x1="${tail}" y1="${y}" x2="${neck}" y2="${y}"/>
      <polygon points="${tip},${y} ${neck},${y - wing} ${neck},${y + wing}"/>
    </g>`;
  }).join("");
}
// One tooltip for every arrow on the page, whichever bodygraph it's in: a muted source
// line, then the PHS reading and the cognition/sense.
(() => {
  let tooltip = null;
  document.addEventListener("mousemove", (event) => {
    const arrow = event.target.closest?.("[data-hd-arrow]");
    if (!arrow) {
      if (tooltip) tooltip.hidden = true;
      return;
    }
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "wheel-tooltip";
      document.body.appendChild(tooltip);
    }
    const [source, ...lines] = arrow.dataset.tooltip.split("\n");
    tooltip.innerHTML = `<div class="wheel-tooltip-sub">${hdAttribute(source)}</div>${lines.map((line) => `<div class="wheel-tooltip-main">${hdAttribute(line)}</div>`).join("")}`;
    tooltip.hidden = false;
    const x = event.clientX + 14 + tooltip.offsetWidth > window.innerWidth ? event.clientX - 14 - tooltip.offsetWidth : event.clientX + 14;
    const y = event.clientY + 14 + tooltip.offsetHeight > window.innerHeight ? event.clientY - 14 - tooltip.offsetHeight : event.clientY + 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
})();

function hdContrastTextColor(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16),
    g = parseInt(value.substring(2, 4), 16),
    b = parseInt(value.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#242622" : "#fff";
}
// Each center's outline as polygon vertices — the single source for drawing the
// center and for fitting gate ends and labels inside it.
function hdCenterPolygon(center) {
  const { x, y } = center;
  switch (center.shape) {
    case "square": return [[x - 32, y - 25], [x + 32, y - 25], [x + 32, y + 25], [x - 32, y + 25]];
    case "up-triangle":
    case "triangle": return [[x, y - 30], [x + 35, y + 27], [x - 35, y + 27]];
    case "down-triangle": return [[x - 35, y - 27], [x + 35, y - 27], [x, y + 30]];
    case "left-triangle": return [[x + 34, y], [x - 27, y - 31], [x - 27, y + 31]];
    case "right-triangle": return [[x - 34, y], [x + 27, y - 31], [x + 27, y + 31]];
    case "scalene": return [[x - 34, y + 24], [x + 25, y + 11], [x + 8, y - 32]];
    default: return [[x, y - 37], [x + 37, y], [x, y + 37], [x - 37, y]];
  }
}
function hdCenterShape(center, defined) {
  const fill = defined ? center.color : "var(--panel)";
  const points = hdCenterPolygon(center).map((point) => point.join(",")).join(" ");
  return `<polygon style="fill:${fill};stroke:${center.color}" points="${points}"/>`;
}
// A gate-half is a single SVG line, but a gate can be lit by both sides at
// once — offsetSegment nudges a copy of the line perpendicular to itself so
// two parallel strokes (ink + accent) can sit side by side without overlapping.
function offsetSegment(x1, y1, x2, y2, offset) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  return {
    x1: x1 + nx * offset,
    y1: y1 + ny * offset,
    x2: x2 + nx * offset,
    y2: y2 + ny * offset,
  };
}
// `side` is "personality", "design", "both", or (Pair Explorer composite) an array of
// one or two fill classes such as ["person-a", "person-b"].
function hdGateFillMarkup(g, side) {
  const sides = side === "both" ? ["personality", "design"] : Array.isArray(side) ? side : side ? [side] : [];
  if (sides.length === 2) {
    const a = offsetSegment(g.x1, g.y1, g.x2, g.y2, -1.6);
    const b = offsetSegment(g.x1, g.y1, g.x2, g.y2, 1.6);
    return `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" class="channel-fill hd-half-channel ${sides[0]}"/><line x1="${b.x1}" y1="${b.y1}" x2="${b.x2}" y2="${b.y2}" class="channel-fill hd-half-channel ${sides[1]}"/>`;
  }
  if (!sides.length) return "";
  return `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="channel-fill hd-half-channel ${sides[0]}"/>`;
}
function hdBodygraphGateMarkup(state) {
  return Object.values(HD_BODYGRAPH_GATE_GEOMETRY)
    .map((g) => {
      const side = state ? state.gateSide(g.id) : null;
      // Optional extras a state may provide (the Pair Explorer composite does): a
      // halo under the gate, and a richer hover title.
      const halo = state?.gateHalo?.(g.id)
        ? `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="hd-channel-halo"/>`
        : "";
      const title = state?.gateTitle?.(g.id) || t("Gate {gate}", { gate: g.id });
      return `<g class="hd-gate-half" tabindex="0" id="gate-pipe-${g.id}" data-gate="${g.id}">
    <title>${title}</title>${halo}<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="channel-track hd-half-channel"/>
    ${hdGateFillMarkup(g, side)}</g>`;
    })
    .join("");
}
function hdBodygraphCenterMarkup(state) {
  return HD_BODYGRAPH_CENTERS.map((center) => {
    const defined = state ? state.centerDefined(center.id) : false;
    return `<g id="${center.id}" class="design-center ${defined ? "defined" : "undefined"}"
    tabindex="0" data-center="${center.name}">${hdCenterShape(center, defined)}</g>`;
  }).join("");
}
// Gate numbers, colored for what's under them: a defined center's own (theme-
// independent) color, or the undefined center's theme panel fill.
function hdBodygraphLabelMarkup(state) {
  return Object.values(HD_BODYGRAPH_GATE_GEOMETRY)
    .map((g) => {
      const center = HD_BODYGRAPH_CENTERS.find((item) => item.id === g.center);
      const defined = state ? state.centerDefined(center.id) : false;
      const tone = !defined ? "on-undefined" : hdContrastTextColor(center.color) === "#fff" ? "on-dark" : "on-light";
      return `<text x="${g.labelX.toFixed(2)}" y="${g.labelY.toFixed(2)}" class="hd-gate-label ${tone}">${g.id}</text>`;
    })
    .join("");
}
// One path per channel (36), running along its two gates' lines: gate A's inner end →
// the shared midpoint → gate B's inner end (the integration gates 10/20/34/57 all meet
// at channel 20–57's midpoint, so their channels follow the same rule). A channel whose
// two gates are both active in `state` is defined: its path is live — hoverable, with
// a highlight — and carries data-channel for tooltips and clicks. Undefined channels
// stay hidden and ignore the pointer. The path is transparent, so the gate colors
// (personality/design, or person A/B) show through.
function hdBodygraphChannelMarkup(state) {
  const point = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return HD_BODYGRAPH_CHANNELS.map(([gateA, gateB]) => {
    const a = HD_BODYGRAPH_GATE_GEOMETRY[gateA], b = HD_BODYGRAPH_GATE_GEOMETRY[gateB];
    const defined = Boolean(state && state.gateSide(gateA) && state.gateSide(gateB));
    const info = hdChannelInfo([gateA, gateB]);
    return `<path id="${hdChannelId([gateA, gateB])}" class="hd-channel${defined ? " defined" : ""}" data-channel="${hdChannelKey([gateA, gateB])}" d="M ${point(a.x1, a.y1)} L ${point(a.x2, a.y2)} L ${point(b.x1, b.y1)}"><title>${t("Channel {gates} · {name}", { gates: info.gates, name: tName(info.name) })}</title></path>`;
  }).join("");
}
// Draw order: gates, then channels (above the gates), then centers (hiding the gates'
// and channels' inner ends), then gate numbers.
function hdBodygraphLayersMarkup(state) {
  return `<g data-gate-layer>${hdBodygraphGateMarkup(state)}</g><g data-channel-layer>${hdBodygraphChannelMarkup(state)}</g><g data-center-layer>${hdBodygraphCenterMarkup(state)}</g><g data-label-layer>${hdBodygraphLabelMarkup(state)}</g><g data-variable-layer>${hdVariableArrowsMarkup(state)}</g>`;
}
// Redraws every bodygraph inside `root` (the Chart Explorer's, or the mandala's) for `state`.
function refreshHdBodygraphLayers(root, state) {
  root.querySelectorAll("[data-bodygraph-layers]").forEach((layers) => {
    layers.innerHTML = hdBodygraphLayersMarkup(state);
    bindHdGateClicks(layers);
    bindHdCenterClicks(layers);
  });
}
function bindHdGateClicks(container) {
  container.querySelectorAll(".hd-gate-half").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(t("Gate {gate} · {side} influence", { gate: node.dataset.gate, side: tName(activeSystemFilter) }));
    }),
  );
}
function bindHdCenterClicks(container) {
  container
    .querySelectorAll(".design-center")
    .forEach((node) =>
      node.addEventListener("click", () =>
        showToast(t("{center} center", { center: tName(node.dataset.center) })),
      ),
    );
}

// ── Typology display (Chart Snapshot panel, Variable/PHS cards, Bases) ────
function hdChannelBadgeText(typology) {
  return t("{count} / 36 CHANNELS DEFINED", { count: typology ? typology.definedChannels.length : 0 });
}
// Tooltips for the typology features (texts from hd-meanings.js): `kind` is a key of
// HD_FEATURE_MEANINGS; `value` the chart's value for it, and `type` its Type (which
// Aura and Strategy depend on). A feature without a value explains only itself.
function hdTipAttributes(kind, value = "", type = "") {
  return `tabindex="0" data-hd-tip="${kind}" data-hd-tip-value="${escapeHtml(String(value))}" data-hd-tip-type="${escapeHtml(String(type))}"`;
}
function hdTypologyTipHtml(element) {
  const { hdTip: kind, hdTipValue: value, hdTipType: type } = element.dataset;
  const feature = HD_FEATURE_MEANINGS[kind];
  if (!feature) return "";
  let meaning = "";
  if (kind === "type") meaning = HD_TYPE_MEANINGS[value];
  else if (kind === "aura") meaning = HD_AURA_MEANINGS[type];
  else if (kind === "strategy") meaning = HD_STRATEGY_MEANINGS[type];
  else if (kind === "authority") meaning = HD_AUTHORITY_MEANINGS[value];
  else if (kind === "definition") meaning = HD_DEFINITION_MEANINGS[value];
  else if (kind === "profile" && value) {
    const lines = value.split("/").map(Number);
    meaning = `<b>${lines[0]}</b> (${t("conscious")}) ${HD_LINE_MEANINGS[lines[0] - 1] || ""}<br><b>${lines[1]}</b> (${t("unconscious")}) ${HD_LINE_MEANINGS[lines[1] - 1] || ""}`;
  }
  const title = value && kind !== "aura" && kind !== "strategy" ? `${feature.label}: ${escapeHtml(kind === "profile" ? value : tName(value))}` : feature.label;
  return `<div class="gk-tip-title">${title}</div><div class="gk-tip-text">${feature.text}</div>${meaning ? `<div class="gk-tip-title">${type && (kind === "aura" || kind === "strategy") ? t("For a {type}", { type: escapeHtml(tName(type)) }) : t("This chart")}</div><div class="gk-tip-text">${meaning}</div>` : ""}`;
}
bindHoverTooltips("[data-hd-tip]", hdTypologyTipHtml, "hdTooltip");

function hdTypologyAsideMarkup(typology, { showFilter = true } = {}) {
  if (!typology) return `<span class="eyebrow">${t("CHART SNAPSHOT")}</span><h3>${t("No chart")}</h3><p>${t("Select a chart to see its Human Design typology.")}</p>`;
  const stat = (label, value, kind) => `<div class="system-stat${kind ? " hd-tip-stat" : ""}"${kind ? ` ${hdTipAttributes(kind, kind === "profile" ? typology.profile : typology[kind], typology.type)}` : ""}><span>${label}</span><strong>${value}</strong></div>`;
  return `
    <span class="eyebrow">${t("CHART SNAPSHOT")}</span>
    <h3>${tName(typology.type)} · ${typology.profile}</h3>
    <p>${hdProfileNamesText(typology.profileNames)} · ${t("{authority} authority", { authority: tName(typology.authority) })}</p>
    ${stat(t("TYPE"), tName(typology.type), "type")}
    ${stat(t("AURA"), tName(typology.aura), "aura")}
    ${stat(t("STRATEGY"), tName(typology.strategy), "strategy")}
    ${stat(t("NOT-SELF THEME"), tName(typology.notSelf))}
    ${stat(t("SIGNATURE"), tName(typology.signature))}
    ${stat(t("INNER AUTHORITY"), tName(typology.authority), "authority")}
    ${stat(t("DEFINITION"), tName(typology.definition), "definition")}
    ${stat(t("PROFILE"), `${typology.profile} · ${hdProfileNamesText(typology.profileNames)}`, "profile")}
    ${stat(t("INCARNATION CROSS"), `${tName(typology.cross.angle)} · ${typology.cross.gates}`)}
    ${stat(t("QUADRANT"), `${tName(typology.quadrant.name)} · ${tName(typology.quadrant.theme)}`)}
    ${stat(t("DEFINED CENTERS"), `<span data-hd-defined-centers>${typology.definedCenters.size} / 9</span>`)}
    ${stat(t("DEFINED CHANNELS"), `${typology.definedChannels.length} / 36`)}
    ${showFilter ? stat(t("FILTER"), tName(activeSystemFilter)) : ""}`;
}
// One row per channel: gates, name, the two centers it joins, and an optional note
// (the Pair Explorer uses it for who brings which gate). Clicking a row opens a short
// description of the channel (HD_CHANNEL_MEANINGS, hd-meanings.js).
function hdChannelListMarkup(channels, note = () => "") {
  if (!channels.length) return `<p class="hd-channel-empty">${t("None")}</p>`;
  return `<div class="hd-channel-list">${channels
    .map((channel) => {
      const gates = channel.gates || channel;
      const info = hdChannelInfo(gates);
      const extra = note(channel);
      const meaning = HD_CHANNEL_MEANINGS[hdChannelKey(gates)];
      return `<details class="hd-channel-item"><summary><b>${info.gates}</b><span>${tName(info.name)}</span><small>${hdCentersText(info.centers)}${extra ? ` · ${extra}` : ""}</small></summary>${meaning ? `<p>${meaning}</p>` : ""}</details>`;
    })
    .join("")}</div>`;
}
function hdTypologyDetailsMarkup(typology) {
  if (!typology) return "";
  const row = (label, value, detail) => `
    <div class="hd-typology-row"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
  const { variable, phs } = typology;
  return `
    <div class="hd-channels">
      <span class="eyebrow">${t("DEFINED CHANNELS")} · ${typology.definedChannels.length} / 36</span>
      ${hdChannelListMarkup(typology.definedChannels)}
    </div>
    <div class="hd-typology">
      <div class="hd-typology-card">
        <h3>${t("Variable/PHS")} <small>${variable.notation}</small></h3>
        ${row(t("Digestion"), `${tName(phs.digestion.name)} · ${tName(phs.digestion.side)}`, t("{source} · color {color}", { source: tName("Design Sun"), color: phs.digestion.color }))}
        ${row(t("Environment"), `${tName(phs.environment.name)} · ${tName(phs.environment.side)}`, t("{source} · color {color}", { source: tName("Design Node"), color: phs.environment.color }))}
        ${row(t("Motivation"), `${tName(phs.motivation.name)} · ${tName(phs.motivation.side)}`, t("{source} · color {color}", { source: tName("Personality Sun"), color: phs.motivation.color }))}
        ${row(t("Perspective"), `${tName(phs.perspective.name)} · ${tName(phs.perspective.side)}`, t("{source} · color {color}", { source: tName("Personality Node"), color: phs.perspective.color }))}
      </div>
      <div class="hd-typology-card">
        <h3>${t("Senses & Cognitions")}</h3>
        ${typology.cognitions.map((cognition, index) => row(t("Cognition {n}", { n: index + 1 }), tName(cognition.name), t("{source} · tone {tone}", { source: tName(cognition.source), tone: cognition.tone }))).join("")}
        ${typology.senses.map((sense, index) => row(t("Sense {n}", { n: index + 1 }), tName(sense.name), t("{source} · tone {tone}", { source: tName(sense.source), tone: sense.tone }))).join("")}
      </div>
    </div>
    <div class="hd-bases">
      <span class="eyebrow">${t("BASES")}</span>
      <div class="hd-bases-list">${HD_BASES.map((base, index) => `<div class="hd-base"><b>${index + 1}</b><span>${tName(base)}</span></div>`).join("")}</div>
      <p>${t("The base is the finest division of every activation — the last number in G.L.C.T.B. It isn't assigned as a chart type, so it's listed here for reference.")}</p>
    </div>`;
}
// Re-renders every typology-derived part of the bodygraph view for `hd`.
function updateHdTypology(surface, hd) {
  const typology = hd ? computeHumanDesignTypology(hd) : null;
  const aside = surface.querySelector("[data-hd-typology]");
  if (aside) aside.innerHTML = hdTypologyAsideMarkup(typology);
  const details = surface.querySelector("[data-hd-typology-details]");
  if (details) details.innerHTML = hdTypologyDetailsMarkup(typology);
  const badge = surface.querySelector("[data-hd-channel-badge]");
  if (badge) badge.textContent = hdChannelBadgeText(typology);
}

function renderBodygraph(surface, chart) {
  if (activeSystemTab === "Mandala")
    return renderHumanDesignMandala(surface, chart);
  const gates = Array.from({ length: 64 }, (_, index) => index + 1);
  const planets = HD_PLANET_GLYPHS;
  const state = chart ? computeBodygraphState(chart, 0, activeSystemFilter) : null;
  const hd = state ? state.hd : null;
  const visiblePlanetIndexes =
    activeSystemFilter === "Incarnation Cross"
      ? [0, 1]
      : activeSystemFilter === "Personality"
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : activeSystemFilter === "Design"
          ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          : planets.map((_, index) => index);
  const columnData = (side, color) =>
    visiblePlanetIndexes
      .map((index) => {
        const influence = hd
          ? side === "design"
            ? hd.design[index]
            : hd.personality[index]
          : null;
        const label = hdInfluenceText(influence);
        return `
      <div class="hd-planet ${side}" style="--row:${index};color:${color}">
        <span>${planets[index]}</span>
        <b data-hd-set="${side}" data-hd-index="${index}">${label}</b>
      </div>`;
      })
      .join("");
  const hdTimelineMarkup = hdTimelineControlMarkup(chart, 0);
  const filterClass = activeSystemFilter.toLowerCase().replace(" ", "-");
  surface.innerHTML = `
    <div class="hd-layout ${filterClass}">
      <div class="hd-column design-column">
        <div class="hd-column-title">${t("Design")}</div>
        ${columnData("design", "var(--accent)")}
      </div>
      <div class="system-visual hd-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${t("BODYGRAPH")} / ${tName(activeSystemTab).toUpperCase()} / ${tName(activeSystemFilter).toUpperCase()}</span>
          <div class="hd-toolbar-right">
            <label class="fix-zodiac-toggle hd-precision-toggle" title="${t("Show gate.line.color.tone.base for every planet")}"><input type="checkbox" data-hd-precision ${hdFullPrecision ? "checked" : ""}>${t("Full precision")}</label>
            <span class="sample-badge" data-hd-channel-badge></span>
          </div>
        </div>
        <svg class="bodygraph hd-bodygraph" viewBox="0 0 440 640" role="img" aria-label="${t("Human Design bodygraph")}">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-bodygraph-layers>${hdBodygraphLayersMarkup(state)}</g>
        </svg>
        ${hdTimelineMarkup}
      </div>
      <div class="hd-column personality-column">
        <div class="hd-column-title">${t("Personality")}</div>
        ${columnData("personality", "var(--ink)")}
      </div>
    </div>
    <aside class="system-info hd-info" data-hd-typology></aside>
    <div data-hd-typology-details></div>`;
  bindBodygraphHoverDebug(surface.querySelector(".hd-bodygraph"));
  bindHdCenterClicks(surface);
  bindHdGateClicks(surface);
  if (hd) surface._hdInfluences = hd;
  surface.querySelector("[data-hd-precision]")?.addEventListener("change", (event) => {
    hdFullPrecision = event.target.checked;
    if (surface._hdInfluences) hdUpdateInfluenceLabels(surface, surface._hdInfluences);
  });
  updateHdTypology(surface, hd);
  const timelineContainer = surface.querySelector(
    ".hd-visual .timeline-control",
  );
  if (timelineContainer && chart) {
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offsetMinutes) => {
        updateTimelineReadout(timelineContainer, chart, offsetMinutes);
        updateHumanDesignInfluences(surface, chart, offsetMinutes);
      },
    });
  }
}

function updateHdDefinedCentersStat(surface, state) {
  const stat = surface.querySelector("[data-hd-defined-centers]");
  if (!stat) return;
  const definedCount = state
    ? HD_BODYGRAPH_CENTERS.filter((center) => state.centerDefined(center.id))
        .length
    : 0;
  stat.textContent = `${definedCount} / 9`;
}

function updateHumanDesignInfluences(surface, chart, offsetMinutes) {
  const state = computeBodygraphState(chart, offsetMinutes, activeSystemFilter);
  const hd = state.hd;
  hdUpdateInfluenceLabels(surface, hd);
  refreshHdBodygraphLayers(surface, state);
  updateHdTypology(surface, hd);
}

// The mandala SVG (gate/zodiac rings, gate sectors and planet glyphs, and the nested
// bodygraph drawn from `state`). glyphMap fills the sector and glyph layers up front;
// without it they start empty (the Chart Explorer's timeline slider fills them).
function hdMandalaSvgMarkup(state, glyphMap = null) {
  const gate55Index = MANDALA_GATE_ORDER.indexOf(55);
  const gate55Angle = MANDALA_GATE25_ANGLE - gate55Index * MANDALA_GATE_STEP;
  const zodiacSigns = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ];
  const zodiacGlyphs = [
    "♈",
    "♉",
    "♊",
    "♋",
    "♌",
    "♍",
    "♎",
    "♏",
    "♐",
    "♑",
    "♒",
    "♓",
  ];
  const gateRing = MANDALA_GATE_ORDER.map((gate, index) => {
    const angle = MANDALA_GATE25_ANGLE - index * MANDALA_GATE_STEP;
    const point = mandalaPolar(250, angle - MANDALA_GATE_STEP / 2);
    const tickStart = mandalaPolar(232, angle);
    const tickEnd = mandalaPolar(268, angle);
    return `<line x1="${tickStart.x}" y1="${tickStart.y}" x2="${tickEnd.x}" y2="${tickEnd.y}" class="mandala-gate-tick"/><text x="${point.x}" y="${point.y}" class="mandala-gate" text-anchor="middle" dominant-baseline="middle">${gate}</text>`;
  }).join("");
  const zodiacRing = zodiacSigns
    .map((sign, index) => {
      // gate55Angle is where gate 55 STARTS in this mandala's coordinates, and
      // gate 55 itself starts at 0°07'30" Pisces (HD_GATE55_START = 330.125°
      // tropical, human-design.js). Angle decreases as real ecliptic degree
      // increases (same convention gateRing uses just above), so sign `index`'s
      // boundary (at real degree index*30) sits (index*30 - HD_GATE55_START)
      // degrees of real motion past gate 55's start, wrapped to [0, 360) — which
      // puts the Pisces cusp 1/8° before gate 55 rather than on it.
      const startAngle = gate55Angle - ((((index * 30 - HD_GATE55_START) % 360) + 360) % 360);
      const labelAngle = startAngle - 15;
      const point = mandalaPolar(298, labelAngle);
      const innerBoundary = mandalaPolar(278, startAngle);
      const outerBoundary = mandalaPolar(318, startAngle);
      return `
        <line x1="${innerBoundary.x}" y1="${innerBoundary.y}" x2="${outerBoundary.x}" y2="${outerBoundary.y}" class="zodiac-boundary"/>
        <text x="${point.x}" y="${point.y}" class="mandala-zodiac ${SIGN_ELEMENTS[index]}" text-anchor="middle" dominant-baseline="middle">
          <tspan class="zodiac-glyph">${zodiacGlyphs[index]}</tspan>
        </text>`;
    })
    .join("");
  // One ray per actual gate boundary (64 of them, every MANDALA_GATE_STEP =
  // 5.625deg), anchored the same way gateRing's own ticks are — not the
  // previous 36 generic lines at a flat 10deg spacing, which didn't
  // correspond to anything in the gate wheel at all.
  const rays = MANDALA_GATE_ORDER.map((_, index) => {
    const angle = MANDALA_GATE25_ANGLE - index * MANDALA_GATE_STEP;
    const point = mandalaPolar(275, angle);
    return `<line x1="${MANDALA_CENTER}" y1="${MANDALA_CENTER}" x2="${point.x}" y2="${point.y}" class="mandala-ray"/>`;
  }).join("");
  return `
        <svg class="hd-mandala" viewBox="0 0 660 660" role="img" aria-label="${t("Human Design mandala with zodiac and gate rings")}">
          ${MANDALA_GATE_SECTOR_GRADIENTS}
          ${rays}
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="318" class="mandala-outer"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="278" class="mandala-zodiac-ring"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="270" class="mandala-ring"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="218" class="mandala-ring"/>
          <g data-mandala-sectors>${glyphMap ? mandalaGateSectorsMarkup(glyphMap) : ""}</g>
          ${zodiacRing}
          ${gateRing}
          <g data-mandala-glyphs>${glyphMap ? mandalaGlyphLayerMarkup(glyphMap) : ""}</g>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="128" class="mandala-core"/>
          <svg class="mandala-bodygraph" x="${MANDALA_CENTER - MANDALA_BODYGRAPH_WIDTH / 2}" y="${MANDALA_CENTER - MANDALA_BODYGRAPH_HEIGHT / 2}" width="${MANDALA_BODYGRAPH_WIDTH}" height="${MANDALA_BODYGRAPH_HEIGHT}" viewBox="0 0 440 640" role="img" aria-label="${t("Bodygraph")}">
            ${HD_BODYGRAPH_SILHOUETTE}
            <g data-bodygraph-layers>${hdBodygraphLayersMarkup(state)}</g>
          </svg>
        </svg>`;
}

function renderHumanDesignMandala(surface, chart, offsetMinutes = 0) {
  const state = chart ? computeBodygraphState(chart, offsetMinutes, activeSystemFilter) : null;
  const hdTimelineMarkup = hdTimelineControlMarkup(chart, offsetMinutes);
  surface.innerHTML = `
    <div class="hd-mandala-layout">
      <div class="system-visual hd-mandala-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${t("MANDALA")} / ${tName(activeSystemTab).toUpperCase()}</span>
        </div>
        ${hdMandalaSvgMarkup(state)}
        ${hdTimelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">${t("MANDALA KEY")}</span>
        <h3>${t("Gate wheel · 64 gates")}</h3>
        <p>${t("Gate 25 begins at the leftmost cusp and the sequence advances counterclockwise. Gate 55 opens at 0°07′30″ Pisces, 1/8° past the Pisces cusp.")}</p>
        <div class="system-stat"><span>${t("GATE CUSPS")}</span><strong>64 / 64</strong></div>
        <div class="system-stat"><span>${t("ZODIAC CUSPS")}</span><strong>12 / 12</strong></div>
        <div class="system-stat"><span>${t("GATE 55")}</span><strong>0°07′30″ ${tName("Pisces")}</strong></div>
        <div class="system-stat"><span>${t("DEFINED CENTERS")}</span><strong data-hd-defined-centers>0 / 9</strong></div>
        <div class="system-note">${t("Personality influences appear in ink; design influences appear in the accent color, matching the bodygraph.")}</div>
      </aside>
    </div>
    <aside class="system-info hd-info" data-hd-typology></aside>
    <div data-hd-typology-details></div>`;
  bindMandalaHoverDebug(surface.querySelector(".hd-mandala"));
  bindBodygraphHoverDebug(surface.querySelector(".mandala-bodygraph"));
  bindHdCenterClicks(surface);
  bindHdGateClicks(surface);
  updateHdDefinedCentersStat(surface, state);
  updateHdTypology(surface, state?.hd || null);
  const timelineContainer = surface.querySelector(
    ".hd-mandala-visual .timeline-control",
  );
  if (timelineContainer && chart) {
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offset) => {
        updateTimelineReadout(timelineContainer, chart, offset);
        const glyphMap = humanDesignGateGlyphMap(chart, offset, activeSystemFilter);
        const sectorLayer = surface.querySelector("[data-mandala-sectors]");
        if (sectorLayer)
          sectorLayer.innerHTML = mandalaGateSectorsMarkup(glyphMap);
        const layer = surface.querySelector("[data-mandala-glyphs]");
        if (layer) {
          layer.innerHTML = mandalaGlyphLayerMarkup(glyphMap);
          bindMandalaGlyphClicks(layer);
        }
        const bodygraphState = computeBodygraphState(chart, offset, activeSystemFilter);
        refreshHdBodygraphLayers(surface, bodygraphState);
        updateHdDefinedCentersStat(surface, bodygraphState);
        updateHdTypology(surface, bodygraphState.hd);
      },
    });
  }
}

// Gene Keys "All Paths" profile: the full 11-sphere / 14-path diagram (Activation
// Sequence + Venus Sequence + the IQ/SQ/EQ/Attraction cluster), read directly off a
// reference profile image — the hexagram ring and small per-sphere annotation text
// around it were explicitly excluded per request, only the spheres, paths, and their
// names/colors were kept. Sphere and path ids below (gk-sphere-*, gk-path-*) are
// exactly the inferred names, so they can be checked against the source image.
const GK_BLUE = "#577891";
const GK_RED = "#a4433c";
const GK_GREEN = "#4f8f6a";
const GK_NAVY = "#2c3a86"; // the Star Pearl spheres outside the Pearl Path
const GK_STAR_BLUE = "#3f74d4"; // the Star Pearl paths
// Every sphere below has a set/planet mapping (personality/design × one of the 10
// bodies computeHumanDesignChart already derives), so all 11 read real, live gates —
// not just the 4 Activation Sequence spheres the old Golden Path view below covers.
const GENE_KEYS_ALL_SPHERES = [
  {
    id: "lifeswork",
    name: N_("Life's Work"),
    x: 390,
    y: 55,
    r: 30,
    color: GK_GREEN,
    set: "personality",
    planet: "Sun",
  },
  {
    id: "evolution",
    name: N_("Evolution"),
    x: 690,
    y: 300,
    r: 30,
    color: GK_GREEN,
    set: "personality",
    planet: "Earth",
  },
  {
    id: "radiance",
    name: N_("Radiance"),
    x: 90,
    y: 300,
    r: 30,
    color: GK_GREEN,
    set: "design",
    planet: "Sun",
  },
  {
    id: "purpose",
    name: N_("Purpose"),
    x: 390,
    y: 555,
    r: 30,
    color: GK_GREEN,
    set: "design",
    planet: "Earth",
  },
  {
    id: "attraction",
    name: N_("Attraction"),
    x: 390,
    y: 430,
    r: 30,
    color: GK_RED,
    set: "design",
    planet: "Moon",
  },
  {
    id: "iq",
    name: N_("IQ"),
    x: 255,
    y: 365,
    r: 30,
    color: GK_RED,
    set: "personality",
    planet: "Venus",
  },
  {
    id: "eq",
    name: N_("EQ"),
    x: 525,
    y: 365,
    r: 30,
    color: GK_RED,
    set: "personality",
    planet: "Mars",
  },
  {
    id: "sq",
    name: N_("SQ"),
    x: 390,
    y: 300,
    r: 30,
    color: GK_RED,
    set: "design",
    planet: "Venus",
  },
  {
    id: "vocation",
    name: N_("Vocation"),
    x: 255,
    y: 235,
    r: 30,
    color: GK_RED,
    set: "design",
    planet: "Mars",
  },
  {
    id: "culture",
    name: N_("Culture"),
    x: 525,
    y: 235,
    r: 30,
    color: GK_BLUE,
    set: "design",
    planet: "Jupiter",
  },
  {
    id: "pearl",
    name: N_("Pearl"),
    x: 390,
    y: 175,
    r: 30,
    color: GK_BLUE,
    set: "personality",
    planet: "Jupiter",
  },
];
const GENE_KEYS_SPHERE_BY_ID = new Map(
  GENE_KEYS_ALL_SPHERES.map((sphere) => [sphere.id, sphere]),
);
const GENE_KEYS_SPHERE_INDEX_BY_ID = new Map(
  GENE_KEYS_ALL_SPHERES.map((sphere, index) => [sphere.id, index]),
);
const GENE_KEYS_ALL_EDGES = [
  { a: "lifeswork", b: "evolution", label: N_("Challenge"), color: GK_GREEN },
  { a: "evolution", b: "radiance", label: N_("Breakthrough"), color: GK_GREEN },
  { a: "radiance", b: "purpose", label: N_("Core Stability"), color: GK_GREEN },
  { a: "purpose", b: "attraction", label: N_("Dharma"), color: GK_RED },
  { a: "attraction", b: "iq", label: N_("Karma"), color: GK_RED },
  { a: "iq", b: "eq", label: N_("Intelligence"), color: GK_RED },
  { a: "eq", b: "sq", label: N_("Love"), color: GK_RED },
  { a: "sq", b: "vocation", label: N_("Realisation"), color: GK_RED },
  { a: "vocation", b: "lifeswork", label: N_("Service"), color: GK_BLUE },
  { a: "vocation", b: "culture", label: N_("Initiative"), color: GK_BLUE },
  { a: "culture", b: "lifeswork", label: N_("Growth"), color: GK_BLUE },
  { a: "vocation", b: "pearl", label: N_("Quantum"), color: GK_BLUE },
  { a: "culture", b: "pearl", label: N_("Quantum"), color: GK_BLUE },
  { a: "lifeswork", b: "pearl", label: N_("Quantum"), color: GK_BLUE },
];
function geneKeysGateLabel(sphere, hd) {
  if (!hd || !sphere.set) return "—";
  const influence = hd[sphere.set].find(
    (item) => item.planet === sphere.planet,
  );
  return influence && influence.label
    ? `${influence.gate}.${influence.line}`
    : "—";
}
// A path is active only when BOTH spheres it connects are active (or when
// activeIndexes is null, meaning everything is active — the "All Paths" view).
function geneKeysEdgesMarkup(activeIndexes) {
  return GENE_KEYS_ALL_EDGES.map((edge, index) => {
    const from = GENE_KEYS_SPHERE_BY_ID.get(edge.a);
    const to = GENE_KEYS_SPHERE_BY_ID.get(edge.b);
    const active =
      !activeIndexes ||
      (activeIndexes.has(GENE_KEYS_SPHERE_INDEX_BY_ID.get(edge.a)) &&
        activeIndexes.has(GENE_KEYS_SPHERE_INDEX_BY_ID.get(edge.b)));
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const angleDegrees =
      (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    // Flip the label 180deg when the line runs "backwards" so the text never
    // renders upside-down, regardless of which sphere is listed as a/b.
    const labelAngle =
      angleDegrees > 90 || angleDegrees < -90
        ? angleDegrees + 180
        : angleDegrees;
    const slug = edge.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `
      <g class="gk-path${active ? "" : " disabled"}" tabindex="${active ? "0" : "-1"}" id="gk-path-${slug}-${index}" data-path="${tName(edge.label)}" data-from="${tName(from.name)}" data-to="${tName(to.name)}" style="--gk-path-color:${edge.color}">
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="gk-path-track"/>
        <text x="${midX}" y="${midY}" transform="rotate(${labelAngle} ${midX} ${midY})" text-anchor="middle" class="gk-path-label">${tName(edge.label)}</text>
      </g>`;
  }).join("");
}
// activeIndexes is a Set of GENE_KEYS_ALL_SPHERES indexes to render as "active"
// (full color, interactive), or null to mean every sphere is active (the "All
// Paths" view). Everything outside the set renders greyed-out and inert — no
// tabindex, no click/hover (see the .gk-sphere.disabled / .gk-path.disabled CSS,
// which also sets pointer-events:none).
// Sphere colors per view. A single path's view paints every sphere in that path's
// color. All Paths keeps each sphere's own color, except the three spheres two paths
// share, which blend both colors from bottom left to top right.
const GENE_KEYS_VIEW_COLORS = { "Golden Path": GK_GREEN, "Venus Path": GK_RED, "Pearl Path": GK_BLUE };
const GENE_KEYS_SHARED_SPHERE_BLENDS = {
  purpose: [GK_GREEN, GK_RED], // Golden ∩ Venus
  vocation: [GK_RED, GK_BLUE], // Venus ∩ Pearl
  lifeswork: [GK_BLUE, GK_GREEN], // Pearl ∩ Golden
};
// Gradient ids must be unique per diagram: the Pair Explorer shows two at once, and
// the sphere layer is redrawn as the timeline moves.
let geneKeysBlendCount = 0;
// Cycle Explorer: the gate a sphere's planet is transiting at the cycle moment (the
// planet itself, whichever side the sphere reads natally), drawn below the sphere.
// The sphere's own side of the moment (cycle-moment.js gives a transit the Personality
// side on both).
function geneKeysCycleLabel(sphere, cycleHd) {
  const influence = (cycleHd?.[sphere.set] || cycleHd?.personality)?.find((item) => item.planet === sphere.planet);
  return influence && influence.label ? `${influence.gate}.${influence.line}` : "—";
}
function geneKeysCycleLabelMarkup(sphere, r, cycleHd, active = true) {
  if (!cycleHd || !active) return "";
  return `<text x="${sphere.x}" y="${sphere.y + r + 15}" text-anchor="middle" class="gk-sphere-cycle">${geneKeysCycleLabel(sphere, cycleHd)}</text>`;
}
function geneKeysSpheresMarkup(hd, activeIndexes, tab = "All Paths", cycleHd = null) {
  const viewColor = GENE_KEYS_VIEW_COLORS[tab];
  const prefix = `gk-blend-${(geneKeysBlendCount += 1)}`;
  const defs = viewColor
    ? ""
    : `<defs>${Object.entries(GENE_KEYS_SHARED_SPHERE_BLENDS)
        .map(([id, [from, to]]) => `<linearGradient id="${prefix}-${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`)
        .join("")}</defs>`;
  const fill = (sphere) => viewColor || (GENE_KEYS_SHARED_SPHERE_BLENDS[sphere.id] ? `url(#${prefix}-${sphere.id})` : sphere.color);
  return defs + GENE_KEYS_ALL_SPHERES.map((sphere, index) => {
    const label = geneKeysGateLabel(sphere, hd);
    const active = !activeIndexes || activeIndexes.has(index);
    return `
      <g class="gk-sphere${active ? "" : " disabled"}" tabindex="${active ? "0" : "-1"}" id="gk-sphere-${sphere.id}" data-sphere="${tName(sphere.name)}" data-gate="${label}">
        <circle cx="${sphere.x}" cy="${sphere.y}" r="${sphere.r}" fill="${fill(sphere)}"/>
        <text x="${sphere.x}" y="${sphere.y - 5}" text-anchor="middle" class="gk-sphere-name">${tName(sphere.name)}</text>
        <text x="${sphere.x}" y="${sphere.y + 13}" text-anchor="middle" class="gk-sphere-gate">${label}</text>
        ${geneKeysCycleLabelMarkup(sphere, sphere.r, cycleHd, active)}
      </g>`;
  }).join("");
}
// Disabled spheres/paths get pointer-events:none in CSS (so hover-debug and
// clicks can't reach them at all), but the :not(.disabled) filter here is a
// belt-and-suspenders guard against ever wiring up a toast for a greyed-out
// element regardless of how that CSS rule evolves.
function bindGeneKeysAllPathsClicks(container) {
  container.querySelectorAll(".gk-sphere:not(.disabled)").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(t("{sphere} · Gate {gate}", { sphere: node.dataset.sphere, gate: node.dataset.gate }));
    }),
  );
  container.querySelectorAll(".gk-path:not(.disabled)").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(
        `${node.dataset.path} · ${node.dataset.from} → ${node.dataset.to}`,
      );
    }),
  );
}
// ── Sphere reading tooltip ────────────────────────────────────────────────
// Hovering an active sphere (any Gene Keys diagram) shows what the sphere represents,
// its gate's Shadow / Gift / Siddhi and meaning, and its line in this sphere's context
// — text from gene-keys-data.js. A gate's own line name (GENE_KEYS_LINE_NAMES) is shown
// when listed; otherwise the line's general name.
function geneKeysTooltipHtml(sphereId, sphereName, gateLabel) {
  const sphere = GENE_KEYS_SPHERE_INFO[sphereId];
  const [gate, line] = String(gateLabel).split(".").map(Number);
  const key = GENE_KEYS[gate];
  const lineInfo = GENE_KEYS_LINES[line];
  const section = (title, text) => `<div class="gk-tip-title">${title}</div>${text ? `<div class="gk-tip-text">${text}</div>` : ""}`;
  let html = section(sphereName, sphere?.summary);
  if (key) html += section(t("Gate {gate} ({shadow} / {gift} / {siddhi})", { gate, shadow: key.shadow, gift: key.gift, siddhi: key.siddhi }), key.summary);
  if (key && lineInfo) {
    html += section(t("Line {line} - {name}", { line, name: GENE_KEYS_LINE_NAMES[`${gate}.${line}`] || lineInfo.name }), lineInfo.meaning(sphere?.focus || t("this sphere")));
  }
  return html;
}
(() => {
  let tooltip = null;
  document.addEventListener("mousemove", (event) => {
    const sphere = event.target.closest?.(".gk-sphere:not(.disabled)");
    if (!sphere) {
      if (tooltip) tooltip.hidden = true;
      return;
    }
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "wheel-tooltip gk-tooltip";
      document.body.appendChild(tooltip);
    }
    const id = sphere.id.replace("gk-sphere-", "");
    if (tooltip.dataset.for !== `${id}:${sphere.dataset.gate}`) {
      tooltip.dataset.for = `${id}:${sphere.dataset.gate}`;
      tooltip.innerHTML = geneKeysTooltipHtml(id, sphere.dataset.sphere, sphere.dataset.gate);
    }
    tooltip.hidden = false;
    const x = event.clientX + 14 + tooltip.offsetWidth > window.innerWidth ? event.clientX - 14 - tooltip.offsetWidth : event.clientX + 14;
    const y = event.clientY + 14 + tooltip.offsetHeight > window.innerHeight ? event.clientY - 14 - tooltip.offsetHeight : event.clientY + 14;
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  });
})();

// Debug aid: hovering the Gene Keys diagram shows which sphere/path id is under the
// pointer and its x,y coordinates in the SVG's own space — same pattern as the
// mandala's and bodygraph's own hover-debug helpers.
function ensureGeneKeysHoverTooltip() {
  let tooltip = document.getElementById("geneKeysHoverTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "geneKeysHoverTooltip";
    tooltip.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;display:none;white-space:nowrap;background:var(--ink);color:var(--paper);font:10px "DM Mono",monospace;padding:6px 9px;border-radius:3px;box-shadow:0 8px 20px rgba(0,0,0,.25)';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function bindGeneKeysHoverDebug(svg) {
  if (!svg || svg.dataset.hoverDebugBound) return;
  svg.dataset.hoverDebugBound = "true";
  const tooltip = ensureGeneKeysHoverTooltip();
  svg.addEventListener("mousemove", (event) => {
    // Active spheres have their own reading tooltip (below), so this steps aside.
    if (event.target.closest("[data-hd-arrow], .gk-sphere:not(.disabled)")) {
      tooltip.style.display = "none";
      return;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    const target = event.target;
    const idHolder = target.closest("[id]");
    const label = idHolder
      ? `id: ${idHolder.id}`
      : target.className && target.className.baseVal
        ? `class: ${target.className.baseVal}`
        : `<${target.tagName}>`;
    tooltip.textContent = `${label} · (${svgPoint.x.toFixed(1)},${svgPoint.y.toFixed(1)})`;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.display = "block";
  });
  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}
// Sub-path tabs (Golden Path, Venus Path, Pearl Path) reuse this exact
// same 11-sphere/14-path diagram, just with everything outside their own sphere
// subset greyed out and inert — the geometry and gate data are never redrawn,
// only which nodes/edges count as "active" changes. Indexes are into
// GENE_KEYS_ALL_SPHERES. A path lights up only when both spheres it connects are
// in the active set (see geneKeysEdgesMarkup).
const GENE_KEYS_TAB_ACTIVE_INDEXES = {
  "All Paths": null,
  "Golden Path": new Set([0, 1, 2, 3]),
  "Venus Path": new Set([3, 4, 5, 6, 7, 8]),
  "Pearl Path": new Set([8, 9, 10, 0]),
  "Star Pearl": null, // its own diagram — see GENE_KEYS_STAR_PEARL
};

// ── Star Pearl: its own diagram ──────────────────────────────────────────
// Only the seven Pearl-sequence spheres, in a regular hexagon: the Pearl at the center
// and six around it, clockwise from the top. Brand is Life's Work's sphere (Personality
// Sun) under its Pearl-sequence name. The 18 paths are the hexagon's six sides, the six
// spokes to the Pearl, and the six-pointed star's two triangles (Brand–Culture–Vocation,
// the Pearl Path's own, and Relating–Stability–Creativity).
const GENE_KEYS_STAR_PEARL = {
  center: { x: 390, y: 310 },
  radius: 205,
  sphereRadius: 46,
  pearl: { id: "pearl", name: N_("Pearl"), set: "personality", planet: "Jupiter" },
  ring: [
    { id: "brand", name: N_("Brand"), set: "personality", planet: "Sun" },
    { id: "relating", name: N_("Relating"), set: "personality", planet: "Mercury" },
    { id: "culture", name: N_("Culture"), set: "design", planet: "Jupiter" },
    { id: "stability", name: N_("Stability"), set: "design", planet: "Saturn" },
    { id: "vocation", name: N_("Vocation"), set: "design", planet: "Mars" },
    { id: "creativity", name: N_("Creativity"), set: "design", planet: "Uranus" },
  ],
};
const GENE_KEYS_STAR_PEARL_SPHERES = (() => {
  const { center, radius, pearl, ring } = GENE_KEYS_STAR_PEARL;
  return [
    { ...pearl, ...center },
    ...ring.map((sphere, index) => {
      const angle = ((-90 + index * 60) * Math.PI) / 180;
      return { ...sphere, x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    }),
  ];
})();
const GENE_KEYS_STAR_PEARL_EDGES = (() => {
  const ring = GENE_KEYS_STAR_PEARL.ring.map((sphere) => sphere.id);
  return ring.flatMap((id, index) => [
    [id, ring[(index + 1) % 6]], // hexagon side
    ["pearl", id], // spoke
    [id, ring[(index + 2) % 6]], // star triangle
  ]);
})();
// The four Star Pearl spheres that are also the Pearl Path's keep its lighter blue
// (Brand is Life's Work's sphere); the other three are navy.
const GENE_KEYS_STAR_PEARL_PATH_SPHERES = new Set(["pearl", "brand", "culture", "vocation"]);
function geneKeysStarPearlSpheresMarkup(hd, cycleHd = null) {
  const r = GENE_KEYS_STAR_PEARL.sphereRadius;
  return GENE_KEYS_STAR_PEARL_SPHERES.map((sphere) => {
    const label = geneKeysGateLabel(sphere, hd);
    return `
      <g class="gk-sphere" tabindex="0" id="gk-sphere-${sphere.id}" data-sphere="${tName(sphere.name)}" data-gate="${label}">
        <circle cx="${sphere.x}" cy="${sphere.y}" r="${r}" fill="${GENE_KEYS_STAR_PEARL_PATH_SPHERES.has(sphere.id) ? GK_BLUE : GK_NAVY}"/>
        <text x="${sphere.x}" y="${sphere.y - 9}" text-anchor="middle" class="gk-sphere-name">${tName(sphere.name)}</text>
        <text x="${sphere.x}" y="${sphere.y + 17}" text-anchor="middle" class="gk-sphere-gate">${label}</text>
        ${geneKeysCycleLabelMarkup(sphere, r, cycleHd)}
      </g>`;
  }).join("");
}
function geneKeysStarPearlEdgesMarkup() {
  const byId = new Map(GENE_KEYS_STAR_PEARL_SPHERES.map((sphere) => [sphere.id, sphere]));
  return GENE_KEYS_STAR_PEARL_EDGES.map(([a, b]) => {
    const from = byId.get(a), to = byId.get(b);
    return `
      <g class="gk-path" tabindex="0" id="gk-path-${a}-${b}" data-path="${tName("Star Pearl")}" data-from="${tName(from.name)}" data-to="${tName(to.name)}" style="--gk-path-color:${GK_STAR_BLUE}">
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="gk-path-track"/>
      </g>`;
  }).join("");
}
// The diagram SVG for a Gene Keys tab: Star Pearl's own, or the full profile with the
// tab's spheres active. Shared by the Chart Explorer and the Pair Explorer.
// `cycleHd` (Cycle Explorer only) adds each sphere's cycle-moment gate below it.
function geneKeysDiagramSvg(hd, tab, ariaLabel, cycleHd = null) {
  const edges = tab === "Star Pearl" ? geneKeysStarPearlEdgesMarkup() : geneKeysEdgesMarkup(GENE_KEYS_TAB_ACTIVE_INDEXES[tab]);
  return `<svg class="gene-all-paths${tab === "Star Pearl" ? " gene-star-pearl" : ""}" viewBox="0 0 780 ${cycleHd ? 640 : 620}" role="img" aria-label="${ariaLabel}">
      <g data-gene-edges>${edges}</g>
      <g data-gene-spheres>${geneKeysSpheresLayerMarkup(hd, tab, cycleHd)}</g>
    </svg>`;
}
function geneKeysSpheresLayerMarkup(hd, tab, cycleHd = null) {
  return tab === "Star Pearl" ? geneKeysStarPearlSpheresMarkup(hd, cycleHd) : geneKeysSpheresMarkup(hd, GENE_KEYS_TAB_ACTIVE_INDEXES[tab], tab, cycleHd);
}
function renderGeneKeysDiagram(surface, chart, offsetMinutes, tab) {
  const hd = chart ? computeHumanDesignChart(chart, offsetMinutes) : null;
  const timelineMarkup = chart
    ? timelineSliderMarkup(t("PROFILE MOMENT"), offsetMinutes)
    : "";
  const star = tab === "Star Pearl";
  const spheres = star ? GENE_KEYS_STAR_PEARL_SPHERES : GENE_KEYS_ALL_SPHERES;
  const sphereCount = spheres.length;
  const liveCount = spheres.filter((sphere) => sphere.set).length;
  surface.innerHTML = `
    <div class="system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${tName(activeSystemTab).toUpperCase()}</span>
          <span class="sample-badge">${t("{live} LIVE · {sample} SAMPLE SPHERES", { live: liveCount, sample: sphereCount - liveCount })}</span>
        </div>
        ${geneKeysDiagramSvg(hd, tab, star ? t("Gene Keys Star Pearl") : t("Gene Keys full profile: Activation, Venus, and Pearl sequences"))}
        ${timelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">${t("PROFILE READING")}</span>
        <h3>${tName(activeSystemTab)}</h3>
      </aside>
    </div>`;
  bindGeneKeysAllPathsClicks(surface);
  bindGeneKeysHoverDebug(surface.querySelector(".gene-all-paths"));
  const timelineContainer = surface.querySelector(
    ".gene-visual .timeline-control",
  );
  if (timelineContainer && chart) {
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offsetMinutes2) => {
        updateTimelineReadout(timelineContainer, chart, offsetMinutes2);
        const hd2 = computeHumanDesignChart(chart, offsetMinutes2);
        const layer = surface.querySelector("[data-gene-spheres]");
        if (layer) {
          layer.innerHTML = geneKeysSpheresLayerMarkup(hd2, tab);
          bindGeneKeysAllPathsClicks(layer);
        }
      },
    });
  }
}

// The Activation Sequence's 4 Golden Path spheres are canonically the same
// Sun/Earth, Personality/Design gates Human Design already computes for its
// own bodygraph — not a separate calculation. Reusing computeHumanDesignChart
// directly (rather than re-deriving gates here) is what makes this "the same
// method of obtaining planetary positions" the astrology wheel and Human
// Design already share, per definition, not just by coincidence.
const GENE_KEYS_PATHS = [
  {
    name: N_("Life Work"),
    color: "#bd583e",
    x: 80,
    set: "personality",
    planet: "Sun",
  },
  {
    name: N_("Evolution"),
    color: "#b88a46",
    x: 190,
    set: "personality",
    planet: "Earth",
  },
  { name: N_("Radiance"), color: "#577891", x: 300, set: "design", planet: "Sun" },
  { name: N_("Purpose"), color: "#4f766c", x: 410, set: "design", planet: "Earth" },
];
function geneKeysSphereMarkup(hd) {
  return GENE_KEYS_PATHS.map((path, index) => {
    const influence = hd
      ? hd[path.set].find((item) => item.planet === path.planet)
      : null;
    const gate = influence && influence.gate != null ? influence.gate : "—";
    const y = 350 - Math.abs(index - 1.5) * 65;
    return `
      <g class="gene-sphere" tabindex="0" data-sphere="${tName(path.name)}" data-gate="${gate}">
        <circle cx="${path.x}" cy="${y}" r="29" fill="${path.color}"/>
        <text x="${path.x}" y="${y + 4}" text-anchor="middle">${gate}</text>
        <text x="${path.x}" y="395" text-anchor="middle" class="sphere-label">${tName(path.name)}</text>
      </g>`;
  }).join("");
}
function bindGeneSphereClicks(container) {
  container.querySelectorAll(".gene-sphere").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(t("{sphere} · Gate {gate}", { sphere: node.dataset.sphere, gate: node.dataset.gate }));
    }),
  );
}
function renderGeneKeys(surface, chart) {
  if (Object.prototype.hasOwnProperty.call(GENE_KEYS_TAB_ACTIVE_INDEXES, activeSystemTab))
    return renderGeneKeysDiagram(surface, chart, 0, activeSystemTab);
  const hd = chart ? computeHumanDesignChart(chart, 0) : null;
  const timelineMarkup = chart
    ? timelineSliderMarkup(t("GENE KEYS MOMENT"), 0)
    : "";
  surface.innerHTML = `
    <div class="system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${tName(activeSystemTab).toUpperCase()}</span>
          <span class="sample-badge">${t("GOLDEN PATH · LIVE GATES")}</span>
        </div>
        <svg class="gene-paths" viewBox="0 0 490 430" role="img" aria-label="${t("Gene Keys Golden Path")}">
          <path d="M55 350 C120 120 350 120 435 350" class="gene-arc"/>
          <g data-gene-spheres>${geneKeysSphereMarkup(hd)}</g>
        </svg>
        ${timelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">${t("PATH READING")}</span>
        <h3>${tName(activeSystemTab)}</h3>
      </aside>
    </div>`;
  bindGeneSphereClicks(surface);
  const timelineContainer = surface.querySelector(
    ".gene-visual .timeline-control",
  );
  if (timelineContainer && chart) {
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offsetMinutes) => {
        updateTimelineReadout(timelineContainer, chart, offsetMinutes);
        const layer = surface.querySelector("[data-gene-spheres]");
        if (layer) {
          layer.innerHTML = geneKeysSphereMarkup(
            computeHumanDesignChart(chart, offsetMinutes),
          );
          bindGeneSphereClicks(layer);
        }
      },
    });
  }
}

// Astrology's live DOM (wheel/aspects toggle, timeline slider, zoom controls) is wired
// up once by initAspectEngine()/initPreciseTimeline() at page load. Switching to Human
// Design or Gene Keys and back used to restore it from a static HTML string snapshot,
// which produced brand-new elements with none of those listeners attached. Instead, we
// stash the actual live nodes when leaving Astrology and re-insert the same nodes when
// coming back, so every listener and piece of UI state (zoom span, slider position,
// aspect filter) survives the round trip.
//
// The Chart Explorer and Timeline Explorer share this single surface (moved between
// the two views by mountExplorerBody() in app.js), fed by systemChart() — which itself
// resolves to either the library-selected chart or the current-moment reference chart
// depending on explorerMode. That's what makes both explorers "the same" surface.
let chartAstrologyNodes = null;
let activeSystemPanelTab = "Astrology";

function switchExplorerSystem(system) {
  const surface = document.getElementById("chartSystemSurface");
  if (!surface) return;
  if (system === activeSystemPanelTab) return;

  if (activeSystemPanelTab === "Astrology") {
    const fragment = document.createDocumentFragment();
    while (surface.firstChild) fragment.appendChild(surface.firstChild);
    chartAstrologyNodes = fragment;
  }

  if (system === "Astrology") {
    surface.innerHTML = "";
    surface.appendChild(chartAstrologyNodes);
    chartAstrologyNodes = null;
    // While detached, these controls missed any change made from the Pair Explorer
    // (the settings are shared), so bring them back in step.
    const fixZodiac = surface.querySelector("#fixZodiacToggleChart");
    if (fixZodiac) fixZodiac.checked = astroWheelFixedToAries;
    syncWheelFilterInputs(surface);
    if (typeof renderExplorer === "function") renderExplorer();
  } else {
    renderSystemPanel(surface, system, systemChart());
  }

  activeSystemPanelTab = system;
  document
    .querySelectorAll("[data-explorer-system]")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.explorerSystem === system),
    );
}

// Re-renders whichever system tab (Astrology / Human Design / Gene Keys) is currently
// active, without forcing a switch back to Astrology. Used by "Jump to now".
function refreshActiveSystemPanel() {
  const surface = document.getElementById("chartSystemSurface");
  if (!surface) return;
  if (activeSystemPanelTab === "Astrology") {
    if (typeof renderExplorer === "function") renderExplorer();
  } else {
    renderSystemPanel(surface, activeSystemPanelTab, systemChart());
  }
}

document
  .querySelectorAll("[data-explorer-system]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      switchExplorerSystem(button.dataset.explorerSystem),
    ),
  );

// ── Pair Explorer: Gene Keys side by side ───────────────────────────────
// The same path tabs as the Chart Explorer (Codon Rings aside, which has no
// diagram yet), applied to both charts at once. No timeline in Pair Explorer.
let geneKeysPairTab = "All Paths";
function renderGeneKeysPair(container, entries) {
  const tabs = Object.keys(GENE_KEYS_TAB_ACTIVE_INDEXES);
  if (!tabs.includes(geneKeysPairTab)) geneKeysPairTab = tabs[0];
  container.innerHTML = `
    <div class="system-tabs">${tabs.map((tab) => `<button type="button" class="${tab === geneKeysPairTab ? "active" : ""}" data-gk-pair-tab="${tab}">${tName(tab)}</button>`).join("")}</div>
    <div class="system-surface">
      <div class="gk-pair-layout">
        ${entries
          .map(
            ({ chart, label }) => `
          <div class="system-visual gene-visual">
            <div class="system-toolbar"><span class="eyebrow">${label}</span><span class="sample-badge">${tName(geneKeysPairTab).toUpperCase()}</span></div>
            ${geneKeysDiagramSvg(computeHumanDesignChart(chart, 0), geneKeysPairTab, t("Gene Keys {tab} for {name}", { tab: tName(geneKeysPairTab), name: escapeHtml(chart.name) }))}
          </div>`,
          )
          .join("")}
      </div>
    </div>`;
  container.querySelectorAll(".gk-pair-layout .gene-visual").forEach((card) => {
    bindGeneKeysAllPathsClicks(card);
    bindGeneKeysHoverDebug(card.querySelector("svg"));
  });
  container.querySelectorAll("[data-gk-pair-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      geneKeysPairTab = button.dataset.gkPairTab;
      renderGeneKeysPair(container, entries);
    }),
  );
}
