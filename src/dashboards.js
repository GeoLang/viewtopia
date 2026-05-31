/**
 * Dashboard Builder — configurable real-time dashboards for geospatial data.
 *
 * Equivalent to ArcGIS Dashboards / Google Looker Studio for geo data:
 * - Widget-based layout (maps, charts, indicators, lists)
 * - Real-time data binding
 * - Configurable filters and selectors
 * - Save/load dashboard configurations
 */

/** @typedef {'map'|'chart'|'indicator'|'list'|'gauge'|'richtext'} WidgetType */

/**
 * @typedef {Object} DashboardWidget
 * @property {string} id
 * @property {WidgetType} type
 * @property {string} title
 * @property {Object} config - Widget-specific configuration
 * @property {{x: number, y: number, w: number, h: number}} layout
 */

/**
 * @typedef {Object} Dashboard
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {DashboardWidget[]} widgets
 * @property {Object} theme
 * @property {string} created
 * @property {string} modified
 */

/** @type {Dashboard|null} */
let activeDashboard = null;
let dashboardPanel = null;

/**
 * Initialize dashboards module.
 */
export function initDashboards() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'dashboard-btn';
  btn.title = 'Dashboards';
  btn.textContent = '📊 Dashboards';
  toolbar.appendChild(btn);

  btn.addEventListener('click', toggleDashboardPanel);
}

function toggleDashboardPanel() {
  if (dashboardPanel && dashboardPanel.style.display !== 'none') {
    dashboardPanel.style.display = 'none';
    return;
  }
  showDashboardPanel();
}

function showDashboardPanel() {
  if (!dashboardPanel) {
    dashboardPanel = createDashboardPanel();
    document.body.appendChild(dashboardPanel);
  }
  dashboardPanel.style.display = 'flex';
  renderDashboardList();
}

function createDashboardPanel() {
  const panel = document.createElement('div');
  panel.id = 'dashboard-panel';
  panel.className = 'dashboard-panel';
  panel.innerHTML = `
    <div class="dashboard-header">
      <h2>Dashboards</h2>
      <button class="dashboard-close" aria-label="Close">&times;</button>
    </div>
    <div class="dashboard-content">
      <div id="dashboard-list"></div>
      <button id="dashboard-create" class="portal-btn-primary">+ New Dashboard</button>
    </div>
  `;

  panel.querySelector('.dashboard-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  panel.querySelector('#dashboard-create').addEventListener('click', createNewDashboard);
  return panel;
}

/**
 * Create a new empty dashboard.
 */
export function createNewDashboard() {
  const dashboard = {
    id: crypto.randomUUID(),
    title: 'Untitled Dashboard',
    description: '',
    widgets: [],
    theme: { background: '#1a1a2e', accent: '#0f3460' },
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };
  saveDashboard(dashboard);
  openDashboard(dashboard);
}

/**
 * Open a dashboard for viewing/editing.
 * @param {Dashboard} dashboard
 */
export function openDashboard(dashboard) {
  activeDashboard = dashboard;
  renderDashboardView();
}

/**
 * Render the dashboard editor/viewer.
 */
function renderDashboardView() {
  if (!activeDashboard || !dashboardPanel) return;

  const content = dashboardPanel.querySelector('.dashboard-content');
  content.innerHTML = `
    <div class="dashboard-toolbar">
      <input type="text" value="${escapeAttr(activeDashboard.title)}" class="dashboard-title-input" />
      <button id="db-add-widget" class="portal-btn-primary">+ Widget</button>
      <button id="db-save" class="portal-btn-primary">Save</button>
      <button id="db-back">&larr; Back</button>
    </div>
    <div class="dashboard-grid" id="dashboard-grid">
      ${activeDashboard.widgets.map(w => renderWidget(w)).join('')}
    </div>
  `;

  content.querySelector('#db-add-widget').addEventListener('click', showWidgetPicker);
  content.querySelector('#db-save').addEventListener('click', () => {
    const title = content.querySelector('.dashboard-title-input').value;
    activeDashboard.title = title;
    activeDashboard.modified = new Date().toISOString();
    saveDashboard(activeDashboard);
  });
  content.querySelector('#db-back').addEventListener('click', () => {
    activeDashboard = null;
    renderDashboardList();
  });
}

/**
 * Render a single widget card.
 * @param {DashboardWidget} widget
 */
function renderWidget(widget) {
  const style = `grid-column: ${widget.layout.x + 1} / span ${widget.layout.w}; grid-row: ${widget.layout.y + 1} / span ${widget.layout.h};`;
  return `
    <div class="dashboard-widget" data-id="${widget.id}" style="${style}">
      <div class="widget-header">
        <span class="widget-title">${escapeHtml(widget.title)}</span>
        <button class="widget-remove" data-id="${widget.id}">&times;</button>
      </div>
      <div class="widget-body widget-type-${widget.type}">
        ${renderWidgetContent(widget)}
      </div>
    </div>
  `;
}

/**
 * Render widget content based on type.
 * @param {DashboardWidget} widget
 */
function renderWidgetContent(widget) {
  switch (widget.type) {
    case 'indicator':
      return `<div class="widget-indicator"><span class="indicator-value">${widget.config.value ?? '—'}</span><span class="indicator-label">${escapeHtml(widget.config.label || '')}</span></div>`;
    case 'gauge':
      return `<div class="widget-gauge"><div class="gauge-fill" style="width: ${widget.config.percent ?? 0}%"></div><span>${widget.config.percent ?? 0}%</span></div>`;
    case 'list':
      return `<ul class="widget-list">${(widget.config.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'richtext':
      return `<div class="widget-richtext">${widget.config.html || ''}</div>`;
    case 'chart':
      return `<div class="widget-chart-placeholder">[Chart: ${escapeHtml(widget.config.chartType || 'bar')}]</div>`;
    case 'map':
      return `<div class="widget-map-placeholder">[Map Widget]</div>`;
    default:
      return '<div class="widget-empty">Configure widget</div>';
  }
}

/**
 * Show widget type picker.
 */
function showWidgetPicker() {
  const types = [
    { type: 'map', label: '🗺️ Map', desc: 'Embedded map view' },
    { type: 'chart', label: '📈 Chart', desc: 'Bar, line, or pie chart' },
    { type: 'indicator', label: '🔢 Indicator', desc: 'Single value display' },
    { type: 'gauge', label: '⏲️ Gauge', desc: 'Progress/percentage gauge' },
    { type: 'list', label: '📋 List', desc: 'Feature or data list' },
    { type: 'richtext', label: '📝 Rich Text', desc: 'Formatted text block' },
  ];

  const dialog = document.createElement('div');
  dialog.className = 'portal-dialog-overlay';
  dialog.innerHTML = `
    <div class="portal-dialog">
      <h3>Add Widget</h3>
      <div class="widget-picker-grid">
        ${types.map(t => `
          <button class="widget-picker-btn" data-type="${t.type}">
            <span class="widget-picker-icon">${t.label}</span>
            <span class="widget-picker-desc">${t.desc}</span>
          </button>
        `).join('')}
      </div>
      <button class="portal-btn-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.portal-btn-cancel').addEventListener('click', () => dialog.remove());

  dialog.querySelectorAll('.widget-picker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addWidget(btn.dataset.type);
      dialog.remove();
    });
  });
}

/**
 * Add a widget to the active dashboard.
 * @param {WidgetType} type
 */
export function addWidget(type) {
  if (!activeDashboard) return;

  const widget = {
    id: crypto.randomUUID(),
    type,
    title: `New ${type}`,
    config: getDefaultConfig(type),
    layout: { x: 0, y: activeDashboard.widgets.length, w: 2, h: 2 },
  };

  activeDashboard.widgets.push(widget);
  activeDashboard.modified = new Date().toISOString();
  saveDashboard(activeDashboard);
  renderDashboardView();
}

/**
 * Get default configuration for a widget type.
 * @param {WidgetType} type
 */
function getDefaultConfig(type) {
  switch (type) {
    case 'indicator': return { value: '0', label: 'Count' };
    case 'gauge': return { percent: 50 };
    case 'list': return { items: [] };
    case 'chart': return { chartType: 'bar', data: [] };
    case 'richtext': return { html: '<p>Enter text...</p>' };
    case 'map': return { center: [0, 0], zoom: 2 };
    default: return {};
  }
}

/**
 * Render the list of saved dashboards.
 */
function renderDashboardList() {
  const list = document.getElementById('dashboard-list');
  if (!list) return;

  const dashboards = loadDashboards();
  if (dashboards.length === 0) {
    list.innerHTML = '<p class="portal-empty">No dashboards yet. Create your first one!</p>';
    return;
  }

  list.innerHTML = dashboards.map(d => `
    <div class="dashboard-list-item" data-id="${d.id}">
      <h4>${escapeHtml(d.title)}</h4>
      <span>${d.widgets.length} widget${d.widgets.length !== 1 ? 's' : ''}</span>
      <span class="dashboard-date">${new Date(d.modified).toLocaleDateString()}</span>
    </div>
  `).join('');

  list.querySelectorAll('.dashboard-list-item').forEach(el => {
    el.addEventListener('click', () => {
      const db = dashboards.find(d => d.id === el.dataset.id);
      if (db) openDashboard(db);
    });
  });
}

/**
 * Save a dashboard to localStorage.
 * @param {Dashboard} dashboard
 */
function saveDashboard(dashboard) {
  const dashboards = loadDashboards();
  const idx = dashboards.findIndex(d => d.id === dashboard.id);
  if (idx >= 0) {
    dashboards[idx] = dashboard;
  } else {
    dashboards.push(dashboard);
  }
  localStorage.setItem('viewtopia_dashboards', JSON.stringify(dashboards));
}

/**
 * Load all dashboards from localStorage.
 * @returns {Dashboard[]}
 */
function loadDashboards() {
  try {
    const stored = localStorage.getItem('viewtopia_dashboards');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a dashboard.
 * @param {string} id
 */
export function deleteDashboard(id) {
  const dashboards = loadDashboards().filter(d => d.id !== id);
  localStorage.setItem('viewtopia_dashboards', JSON.stringify(dashboards));
  if (activeDashboard?.id === id) activeDashboard = null;
  renderDashboardList();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}
