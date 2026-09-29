// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The Pair Explorer's composite astrology chart: one wheel for the relationship itself.
// Two ways to build it:
//   Midpoints — each body at the midpoint (the nearer one) of its two natal places.
//     Houses, either:
//       Reference place (Robert Hand's method, the default): the Midheaven is the
//         midpoint of the two Midheavens, and the Ascendant, Vertex and house cusps are
//         cast from it at the latitude of a chosen place — by default halfway between
//         the birthplaces, or either birthplace, or anywhere (where the couple lives);
//       Midpoint cusps: each angle and cusp at the midpoint of the two charts' own.
//   Davison — a real chart cast for the moment halfway between the two births, at the
//     place halfway between the birthplaces (along the great circle).
// Built as a chart the wheel draws like any other: Davison positions are ordinary
// ephemeris positions at the midpoint moment; midpoint positions carry a fixed longitude
// (`fixedAngle`, timeline.js), and midpoint cusps a fixed set of cusps (`fixedCusps`).

const pairComposite = {
  method: acgStoredSetting('orbital-study-composite-method', 'midpoint') === 'davison' ? 'davison' : 'midpoint',
  houses: acgStoredSetting('orbital-study-composite-houses', 'reference') === 'midpoint' ? 'midpoint' : 'reference',
};
// The reference place per pair (keyed by both chart ids): 'midpoint', one of the two
// chart ids (that chart's birthplace), or a place
// { name, lat, lon } (remembered in this browser only).
function pairCompositeReferences() {
  try { return JSON.parse(acgStoredSetting('orbital-study-composite-places', '{}')) || {}; } catch { return {}; }
}
function pairCompositeReference(chartA, chartB) {
  return pairCompositeReferences()[[chartA.id, chartB.id].sort().join('|')] || 'midpoint';
}
function setPairCompositeReference(chartA, chartB, value) {
  const all = pairCompositeReferences();
  all[[chartA.id, chartB.id].sort().join('|')] = value;
  acgStoreSetting('orbital-study-composite-places', JSON.stringify(all));
}

const compositeNorm = (angle) => ((angle % 360) + 360) % 360;
// The nearer midpoint of two longitudes.
function compositeMidpoint(a, b) {
  return compositeNorm(a + ((((b - a) % 360) + 540) % 360 - 180) / 2);
}
// Halfway between two places along the great circle.
function compositeGeoMidpoint(a, b) {
  const rad = Math.PI / 180;
  const vector = ({ lat, lon }) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const [x1, y1, z1] = vector(a), [x2, y2, z2] = vector(b);
  const x = x1 + x2, y = y1 + y2, z = z1 + z2;
  if (Math.hypot(x, y, z) < 1e-9) return { lat: (a.lat + b.lat) / 2, lon: a.lon }; // (antipodes: any meridian will do)
  return { lat: Math.atan2(z, Math.hypot(x, y)) / rad, lon: Math.atan2(y, x) / rad };
}
const compositePlaceOf = (chart) => ({ lat: Number(chart.latitude), lon: Number(chart.longitude), name: chart.location });

// { chart, description, place? } for the current settings.
function computePairComposite(chartA, chartB) {
  const timeA = chartBirthMomentUTC(chartA).getTime(), timeB = chartBirthMomentUTC(chartB).getTime();
  const middle = new Date((timeA + timeB) / 2);
  const between = compositeGeoMidpoint(compositePlaceOf(chartA), compositePlaceOf(chartB));
  const base = { id: `composite:${chartA.id}:${chartB.id}`, name: 'Composite', location: '', tags: [] };

  if (pairComposite.method === 'davison') {
    const birthMoment = middle.toISOString();
    return {
      chart: { ...base, latitude: between.lat, longitude: between.lon, positions: chartA.positions.map((position) => ({ ...position, birthMoment, latitude: between.lat, longitude: between.lon })) },
      description: `Davison · ${formatDate(birthMoment.slice(0, 10))} ${birthMoment.slice(11, 16)} UTC · ${acgCoordinate(between.lat, 'N', 'S')}, ${acgCoordinate(between.lon, 'E', 'W')}`,
    };
  }

  const angleOf = (chart, name) => {
    const position = chart.positions.find((item) => item.name === name);
    return position ? positionAngleAtTime(position, 0) : null;
  };
  const opposite = { Earth: 'Sun', 'South Node': 'North Node' };
  const angles = new Set(['Ascendant', 'Midheaven', 'Vertex']);
  const midpointOf = (name) => {
    if (opposite[name]) return compositeNorm(midpointOf(opposite[name]) + 180); // (kept exactly opposite)
    const a = angleOf(chartA, name), b = angleOf(chartB, name);
    return a == null || b == null ? null : compositeMidpoint(a, b);
  };
  // Reference place: needs the real ephemeris (the angles are cast from sidereal time).
  const reference = pairComposite.houses === 'reference' && EPHEMERIS_ENGINE === 'astronomy-engine' && typeof localSiderealAndObliquity === 'function';
  let place = null, cast = null;
  if (reference) {
    const choice = pairCompositeReference(chartA, chartB);
    place = choice === chartA.id ? compositePlaceOf(chartA)
      : choice === chartB.id ? compositePlaceOf(chartB)
      : typeof choice === 'object' ? choice
      : { ...between, name: 'Halfway between the birthplaces' };
    // The meridian whose Midheaven, at the midpoint moment, is the composite Midheaven
    // (tropical, for the sidereal-time conversion): RAMC from the MC, then its longitude.
    const midheaven = compositeNorm(midpointOf('Midheaven') + (zodiacMode === 'Sidereal' ? LAHIRI_AYANAMSHA : 0));
    const { ramc: greenwich, obliquity } = localSiderealAndObliquity(middle, 0);
    const rad = Math.PI / 180;
    const ramc = compositeNorm(Math.atan2(Math.sin(midheaven * rad) * Math.cos(obliquity * rad), Math.cos(midheaven * rad)) / rad);
    const longitude = ((ramc - greenwich + 540) % 360) - 180;
    cast = { birthMoment: middle.toISOString(), latitude: place.lat, longitude };
  }
  const positions = chartA.positions.filter((position) => chartB.positions.some((item) => item.name === position.name)).map((position) => {
    // Reference place: the angles are real ones, cast for the composite Midheaven at the place's latitude.
    if (cast && angles.has(position.name)) return { ...position, ...cast };
    return { ...position, fixedAngle: midpointOf(position.name) };
  }).filter((position) => position.fixedAngle !== null);
  const chart = { ...base, latitude: place ? place.lat : between.lat, longitude: between.lon, positions };
  if (!cast) {
    const cuspsA = houseCuspsAtTime(chartA, 0), cuspsB = houseCuspsAtTime(chartB, 0);
    chart.fixedCusps = cuspsA.map((cusp, index) => compositeMidpoint(cusp, cuspsB[index]));
  }
  return {
    chart, place,
    description: cast ? `Midpoints · houses for ${place.name || `${acgCoordinate(place.lat, 'N', 'S')}, ${acgCoordinate(place.lon, 'E', 'W')}`}` : 'Midpoints · midpoint house cusps',
  };
}

// The composite as a Pair Explorer "person" for the wheel, grid and aspect list.
function pairCompositePerson(chartA, chartB) {
  const { chart, description } = computePairComposite(chartA, chartB);
  return { key: 'C', chart, color: 'var(--green)', name: 'Composite', tag: 'composite', legend: `Composite · ${escapeHtml(chartA.name)} & ${escapeHtml(chartB.name)}<small class="pair-composite-about">${escapeHtml(description)}</small>`, offset: 0 };
}

// The settings, at the bottom of the wheel's filter column (shown with the composite
// only), as radio lists like the filters above them.
function pairCompositeControlsMarkup(chartA, chartB) {
  const choice = pairCompositeReference(chartA, chartB);
  const custom = typeof choice === 'object' ? choice : null;
  const radio = (name, value, label, checked, title = '') => `<label class="acg-filter"${title ? ` title="${escapeHtml(title)}"` : ''}><input type="radio" name="${name}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
  const midpoint = pairComposite.method === 'midpoint';
  const reference = midpoint && pairComposite.houses === 'reference';
  return `<span class="eyebrow wheel-filter-section">COMPOSITE</span>
    <div class="acg-filter-group">
      ${radio('composite-method', 'midpoint', 'Midpoints', midpoint, 'Each body at the midpoint of its two natal places')}
      ${radio('composite-method', 'davison', 'Davison', !midpoint, 'A real chart for the moment and place halfway between the two births')}
    </div>
    ${midpoint ? `<span class="eyebrow wheel-filter-section">HOUSES</span>
    <div class="acg-filter-group">
      ${radio('composite-houses', 'reference', 'Reference place', reference, "The angles and houses cast from the midpoint Midheaven at a place's latitude (Robert Hand's method)")}
      ${radio('composite-houses', 'midpoint', 'Midpoint cusps', !reference, "Each angle and house cusp at the midpoint of the two charts' own")}
    </div>` : ''}
    ${reference ? `<span class="eyebrow wheel-filter-section" title="The place the houses are cast for — often where the couple lives">REFERENCE PLACE</span>
    <div class="acg-filter-group">
      ${radio('composite-reference', 'midpoint', 'Halfway between birthplaces', choice === 'midpoint')}
      ${radio('composite-reference', 'A', `${chartA.name}'s birthplace`, choice === chartA.id)}
      ${radio('composite-reference', 'B', `${chartB.name}'s birthplace`, choice === chartB.id)}
      ${custom ? radio('composite-reference', 'custom', custom.name || 'Chosen place', true) : ''}
      <span class="pair-composite-find"><input type="search" class="pair-composite-search" data-composite-search placeholder="Another place…" aria-label="Search for a reference place"></span>
    </div>` : ''}`;
}
function bindPairCompositeControls(box, chartA, chartB, redraw) {
  const refresh = () => { box.innerHTML = pairCompositeControlsMarkup(chartA, chartB); bindSearch(); redraw(); };
  const bindSearch = () => {
    const search = box.querySelector('[data-composite-search]');
    if (search) bindPlaceSearch(search, (place) => {
      setPairCompositeReference(chartA, chartB, { name: placeLabel(place), lat: Number(place.lat), lon: Number(place.lon) });
      refresh();
    });
  };
  box.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name === 'composite-method') {
      pairComposite.method = value;
      acgStoreSetting('orbital-study-composite-method', value);
    } else if (name === 'composite-houses') {
      pairComposite.houses = value;
      acgStoreSetting('orbital-study-composite-houses', value);
    } else if (name === 'composite-reference' && value !== 'custom') {
      setPairCompositeReference(chartA, chartB, value === 'A' ? chartA.id : value === 'B' ? chartB.id : value);
    } else return;
    refresh();
  });
  box.innerHTML = pairCompositeControlsMarkup(chartA, chartB);
  bindSearch();
}
