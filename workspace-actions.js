// Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
const selectedChartIds = new Set();

function selectedCharts() {
  return [...selectedChartIds].map(id => chartById(id)).filter(Boolean);
}

function syncSelectedCharts() {
  selectedChartIds.clear();
  document.querySelectorAll('#chartRows input[type="checkbox"]:checked').forEach(input => selectedChartIds.add(input.closest('tr').dataset.id));
  renderSelectionBar();
}

function renderSelectionBar() {
  let bar = document.getElementById('selectionBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selectionBar';
    bar.className = 'selection-bar';
    document.querySelector('.table-wrap').before(bar);
  }
  const count = selectedCharts().length;
  bar.hidden = count === 0;
  bar.innerHTML = `<strong>${tn(count, '{n} chart selected', '{n} charts selected')}</strong><span>${t('Choose a destination workspace:')}</span><button type="button" class="secondary-button" data-selection-action="copy">${t('Copy to workspace')}</button><button type="button" class="secondary-button" data-selection-action="move">${t('Move to workspace')}</button><button type="button" class="secondary-button" data-selection-action="export" title="${t('Save these charts (and, if you like, their life events) to a file')}">${t('Export…')}</button><button type="button" class="text-button" data-selection-action="clear">${t('Clear')}</button>`;
  bar.querySelectorAll('[data-selection-action]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.selectionAction === 'clear') { selectedChartIds.clear(); renderRows(); renderSelectionBar(); return; }
    if (button.dataset.selectionAction === 'export') { openExportSelected(); return; }
    openWorkspaceTransfer(button.dataset.selectionAction);
  }));
}

function openWorkspaceTransfer(action) {
  const destinations = state.workspaces.filter(workspace => workspace.name !== state.activeWorkspace);
  if (!destinations.length) { showToast(t('Create another workspace before transferring charts')); return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'transfer-dialog';
  const count = selectedCharts().length;
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="eyebrow accent-label">${action === 'copy' ? t('COPY RECORDS') : t('MOVE RECORDS')}</p><h2>${action === 'copy' ? t('Copy selected charts') : t('Move selected charts')}</h2></div><button class="close-button" value="cancel">×</button></div><p class="dialog-copy">${action === 'copy' ? tn(count, '{n} chart will be duplicated into another workspace.', '{n} charts will be duplicated into another workspace.') : tn(count, '{n} chart will be transferred to another workspace.', '{n} charts will be transferred to another workspace.')}</p><label class="transfer-label">${t('Destination workspace')}<select name="destination">${destinations.map(workspace => `<option value="${escapeHtml(workspace.name)}">${escapeHtml(workspace.name)}</option>`).join('')}</select></label><div class="dialog-actions"><button class="secondary-button" value="cancel">${t('Cancel')}</button><button class="primary-button" value="default">${action === 'copy' ? t('Copy charts') : t('Move charts')} <span>→</span></button></div></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const destinationName = new FormData(event.target).get('destination');
    transferSelectedCharts(action, destinationName);
    dialog.close();
    dialog.remove();
  });
  dialog.addEventListener('close', () => dialog.remove(), {once: true});
  dialog.showModal();
}

// Charts and their life events move or copy together. Workspaces never link to each
// other's charts, so anyone in a copied or moved event whose chart isn't in the
// destination (or, after a move, no longer in the source) stays in it by name only.
function transferSelectedCharts(action, destinationName) {
  const source = state.workspaces.find(workspace => workspace.name === state.activeWorkspace);
  const destination = state.workspaces.find(workspace => workspace.name === destinationName);
  const charts = selectedCharts();
  // Old chart id → its id in the destination (a new one for copies).
  const idMap = new Map();
  charts.forEach(chart => {
    if (action === 'copy') {
      const copy = JSON.parse(JSON.stringify(chart));
      copy.id = `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      copy.name = t('{name} (copy)', { name: copy.name });
      state.charts.push(copy);
      destination.chartIds.push(copy.id);
      idMap.set(chart.id, copy.id);
    } else {
      source.chartIds = source.chartIds.filter(id => id !== chart.id);
      destination.chartIds.push(chart.id);
      idMap.set(chart.id, chart.id);
    }
  });
  const unlinked = transferChartEvents(action, source, destination, idMap);
  selectedChartIds.clear();
  saveState(); renderRows(); renderSelectionBar();
  const done = action === 'copy' ? tn(charts.length, '{n} chart copied to {workspace}', '{n} charts copied to {workspace}', { workspace: destinationName }) : tn(charts.length, '{n} chart moved to {workspace}', '{n} charts moved to {workspace}', { workspace: destinationName });
  showToast(done + (unlinked ? ' · ' + tn(unlinked, '{n} event now includes people by name only', '{n} events now include people by name only') : ''));
}
// Returns how many events (in either workspace) gained a name-only person.
function transferChartEvents(action, source, destination, idMap) {
  source.events = source.events || [];
  destination.events = destination.events || [];
  const nameOf = id => chartById(id)?.name || t('Unnamed person');
  const involved = source.events.filter(event => event.people.some(person => idMap.has(person.chartId)));
  const touched = new Set();
  const inDestination = new Set(destination.chartIds);
  const inSource = new Set(source.chartIds);
  involved.forEach(event => {
    // An annotation of a chart's cycle or birth goes only with that chart.
    if (event.anchor && !idMap.has(event.anchor.chartId)) return;
    const copy = JSON.parse(JSON.stringify(event));
    if (copy.anchor) copy.anchor.chartId = idMap.get(copy.anchor.chartId);
    copy.people = copy.people.map(person => {
      const mapped = idMap.get(person.chartId);
      if (mapped && inDestination.has(mapped)) return {...person, chartId: mapped, name: ''};
      if (person.chartId) touched.add(copy);
      return {...person, chartId: null, name: person.name || nameOf(person.chartId)};
    });
    if (action === 'copy' || destination.events.some(item => item.id === copy.id)) copy.id = `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    copy.updatedAt = Date.now();
    destination.events.push(copy);
  });
  if (action === 'move') {
    // In the source, events left with no chart there go with the charts; the others keep
    // the moved people by name.
    source.events = source.events.filter(event => {
      if (!involved.includes(event)) return true;
      if (event.anchor && idMap.has(event.anchor.chartId)) return false;
      if (!event.people.some(person => person.chartId && inSource.has(person.chartId))) return false;
      event.people = event.people.map(person => (person.chartId && !inSource.has(person.chartId) ? (touched.add(event), {...person, chartId: null, name: nameOf(person.chartId)}) : person));
      return true;
    });
  }
  return touched.size;
}

function openWorkspaceNameDialog() {
  let dialog = document.getElementById('workspaceNameDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'workspaceNameDialog';
    dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="eyebrow accent-label">${t('NEW WORKSPACE')}</p><h2>${t('Name this workspace')}</h2></div><button class="close-button" value="cancel">×</button></div><label class="transfer-label">${t('Workspace name')}<input name="name" required placeholder="${t('e.g. Readings')}"></label><div class="dialog-actions"><button class="secondary-button" value="cancel">${t('Cancel')}</button><button class="primary-button" value="default">${t('Create workspace')} <span>→</span></button></div></form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const name = new FormData(event.target).get('name').trim();
      if (!name || state.workspaces.some(workspace => workspace.name === name)) { showToast(t('Choose a unique workspace name')); return; }
      state.workspaces.push({name, chartIds: []});
      state.activeWorkspace = name;
      document.getElementById('workspaceName').textContent = name;
      saveState(); renderWorkspaces(); renderRows(); dialog.close(); showToast(t('{name} workspace created', { name }));
    });
  }
  dialog.querySelector('input').value = '';
  dialog.showModal();
}

document.addEventListener('click', event => {
  if (event.target.closest('#newWorkspaceButton')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkspaceNameDialog();
  }
}, true);

document.addEventListener('change', event => {
  if (event.target.matches('#chartRows input[type="checkbox"]')) {
    syncSelectedCharts();
  }
  if (event.target.matches('#selectAll')) {
    document.querySelectorAll('#chartRows input[type="checkbox"]').forEach(input => {
      input.checked = event.target.checked;
      const id = input.closest('tr').dataset.id;
      if (event.target.checked) selectedChartIds.add(id); else selectedChartIds.delete(id);
    });
    renderSelectionBar();
  }
});

document.addEventListener('click', event => {
  if (event.target.matches('#chartRows input[type="checkbox"]')) setTimeout(syncSelectedCharts, 0);
});

renderSelectionBar();