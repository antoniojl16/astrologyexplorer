// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Importing charts from a CSV exported by another Human Design app, with the columns
//   Name, Date (YYYY-MM-DD), Time (HH:MM:SS, or UTC with a trailing Z), Timezone, City, Country
// e.g. "Julia,1982-06-28,05:00:00,GMT+2,Frankfurt am Main (Hesse),DE". Nothing is saved
// before a review table has been seen:
//   - each city is matched in the place list (name, region in brackets, country code),
//     which gives its coordinates and time zone; any match can be changed by searching;
//   - the UTC offset is the place's own for that date, from the app's time zone history
//     (daylight saving, historical zones). The file's offset is shown next to it, and
//     where they differ either can be chosen per row (the app's by default): exports of
//     that kind often carry an offset that isn't the one in force at the birth;
//   - rows that look like charts already in the workspace (same name and date) start
//     unticked, as do rows that couldn't be read or placed.
// Imported charts get the tag "imported"; a chart whose time was converted (a UTC time,
// or the file's offset chosen) says so in its notes.
// Used by Import workspace (app.js) when the chosen file is a .csv.

const CSV_IMPORT_TAG = "imported";
// Abbreviations such exports use, in minutes east of UTC.
const CSV_ZONE_ABBREVIATIONS = { GMT: 0, UTC: 0, UT: 0, Z: 0, WET: 0, BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, HST: -600, IST: 330, JST: 540, AEST: 600, AEDT: 660 };

// Rows of fields from CSV text: quoted fields (with "" for a quote), commas and newlines.
function csvParse(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const source = String(text).replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}
// "GMT+2" → 120, "GMT-3:30" → −210, "CST" → −360; null when it can't be read.
function csvZoneOffset(text) {
  const value = String(text || "").trim().toUpperCase();
  if (!value) return null;
  const match = /^(?:GMT|UTC|UT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/.exec(value);
  if (match) return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
  return value in CSV_ZONE_ABBREVIATIONS ? CSV_ZONE_ABBREVIATIONS[value] : null;
}
function csvOffsetLabel(minutes) {
  if (minutes == null) return "—";
  if (minutes === 0) return "GMT";
  const sign = minutes < 0 ? "−" : "+", size = Math.abs(minutes);
  return `GMT${sign}${Math.floor(size / 60)}${size % 60 ? `:${String(size % 60).padStart(2, "0")}` : ""}`;
}
// The place list entry for "Frankfurt am Main (Hesse)" in DE: the same name (and region,
// when given) first, then the same name, then the best search result.
function csvMatchPlace(cityText, country) {
  const text = String(cityText || "").trim();
  const bracket = /^(.*?)\s*\((.*)\)\s*$/.exec(text);
  const [name, region] = bracket ? [bracket[1], bracket[2]] : [text.split(",")[0], text.split(",").slice(1).join(",")];
  if (!name.trim()) return { place: null, how: "none" };
  const code = String(country || "").trim().toLowerCase();
  const results = searchPlaces(code ? `${name}, ${code}` : name);
  const folded = placeFold(name), foldedRegion = placeFold(region || "");
  const sameName = results.filter((place) => place.folded.includes(folded));
  const sameRegion = foldedRegion && sameName.find((place) => { const own = placeFold(place.region || ""); return own === foldedRegion || own.startsWith(foldedRegion) || foldedRegion.startsWith(own); });
  if (sameRegion) return { place: sameRegion, how: "exact" };
  if (sameName.length) return { place: sameName[0], how: foldedRegion ? "name" : "exact" };
  return results.length ? { place: results[0], how: "guess" } : { place: null, how: "none" };
}
// A place as a chart's birthplace fields.
function csvPlaceFields(place) {
  return { timezone: place.zone, location: placeLabel(place), latitude: Number(place.lat).toFixed(4), longitude: Number(place.lon).toFixed(4) };
}
// The UTC offset (minutes) the app uses at that wall time and place (chartBirthMomentUTC).
function csvAppOffset(date, time, place) {
  const wall = Date.parse(`${date}T${time || "12:00"}:00Z`);
  const utc = chartBirthMomentUTC({ birthDate: date, birthTime: time || "12:00", ...csvPlaceFields(place) }).getTime();
  return Math.round((wall - utc) / 60000);
}
// The wall date and time at `place` for a UTC instant, as the app converts them back.
function csvWallFor(instant, place) {
  let wall = instant;
  for (let pass = 0; pass < 4; pass += 1) {
    const iso = new Date(wall).toISOString();
    const utc = chartBirthMomentUTC({ birthDate: iso.slice(0, 10), birthTime: iso.slice(11, 16), ...csvPlaceFields(place) }).getTime();
    wall += instant - utc;
  }
  const iso = new Date(Math.round(wall / 60000) * 60000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

// One file row → { name, date, time, utc (time given in UTC), zoneText, fileOffset,
// cityText, country, place, how, appOffset, choice, include, problem, duplicate }.
function csvReadRows(text) {
  const [header, ...lines] = csvParse(text);
  if (!header) return { error: "The file is empty." };
  const column = (name) => header.findIndex((cell) => cell.trim().toLowerCase() === name);
  const at = { name: column("name"), date: column("date"), time: column("time"), zone: column("timezone"), city: column("city"), country: column("country") };
  if ([at.name, at.date, at.city].some((index) => index < 0)) return { error: "This CSV needs at least the columns Name, Date and City (with Time, Timezone and Country)." };
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const existing = new Set(workspace.chartIds.map(chartById).filter(Boolean).map((chart) => `${chart.name.trim().toLowerCase()}|${chart.birthDate}`));
  const rows = lines.map((cells) => {
    const cell = (index) => (index >= 0 ? String(cells[index] ?? "").trim() : "");
    const row = { name: cell(at.name) || "Unnamed chart", date: cell(at.date), time: "", utc: false, zoneText: cell(at.zone), cityText: cell(at.city), country: cell(at.country), choice: "app", include: true, problem: "" };
    const year = Number(row.date.slice(0, 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T12:00:00Z`)) || year < 1000 || year > 2999) row.problem = "The date isn't a valid YYYY-MM-DD between 1000 and 2999.";
    const time = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z)?$/i.exec(cell(at.time));
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
      row.time = `${time[1].padStart(2, "0")}:${time[2]}`;
      row.utc = !!time[3];
    } else if (cell(at.time)) row.problem ||= "The time can't be read.";
    row.fileOffset = row.utc ? 0 : csvZoneOffset(row.zoneText);
    Object.assign(row, csvMatchPlace(row.cityText, row.country));
    if (!row.place) row.problem ||= "The place wasn't found: search for it.";
    row.duplicate = existing.has(`${row.name.toLowerCase()}|${row.date}`);
    row.include = !row.problem && !row.duplicate;
    csvRefreshOffset(row);
    return row;
  });
  return { rows };
}
function csvRefreshOffset(row) {
  row.appOffset = row.place && !row.problem.startsWith("The date") ? csvAppOffset(row.date, row.time, row.place) : null;
}
// The chart a row becomes, with the choice of offset applied.
function csvChartFields(row) {
  const wall = Date.parse(`${row.date}T${row.time || "12:00"}:00Z`);
  const offset = row.utc ? 0 : row.choice === "file" && row.fileOffset != null ? row.fileOffset : null;
  const moment = offset == null ? { date: row.date, time: row.time } : csvWallFor(wall - offset * 60000, row.place);
  const notes = [];
  if (row.utc) notes.push(`Imported from CSV: born ${row.date} ${row.time} UTC, stored as ${moment.date} ${moment.time} local time.`);
  else if (offset != null && offset !== row.appOffset) notes.push(`Imported from CSV: born ${row.date} ${row.time} ${csvOffsetLabel(row.fileOffset)} (the file's offset; this place's own for that date is ${csvOffsetLabel(row.appOffset)}), stored as ${moment.time} local time.`);
  return { name: row.name, birthDate: moment.date, birthTime: moment.time, ...csvPlaceFields(row.place), uncertainty: 0, tags: [CSV_IMPORT_TAG], noteText: notes.join("\n"), notes: notes.length ? 1 : 0 };
}

// ── The review dialog ─────────────────────────────────────────────────────
function csvImportDialog() {
  let dialog = document.getElementById("csvImportDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "csvImportDialog";
  dialog.className = "csv-import-dialog";
  dialog.innerHTML = `<div>
    <div class="dialog-head"><div><p class="eyebrow accent-label">IMPORT CHARTS</p><h2>Review the charts</h2></div><button type="button" class="close-button" data-csv-close aria-label="Close">×</button></div>
    <p class="dialog-copy">Each place was matched in the place list; change any by searching. The UTC offset is the place's own for that date, from its time zone history. Where the file's offset differs it's highlighted, and either can be chosen. Imported charts are tagged “${CSV_IMPORT_TAG}”.</p>
    <div class="csv-import-table-wrap"><table class="csv-import-table"><thead><tr><th><input type="checkbox" data-csv-all aria-label="Import all"></th><th>NAME</th><th>BORN</th><th>PLACE</th><th>UTC OFFSET</th><th></th></tr></thead><tbody data-csv-rows></tbody></table></div>
    <div class="dialog-actions"><button type="button" class="secondary-button" data-csv-close>Cancel</button><button type="button" class="primary-button" data-csv-import>Import</button></div>
  </div>`;
  document.body.appendChild(dialog);
  return dialog;
}
async function openCsvImport(text) {
  if (!placeIndex) {
    showToast("Loading places…");
    const loaded = new Promise((resolve) => window.addEventListener("orbital-places-loaded", resolve, { once: true }));
    loadPlaces();
    await loaded;
  }
  const read = csvReadRows(text);
  if (read.error) return showToast(read.error);
  if (!read.rows.length) return showToast("No charts in that file");
  const { rows } = read;
  const dialog = csvImportDialog();
  const body = dialog.querySelector("[data-csv-rows]");
  const importButton = dialog.querySelector("[data-csv-import]");
  const all = dialog.querySelector("[data-csv-all]");
  const draw = () => {
    body.innerHTML = rows.map((row, index) => {
      const differs = !row.utc && row.fileOffset != null && row.appOffset != null && row.fileOffset !== row.appOffset;
      const offset = row.utc
        ? `<span title="The file gives the time in UTC">UTC time → ${csvOffsetLabel(row.appOffset)}</span>`
        : differs
          ? `<label class="csv-choice"><input type="radio" name="csv-offset-${index}" value="app" data-csv-offset="${index}" ${row.choice === "app" ? "checked" : ""}>${csvOffsetLabel(row.appOffset)} <small>place's history</small></label><label class="csv-choice"><input type="radio" name="csv-offset-${index}" value="file" data-csv-offset="${index}" ${row.choice === "file" ? "checked" : ""}>${csvOffsetLabel(row.fileOffset)} <small>file (${escapeHtml(row.zoneText)})</small></label>`
          : `${csvOffsetLabel(row.appOffset)}${row.fileOffset == null && row.zoneText ? ` <small title="The file's “${escapeHtml(row.zoneText)}” can't be read">file: ${escapeHtml(row.zoneText)}</small>` : ""}`;
      const how = { exact: "", name: "matched by name (another region)", guess: "closest match: check it" }[row.how] || "";
      const note = row.problem || (row.duplicate ? "Already in this workspace (same name and date)" : how);
      return `<tr class="${row.include ? "" : "skipped"}${differs ? " differs" : ""}">
        <td><input type="checkbox" data-csv-include="${index}" ${row.include ? "checked" : ""} ${row.problem ? "disabled" : ""} aria-label="Import ${escapeHtml(row.name)}"></td>
        <td>${escapeHtml(row.name)}</td>
        <td class="csv-born">${escapeHtml(row.date)} ${escapeHtml(row.time || "(no time)")}</td>
        <td class="csv-place"><span title="${escapeHtml(`${row.cityText}, ${row.country}`)}">${row.place ? escapeHtml(placeLabel(row.place)) : `<i>${escapeHtml(row.cityText)}</i>`}</span><span class="csv-place-find"><input type="search" data-csv-place="${index}" placeholder="Change…" aria-label="Search for ${escapeHtml(row.name)}'s birthplace"></span></td>
        <td class="csv-offset">${offset}</td>
        <td class="csv-note">${escapeHtml(note)}</td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-csv-place]").forEach((input) => bindPlaceSearch(input, (place) => {
      const row = rows[Number(input.dataset.csvPlace)];
      row.place = place;
      row.how = "exact";
      if (row.problem.startsWith("The place")) { row.problem = ""; row.include = !row.duplicate; }
      csvRefreshOffset(row);
      draw();
    }));
    const count = rows.filter((row) => row.include).length;
    importButton.textContent = `Import ${count} chart${count === 1 ? "" : "s"}`;
    importButton.disabled = !count;
    const choosable = rows.filter((row) => !row.problem);
    all.checked = choosable.length > 0 && choosable.every((row) => row.include);
    all.indeterminate = count > 0 && !all.checked;
  };
  body.onchange = (event) => {
    const include = event.target.dataset.csvInclude, offset = event.target.dataset.csvOffset;
    if (include != null) rows[Number(include)].include = event.target.checked;
    else if (offset != null) rows[Number(offset)].choice = event.target.value;
    else return;
    draw();
  };
  all.onchange = () => { rows.forEach((row) => { if (!row.problem) row.include = all.checked; }); draw(); };
  dialog.querySelectorAll("[data-csv-close]").forEach((button) => { button.onclick = () => dialog.close(); });
  importButton.onclick = () => {
    const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
    const chosen = rows.filter((row) => row.include && row.place && !row.problem);
    chosen.forEach((row, index) => {
      const chart = makeChart(index, { id: `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...csvChartFields(row), createdAt: Date.now() });
      state.charts.push(chart);
      workspace.chartIds.push(chart.id);
    });
    saveState();
    dialog.close();
    renderRows();
    const converted = chosen.filter((row) => row.utc || (row.choice === "file" && row.fileOffset !== row.appOffset)).length;
    showToast(`${chosen.length} chart${chosen.length === 1 ? "" : "s"} imported into ${state.activeWorkspace}, tagged “${CSV_IMPORT_TAG}”${converted ? ` · ${converted} with a converted time (see their notes)` : ""}`);
  };
  draw();
  dialog.showModal();
}
