// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Browsing life events by tag: every dated moment with a tag, each with the planets in
// tight aspect to the natal chart at that moment (within a fifth of the aspect's orb, as
// in the Cycle Explorer's Summary), and the transits that recur across those moments —
// "Saturn met the natal Sun in 3 of 5 career moments". By default only the slow planets
// count (Jupiter outward, Chiron and the Nodes): the fast ones return to everything often
// enough to recur by chance. A checkbox includes them all.
// How precisely a moment is dated limits what can be read from it:
//   exact time: every body;  date only: not the Moon or the angles;
//   month only: Saturn and slower;  year only: too loose for tight aspects.
// Used by the Chart Explorer's Life Events tab and the Pair Explorer's Life Events tab.
// Nothing is stored: computed when shown, kept in memory while the app is open.

const LIFE_PATTERN_SLOW_BODIES = new Set(["Jupiter", "Saturn", "Chiron", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]);
const LIFE_PATTERN_MONTH_BODIES = new Set(["Saturn", "Chiron", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]);
const lifePatternOptions = { includeFast: false };
const lifeTransitCache = new Map();

// The tight transits to `chart` at `record`'s moment (a period: its start):
// { transits: [aspect…] } or { skip: "birth" | "loose" | "undated" }.
function lifeMomentTransits(chart, record) {
  if (!record.start) return { skip: "undated" };
  if (isBirthRecord(record) || (record.anchor?.birth && record.anchor.chartId === chart.id)) return { skip: "birth" };
  const range = lifeMomentRange(record, "start", chart);
  if (!range || range.precision === "year") return { skip: "loose" };
  const hidden = ASPECT_DEFINITIONS.filter((definition) => !aspectVisible(definition.name)).map((definition) => definition.name).join(",");
  const key = [chart.id, chart.positions[0]?.birthMoment, range.mid.getTime(), range.precision, hidden, EPHEMERIS_ENGINE, LUNAR_NODE_MODE].join("|");
  if (lifeTransitCache.has(key)) return lifeTransitCache.get(key);
  const offset = (range.mid.getTime() - chartBirthMomentUTC(chart).getTime()) / 60000;
  const readable = (position) => range.precision === "time" ? true
    : range.precision === "day" ? position.name !== "Moon" && !LIFE_TIME_OF_DAY_BODIES.has(position.name)
    : LIFE_PATTERN_MONTH_BODIES.has(position.name);
  const at = (minutes) => (position) => ({ ...position, angle: positionAngleAtTime(position, minutes) });
  const glyphOf = (name) => chart.positions.find((position) => position.name === name)?.glyph || "";
  const transits = calculateCrossAspects(chart.positions.filter(readable).map(at(offset)), chart.positions.map(at(0)))
    .filter((aspect) => aspect.orb <= aspect.maxOrb * ASPECT_STRONG_FRACTION)
    .map((aspect) => ({ ...aspect, glyphFirst: glyphOf(aspect.first), glyphSecond: glyphOf(aspect.second) }))
    .sort((a, b) => a.orb / a.maxOrb - b.orb / b.maxOrb);
  const result = { transits, precision: range.precision };
  lifeTransitCache.set(key, result);
  return result;
}
// The transits a pattern counts: the slow planets only, unless the fast ones are included.
function lifePatternTransits(reading) {
  return (reading.transits || []).filter((aspect) => lifePatternOptions.includeFast || LIFE_PATTERN_SLOW_BODIES.has(aspect.first));
}

// Every tag among `records`, with how many records have it, most used first.
function lifeTagCounts(records) {
  const counts = new Map();
  records.forEach((record) => new Set(record.tags).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// The transits recurring across `records` (a transiting planet meeting the same natal
// point, by any tight aspect) in at least two of them:
// { readable: n, patterns: [{ first, second, glyphs…, count, aspects: Map(name → n), titles }] }.
function lifeTagPatterns(chart, records) {
  const found = new Map();
  let readable = 0;
  records.forEach((record) => {
    const reading = lifeMomentTransits(chart, record);
    if (!reading.transits) return;
    readable += 1;
    const seen = new Set();
    lifePatternTransits(reading).forEach((aspect) => {
      const key = `${aspect.first}|${aspect.second}`;
      if (!found.has(key)) found.set(key, { first: aspect.first, second: aspect.second, glyphFirst: aspect.glyphFirst, glyphSecond: aspect.glyphSecond, count: 0, aspects: new Map(), titles: [] });
      const pattern = found.get(key);
      pattern.aspects.set(aspect.name, (pattern.aspects.get(aspect.name) || 0) + 1);
      if (seen.has(key)) return; // (two aspects between the same pair in one moment count once)
      seen.add(key);
      pattern.count += 1;
      pattern.titles.push(lifeEventTitle(record));
    });
  });
  const patterns = [...found.values()].filter((pattern) => pattern.count >= 2)
    .sort((a, b) => b.count - a.count || (LIFE_PATTERN_SLOW_BODIES.has(b.first) - LIFE_PATTERN_SLOW_BODIES.has(a.first)));
  return { readable, patterns };
}

// One transit, compact: "♄ □ ☉ 1.2°" with its full name in the tooltip.
function lifeTransitChipMarkup(aspect) {
  return `<span class="life-transit" title="${escapeHtml(t('{first} {aspect} natal {second}, {orb}° from exact', { first: tName(aspect.first), aspect: tName(aspect.name).toLowerCase(), second: tName(aspect.second), orb: aspect.orb.toFixed(1) }))}"><b>${aspect.glyphFirst}</b><b style="color:${aspect.color}">${aspect.glyph}</b><b>${aspect.glyphSecond}</b>${aspect.orb.toFixed(1)}°</span>`;
}
// Why a moment has no transits listed.
const LIFE_TRANSIT_SKIP_NOTES = {
  birth: t("The natal chart itself"),
  loose: t("Dated to the year only: too loose for tight aspects"),
  undated: t("No date"),
};
// A moment's tight transits as chips (the counted ones only), or why there are none.
function lifeMomentTransitsMarkup(chart, record) {
  const reading = lifeMomentTransits(chart, record);
  if (!reading.transits) return `<span class="life-transit-note">${LIFE_TRANSIT_SKIP_NOTES[reading.skip]}</span>`;
  const transits = lifePatternTransits(reading);
  const limit = { day: t("date only: without the Moon"), month: t("month only: Saturn and slower") }[reading.precision];
  return transits.length
    ? `${transits.map(lifeTransitChipMarkup).join("")}${limit ? `<span class="life-transit-note">${limit}</span>` : ""}`
    : `<span class="life-transit-note">${lifePatternOptions.includeFast ? t("No transit within a fifth of its orb") : t("No slow-planet transit within a fifth of its orb")}${limit ? ` (${limit})` : ""}</span>`;
}

// The recurring patterns among `records` for `chart`, in reflective sentences.
function lifeTagPatternsMarkup(chart, records, tag) {
  const { readable, patterns } = lifeTagPatterns(chart, records);
  const who = escapeHtml(chart.name);
  const label = `“${escapeHtml(tag)}”`;
  const theme = (body) => escapeHtml(ASPECT_BODY_THEMES[body] || tName(body).toLowerCase());
  // The moments left out, and why (birth, a year-only date, no date).
  const left = records.map((record) => [record, lifeMomentTransits(chart, record).skip]).filter(([, skip]) => skip);
  const leftNote = left.length ? `<p class="life-pattern-left">${t("Not counted: {moments}.", { moments: left.map(([record, skip]) => `${escapeHtml(lifeEventTitle(record))} (${{ birth: t("the natal chart itself"), loose: t("year only"), undated: t("no date") }[skip]})`).join(", ") })}</p>` : "";
  if (readable < 2) {
    return `<p class="life-pattern-empty">${readable ? t("Only one {tag} moment of {who} is dated closely enough to read transits from. Patterns need at least two.", { tag: label, who }) : t("No {tag} moment of {who} is dated closely enough to read transits from. Patterns need at least two.", { tag: label, who })}</p>${leftNote}`;
  }
  if (!patterns.length) {
    return `<p class="life-pattern-empty">${t(lifePatternOptions.includeFast ? "Nothing recurs across the {count} {tag} moments of {who}: no planet met the same natal point in two of them. Each may have its own story." : "Nothing recurs across the {count} {tag} moments of {who}: no slow planet met the same natal point in two of them. Each may have its own story.", { count: readable, tag: label, who })}</p>${leftNote}`;
  }
  return `${leftNote}<ol class="life-pattern-list">${patterns.map((pattern) => {
    const aspects = [...pattern.aspects].map(([name, n]) => `${tName(name).toLowerCase()}${n > 1 ? ` ×${n}` : ""}`).join(", ");
    return `<li>
      <div class="life-pattern-row"><span><b>${pattern.glyphFirst}</b> ${escapeHtml(tName(pattern.first))} → ${t("natal")} <b>${pattern.glyphSecond}</b> ${escapeHtml(tName(pattern.second))}</span><strong>${t("{count} of {total}", { count: pattern.count, total: readable })}</strong></div>
      <p>${t("In {count} of the {total} {tag} moments of {who}, {first} ({firstTheme}) was touching the natal {second} ({secondTheme}) — {aspects}. Does that theme run through them?", { count: pattern.count, total: readable, tag: label, who, first: escapeHtml(tName(pattern.first)), firstTheme: theme(pattern.first), second: escapeHtml(tName(pattern.second)), secondTheme: theme(pattern.second), aspects: escapeHtml(aspects) })}</p>
      <small>${pattern.titles.map(escapeHtml).join(" · ")}</small>
    </li>`;
  }).join("")}</ol>`;
}
// The checkbox for fast planets, and the explanation under the patterns.
function lifePatternControlsMarkup() {
  return `<label class="acg-filter" title="${t("The Sun, Moon, Mercury, Venus and Mars return to every point often, so they recur by chance more easily")}"><input type="checkbox" data-life-pattern-fast ${lifePatternOptions.includeFast ? "checked" : ""}><span>${t("Include fast planets")}</span></label>`;
}
const LIFE_PATTERN_FOOT = t("A pattern is a transiting planet within a fifth of its orb of the same natal point in at least two moments (by any aspect shown in the Astrology tab). With few moments, coincidence is likely: read them as questions, not conclusions.");

// Studies `record`'s moment for `chart` in the Cycle Explorer (a period: its start).
function openInCycleExplorer(chart, record) {
  cycleChartId = chart.id;
  if (isBirthRecord(record)) {
    cycleEventAnchor = { birth: true };
  } else if (record.cycle) {
    activeCycleKey = record.anchor.cycle;
    activeOccurrenceIndex = record.anchor.n - 1;
    cycleEventAnchor = null;
  } else {
    cycleEventAnchor = { eventId: record.id, part: "start" };
  }
  setView("cycle");
}
