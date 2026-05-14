/**
 * Data Fusion — multi-source ingest with provenance tracking.
 *
 * Each data source is registered with metadata. When entities/events
 * are created from a source, the provenance is tracked so analysts
 * can trace any piece of data back to its origin.
 */

/**
 * @typedef {Object} DataSource
 * @property {string} id
 * @property {string} name
 * @property {'sigint'|'humint'|'imint'|'osint'|'finint'|'geoint'|'cyber'|'cdr'|'manual'|'other'} type
 * @property {string} [description]
 * @property {string} classification - Default classification for data from this source
 * @property {string[]} compartments
 * @property {number} dateAdded
 * @property {number} recordCount - How many records ingested
 * @property {string} [format] - File format or protocol
 * @property {Object} [metadata] - Source-specific metadata
 */

/**
 * @typedef {Object} ProvenanceRecord
 * @property {string} entityId - Entity or item ID
 * @property {string} sourceId - Source ID
 * @property {number} timestamp - When the record was ingested
 * @property {string} field - Which field came from this source
 * @property {*} value - The value provided by this source
 * @property {number} confidence - Source reliability 0.0-1.0
 */

const sources = new Map();
const provenance = new Map(); // entityId -> ProvenanceRecord[]
let sourceIdCounter = 0;

/**
 * Register a data source.
 */
export function registerSource(name, type, opts = {}) {
  const id = `src-${++sourceIdCounter}-${Date.now()}`;
  const source = {
    id,
    name,
    type,
    description: opts.description || '',
    classification: opts.classification || 'unclassified',
    compartments: opts.compartments || [],
    dateAdded: Date.now(),
    recordCount: 0,
    format: opts.format || '',
    metadata: opts.metadata || {},
  };
  sources.set(id, source);
  return source;
}

/**
 * Get all data sources.
 */
export function getSources() {
  return [...sources.values()];
}

/**
 * Get source by ID.
 */
export function getSource(id) {
  return sources.get(id);
}

/**
 * Remove a data source.
 */
export function removeSource(id) {
  sources.delete(id);
}

/**
 * Record provenance for an entity/field.
 */
export function recordProvenance(entityId, sourceId, field, value, confidence = 1.0) {
  if (!provenance.has(entityId)) provenance.set(entityId, []);
  provenance.get(entityId).push({
    entityId,
    sourceId,
    timestamp: Date.now(),
    field,
    value,
    confidence,
  });

  // Increment source record count
  const src = sources.get(sourceId);
  if (src) src.recordCount++;
}

/**
 * Get provenance records for an entity.
 */
export function getProvenance(entityId) {
  return provenance.get(entityId) || [];
}

/**
 * Get all entities that came from a specific source.
 */
export function getEntitiesBySource(sourceId) {
  const entityIds = new Set();
  for (const [entityId, records] of provenance) {
    if (records.some(r => r.sourceId === sourceId)) {
      entityIds.add(entityId);
    }
  }
  return [...entityIds];
}

/**
 * Get conflicting values for a field across sources.
 * When multiple sources provide different values for the same field,
 * the analyst needs to resolve the conflict.
 */
export function getFieldConflicts(entityId) {
  const records = provenance.get(entityId) || [];
  const fields = new Map(); // field -> values from different sources

  for (const r of records) {
    if (!fields.has(r.field)) fields.set(r.field, []);
    fields.get(r.field).push(r);
  }

  const conflicts = [];
  for (const [field, recs] of fields) {
    const uniqueValues = new Set(recs.map(r => JSON.stringify(r.value)));
    if (uniqueValues.size > 1) {
      conflicts.push({ field, records: recs });
    }
  }

  return conflicts;
}

/**
 * Resolve a field conflict by choosing a winner.
 */
export function resolveConflict(entityId, field, winnerSourceId) {
  const records = provenance.get(entityId) || [];
  // Mark non-winners as superseded
  for (const r of records) {
    if (r.field === field && r.sourceId !== winnerSourceId) {
      r.superseded = true;
    }
  }
}

/**
 * Get fusion summary statistics.
 */
export function fusionSummary() {
  const sourceStats = [];
  for (const src of sources.values()) {
    const entityCount = getEntitiesBySource(src.id).length;
    sourceStats.push({
      id: src.id,
      name: src.name,
      type: src.type,
      recordCount: src.recordCount,
      entityCount,
      classification: src.classification,
    });
  }

  let totalConflicts = 0;
  for (const [entityId] of provenance) {
    totalConflicts += getFieldConflicts(entityId).length;
  }

  return {
    totalSources: sources.size,
    totalRecords: [...sources.values()].reduce((s, src) => s + src.recordCount, 0),
    totalConflicts,
    sources: sourceStats,
  };
}

/**
 * Clear all fusion data.
 */
export function clearFusionData() {
  sources.clear();
  provenance.clear();
}

/**
 * Show data sources panel.
 */
export function showSourcesPanel(onSourceSelect) {
  let panel = document.getElementById('sources-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'sources-panel';
  panel.className = 'sources-panel';

  const sourceList = getSources();
  const summary = fusionSummary();

  const typeIcons = {
    sigint: '📡', humint: '🕵️', imint: '🛰️', osint: '🌐',
    finint: '💰', geoint: '🗺️', cyber: '💻', cdr: '📞',
    manual: '✏️', other: '📋',
  };

  panel.innerHTML = `
    <div class="ds-header">
      <h3>Data Sources</h3>
      <span class="ds-stats">${summary.totalSources} sources · ${summary.totalRecords} records · ${summary.totalConflicts} conflicts</span>
      <button class="ds-close">&times;</button>
    </div>
    <div class="ds-list">
      ${sourceList.map(s => `
        <div class="ds-source" data-source-id="${s.id}">
          <span class="ds-icon">${typeIcons[s.type] || '📋'}</span>
          <div class="ds-info">
            <span class="ds-name">${s.name}</span>
            <span class="ds-meta">${s.type} · ${s.recordCount} records · ${s.classification}</span>
            ${s.description ? `<span class="ds-desc">${s.description}</span>` : ''}
          </div>
        </div>
      `).join('') || '<div class="ds-empty">No data sources registered</div>'}
    </div>
  `;

  panel.querySelector('.ds-close').addEventListener('click', () => panel.remove());
  panel.querySelectorAll('.ds-source').forEach(el => {
    el.addEventListener('click', () => {
      onSourceSelect?.(el.dataset.sourceId);
    });
  });

  document.body.appendChild(panel);
}
