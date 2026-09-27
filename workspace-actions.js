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
  bar.innerHTML = `<strong>${count} chart${count === 1 ? '' : 's'} selected</strong><span>Choose a destination workspace:</span><button type="button" class="secondary-button" data-selection-action="copy">Copy to workspace</button><button type="button" class="secondary-button" data-selection-action="move">Move to workspace</button><button type="button" class="text-button" data-selection-action="clear">Clear</button>`;
  bar.querySelectorAll('[data-selection-action]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.selectionAction === 'clear') { selectedChartIds.clear(); renderRows(); renderSelectionBar(); return; }
    openWorkspaceTransfer(button.dataset.selectionAction);
  }));
}

function openWorkspaceTransfer(action) {
  const destinations = state.workspaces.filter(workspace => workspace.name !== state.activeWorkspace);
  if (!destinations.length) { showToast('Create another workspace before transferring charts'); return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'transfer-dialog';
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="eyebrow accent-label">${action.toUpperCase()} RECORDS</p><h2>${action === 'copy' ? 'Copy' : 'Move'} selected charts</h2></div><button class="close-button" value="cancel">×</button></div><p class="dialog-copy">${selectedCharts().length} chart${selectedCharts().length === 1 ? '' : 's'} will be ${action === 'copy' ? 'duplicated into' : 'transferred to'} another workspace.</p><label class="transfer-label">Destination workspace<select name="destination">${destinations.map(workspace => `<option value="${escapeHtml(workspace.name)}">${escapeHtml(workspace.name)}</option>`).join('')}</select></label><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancel</button><button class="primary-button" value="default">${action === 'copy' ? 'Copy charts' : 'Move charts'} <span>→</span></button></div></form>`;
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

function transferSelectedCharts(action, destinationName) {
  const source = state.workspaces.find(workspace => workspace.name === state.activeWorkspace);
  const destination = state.workspaces.find(workspace => workspace.name === destinationName);
  const charts = selectedCharts();
  charts.forEach(chart => {
    if (action === 'copy') {
      const copy = JSON.parse(JSON.stringify(chart));
      copy.id = `chart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      copy.name = `${copy.name} (copy)`;
      state.charts.push(copy);
      destination.chartIds.push(copy.id);
    } else {
      source.chartIds = source.chartIds.filter(id => id !== chart.id);
      destination.chartIds.push(chart.id);
    }
  });
  selectedChartIds.clear();
  saveState(); renderRows(); renderSelectionBar();
  showToast(`${charts.length} chart${charts.length === 1 ? '' : 's'} ${action === 'copy' ? 'copied to' : 'moved to'} ${destinationName}`);
}

function openWorkspaceNameDialog() {
  let dialog = document.getElementById('workspaceNameDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'workspaceNameDialog';
    dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="eyebrow accent-label">NEW WORKSPACE</p><h2>Name this workspace</h2></div><button class="close-button" value="cancel">×</button></div><label class="transfer-label">Workspace name<input name="name" required placeholder="e.g. Readings"></label><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancel</button><button class="primary-button" value="default">Create workspace <span>→</span></button></div></form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const name = new FormData(event.target).get('name').trim();
      if (!name || state.workspaces.some(workspace => workspace.name === name)) { showToast('Choose a unique workspace name'); return; }
      state.workspaces.push({name, chartIds: []});
      state.activeWorkspace = name;
      document.getElementById('workspaceName').textContent = name;
      saveState(); renderWorkspaces(); renderRows(); dialog.close(); showToast(`${name} workspace created`);
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