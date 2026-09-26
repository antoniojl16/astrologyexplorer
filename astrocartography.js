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
const ACG_MAX_ZOOM = 64;
const ACG_BUTTON_ZOOM_STEP = 1.6;

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

let acgCountryPathsCache = null;
function acgCountryPathsMarkup() {
  if (acgCountryPathsCache) return acgCountryPathsCache;
  acgCountryPathsCache = WORLD_COUNTRIES.map((country) => {
    const d = country.rings
      .map((ring) => {
        let path = "";
        let previous = "";
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = acgProject(ring[i], ring[i + 1]);
          const point = `${x.toFixed(1)},${y.toFixed(1)}`;
          if (point === previous) continue;
          path += (path ? " " : "M") + point;
          previous = point;
        }
        return `${path}Z`;
      })
      .join("");
    return `<path class="acg-country" d="${d}"/>`;
  }).join("");
  return acgCountryPathsCache;
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
function acgMapMarkup() {
  const worldId = `acgWorld${acgMapCounter}`;
  const overlayId = `acgOverlay${acgMapCounter++}`;
  const W = ACG_WORLD_SIZE;
  const tiles = (id, offsets) => offsets.map((x) => `<use href="#${id}" x="${x}"/>`).join("");
  return `
    <div class="acg-map-wrap">
      <svg class="acg-map" role="img" aria-label="World map, Mercator projection">
        <defs>
          <g id="${worldId}">${acgCountryPathsMarkup()}${acgGraticuleMarkup()}</g>
          <g id="${overlayId}" class="acg-overlay" data-acg-overlay></g>
        </defs>
        <rect x="${-W}" y="0" width="${3 * W}" height="${W}" class="acg-ocean"/>
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

function bindAcgMap(wrap) {
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
    labelGroup.innerHTML = acgLabelsMarkup(acgPlaceLabels(labelLines, view, screen, (text) => acgMeasureLabel(measureText, text), blocked));
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
  const apply = () => {
    const screen = size();
    if (!screen.w || !screen.h) return;
    acgViewport.zoom = Math.max(1, Math.min(ACG_MAX_ZOOM, acgViewport.zoom));
    const { vw, vh } = viewBoxSize(screen);
    acgViewport.cx = ((acgViewport.cx % W) + W) % W;
    acgViewport.cy = vh >= W ? W / 2 : Math.max(vh / 2, Math.min(W - vh / 2, acgViewport.cy));
    svg.setAttribute("viewBox", `${acgViewport.cx - vw / 2} ${acgViewport.cy - vh / 2} ${vw} ${vh}`);
    scheduleLabels();
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
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
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
    tooltip.innerHTML = acgNearestLinesMarkup(acgNearestLines(labelLines, lat, lon), nearestCrossings);
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
  };
  svg.addEventListener("pointerup", endDrag);
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
    viewCenter() {
      const [lon, lat] = acgUnproject(acgViewport.cx, acgViewport.cy);
      return { lat, lon };
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
// its birth moment. The 10 real bodies come straight from Astronomy Engine
// (true equator and equinox of date, including the body's ecliptic latitude).
// Everything else — the lunar nodes (which lie on the ecliptic, so latitude 0 is
// exact), Chiron (still the app's synthetic longitude, so its lines are only as
// good as that), and every body under the synthetic engine — converts the app's
// own tropical ecliptic longitude at ecliptic latitude 0.
function acgBodyEquatorial(position, date, offsetMinutes) {
  if (EPHEMERIS_ENGINE === "astronomy-engine" && REAL_EPHEMERIS_BODIES.has(position.name)) {
    const vector = Astronomy.GeoVector(Astronomy.Body[position.name], date, true);
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

function acgNearestLinesMarkup(nearest, nearestCrossings) {
  const km = (value) => `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-US")} km`;
  const lines = `<div class="acg-tooltip-title">Nearest Lines:</div>${nearest
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
    .map((segment) => segment.points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(""))
    .join("");
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
    const add = (lineKey, points) => {
      if (points.length < 2) return;
      const short = ACG_LINE_TYPES.find((line) => line.key === lineKey).short;
      const segments = [acgSegment(points)];
      lines.push({ bodyKey: body.key, lineKey, color: body.color, label: `${member.glyph} ${short}`, hoverName: `${member.name} ${short}`, segments, d: acgSegmentsPath(segments) });
    };
    // Pole to pole: the drawing is clipped at the map's edge anyway (acgProject
    // clamps latitude), but hover distances need the whole meridian. The equator
    // point splits it into two arcs, since pole-to-pole alone would be ambiguous.
    add("MC", [[mc, -90], [mc, 0], [mc, 90]]);
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
    lines.push({ bodyKey: body.key, color: body.color, label: member.glyph, hoverName: member.name, segments, d: acgSegmentsPath(segments), azimuth });
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
        `<g class="acg-line-group" data-body="${line.bodyKey}"${line.lineKey ? ` data-line="${line.lineKey}"` : ""} style="--acg-line-color:${line.color}"><path class="acg-line" d="${line.d}"/></g>`,
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

function acgFiltersMarkup() {
  const bodyOption = (body) =>
    `<label class="acg-filter"><input type="checkbox" data-acg-body="${body.key}" ${acgFilters.bodies.has(body.key) ? "checked" : ""}><i style="background:${body.color}"></i><span>${body.glyph} ${body.key}</span></label>`;
  const group = (name) => `
    <div class="acg-filter-group">
      <span class="acg-filter-subhead">${name}</span>
      ${ACG_BODIES.filter((body) => body.group === name).map(bodyOption).join("")}
    </div>`;
  return `
    <span class="eyebrow">PLANETS</span>
    ${group("Primary")}
    ${group("Secondary")}
    <div data-acg-line-filters>
      <span class="eyebrow">LINES</span>
      <div class="acg-filter-group">
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
    </div>`;
}

const ACG_VIEW_DESCRIPTIONS = {
  "ACG Travel":
    "Planetary lines across the whole globe: where each planet was rising (AS), setting (DS), culminating (MC) or anti-culminating (IC) at the moment on the timeline.",
  "ACG Local Space":
    "The compass direction to each planet at the moment on the timeline, drawn as the full great circle through the origin (◉, the birthplace unless you drag it elsewhere). Relocated directions are seen from the origin itself; natal directions keep the ones seen from the birthplace.",
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
    <div class="system-stat"><span>CHART</span><strong>${chart?.name || "—"}</strong></div>
    <div class="system-stat"><span>BIRTHPLACE</span><strong>${lat && lon ? `${lat}, ${lon}` : "—"}</strong></div>
    ${originText ? `<div class="system-stat"><span>ORIGIN</span><strong>${originText}</strong></div>` : ""}
    <div class="system-stat"><span>PROJECTION</span><strong>Mercator</strong></div>
    <div class="system-stat"><span>PLANETARY LINES</span><strong>${linesText}</strong></div>
    <div class="system-note">Drag to pan, scroll or use the ＋/− buttons to zoom. The map wraps east–west.</div>`;
}

// Remembered across re-renders, like the map viewport and filters above.
let acgActiveView = SYSTEM_TABS.Astrocartography[0];

// Renders the view tabs, map, filter column and reading panel into `container`.
// Used by both the Chart/Timeline explorer (via renderSystemPanel) and the Cycle
// Explorer; keeps its own view state rather than touching activeSystemTab, which
// Human Design and Gene Keys share.
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
          ${chart ? timelineSliderMarkup("MAP MOMENT", 0) : ""}
        </div>
        <div class="acg-filters" data-acg-filters>${acgFiltersMarkup()}</div>
        <aside class="system-info" data-acg-info></aside>
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
  };
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
    const { acgBody, acgLine } = event.target.dataset;
    const set = acgBody ? acgFilters.bodies : acgLine ? acgFilters.lines : null;
    if (!set) return;
    const key = acgBody || acgLine;
    if (event.target.checked) set.add(key);
    else set.delete(key);
    showView();
  });
  const map = bindAcgMap(container.querySelector(".acg-map-wrap"));
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
