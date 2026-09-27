// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Astrocartography system: where a birth moment's planetary influences fall across
// the globe. Both views ("ACG Travel", "ACG Local Space") currently share one
// pannable/zoomable Mercator world map; the per-view planetary lines will be drawn
// into each map's [data-acg-overlay] layer, which already switches with the view.
//
// The map lives in "world units": the Mercator square spans ACG_WORLD_SIZE on both
// axes (lon -180..180, lat ±ACG_MAX_LAT). Country paths are projected once and
// reused; panning/zooming only rewrites the SVG viewBox. East-west panning wraps
// seamlessly because the world is drawn three times side by side (x = -W, 0, +W)
// and the viewBox never spans more than one world width.

const ACG_WORLD_SIZE = 3600;
// Web-Mercator's latitude cutoff, where the projected map becomes exactly square.
const ACG_MAX_LAT = 85.05113;
const ACG_BUTTON_ZOOM_STEP = 1.6;
// Three ＋ clicks past 64× (about 262×, a view some 150 km wide), for small screens.
const ACG_MAX_ZOOM = 64 * ACG_BUTTON_ZOOM_STEP ** 3;
// Two taps or clicks this close in time (ms) and place (px) are a double-click.
const ACG_DOUBLE_TAP_MS = 320, ACG_DOUBLE_TAP_PX = 24;

// Swapping this for another projection (or a 3D globe) is the intended extension
// point: everything else only deals in world-unit coordinates.
function acgProject(lon, lat) {
  const phi = (Math.max(-ACG_MAX_LAT, Math.min(ACG_MAX_LAT, lat)) * Math.PI) / 180;
  const x = ((lon + 180) / 360) * ACG_WORLD_SIZE;
  const y = ACG_WORLD_SIZE / 2 - (ACG_WORLD_SIZE / (2 * Math.PI)) * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [x, y];
}

// Inverse of acgProject: world units back to [lon, lat], lon wrapped to [-180, 180).
function acgUnproject(x, y) {
  const lon = ((((x / ACG_WORLD_SIZE) * 360) % 360) + 360) % 360 - 180;
  const clampedY = Math.max(0, Math.min(ACG_WORLD_SIZE, y));
  const lat = (2 * Math.atan(Math.exp(((ACG_WORLD_SIZE / 2 - clampedY) * 2 * Math.PI) / ACG_WORLD_SIZE)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

// ── Base map (world-map.js) ──────────────────────────────────────────────
// Natural Earth 1:110m land and major lakes, and 1:50m state/province lines of the
// largest countries (~180 KB), loaded on demand the first time a map is shown. Until
// it arrives the maps show the ocean, graticule and planetary lines; then every
// map's world layer fills in.
// Per-browser map preferences (style, city names, roads); storage may be unavailable.
const acgStoredSetting = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const acgStoreSetting = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
let acgWorldMarkupCache = null;
let acgWorldMapRequested = false;
function acgLoadWorldMap() {
  if (acgWorldMapRequested) return;
  acgWorldMapRequested = true;
  const script = document.createElement("script");
  script.src = "world-map.js";
  script.onerror = () => { acgWorldMapRequested = false; };
  document.head.appendChild(script);
}
// Main roads (roads.js, ~0.85 MB) load the first time a map is zoomed in far enough to
// show them: the major tier from ACG_ROADS_MAJOR_ZOOM, the minor one from
// ACG_ROADS_MINOR_ZOOM (both hidden by the "Main roads" option).
const ACG_ROADS_MAJOR_ZOOM = 6, ACG_ROADS_MINOR_ZOOM = 14;
let acgShowRoads = acgStoredSetting("orbital-study-map-roads", "on") === "on";
let acgRoadsRequested = false, acgRoadsMarkupCache = null;
function acgLoadRoads() {
  if (acgRoadsRequested) return;
  acgRoadsRequested = true;
  const script = document.createElement("script");
  script.src = "roads.js";
  script.onerror = () => { acgRoadsRequested = false; };
  document.head.appendChild(script);
}
function acgRoadsMarkup() {
  if (typeof WORLD_ROADS === "undefined") return "";
  if (!acgRoadsMarkupCache) {
    const path = (lines) => lines.map((line) => acgWorldPath(decodeWorldRing(line), false)).join("");
    acgRoadsMarkupCache = `<path class="acg-road minor" d="${path(WORLD_ROADS.minor)}"/><path class="acg-road major" d="${path(WORLD_ROADS.major)}"/>`;
  }
  return acgRoadsMarkupCache;
}
// Called by roads.js once it has run.
function acgRoadsLoaded() {
  document.querySelectorAll("[data-acg-roads]").forEach((group) => { group.innerHTML = acgRoadsMarkup(); });
}
// Called by world-map.js once it has run.
function acgWorldMapLoaded() {
  document.querySelectorAll("[data-acg-world]").forEach((group) => { group.innerHTML = acgWorldMarkup(); });
}
// A ring or line from world-map.js: delta-encoded 0.01° integers → [[lon, lat], ...].
function decodeWorldRing(encoded) {
  const points = [];
  let x = 0, y = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    points.push([x / 100, y / 100]);
  }
  return points;
}
function acgWorldPath(points, closed, skipEdge) {
  let path = "", previous = "", open = false;
  points.forEach(([lon, lat], index) => {
    const [x, y] = acgProject(lon, lat);
    const point = `${x.toFixed(1)},${y.toFixed(1)}`;
    if (point === previous) return;
    const draw = open && !(skipEdge && skipEdge(points[index - 1], points[index]));
    path += `${draw ? "L" : "M"}${point}`;
    open = true;
    previous = point;
  });
  return closed ? `${path}Z` : path;
}
// Borders and coasts are stroked separately from the land fill, so the edges Natural
// Earth adds where it cuts a country at the antimeridian (Russia, Fiji) or closes
// Antarctica along the pole aren't drawn as if they were real borders.
const acgArtificialEdge = ([lon1, lat1], [lon2, lat2]) => (Math.abs(lon1) === 180 && lon1 === lon2) || (lat1 <= -89.99 && lat2 <= -89.99);
function acgWorldMarkup() {
  if (typeof WORLD_MAP === "undefined") {
    acgLoadWorldMap();
    return "";
  }
  if (!acgWorldMarkupCache) {
    const land = WORLD_MAP.land.map(decodeWorldRing);
    const lakes = WORLD_MAP.lakes.map(decodeWorldRing);
    const states = WORLD_MAP.states.map(decodeWorldRing);
    acgWorldMarkupCache =
      `<path class="acg-land" d="${land.map((ring) => acgWorldPath(ring, true)).join("")}"/>` +
      `<path class="acg-lake" d="${lakes.map((ring) => acgWorldPath(ring, true)).join("")}"/>` +
      `<g data-acg-roads>${acgRoadsMarkup()}</g>` +
      `<path class="acg-state" d="${states.map((line) => acgWorldPath(line, false)).join("")}"/>` +
      `<path class="acg-border" d="${[...land, ...lakes].map((ring) => acgWorldPath([...ring, ring[0]], false, acgArtificialEdge)).join("")}"/>`;
  }
  return acgWorldMarkupCache;
}

function acgGraticuleMarkup() {
  const lines = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = acgProject(lon, 0);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${ACG_WORLD_SIZE}" class="acg-graticule"/>`);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = acgProject(0, lat);
    lines.push(`<line x1="0" y1="${y}" x2="${ACG_WORLD_SIZE}" y2="${y}" class="acg-graticule${lat === 0 ? " equator" : ""}"/>`);
  }
  return lines.join("");
}

// Shared across every map instance and both views, so switching between ACG Travel
// and ACG Local Space (or re-entering the system) keeps the same framing.
// zoom 1 = one full world width across the map.
const acgViewport = { cx: ACG_WORLD_SIZE / 2, cy: ACG_WORLD_SIZE / 2, zoom: 1 };

let acgMapCounter = 0;
// The overlay (planetary lines) is tiled like the world itself, so a line near the
// antimeridian keeps showing up on the other side while panning. It gets two extra
// tiles because a line's longitudes are kept continuous rather than wrapped: a
// Local Space great circle can span a full 360° starting anywhere in [-180, 180),
// i.e. up to x = 2W, and the viewBox can sit anywhere in [-W/2, 2W).
// The place search above each Astrocartography map (bindPlaceSearch, place-search.js).
function acgSearchMarkup() {
  return `<div class="acg-search"><input type="search" data-acg-search placeholder="Find a city or town…" aria-label="Find a city or town on the map" enterkeyhint="search"></div>`;
}
function acgMapMarkup() {
  const worldId = `acgWorld${acgMapCounter}`;
  const overlayId = `acgOverlay${acgMapCounter++}`;
  const W = ACG_WORLD_SIZE;
  const tiles = (id, offsets) => offsets.map((x) => `<use href="#${id}" x="${x}"/>`).join("");
  return `
    <div class="acg-map-wrap">
      <svg class="acg-map" role="img" aria-label="World map, Mercator projection">
        <defs>
          <g id="${worldId}"><g data-acg-world>${acgWorldMarkup()}</g>${acgGraticuleMarkup()}</g>
          <g id="${overlayId}" class="acg-overlay" data-acg-overlay></g>
        </defs>
        <rect x="${-W}" y="0" width="${3 * W}" height="${W}" class="acg-ocean"/>
        <g class="acg-tiles" data-acg-tiles></g>
        ${tiles(worldId, [-W, 0, W])}
        ${tiles(overlayId, [-2 * W, -W, 0, W, 2 * W])}
      </svg>
      <svg class="acg-label-layer" aria-hidden="true">
        <g data-acg-labels></g>
        <g class="acg-origin" data-acg-origin visibility="hidden"><title>Drag to move the Local Space origin</title><circle class="acg-origin-hit" r="12"/><text class="acg-origin-glyph" text-anchor="middle" dominant-baseline="central">◉</text></g>
        <text class="acg-label" data-acg-measure visibility="hidden"></text>
      </svg>
      <div class="acg-tooltip" data-acg-tooltip hidden></div>
      <div class="acg-zoom">
        <button type="button" data-acg-zoom-in aria-label="Zoom in" title="Zoom in">＋</button>
        <button type="button" data-acg-zoom-out aria-label="Zoom out" title="Zoom out">−</button>
      </div>
    </div>`;
}

// ── Map styles: image tiles under the lines ─────────────────────────────
// "Relief" (the default) draws Natural Earth II — land colored by climate, with shaded
// relief — under the vector map; "Plain" is the vector map alone. The picture is cut
// into 256-pixel Web Mercator tiles (tools/build-map-tiles.py): tiles/<style>/<z>/<x>/<y>.webp,
// level z being 256·2^z pixels across the world (levels 0–6, ~11.4 MB in all). Only the
// tiles in view are requested, at the level that matches the zoom, over a level two
// steps coarser as a backdrop while they load. The choice is remembered per browser.
const ACG_MAP_STYLES = {
  relief: { label: "Relief", maxZoom: 6 },
  plain: { label: "Plain" },
};
const ACG_TILE_SIZE = 256;
let acgMapStyle = ACG_MAP_STYLES[acgStoredSetting("orbital-study-map-style", "relief")] ? acgStoredSetting("orbital-study-map-style", "relief") : "relief";
let acgShowCities = acgStoredSetting("orbital-study-map-cities", "on") === "on";

// The tile images for `view`: [{key, href, x, y, size}] in world units, the backdrop
// level first. Columns outside 0..2^z-1 are copies of the world beside it.
function acgTilesFor(view, screen) {
  const style = ACG_MAP_STYLES[acgMapStyle];
  if (!style.maxZoom) return [];
  const worldPixels = (ACG_WORLD_SIZE * screen.w * Math.min(2, window.devicePixelRatio || 1)) / view.vw;
  const level = Math.max(0, Math.min(style.maxZoom, Math.ceil(Math.log2(worldPixels / ACG_TILE_SIZE))));
  const tiles = [];
  [...new Set([Math.max(0, level - 2), level])].forEach((zoom) => {
    const count = 2 ** zoom, size = ACG_WORLD_SIZE / count;
    const y0 = Math.max(0, Math.floor(view.top / size)), y1 = Math.min(count - 1, Math.floor((view.top + view.vh) / size));
    for (let column = Math.floor(view.left / size); column <= Math.floor((view.left + view.vw) / size); column++) {
      const x = ((column % count) + count) % count;
      for (let row = y0; row <= y1; row++) {
        tiles.push({ key: `${zoom}/${column}/${row}`, href: `tiles/${acgMapStyle}/${zoom}/${x}/${row}.webp`, x: column * size, y: row * size, size });
      }
    }
  });
  return tiles;
}

// City labels, in screen space above the map: the most populous places in view first
// (places.js is sorted by population), each kept only if its name fits without
// touching a planet label or another city — so zooming in reveals smaller places.
const ACG_CITY_LIMIT = 60;
let acgCityMeasure = null;
function acgCityLabels(view, screen, blocked) {
  if (!acgShowCities) return "";
  if (typeof placeIndex === "undefined" || !placeIndex) {
    if (typeof loadPlaces === "function") loadPlaces();
    return "";
  }
  if (!acgCityMeasure) {
    acgCityMeasure = document.createElement("canvas").getContext("2d");
    acgCityMeasure.font = "600 10px Manrope, sans-serif";
  }
  const taken = [...blocked];
  const overlaps = (box) => taken.some((other) => box.x < other.x + other.w && other.x < box.x + box.w && box.y < other.y + other.h && other.y < box.y + box.h);
  const centre = view.left + view.vw / 2;
  let markup = "", placed = 0;
  for (let i = 0; i < placeIndex.length && i < 6000 && placed < ACG_CITY_LIMIT; i++) {
    const place = placeIndex[i];
    const [worldX, worldY] = acgProject(Number(place.lon), Number(place.lat));
    const x = worldX + Math.round((centre - worldX) / ACG_WORLD_SIZE) * ACG_WORLD_SIZE;
    const sx = ((x - view.left) * screen.w) / view.vw, sy = ((worldY - view.top) * screen.h) / view.vh;
    if (sx < 4 || sy < 4 || sx > screen.w - 4 || sy > screen.h - 4) continue;
    const width = acgCityMeasure.measureText(place.name).width;
    const dot = { x: sx - 3, y: sy - 3, w: 6, h: 6 };
    const right = { x: sx + 5, y: sy - 7, w: width + 4, h: 14 };
    const left = { x: sx - 9 - width, y: sy - 7, w: width + 4, h: 14 };
    if (overlaps(dot)) continue;
    const box = [right, left].find((candidate) => candidate.x > 0 && candidate.x + candidate.w < screen.w && !overlaps(candidate));
    if (!box) continue;
    taken.push(dot, { x: box.x - 3, y: box.y - 2, w: box.w + 6, h: box.h + 4 });
    placed++;
    markup += `<g class="acg-city"><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.2"/><text x="${(box === right ? box.x : box.x + box.w - 2).toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="${box === right ? "start" : "end"}" dominant-baseline="central">${escapeHtml(place.name)}</text></g>`;
  }
  return markup;
}

// `onViewportChange` fires after this map pans or zooms, so paired maps (Pair
// Explorer) can follow along via their own refresh().
// `onMapClick({lat, lon})` fires for a click that didn't pan the map; `setPins` draws
// numbered markers (saved locations) above it. While `doubleClickActive()` is true, a
// double-click or double-tap calls `onMapDoubleClick({lat, lon})` instead, and a
// single click waits ACG_DOUBLE_TAP_MS to be sure it isn't the first of two.
function bindAcgMap(wrap, { onViewportChange, onMapClick, onMapDoubleClick, doubleClickActive = () => !!onMapDoubleClick } = {}) {
  const svg = wrap.querySelector(".acg-map");
  const labelGroup = wrap.querySelector("[data-acg-labels]");
  const originMarker = wrap.querySelector("[data-acg-origin]");
  const measureText = wrap.querySelector("[data-acg-measure]");
  const zoomControls = wrap.querySelector(".acg-zoom");
  const W = ACG_WORLD_SIZE;
  let labelLines = [];
  let labelFrame = 0;
  // Draggable Local Space origin: {lat, lon, onMove} while shown, null otherwise.
  let origin = null;
  let pins = [];
  wrap.dataset.mapStyle = acgMapStyle;
  const tileGroup = svg.querySelector("[data-acg-tiles]");
  const tileNodes = new Map();
  // Keeps exactly the tiles acgTilesFor asks for, reusing the ones already there.
  const updateTiles = (view, screen) => {
    wrap.dataset.mapStyle = acgMapStyle;
    const wanted = acgTilesFor(view, screen);
    const keys = new Set(wanted.map((tile) => tile.key + acgMapStyle));
    tileNodes.forEach((node, key) => { if (!keys.has(key)) { node.remove(); tileNodes.delete(key); } });
    wanted.forEach((tile) => {
      const key = tile.key + acgMapStyle;
      if (tileNodes.has(key)) return;
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", tile.href);
      // A hair of overlap hides seams between neighbouring tiles.
      image.setAttribute("x", tile.x - 0.05);
      image.setAttribute("y", tile.y - 0.05);
      image.setAttribute("width", tile.size + 0.1);
      image.setAttribute("height", tile.size + 0.1);
      image.setAttribute("preserveAspectRatio", "none");
      tileGroup.appendChild(image);
      tileNodes.set(key, image);
    });
    // Backdrop level first, sharper level on top.
    [...tileNodes.entries()].sort(([a], [b]) => Number(a.split("/")[0]) - Number(b.split("/")[0])).forEach(([, node]) => tileGroup.appendChild(node));
  };
  // City names arrive with places.js.
  window.addEventListener("orbital-places-loaded", () => scheduleLabels());
  const currentView = (screen) => {
    const { vw, vh } = viewBoxSize(screen);
    return { left: acgViewport.cx - vw / 2, top: acgViewport.cy - vh / 2, vw, vh };
  };
  const layoutLabels = () => {
    labelFrame = 0;
    const screen = size();
    if (!screen.w || !screen.h) return;
    const view = currentView(screen);
    const mapRect = svg.getBoundingClientRect();
    const zoomRect = zoomControls.getBoundingClientRect();
    const blocked = [{ x: zoomRect.left - mapRect.left, y: zoomRect.top - mapRect.top, w: zoomRect.width, h: zoomRect.height }];
    if (origin) {
      // Of the origin's tiled copies, the one nearest the view centre is the one on screen.
      const [x, y] = acgProject(origin.lon, origin.lat);
      const tiledX = x + Math.round((acgViewport.cx - x) / W) * W;
      const sx = ((tiledX - view.left) * screen.w) / view.vw, sy = ((y - view.top) * screen.h) / view.vh;
      originMarker.setAttribute("transform", `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
      originMarker.setAttribute("visibility", "visible");
      blocked.push({ x: sx - 12, y: sy - 12, w: 24, h: 24 });
    } else {
      originMarker.setAttribute("visibility", "hidden");
    }
    updateTiles(view, screen);
    // Roads by zoom (custom properties, since the roads are drawn through <use> copies).
    const majorRoads = acgShowRoads && acgViewport.zoom >= ACG_ROADS_MAJOR_ZOOM;
    wrap.style.setProperty("--acg-roads-major", majorRoads ? "visible" : "hidden");
    wrap.style.setProperty("--acg-roads-minor", acgShowRoads && acgViewport.zoom >= ACG_ROADS_MINOR_ZOOM ? "visible" : "hidden");
    if (majorRoads) acgLoadRoads();
    // Saved-location pins, on whichever copy of the world is nearest the view centre.
    let pinMarkup = "";
    pins.forEach((pin) => {
      const [x, y] = acgProject(pin.lon, pin.lat);
      const tiledX = x + Math.round((acgViewport.cx - x) / W) * W;
      const sx = ((tiledX - view.left) * screen.w) / view.vw, sy = ((y - view.top) * screen.h) / view.vh;
      if (sx < -10 || sy < -10 || sx > screen.w + 10 || sy > screen.h + 10) return;
      blocked.push({ x: sx - 9, y: sy - 9, w: 18, h: 18 });
      pinMarkup += `<g class="acg-pin" transform="translate(${sx.toFixed(1)},${sy.toFixed(1)})"><circle r="8"/><text text-anchor="middle" dominant-baseline="central">${pin.label}</text></g>`;
    });
    const placements = acgPlaceLabels(labelLines, view, screen, (text) => acgMeasureLabel(measureText, text), blocked);
    const cities = acgCityLabels(view, screen, [...blocked, ...placements.map((placement) => placement.box)]);
    labelGroup.innerHTML = cities + acgLabelsMarkup(placements) + pinMarkup;
  };
  // Coalesces bursts (every pointermove while dragging) into one layout per frame.
  const scheduleLabels = () => {
    if (!labelFrame) labelFrame = requestAnimationFrame(layoutLabels);
  };
  const size = () => ({ w: svg.clientWidth, h: svg.clientHeight });
  const viewBoxSize = ({ w, h }) => {
    const vw = W / acgViewport.zoom;
    return { vw, vh: (vw * h) / w };
  };
  const apply = (notify = true) => {
    const screen = size();
    if (!screen.w || !screen.h) return;
    acgViewport.zoom = Math.max(1, Math.min(ACG_MAX_ZOOM, acgViewport.zoom));
    const { vw, vh } = viewBoxSize(screen);
    acgViewport.cx = ((acgViewport.cx % W) + W) % W;
    acgViewport.cy = vh >= W ? W / 2 : Math.max(vh / 2, Math.min(W - vh / 2, acgViewport.cy));
    svg.setAttribute("viewBox", `${acgViewport.cx - vw / 2} ${acgViewport.cy - vh / 2} ${vw} ${vh}`);
    scheduleLabels();
    if (notify !== false && onViewportChange) onViewportChange();
  };
  // Keeps the world point under (sx, sy) — screen px within the svg — fixed while zooming.
  const zoomAt = (factor, sx, sy) => {
    const screen = size();
    if (!screen.w || !screen.h) return;
    const before = viewBoxSize(screen);
    const worldX = acgViewport.cx - before.vw / 2 + (sx / screen.w) * before.vw;
    const worldY = acgViewport.cy - before.vh / 2 + (sy / screen.h) * before.vh;
    acgViewport.zoom = Math.max(1, Math.min(ACG_MAX_ZOOM, acgViewport.zoom * factor));
    const after = viewBoxSize(screen);
    acgViewport.cx = worldX - (sx / screen.w) * after.vw + after.vw / 2;
    acgViewport.cy = worldY - (sy / screen.h) * after.vh + after.vh / 2;
    apply();
  };

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(Math.exp(-delta * 0.002), event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false },
  );

  let drag = null;
  // A press that moves less than a few pixels is a click (onMapClick), not a pan.
  let press = null;
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    press = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
  });
  // Hover: the 4 lines nearest the point under the cursor (hidden while panning).
  const tooltip = wrap.querySelector("[data-acg-tooltip]");
  let hover = null;
  let intersections = { lines: null, points: [] };
  const hideTooltip = () => {
    tooltip.hidden = true;
  };
  const showNearest = () => {
    const { clientX, clientY } = hover;
    hover.frame = 0;
    const screen = size();
    const rect = svg.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    if (!labelLines.length || sx < 0 || sy < 0 || sx > screen.w || sy > screen.h) return hideTooltip();
    const view = currentView(screen);
    const [lon, lat] = acgUnproject(view.left + (sx * view.vw) / screen.w, view.top + (sy * view.vh) / screen.h);
    // Only Travel lines have a line type; Local Space lines all cross at the origin
    // and its antipode, so intersections are Travel-only.
    let nearestCrossings = null;
    if (labelLines[0].lineKey) {
      if (intersections.lines !== labelLines) intersections = { lines: labelLines, points: acgLineIntersections(labelLines) };
      nearestCrossings = acgNearestIntersections(intersections.points, lat, lon);
    }
    tooltip.innerHTML = acgNearestLinesMarkup(acgNearestLines(labelLines, lat, lon), nearestCrossings, acgZenithZonesAt(labelLines, lat, lon));
    tooltip.hidden = false;
    // Beside the cursor, flipped to the other side near the right/bottom edges.
    const x = sx + 14 + tooltip.offsetWidth > screen.w ? sx - 14 - tooltip.offsetWidth : sx + 14;
    const y = sy + 14 + tooltip.offsetHeight > screen.h ? sy - 14 - tooltip.offsetHeight : sy + 14;
    tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  svg.addEventListener("pointermove", (event) => {
    if (drag) return;
    hover = hover || { frame: 0 };
    hover.clientX = event.clientX;
    hover.clientY = event.clientY;
    if (!hover.frame) hover.frame = requestAnimationFrame(showNearest);
  });
  svg.addEventListener("pointerleave", () => {
    if (hover?.frame) cancelAnimationFrame(hover.frame);
    hover = null;
    hideTooltip();
  });

  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    hideTooltip();
    const screen = size();
    const { vw, vh } = viewBoxSize(screen);
    acgViewport.cx -= ((event.clientX - drag.x) * vw) / screen.w;
    acgViewport.cy -= ((event.clientY - drag.y) * vh) / screen.h;
    drag = { x: event.clientX, y: event.clientY };
    apply();
  });
  const endDrag = () => {
    drag = null;
    press = null;
  };
  const pointAt = (clientX, clientY) => {
    const screen = size();
    const rect = svg.getBoundingClientRect();
    const view = currentView(screen);
    const [lon, lat] = acgUnproject(view.left + ((clientX - rect.left) * view.vw) / screen.w, view.top + ((clientY - rect.top) * view.vh) / screen.h);
    return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
  };
  // Pointer events cover mouse, touch and pen alike, so double-tap works like double-click.
  let pendingClick = null;
  svg.addEventListener("pointerup", (event) => {
    const tapped = press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5;
    endDrag();
    if (!tapped) return;
    const point = pointAt(event.clientX, event.clientY);
    const second = pendingClick && event.timeStamp - pendingClick.time < ACG_DOUBLE_TAP_MS
      && Math.hypot(event.clientX - pendingClick.x, event.clientY - pendingClick.y) < ACG_DOUBLE_TAP_PX;
    if (second && doubleClickActive()) {
      clearTimeout(pendingClick.timer);
      pendingClick = null;
      onMapDoubleClick(point);
      return;
    }
    if (pendingClick) clearTimeout(pendingClick.timer);
    const click = () => { pendingClick = null; onMapClick?.(point); };
    pendingClick = { time: event.timeStamp, x: event.clientX, y: event.clientY, timer: doubleClickActive() ? setTimeout(click, ACG_DOUBLE_TAP_MS) : null };
    if (!pendingClick.timer) click();
  });
  svg.addEventListener("pointercancel", endDrag);

  // Dragging the origin marker (it sits above the map, so this never pans the map).
  // Moves are coalesced to one per frame, since each one recomputes every line.
  let originDrag = null;
  const moveOriginTo = (clientX, clientY) => {
    const screen = size();
    const rect = svg.getBoundingClientRect();
    const view = currentView(screen);
    const [lon, lat] = acgUnproject(view.left + ((clientX - rect.left) * view.vw) / screen.w, view.top + ((clientY - rect.top) * view.vh) / screen.h);
    if (origin) origin.onMove({ lat, lon });
  };
  originMarker.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !origin) return;
    event.stopPropagation();
    originMarker.setPointerCapture(event.pointerId);
    originDrag = { frame: 0, x: event.clientX, y: event.clientY };
  });
  originMarker.addEventListener("pointermove", (event) => {
    if (!originDrag) return;
    originDrag.x = event.clientX;
    originDrag.y = event.clientY;
    if (!originDrag.frame) {
      originDrag.frame = requestAnimationFrame(() => {
        if (!originDrag) return;
        originDrag.frame = 0;
        moveOriginTo(originDrag.x, originDrag.y);
      });
    }
  });
  const endOriginDrag = (event) => {
    if (!originDrag) return;
    cancelAnimationFrame(originDrag.frame);
    moveOriginTo(event.clientX, event.clientY);
    originDrag = null;
  };
  originMarker.addEventListener("pointerup", endOriginDrag);
  originMarker.addEventListener("pointercancel", endOriginDrag);

  const zoomFromCenter = (factor) => {
    const screen = size();
    zoomAt(factor, screen.w / 2, screen.h / 2);
  };
  wrap.querySelector("[data-acg-zoom-in]").addEventListener("click", () => zoomFromCenter(ACG_BUTTON_ZOOM_STEP));
  wrap.querySelector("[data-acg-zoom-out]").addEventListener("click", () => zoomFromCenter(1 / ACG_BUTTON_ZOOM_STEP));

  new ResizeObserver(apply).observe(svg);
  apply();
  return {
    setLabelLines(lines) {
      labelLines = lines;
      scheduleLabels();
      // Lines changed under a resting pointer (view switch, filter, timeline): refresh the tooltip.
      if (hover && !hover.frame) hover.frame = requestAnimationFrame(showNearest);
    },
    setOrigin(value) {
      origin = value;
      scheduleLabels();
    },
    setPins(value) {
      pins = value;
      scheduleLabels();
    },
    // Pans so this point is in the middle of the map, zooming in to at least continent
    // level if needed (zoomed all the way out, the whole world height is on screen and
    // the map couldn't center the point vertically).
    centerOn({ lat, lon }, minZoom = 3) {
      const [x, y] = acgProject(lon, lat);
      acgViewport.zoom = Math.min(ACG_MAX_ZOOM, Math.max(acgViewport.zoom, minZoom));
      acgViewport.cx = x;
      acgViewport.cy = y;
      apply();
    },
    viewCenter() {
      const [lon, lat] = acgUnproject(acgViewport.cx, acgViewport.cy);
      return { lat, lon };
    },
    // Re-reads the shared viewport (another map moved it) without notifying back.
    refresh() {
      apply(false);
    },
  };
}

// ── Planet palette and filters ──────────────────────────────────────────
// One color per planet (every line a planet draws shares it). Lunar Nodes is a
// single filter covering both nodes; each node still labels its own lines.
const ACG_BODIES = [
  { key: "Sun", glyph: "☉", color: "#e3a008", group: "Primary" },
  { key: "Moon", glyph: "☽", color: "#6f8fb3", group: "Primary" },
  { key: "Mercury", glyph: "☿", color: "#e2711d", group: "Primary" },
  { key: "Venus", glyph: "♀", color: "#e3649b", group: "Primary" },
  { key: "Mars", glyph: "♂", color: "#d0312d", group: "Primary" },
  { key: "Jupiter", glyph: "♃", color: "#7a55c7", group: "Primary" },
  { key: "Saturn", glyph: "♄", color: "#8b7355", group: "Primary" },
  { key: "Uranus", glyph: "♅", color: "#11a4d4", group: "Primary" },
  { key: "Neptune", glyph: "♆", color: "#2a9d8f", group: "Primary" },
  { key: "Pluto", glyph: "♇", color: "#b0406f", group: "Primary" },
  { key: "Chiron", glyph: "⚷", color: "#7d9b2e", group: "Secondary" },
  {
    key: "Lunar Nodes",
    glyph: "☊",
    color: "#8a8a8a",
    group: "Secondary",
    members: [
      { name: "North Node", glyph: "☊" },
      { name: "South Node", glyph: "☋" },
    ],
  },
];
const ACG_LINE_TYPES = [
  { key: "ASC", label: "Ascendant", short: "AS" },
  { key: "DSC", label: "Descendant", short: "DS" },
  { key: "IC", label: "IC", short: "IC" },
  { key: "MC", label: "MC", short: "MC" },
];
// Remembered across re-renders (and shared by every map), like the viewport.
const acgFilters = {
  bodies: new Set(ACG_BODIES.map((body) => body.key)),
  lines: new Set(ACG_LINE_TYPES.map((line) => line.key)),
};

// ── ACG Travel lines ────────────────────────────────────────────────────
// Geocentric apparent right ascension/declination (degrees) of a chart body at
// its birth moment. The 10 real bodies come straight from Astronomy Engine, and
// Chiron from its own simulation (chironApparentVector, ephemeris.js) — true equator
// and equinox of date, including the body's ecliptic latitude. Everything else —
// the lunar nodes (which lie on the ecliptic, so latitude 0 is exact), the other
// points, and every body under the synthetic engine — converts the app's own
// tropical ecliptic longitude at ecliptic latitude 0.
function acgBodyEquatorial(position, date, offsetMinutes) {
  const real = EPHEMERIS_ENGINE === "astronomy-engine" && (REAL_EPHEMERIS_BODIES.has(position.name) || position.name === "Chiron");
  if (real) {
    const vector = position.name === "Chiron" ? chironApparentVector(date) : Astronomy.GeoVector(Astronomy.Body[position.name], date, true);
    const ofDate = Astronomy.EquatorFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date), vector));
    return { rightAscension: ofDate.ra * 15, declination: ofDate.dec };
  }
  let longitude = positionAngleAtTime(position, offsetMinutes);
  if (zodiacMode === "Sidereal") longitude = norm360(longitude + LAHIRI_AYANAMSHA);
  return eclipticPointEquatorial(longitude, Astronomy.e_tilt(date).tobl);
}

// MC: the longitude where the body sat on the upper meridian (hour angle 0),
// λ = RA − GST; IC is 180° from it. ASC/DSC: at latitude φ the body is on the
// horizon at hour angle ±H0, cos H0 = −tan φ · tan δ — rising (ASC) at λ = MC − H0,
// setting (DSC) at λ = MC + H0. Sampling on a union of a latitude grid and an
// hour-angle grid keeps the curves smooth both near the equator (where a
// low-declination body's curve runs almost vertically) and near the critical
// latitude 90° − |δ| (where ASC and DSC bend round and meet on the MC/IC line).
function acgHorizonCurve(mcLongitude, declination, side) {
  const tanDec = Math.tan((declination * Math.PI) / 180);
  // On the celestial equator the body rises/sets at hour angle 90° at every latitude.
  if (Math.abs(tanDec) < 1e-12) return [[mcLongitude + side * 90, -ACG_MAX_LAT], [mcLongitude + side * 90, ACG_MAX_LAT]];
  const hourAngles = new Set();
  for (let h = 0; h <= 180; h += 1) hourAngles.add(h);
  for (let lat = -ACG_MAX_LAT; lat <= ACG_MAX_LAT; lat += 1) {
    const cosH = -Math.tan((lat * Math.PI) / 180) * tanDec;
    if (Math.abs(cosH) <= 1) hourAngles.add((Math.acos(cosH) * 180) / Math.PI);
  }
  const points = [];
  [...hourAngles]
    .sort((a, b) => a - b)
    .forEach((h) => {
      const lat = (Math.atan(-Math.cos((h * Math.PI) / 180) / tanDec) * 180) / Math.PI;
      if (!Number.isFinite(lat) || Math.abs(lat) > ACG_MAX_LAT) return;
      points.push([mcLongitude + side * h, lat]);
    });
  return points;
}

// A line segment in world units: points [x, y, facing] plus its bounding box, so
// label layout can skip segments nowhere near the view. `facing` is only
// meaningful for Local Space (true on the half of the great circle that points
// toward the planet); Travel lines are facing everywhere. `vectors` are the same
// points as unit vectors on the globe, for the hover tooltip's distances.
function acgSegment(lonLatPoints, facing = () => true) {
  const points = lonLatPoints.map((point) => {
    const [x, y] = acgProject(point[0], point[1]);
    return [x, y, facing(point)];
  });
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  const vectors = lonLatPoints.map((point) => acgUnitVector(point[0], point[1]));
  return { points, vectors, lonLat: lonLatPoints, bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
}

// ── Distances on the globe ──────────────────────────────────────────────
// Every line is stored as a chain of short great-circle arcs (0.5–1° apart on the
// curves; MC/IC are single meridian arcs, and Local Space arcs lie exactly on their
// great circle), so the true surface distance from a point to a line is the
// minimum over its arcs of the exact point-to-arc distance.
const ACG_EARTH_RADIUS_KM = 6371;
function acgUnitVector(lon, lat) {
  const lonR = (lon * Math.PI) / 180, latR = (lat * Math.PI) / 180;
  return [Math.cos(latR) * Math.cos(lonR), Math.cos(latR) * Math.sin(lonR), Math.sin(latR)];
}
const acgDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const acgCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const acgNorm = (a) => Math.hypot(a[0], a[1], a[2]);
// Angle (radians) between two unit vectors; atan2 stays accurate at tiny angles.
const acgAngle = (a, b) => Math.atan2(acgNorm(acgCross(a, b)), acgDot(a, b));
// Angle from p to the shorter great-circle arc a→b: the perpendicular distance to
// the arc's great circle when the foot of that perpendicular lands between a and b,
// otherwise the distance to the nearer endpoint.
function acgAngleToArc(p, a, b) {
  const normal = acgCross(a, b);
  const length = acgNorm(normal);
  const toEnds = () => Math.min(acgAngle(p, a), acgAngle(p, b));
  if (length < 1e-12) return toEnds();
  const n = [normal[0] / length, normal[1] / length, normal[2] / length];
  const offPlane = acgDot(p, n);
  const foot = [p[0] - offPlane * n[0], p[1] - offPlane * n[1], p[2] - offPlane * n[2]];
  if (acgNorm(foot) < 1e-12) return toEnds();
  if (acgDot(acgCross(a, foot), n) >= 0 && acgDot(acgCross(foot, b), n) >= 0) return Math.asin(Math.min(1, Math.abs(offPlane)));
  return toEnds();
}
function acgDistanceToLineKm(point, line) {
  let best = Infinity;
  line.segments.forEach(({ vectors }) => {
    for (let i = 1; i < vectors.length; i += 1) best = Math.min(best, acgAngleToArc(point, vectors[i - 1], vectors[i]));
  });
  return best * ACG_EARTH_RADIUS_KM;
}
// The `count` lines nearest to (lat, lon), closest first: [{line, km}].
function acgNearestLines(lines, lat, lon, count = 4) {
  const point = acgUnitVector(lon, lat);
  return lines
    .map((line) => ({ line, km: acgDistanceToLineKm(point, line) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
// ── Travel line intersections ───────────────────────────────────────────
// Every Travel line is single-valued in latitude (MC/IC are constant-longitude;
// an AS/DS curve's latitude runs monotonically with hour angle from one critical
// latitude to the other), so two lines cross wherever lonA(lat) − lonB(lat),
// wrapped to ±180°, changes sign. Walking the union of both lines' own sample
// latitudes makes both lines linear within each step, so each crossing is solved
// exactly for the lines as drawn. A body's own lines are skipped (its AS/DS meet
// its MC/IC at the critical latitudes by construction), and so are the two nodes
// against each other (North Node DS is South Node AS, etc. — coincident, not crossing).
function acgLatitudeProfile(line) {
  return line.segments[0].lonLat.map(([lon, lat]) => [lat, lon]).sort((a, b) => a[0] - b[0]);
}
function acgLonAtLatitude(profile, lat) {
  let lo = 0, hi = profile.length - 1;
  if (lat < profile[lo][0] || lat > profile[hi][0]) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid][0] <= lat) lo = mid;
    else hi = mid;
  }
  const [lat0, lon0] = profile[lo], [lat1, lon1] = profile[hi];
  return lat1 === lat0 ? lon0 : lon0 + ((lat - lat0) / (lat1 - lat0)) * (lon1 - lon0);
}
function acgLineIntersections(lines) {
  const profiles = lines.map(acgLatitudeProfile);
  const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[i].bodyKey === lines[j].bodyKey) continue;
      const a = profiles[i], b = profiles[j];
      const from = Math.max(a[0][0], b[0][0]), to = Math.min(a[a.length - 1][0], b[b.length - 1][0]);
      if (from >= to) continue;
      const lats = [...new Set([from, to, ...a.map((p) => p[0]), ...b.map((p) => p[0])])].filter((lat) => lat >= from && lat <= to).sort((x, y) => x - y);
      let previous = null;
      lats.forEach((lat) => {
        const lonA = acgLonAtLatitude(a, lat);
        const gap = wrap(lonA - acgLonAtLatitude(b, lat));
        // A sign change near zero is a crossing; one near ±180° is just the wrap.
        const crosses = previous && Math.abs(previous.gap) < 90 && Math.abs(gap) < 90 && ((previous.gap < 0 && gap >= 0) || (previous.gap > 0 && gap <= 0));
        if (crosses) {
          const t = previous.gap / (previous.gap - gap);
          const crossLat = previous.lat + t * (lat - previous.lat);
          found.push({ lat: crossLat, lon: wrap(acgLonAtLatitude(a, crossLat)), a: lines[i], b: lines[j] });
        }
        previous = { lat, gap };
      });
    }
  }
  return found;
}
function acgNearestIntersections(intersections, lat, lon, count = 4) {
  const point = acgUnitVector(lon, lat);
  return intersections
    .map((crossing) => ({ crossing, km: acgAngle(point, acgUnitVector(crossing.lon, crossing.lat)) * ACG_EARTH_RADIUS_KM }))
    .sort((x, y) => x.km - y.km)
    .slice(0, count);
}

function acgNearestLinesMarkup(nearest, nearestCrossings, zenithZones = []) {
  const km = (value) => `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-US")} km`;
  const zones = zenithZones.length
    ? `<div class="acg-tooltip-title">Zenith Zones:</div>${zenithZones
        .map(({ line, km: distance }) => `<div class="acg-tooltip-row"><span style="color:${line.color}">◯</span> ${escapeHtml(line.zenith.name)} zenith (${km(distance)} from centre)</div>`)
        .join("")}<div class="acg-tooltip-section"></div>`
    : "";
  const lines = `${zones}<div class="acg-tooltip-title">Nearest Lines:</div>${nearest
    .map(({ line, km: distance }) => `<div class="acg-tooltip-row"><span style="color:${line.color}">–</span> ${line.hoverName} (${km(distance)})</div>`)
    .join("")}`;
  if (!nearestCrossings) return lines;
  return `${lines}<div class="acg-tooltip-title acg-tooltip-section">Nearest Intersections:</div>${
    nearestCrossings.length
      ? nearestCrossings
          .map(
            ({ crossing, km: distance }) =>
              `<div class="acg-tooltip-row"><span style="color:${crossing.a.color}">–</span><span style="color:${crossing.b.color}">–</span> ${crossing.a.hoverName} × ${crossing.b.hoverName} (${km(distance)})</div>`,
          )
          .join("")
      : `<div class="acg-tooltip-row">None among the shown lines</div>`
  }`;
}
function acgSegmentsPath(segments) {
  return segments
    .map((segment) => segment.points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(3)},${y.toFixed(3)}`).join(""))
    .join("");
}

// Zenith zone: every point within ACG_ZENITH_RADIUS_KM of the zenith point on the
// ground — a true circle on the globe, so on the Mercator map it grows and turns
// slightly egg-shaped away from the equator. Traced by compass bearing from the
// centre (the destination-point formula), longitudes kept continuous around it.
const ACG_ZENITH_RADIUS_KM = 250;
function acgZenithPath(lon0, lat0) {
  const rad = Math.PI / 180, arc = ACG_ZENITH_RADIUS_KM / ACG_EARTH_RADIUS_KM;
  const sinLat0 = Math.sin(lat0 * rad), cosLat0 = Math.cos(lat0 * rad);
  const points = [];
  for (let bearing = 0; bearing < 360; bearing += 4) {
    const b = bearing * rad;
    const lat = Math.asin(sinLat0 * Math.cos(arc) + cosLat0 * Math.sin(arc) * Math.cos(b));
    const lon = lon0 + Math.atan2(Math.sin(b) * Math.sin(arc) * cosLat0, Math.cos(arc) - sinLat0 * Math.sin(lat)) / rad;
    const [x, y] = acgProject(lon, lat / rad);
    points.push(`${points.length ? "L" : "M"}${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return points.join("") + "Z";
}
// Zenith zones containing (lat, lon), nearest centre first: [{line, km}].
function acgZenithZonesAt(lines, lat, lon) {
  const point = acgUnitVector(lon, lat);
  return lines
    .filter((line) => line.zenith)
    .map((line) => ({ line, km: acgAngle(point, acgUnitVector(line.zenith.lon, line.zenith.lat)) * ACG_EARTH_RADIUS_KM }))
    .filter(({ km }) => km <= ACG_ZENITH_RADIUS_KM)
    .sort((x, y) => x.km - y.km);
}

// The chart's birth moment shifted by the timeline slider's offset.
function acgMoment(chart, offsetMinutes) {
  return new Date(chartBirthMomentUTC(chart).getTime() + offsetMinutes * 60000);
}
function acgEachBody(chart, callback) {
  ACG_BODIES.forEach((body) => {
    (body.members || [{ name: body.key, glyph: body.glyph }]).forEach((member) => {
      const position = chart.positions.find((item) => item.name === member.name);
      if (position) callback(body, member, position);
    });
  });
}

// Every Travel line for a chart at a timeline offset:
// {bodyKey, lineKey, color, label, segments, d}. Filtering only decides which ones
// get drawn; labels are placed per view by acgPlaceLabels.
function acgTravelLines(chart, offsetMinutes) {
  if (!chart || !chart.positions?.length || typeof Astronomy === "undefined") return [];
  const date = acgMoment(chart, offsetMinutes);
  const siderealDegrees = Astronomy.SiderealTime(date) * 15;
  const lines = [];
  acgEachBody(chart, (body, member, position) => {
    const { rightAscension, declination } = acgBodyEquatorial(position, date, offsetMinutes);
    const mc = ((((rightAscension - siderealDegrees + 180) % 360) + 360) % 360) - 180;
    const add = (lineKey, points, extra = {}) => {
      if (points.length < 2) return;
      const short = ACG_LINE_TYPES.find((line) => line.key === lineKey).short;
      const segments = [acgSegment(points)];
      lines.push({ bodyKey: body.key, lineKey, member: member.name, glyph: member.glyph, short, color: body.color, label: `${member.glyph} ${short}`, hoverName: `${member.name} ${short}`, segments, d: acgSegmentsPath(segments), ...extra });
    };
    // Pole to pole: the drawing is clipped at the map's edge anyway (acgProject
    // clamps latitude), but hover distances need the whole meridian. The equator
    // point splits it into two arcs, since pole-to-pole alone would be ambiguous.
    // The zenith point — where the body stood exactly overhead — lies on its MC line
    // at the latitude equal to its declination; its zone (acgZenithPath) is drawn with the MC line.
    add("MC", [[mc, -90], [mc, 0], [mc, 90]], { zenith: { lon: mc, lat: declination, name: member.name, glyph: member.glyph, d: acgZenithPath(mc, declination) } });
    add("IC", [[mc + 180, -90], [mc + 180, 0], [mc + 180, 90]]);
    add("ASC", acgHorizonCurve(mc, declination, -1));
    add("DSC", acgHorizonCurve(mc, declination, 1));
  });
  return lines;
}

// ── ACG Local Space lines ───────────────────────────────────────────────
// The great circle leaving (lat0, lon0) at compass bearing `bearing` (degrees
// clockwise from north), traced all the way round (0-360° of arc). Longitudes are
// kept continuous (unwrapped) so the path never jumps across the map; stretches
// beyond the Mercator cutoff near the poles split it into separate segments.
// Points are [lon, lat, arc]; arc ≤ 180° is the half heading toward the bearing.
function acgGreatCircleSegments(lat0, lon0, bearing) {
  const rad = Math.PI / 180;
  const sinLat0 = Math.sin(lat0 * rad), cosLat0 = Math.cos(lat0 * rad);
  const sinBearing = Math.sin(bearing * rad), cosBearing = Math.cos(bearing * rad);
  const segments = [];
  let current = [];
  for (let arc = 0; arc <= 360; arc += 0.5) {
    const sinArc = Math.sin(arc * rad), cosArc = Math.cos(arc * rad);
    const sinLat = sinLat0 * cosArc + cosLat0 * sinArc * cosBearing;
    const lat = Math.asin(Math.max(-1, Math.min(1, sinLat))) / rad;
    if (Math.abs(lat) > ACG_MAX_LAT) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    let lon = lon0 + Math.atan2(sinBearing * sinArc * cosLat0, cosArc - sinLat0 * sinLat) / rad;
    if (current.length) {
      const previous = current[current.length - 1][0];
      lon -= 360 * Math.round((lon - previous) / 360);
    } else {
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    }
    current.push([lon, lat, arc]);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

// One line per body: the great circle through the origin (the birthplace unless
// moved) in the direction (azimuth) the body lay from `directionsFrom` — the origin
// itself for relocated Local Space (directions recomputed for the new place), or the
// birthplace for natal directions (the birth compass carried to the new place). Azimuth comes from Astronomy Engine's
// Horizon() fed the same geocentric RA/Dec the Travel lines use. The half of the
// circle heading toward the body is marked `facing`, and labels prefer it — so the
// two nodes (always exactly opposite, hence sharing one great circle) get their
// labels on opposite halves.
function acgLocalSpaceLines(chart, offsetMinutes, origin, directionsFrom = origin) {
  if (!chart || !chart.positions?.length || !origin || !directionsFrom || typeof Astronomy === "undefined") return [];
  const { lat: lat0, lon: lon0 } = origin;
  const date = acgMoment(chart, offsetMinutes);
  const observer = new Astronomy.Observer(directionsFrom.lat, directionsFrom.lon, 0);
  const lines = [];
  acgEachBody(chart, (body, member, position) => {
    const { rightAscension, declination } = acgBodyEquatorial(position, date, offsetMinutes);
    const azimuth = Astronomy.Horizon(date, observer, rightAscension / 15, declination, null).azimuth;
    const segments = acgGreatCircleSegments(lat0, lon0, azimuth).map((points) => acgSegment(points, (point) => point[2] <= 180));
    if (!segments.length) return;
    lines.push({ bodyKey: body.key, member: member.name, glyph: member.glyph, color: body.color, label: member.glyph, hoverName: member.name, segments, d: acgSegmentsPath(segments), azimuth });
  });
  return lines;
}

function acgBirthplace(chart) {
  const lat = Number(chart?.latitude), lon = Number(chart?.longitude);
  if (!chart || chart.latitude === "" || chart.longitude === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
// A Local Space origin dragged/moved away from the birthplace is stored on the
// chart itself (chart.localSpaceOrigin = {lat, lon}), so it's saved with the chart
// and survives reloads as well as switching views, systems or explorers. Saving is
// debounced so a drag writes storage once it settles, not on every frame.
let acgSaveTimer = 0;
// "relocated" (default) or "natal"; remembered for the session, like the filters.
let acgLocalSpaceDirections = "relocated";
function acgSaveSoon() {
  clearTimeout(acgSaveTimer);
  acgSaveTimer = setTimeout(() => typeof saveState === "function" && saveState(), 400);
}

// Travel lines filter by body and line type; Local Space lines only by body.
function acgVisibleLines(lines) {
  return lines.filter((line) => acgFilters.bodies.has(line.bodyKey) && (!line.lineKey || acgFilters.lines.has(line.lineKey)));
}

function acgOverlayMarkup(lines) {
  return lines
    .map(
      (line) =>
        `<g class="acg-line-group" data-body="${line.bodyKey}"${line.lineKey ? ` data-line="${line.lineKey}"` : ""} style="--acg-line-color:${line.color}">${line.zenith ? `<path class="acg-zenith" d="${line.zenith.d}"/>` : ""}<path class="acg-line" d="${line.d}"/></g>`,
    )
    .join("");
}

// ── Line labels ─────────────────────────────────────────────────────────
// Labels live in a flat screen-space layer over the map and are laid out again on
// every pan, zoom, filter change or timeline move, so every line visible in the
// current view is labeled wherever the view happens to be. Each label sits at a
// spot where its line meets the edge of the visible map (preferring top, then
// bottom, left, right), with a short tick pointing at the exact crossing; labels
// that would overlap slide along the edge or move a row inward, still ticked back
// to their own line.
const ACG_LABEL_HEIGHT = 16;
const ACG_LABEL_PAD_X = 4;
const ACG_LABEL_GAP = 2;
const ACG_LABEL_INSET = 3;
const ACG_LABEL_TICK = 6;
const ACG_LABEL_MAX_ROWS = 40;
const ACG_EDGE_PRIORITY = { top: 0, bottom: 1, left: 2, right: 3, inside: 4 };

const acgLabelWidthCache = new Map();
function acgMeasureLabel(measureText, text) {
  if (!acgLabelWidthCache.has(text)) {
    measureText.textContent = text;
    const width = measureText.getComputedTextLength();
    if (!width) return text.length * 7;
    acgLabelWidthCache.set(text, width);
  }
  return acgLabelWidthCache.get(text);
}

// Appends every crossing of screen-space segment a→b with the view's four edges.
function acgEdgeCrossings(a, b, screen, out) {
  [
    ["top", "y", 0, "x", screen.w],
    ["bottom", "y", screen.h, "x", screen.w],
    ["left", "x", 0, "y", screen.h],
    ["right", "x", screen.w, "y", screen.h],
  ].forEach(([edge, axis, value, other, otherMax]) => {
    const da = a[axis] - value, db = b[axis] - value;
    if (da * db > 0 || da === db) return;
    const t = da / (da - db);
    const along = a[other] + t * (b[other] - a[other]);
    if (along < 0 || along > otherMax) return;
    out.push({ edge, x: axis === "x" ? value : along, y: axis === "y" ? value : along, facing: a.facing && b.facing });
  });
}

// Every place the line meets the edge of the visible map, in screen px, in order
// of preference (top, bottom, left, right, then along the edge) — or, for a line
// lying wholly inside the view, the middle of what's visible. Every tiled copy of
// the line counts (the view can show a line's wrapped-around copy). Local Space
// lines only fall back to their away-facing half when no toward-planet part is in
// view; Travel lines are "facing" everywhere, so this is just edge-then-inside.
function acgLabelAnchors(line, view, screen) {
  const scaleX = screen.w / view.vw, scaleY = screen.h / view.vh;
  const crossings = [], inside = [];
  for (let tile = -2; tile <= 2; tile += 1) {
    const offset = tile * ACG_WORLD_SIZE;
    line.segments.forEach(({ points, bounds }) => {
      if (bounds.maxX + offset < view.left || bounds.minX + offset > view.left + view.vw || bounds.maxY < view.top || bounds.minY > view.top + view.vh) return;
      let previous = null;
      points.forEach(([x, y, facing]) => {
        const point = { x: (x + offset - view.left) * scaleX, y: (y - view.top) * scaleY, facing };
        if (point.x >= 0 && point.x <= screen.w && point.y >= 0 && point.y <= screen.h) inside.push(point);
        if (previous) acgEdgeCrossings(previous, point, screen, crossings);
        previous = point;
      });
    });
  }
  const along = (point) => (point.edge === "left" || point.edge === "right" ? point.y : point.x);
  const ordered = (pool) => [...pool].sort((a, b) => ACG_EDGE_PRIORITY[a.edge] - ACG_EDGE_PRIORITY[b.edge] || along(a) - along(b));
  const middle = (pool) => [{ ...pool[Math.floor(pool.length / 2)], edge: "inside" }];
  const facingCrossings = crossings.filter((point) => point.facing);
  const facingInside = inside.filter((point) => point.facing);
  if (facingCrossings.length) return ordered(facingCrossings);
  if (facingInside.length) return middle(facingInside);
  if (crossings.length) return ordered(crossings);
  return inside.length ? middle(inside) : [];
}

// Greedy placement, one label per line. Labels are taken in order along the edges;
// each takes the shallowest free spot among all of its line's edge crossings —
// sliding along its row (tick slanting back to the crossing) before stepping a row
// deeper — so crowded stretches spread sideways and onto other edges instead of
// stacking deep into the map. `blocked` rects (the zoom buttons) are kept clear.
const ACG_LABEL_SLIDES = [0, -1, 1, -2, 2, -3, 3];
function acgPlaceLabels(lines, view, screen, measure, blocked) {
  const anchored = lines
    .map((line) => ({ line, anchors: acgLabelAnchors(line, view, screen) }))
    .filter((item) => item.anchors.length);
  const along = (anchor) => (anchor.edge === "left" || anchor.edge === "right" ? anchor.y : anchor.x);
  anchored.sort((a, b) => ACG_EDGE_PRIORITY[a.anchors[0].edge] - ACG_EDGE_PRIORITY[b.anchors[0].edge] || along(a.anchors[0]) - along(b.anchors[0]));
  const widths = new Map(anchored.map(({ line }) => [line, measure(line.label) + 2 * ACG_LABEL_PAD_X]));
  const columnStep = Math.max(0, ...widths.values()) + ACG_LABEL_GAP;
  const rowStep = ACG_LABEL_HEIGHT + ACG_LABEL_GAP;
  const h = ACG_LABEL_HEIGHT;
  const clampX = (x, w) => Math.max(ACG_LABEL_INSET, Math.min(screen.w - w - ACG_LABEL_INSET, x));
  const clampY = (y) => Math.max(ACG_LABEL_INSET, Math.min(screen.h - h - ACG_LABEL_INSET, y));
  const edgeStart = ACG_LABEL_INSET + ACG_LABEL_TICK;
  const candidate = ({ x, y, edge }, w, row, slide) => {
    const sideways = slide * (w * 0.6 + ACG_LABEL_GAP);
    if (edge === "top") return { x: clampX(x - w / 2 + sideways, w), y: edgeStart + row * rowStep };
    if (edge === "bottom") return { x: clampX(x - w / 2 + sideways, w), y: screen.h - edgeStart - h - row * rowStep };
    if (edge === "left") return { x: edgeStart + row * columnStep, y: clampY(y - h / 2 + slide * rowStep) };
    if (edge === "right") return { x: screen.w - edgeStart - w - row * columnStep, y: clampY(y - h / 2 + slide * rowStep) };
    // Inside the view: just above the anchor, then alternating below/above, farther out.
    const step = Math.floor(row / 2) * rowStep * (row % 2 ? 1 : -1);
    return { x: clampX(x - w / 2 + sideways, w), y: clampY(y - h - ACG_LABEL_TICK + (row % 2 ? h + 2 * ACG_LABEL_TICK : 0) + step) };
  };
  const overlaps = (a, b) => a.x < b.x + b.w + ACG_LABEL_GAP && b.x < a.x + a.w + ACG_LABEL_GAP && a.y < b.y + b.h + ACG_LABEL_GAP && b.y < a.y + a.h + ACG_LABEL_GAP;
  const placed = [...blocked];
  return anchored.map(({ line, anchors }) => {
    const w = widths.get(line);
    let choice = null;
    for (let row = 0; row < ACG_LABEL_MAX_ROWS && !choice; row += 1) {
      for (const slide of ACG_LABEL_SLIDES) {
        for (const anchor of anchors) {
          const box = { ...candidate(anchor, w, row, slide), w, h };
          if (!placed.some((other) => overlaps(box, other))) {
            choice = { anchor, box };
            break;
          }
        }
        if (choice) break;
      }
    }
    choice = choice || { anchor: anchors[0], box: { ...candidate(anchors[0], w, 0, 0), w, h } };
    placed.push(choice.box);
    return { line, ...choice };
  });
}

function acgLabelsMarkup(placements) {
  const tick = ({ anchor, box }) => {
    const toX = Math.max(box.x + 2, Math.min(box.x + box.w - 2, anchor.x));
    const toY = Math.max(box.y + 2, Math.min(box.y + box.h - 2, anchor.y));
    const end =
      anchor.edge === "top" ? [toX, box.y] : anchor.edge === "bottom" ? [toX, box.y + box.h] : anchor.edge === "left" ? [box.x, toY] : anchor.edge === "right" ? [box.x + box.w, toY] : [toX, anchor.y < box.y ? box.y : box.y + box.h];
    return `<line class="acg-label-tick" x1="${anchor.x.toFixed(1)}" y1="${anchor.y.toFixed(1)}" x2="${end[0].toFixed(1)}" y2="${end[1].toFixed(1)}"/>`;
  };
  // Ticks first, then every label on top, so a label's halo covers ticks passing under it.
  const ticks = placements.map((placement) => `<g style="--acg-line-color:${placement.line.color}">${tick(placement)}</g>`).join("");
  const labels = placements
    .map(
      ({ line, box }) =>
        `<g class="acg-label-box" data-body="${line.bodyKey}"${line.lineKey ? ` data-line="${line.lineKey}"` : ""} style="--acg-line-color:${line.color}"><text class="acg-label" x="${(box.x + box.w / 2).toFixed(1)}" y="${(box.y + box.h / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${line.label}</text></g>`,
    )
    .join("");
  return ticks + labels;
}

// Section checkboxes (Planets Primary / Secondary, and all Lines) tick or untick every
// item under them, and show a dash when only some are ticked — like the astrology filters.
function acgFilterMembers(kind, group) {
  return kind === "bodies" ? ACG_BODIES.filter((body) => body.group === group).map((body) => body.key) : ACG_LINE_TYPES.map((line) => line.key);
}
function acgGroupToggle(kind, group, label = group) {
  return `<label class="acg-filter wheel-filter-group-toggle"><input type="checkbox" data-acg-group="${kind}:${group}"><span>${label}</span></label>`;
}
// Brings every ACG filter checkbox under `root` in line with acgFilters (the shown sets).
function syncAcgFilterInputs(root = document) {
  root.querySelectorAll("[data-acg-body]").forEach((input) => { input.checked = acgFilters.bodies.has(input.dataset.acgBody); });
  root.querySelectorAll("[data-acg-line]").forEach((input) => { input.checked = acgFilters.lines.has(input.dataset.acgLine); });
  root.querySelectorAll("[data-acg-style]").forEach((input) => { input.checked = input.dataset.acgStyle === acgMapStyle; });
  root.querySelectorAll("[data-acg-cities]").forEach((input) => { input.checked = acgShowCities; });
  root.querySelectorAll("[data-acg-roads]").forEach((input) => { input.checked = acgShowRoads; });
  root.querySelectorAll("[data-acg-group]").forEach((input) => {
    const [kind, group] = input.dataset.acgGroup.split(":");
    const members = acgFilterMembers(kind, group);
    const shown = members.filter((member) => acgFilters[kind].has(member)).length;
    input.checked = shown === members.length;
    input.indeterminate = shown > 0 && shown < members.length;
  });
}
// Applies a planet / line / section checkbox change and re-syncs every ACG filter panel
// on the page (they share acgFilters). Returns false for anything else.
function applyAcgFilterChange(input) {
  const { acgBody, acgLine, acgGroup, acgStyle, acgCities, acgRoads } = input.dataset;
  if (acgRoads != null) {
    acgShowRoads = input.checked;
    acgStoreSetting("orbital-study-map-roads", acgShowRoads ? "on" : "off");
    syncAcgFilterInputs(document);
    return true;
  }
  if (acgStyle) {
    acgMapStyle = acgStyle;
    acgStoreSetting("orbital-study-map-style", acgStyle);
    syncAcgFilterInputs(document);
    return true;
  }
  if (acgCities != null) {
    acgShowCities = input.checked;
    acgStoreSetting("orbital-study-map-cities", acgShowCities ? "on" : "off");
    syncAcgFilterInputs(document);
    return true;
  }
  let set, keys;
  if (acgBody) [set, keys] = [acgFilters.bodies, [acgBody]];
  else if (acgLine) [set, keys] = [acgFilters.lines, [acgLine]];
  else if (acgGroup) {
    const [kind, group] = acgGroup.split(":");
    [set, keys] = [acgFilters[kind], acgFilterMembers(kind, group)];
  } else return false;
  keys.forEach((key) => (input.checked ? set.add(key) : set.delete(key)));
  syncAcgFilterInputs(document);
  return true;
}
function acgFiltersMarkup() {
  const bodyOption = (body) =>
    `<label class="acg-filter"><input type="checkbox" data-acg-body="${body.key}" ${acgFilters.bodies.has(body.key) ? "checked" : ""}><i style="background:${body.color}"></i><span>${body.glyph} ${body.key}</span></label>`;
  const group = (name) => `
    <div class="acg-filter-group">
      ${acgGroupToggle("bodies", name)}
      ${ACG_BODIES.filter((body) => body.group === name).map(bodyOption).join("")}
    </div>`;
  return `
    <span class="eyebrow">PLANETS</span>
    ${group("Primary")}
    ${group("Secondary")}
    <div data-acg-line-filters>
      <span class="eyebrow">LINES</span>
      <div class="acg-filter-group">
        ${acgGroupToggle("lines", "All", "All lines")}
        ${ACG_LINE_TYPES.map((line) => `<label class="acg-filter"><input type="checkbox" data-acg-line="${line.key}" ${acgFilters.lines.has(line.key) ? "checked" : ""}><span>${line.label}</span></label>`).join("")}
      </div>
    </div>
    <div class="acg-origin-actions" data-acg-origin-actions>
      <span class="eyebrow">ORIGIN</span>
      <button type="button" class="acg-origin-button" data-acg-origin-center>Move to center</button>
      <button type="button" class="acg-origin-button" data-acg-origin-reset>Reset birthplace</button>
      <span class="acg-filter-subhead">Directions</span>
      <label class="acg-filter"><input type="radio" name="acg-directions" data-acg-directions="relocated" ${acgLocalSpaceDirections === "relocated" ? "checked" : ""}><span>Relocated</span></label>
      <label class="acg-filter"><input type="radio" name="acg-directions" data-acg-directions="natal" ${acgLocalSpaceDirections === "natal" ? "checked" : ""}><span>Natal</span></label>
    </div>
    <span class="eyebrow">MAP</span>
    <div class="acg-filter-group">
      ${Object.entries(ACG_MAP_STYLES).map(([key, style]) => `<label class="acg-filter"><input type="radio" name="acg-map-style" data-acg-style="${key}" ${acgMapStyle === key ? "checked" : ""}><span>${style.label}</span></label>`).join("")}
      <label class="acg-filter"><input type="checkbox" data-acg-cities ${acgShowCities ? "checked" : ""}><span>City names</span></label>
      <label class="acg-filter"><input type="checkbox" data-acg-roads ${acgShowRoads ? "checked" : ""}><span>Main roads</span></label>
    </div>`;
}

const ACG_VIEW_DESCRIPTIONS = {
  "ACG Travel":
    "Planetary lines across the whole globe: where each planet was rising (AS), setting (DS), culminating (MC) or anti-culminating (IC) at the moment on the timeline.",
  "ACG Local Space":
    "The compass direction to each planet at the moment on the timeline, drawn as the full great circle through the origin (◉, the birthplace unless you drag it, or double-click or double-tap the map, to move it elsewhere). Relocated directions are seen from the origin itself; natal directions keep the ones seen from the birthplace.",
};

function acgCoordinate(value, positive, negative) {
  const number = Number(value);
  if (value == null || value === "" || !Number.isFinite(number)) return null;
  return `${Math.abs(number).toFixed(2)}°${number >= 0 ? positive : negative}`;
}

function acgInfoMarkup(chart, view, linesText, originText) {
  const lat = chart ? acgCoordinate(chart.latitude, "N", "S") : null;
  const lon = chart ? acgCoordinate(chart.longitude, "E", "W") : null;
  return `
    <span class="eyebrow">MAP READING</span>
    <h3>${view}</h3>
    <p>${ACG_VIEW_DESCRIPTIONS[view] || ""}</p>
    <div class="system-stat"><span>CHART</span><strong>${escapeHtml(chart?.name || "—")}</strong></div>
    <div class="system-stat"><span>BIRTHPLACE</span><strong>${lat && lon ? `${lat}, ${lon}` : "—"}</strong></div>
    ${originText ? `<div class="system-stat"><span>ORIGIN</span><strong>${originText}</strong></div>` : ""}
    <div class="system-stat"><span>PROJECTION</span><strong>Mercator</strong></div>
    <div class="system-stat"><span>PLANETARY LINES</span><strong>${linesText}</strong></div>
    <div class="system-note">Drag to pan, scroll or use the ＋/− buttons to zoom. The map wraps east–west.${view === "ACG Local Space" ? " Double-click or double-tap the map to move the origin there." : ""}</div>`;
}

// Remembered across re-renders, like the map viewport and filters above.
let acgActiveView = SYSTEM_TABS.Astrocartography[0];

// Renders the view tabs, map, filter column and reading panel into `container`.
// Used by both the Chart/Timeline explorer (via renderSystemPanel) and the Cycle
// Explorer; keeps its own view state rather than touching activeSystemTab, which
// Human Design and Gene Keys share.
// ── Saved locations ─────────────────────────────────────────────────────
// Clicking the Chart Explorer's map saves that spot with the chart (chart.acgLocations,
// up to ACG_MAX_LOCATIONS). The section under the map lists them — the same for ACG
// Travel and ACG Local Space, so one place can be compared in both — each with its
// coordinates, the nearest place in the gazetteer, and the tooltip's readings for the
// lines shown: in Travel, the nearest intersections and lines (and any zenith zone it's
// in); in Local Space, the nearest lines and a button to center the map on it.
const ACG_MAX_LOCATIONS = 20;
// How far a place search zooms in (at least): a region about 1,500 km across.
const ACG_SEARCH_ZOOM = 24;
const ACG_LOCATION_ROWS = 3;
// The place to name a spot by: the most populous place within ACG_CITY_RADIUS_KM (so a
// spot in a city reads as the city, not the district it's in), else simply the nearest.
const ACG_CITY_RADIUS_KM = 30;
function acgNearestPlace(lat, lon) {
  if (typeof placeIndex === "undefined" || !placeIndex) {
    if (typeof loadPlaces === "function") loadPlaces();
    return null;
  }
  const point = acgUnitVector(lon, lat);
  let nearest = null, nearestKm = Infinity, largest = null, largestKm = 0;
  // placeIndex is most populous first, so the first place within the radius is the largest.
  for (const place of placeIndex) {
    const km = acgAngle(point, acgUnitVector(Number(place.lon), Number(place.lat))) * ACG_EARTH_RADIUS_KM;
    if (!largest && km <= ACG_CITY_RADIUS_KM) { largest = place; largestKm = km; }
    if (km < nearestKm) { nearestKm = km; nearest = place; }
  }
  if (largest) return { place: largest, km: largestKm };
  return nearest && { place: nearest, km: nearestKm };
}
function acgKm(value) {
  return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-US")} km`;
}
// ── Saved-location readings (hover tooltips; texts from acg-meanings.js) ──
function acgStrength(km) {
  return ACG_STRENGTH_BANDS.find((band) => km <= band.km);
}
function acgTipTitle(line) {
  return `<span style="color:${line.color}">${line.glyph}</span> ${escapeHtml(line.hoverName)}`;
}
function acgStrengthHtml(km) {
  const band = acgStrength(km);
  return `<div class="gk-tip-title">${band.label} · ${acgKm(km)} away</div><div class="gk-tip-text">${band.text}</div>`;
}
// Initial compass bearing (degrees from north) from `from` to `to`.
function acgBearing(from, to) {
  const rad = Math.PI / 180;
  const dLon = (to.lon - from.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) % 360 + 360) % 360;
}
function acgLineTipHtml(line, km, location, origin) {
  const meaning = ACG_BODY_MEANINGS[line.member] || {};
  if (!line.lineKey) {
    // Local Space: a compass direction from the origin, either way along its great circle.
    let side = "";
    if (origin) {
      const bearing = acgBearing(origin, location);
      const off = Math.abs((((bearing - line.azimuth) % 360) + 540) % 360 - 180);
      const distance = acgAngle(acgUnitVector(origin.lon, origin.lat), acgUnitVector(location.lon, location.lat)) * ACG_EARTH_RADIUS_KM;
      side = `<div class="gk-tip-text">This spot is ${acgKm(distance)} from the origin, ${off <= 90 ? `toward ${escapeHtml(line.member)}'s direction` : `on the far side of its line, opposite ${escapeHtml(line.member)}'s direction`} (${Math.round(line.azimuth)}° from north). Both halves of a Local Space line carry the planet.</div>`;
    }
    return `<div class="gk-tip-title">${acgTipTitle(line)} line: ${meaning.keyword || ""}</div>
      <div class="gk-tip-text">Local Space lines are compass directions from the origin. Living, travelling or placing things along this one is said to draw in ${meaning.localSpace || "the planet's themes"}.</div>
      ${side}${acgStrengthHtml(km)}`;
  }
  const angle = ACG_ANGLE_MEANINGS[line.lineKey];
  return `<div class="gk-tip-title">${acgTipTitle(line)}: ${meaning.keyword || ""}</div>
    <div class="gk-tip-text">${angle.text}</div>
    <div class="gk-tip-title">Here</div><div class="gk-tip-text">${meaning[line.lineKey] || ""}</div>
    ${acgStrengthHtml(km)}`;
}
function acgCrossingTipHtml(crossing, km, location) {
  const { a, b } = crossing;
  const meaningA = ACG_BODY_MEANINGS[a.member] || {}, meaningB = ACG_BODY_MEANINGS[b.member] || {};
  const offKm = Math.abs(location.lat - crossing.lat) * (Math.PI / 180) * ACG_EARTH_RADIUS_KM;
  const latitude = acgCoordinate(crossing.lat, "N", "S");
  const paran = offKm <= 111
    ? `This spot lies on the crossing's latitude (${latitude}), where the pairing is said to hold all the way around the world (a paran), even far from the crossing itself.`
    : `The crossing's latitude (${latitude}) carries the pairing all the way around the world (a paran); this spot is ${acgKm(offKm)} ${location.lat > crossing.lat ? "north" : "south"} of it.`;
  const band = acgStrength(km);
  return `<div class="gk-tip-title">${acgTipTitle(a)} × ${acgTipTitle(b)}</div>
    <div class="gk-tip-text">Where two lines cross, both planets are on an angle at once and their themes blend: ${meaningA.keyword || a.member} meets ${meaningB.keyword || b.member}.</div>
    <div class="gk-tip-title">${escapeHtml(a.hoverName)}</div><div class="gk-tip-text">${meaningA[a.lineKey] || ""}</div>
    <div class="gk-tip-title">${escapeHtml(b.hoverName)}</div><div class="gk-tip-text">${meaningB[b.lineKey] || ""}</div>
    <div class="gk-tip-title">${band.label} · ${acgKm(km)} from the crossing</div><div class="gk-tip-text">${band.text} ${paran}</div>`;
}
function acgZenithTipHtml(line, km) {
  const meaning = ACG_BODY_MEANINGS[line.member] || {};
  return `<div class="gk-tip-title">${acgTipTitle(line)} zenith zone</div>
    <div class="gk-tip-text">${escapeHtml(line.member)} stood directly overhead at the zone's centre, ${acgKm(km)} from this spot: the ${escapeHtml(line.member)} MC line at its most concentrated, within ${ACG_ZENITH_RADIUS_KM} km.</div>
    <div class="gk-tip-text">${meaning.MC || ""}</div>`;
}

// `tips` collects each chip's tooltip builder (the chip's data-acg-tip is its index),
// so the readings are only written when a chip is actually hovered or focused.
function acgLocationsMarkup(locations, lines, travel, intersections, origin, tips) {
  if (!locations.length) {
    return `<p class="acg-locations-empty">Click anywhere on the map to save that spot here, with its nearest place, lines${travel ? " and intersections" : ""}. Saved spots stay with this chart, in both map views.</p>`;
  }
  const chip = (swatch, text, km, label, tip) => {
    tips.push(tip);
    return `<button type="button" class="acg-chip" data-acg-tip="${tips.length - 1}" aria-label="${escapeHtml(label)}, ${acgKm(km)}">${swatch}${text}<span class="acg-chip-km">${acgKm(km)}</span></button>`;
  };
  const glyph = (line) => `<b style="color:${line.color}">${line.glyph}</b>`;
  const isOrigin = (location) => !!origin && Math.abs(origin.lat - location.lat) < 1e-4 && Math.abs(origin.lon - location.lon) < 1e-4;
  const lineText = (line) => `${glyph(line)}${line.short || ""}`;
  const block = (title, items) => `<div class="acg-location-block"><span class="acg-location-subhead">${title}</span><div class="acg-chips">${items || `<span class="acg-chip-none">None among the shown lines</span>`}</div></div>`;
  return `<ol class="acg-location-list">${locations.map((location, index) => {
    const nearest = acgNearestPlace(location.lat, location.lon);
    const city = nearest ? `${escapeHtml(placeLabel(nearest.place))} · ${acgKm(nearest.km)}` : "Finding the nearest place…";
    const nearestLines = lines.length ? acgNearestLines(lines, location.lat, location.lon, ACG_LOCATION_ROWS) : [];
    const zones = travel ? acgZenithZonesAt(lines, location.lat, location.lon) : [];
    const crossings = travel ? acgNearestIntersections(intersections, location.lat, location.lon, ACG_LOCATION_ROWS) : [];
    return `<li class="acg-location" data-acg-location="${index}">
      <div class="acg-location-head">
        <span class="acg-location-number">${index + 1}</span>
        <div><strong>${city}</strong><small>${acgCoordinate(location.lat, "N", "S")}, ${acgCoordinate(location.lon, "E", "W")}</small></div>
        <button type="button" class="acg-origin-button" data-acg-location-center="${index}">Go to</button>
        ${travel ? "" : isOrigin(location)
          ? `<button type="button" class="acg-origin-button" disabled title="This spot is the Local Space origin">Relocate</button>`
          : `<button type="button" class="acg-origin-button" data-acg-location-relocate="${index}" title="Make this spot the Local Space origin">Relocate</button>`}
        <button type="button" class="acg-location-remove" data-acg-location-remove="${index}" aria-label="Remove location ${index + 1}" title="Remove">×</button>
      </div>
      <div class="acg-location-body">
        ${zones.length ? block("Zenith", zones.map(({ line, km }) => chip(`<b style="color:${line.color}">◯</b>`, line.glyph, km, `${line.member} zenith zone`, () => acgZenithTipHtml(line, km))).join("")) : ""}
        ${travel ? block("Crossings", crossings.map(({ crossing, km }) => chip(lineText(crossing.a), `<span class="acg-chip-times">×</span>${lineText(crossing.b)}`, km, `${crossing.a.hoverName} crossing ${crossing.b.hoverName}`, () => acgCrossingTipHtml(crossing, km, location))).join("")) : ""}
        ${block("Lines", nearestLines.map(({ line, km }) => chip(lineText(line), "", km, travel ? line.hoverName : `${line.member} line`, () => acgLineTipHtml(line, km, location, origin))).join(""))}
      </div>
    </li>`;
  }).join("")}</ol>`;
}
// One tooltip for every saved-location chip: follows the pointer, or sits under a
// chip that has keyboard focus.
function bindAcgChipTips(list, tips) {
  let tooltip = document.getElementById("acgChipTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "acgChipTooltip";
    tooltip.className = "wheel-tooltip gk-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }
  let current = null;
  const show = (chip, x, y) => {
    if (current !== chip) {
      current?.removeAttribute("aria-describedby");
      current = chip;
      tooltip.innerHTML = tips()[Number(chip.dataset.acgTip)]?.() || "";
      chip.setAttribute("aria-describedby", tooltip.id);
    }
    tooltip.hidden = false;
    const left = x + 14 + tooltip.offsetWidth > window.innerWidth ? x - 14 - tooltip.offsetWidth : x + 14;
    const top = y + 14 + tooltip.offsetHeight > window.innerHeight ? y - 14 - tooltip.offsetHeight : y + 14;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => {
    current?.removeAttribute("aria-describedby");
    current = null;
    tooltip.hidden = true;
  };
  list.addEventListener("mousemove", (event) => {
    const chip = event.target.closest("[data-acg-tip]");
    if (chip) show(chip, event.clientX, event.clientY);
    else if (document.activeElement?.dataset?.acgTip === undefined) hide();
  });
  list.addEventListener("mouseleave", () => { if (!list.contains(document.activeElement) || document.activeElement.dataset.acgTip === undefined) hide(); });
  list.addEventListener("focusin", (event) => {
    const chip = event.target.closest("[data-acg-tip]");
    if (!chip) return hide();
    const box = chip.getBoundingClientRect();
    show(chip, box.left, box.bottom - 6);
  });
  list.addEventListener("focusout", hide);
  list.addEventListener("keydown", (event) => { if (event.key === "Escape" && current) { event.stopPropagation(); hide(); } });
  return hide;
}

function renderAstrocartographyPanel(container, chart) {
  const views = SYSTEM_TABS.Astrocartography;
  if (!views.includes(acgActiveView)) acgActiveView = views[0];
  container.innerHTML = `
    <div class="system-tabs">${views.map((view) => `<button type="button" class="${view === acgActiveView ? "active" : ""}" data-acg-view="${view}">${view}</button>`).join("")}</div>
    <div class="system-surface">
      <div class="system-layout acg-layout">
        <div class="system-visual acg-visual">
          <div class="system-toolbar">
            <span class="eyebrow" data-acg-eyebrow></span>
            <span class="sample-badge" data-acg-badge></span>
          </div>
          ${acgMapMarkup()}
          ${acgSearchMarkup()}
          ${chart ? timelineSliderMarkup("MAP MOMENT", 0) : ""}
        </div>
        <div class="acg-filters" data-acg-filters>${acgFiltersMarkup()}</div>
        <aside class="system-info" data-acg-info></aside>
        ${chart ? `<section class="acg-locations" aria-label="Saved locations"><div class="system-toolbar"><span class="eyebrow">SAVED LOCATIONS</span><span class="sample-badge" data-acg-locations-count></span></div><div data-acg-locations></div></section>` : ""}
      </div>
    </div>`;
  let offsetMinutes = 0;
  const birthplace = acgBirthplace(chart);
  const movedOrigin = () => chart?.localSpaceOrigin || null;
  const localSpaceOrigin = () => movedOrigin() || birthplace;
  const setOrigin = (origin) => {
    if (!chart) return;
    if (origin) chart.localSpaceOrigin = { lat: Number(origin.lat.toFixed(4)), lon: Number(origin.lon.toFixed(4)) };
    else delete chart.localSpaceOrigin;
    acgSaveSoon();
    showView();
  };
  // Lines only depend on the view, the slider offset and (Local Space) the origin;
  // filter toggles reuse them.
  let cached = { key: null, lines: [] };
  const linesFor = (view) => {
    const origin = localSpaceOrigin();
    const directionsFrom = acgLocalSpaceDirections === "natal" ? birthplace : origin;
    const key = view === "ACG Travel" ? `${view}|${offsetMinutes}` : `${view}|${offsetMinutes}|${origin?.lat},${origin?.lon}|${acgLocalSpaceDirections}`;
    if (cached.key !== key) {
      cached = { key, lines: view === "ACG Travel" ? acgTravelLines(chart, offsetMinutes) : acgLocalSpaceLines(chart, offsetMinutes, origin, directionsFrom) };
    }
    return cached.lines;
  };
  const showView = () => {
    const travel = acgActiveView === "ACG Travel";
    const lines = linesFor(acgActiveView);
    const origin = localSpaceOrigin();
    const moved = !!movedOrigin();
    container.querySelector("[data-acg-eyebrow]").textContent = acgActiveView.toUpperCase();
    container.querySelector("[data-acg-badge]").textContent = travel
      ? "MERCATOR · GEOCENTRIC"
      : moved
        ? `MERCATOR · MOVED ORIGIN · ${acgLocalSpaceDirections.toUpperCase()} DIRECTIONS`
        : "MERCATOR · FROM BIRTHPLACE";
    container.querySelector("[data-acg-line-filters]").hidden = !travel;
    container.querySelector("[data-acg-origin-actions]").hidden = travel || !origin;
    container.querySelector("[data-acg-origin-reset]").disabled = !moved;
    const visible = acgVisibleLines(lines);
    container.querySelector("[data-acg-overlay]").innerHTML = acgOverlayMarkup(visible);
    map.setLabelLines(visible);
    map.setOrigin(travel || !origin ? null : { ...origin, onMove: setOrigin });
    const originText = travel || !origin ? "" : `${acgCoordinate(origin.lat, "N", "S")}, ${acgCoordinate(origin.lon, "E", "W")}${moved ? ` (moved, ${acgLocalSpaceDirections} directions)` : ""}`;
    container.querySelector("[data-acg-info]").innerHTML = acgInfoMarkup(chart, acgActiveView, `${visible.length} / ${lines.length} shown`, originText);
    showLocations(visible, travel);
  };
  // Saved locations: re-rendered with the lines (view, filters, timeline, origin).
  const locationsList = container.querySelector("[data-acg-locations]");
  let locationsState = { visible: [], travel: true };
  let locationTips = [];
  const hideLocationTip = locationsList ? bindAcgChipTips(locationsList, () => locationTips) : () => {};
  const showLocations = (visible = locationsState.visible, travel = locationsState.travel) => {
    if (!chart || !locationsList) return;
    locationsState = { visible, travel };
    const locations = chart.acgLocations || [];
    const intersections = travel && locations.length ? acgLineIntersections(visible) : [];
    locationTips = [];
    hideLocationTip();
    locationsList.innerHTML = acgLocationsMarkup(locations, visible, travel, intersections, localSpaceOrigin(), locationTips);
    container.querySelector("[data-acg-locations-count]").textContent = locations.length ? `${locations.length} / ${ACG_MAX_LOCATIONS}` : "";
    map.setPins(locations.map((location, index) => ({ ...location, label: index + 1 })));
  };
  const addLocation = ({ lat, lon }) => {
    if (!chart) return;
    chart.acgLocations = chart.acgLocations || [];
    if (chart.acgLocations.length >= ACG_MAX_LOCATIONS) {
      if (typeof showToast === "function") showToast(`Up to ${ACG_MAX_LOCATIONS} saved locations per chart — remove one to add another`);
      return;
    }
    const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
    chart.acgLocations.push({ lat: Number(lat.toFixed(4)), lon: Number(wrapped.toFixed(4)) });
    acgSaveSoon();
    showLocations();
  };
  locationsList?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-acg-location-remove]");
    const center = event.target.closest("[data-acg-location-center]");
    const relocate = event.target.closest("[data-acg-location-relocate]");
    if (remove) {
      chart.acgLocations.splice(Number(remove.dataset.acgLocationRemove), 1);
      if (!chart.acgLocations.length) delete chart.acgLocations;
      acgSaveSoon();
      showLocations();
    } else if (center) {
      map.centerOn(chart.acgLocations[Number(center.dataset.acgLocationCenter)]);
    } else if (relocate) {
      // Local Space only: makes the spot the origin.
      setOrigin(chart.acgLocations[Number(relocate.dataset.acgLocationRelocate)]);
    }
  });
  // The nearest-place names arrive with places.js.
  window.addEventListener("orbital-places-loaded", () => { if (locationsList?.isConnected) showLocations(); });
  container.querySelectorAll("[data-acg-view]").forEach((button) =>
    button.addEventListener("click", () => {
      acgActiveView = button.dataset.acgView;
      container.querySelectorAll("[data-acg-view]").forEach((item) => item.classList.toggle("active", item === button));
      showView();
    }),
  );
  container.querySelector("[data-acg-filters]").addEventListener("change", (event) => {
    if (event.target.dataset.acgDirections) {
      acgLocalSpaceDirections = event.target.dataset.acgDirections;
      showView();
      return;
    }
    if (applyAcgFilterChange(event.target)) showView();
  });
  syncAcgFilterInputs(container.querySelector("[data-acg-filters]"));
  // Double-click / double-tap in Local Space moves the origin there; in Travel it
  // saves the spot once (not twice, as two single clicks would).
  const map = bindAcgMap(container.querySelector(".acg-map-wrap"), {
    onMapClick: chart ? addLocation : null,
    onMapDoubleClick: chart ? (point) => (acgActiveView === "ACG Local Space" ? setOrigin(point) : addLocation(point)) : null,
  });
  // Choosing a place saves it (unless it's already saved) and goes there; with no chart
  // (the Timeline Explorer's sky), it only goes there.
  bindPlaceSearch(container.querySelector("[data-acg-search]"), (place) => {
    const point = { lat: Number(place.lat), lon: Number(place.lon) };
    const saved = (chart?.acgLocations || []).some((location) => acgAngle(acgUnitVector(location.lon, location.lat), acgUnitVector(point.lon, point.lat)) * ACG_EARTH_RADIUS_KM < 1);
    if (chart && !saved) addLocation(point);
    map.centerOn(point, ACG_SEARCH_ZOOM);
  });
  container.querySelector("[data-acg-origin-center]").addEventListener("click", () => setOrigin(map.viewCenter()));
  container.querySelector("[data-acg-origin-reset]").addEventListener("click", () => setOrigin(null));
  const timelineContainer = container.querySelector(".acg-visual .timeline-control");
  if (timelineContainer) {
    // bindTimelineSlider fires onChange once immediately, which does the first draw.
    bindTimelineSlider(timelineContainer, {
      originLabel: timelineOriginLabel(),
      onChange: (offset) => {
        offsetMinutes = offset;
        updateTimelineReadout(timelineContainer, chart, offset);
        showView();
      },
    });
  } else {
    showView();
  }
}

// ── Pair Explorer: two maps, one above the other ────────────────────────
// Both maps share the view tab, filters and viewport (panning or zooming either
// moves both), so the same part of the world is always compared. No timeline:
// Pair Explorer compares the two birth moments as they are. Each map's Local
// Space origin is that chart's own (saved per chart, still draggable here).
function renderAstrocartographyPairPanel(container, entries) {
  const views = SYSTEM_TABS.Astrocartography;
  if (!views.includes(acgActiveView)) acgActiveView = views[0];
  container.innerHTML = `
    <div class="system-tabs">${views.map((view) => `<button type="button" class="${view === acgActiveView ? "active" : ""}" data-acg-view="${view}">${view}</button>`).join("")}</div>
    <div class="system-surface">
      <div class="acg-pair-layout">
        <div class="acg-pair-maps">
          ${entries.map((entry, index) => `
            <div class="system-visual acg-visual" data-acg-pair-map="${index}">
              <div class="system-toolbar"><span class="eyebrow">${entry.label}</span><span class="sample-badge" data-acg-badge></span></div>
              ${acgMapMarkup()}
            </div>`).join("")}
          <div class="system-visual acg-pair-search">${acgSearchMarkup()}</div>
        </div>
        <div class="acg-filters" data-acg-filters>${acgFiltersMarkup()}</div>
      </div>
    </div>`;
  // Move to center / Reset birthplace act on one chart, so they stay in the Chart
  // Explorer; the Directions choice still applies to both maps here.
  container.querySelectorAll("[data-acg-origin-center], [data-acg-origin-reset]").forEach((button) => (button.hidden = true));
  const maps = [];
  const cards = entries.map((_, index) => container.querySelector(`[data-acg-pair-map="${index}"]`));
  cards.forEach((card, index) => {
    maps[index] = bindAcgMap(card.querySelector(".acg-map-wrap"), {
      onViewportChange: () => maps.forEach((map, other) => other !== index && map && map.refresh()),
      // Double-click / double-tap in Local Space moves this chart's origin there.
      onMapDoubleClick: (point) => {
        entries[index].chart.localSpaceOrigin = { lat: Number(point.lat.toFixed(4)), lon: Number(point.lon.toFixed(4)) };
        acgSaveSoon();
        showView();
      },
      doubleClickActive: () => acgActiveView === "ACG Local Space",
    });
  });
  // The place search moves both maps (they share one viewport); the Pair Explorer has
  // no saved locations, so nothing is added.
  bindPlaceSearch(container.querySelector("[data-acg-search]"), (place) => maps[0].centerOn({ lat: Number(place.lat), lon: Number(place.lon) }, ACG_SEARCH_ZOOM));
  const showView = () => {
    const travel = acgActiveView === "ACG Travel";
    container.querySelector("[data-acg-line-filters]").hidden = !travel;
    container.querySelector("[data-acg-origin-actions]").hidden = travel;
    entries.forEach(({ chart }, index) => {
      const birthplace = acgBirthplace(chart);
      const origin = chart.localSpaceOrigin || birthplace;
      const directionsFrom = acgLocalSpaceDirections === "natal" ? birthplace : origin;
      const lines = travel ? acgTravelLines(chart, 0) : acgLocalSpaceLines(chart, 0, origin, directionsFrom);
      const visible = acgVisibleLines(lines);
      cards[index].querySelector("[data-acg-overlay]").innerHTML = acgOverlayMarkup(visible);
      cards[index].querySelector("[data-acg-badge]").textContent = `${acgActiveView.toUpperCase()} · ${visible.length} / ${lines.length} LINES`;
      maps[index].setLabelLines(visible);
      maps[index].setOrigin(
        travel || !origin
          ? null
          : {
              ...origin,
              onMove: (moved) => {
                chart.localSpaceOrigin = { lat: Number(moved.lat.toFixed(4)), lon: Number(moved.lon.toFixed(4)) };
                acgSaveSoon();
                showView();
              },
            },
      );
    });
  };
  container.querySelectorAll("[data-acg-view]").forEach((button) =>
    button.addEventListener("click", () => {
      acgActiveView = button.dataset.acgView;
      container.querySelectorAll("[data-acg-view]").forEach((item) => item.classList.toggle("active", item === button));
      showView();
    }),
  );
  container.querySelector("[data-acg-filters]").addEventListener("change", (event) => {
    const { acgDirections } = event.target.dataset;
    if (acgDirections) acgLocalSpaceDirections = acgDirections;
    else if (!applyAcgFilterChange(event.target)) return;
    showView();
  });
  syncAcgFilterInputs(container.querySelector("[data-acg-filters]"));
  showView();
}
