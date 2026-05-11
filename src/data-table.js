/**
 * Data table with filtering, sorting, and column toggling.
 * Renders GeoJSON features / CSV data in the Table tab.
 */

let tableData = null;
let sortCol = null;
let sortAsc = true;
let hiddenCols = new Set();
let filterText = '';

export function initDataTable() {
  const header = document.getElementById('table-title');
  if (!header) return;

  // Insert controls above the table
  const wrap = document.getElementById('table-view');
  if (!wrap) return;

  const controls = document.createElement('div');
  controls.className = 'dt-controls';
  controls.innerHTML = `
    <input type="text" id="dt-filter" placeholder="Filter rows…" class="dt-filter-input" />
    <button id="dt-col-toggle" class="map-action-btn" title="Toggle columns">📊 Columns</button>
    <button id="dt-export-csv" class="map-action-btn" title="Export CSV">⬇ CSV</button>
    <span id="dt-row-count" class="dt-row-count"></span>
  `;
  wrap.insertBefore(controls, wrap.querySelector('#data-table'));

  // Column chooser panel
  const colPanel = document.createElement('div');
  colPanel.id = 'dt-col-panel';
  colPanel.className = 'dt-col-panel';
  colPanel.style.display = 'none';
  wrap.appendChild(colPanel);

  document.getElementById('dt-filter').addEventListener('input', (e) => {
    filterText = e.target.value.toLowerCase();
    render();
  });

  document.getElementById('dt-col-toggle').addEventListener('click', () => {
    colPanel.style.display = colPanel.style.display === 'none' ? 'block' : 'none';
    renderColumnChooser();
  });

  document.getElementById('dt-export-csv').addEventListener('click', exportCSV);
}

export function loadTableData(data, title = 'Data') {
  tableData = data;
  sortCol = null;
  sortAsc = true;
  hiddenCols.clear();
  filterText = '';

  const filterInput = document.getElementById('dt-filter');
  if (filterInput) filterInput.value = '';

  const header = document.getElementById('table-title');
  if (header) header.textContent = title;

  render();
}

function getColumns() {
  if (!tableData || tableData.length === 0) return [];
  return Object.keys(tableData[0]).filter(c => !hiddenCols.has(c));
}

function getAllColumns() {
  if (!tableData || tableData.length === 0) return [];
  return Object.keys(tableData[0]);
}

function getFilteredRows() {
  if (!tableData) return [];
  let rows = tableData;
  if (filterText) {
    rows = rows.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(filterText))
    );
  }
  if (sortCol !== null) {
    rows = [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }
  return rows;
}

function render() {
  const thead = document.querySelector('#data-table thead');
  const tbody = document.querySelector('#data-table tbody');
  if (!thead || !tbody) return;

  const cols = getColumns();
  const rows = getFilteredRows();

  thead.innerHTML = `<tr>${cols.map(c =>
    `<th class="dt-sortable" data-col="${c}">${escapeHtml(c)} ${sortCol === c ? (sortAsc ? '▲' : '▼') : ''}</th>`
  ).join('')}</tr>`;

  const maxRows = 500;
  tbody.innerHTML = rows.slice(0, maxRows).map(row =>
    `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`
  ).join('');

  const count = document.getElementById('dt-row-count');
  if (count) count.textContent = `${rows.length} rows${rows.length > maxRows ? ` (showing ${maxRows})` : ''}`;

  // Sort click handlers
  thead.querySelectorAll('.dt-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      render();
    });
  });
}

function renderColumnChooser() {
  const panel = document.getElementById('dt-col-panel');
  if (!panel) return;
  const allCols = getAllColumns();
  panel.innerHTML = allCols.map(c => `
    <label class="dt-col-label">
      <input type="checkbox" ${hiddenCols.has(c) ? '' : 'checked'} data-col="${c}" />
      ${escapeHtml(c)}
    </label>
  `).join('');

  panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenCols.delete(cb.dataset.col);
      else hiddenCols.add(cb.dataset.col);
      render();
    });
  });
}

function exportCSV() {
  const cols = getColumns();
  const rows = getFilteredRows();
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map(c => {
      const v = String(row[c] ?? '');
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'viewtopia-data.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
