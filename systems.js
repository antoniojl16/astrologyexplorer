const SYSTEM_TABS = {
  "Human Design": {
    views: ["Bodygraph", "Mandala"],
    filters: ["Complete", "Personality", "Design", "Incarnation Cross"],
  },
  "Gene Keys": [
    "All Paths",
    "Golden Path",
    "Venus Path",
    "Pearl Path",
    "Star Pearl",
    "Codon Rings",
  ],
};
let activeSystemTab = "Bodygraph";
let activeSystemFilter = "Complete";
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
  return timelineSliderMarkup("PERSONALITY MOMENT", offsetMinutes);
}
// Which planets (personality and/or design) currently activate each gate, at a given
// offset from birth. Reused by the mandala's initial render and its slider updates.
function humanDesignGateGlyphMap(chart, offsetMinutes) {
  const map = new Map();
  if (!chart) return map;
  const hd = computeHumanDesignChart(chart, offsetMinutes);
  const addSide = (side, influences) =>
    influences.forEach((influence, index) => {
      if (influence.gate == null) return;
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
    const items = [
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
      showToast(`Gate ${node.dataset.gate} · ${node.dataset.side} influence`);
    }),
  );
}

function systemChart() {
  return currentExplorerChart();
}

function renderSystemPanel(container, system, chart) {
  const systemTabs = SYSTEM_TABS[system];
  const tabs = system === "Human Design" ? systemTabs.views : systemTabs;
  activeSystemTab = tabs[0];
  activeSystemFilter = "Complete";
  const selectorMarkup =
    system === "Human Design"
      ? `<div class="system-selector-stack"><div class="selector-row"><span class="selector-label">VIEW</span><div class="system-tabs">${tabs.map((tab) => `<button type="button" class="${tab === activeSystemTab ? "active" : ""}" data-panel-tab="${tab}">${tab}</button>`).join("")}</div></div><div class="selector-row"><span class="selector-label">INFLUENCES</span><div class="system-tabs influence-tabs">${systemTabs.filters.map((filter) => `<button type="button" class="${filter === activeSystemFilter ? "active" : ""}" data-panel-filter="${filter}">${filter}</button>`).join("")}</div></div></div>`
      : `<div class="system-tabs">${tabs.map((tab) => `<button type="button" class="${tab === activeSystemTab ? "active" : ""}" data-panel-tab="${tab}">${tab}</button>`).join("")}</div>`;
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
const HD_BODYGRAPH_CENTERS = [
  {
    name: "Head",
    id: "head",
    x: 220,
    y: 62,
    shape: "up-triangle",
    color: "#c9cbd0",
  },
  {
    name: "Ajna",
    id: "ajna",
    x: 220,
    y: 137,
    shape: "down-triangle",
    color: "#d1a05c",
  },
  {
    name: "Throat",
    id: "throat",
    x: 220,
    y: 222,
    shape: "square",
    color: "#b75e67",
  },
  { name: "G", id: "g", x: 220, y: 315, shape: "diamond", color: "#d18d70" },
  {
    name: "Heart",
    id: "heart",
    x: 284,
    y: 356,
    shape: "scalene",
    color: "#bf7662",
  },
  {
    name: "Solar Plexus",
    id: "solar-plexus",
    x: 342,
    y: 421,
    shape: "right-triangle",
    color: "#c57466",
  },
  {
    name: "Spleen",
    id: "spleen",
    x: 98,
    y: 421,
    shape: "left-triangle",
    color: "#76977f",
  },
  {
    name: "Sacral",
    id: "sacral",
    x: 220,
    y: 480,
    shape: "square",
    color: "#bd645d",
  },
  {
    name: "Root",
    id: "root",
    x: 220,
    y: 575,
    shape: "square",
    color: "#765f5b",
  },
];
const HD_BODYGRAPH_CHANNEL_COORDS = [
  [220, 280, 220, 247, 1, 8],
  [220, 455, 220, 340, 2, 14],
  [220, 550, 220, 505, 3, 60],
  [235, 115, 235, 84, 4, 63],
  [205, 455, 205, 340, 5, 15],
  [252, 470, 314, 420, 6, 59],
  [205, 295, 205, 247, 7, 31],
  [235, 550, 235, 505, 9, 52],
  [235, 165, 235, 200, 11, 56],
  [250, 228, 350, 405, 12, 22],
  [235, 295, 235, 247, 13, 33],
  [77, 399, 190, 211, 16, 48],
  [205, 165, 205, 200, 17, 62],
  [78, 446, 194, 593, 18, 58],
  [244, 555, 335, 427, 19, 49],
  [190, 228, 95, 405, 20, 57],
  [286, 340, 250, 243, 21, 45],
  [220, 200, 220, 165, 23, 43],
  [220, 115, 220, 84, 24, 61],
  [244, 324, 270, 350, 25, 51],
  [264, 369, 112, 414, 26, 44],
  [188, 470, 121, 420, 27, 50],
  [92, 438, 194, 575, 28, 38],
  [235, 455, 235, 340, 29, 46],
  [365, 443, 244, 593, 30, 41],
  [105, 430, 194, 555, 32, 54],
  [250, 211, 365, 396, 35, 36],
  [335, 410, 302, 361, 37, 40],
  [244, 575, 350, 435, 39, 55],
  [205, 505, 205, 550, 42, 53],
  [205, 115, 205, 84, 47, 64],
  [189, 316, 195, 459, 10, 34],
  // Integration Channels
  [220, 315, 140, 322, 10, 20],
  [220, 315, 76, 398, 10, 57],
  [204, 246, 220, 480, 20, 34],
  [220, 480, 76, 398, 34, 57],
];
const HD_BODYGRAPH_GATE_POINTS = (() => {
  const points = {};
  HD_BODYGRAPH_CHANNEL_COORDS.slice(0, 32).forEach(
    ([x1, y1, x2, y2, gateA, gateB]) => {
      const midpointX = (x1 + x2) / 2;
      const midpointY = (y1 + y2) / 2;
      points[gateA] = { id: gateA, x1, y1, x2: midpointX, y2: midpointY };
      points[gateB] = {
        id: gateB,
        x1: x2,
        y1: y2,
        x2: midpointX,
        y2: midpointY,
      };
    },
  );
  points[10].x2 = points[34].x2 = points[20].x2;
  points[10].y2 = points[34].y2 = points[20].y2;
  return points;
})();
const HD_BODYGRAPH_SILHOUETTE =
  '<path class="hd-silhouette" d="M244 28 C218 15 187 24 171 48 C160 64 158 82 163 96 C166 105 161 112 151 118 L126 132 C119 136 121 143 130 147 L148 153 L139 160 L148 166 C143 177 146 191 154 202 C162 213 175 219 190 222 L190 247 C184 263 168 276 143 287 C110 302 87 330 75 365 C64 397 64 432 72 466 C81 505 99 542 111 589 L140 589 C145 550 155 518 171 490 C184 467 198 449 220 438 C243 449 257 467 270 490 C286 518 296 550 301 589 L330 589 C342 542 359 505 368 466 C376 432 376 397 365 365 C353 330 330 302 297 287 C274 276 257 263 250 247 L250 205 C260 187 266 164 264 139 C262 104 266 66 255 42 C252 35 249 31 244 28 Z"/>';

function hdContrastTextColor(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16),
    g = parseInt(value.substring(2, 4), 16),
    b = parseInt(value.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#242622" : "#fff";
}
function hdCenterShape(center, defined) {
  const fill = defined ? center.color : "var(--panel)";
  const style = `style="fill:${fill};stroke:${center.color}"`;
  if (center.shape === "square")
    return `<rect ${style} x="${center.x - 32}" y="${center.y - 25}" width="64" height="50"/>`;
  if (center.shape === "up-triangle")
    return `<polygon ${style} points="${center.x},${center.y - 30} ${center.x + 35},${center.y + 27} ${center.x - 35},${center.y + 27}"/>`;
  if (center.shape === "down-triangle")
    return `<polygon ${style} points="${center.x - 35},${center.y - 27} ${center.x + 35},${center.y - 27} ${center.x},${center.y + 30}"/>`;
  if (center.shape === "left-triangle")
    return `<polygon ${style} points="${center.x + 34},${center.y} ${center.x - 27},${center.y - 31} ${center.x - 27},${center.y + 31}"/>`;
  if (center.shape === "right-triangle")
    return `<polygon ${style} points="${center.x - 34},${center.y} ${center.x + 27},${center.y - 31} ${center.x + 27},${center.y + 31}"/>`;
  if (center.shape === "scalene")
    return `<polygon ${style} points="${center.x - 34},${center.y + 24} ${center.x + 25},${center.y + 11} ${center.x + 8},${center.y - 32}"/>`;
  if (center.shape === "triangle")
    return `<polygon ${style} points="${center.x},${center.y - 30} ${center.x + 35},${center.y + 27} ${center.x - 35},${center.y + 27}"/>`;
  return `<polygon ${style} points="${center.x},${center.y - 37} ${center.x + 37},${center.y} ${center.x},${center.y + 37} ${center.x - 37},${center.y}"/>`;
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
function hdGateFillMarkup(g, side) {
  if (side === "both") {
    const a = offsetSegment(g.x1, g.y1, g.x2, g.y2, -1.6);
    const b = offsetSegment(g.x1, g.y1, g.x2, g.y2, 1.6);
    return `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" class="channel-fill hd-half-channel personality"/><line x1="${b.x1}" y1="${b.y1}" x2="${b.x2}" y2="${b.y2}" class="channel-fill hd-half-channel design"/>`;
  }
  if (!side) return "";
  return `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="channel-fill hd-half-channel ${side}"/>`;
}
function hdBodygraphGateMarkup(state) {
  return Object.values(HD_BODYGRAPH_GATE_POINTS)
    .map((g) => {
      const side = state ? state.gateSide(g.id) : null;
      return `<g class="hd-gate-half" tabindex="0" id="gate-pipe-${g.id}" data-gate="${g.id}">
    <title>Gate ${g.id}</title><line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" class="channel-track hd-half-channel"/>
    ${hdGateFillMarkup(g, side)}</g>
    <text x="${g.x1 + 7}" y="${g.y1}" class="hd-gate-label">${g.id}</text>`;
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
function bindHdGateClicks(container) {
  container.querySelectorAll(".hd-gate-half").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(`Gate ${node.dataset.gate} · ${activeSystemFilter} influence`);
    }),
  );
}
function bindHdCenterClicks(container) {
  container
    .querySelectorAll(".design-center")
    .forEach((node) =>
      node.addEventListener("click", () =>
        showToast(`${node.dataset.center} center · sample detail`),
      ),
    );
}

function renderBodygraph(surface, chart) {
  if (activeSystemTab === "Mandala")
    return renderHumanDesignMandala(surface, chart);
  const gates = Array.from({ length: 64 }, (_, index) => index + 1);
  const planets = HD_PLANET_GLYPHS;
  const state = chart ? computeBodygraphState(chart, 0) : null;
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
        const label =
          influence && influence.label
            ? `${influence.gate}.${influence.line}`
            : "—";
        return `
      <div class="hd-planet ${side}" style="--row:${index};color:${color}">
        <span>${planets[index]}</span>
        <b data-hd-set="${side}" data-hd-index="${index}">${label}</b>
      </div>`;
      })
      .join("");
  const influenceRow = (setName, planetIndex, influence) => `
    <div class="hd-influence-row">
      <span class="hd-influence-glyph">${planets[planetIndex]}</span>
      <span class="hd-influence-name">${influence.planet}</span>
      <span class="hd-influence-label" data-hd-set="${setName}" data-hd-index="${planetIndex}">${influence.label || "—"}</span>
    </div>`;
  const influencesMarkup = hd
    ? `
    <div class="hd-influences">
      <div class="hd-influence-group">
        <h3>Personality influences</h3>
        <div class="hd-influence-list">${hd.personality.map((influence, index) => influenceRow("personality", index, influence)).join("")}</div>
      </div>
      <div class="hd-influence-group">
        <h3>Design influences</h3>
        <div class="hd-influence-list">${hd.design.map((influence, index) => influenceRow("design", index, influence)).join("")}</div>
      </div>
    </div>`
    : "";
  const hdTimelineMarkup = hdTimelineControlMarkup(chart, 0);
  const filterClass = activeSystemFilter.toLowerCase().replace(" ", "-");
  surface.innerHTML = `
    <div class="hd-layout ${filterClass}">
      <div class="hd-column design-column">
        <div class="hd-column-title">Design</div>
        ${columnData("design", "var(--accent)")}
      </div>
      <div class="system-visual hd-visual">
        <div class="system-toolbar">
          <span class="eyebrow">BODYGRAPH / ${activeSystemTab.toUpperCase()} / ${activeSystemFilter.toUpperCase()}</span>
          <span class="sample-badge">SAMPLE DATA · ${HD_BODYGRAPH_CHANNEL_COORDS.length} / 36 CHANNELS</span>
        </div>
        <svg class="bodygraph hd-bodygraph" viewBox="0 0 440 640" role="img" aria-label="Sample Human Design bodygraph">
          ${HD_BODYGRAPH_SILHOUETTE}
          <g data-center-layer>${hdBodygraphCenterMarkup(state)}</g>
          <g data-gate-layer>${hdBodygraphGateMarkup(state)}</g>
        </svg>
        ${hdTimelineMarkup}
      </div>
      <div class="hd-column personality-column">
        <div class="hd-column-title">Personality</div>
        ${columnData("personality", "var(--ink)")}
      </div>
    </div>
    <aside class="system-info hd-info">
      <span class="eyebrow">CHART SNAPSHOT</span>
      <h3>Generator · 4/6</h3>
      <p>Responding authority with a profile shaped by experimentation and perspective.</p>
      <div class="system-stat"><span>FILTER</span><strong>${activeSystemFilter}</strong></div>
      <div class="system-stat"><span>DEFINED CENTERS</span><strong data-hd-defined-centers>0 / 9</strong></div>
      <div class="system-stat"><span>ACTIVE CHANNELS</span><strong>${HD_BODYGRAPH_CHANNEL_COORDS.length} / 36 sample channels</strong></div>
      <div class="system-stat"><span>GATES</span><strong>64 / 64 represented</strong></div>
      <div class="system-note">Each channel is divided into two independently inspectable gate halves. Empty tracks are transparent; colored halves represent live planetary influence.</div>
    </aside>
    ${influencesMarkup}`;
  bindBodygraphHoverDebug(surface.querySelector(".hd-bodygraph"));
  bindHdCenterClicks(surface);
  bindHdGateClicks(surface);
  updateHdDefinedCentersStat(surface, state);
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
  const state = computeBodygraphState(chart, offsetMinutes);
  const hd = state.hd;
  ["personality", "design"].forEach((setName) => {
    hd[setName].forEach((influence, index) => {
      const shortLabel = influence.label
        ? `${influence.gate}.${influence.line}`
        : "—";
      surface
        .querySelectorAll(
          `[data-hd-set="${setName}"][data-hd-index="${index}"]`,
        )
        .forEach((node) => {
          node.textContent = node.classList.contains("hd-influence-label")
            ? influence.label || "—"
            : shortLabel;
        });
    });
  });
  const gateLayer = surface.querySelector("[data-gate-layer]");
  if (gateLayer) {
    gateLayer.innerHTML = hdBodygraphGateMarkup(state);
    bindHdGateClicks(gateLayer);
  }
  const centerLayer = surface.querySelector("[data-center-layer]");
  if (centerLayer) {
    centerLayer.innerHTML = hdBodygraphCenterMarkup(state);
    bindHdCenterClicks(centerLayer);
  }
  updateHdDefinedCentersStat(surface, state);
}

function renderHumanDesignMandala(surface, chart, offsetMinutes = 0) {
  const state = chart ? computeBodygraphState(chart, offsetMinutes) : null;
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
      // gate 55 itself starts at 0deg Pisces (330deg tropical) per
      // computeGateLineColorToneBase in human-design.js — not 0deg Aries. Angle
      // decreases as real ecliptic degree increases (same convention gateRing
      // uses just above), so sign `index`'s boundary (at real degree index*30)
      // sits (index*30 - 330) degrees of real-motion AFTER gate55's own anchor,
      // i.e. gate55Angle - ((index*30 - 330 + 360) % 360) = gate55Angle -
      // ((index + 1) * 30) % 360. Confirmed empirically across 7 different real
      // Sun angles spanning the whole circle — this formula (not a plain
      // index*30 shift, which is one sign short) is the one that actually
      // matches a planet glyph's rendered position to its real sign every time.
      const startAngle = gate55Angle - (((index + 1) * 30) % 360);
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
  const hdTimelineMarkup = hdTimelineControlMarkup(chart, offsetMinutes);
  surface.innerHTML = `
    <div class="hd-mandala-layout">
      <div class="system-visual hd-mandala-visual">
        <div class="system-toolbar">
          <span class="eyebrow">MANDALA / ${activeSystemTab.toUpperCase()}</span>
          <span class="sample-badge">SAMPLE DATA · GATE 25 LEFT</span>
        </div>
        <svg class="hd-mandala" viewBox="0 0 660 660" role="img" aria-label="Sample Human Design mandala with zodiac and gate rings">
          ${MANDALA_GATE_SECTOR_GRADIENTS}
          ${rays}
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="318" class="mandala-outer"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="278" class="mandala-zodiac-ring"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="270" class="mandala-ring"/>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="218" class="mandala-ring"/>
          <g data-mandala-sectors></g>
          ${zodiacRing}
          ${gateRing}
          <g data-mandala-glyphs></g>
          <circle cx="${MANDALA_CENTER}" cy="${MANDALA_CENTER}" r="128" class="mandala-core"/>
          <svg class="mandala-bodygraph" x="${MANDALA_CENTER - MANDALA_BODYGRAPH_WIDTH / 2}" y="${MANDALA_CENTER - MANDALA_BODYGRAPH_HEIGHT / 2}" width="${MANDALA_BODYGRAPH_WIDTH}" height="${MANDALA_BODYGRAPH_HEIGHT}" viewBox="0 0 440 640" role="img" aria-label="Bodygraph">
            ${HD_BODYGRAPH_SILHOUETTE}
            <g data-center-layer>${hdBodygraphCenterMarkup(state)}</g>
            <g data-gate-layer>${hdBodygraphGateMarkup(state)}</g>
          </svg>
        </svg>
        ${hdTimelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">MANDALA KEY</span>
        <h3>Gate wheel · 64 gates</h3>
        <p>Gate 25 begins at the leftmost cusp and the sequence advances counterclockwise. Gate 55 is aligned to the Pisces cusp.</p>
        <div class="system-stat"><span>GATE CUSPS</span><strong>64 / 64</strong></div>
        <div class="system-stat"><span>ZODIAC CUSPS</span><strong>12 / 12</strong></div>
        <div class="system-stat"><span>GATE 55</span><strong>Pisces cusp</strong></div>
        <div class="system-stat"><span>DEFINED CENTERS</span><strong data-hd-defined-centers>0 / 9</strong></div>
        <div class="system-note">Personality influences appear in ink; design influences appear in the accent color, matching the bodygraph.</div>
      </aside>
    </div>`;
  bindMandalaHoverDebug(surface.querySelector(".hd-mandala"));
  bindBodygraphHoverDebug(surface.querySelector(".mandala-bodygraph"));
  bindHdCenterClicks(surface);
  bindHdGateClicks(surface);
  updateHdDefinedCentersStat(surface, state);
  const timelineContainer = surface.querySelector(
    ".hd-mandala-visual .timeline-control",
  );
  if (timelineContainer && chart) {
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offset) => {
        updateTimelineReadout(timelineContainer, chart, offset);
        const glyphMap = humanDesignGateGlyphMap(chart, offset);
        const sectorLayer = surface.querySelector("[data-mandala-sectors]");
        if (sectorLayer)
          sectorLayer.innerHTML = mandalaGateSectorsMarkup(glyphMap);
        const layer = surface.querySelector("[data-mandala-glyphs]");
        if (layer) {
          layer.innerHTML = mandalaGlyphLayerMarkup(glyphMap);
          bindMandalaGlyphClicks(layer);
        }
        const bodygraphState = computeBodygraphState(chart, offset);
        const gateLayer = surface.querySelector("[data-gate-layer]");
        if (gateLayer) {
          gateLayer.innerHTML = hdBodygraphGateMarkup(bodygraphState);
          bindHdGateClicks(gateLayer);
        }
        const centerLayer = surface.querySelector("[data-center-layer]");
        if (centerLayer) {
          centerLayer.innerHTML = hdBodygraphCenterMarkup(bodygraphState);
          bindHdCenterClicks(centerLayer);
        }
        updateHdDefinedCentersStat(surface, bodygraphState);
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
// Every sphere below has a set/planet mapping (personality/design × one of the 10
// bodies computeHumanDesignChart already derives), so all 11 read real, live gates —
// not just the 4 Activation Sequence spheres the old Golden Path view below covers.
const GENE_KEYS_ALL_SPHERES = [
  {
    id: "lifeswork",
    name: "Life's Work",
    x: 390,
    y: 55,
    r: 30,
    color: GK_GREEN,
    set: "personality",
    planet: "Sun",
  },
  {
    id: "evolution",
    name: "Evolution",
    x: 690,
    y: 300,
    r: 30,
    color: GK_GREEN,
    set: "personality",
    planet: "Earth",
  },
  {
    id: "radiance",
    name: "Radiance",
    x: 90,
    y: 300,
    r: 30,
    color: GK_GREEN,
    set: "design",
    planet: "Sun",
  },
  {
    id: "purpose",
    name: "Purpose",
    x: 390,
    y: 555,
    r: 30,
    color: GK_GREEN,
    set: "design",
    planet: "Earth",
  },
  {
    id: "attraction",
    name: "Attraction",
    x: 390,
    y: 430,
    r: 20,
    color: GK_RED,
    set: "design",
    planet: "Moon",
  },
  {
    id: "iq",
    name: "IQ",
    x: 255,
    y: 365,
    r: 30,
    color: GK_RED,
    set: "personality",
    planet: "Venus",
  },
  {
    id: "eq",
    name: "EQ",
    x: 525,
    y: 365,
    r: 30,
    color: GK_RED,
    set: "personality",
    planet: "Mars",
  },
  {
    id: "sq",
    name: "SQ",
    x: 390,
    y: 300,
    r: 32,
    color: GK_RED,
    set: "design",
    planet: "Venus",
  },
  {
    id: "vocation",
    name: "Vocation",
    x: 255,
    y: 235,
    r: 30,
    color: GK_RED,
    set: "design",
    planet: "Mars",
  },
  {
    id: "culture",
    name: "Culture",
    x: 525,
    y: 235,
    r: 30,
    color: GK_BLUE,
    set: "design",
    planet: "Jupiter",
  },
  {
    id: "pearl",
    name: "Pearl",
    x: 390,
    y: 175,
    r: 32,
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
  { a: "lifeswork", b: "evolution", label: "Challenge", color: GK_GREEN },
  { a: "evolution", b: "radiance", label: "Breakthrough", color: GK_GREEN },
  { a: "radiance", b: "purpose", label: "Core Stability", color: GK_GREEN },
  { a: "purpose", b: "attraction", label: "Dharma", color: GK_RED },
  { a: "attraction", b: "iq", label: "Karma", color: GK_RED },
  { a: "iq", b: "eq", label: "Intelligence", color: GK_RED },
  { a: "eq", b: "sq", label: "Love", color: GK_RED },
  { a: "sq", b: "vocation", label: "Realisation", color: GK_RED },
  { a: "vocation", b: "lifeswork", label: "Service", color: GK_BLUE },
  { a: "vocation", b: "culture", label: "Initiative", color: GK_BLUE },
  { a: "culture", b: "lifeswork", label: "Growth", color: GK_BLUE },
  { a: "vocation", b: "pearl", label: "Quantum", color: GK_BLUE },
  { a: "culture", b: "pearl", label: "Quantum", color: GK_BLUE },
  { a: "lifeswork", b: "pearl", label: "Quantum", color: GK_BLUE },
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
      <g class="gk-path${active ? "" : " disabled"}" tabindex="${active ? "0" : "-1"}" id="gk-path-${slug}-${index}" data-path="${edge.label}" data-from="${from.name}" data-to="${to.name}" style="--gk-path-color:${edge.color}">
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="gk-path-track"/>
        <text x="${midX}" y="${midY}" transform="rotate(${labelAngle} ${midX} ${midY})" text-anchor="middle" class="gk-path-label">${edge.label}</text>
      </g>`;
  }).join("");
}
// activeIndexes is a Set of GENE_KEYS_ALL_SPHERES indexes to render as "active"
// (full color, interactive), or null to mean every sphere is active (the "All
// Paths" view). Everything outside the set renders greyed-out and inert — no
// tabindex, no click/hover (see the .gk-sphere.disabled / .gk-path.disabled CSS,
// which also sets pointer-events:none).
function geneKeysSpheresMarkup(hd, activeIndexes) {
  return GENE_KEYS_ALL_SPHERES.map((sphere, index) => {
    const label = geneKeysGateLabel(sphere, hd);
    const active = !activeIndexes || activeIndexes.has(index);
    return `
      <g class="gk-sphere${active ? "" : " disabled"}" tabindex="${active ? "0" : "-1"}" id="gk-sphere-${sphere.id}" data-sphere="${sphere.name}" data-gate="${label}">
        <circle cx="${sphere.x}" cy="${sphere.y}" r="${sphere.r}" fill="${sphere.color}"/>
        <text x="${sphere.x}" y="${sphere.y - 5}" text-anchor="middle" class="gk-sphere-name">${sphere.name}</text>
        <text x="${sphere.x}" y="${sphere.y + 13}" text-anchor="middle" class="gk-sphere-gate">${label}</text>
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
      showToast(`${node.dataset.sphere} · Gate ${node.dataset.gate}`);
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
// Sub-path tabs (Golden Path, Venus Path, Pearl Path, Star Pearl) reuse this exact
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
  "Star Pearl": new Set([10]),
};
function renderGeneKeysDiagram(surface, chart, offsetMinutes, activeIndexes) {
  const hd = chart ? computeHumanDesignChart(chart, offsetMinutes) : null;
  const timelineMarkup = chart
    ? timelineSliderMarkup("PROFILE MOMENT", offsetMinutes)
    : "";
  const liveCount = GENE_KEYS_ALL_SPHERES.filter((sphere) => sphere.set).length;
  const activeSphereCount = activeIndexes
    ? activeIndexes.size
    : GENE_KEYS_ALL_SPHERES.length;
  const activeEdgeCount = GENE_KEYS_ALL_EDGES.filter(
    (edge) =>
      !activeIndexes ||
      (activeIndexes.has(GENE_KEYS_SPHERE_INDEX_BY_ID.get(edge.a)) &&
        activeIndexes.has(GENE_KEYS_SPHERE_INDEX_BY_ID.get(edge.b))),
  ).length;
  surface.innerHTML = `
    <div class="system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${activeSystemTab.toUpperCase()}</span>
          <span class="sample-badge">${liveCount} LIVE · ${GENE_KEYS_ALL_SPHERES.length - liveCount} SAMPLE SPHERES</span>
        </div>
        <svg class="gene-all-paths" viewBox="0 0 780 620" role="img" aria-label="Gene Keys full profile: Activation, Venus, and Pearl sequences">
          <g data-gene-edges>${geneKeysEdgesMarkup(activeIndexes)}</g>
          <g data-gene-spheres>${geneKeysSpheresMarkup(hd, activeIndexes)}</g>
        </svg>
        ${timelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">PROFILE READING</span>
        <h3>${activeSystemTab}</h3>
        <p>The full Gene Keys profile for ${chart?.name || "the selected chart"}: all ${GENE_KEYS_ALL_SPHERES.length} spheres across the Activation, Venus, and Pearl Sequences, each reading a real gate from the same Personality/Design chart Human Design uses.</p>
        <div class="system-stat"><span>ACTIVE SPHERES</span><strong>${activeSphereCount} / ${GENE_KEYS_ALL_SPHERES.length}</strong></div>
        <div class="system-stat"><span>ACTIVE PATHS</span><strong>${activeEdgeCount} / ${GENE_KEYS_ALL_EDGES.length}</strong></div>
        <div class="system-stat"><span>LIVE GATES</span><strong>${liveCount} / ${GENE_KEYS_ALL_SPHERES.length}</strong></div>
        <div class="system-note">Active spheres and paths are interactive (hover shows its id, click shows a toast); greyed-out ones aren't part of this sequence.${liveCount < GENE_KEYS_ALL_SPHERES.length ? ` Spheres still showing "—" don't have a planet/gate mapping wired up yet.` : ""}</div>
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
          layer.innerHTML = geneKeysSpheresMarkup(hd2, activeIndexes);
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
    name: "Life Work",
    color: "#bd583e",
    x: 80,
    set: "personality",
    planet: "Sun",
  },
  {
    name: "Evolution",
    color: "#b88a46",
    x: 190,
    set: "personality",
    planet: "Earth",
  },
  { name: "Radiance", color: "#577891", x: 300, set: "design", planet: "Sun" },
  { name: "Purpose", color: "#4f766c", x: 410, set: "design", planet: "Earth" },
];
function geneKeysSphereMarkup(hd) {
  return GENE_KEYS_PATHS.map((path, index) => {
    const influence = hd
      ? hd[path.set].find((item) => item.planet === path.planet)
      : null;
    const gate = influence && influence.gate != null ? influence.gate : "—";
    const y = 350 - Math.abs(index - 1.5) * 65;
    return `
      <g class="gene-sphere" tabindex="0" data-sphere="${path.name}" data-gate="${gate}">
        <circle cx="${path.x}" cy="${y}" r="29" fill="${path.color}"/>
        <text x="${path.x}" y="${y + 4}" text-anchor="middle">${gate}</text>
        <text x="${path.x}" y="395" text-anchor="middle" class="sphere-label">${path.name}</text>
      </g>`;
  }).join("");
}
function bindGeneSphereClicks(container) {
  container.querySelectorAll(".gene-sphere").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast(`${node.dataset.sphere} · Gate ${node.dataset.gate}`);
    }),
  );
}
function renderGeneKeys(surface, chart) {
  if (Object.prototype.hasOwnProperty.call(GENE_KEYS_TAB_ACTIVE_INDEXES, activeSystemTab))
    return renderGeneKeysDiagram(
      surface,
      chart,
      0,
      GENE_KEYS_TAB_ACTIVE_INDEXES[activeSystemTab],
    );
  const hd = chart ? computeHumanDesignChart(chart, 0) : null;
  const timelineMarkup = chart
    ? timelineSliderMarkup("GENE KEYS MOMENT", 0)
    : "";
  surface.innerHTML = `
    <div class="system-layout">
      <div class="system-visual gene-visual">
        <div class="system-toolbar">
          <span class="eyebrow">${activeSystemTab.toUpperCase()}</span>
          <span class="sample-badge">GOLDEN PATH · LIVE GATES</span>
        </div>
        <svg class="gene-paths" viewBox="0 0 490 430" role="img" aria-label="Gene Keys Golden Path">
          <path d="M55 350 C120 120 350 120 435 350" class="gene-arc"/>
          <g data-gene-spheres>${geneKeysSphereMarkup(hd)}</g>
        </svg>
        ${timelineMarkup}
      </div>
      <aside class="system-info">
        <span class="eyebrow">PATH READING</span>
        <h3>${activeSystemTab}</h3>
        <p>Golden Path gates for ${chart?.name || "the selected chart"}, derived from the same Personality/Design Sun and Earth placements Human Design uses for its own gates.</p>
        <div class="system-stat"><span>ACTIVE SPHERES</span><strong>4</strong></div>
        <div class="system-stat"><span>SEQUENCE</span><strong>Activation</strong></div>
        <div class="system-note">Each sphere is interactive. The five path views share this same gate data.</div>
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
