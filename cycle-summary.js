// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// The Cycle Explorer's Summary tab: "at that moment" — for the studied moment (a cycle
// occurrence, a life event or birth), one readable section per system:
//   Astrology: the moment's planets in tight aspect to the natal chart (within a fifth
//     of each aspect's orb, the "exact" rule), strongest first, applying or separating;
//   Human Design: the gates the moment's planets activate, and the channels and centers
//     they define only together with the natal chart;
//   Gene Keys: each sphere's natal Key next to the Key its planet is transiting;
//   Astrocartography: the lines, crossings and zenith zones at the moment's place.
// Birth is the natal chart itself, so there it reads the natal chart: its own tight
// aspects, defined channels and Gene Keys, and the lines at the birthplace.
// The moment's angles are cast where the Astrology tab's Cast for says, and Human Design
// and Gene Keys follow their Transit | Full chart switch (cycle-moment.js).
// Nothing is stored: it's computed when shown, and kept in memory while the app is open.

const cycleSummaryCache = new Map();
function cycleSummaryData(context, place) {
  const { chart, anchorOffset, omit } = context;
  const hidden = ASPECT_DEFINITIONS.filter((definition) => !aspectVisible(definition.name)).map((definition) => definition.name).join(",");
  const birth = !!context.birth;
  const reading = cycleReading(context);
  const cast = cycleCastChart(context);
  const key = [birth ? "birth" : "", reading, cast.latitude, cast.longitude, chart.id, chart.positions[0]?.birthMoment, anchorOffset, omit ? "approx" : "exact", place ? `${place.lat},${place.lon}` : "", hidden, EPHEMERIS_ENGINE, LUNAR_NODE_MODE].join("|");
  if (cycleSummaryCache.has(key)) return cycleSummaryCache.get(key);
  const glyphOf = (name) => chart.positions.find((position) => position.name === name)?.glyph || "";

  // Astrology: the moment's bodies (without an imprecise moment's angles) against the natal ones.
  const at = (offset) => (position) => ({ ...position, angle: positionAngleAtTime(position, offset) });
  const natal = chart.positions.map(at(0));
  const moving = cast.positions.filter((position) => !omit?.has(position.name) && bodyShownAt(position, anchorOffset));
  const aspects = birth ? calculateAspects({ positions: natal }) : calculateCrossAspects(moving.map(at(anchorOffset)), natal);
  const transits = aspects
    .filter((aspect) => aspect.orb <= aspect.maxOrb * ASPECT_STRONG_FRACTION)
    .map((aspect) => {
      // Applying when the orb is closing: compared an hour later (at birth, both bodies move).
      const position = moving.find((item) => item.name === aspect.first);
      const second = chart.positions.find((item) => item.name === aspect.second);
      const target = birth ? positionAngleAtTime(second, anchorOffset + 60) : natal.find((item) => item.name === aspect.second).angle;
      const later = Math.abs(angularDistance(positionAngleAtTime(position, anchorOffset + 60), target) - aspect.angle);
      return { ...aspect, applying: later < aspect.orb, glyphFirst: glyphOf(aspect.first), glyphSecond: glyphOf(aspect.second) };
    })
    .sort((a, b) => a.orb / a.maxOrb - b.orb / b.maxOrb);

  // Human Design: the moment's gates (a transit's Personality side, or a full chart's
  // both), and what they complete with the natal chart.
  const momentHd = cycleMomentHd(chart, anchorOffset, reading);
  const natalHd = computeHumanDesignChart(chart, 0);
  const composite = computeCycleHumanDesign(chart, anchorOffset, reading === "full");
  const natalChannels = birth ? hdStructureFromGates(hdActiveGates(chart)).definedChannels : [];
  const natalGates = hdActiveGates(chart);
  const side = (set, design) => set.filter((influence) => influence.gate != null)
    .map((influence) => ({ planet: influence.planet, glyph: glyphOf(influence.planet), gate: influence.gate, line: influence.line, natal: natalGates.has(influence.gate), design }));
  const gates = [...side(momentHd.personality, false), ...(reading === "full" && !birth ? side(momentHd.design, true) : [])];

  // Gene Keys: every sphere's natal Key and the Key its planet transits at the moment.
  const spheres = GENE_KEYS_ALL_SPHERES.filter((sphere) => sphere.set).map((sphere) => {
    const influence = momentHd[sphere.set].find((item) => item.planet === sphere.planet);
    return { sphere, natal: geneKeysGateLabel(sphere, natalHd), moment: influence?.label ? `${influence.gate}.${influence.line}` : "—", gate: influence?.gate ?? null };
  });
  const natalKeys = new Set(spheres.map(({ natal: label }) => Number(label.split(".")[0])).filter(Boolean));

  // Astrocartography: only with a place, and an exact time (the lines turn with the Earth).
  let map = null;
  if (place && !omit) {
    const lines = acgTravelLines(chart, anchorOffset);
    map = {
      zones: acgZenithZonesAt(lines, place.lat, place.lon),
      crossings: acgNearestIntersections(acgLineIntersections(lines), place.lat, place.lon, ACG_LOCATION_ROWS),
      lines: acgNearestLines(lines, place.lat, place.lon, ACG_LOCATION_ROWS),
    };
  }
  const data = { birth, reading, cast, transits, gates, composite, natalChannels, spheres, natalKeys, map };
  cycleSummaryCache.set(key, data);
  return data;
}

function renderCycleSummary(surface, context) {
  const { chart } = context;
  const moment = cycleAcgMoment();
  const place = moment?.place || null;
  const data = cycleSummaryData(context, place);
  const precision = context.range && LIFE_PRECISION_NOTES[context.range.precision];
  const card = (eyebrow, count, body, extra = "") => `<section class="cycle-summary-card${extra}"><div class="system-toolbar"><span class="eyebrow">${eyebrow}</span>${count != null ? `<span class="sample-badge">${count}</span>` : ""}</div><div class="cycle-summary-body">${body}</div></section>`;
  const empty = (text) => `<p class="cycle-summary-empty">${text}</p>`;
  const who = escapeHtml(chart.name);

  // Astrology
  const astrology = data.transits.length
    ? `<ol class="cycle-summary-list">${data.transits.map((aspect) => {
        const meaning = ASPECT_MEANINGS[aspect.name];
        const theme = (body) => ASPECT_BODY_THEMES[body] || body.toLowerCase();
        const first = data.birth ? `${who}'s ${escapeHtml(aspect.first)}` : `The moment's ${escapeHtml(aspect.first)}`;
        const sentence = meaning ? `${first} (${escapeHtml(theme(aspect.first))}) and ${data.birth ? "" : `${who}'s natal `}${escapeHtml(aspect.second)} (${escapeHtml(theme(aspect.second))}) ${meaning.join}.` : "";
        return `<li class="cycle-summary-aspect">
          <div class="cycle-summary-row"><span><b>${aspect.glyphFirst}</b> ${escapeHtml(aspect.first)} <b style="color:${aspect.color}">${aspect.glyph}</b> ${escapeHtml(aspect.name.toLowerCase())}${data.birth ? "" : " natal"} <b>${aspect.glyphSecond}</b> ${escapeHtml(aspect.second)}</span><small>${aspect.orb.toFixed(1)}° · ${aspect.applying ? "applying" : "separating"}</small></div>
          <p>${sentence}${meaning ? ` <span class="cycle-summary-nature">${escapeHtml(meaning.nature)}</span>` : ""}</p>
        </li>`;
      }).join("")}</ol><p class="cycle-summary-foot">Within a fifth of each aspect's orb, strongest first. Applying: still building toward exact; separating: past exact, fading. Aspects follow the aspect filters of the Astrology tab.${data.birth ? "" : ` The moment's angles are cast for ${escapeHtml(cycleCastPlace(context).place?.name || chart.location || "the birthplace")}.`}</p>`
    : empty(data.birth ? "No natal aspect is within a fifth of its orb (with the aspects currently shown in the Astrology tab)." : "No planet at this moment is within a fifth of its orb of an aspect to the natal chart (with the aspects currently shown in the Astrology tab).");

  // Human Design
  const { composite } = data;
  const centerName = (id) => HD_CENTERS.find((center) => center.id === id)?.name || id;
  const humanDesign = data.birth ? `
    <div class="cycle-summary-gates">${data.gates.map((gate) => `<span class="cycle-summary-gate" title="${escapeHtml(gate.planet)} (Personality): gate ${gate.gate}, line ${gate.line}"><b>${gate.glyph}</b>${gate.gate}.${gate.line}</span>`).join("")}</div>
    <p class="cycle-summary-foot">The Personality gates at birth (the Design gates come from about 88 days before).</p>
    <span class="eyebrow cycle-info-subhead">CHANNELS DEFINED AT BIRTH · ${data.natalChannels.length}</span>
    ${hdChannelListMarkup(data.natalChannels)}` : `
    <div class="cycle-summary-gates">${data.gates.map((gate) => `<span class="cycle-summary-gate${gate.natal ? " natal" : ""}${gate.design ? " design" : ""}" title="${escapeHtml(gate.planet)}${data.reading === "full" ? ` (${gate.design ? "Design" : "Personality"})` : ""}: gate ${gate.gate}, line ${gate.line}${gate.natal ? " (also active in the natal chart)" : ""}"><b>${gate.glyph}</b>${gate.gate}.${gate.line}</span>`).join("")}</div>
    <p class="cycle-summary-foot">${data.reading === "full" ? "The moment as a full chart: its Personality gates, then its Design gates (in the Design color)" : "The moment's planets (a transit: its Personality side) and the gates they activate"}; outlined ones are active natally too.</p>
    <div class="system-stat"><span>DEFINED ONLY WITH THE MOMENT</span><strong>${composite.newlyDefinedCenters.length ? composite.newlyDefinedCenters.map(centerName).join(", ") : "No new centers"}</strong></div>
    <span class="eyebrow cycle-info-subhead">CHANNELS THE MOMENT COMPLETES · ${composite.cycleChannels.length}</span>
    ${hdChannelListMarkup(composite.cycleChannels)}`;

  // Gene Keys
  const geneKeys = data.birth ? `<table class="cycle-summary-keys"><thead><tr><th>SPHERE</th><th>KEY</th><th></th></tr></thead><tbody>${data.spheres.map(({ sphere, natal }) => {
    const key = GENE_KEYS[Number(natal.split(".")[0])];
    return `<tr><td>${escapeHtml(sphere.name)}</td><td title="${key ? escapeHtml(key.summary) : ""}"><strong>${natal}</strong></td><td>${key ? `${escapeHtml(key.shadow)} → ${escapeHtml(key.gift)} → ${escapeHtml(key.siddhi)}` : ""}</td></tr>`;
  }).join("")}</tbody></table><p class="cycle-summary-foot">The natal Gene Keys: Shadow → Gift → Siddhi (hover for what each is about).</p>` : `<table class="cycle-summary-keys"><thead><tr><th>SPHERE</th><th>NATAL</th><th>MOMENT</th><th></th></tr></thead><tbody>${data.spheres.map(({ sphere, natal, moment: label, gate }) => {
    const key = gate != null ? GENE_KEYS[gate] : null;
    const echo = gate != null && data.natalKeys.has(gate);
    return `<tr${echo ? ' class="echo"' : ""}><td>${escapeHtml(sphere.name)}</td><td>${natal}</td><td title="${key ? escapeHtml(key.summary) : ""}"><strong>${label}</strong></td><td>${key ? `${escapeHtml(key.shadow)} → ${escapeHtml(key.gift)} → ${escapeHtml(key.siddhi)}` : ""}</td></tr>`;
  }).join("")}</tbody></table><p class="cycle-summary-foot">Each sphere's planet at the moment, as a Gene Key: its Shadow → Gift → Siddhi (hover for what it's about). Highlighted Keys are also among the natal ones.</p>`;

  // Astrocartography
  let astrocartography;
  if (!place) {
    astrocartography = empty(context.now ? "No place chosen for now. Choose one under Cast for, in the Astrology tab, to read the planetary lines there." : context.occurrence ? "This cycle has no place yet. Annotate it in the Life Timeline with where you were, to read the lines there." : "This moment has no place. Add one to the event to read the planetary lines there.");
  } else if (context.omit) {
    astrocartography = empty(`${escapeHtml(place.name || lifeUnnamedPlace(place))}: the planetary lines depend on the exact time of day, so they need the moment's time to be read.`);
  } else {
    const { map } = data;
    const location = { lat: place.lat, lon: place.lon };
    const block = (title, items) => items.length ? `<div class="cycle-summary-reading"><span class="eyebrow">${title}</span>${items.join("")}</div>` : "";
    astrocartography = `<p class="cycle-summary-place">⌖ ${escapeHtml(place.name || lifeUnnamedPlace(place))}</p>
      ${block("ZENITH", map.zones.map(({ line, km }) => `<div class="cycle-summary-tip">${acgZenithTipHtml(line, km)}</div>`))}
      ${block("NEAREST LINES", map.lines.map(({ line, km }) => `<div class="cycle-summary-tip">${acgLineTipHtml(line, km, location)}</div>`))}
      ${block("NEAREST CROSSINGS", map.crossings.map(({ crossing, km }) => `<div class="cycle-summary-tip">${acgCrossingTipHtml(crossing, km, location)}</div>`))}`;
  }

  surface.innerHTML = `<div class="cycle-summary">
    ${precision ? `<p class="cycle-summary-precision">${escapeHtml(precision)}</p>` : ""}
    <div class="cycle-summary-grid">
      ${card(data.birth ? "ASTROLOGY · TIGHT NATAL ASPECTS" : "ASTROLOGY · TIGHT TRANSITS TO THE NATAL CHART", data.transits.length, astrology)}
      ${card(`HUMAN DESIGN · GATES AND CHANNELS${data.birth ? "" : data.reading === "full" ? " · FULL CHART" : " · TRANSIT"}`, !data.birth && composite.cycleChannels.length ? `${composite.cycleChannels.length} new channel${composite.cycleChannels.length === 1 ? "" : "s"}` : null, humanDesign)}
      ${card(data.birth ? "GENE KEYS · NATAL" : `GENE KEYS · NATAL AND AT THE MOMENT · ${data.reading === "full" ? "FULL CHART" : "TRANSIT"}`, null, geneKeys)}
      ${card(data.birth ? "ASTROCARTOGRAPHY · AT THE BIRTHPLACE" : "ASTROCARTOGRAPHY · AT THE MOMENT'S PLACE", null, astrocartography)}
    </div>
  </div>`;
}
