/**
 * Asset Catalogue — connects to TileTopia's REST API to list, upload,
 * and load 3D tilesets into the CesiumJS viewer.
 *
 * Shows an asset panel in the sidebar of the viz area. Greyed out when
 * TileTopia is disconnected; fully interactive when connected.
 */
import * as Cesium from 'cesium';
import { hasTileTopia, getTileTopiaBase, onBackendChange } from './backends.js';

let cesiumViewer = null;
const loadedTilesets = new Map();

/** Store a reference to the Cesium viewer */
export function setAssetViewer(viewer) {
  cesiumViewer = viewer;
}

/** Initialize the asset panel UI and start listening for backend changes */
export function initAssetCatalogue() {
  const panel = document.getElementById('asset-panel');
  if (!panel) return;

  // Re-render when backend status changes
  onBackendChange(() => renderAssetPanel());

  // Initial render
  renderAssetPanel();

  // Wire upload button
  const uploadInput = document.getElementById('asset-upload-input');
  const uploadBtn = document.getElementById('asset-upload-btn');
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', handleUpload);
  }
}

/** Render asset list — shows assets when connected, placeholder when not */
async function renderAssetPanel() {
  const list = document.getElementById('asset-list-items');
  const uploadSection = document.getElementById('asset-upload-section');
  const statusEl = document.getElementById('asset-status');
  if (!list) return;

  if (!hasTileTopia()) {
    list.innerHTML = '<div class="asset-empty">TileTopia not connected</div>';
    if (uploadSection) uploadSection.classList.add('disabled');
    if (statusEl) statusEl.textContent = 'Disconnected';
    return;
  }

  if (uploadSection) uploadSection.classList.remove('disabled');
  if (statusEl) statusEl.textContent = 'Connected';

  try {
    const res = await fetch(`${getTileTopiaBase()}/assets`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const assets = await res.json();

    if (assets.length === 0) {
      list.innerHTML = '<div class="asset-empty">No assets — upload a file to get started</div>';
      return;
    }

    list.innerHTML = assets.map(a => `
      <div class="asset-item" data-id="${sanitize(a.id)}">
        <div class="asset-name">${sanitize(a.name)}</div>
        <div class="asset-meta">
          <span class="asset-type">${sanitize(a.asset_type || 'unknown')}</span>
          <span class="asset-status ${sanitize(a.status)}">${sanitize(a.status)}</span>
          ${a.size_bytes ? `<span class="asset-size">${formatBytes(a.size_bytes)}</span>` : ''}
        </div>
      </div>
    `).join('');

    // Click to load tileset
    list.querySelectorAll('.asset-item').forEach(el => {
      el.addEventListener('click', () => loadTileset(el.dataset.id));
    });
  } catch (e) {
    list.innerHTML = `<div class="asset-empty">Failed to load assets: ${sanitize(e.message)}</div>`;
  }
}

/** Load a 3D tileset into the CesiumJS viewer */
async function loadTileset(assetId) {
  if (!cesiumViewer) return;

  if (loadedTilesets.has(assetId)) {
    cesiumViewer.flyTo(loadedTilesets.get(assetId));
    return;
  }

  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      `${getTileTopiaBase()}/assets/${encodeURIComponent(assetId)}/tileset.json`
    );
    cesiumViewer.scene.primitives.add(tileset);
    loadedTilesets.set(assetId, tileset);
    cesiumViewer.flyTo(tileset);

    // Mark active in list
    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.asset-item[data-id="${CSS.escape(assetId)}"]`);
    if (activeEl) activeEl.classList.add('active');
  } catch (e) {
    console.error('Failed to load tileset:', e);
  }
}

/** Handle file upload to TileTopia */
async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file || !hasTileTopia()) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const assetType = ['las', 'laz', 'e57', 'ply'].includes(ext) ? 'pointcloud'
    : ['tif', 'tiff', 'hgt', 'dted'].includes(ext) ? 'terrain'
    : ['geojson', 'json', 'shp', 'kml', 'gpkg'].includes(ext) ? 'vector'
    : 'model';

  const statusEl = document.getElementById('asset-status');
  if (statusEl) statusEl.textContent = 'Uploading…';

  try {
    // Create asset entry
    const createRes = await fetch(`${getTileTopiaBase()}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, asset_type: assetType }),
    });

    if (!createRes.ok) throw new Error(`Create failed: ${createRes.status}`);
    const asset = await createRes.json();

    // Upload file data
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch(`${getTileTopiaBase()}/assets/${encodeURIComponent(asset.id)}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    if (statusEl) statusEl.textContent = 'Upload complete';
    renderAssetPanel();
  } catch (err) {
    console.error('Upload error:', err);
    if (statusEl) statusEl.textContent = 'Upload failed';
  }

  // Reset input
  e.target.value = '';
}

/** Escape HTML to prevent XSS */
function sanitize(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Format bytes into human-readable string */
function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i ? 1 : 0)} ${units[i]}`;
}
