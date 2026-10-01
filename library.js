// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Chart Library: each chart in an Astrology or a Human Design view (tabs above the
// table). Every row shows a miniature of that system's chart (an astrology wheel or a
// bodygraph, drawn as inline SVG) and the system's key facts, computed from the real
// positions: Sun and Rising, or Type, Authority, Profile and Definition.
// renderRows() (app.js) calls libraryHeaderMarkup / libraryRowMarkup, defined here.

const LIBRARY_SYSTEMS = ["Astrology", "Human Design"];
let librarySystem = "Astrology";

// ── Per-chart facts and miniatures, cached (recomputed only when the chart's birth
// moment, zodiac, house system or engine changes) ───────────────────────────
const libraryCache = new Map();
const LIBRARY_PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
function libraryData(chart, system) {
  const moment = chart.positions.find((position) => position.name === "Sun")?.birthMoment;
  const key = [chart.id, system, moment, zodiacMode, houseSystem, EPHEMERIS_ENGINE, LUNAR_NODE_MODE].join("|");
  if (!libraryCache.has(key)) libraryCache.set(key, system === "Astrology" ? libraryAstrology(chart) : libraryHumanDesign(chart));
  return libraryCache.get(key);
}

function libraryAstrology(chart) {
  const longitudes = new Map(chart.positions.map((position) => [position.name, positionAngleAtTime(position, 0)]));
  const cusps = houseCuspsAtTime(chart, 0);
  const place = (name, withHouse) => {
    const longitude = longitudes.get(name);
    if (longitude == null) return null;
    const index = Math.floor(longitude / 30);
    const house = withHouse ? wheelHouseOf(longitude, cusps) : null;
    return { index, sign: SIGNS[index], detail: `${(longitude - index * 30).toFixed(2)}°${house ? ` · ${ordinalHouse(house)} house` : ""}` };
  };
  return { sun: place("Sun", true), rising: place("Ascendant", false), mini: libraryMiniWheel(longitudes) };
}

function libraryHumanDesign(chart) {
  const state = computeBodygraphState(chart, 0);
  return { typology: computeHumanDesignTypology(state.hd), mini: libraryMiniBodygraph(state) };
}

// Mini astrology wheel: the element-tinted zodiac ring, turned so the Ascendant sits on
// the left as in the full wheel, the horizon, the ten planets as dots (Sun larger) and
// their main aspects as thin colored lines.
function libraryMiniWheel(longitudes) {
  const ascendant = longitudes.get("Ascendant") ?? 0;
  const rotation = (270 + ascendant) % 360;
  const at = (r, longitude) => {
    const angle = ((rotation - longitude - 90) * Math.PI) / 180;
    return [50 + r * Math.cos(angle), 50 + r * Math.sin(angle)];
  };
  const planets = LIBRARY_PLANETS.filter((name) => longitudes.has(name)).map((name) => ({ name, angle: longitudes.get(name) }));
  const aspects = calculateAspects({ positions: planets }, (name) => MAIN_ASPECTS.has(name));
  const [hx1, hy1] = at(38, ascendant), [hx2, hy2] = at(38, ascendant + 180);
  const lines = aspects.map((aspect) => {
    const [x1, y1] = at(27, longitudes.get(aspect.first)), [x2, y2] = at(27, longitudes.get(aspect.second));
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${aspect.color}" class="mini-aspect"/>`;
  }).join("");
  const dots = planets.map((planet) => {
    const [x, y] = at(32.5, planet.angle);
    return `<circle cx="${x}" cy="${y}" r="${planet.name === "Sun" ? 3.4 : 2.3}" class="mini-planet${planet.name === "Sun" ? " sun" : ""}"/>`;
  }).join("");
  return `<svg class="mini-chart mini-wheel-svg" viewBox="0 0 100 100" aria-hidden="true">
    ${wheelZodiacSectorsMarkup(50, 50, 48, 38, rotation)}
    <circle cx="50" cy="50" r="48" class="mini-ring"/><circle cx="50" cy="50" r="38" class="mini-ring"/>
    <line x1="${hx1}" y1="${hy1}" x2="${hx2}" y2="${hy2}" class="mini-axis"/>
    ${lines}${dots}
  </svg>`;
}

// Mini bodygraph: gate lines (Personality ink, Design red, both side by side) under the
// nine centers, filled in their colors when defined and outlined when not.
function libraryMiniBodygraph(state) {
  const gates = Object.values(HD_BODYGRAPH_GATE_GEOMETRY).map((gate) => {
    const side = state.gateSide(gate.id);
    const track = `<line x1="${gate.x1}" y1="${gate.y1}" x2="${gate.x2}" y2="${gate.y2}" class="mini-gate-track"/>`;
    if (!side) return track;
    const fill = (segment, which) => `<line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" class="mini-gate ${which}"/>`;
    if (side === "both") return track + fill(offsetSegment(gate.x1, gate.y1, gate.x2, gate.y2, -6), "personality") + fill(offsetSegment(gate.x1, gate.y1, gate.x2, gate.y2, 6), "design");
    return track + fill(gate, side);
  }).join("");
  const centers = HD_BODYGRAPH_CENTERS.map((center) => {
    const defined = state.centerDefined(center.id);
    const points = hdCenterPolygon(center).map((point) => point.join(",")).join(" ");
    return `<polygon points="${points}" class="mini-center" style="fill:${defined ? center.color : "var(--panel)"};stroke:${center.color}"/>`;
  }).join("");
  return `<svg class="mini-chart mini-bodygraph-svg" viewBox="40 20 360 600" aria-hidden="true">${gates}${centers}</svg>`;
}

// ── Table ─────────────────────────────────────────────────────────────────
function libraryHeaderMarkup() {
  const columns = librarySystem === "Astrology" ? ["SUN", "RISING"] : ["TYPE", "AUTHORITY", "PROFILE", "DEFINITION"];
  return `<th class="check-col"><input type="checkbox" id="selectAll" aria-label="Select all charts"></th><th>CHART</th><th>BIRTH DATA</th><th>LOCATION</th>${columns.map((column) => `<th>${column}</th>`).join("")}<th class="edit-col"><span class="visually-hidden">EDIT</span></th>`;
}
function librarySignCell(place) {
  if (!place) return `<td class="muted-text">—</td>`;
  return `<td><div class="signature-cell"><span class="signature-glyph">${SIGN_GLYPHS[place.index]}</span><div class="signature-text"><strong>${place.sign}</strong><small>${place.detail}</small></div></div></td>`;
}
// Compact wording for the table: "Emotional (Solar Plexus)" → "Emotional", "Self-Projected"
// → "Self"; definitions → None / Single / Split / Triple / Quadruple.
const LIBRARY_SHORT_AUTHORITIES = { "Emotional (Solar Plexus)": "Emotional", "Self-Projected": "Self" };
function libraryShortAuthority(authority) {
  return LIBRARY_SHORT_AUTHORITIES[authority] || authority;
}
function libraryShortDefinition(definition) {
  return definition.replace(" Split Definition", "").replace(" Definition", "");
}
// Under the chart's name: how many life events and places it has (not its birth or
// annotated cycles), linking to its Life Events tab.
function libraryEventsMarkup(chart) {
  if (typeof chartLifeEvents !== "function") return ""; // (life-events.js not loaded yet: the first render at start-up)
  const records = chartLifeEvents(chart).filter((record) => !record.anchor);
  const events = records.filter((record) => record.start).length, places = records.length - events;
  if (!records.length) return "";
  const text = [events ? `${events} event${events === 1 ? "" : "s"}` : "", places ? `${places} place${places === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  return `<a class="library-events" href="#/chart/${encodeURIComponent(chartSlug(chart.id))}/life-events" title="Open ${escapeHtml(chart.name)}'s life events">${text}</a>`;
}
function libraryRowMarkup(chart) {
  const data = libraryData(chart, librarySystem);
  const cells = librarySystem === "Astrology"
    ? librarySignCell(data.sun) + librarySignCell(data.rising)
    : data.typology
      ? `<td><strong class="library-fact">${data.typology.type}</strong></td><td class="library-detail">${libraryShortAuthority(data.typology.authority)}</td><td><strong class="library-fact">${data.typology.profile}</strong></td><td class="library-detail">${libraryShortDefinition(data.typology.definition)}</td>`
      : `<td class="muted-text" colspan="4">—</td>`;
  return `<tr data-id="${chart.id}" class="${selectedChartId === chart.id ? "selected" : ""}"><td class="check-col"><input type="checkbox" aria-label="Select ${escapeHtml(chart.name)}" ${selectedChartIds.has(chart.id) ? "checked" : ""}></td><td><div class="chart-cell">${data.mini}<div><div class="chart-name"><a class="chart-name-link" href="#/chart/${encodeURIComponent(typeof chartSlug === "function" ? chartSlug(chart.id) : chart.id)}">${escapeHtml(chart.name)}</a>${chart.uncertainty ? '<span class="date-note">◌ uncertain time ±' + chart.uncertainty + "m</span>" : ""}</div><div class="chart-type">INDIVIDUAL</div><div class="chart-type">${escapeHtml(chart.tags[0]?.toUpperCase() || "STUDY")}</div>${libraryEventsMarkup(chart)}</div></div></td><td class="birth-cell">${formatDate(chart.birthDate)}<br><span class="muted-text">${chart.birthTime || "Time unknown"}</span></td><td class="location-cell">${escapeHtml(chart.location)}</td>${cells}<td class="edit-col"><button type="button" class="acg-origin-button" data-library-open aria-label="Open ${escapeHtml(chart.name)}">Open</button><button type="button" class="acg-origin-button" data-library-edit aria-label="Edit ${escapeHtml(chart.name)}">Edit</button></td></tr>`;
}

// Tabs above the table.
function setLibrarySystem(system) {
  if (!LIBRARY_SYSTEMS.includes(system)) return;
  librarySystem = system;
  document.querySelectorAll("[data-library-system]").forEach((button) => button.classList.toggle("active", button.dataset.librarySystem === system));
  renderRows();
}
document.querySelectorAll("[data-library-system]").forEach((button) => button.addEventListener("click", () => setLibrarySystem(button.dataset.librarySystem)));
renderRows();
