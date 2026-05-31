/**
 * Portal — Content catalog for discovering, sharing, and managing geospatial items.
 *
 * Provides an ArcGIS Portal / Google Earth Engine catalog equivalent:
 * - Item catalog with search and filtering
 * - Item types: maps, layers, apps, datasets, stories
 * - Sharing levels: private, organization, public
 * - Tags, categories, and metadata
 * - Thumbnail generation and display
 */

const API = '/api/v1/portal';

/**
 * @typedef {Object} PortalItem
 * @property {string} id
 * @property {string} title
 * @property {string} type - map|layer|app|dataset|story
 * @property {string} owner
 * @property {string} description
 * @property {string[]} tags
 * @property {string} sharing - private|org|public
 * @property {string} thumbnail
 * @property {string} created
 * @property {string} modified
 * @property {Object} [extent] - {xmin, ymin, xmax, ymax}
 * @property {Object} [metadata] - Additional key-value metadata
 */

/** @type {PortalItem[]} */
let catalogItems = [];
let catalogPanel = null;

/**
 * Initialize the portal catalog UI.
 */
export function initPortal() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'portal-btn';
  btn.title = 'Content Catalog';
  btn.textContent = '🗂️ Catalog';
  toolbar.appendChild(btn);

  btn.addEventListener('click', toggleCatalog);
}

/**
 * Toggle the catalog panel visibility.
 */
function toggleCatalog() {
  if (catalogPanel && catalogPanel.style.display !== 'none') {
    catalogPanel.style.display = 'none';
    return;
  }
  showCatalog();
}

/**
 * Show the catalog panel and load items.
 */
async function showCatalog() {
  if (!catalogPanel) {
    catalogPanel = createCatalogPanel();
    document.body.appendChild(catalogPanel);
  }
  catalogPanel.style.display = 'flex';
  await refreshCatalog();
}

/**
 * Create the catalog panel DOM.
 */
function createCatalogPanel() {
  const panel = document.createElement('div');
  panel.id = 'portal-catalog';
  panel.className = 'portal-panel';
  panel.innerHTML = `
    <div class="portal-header">
      <h2>Content Catalog</h2>
      <button class="portal-close" aria-label="Close catalog">&times;</button>
    </div>
    <div class="portal-search">
      <input type="text" id="portal-search-input" placeholder="Search items..." />
      <select id="portal-type-filter">
        <option value="">All Types</option>
        <option value="map">Maps</option>
        <option value="layer">Layers</option>
        <option value="dataset">Datasets</option>
        <option value="story">Stories</option>
        <option value="app">Apps</option>
      </select>
      <select id="portal-sharing-filter">
        <option value="">All Access</option>
        <option value="public">Public</option>
        <option value="org">Organization</option>
        <option value="private">My Items</option>
      </select>
    </div>
    <div class="portal-items" id="portal-items-grid"></div>
    <div class="portal-footer">
      <button id="portal-add-item" class="portal-btn-primary">+ Add Item</button>
      <span id="portal-item-count"></span>
    </div>
  `;

  panel.querySelector('.portal-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  const searchInput = panel.querySelector('#portal-search-input');
  searchInput.addEventListener('input', debounce(() => renderItems(filterItems()), 300));

  const typeFilter = panel.querySelector('#portal-type-filter');
  typeFilter.addEventListener('change', () => renderItems(filterItems()));

  const sharingFilter = panel.querySelector('#portal-sharing-filter');
  sharingFilter.addEventListener('change', () => renderItems(filterItems()));

  panel.querySelector('#portal-add-item').addEventListener('click', showAddItemDialog);

  return panel;
}

/**
 * Fetch items from the portal API.
 */
async function refreshCatalog() {
  try {
    const token = localStorage.getItem('viewtopia_auth');
    const headers = {};
    if (token) {
      const auth = JSON.parse(token);
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
    }
    const resp = await fetch(`${API}/items`, { headers });
    if (resp.ok) {
      catalogItems = await resp.json();
    } else {
      // Fallback to local items
      catalogItems = getLocalItems();
    }
  } catch {
    catalogItems = getLocalItems();
  }
  renderItems(catalogItems);
}

/**
 * Get locally stored items (for offline/demo mode).
 */
function getLocalItems() {
  try {
    const stored = localStorage.getItem('viewtopia_portal_items');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save items locally.
 */
function saveLocalItems() {
  localStorage.setItem('viewtopia_portal_items', JSON.stringify(catalogItems));
}

/**
 * Filter items based on current search/filter state.
 */
function filterItems() {
  const query = document.getElementById('portal-search-input')?.value?.toLowerCase() || '';
  const typeFilter = document.getElementById('portal-type-filter')?.value || '';
  const sharingFilter = document.getElementById('portal-sharing-filter')?.value || '';

  return catalogItems.filter(item => {
    if (query && !item.title.toLowerCase().includes(query) &&
        !item.description?.toLowerCase().includes(query) &&
        !item.tags?.some(t => t.toLowerCase().includes(query))) {
      return false;
    }
    if (typeFilter && item.type !== typeFilter) return false;
    if (sharingFilter && item.sharing !== sharingFilter) return false;
    return true;
  });
}

/**
 * Render items in the grid.
 * @param {PortalItem[]} items
 */
function renderItems(items) {
  const grid = document.getElementById('portal-items-grid');
  if (!grid) return;

  const count = document.getElementById('portal-item-count');
  if (count) count.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  if (items.length === 0) {
    grid.innerHTML = '<p class="portal-empty">No items found. Add your first item to get started.</p>';
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="portal-item-card" data-id="${item.id}">
      <div class="portal-item-thumb" style="background-image: url('${item.thumbnail || ''}')">
        <span class="portal-item-type">${item.type}</span>
      </div>
      <div class="portal-item-info">
        <h3 class="portal-item-title">${escapeHtml(item.title)}</h3>
        <p class="portal-item-desc">${escapeHtml(item.description || '').slice(0, 80)}</p>
        <div class="portal-item-meta">
          <span class="portal-item-owner">${escapeHtml(item.owner || 'Unknown')}</span>
          <span class="portal-item-sharing">${item.sharing || 'private'}</span>
        </div>
        ${item.tags?.length ? `<div class="portal-item-tags">${item.tags.map(t => `<span class="portal-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.portal-item-card').forEach(card => {
    card.addEventListener('click', () => openItem(card.dataset.id));
  });
}

/**
 * Open an item (load map, view layer, etc.).
 */
function openItem(id) {
  const item = catalogItems.find(i => i.id === id);
  if (!item) return;

  // Dispatch event for other modules to handle
  window.dispatchEvent(new CustomEvent('portal:open-item', { detail: item }));
}

/**
 * Show dialog to add a new item.
 */
function showAddItemDialog() {
  const dialog = document.createElement('div');
  dialog.className = 'portal-dialog-overlay';
  dialog.innerHTML = `
    <div class="portal-dialog">
      <h3>Add New Item</h3>
      <form id="portal-add-form">
        <label>Title<input type="text" name="title" required /></label>
        <label>Type
          <select name="type">
            <option value="map">Map</option>
            <option value="layer">Layer</option>
            <option value="dataset">Dataset</option>
            <option value="story">Story</option>
            <option value="app">App</option>
          </select>
        </label>
        <label>Description<textarea name="description" rows="3"></textarea></label>
        <label>Tags (comma-separated)<input type="text" name="tags" /></label>
        <label>Sharing
          <select name="sharing">
            <option value="private">Private</option>
            <option value="org">Organization</option>
            <option value="public">Public</option>
          </select>
        </label>
        <div class="portal-dialog-actions">
          <button type="button" class="portal-btn-cancel">Cancel</button>
          <button type="submit" class="portal-btn-primary">Add</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.portal-btn-cancel').addEventListener('click', () => dialog.remove());

  dialog.querySelector('#portal-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const newItem = {
      id: crypto.randomUUID(),
      title: form.title.value,
      type: form.type.value,
      description: form.description.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean),
      sharing: form.sharing.value,
      owner: getCurrentUser(),
      thumbnail: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };

    await addItem(newItem);
    dialog.remove();
    renderItems(filterItems());
  });
}

/**
 * Add an item to the catalog.
 * @param {PortalItem} item
 */
export async function addItem(item) {
  try {
    const token = localStorage.getItem('viewtopia_auth');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      const auth = JSON.parse(token);
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
    }
    const resp = await fetch(`${API}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify(item),
    });
    if (resp.ok) {
      const saved = await resp.json();
      catalogItems.push(saved);
    } else {
      catalogItems.push(item);
      saveLocalItems();
    }
  } catch {
    catalogItems.push(item);
    saveLocalItems();
  }
}

/**
 * Delete an item from the catalog.
 * @param {string} id
 */
export async function deleteItem(id) {
  try {
    await fetch(`${API}/items/${id}`, { method: 'DELETE' });
  } catch { /* ignore */ }
  catalogItems = catalogItems.filter(i => i.id !== id);
  saveLocalItems();
  renderItems(filterItems());
}

/**
 * Search the catalog.
 * @param {string} query
 * @returns {PortalItem[]}
 */
export function searchCatalog(query) {
  const q = query.toLowerCase();
  return catalogItems.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.description?.toLowerCase().includes(q) ||
    item.tags?.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Get current user name.
 */
function getCurrentUser() {
  try {
    const auth = JSON.parse(localStorage.getItem('viewtopia_auth') || '{}');
    return auth.user?.name || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
