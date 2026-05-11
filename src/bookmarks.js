/**
 * Bookmarks — save/restore camera positions with labels.
 * Persisted in localStorage, shareable via URL hash.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

const STORAGE_KEY = 'viewtopia-bookmarks';
let panelEl = null;

export function initBookmarks() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Create bookmark button in toolbar
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'bookmark-btn';
  btn.title = 'Bookmarks';
  btn.textContent = '🔖 Bookmarks';
  toolbar.appendChild(btn);

  // Create panel
  panelEl = document.createElement('div');
  panelEl.id = 'bookmark-panel';
  panelEl.className = 'bookmark-panel';
  panelEl.style.display = 'none';
  panelEl.innerHTML = `
    <div class="bk-header">
      <span>🔖 Bookmarks</span>
      <button class="bk-close">&times;</button>
    </div>
    <div class="bk-actions">
      <input type="text" id="bk-name" placeholder="Bookmark name…" class="bk-input" />
      <button id="bk-save" class="sep-btn">Save View</button>
    </div>
    <div id="bk-list" class="bk-list"></div>
  `;
  const vizContent = document.getElementById('viz-content') || document.body;
  vizContent.appendChild(panelEl);

  panelEl.querySelector('.bk-close').addEventListener('click', () => { panelEl.style.display = 'none'; });

  panelEl.querySelector('#bk-save').addEventListener('click', () => {
    const nameInput = panelEl.querySelector('#bk-name');
    const name = nameInput.value.trim() || `View ${getBookmarks().length + 1}`;
    saveCurrentView(name);
    nameInput.value = '';
  });

  btn.addEventListener('click', () => {
    panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
    if (panelEl.style.display === 'block') renderList();
  });

  // Restore from URL hash on load
  restoreFromHash();
}

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function setBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function saveCurrentView(name) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const carto = viewer.camera.positionCartographic;
  const bookmark = {
    id: crypto.randomUUID(),
    name,
    longitude: Cesium.Math.toDegrees(carto.longitude),
    latitude: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height,
    heading: Cesium.Math.toDegrees(viewer.camera.heading),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
    roll: Cesium.Math.toDegrees(viewer.camera.roll),
    timestamp: new Date().toISOString(),
  };

  const bookmarks = getBookmarks();
  bookmarks.push(bookmark);
  setBookmarks(bookmarks);
  renderList();
}

function flyToBookmark(bk) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(bk.longitude, bk.latitude, bk.height),
    orientation: {
      heading: Cesium.Math.toRadians(bk.heading),
      pitch: Cesium.Math.toRadians(bk.pitch),
      roll: Cesium.Math.toRadians(bk.roll),
    },
    duration: 2,
  });

  // Update URL hash for sharing
  const hash = `#bk=${bk.longitude.toFixed(6)},${bk.latitude.toFixed(6)},${bk.height.toFixed(0)},${bk.heading.toFixed(1)},${bk.pitch.toFixed(1)}`;
  history.replaceState(null, '', hash);
}

function deleteBookmark(id) {
  setBookmarks(getBookmarks().filter(b => b.id !== id));
  renderList();
}

function renderList() {
  const list = document.getElementById('bk-list');
  if (!list) return;

  const bookmarks = getBookmarks();
  if (bookmarks.length === 0) {
    list.innerHTML = '<div class="bk-empty">No bookmarks yet</div>';
    return;
  }

  list.innerHTML = bookmarks.map(bk => `
    <div class="bk-item" data-id="${bk.id}">
      <div class="bk-item-info">
        <span class="bk-name">${escapeHtml(bk.name)}</span>
        <span class="bk-coords">${bk.latitude.toFixed(4)}, ${bk.longitude.toFixed(4)}</span>
      </div>
      <div class="bk-item-actions">
        <button class="bk-fly" title="Fly to">✈</button>
        <button class="bk-share" title="Copy link">🔗</button>
        <button class="bk-delete" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.bk-fly').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.bk-item').dataset.id;
      const bk = bookmarks.find(b => b.id === id);
      if (bk) flyToBookmark(bk);
    });
  });

  list.querySelectorAll('.bk-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.bk-item').dataset.id;
      const bk = bookmarks.find(b => b.id === id);
      if (bk) {
        const url = `${location.origin}${location.pathname}#bk=${bk.longitude.toFixed(6)},${bk.latitude.toFixed(6)},${bk.height.toFixed(0)},${bk.heading.toFixed(1)},${bk.pitch.toFixed(1)}`;
        navigator.clipboard.writeText(url).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '🔗'; }, 1500);
        });
      }
    });
  });

  list.querySelectorAll('.bk-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteBookmark(btn.closest('.bk-item').dataset.id);
    });
  });
}

function restoreFromHash() {
  const hash = location.hash;
  if (!hash.startsWith('#bk=')) return;

  const parts = hash.slice(4).split(',').map(Number);
  if (parts.length < 3) return;

  const [longitude, latitude, height, heading = 0, pitch = -30] = parts;
  const viewer = getCesiumViewer();
  if (!viewer) return;

  setTimeout(() => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0,
      },
      duration: 2,
    });
  }, 1000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
