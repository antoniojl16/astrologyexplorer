// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// ── Real ephemeris (Astronomy Engine) ────────────────────────────────────
// Two position-computation strategies live side by side in this app:
//   - 'synthetic' (default): the existing seeded-random birth position plus
//     a simple ORBITAL_PERIODS-based linear extrapolation over time (see
//     positionAngleAtTime in timeline.js). Deterministic and instant, but
//     not real astronomy — this is the sample-data engine the app shipped
//     with originally.
//   - 'astronomy-engine': the real geocentric apparent ecliptic longitude of
//     each body, computed from its actual birth moment + offset via the
//     vendored Astronomy Engine library (astronomy-engine.js, MIT license,
//     github.com/cosinekitty/astronomy — a pure-JS VSOP87/ELP2000
//     implementation, fully offline, no ephemeris data files needed).
//
// Flip EPHEMERIS_ENGINE below to switch — every position-consuming view
// (wheel, aspects, Human Design, cycles) reads through positionAngleAtTime,
// which dispatches on this variable, so nothing else needs to change.
let EPHEMERIS_ENGINE = 'astronomy-engine'; // 'synthetic' | 'astronomy-engine'

// Astronomy Engine only models the major bodies, so Chiron gets its own
// computation (chironLongitude below: a gravity simulation from JPL starting
// states). Everything else — the angle-derived points
// (Ascendant/Midheaven/Vertex, realAscendantMidheaven/realVertex below),
// Fortuna (an Arabic Part, a formula over Ascendant+Sun+Moon, realFortuna
// below), the lunar nodes (realLunarNode below) and Lilith (the lunar apogee,
// realLilith below) — DOES get a real computation, since none of them need
// anything beyond the birth moment and birth location, which every chart
// already carries.
const REAL_EPHEMERIS_BODIES = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
const REAL_ANGLE_BODIES = new Set(['Ascendant', 'Midheaven', 'Vertex', 'Fortuna']);
const REAL_NODE_BODIES = new Set(['North Node', 'South Node']);

// Astrology software disagrees on which lunar node to use — the smooth,
// slow-moving MEAN node (a polynomial in time, what most software defaults
// to when it just says "the North Node") or the TRUE node (the Moon's actual
// instantaneous orbital plane, which oscillates back and forth around the
// mean position by up to ~1.5° on a roughly half-month period, but is more
// "real"). Both are implemented below; flip this to switch, the same way
// EPHEMERIS_ENGINE switches the whole app between synthetic and real.
let LUNAR_NODE_MODE = 'true'; // 'mean' | 'true'

// Lilith (Black Moon) is the lunar apogee, and software disagrees on which one
// in much the same way: the MEAN apogee (a smooth polynomial — what most
// Western astrology software means by "Black Moon Lilith") or the TRUE,
// osculating apogee of the Moon's instantaneous orbit, which swings tens of
// degrees around the mean (up to ~30° on real dates). Both are implemented
// below (realLilith); flip this to switch.
let LILITH_MODE = 'mean'; // 'mean' | 'true'

function norm360(degrees) { return ((degrees % 360) + 360) % 360; }

// Geocentric apparent tropical ecliptic longitude (0-360°) of a real body at
// an absolute moment. The Sun needs its own Astronomy Engine call (SunPosition)
// since GeoVector/Ecliptic computes a body's position as seen from Earth, which
// isn't meaningful for the Earth-Sun vector itself.
function realGeocentricLongitude(bodyName, date) {
  if (bodyName === 'Sun') return Astronomy.SunPosition(date).elon;
  const vector = Astronomy.GeoVector(Astronomy.Body[bodyName], date, true);
  return Astronomy.Ecliptic(vector).elon;
}

// ── Ascendant / Midheaven / Vertex ───────────────────────────────────────
// Standard spherical-astronomy formulas, built on Astronomy Engine's sidereal
// time and obliquity (so the DST/timezone/precession work it already does
// underneath doesn't need re-deriving) rather than anything astrology-
// specific. All three points lie ON the ecliptic (ecliptic latitude 0):
//   - Midheaven: where the ecliptic crosses the local meridian — the
//     ecliptic longitude whose right ascension equals RAMC (the meridian's
//     own right ascension, i.e. the local sidereal time).
//   - Ascendant: where the ecliptic crosses the eastern horizon (altitude 0,
//     rising) — a latitude-dependent point, so it needs the birth latitude
//     as well as RAMC.
//   - Vertex: the same "where the ecliptic crosses a great circle through
//     the birth location" idea as the Ascendant, but for the PRIME VERTICAL
//     (the vertical circle through the east/west points and the zenith)
//     instead of the horizon. It turns out to be the exact same formula as
//     the Ascendant with RAMC shifted 180° and latitude replaced by its
//     co-latitude (90°-latitude) — a known substitution, not rederived from
//     scratch here.
// Verified numerically against Astronomy Engine's own Horizon() function
// across several widely-spaced latitudes: the computed Midheaven sits
// exactly on the meridian (azimuth 0°/180°), the computed Ascendant sits at
// true altitude 0.000° on the eastern horizon (azimuth ~90°), and the
// computed Vertex sits at azimuth exactly 270.000° (due west, on the prime
// vertical) — in every case, with no refraction correction applied (matching
// how the rest of this app treats "the" position of a point — geometric, not
// as-observed). One exception: the Vertex formula is numerically unstable at
// exactly 0° latitude (co-latitude 90° makes tan(latitude) blow up in the
// underlying formula) — the same class of limitation as Ascendant/Midheaven
// being undefined exactly at the poles, not something worth engineering
// around for a birth chart.
function ascendantFormula(ramcDeg, latitudeDeg, obliquityDeg) {
  const ramcR = ramcDeg * Math.PI / 180, obliquityR = obliquityDeg * Math.PI / 180, latitudeR = latitudeDeg * Math.PI / 180;
  return norm360(Math.atan2(Math.cos(ramcR), -(Math.sin(obliquityR) * Math.tan(latitudeR) + Math.cos(obliquityR) * Math.sin(ramcR))) * 180 / Math.PI);
}
function localSiderealAndObliquity(date, longitude) {
  const ramc = norm360(Astronomy.SiderealTime(date) * 15 + longitude);
  return { ramc, obliquity: Astronomy.e_tilt(date).tobl };
}
function realAscendantMidheaven(date, latitude, longitude) {
  const { ramc, obliquity } = localSiderealAndObliquity(date, longitude);
  const ramcR = ramc * Math.PI / 180, obliquityR = obliquity * Math.PI / 180;
  const midheaven = norm360(Math.atan2(Math.sin(ramcR), Math.cos(ramcR) * Math.cos(obliquityR)) * 180 / Math.PI);
  return { ascendant: ascendantFormula(ramc, latitude, obliquity), midheaven };
}
function realVertex(date, latitude, longitude) {
  const { ramc, obliquity } = localSiderealAndObliquity(date, longitude);
  return ascendantFormula(norm360(ramc + 180), 90 - latitude, obliquity);
}

// ── Placidus house cusps ───────────────────────────────────────────────────
// Unlike Ascendant/Midheaven/Vertex, Placidus has no closed-form solution —
// that's exactly why real astrology software solves it iteratively, and why
// this does too, rather than chasing a formula that doesn't exist. The
// defining idea: a point's "diurnal semi-arc" (DSA) is how many degrees of
// hour angle it spends above the horizon before/after culminating — literally
// the same altitude=0 condition already verified for the Ascendant, just
// solved for the arc length instead of a longitude (DSA = arccos(-tan(lat)*
// tan(dec))). Placidus cusps 11 and 12 are the ecliptic points whose OWN hour
// angle equals exactly 1/3 and 2/3 of their OWN diurnal semi-arc (so cusp 11
// is "1/3 of the way, in time, from rising to culminating"); cusps 2 and 3
// are the same idea using the nocturnal semi-arc (180° - DSA) between the
// Ascendant and the lower meridian (IC). Cusps 5/6/8/9 are just 180° opposite
// 11/12/2/3 (a real, exact symmetry of the system, not an approximation).
//
// Solved by bisection along the known ecliptic arc between two already-
// verified points (MC→ASC for 11/12, ASC→IC for 2/3) rather than Newton's
// method, since the arc's endpoints already bracket the root (checked before
// trusting: a sign flip is required to make that bracket correct — see the
// comment on hourAngleDegrees below) and bisection can't diverge or need a
// derivative.
//
// Verified: at latitude 0° (where every declination has DSA=90°), the solved
// cusps land at hour angles of exactly -30.000°/-60.000°/-90.000° from the
// MC, for several different RAMC values — the expected result if the general
// iterative solver is actually correct, not just self-consistent. Also
// checked for a Southern-hemisphere and a high-latitude location: cusps come
// out strictly monotonically increasing all the way around the circle
// (10→11→12→1→2→3→4→5→6→7→8→9→10), which is required of any valid house
// division and isn't guaranteed by the solver unless the math is right.
function eclipticPointEquatorial(longitudeDeg, obliquityDeg) {
  const longitudeR = longitudeDeg * Math.PI / 180, obliquityR = obliquityDeg * Math.PI / 180;
  const rightAscension = norm360(Math.atan2(Math.sin(longitudeR) * Math.cos(obliquityR), Math.cos(longitudeR)) * 180 / Math.PI);
  const declination = Math.asin(Math.sin(longitudeR) * Math.sin(obliquityR)) * 180 / Math.PI;
  return { rightAscension, declination };
}
// RAMC minus this point's own right ascension, normalized to (-180, 180].
// On the MC→ASC arc this comes out NEGATIVE (the point hasn't culminated
// yet — its right ascension is ahead of RAMC) — verified numerically before
// use, since getting this sign backwards makes the bisection bracket empty
// (both endpoints land on the same side) rather than silently wrong, which
// is at least a loud failure, but worth stating plainly here anyway.
function hourAngleDegrees(longitudeDeg, obliquityDeg, ramcDeg) {
  const hourAngle = ramcDeg - eclipticPointEquatorial(longitudeDeg, obliquityDeg).rightAscension;
  return ((hourAngle + 180) % 360 + 360) % 360 - 180;
}
function diurnalSemiArcDegrees(longitudeDeg, obliquityDeg, latitudeDeg) {
  const { declination } = eclipticPointEquatorial(longitudeDeg, obliquityDeg);
  const cosHourAngle = -Math.tan(latitudeDeg * Math.PI / 180) * Math.tan(declination * Math.PI / 180);
  return Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) * 180 / Math.PI;
}
// Bisects `residualFn` for a root between longitudeStart and longitudeStart+arcSpanDeg
// (stepping along increasing ecliptic longitude), returning null if the two
// ends don't bracket a sign change — houseCuspsAtTime falls back to the
// synthetic approximation in that case rather than trusting a non-result.
function bisectAlongEcliptic(longitudeStart, arcSpanDeg, residualFn, iterations = 60) {
  const valueAt = step => residualFn(norm360(longitudeStart + step));
  let low = 0, high = arcSpanDeg, valueLow = valueAt(low), valueHigh = valueAt(high);
  if (valueLow === 0) return norm360(longitudeStart + low);
  if (valueHigh === 0) return norm360(longitudeStart + high);
  if (valueLow * valueHigh > 0) return null;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2, valueMid = valueAt(mid);
    if (valueLow * valueMid <= 0) { high = mid; valueHigh = valueMid; } else { low = mid; valueLow = valueMid; }
  }
  return norm360(longitudeStart + (low + high) / 2);
}
function realPlacidusHouseCusps(date, latitude, longitude) {
  const { ramc, obliquity } = localSiderealAndObliquity(date, longitude);
  const midheaven = norm360(Math.atan2(Math.sin(ramc * Math.PI / 180), Math.cos(ramc * Math.PI / 180) * Math.cos(obliquity * Math.PI / 180)) * 180 / Math.PI);
  const ascendant = ascendantFormula(ramc, latitude, obliquity);
  const imumCoeli = norm360(midheaven + 180);

  const dayArcSpan = ((ascendant - midheaven) % 360 + 360) % 360;
  const cusp11 = bisectAlongEcliptic(midheaven, dayArcSpan, longitude =>
    -hourAngleDegrees(longitude, obliquity, ramc) - diurnalSemiArcDegrees(longitude, obliquity, latitude) / 3);
  const cusp12 = bisectAlongEcliptic(midheaven, dayArcSpan, longitude =>
    -hourAngleDegrees(longitude, obliquity, ramc) - 2 * diurnalSemiArcDegrees(longitude, obliquity, latitude) / 3);

  const nightArcSpan = ((imumCoeli - ascendant) % 360 + 360) % 360;
  const hourAngleFromIc = longitude => {
    const hourAngle = (ramc + 180) - eclipticPointEquatorial(longitude, obliquity).rightAscension;
    return ((hourAngle + 180) % 360 + 360) % 360 - 180;
  };
  const nocturnalSemiArc = longitude => 180 - diurnalSemiArcDegrees(longitude, obliquity, latitude);
  const cusp2 = bisectAlongEcliptic(ascendant, nightArcSpan, longitude => hourAngleFromIc(longitude) - (2 / 3) * nocturnalSemiArc(longitude));
  const cusp3 = bisectAlongEcliptic(ascendant, nightArcSpan, longitude => hourAngleFromIc(longitude) - (1 / 3) * nocturnalSemiArc(longitude));

  if ([cusp11, cusp12, cusp2, cusp3].some(value => value == null)) return null;
  return [ascendant, cusp2, cusp3, imumCoeli, norm360(cusp11 + 180), norm360(cusp12 + 180), norm360(ascendant + 180), norm360(cusp2 + 180), norm360(cusp3 + 180), midheaven, cusp11, cusp12];
}

// ── Fortuna (Part of Fortune) ─────────────────────────────────────────────
// An Arabic Part: a formula over three other points, not a body with its own
// ephemeris. The classic day/night-sensitive formula —
//   day chart:   Ascendant + Moon - Sun
//   night chart: Ascendant + Sun - Moon
// — where "day" means the Sun is actually above the horizon at birth,
// checked the same way the Ascendant's own altitude was verified: convert
// the Sun's real position to equatorial coordinates and ask Astronomy
// Engine's Horizon() whether it's up.
function realFortuna(date, latitude, longitude) {
  const { ascendant } = realAscendantMidheaven(date, latitude, longitude);
  const sunLongitude = Astronomy.SunPosition(date).elon;
  const moonLongitude = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, date, true)).elon;
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const sunEquatorial = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  const isDaytime = Astronomy.Horizon(date, observer, sunEquatorial.ra, sunEquatorial.dec, null).altitude > 0;
  return norm360(isDaytime ? ascendant + moonLongitude - sunLongitude : ascendant + sunLongitude - moonLongitude);
}

// ── Lunar nodes ────────────────────────────────────────────────────────────
// The ascending node's ecliptic longitude (North Node; South Node is always
// exactly opposite). Two independent implementations, chosen by
// LUNAR_NODE_MODE — neither is derived from the other.
//
// Mean node: the standard IAU/Meeus polynomial in Julian centuries since
// J2000 TT. This isn't exposed by Astronomy Engine's public API, but it
// computes this exact series internally for its own lunar theory — this is
// the same well-known formula, not reverse-engineered from the library.
// The polynomial is measured from the MEAN equinox of date; adding the
// nutation in longitude (Astronomy.e_tilt's dpsi, in arcseconds) refers it to
// the TRUE equinox, like every other body here and like Swiss Ephemeris'
// MEAN_NODE — which it then matches to within ~0.1″ (without it, up to ~17″).
// The mean node's polynomial itself (degrees, mean equinox of date, not normalized),
// shared with the mean Lilith below.
function meanLunarNodePolynomial(centuries) {
  const c2 = centuries * centuries, c3 = c2 * centuries, c4 = c3 * centuries;
  return 125.0445479 - 1934.1362891 * centuries + 0.0020754 * c2 + c3 / 467441 - c4 / 60616000;
}
function meanLunarNodeLongitude(date) {
  const time = Astronomy.MakeTime(date);
  return norm360(meanLunarNodePolynomial(time.tt / 36525) + Astronomy.e_tilt(time).dpsi / 3600);
}
// True node: the ascending intersection of the Moon's actual, instantaneous
// orbital plane with the ecliptic (of date) — derived from the Moon's
// position and velocity (GeoMoonState), rotated into the ecliptic-of-date
// frame (Rotation_EQJ_ECT) to match the same "of date" convention every
// other real body in this file uses (realGeocentricLongitude's aberration-
// corrected GeoVector positions). The orbital plane's normal vector is
// position × velocity; the ascending node is where that plane crosses the
// ecliptic moving south-to-north.
//
// Verified against Astronomy Engine's own SearchMoonNode(), which finds the
// actual TIMES the Moon crosses the ecliptic: evaluated at three consecutive
// real crossing events, this formula matched the Moon's own ecliptic
// longitude at that exact moment (which by definition IS the node at an
// ascending crossing) to 3+ decimal places, and correctly distinguished
// ascending from descending crossings via the atan2 argument order below —
// getting that order backwards silently returns the South Node instead, so
// it isn't a detail to change without re-checking against SearchMoonNode.
function trueLunarNodeLongitude(date) {
  const state = Astronomy.GeoMoonState(date);
  const rotation = Astronomy.Rotation_EQJ_ECT(date);
  const position = Astronomy.RotateVector(rotation, { x: state.x, y: state.y, z: state.z, t: state.t });
  const velocity = Astronomy.RotateVector(rotation, { x: state.vx, y: state.vy, z: state.vz, t: state.t });
  const normalX = position.y * velocity.z - position.z * velocity.y;
  const normalY = position.z * velocity.x - position.x * velocity.z;
  return norm360(Math.atan2(normalX, -normalY) * 180 / Math.PI);
}
function realLunarNode(bodyName, date) {
  const ascendingNode = LUNAR_NODE_MODE === 'true' ? trueLunarNodeLongitude(date) : meanLunarNodeLongitude(date);
  return bodyName === 'North Node' ? ascendingNode : norm360(ascendingNode + 180);
}

// ── Lilith (lunar apogee) ──────────────────────────────────────────────────
// Two independent implementations, chosen by LILITH_MODE. Both checked against
// Swiss Ephemeris (pyswisseph 2.10) on dates from 1900 to 2100.
//
// Mean apogee: the Meeus mean longitude of the lunar perigee, plus 180°. That
// polynomial measures the apogee ALONG the Moon's orbit (from the equinox to
// the node on the ecliptic, then on along the orbit), so it's reduced onto the
// ecliptic through the mean node and the orbit's mean 5.145° inclination —
// without that step it's off by up to ~0.11° (~410″) — then referred to the
// true equinox with the nutation in longitude, like the mean node. Matches
// Swiss Ephemeris' MEAN_APOG to within ~1″.
const MOON_MEAN_INCLINATION = 5.1453964; // degrees
function meanLilithLongitude(date) {
  const time = Astronomy.MakeTime(date);
  const centuries = time.tt / 36525;
  const c2 = centuries * centuries, c3 = c2 * centuries, c4 = c3 * centuries;
  const apogeeInOrbit = 83.3532465 + 4069.0137287 * centuries - 0.01032 * c2 - c3 / 80053 + c4 / 18999000 + 180;
  const node = meanLunarNodePolynomial(centuries);
  const inclination = MOON_MEAN_INCLINATION * Math.PI / 180;
  const fromNode = (apogeeInOrbit - node) * Math.PI / 180;
  const onEcliptic = node + Math.atan2(Math.cos(inclination) * Math.sin(fromNode), Math.cos(fromNode)) * 180 / Math.PI;
  return norm360(onEcliptic + Astronomy.e_tilt(time).dpsi / 3600);
}
// True (osculating) apogee: the apogee of the two-body orbit through the Moon's
// actual position and velocity (GeoMoonState, in the ecliptic-of-date frame as
// for the true node). The eccentricity vector points to perigee; the apogee is
// opposite. Matches Swiss Ephemeris' OSCU_APOG to within a few arcminutes — the
// osculating apogee magnifies small errors in the Moon's velocity, so that's
// the limit of Astronomy Engine's lunar theory here, not of the method.
const EARTH_MOON_GM = (398600.4418 + 4902.800066) * 86400 ** 2 / 149597870.7 ** 3; // AU³/day²
function trueLilithLongitude(date) {
  const state = Astronomy.GeoMoonState(date);
  const rotation = Astronomy.Rotation_EQJ_ECT(date);
  const r = Astronomy.RotateVector(rotation, { x: state.x, y: state.y, z: state.z, t: state.t });
  const v = Astronomy.RotateVector(rotation, { x: state.vx, y: state.vy, z: state.vz, t: state.t });
  const distance = Math.hypot(r.x, r.y, r.z);
  const speedSquared = v.x * v.x + v.y * v.y + v.z * v.z;
  const radialSpeed = r.x * v.x + r.y * v.y + r.z * v.z;
  const eccentricity = (axis) => ((speedSquared - EARTH_MOON_GM / distance) * r[axis] - radialSpeed * v[axis]) / EARTH_MOON_GM;
  return norm360(Math.atan2(-eccentricity('y'), -eccentricity('x')) * 180 / Math.PI);
}
function realLilith(date) {
  return LILITH_MODE === 'true' ? trueLilithLongitude(date) : meanLilithLongitude(date);
}

// ── Chiron ─────────────────────────────────────────────────────────────────
// Astronomy Engine has no model of Chiron, but it does ship a gravity simulator
// (GravitySimulator: the Sun plus Jupiter, Saturn, Uranus and Neptune pulling on
// small bodies). Chiron's orbit is chaotic enough — Saturn and Uranus bend it
// noticeably every pass — that one set of orbital elements drifts by arcminutes
// over a century, so the simulation restarts from the nearest of these starting
// states: Chiron's real heliocentric position (AU) and velocity (AU/day), J2000
// equatorial (ICRF) frame, at 1 January 12:00 TT of every 25th year, from NASA
// JPL's Horizons system (ssd.jpl.nasa.gov/horizons, 2060 Chiron, orbit solution JPL#171).
// Each 25-year stretch is integrated once, on first use, in 8-day steps and kept;
// positions in between are interpolated from the stored positions and velocities.
// Checked against Horizons' own apparent geocentric longitudes every 137 days
// from 1800 to 2200: within a few arcseconds. Outside 1787–2212 it extrapolates
// from the first or last start and loses accuracy (arcminutes per century).
const CHIRON_STARTS = [
  [1800, -5.883683288446, -6.429534958286, -2.402459551835, 4.057909428870e-03, -5.012164474820e-03, -1.308016569819e-03],
  [1825, 17.192475970509, 5.140120828834, 2.735796543937, -1.371791812858e-03, 2.826455335504e-03, 7.980019627973e-04],
  [1850, -4.113349525060, -8.196996401512, -2.840230931175, 4.803621433073e-03, -3.958090753721e-03, -9.294432239309e-04],
  [1875, 16.559478217830, 6.257295992976, 3.041037156988, -1.704836157716e-03, 2.709123950313e-03, 7.381268234786e-04],
  [1900, -2.085605685490, -9.635387976601, -3.160093443014, 5.185554498186e-03, -2.888934188026e-03, -5.762878776338e-04],
  [1925, 16.773712354459, 6.824163356253, 3.189207533307, -1.770849594598e-03, 2.614020687693e-03, 7.091345046060e-04],
  [1950, -2.737565897831, -9.218097497469, -3.060071878946, 5.133545228465e-03, -3.200386670792e-03, -6.832759520399e-04],
  [1975, 16.993152297284, 6.619670090881, 3.131434914636, -1.681677849800e-03, 2.650283595806e-03, 7.265333897737e-04],
  [2000, -3.529597340229, -8.675401106305, -2.935904698815, 4.971227221946e-03, -3.626418902160e-03, -8.257960236166e-04],
  [2025, 17.273029924637, 6.174581025121, 3.004000553669, -1.554720760784e-03, 2.695921883572e-03, 7.485031716043e-04],
  [2050, -4.385127151446, -8.010525708371, -2.778598245525, 4.746644996998e-03, -4.101317726708e-03, -9.896737641478e-04],
  [2075, 17.494610505133, 5.718330720112, 2.872134720923, -1.418226540842e-03, 2.733756368491e-03, 7.672677841932e-04],
  [2100, -5.090899143887, -7.314904211490, -2.596449204507, 4.508172325763e-03, -4.523777245965e-03, -1.136932551744e-03],
  [2125, 17.184951317310, 5.710229061916, 2.832426883386, -1.447771630906e-03, 2.761636871979e-03, 7.722870693462e-04],
  [2150, -4.290290047051, -8.028690632956, -2.765220294226, 4.802704854414e-03, -4.038022465814e-03, -9.662362742076e-04],
  [2175, 16.686578186078, 6.431546111933, 3.020462428999, -1.660088142473e-03, 2.709670393232e-03, 7.435344114920e-04],
  [2200, -2.881944012198, -9.028640073310, -2.985709937426, 5.142106619702e-03, -3.274224121633e-03, -7.064087021339e-04],
];
const CHIRON_STEP_DAYS = 8;
const CHIRON_SPEED_OF_LIGHT = 173.1446326846693; // AU/day
const chironStretches = new Map(); // start index → { t0 (TT days), before: [states], after: [states] }

// The stretch nearest to `tt`, integrated out to cover it (both directions from its start).
function chironStateAt(tt) {
  const index = Math.max(0, Math.min(CHIRON_STARTS.length - 1, Math.round((tt / 365.25 + 2000 - 1800) / 25)));
  let stretch = chironStretches.get(index);
  if (!stretch) {
    const [year, x, y, z, vx, vy, vz] = CHIRON_STARTS[index];
    // The starting states are at 12:00 TT; MakeTime takes UT, so shift by ΔT.
    const utTime = Astronomy.MakeTime(new Date(Date.UTC(year, 0, 1, 12)));
    const t0 = utTime.AddDays(utTime.ut - utTime.tt);
    const start = new Astronomy.StateVector(x, y, z, vx, vy, vz, t0);
    stretch = { t0, start, before: [start], after: [start], simulators: {} };
    chironStretches.set(index, stretch);
  }
  const steps = (tt - stretch.t0.tt) / CHIRON_STEP_DAYS;
  const direction = steps < 0 ? 'before' : 'after';
  const sign = steps < 0 ? -1 : 1;
  const list = stretch[direction];
  const needed = Math.floor(Math.abs(steps)) + 1;
  if (list.length <= needed) {
    const simulator = stretch.simulators[direction]
      || (stretch.simulators[direction] = new Astronomy.GravitySimulator(Astronomy.Body.Sun, stretch.t0, [stretch.start]));
    while (list.length <= needed) list.push(simulator.Update(stretch.t0.AddDays(sign * list.length * CHIRON_STEP_DAYS))[0]);
  }
  // Cubic Hermite interpolation between the two stored states around `tt`.
  const offset = Math.abs(steps), i = Math.floor(offset), f = offset - i;
  const a = list[i], b = list[i + 1], h = sign * CHIRON_STEP_DAYS;
  const h00 = 2 * f ** 3 - 3 * f ** 2 + 1, h10 = f ** 3 - 2 * f ** 2 + f, h01 = -2 * f ** 3 + 3 * f ** 2, h11 = f ** 3 - f ** 2;
  const at = (p, v) => h00 * a[p] + h10 * h * a[v] + h01 * b[p] + h11 * h * b[v];
  return { x: at('x', 'vx'), y: at('y', 'vy'), z: at('z', 'vz') };
}
// Apparent geocentric longitude, ecliptic of date, true equinox — the same frame
// as every other body here: light-time corrected (Chiron as it was when the light
// left it) and with annual aberration (the Earth's own motion), then rotated by
// Astronomy.Ecliptic, which applies precession and nutation. chironApparentVector is
// the geocentric J2000 equatorial vector before that rotation (the map lines use it
// for Chiron's right ascension and declination).
function chironApparentVector(date) {
  const time = Astronomy.MakeTime(date);
  const earth = Astronomy.HelioState(Astronomy.Body.Earth, time);
  let lightTime = 0, vector = null;
  for (let pass = 0; pass < 3; pass++) {
    const chiron = chironStateAt(time.tt - lightTime);
    vector = { x: chiron.x - earth.x, y: chiron.y - earth.y, z: chiron.z - earth.z };
    lightTime = Math.hypot(vector.x, vector.y, vector.z) / CHIRON_SPEED_OF_LIGHT;
  }
  return new Astronomy.Vector(vector.x + earth.vx * lightTime, vector.y + earth.vy * lightTime, vector.z + earth.vz * lightTime, time);
}
function chironLongitude(date) {
  return norm360(Astronomy.Ecliptic(chironApparentVector(date)).elon);
}

// Real angle for `position` at `offsetMinutes` past its stored birthMoment
// (stamped on every position by makePositions in app.js), or null if this
// body/engine combination isn't backed by real ephemeris — positionAngleAtTime
// falls back to the synthetic calculation whenever this returns null.
function ephemerisAngleAtTime(position, offsetMinutes) {
  if (EPHEMERIS_ENGINE !== 'astronomy-engine') return null;
  if (typeof Astronomy === 'undefined' || !position.birthMoment) return null;
  // Elapsed time, not clock time: setMinutes() would add local-clock minutes and
  // land an hour off whenever a daylight-saving change falls in between.
  const date = new Date(Date.parse(position.birthMoment) + offsetMinutes * 60000);
  // Earth isn't a real ephemeris body in its own right here — by this app's
  // own convention (oppositePosition(sun, 'Earth') in makePositions) it's
  // always defined as exactly opposite the Sun. Pinning it to the real Sun
  // here keeps that true under real ephemeris too; without this it drifted
  // on its own synthetic-only path and could end up far from Sun+180°.
  if (position.name === 'Earth') return norm360(realGeocentricLongitude('Sun', date) + 180);
  if (REAL_EPHEMERIS_BODIES.has(position.name)) {
    return ((realGeocentricLongitude(position.name, date) % 360) + 360) % 360;
  }
  if (REAL_NODE_BODIES.has(position.name)) {
    return realLunarNode(position.name, date);
  }
  if (position.name === 'Lilith') return realLilith(date);
  if (position.name === 'Chiron') return chironLongitude(date);
  if (REAL_ANGLE_BODIES.has(position.name)) {
    if (position.latitude == null || position.longitude == null) return null;
    const latitude = Number(position.latitude), longitude = Number(position.longitude);
    if (position.name === 'Vertex') return realVertex(date, latitude, longitude);
    if (position.name === 'Fortuna') return realFortuna(date, latitude, longitude);
    const { ascendant, midheaven } = realAscendantMidheaven(date, latitude, longitude);
    return position.name === 'Ascendant' ? ascendant : midheaven;
  }
  return null;
}

// ── Debug bar ─────────────────────────────────────────────────────────────
// Surfaces which engine is actually active, whether the vendored library
// loaded, and a live side-by-side of what each engine computes for the Sun
// on whatever chart is currently open — so a bad switch, a load failure, or
// a bogus computation is visible at a glance instead of hidden in state.
// Polls on an interval rather than hooking every render path, since this is
// a debug aid, not part of the app's real render flow.
// Shown only in developer mode (About dialog); skipped entirely otherwise.
function updateEphemerisDebugBar() {
  const bar = document.getElementById('ephemerisDebugBar');
  if (!bar || !document.body.classList.contains('developer-mode')) return;
  const libLoaded = typeof Astronomy !== 'undefined' && typeof Astronomy.SunPosition === 'function';
  let comparison = '';
  try {
    const chart = typeof currentExplorerChart === 'function' ? currentExplorerChart() : null;
    const sun = chart && chart.positions.find(position => position.name === 'Sun');
    if (sun) {
      const offset = window.timelineOffsetMinutes || 0;
      const syntheticAngle = syntheticAngleAtTime(sun, offset).toFixed(1);
      const previousEngine = EPHEMERIS_ENGINE;
      EPHEMERIS_ENGINE = 'astronomy-engine';
      const realAngle = libLoaded ? ephemerisAngleAtTime(sun, offset) : null;
      EPHEMERIS_ENGINE = previousEngine;
      comparison = ` · Sun @ ${offset}min from birth → synthetic ${syntheticAngle}° / real ${realAngle == null ? 'n/a' : realAngle.toFixed(1) + '°'}`;
    }
  } catch (error) {
    comparison = ` · comparison unavailable (${error.message})`;
  }
  bar.textContent = `EPHEMERIS ENGINE: ${EPHEMERIS_ENGINE} · astronomy-engine.js loaded: ${libLoaded ? 'yes' : 'no'}${comparison}`;
  bar.classList.toggle('real', EPHEMERIS_ENGINE === 'astronomy-engine' && libLoaded);
  bar.classList.toggle('warn', EPHEMERIS_ENGINE === 'astronomy-engine' && !libLoaded);
}
setInterval(updateEphemerisDebugBar, 500);
document.addEventListener('DOMContentLoaded', updateEphemerisDebugBar);
