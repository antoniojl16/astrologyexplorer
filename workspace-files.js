// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
// Workspace files: exporting the charts selected in the library, and importing a
// workspace file (whole or selected) with its duplicates reviewed first.
//
// Export selected: the same file as Export workspace, with only those charts and,
// optionally, their life events (events, places, Birth and cycle annotations) and their
// notes and tags. An event shared with a chart that isn't exported is left out unless
// asked for; then that person is kept by name only.
//
// Import: a chart already in the workspace — the same id (a file exported from here) or
// the same name and birth date — is a duplicate, and each one can be
//   skipped:  the chart here stays as it is; the file's events about it alone are left
//             out, and shared ones (with a chart that is imported) link to it;
//   replaced: the chart here takes the file's details (birth data, notes, tags…) and
//             keeps its identity; the file's life events are added to its own, without
//             doubling the ones already here. Nothing is deleted, and what a file was
//             exported without (notes and tags) stays as it is here;
//   copied:   imported as a chart of its own, as if new.
// Skipping is the default. Files without duplicates import straight away.

// ── Export selected ─────────────────────────────────────────────────────────
// The records of `charts` (ids) in `workspace`, split into their own ones and those
// shared with a chart that isn't among them.
function selectedChartRecords(workspace, ids) {
  const own = [], shared = [];
  (workspace.events || []).forEach((event) => {
    if (event.anchor) { if (ids.has(event.anchor.chartId)) own.push(event); return; }
    if (!event.people.some((person) => ids.has(person.chartId))) return;
    (event.people.some((person) => person.chartId && !ids.has(person.chartId)) ? shared : own).push(event);
  });
  return { own, shared };
}
function openExportSelected() {
  const charts = selectedCharts();
  if (!charts.length) return;
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const ids = new Set(charts.map((chart) => chart.id));
  const { own, shared } = selectedChartRecords(workspace, ids);
  const others = [...new Set(shared.flatMap((event) => event.people.filter((person) => person.chartId && !ids.has(person.chartId)).map((person) => chartById(person.chartId)?.name || t("Unnamed"))))];
  const dialog = document.createElement("dialog");
  dialog.className = "transfer-dialog export-dialog";
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="eyebrow accent-label">${t("EXPORT")}</p><h2>${tn(charts.length, "Export {n} chart", "Export {n} charts")}</h2></div><button class="close-button" value="cancel" aria-label="${t("Close")}">×</button></div>
    <p class="dialog-copy">${charts.map((chart) => escapeHtml(chart.name)).join(", ")}. ${t("The file can be read back with Import workspace, here or in another browser.")}</p>
    <div class="export-options">
      <label class="acg-filter"><input type="checkbox" name="events" checked><span>${t("Include life events")} <small>${tn(own.length, "{n} record: events, places, Birth and cycle annotations", "{n} records: events, places, Birth and cycle annotations")}</small></span></label>
      ${shared.length ? `<label class="acg-filter export-shared"><input type="checkbox" name="shared"><span>${tn(shared.length, "Include {n} event shared with charts you're not exporting", "Include {n} events shared with charts you're not exporting")} <small>${t("with {names}, kept by name only: their names and these events' details go into the file", { names: escapeHtml(others.join(", ")) })}</small></span></label>` : ""}
      <label class="acg-filter"><input type="checkbox" name="notes" checked><span>${t("Include chart notes and tags")}</span></label>
    </div>
    <div class="dialog-actions"><button class="secondary-button" value="cancel">${t("Cancel")}</button><button class="primary-button" value="default">${t("Export")} <span>→</span></button></div></form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  const sharedBox = form.elements.shared;
  form.elements.events.addEventListener("change", () => { if (sharedBox) sharedBox.disabled = !form.elements.events.checked; });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    exportSelectedCharts(charts, { events: form.elements.events.checked, shared: !!sharedBox?.checked && form.elements.events.checked, notes: form.elements.notes.checked });
    dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}
function exportSelectedCharts(charts, options) {
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const ids = new Set(charts.map((chart) => chart.id));
  const { own, shared } = selectedChartRecords(workspace, ids);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const fileCharts = charts.map((chart) => {
    const item = copy(chart);
    if (!options.notes) Object.assign(item, { noteText: "", notes: 0, tags: [] });
    return item;
  });
  // A shared event keeps the people who aren't exported by name only.
  const nameOnly = (event) => ({ ...copy(event), people: event.people.map((person) => (person.chartId && !ids.has(person.chartId) ? { ...person, chartId: null, name: chartById(person.chartId)?.name || t("Unnamed person") } : { ...person })) });
  const events = options.events ? [...own.map(copy), ...(options.shared ? shared.map(nameOnly) : [])] : [];
  // `includes` says what was left out, so importing (Replace) doesn't take it for "empty".
  const data = { version: 2, exportedAt: new Date().toISOString(), workspace: state.activeWorkspace, selection: true, includes: { events: options.events, notes: options.notes, shared: options.shared }, charts: fileCharts, events };
  const slug = (text) => searchFold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "charts";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  link.download = `orbital-study-${slug(state.activeWorkspace)}-${charts.length === 1 ? slug(charts[0].name) : `${charts.length}-charts`}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(tn(charts.length, "{n} chart exported", "{n} charts exported") + (events.length ? ` · ${tn(events.length, "{n} life event record", "{n} life event records")}` : ""));
}

// ── Import, with duplicates reviewed ─────────────────────────────────────────
// `imported`: a parsed workspace file. Duplicates of charts in the active workspace
// open a review first; otherwise everything is imported at once.
function importWorkspaceFile(imported) {
  if (!Array.isArray(imported.charts)) throw new Error("No charts");
  const workspace = state.workspaces.find((item) => item.name === state.activeWorkspace);
  const here = workspace.chartIds.map(chartById).filter(Boolean);
  const entries = imported.charts.map((raw) => {
    // Everything from a file is cleaned first (sanitizeChart); charts without a usable birth date are skipped.
    const chart = sanitizeChart(raw, { fromFile: true });
    if (!chart) return null;
    const rawId = raw && raw.id != null ? String(raw.id) : null;
    const existing = here.find((item) => (rawId && item.id === rawId) || (searchFold(item.name).trim() === searchFold(chart.name).trim() && item.birthDate === chart.birthDate));
    return { raw, rawId, chart, existing: existing || null, choice: existing ? "skip" : "new" };
  }).filter(Boolean);
  const skipped = imported.charts.length - entries.length;
  const duplicates = entries.filter((entry) => entry.existing);
  if (!duplicates.length) return applyWorkspaceImport(imported, entries, workspace, skipped);
  openImportReview(imported, entries, workspace, skipped);
}
function openImportReview(imported, entries, workspace, skipped) {
  const duplicates = entries.filter((entry) => entry.existing);
  const fileEvents = Array.isArray(imported.events) ? imported.events : [];
  const fileCount = (entry) => fileEvents.filter((event) => event?.anchor ? String(event.anchor.chartId) === entry.rawId : (event?.people || []).some((person) => String(person?.chartId) === entry.rawId)).length;
  const hereCount = (chart) => (workspace.events || []).filter((event) => event.anchor ? event.anchor.chartId === chart.id : event.people.some((person) => person.chartId === chart.id)).length;
  const birth = (chart) => `${escapeHtml(chart.birthDate)} ${escapeHtml(chart.birthTime || t("(no time)"))}<br><span class="muted-text">${escapeHtml(chart.location || "")}</span>`;
  const dialog = document.createElement("dialog");
  dialog.className = "csv-import-dialog";
  const fresh = entries.length - duplicates.length;
  dialog.innerHTML = `<div>
    <div class="dialog-head"><div><p class="eyebrow accent-label">${t("IMPORT WORKSPACE")}</p><h2>${tn(duplicates.length, "{n} duplicate found", "{n} duplicates found")}</h2></div><button type="button" class="close-button" data-review-close aria-label="${t("Close")}">×</button></div>
    <p class="dialog-copy">${tn(duplicates.length, "{n} of the file's {total} charts is already in {workspace} (the same chart, or the same name and birth date).", "{n} of the file's {total} charts are already in {workspace} (the same chart, or the same name and birth date).", { total: entries.length, workspace: escapeHtml(workspace.name) })}${fresh ? ` ${tn(fresh, "The other {n} will be imported.", "The other {n} will be imported.")}` : ""} ${t("For each: <b>Skip</b> keeps the chart here as it is; <b>Replace</b> gives it the file's details and adds the file's life events to its own (nothing is deleted); <b>Copy</b> imports it as a separate chart.")}</p>
    <div class="import-review-all"><span>${t("All:")}</span><button type="button" class="acg-origin-button" data-review-all="skip">${t("Skip all")}</button><button type="button" class="acg-origin-button" data-review-all="replace">${t("Replace all")}</button><button type="button" class="acg-origin-button" data-review-all="copy">${t("Copy all")}</button></div>
    <div class="csv-import-table-wrap"><table class="csv-import-table"><thead><tr><th>${t("CHART")}</th><th>${t("IN THE FILE")}</th><th>${t("HERE")}</th><th>${t("LIFE EVENTS (FILE / HERE)")}</th><th>${t("WHAT TO DO")}</th></tr></thead><tbody>${duplicates.map((entry, index) => `<tr>
      <td>${escapeHtml(entry.chart.name)}${entry.existing.name !== entry.chart.name ? `<br><span class="muted-text">${t("here: {name}", { name: escapeHtml(entry.existing.name) })}</span>` : ""}</td>
      <td class="csv-born">${birth(entry.chart)}</td><td class="csv-born">${birth(entry.existing)}</td>
      <td class="csv-born">${fileCount(entry)} / ${hereCount(entry.existing)}</td>
      <td><span class="import-review-choice">${[["skip", t("Skip")], ["replace", t("Replace")], ["copy", t("Copy")]].map(([value, label]) => `<label class="csv-choice"><input type="radio" name="review-${index}" value="${value}" data-review="${index}" ${entry.choice === value ? "checked" : ""}>${label}</label>`).join("")}</span></td>
    </tr>`).join("")}</tbody></table></div>
    <div class="dialog-actions"><button type="button" class="secondary-button" data-review-close>${t("Cancel")}</button><button type="button" class="primary-button" data-review-import>${t("Import")}</button></div>
  </div>`;
  document.body.appendChild(dialog);
  const button = dialog.querySelector("[data-review-import]");
  const label = () => {
    const counts = { skip: 0, replace: 0, copy: 0 };
    duplicates.forEach((entry) => { counts[entry.choice] += 1; });
    const parts = [fresh ? tn(fresh, "{n} new", "{n} new") : "", counts.replace ? tn(counts.replace, "{n} replaced", "{n} replaced") : "", counts.copy ? tn(counts.copy, "{n} copied", "{n} copied") : "", counts.skip ? tn(counts.skip, "{n} skipped", "{n} skipped") : ""].filter(Boolean);
    button.textContent = `${t("Import")} · ${parts.join(", ")}`;
  };
  dialog.addEventListener("change", (event) => {
    const index = event.target.dataset.review;
    if (index == null) return;
    duplicates[Number(index)].choice = event.target.value;
    label();
  });
  dialog.querySelectorAll("[data-review-all]").forEach((all) => all.addEventListener("click", () => {
    duplicates.forEach((entry) => { entry.choice = all.dataset.reviewAll; });
    dialog.querySelectorAll(`input[value="${all.dataset.reviewAll}"]`).forEach((radio) => { radio.checked = true; });
    label();
  }));
  dialog.querySelectorAll("[data-review-close]").forEach((close) => close.addEventListener("click", () => dialog.close()));
  button.addEventListener("click", () => { dialog.close(); applyWorkspaceImport(imported, entries, workspace, skipped); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  label();
  dialog.showModal();
}
function applyWorkspaceImport(imported, entries, workspace, skipped) {
  const newId = () => `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // File chart ids → the ids they end up with here; skipped duplicates map to the chart
  // here (so shared events link to it), and `kept` lists the charts that are imported.
  const idMap = new Map(), names = new Map(), kept = new Set(), replaced = new Set();
  let added = 0;
  entries.forEach((entry) => {
    const { chart, existing, rawId, choice } = entry;
    names.set(rawId, chart.name);
    if (choice === "skip") { if (rawId) idMap.set(rawId, existing.id); return; }
    if (choice === "replace") {
      // (A file exported without notes and tags leaves the chart's own.)
      const own = imported.includes?.notes === false ? { noteText: existing.noteText || "", notes: existing.notes || 0, tags: existing.tags } : {};
      Object.assign(existing, { ...chart, id: existing.id, createdAt: existing.createdAt || chart.createdAt, ...own });
      existing.designTime = designTimeFor(existing);
      if (rawId) idMap.set(rawId, existing.id);
      kept.add(existing.id);
      replaced.add(existing.id);
      return;
    }
    if (state.charts.some((item) => item.id === chart.id)) chart.id = newId();
    chart.designTime = designTimeFor(chart);
    state.charts.push(chart);
    workspace.chartIds.push(chart.id);
    migrateChartLocations(chart, workspace);
    if (rawId) idMap.set(rawId, chart.id);
    kept.add(chart.id);
    added += 1;
  });
  // Events: links follow the charts' ids here; people whose chart isn't in the file keep
  // their name, unlinked. An event about skipped charts only is left out, and one that
  // is already here (a replaced chart's) isn't doubled.
  workspace.events = workspace.events || [];
  const members = new Set(workspace.chartIds);
  const existingIds = new Set(workspace.events.map((event) => event.id));
  const sameAnchor = (a, b) => a.chartId === b.chartId && (a.birth ? b.birth : a.cycle === b.cycle && a.n === b.n);
  let events = 0, unlinked = 0, doubled = 0;
  (Array.isArray(imported.events) ? imported.events : []).forEach((raw) => {
    const remapped = { ...raw, anchor: raw?.anchor ? { ...raw.anchor, chartId: idMap.get(String(raw.anchor.chartId)) || null } : undefined, people: (Array.isArray(raw?.people) ? raw.people : []).filter(Boolean).map((person) => ({ ...person, chartId: idMap.get(String(person?.chartId)) || null, name: person?.name || names.get(String(person?.chartId)) || t("Unnamed person") })) };
    const event = sanitizeEvent(remapped, members);
    if (!event) return;
    const linked = event.anchor ? [event.anchor.chartId] : event.people.map((person) => person.chartId).filter(Boolean);
    if (!linked.some((id) => kept.has(id))) return;
    const onlyReplaced = linked.filter((id) => kept.has(id)).every((id) => replaced.has(id));
    if (existingIds.has(event.id) || (event.anchor && workspace.events.some((item) => item.anchor && sameAnchor(item.anchor, event.anchor)))) {
      if (onlyReplaced || event.anchor) { doubled += 1; return; }
      event.id = `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    existingIds.add(event.id);
    if (event.people.some((person) => !person.chartId)) unlinked += 1;
    workspace.events.push(event);
    events += 1;
  });
  saveState();
  renderRows();
  if (typeof renderExplorer === "function" && currentView === "explorer") renderExplorer();
  const kinds = entries.reduce((counts, entry) => ({ ...counts, [entry.choice]: (counts[entry.choice] || 0) + 1 }), {});
  const parts = [
    tn(added, "{n} chart imported", "{n} charts imported"),
    kinds.replace ? tn(kinds.replace, "{n} replaced", "{n} replaced") : "",
    kinds.skip ? tn(kinds.skip, "{n} duplicate skipped", "{n} duplicates skipped") : "",
    events ? tn(events, "{n} event added", "{n} events added") : "",
    doubled ? tn(doubled, "{n} already here", "{n} already here") : "",
    skipped ? t("{n} without a valid birth date left out", { n: skipped }) : "",
    unlinked ? tn(unlinked, "{n} event includes people by name only", "{n} events include people by name only") : "",
  ].filter(Boolean);
  showToast(parts.join(" · "));
}
