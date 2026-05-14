/**
 * Entity Management — CRUD operations, aliasing, search, and the entity detail panel.
 *
 * GeoTime-style entity management: each entity can have multiple aliases
 * (phone numbers, usernames, etc.), custom properties, notes, and a classification.
 */

import { createEntity, createLink } from './models.js';

/** @type {Map<string, import('./models.js').Entity>} */
let entityStore = null; // injected reference from panel.js

/** @type {Function|null} */
let onEntityChange = null;

/**
 * Initialize entity manager with the shared entity map.
 */
export function initEntityManager(entityMap, onChange) {
  entityStore = entityMap;
  onEntityChange = onChange;
}

/**
 * Add a new entity.
 */
export function addEntity(name, kind = 'custom', opts = {}) {
  const entity = createEntity(name, kind);
  Object.assign(entity, {
    aliases: opts.aliases || [],
    properties: opts.properties || {},
    notes: opts.notes || '',
    classification: opts.classification || 'unclassified',
    group: opts.group || null,
  });
  entityStore.set(entity.id, entity);
  onEntityChange?.();
  return entity;
}

/**
 * Update an entity's fields.
 */
export function updateEntity(id, updates) {
  const entity = entityStore.get(id);
  if (!entity) return null;
  Object.assign(entity, updates);
  onEntityChange?.();
  return entity;
}

/**
 * Delete an entity.
 */
export function deleteEntity(id) {
  entityStore.delete(id);
  onEntityChange?.();
}

/**
 * Add an alias to an entity (phone number, username, etc.)
 */
export function addAlias(entityId, alias) {
  const entity = entityStore.get(entityId);
  if (!entity) return;
  if (!entity.aliases.includes(alias)) {
    entity.aliases.push(alias);
    onEntityChange?.();
  }
}

/**
 * Remove an alias from an entity.
 */
export function removeAlias(entityId, alias) {
  const entity = entityStore.get(entityId);
  if (!entity) return;
  entity.aliases = entity.aliases.filter(a => a !== alias);
  onEntityChange?.();
}

/**
 * Merge two entities: moves all aliases and metadata from source into target.
 * Source entity is deleted.
 */
export function mergeEntities(targetId, sourceId) {
  const target = entityStore.get(targetId);
  const source = entityStore.get(sourceId);
  if (!target || !source) return null;

  target.aliases = [...new Set([...target.aliases, ...source.aliases, source.name])];
  target.properties = { ...source.properties, ...target.properties };
  if (source.notes) target.notes = (target.notes || '') + '\n' + source.notes;

  entityStore.delete(sourceId);
  onEntityChange?.();
  return target;
}

/**
 * Search entities by name, alias, or property value.
 * @param {string} query
 * @returns {import('./models.js').Entity[]}
 */
export function searchEntities(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const entity of entityStore.values()) {
    if (entity.name.toLowerCase().includes(q)) { results.push(entity); continue; }
    if (entity.aliases.some(a => a.toLowerCase().includes(q))) { results.push(entity); continue; }
    if (Object.values(entity.properties || {}).some(v => String(v).toLowerCase().includes(q))) {
      results.push(entity);
    }
  }
  return results;
}

/**
 * Get all entities of a specific kind.
 */
export function getEntitiesByKind(kind) {
  return [...entityStore.values()].filter(e => e.kind === kind);
}

/**
 * Get all entity kinds in use.
 */
export function getEntityKinds() {
  const kinds = new Set();
  for (const e of entityStore.values()) kinds.add(e.kind);
  return [...kinds];
}

// --- Entity Detail Panel UI ---

let detailPanel = null;

export function showEntityDetail(entityId) {
  const entity = entityStore.get(entityId);
  if (!entity) return;

  if (!detailPanel) {
    detailPanel = document.createElement('div');
    detailPanel.id = 'entity-detail-panel';
    detailPanel.className = 'entity-detail-panel';
    document.body.appendChild(detailPanel);
  }

  detailPanel.style.display = '';
  detailPanel.innerHTML = `
    <div class="ed-header">
      <div class="ed-color" style="background:${entity.color}"></div>
      <input class="ed-name" value="${escHtml(entity.name)}" data-field="name">
      <button class="st-btn ed-close">✕</button>
    </div>
    <div class="ed-section">
      <label>Kind</label>
      <select class="ed-kind" data-field="kind">
        ${['person', 'vehicle', 'device', 'organization', 'location', 'custom']
          .map(k => `<option value="${k}" ${k === entity.kind ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
    </div>
    <div class="ed-section">
      <label>Classification</label>
      <select class="ed-class" data-field="classification">
        ${['unclassified', 'subject', 'associate', 'witness', 'victim', 'unknown']
          .map(c => `<option value="${c}" ${c === entity.classification ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="ed-section">
      <label>Aliases</label>
      <div class="ed-aliases">
        ${entity.aliases.map(a => `<span class="ed-alias">${escHtml(a)} <button class="ed-alias-rm" data-alias="${escHtml(a)}">×</button></span>`).join('')}
      </div>
      <div class="ed-alias-add">
        <input type="text" placeholder="Add alias…" class="ed-alias-input">
        <button class="st-btn ed-alias-btn">+</button>
      </div>
    </div>
    <div class="ed-section">
      <label>Notes</label>
      <textarea class="ed-notes" data-field="notes">${escHtml(entity.notes || '')}</textarea>
    </div>
    <div class="ed-section">
      <label>Properties</label>
      <div class="ed-props">
        ${Object.entries(entity.properties || {}).map(([k, v]) =>
          `<div class="ed-prop"><span>${escHtml(k)}</span><span>${escHtml(String(v))}</span></div>`).join('')}
      </div>
      <div class="ed-prop-add">
        <input type="text" placeholder="Key" class="ed-prop-key">
        <input type="text" placeholder="Value" class="ed-prop-val">
        <button class="st-btn ed-prop-btn">+</button>
      </div>
    </div>
    <div class="ed-actions">
      <button class="st-btn ed-delete danger">Delete Entity</button>
    </div>
  `;

  // Event handlers
  const panel = detailPanel;
  panel.querySelector('.ed-close').onclick = () => panel.style.display = 'none';
  panel.querySelector('.ed-name').onchange = (e) => updateEntity(entityId, { name: e.target.value });
  panel.querySelector('.ed-kind').onchange = (e) => updateEntity(entityId, { kind: e.target.value });
  panel.querySelector('.ed-class').onchange = (e) => updateEntity(entityId, { classification: e.target.value });
  panel.querySelector('.ed-notes').onchange = (e) => updateEntity(entityId, { notes: e.target.value });
  panel.querySelector('.ed-delete').onclick = () => { deleteEntity(entityId); panel.style.display = 'none'; };
  panel.querySelector('.ed-alias-btn').onclick = () => {
    const input = panel.querySelector('.ed-alias-input');
    if (input.value.trim()) { addAlias(entityId, input.value.trim()); showEntityDetail(entityId); }
  };
  panel.querySelector('.ed-prop-btn').onclick = () => {
    const key = panel.querySelector('.ed-prop-key').value.trim();
    const val = panel.querySelector('.ed-prop-val').value.trim();
    if (key) {
      const props = { ...(entity.properties || {}), [key]: val };
      updateEntity(entityId, { properties: props });
      showEntityDetail(entityId);
    }
  };
  panel.querySelectorAll('.ed-alias-rm').forEach(btn => {
    btn.onclick = () => { removeAlias(entityId, btn.dataset.alias); showEntityDetail(entityId); };
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
