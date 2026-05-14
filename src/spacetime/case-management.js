/**
 * Case Management — analyst investigations, case files, and workflows.
 *
 * Each "case" groups entities, links, tracks, attachments, and analysis
 * results into a structured investigation that can be shared, annotated,
 * and tracked through phases.
 */

/**
 * @typedef {Object} Case
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'draft'|'active'|'review'|'closed'|'archived'} status
 * @property {string} classification - Security classification
 * @property {string[]} compartments
 * @property {string} analyst - Assigned analyst name
 * @property {number} created
 * @property {number} modified
 * @property {string[]} entityIds - Entities in this case
 * @property {string[]} linkIds - Links in this case
 * @property {string[]} attachmentIds - Attachment IDs
 * @property {CaseNote[]} notes
 * @property {string[]} tags
 * @property {CasePhase[]} phases
 */

/**
 * @typedef {Object} CaseNote
 * @property {string} id
 * @property {string} author
 * @property {number} timestamp
 * @property {string} text
 * @property {string} [classification]
 */

/**
 * @typedef {Object} CasePhase
 * @property {string} id
 * @property {string} name
 * @property {'pending'|'in-progress'|'complete'} status
 * @property {string} [notes]
 */

const cases = new Map();
let caseIdCounter = 0;

/**
 * Create a new case/investigation.
 */
export function createCase(name, opts = {}) {
  const id = `case-${++caseIdCounter}-${Date.now()}`;
  const c = {
    id,
    name,
    description: opts.description || '',
    status: 'draft',
    classification: opts.classification || 'unclassified',
    compartments: opts.compartments || [],
    analyst: opts.analyst || '',
    created: Date.now(),
    modified: Date.now(),
    entityIds: [],
    linkIds: [],
    attachmentIds: [],
    notes: [],
    tags: opts.tags || [],
    phases: [
      { id: 'collect', name: 'Collection', status: 'pending' },
      { id: 'analyze', name: 'Analysis', status: 'pending' },
      { id: 'report', name: 'Reporting', status: 'pending' },
    ],
  };
  cases.set(id, c);
  return c;
}

/**
 * Get a case by ID.
 */
export function getCase(id) { return cases.get(id); }

/**
 * Get all cases.
 */
export function getAllCases() { return [...cases.values()]; }

/**
 * Update case metadata.
 */
export function updateCase(id, updates) {
  const c = cases.get(id);
  if (!c) return null;
  Object.assign(c, updates, { modified: Date.now() });
  return c;
}

/**
 * Delete a case.
 */
export function deleteCase(id) { cases.delete(id); }

/**
 * Add entities to a case.
 */
export function addEntitiesToCase(caseId, entityIds) {
  const c = cases.get(caseId);
  if (!c) return;
  for (const id of entityIds) {
    if (!c.entityIds.includes(id)) c.entityIds.push(id);
  }
  c.modified = Date.now();
}

/**
 * Add links to a case.
 */
export function addLinksToCase(caseId, linkIds) {
  const c = cases.get(caseId);
  if (!c) return;
  for (const id of linkIds) {
    if (!c.linkIds.includes(id)) c.linkIds.push(id);
  }
  c.modified = Date.now();
}

/**
 * Add attachments to a case.
 */
export function addAttachmentsToCase(caseId, attachmentIds) {
  const c = cases.get(caseId);
  if (!c) return;
  for (const id of attachmentIds) {
    if (!c.attachmentIds.includes(id)) c.attachmentIds.push(id);
  }
  c.modified = Date.now();
}

/**
 * Add a note to a case.
 */
export function addCaseNote(caseId, text, author = '') {
  const c = cases.get(caseId);
  if (!c) return null;
  const note = {
    id: `note-${Date.now()}`,
    author,
    timestamp: Date.now(),
    text,
    classification: c.classification,
  };
  c.notes.push(note);
  c.modified = Date.now();
  return note;
}

/**
 * Update a case phase status.
 */
export function updatePhase(caseId, phaseId, status, notes) {
  const c = cases.get(caseId);
  if (!c) return;
  const phase = c.phases.find(p => p.id === phaseId);
  if (phase) {
    phase.status = status;
    if (notes !== undefined) phase.notes = notes;
  }
  c.modified = Date.now();
}

/**
 * Search cases by name or tag.
 */
export function searchCases(query) {
  const q = query.toLowerCase();
  return [...cases.values()].filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.tags.some(t => t.toLowerCase().includes(q)) ||
    c.analyst.toLowerCase().includes(q)
  );
}

/**
 * Filter cases by status.
 */
export function filterCasesByStatus(status) {
  return [...cases.values()].filter(c => c.status === status);
}

/**
 * Export case as JSON (for sharing).
 */
export function exportCase(id) {
  const c = cases.get(id);
  if (!c) return null;
  return JSON.stringify(c, null, 2);
}

/**
 * Import case from JSON.
 */
export function importCase(json) {
  const c = typeof json === 'string' ? JSON.parse(json) : json;
  c.id = `case-${++caseIdCounter}-${Date.now()}`;
  c.modified = Date.now();
  cases.set(c.id, c);
  return c;
}

/**
 * Clear all cases.
 */
export function clearCases() {
  cases.clear();
}

/**
 * Save cases to IndexedDB.
 */
export async function saveCases() {
  try {
    const { openDB } = await import('idb');
    const db = await openDB('viewtopia-cases', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cases')) {
          db.createObjectStore('cases', { keyPath: 'id' });
        }
      },
    });
    const tx = db.transaction('cases', 'readwrite');
    await tx.store.clear();
    for (const c of cases.values()) {
      await tx.store.put(c);
    }
    await tx.done;
  } catch {
    // IndexedDB not available
  }
}

/**
 * Load cases from IndexedDB.
 */
export async function loadCases() {
  try {
    const { openDB } = await import('idb');
    const db = await openDB('viewtopia-cases', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cases')) {
          db.createObjectStore('cases', { keyPath: 'id' });
        }
      },
    });
    const all = await db.getAll('cases');
    cases.clear();
    for (const c of all) {
      cases.set(c.id, c);
    }
  } catch {
    // IndexedDB not available
  }
}

/**
 * Show case management panel.
 */
export function showCasePanel(entities, onOpenCase) {
  let panel = document.getElementById('case-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'case-panel';
  panel.className = 'case-panel';

  const statusIcons = { draft: '📝', active: '🔍', review: '📋', closed: '✅', archived: '📦' };

  function render() {
    const allCases = getAllCases();
    panel.innerHTML = `
      <div class="cp-header">
        <h3>Investigations</h3>
        <button class="st-btn cp-new">+ New Case</button>
        <button class="cp-close">&times;</button>
      </div>
      <div class="cp-search">
        <input type="text" placeholder="Search cases…" class="cp-search-input">
      </div>
      <div class="cp-list">
        ${allCases.map(c => `
          <div class="cp-case" data-case-id="${c.id}">
            <span class="cp-icon">${statusIcons[c.status] || '📋'}</span>
            <div class="cp-info">
              <span class="cp-name">${c.name}</span>
              <span class="cp-meta">${c.status} · ${c.entityIds.length} entities · ${c.analyst || 'unassigned'}</span>
              <span class="cp-tags">${c.tags.map(t => `<span class="cp-tag">${t}</span>`).join('')}</span>
            </div>
            <span class="cp-class" style="color:${getClassColor(c.classification)}">${c.classification}</span>
          </div>
        `).join('') || '<div class="cp-empty">No investigations</div>'}
      </div>
    `;

    panel.querySelector('.cp-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.cp-new').addEventListener('click', () => {
      const name = prompt('Investigation name:');
      if (!name) return;
      const c = createCase(name, { analyst: 'Current User' });
      render();
    });

    panel.querySelector('.cp-search-input').addEventListener('input', (e) => {
      const q = e.target.value.trim();
      const filtered = q ? searchCases(q) : getAllCases();
      const list = panel.querySelector('.cp-list');
      list.innerHTML = filtered.map(c => `
        <div class="cp-case" data-case-id="${c.id}">
          <span class="cp-icon">${statusIcons[c.status] || '📋'}</span>
          <div class="cp-info">
            <span class="cp-name">${c.name}</span>
            <span class="cp-meta">${c.status} · ${c.entityIds.length} entities</span>
          </div>
        </div>
      `).join('');
      wireClickHandlers(list);
    });

    wireClickHandlers(panel.querySelector('.cp-list'));
  }

  function wireClickHandlers(container) {
    container.querySelectorAll('.cp-case').forEach(el => {
      el.addEventListener('click', () => {
        onOpenCase?.(el.dataset.caseId);
      });
    });
  }

  render();
  document.body.appendChild(panel);
}

function getClassColor(classification) {
  const colors = {
    unclassified: '#10b981', cui: '#06b6d4', confidential: '#3b82f6',
    secret: '#f59e0b', top_secret: '#ef4444', ts_sci: '#dc2626',
  };
  return colors[classification] || '#94a3b8';
}
