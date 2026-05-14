/**
 * Audit Trail — track every import, modification, and analysis action.
 *
 * Provides a timestamped log that analysts can review for provenance,
 * compliance, and reproducibility.
 */

/**
 * @typedef {Object} AuditEntry
 * @property {number} timestamp
 * @property {'import'|'modify'|'delete'|'analysis'|'export'|'merge'|'alert'} action
 * @property {string} description
 * @property {Object} [detail] - Action-specific metadata
 */

let auditLog = [];

/**
 * Record an audit entry.
 */
export function recordAction(action, description, detail) {
  const entry = {
    timestamp: Date.now(),
    action,
    description,
    detail: detail || null,
  };
  auditLog.push(entry);

  // Keep log bounded (last 10,000 entries)
  if (auditLog.length > 10000) {
    auditLog = auditLog.slice(-10000);
  }

  return entry;
}

/**
 * Get the full audit log.
 */
export function getAuditLog() {
  return auditLog;
}

/**
 * Get recent entries (last N).
 */
export function getRecentActions(n = 50) {
  return auditLog.slice(-n);
}

/**
 * Filter log by action type.
 */
export function filterLog(actionType) {
  return auditLog.filter(e => e.action === actionType);
}

/**
 * Filter log by time range.
 */
export function filterLogByTime(startMs, endMs) {
  return auditLog.filter(e => e.timestamp >= startMs && e.timestamp <= endMs);
}

/**
 * Clear the audit log.
 */
export function clearAuditLog() {
  auditLog = [];
}

/**
 * Export audit log as CSV.
 */
export function exportAuditCSV() {
  const rows = ['timestamp,action,description,detail'];
  for (const entry of auditLog) {
    const ts = new Date(entry.timestamp).toISOString();
    const detail = entry.detail ? JSON.stringify(entry.detail).replace(/"/g, '""') : '';
    rows.push(`${ts},"${entry.action}","${entry.description.replace(/"/g, '""')}","${detail}"`);
  }
  return rows.join('\n');
}

/**
 * Show audit panel in UI.
 */
export function showAuditPanel() {
  let panel = document.getElementById('audit-trail-panel');
  if (panel) { panel.style.display = 'flex'; return; }

  panel = document.createElement('div');
  panel.id = 'audit-trail-panel';
  panel.className = 'audit-trail-panel';
  panel.innerHTML = `
    <div class="at-header">
      <h3>Audit Trail</h3>
      <button class="at-close" title="Close">&times;</button>
    </div>
    <div class="at-filters">
      <select class="at-filter-action">
        <option value="">All Actions</option>
        <option value="import">Import</option>
        <option value="modify">Modify</option>
        <option value="delete">Delete</option>
        <option value="analysis">Analysis</option>
        <option value="export">Export</option>
        <option value="merge">Merge</option>
        <option value="alert">Alert</option>
      </select>
      <button class="at-export" title="Export CSV">Export CSV</button>
    </div>
    <div class="at-list"></div>
  `;

  panel.querySelector('.at-close').addEventListener('click', hideAuditPanel);
  panel.querySelector('.at-filter-action').addEventListener('change', (e) => {
    renderAuditEntries(panel, e.target.value || undefined);
  });
  panel.querySelector('.at-export').addEventListener('click', () => {
    const csv = exportAuditCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-trail.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.body.appendChild(panel);
  renderAuditEntries(panel);
}

/**
 * Hide audit panel.
 */
export function hideAuditPanel() {
  const panel = document.getElementById('audit-trail-panel');
  if (panel) panel.style.display = 'none';
}

function renderAuditEntries(panel, filterAction) {
  const list = panel.querySelector('.at-list');
  let entries = filterAction ? filterLog(filterAction) : auditLog;
  entries = entries.slice(-200).reverse(); // Show most recent first, max 200

  const icons = {
    import: '📥', modify: '✏️', delete: '🗑️',
    analysis: '🔍', export: '📤', merge: '🔗', alert: '⚠️',
  };

  list.innerHTML = entries.map(e => `
    <div class="at-entry">
      <span class="at-icon">${icons[e.action] || '📋'}</span>
      <span class="at-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
      <span class="at-action">${e.action}</span>
      <span class="at-desc">${e.description}</span>
    </div>
  `).join('') || '<div class="at-empty">No audit entries</div>';
}
