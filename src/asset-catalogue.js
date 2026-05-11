/**
 * Asset Catalogue — connects to TileTopia's REST API to list, upload,
 * and load 3D tilesets into the CesiumJS viewer.
 *
 * Shows an asset panel in the sidebar of the viz area. Greyed out when
 * TileTopia is disconnected; fully interactive when connected.
 */
import * as Cesium from 'cesium';
import { hasTileTopia, getTileTopiaBase, onBackendChange } from './backends.js';
import { getSetting } from './settings.js';

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

    list.innerHTML = assets.map(a => {
      const isReady = a.status === 'ready' || a.status === 'complete';
      const isProcessing = a.status === 'processing' || a.status === 'tiling';
      const icon = getAssetIcon(a.asset_type);
      const progress = isProcessing ? (a.progress ?? 0) : (isReady ? 100 : 0);

      return `
      <div class="asset-item ${isReady ? '' : 'disabled'}" data-id="${sanitize(a.id)}">
        <div class="asset-item-header">
          <span class="asset-icon">${icon}</span>
          <div class="asset-name-wrap">
            <div class="asset-name">${sanitize(a.name)}</div>
            <div class="asset-meta-row">
              <span class="asset-type-badge">${sanitize(a.asset_type || 'unknown')}</span>
              ${a.point_count ? `<span class="asset-stat">${formatNumber(a.point_count)} pts</span>` : ''}
              ${a.tile_count ? `<span class="asset-stat">${a.tile_count} tiles</span>` : ''}
              ${a.size_bytes ? `<span class="asset-stat">${formatBytes(a.size_bytes)}</span>` : ''}
            </div>
          </div>
          <span class="asset-status-dot ${sanitize(a.status)}"></span>
        </div>
        ${isProcessing ? `
          <div class="asset-progress-bar">
            <div class="asset-progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="asset-progress-text">${a.status_message || 'Tiling...'} ${progress}%</div>
        ` : ''}
        ${isReady ? `
          <div class="asset-actions">
            <button class="asset-action-btn asset-load-btn" data-id="${sanitize(a.id)}" title="Load in viewer">👁 View</button>
            <button class="asset-action-btn asset-info-btn" data-id="${sanitize(a.id)}" title="Show details">ℹ Info</button>
            <button class="asset-action-btn asset-remove-btn" data-id="${sanitize(a.id)}" title="Remove from viewer">✕</button>
          </div>
        ` : ''}
      </div>`;
    }).join('');

    // Wire click handlers
    list.querySelectorAll('.asset-load-btn').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); loadTileset(el.dataset.id); });
    });
    list.querySelectorAll('.asset-info-btn').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); showAssetInfo(el.dataset.id, assets); });
    });
    list.querySelectorAll('.asset-remove-btn').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); unloadTileset(el.dataset.id); });
    });
    list.querySelectorAll('.asset-item:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => loadTileset(el.dataset.id));
    });

    // Auto-refresh if any assets are still processing
    const hasProcessing = assets.some(a => a.status === 'processing' || a.status === 'tiling');
    if (hasProcessing) {
      setTimeout(renderAssetPanel, 3000);
    }
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

  // Enforce max upload size from settings
  const maxMb = getSetting('maxUploadMb') || 500;
  if (file.size > maxMb * 1024 * 1024) {
    const statusEl = document.getElementById('asset-status');
    if (statusEl) statusEl.textContent = `File too large (max ${maxMb} MB)`;
    e.target.value = '';
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const assetType = ['las', 'laz', 'e57', 'ply'].includes(ext) ? 'pointcloud'
    : ['tif', 'tiff', 'hgt', 'dted'].includes(ext) ? 'terrain'
    : ['geojson', 'json', 'shp', 'kml', 'gpkg'].includes(ext) ? 'vector'
    : 'model';

  const statusEl = document.getElementById('asset-status');
  if (statusEl) statusEl.textContent = 'Uploading…';

  // Show upload progress in the list
  const list = document.getElementById('asset-list-items');
  const progressEl = document.createElement('div');
  progressEl.className = 'asset-item';
  progressEl.innerHTML = `
    <div class="asset-item-header">
      <span class="asset-icon">${getAssetIcon(assetType)}</span>
      <div class="asset-name-wrap">
        <div class="asset-name">${sanitize(file.name)}</div>
        <div class="asset-meta-row"><span class="asset-stat">${formatBytes(file.size)}</span></div>
      </div>
    </div>
    <div class="asset-progress-bar"><div class="asset-progress-fill" id="upload-progress-fill" style="width:0%"></div></div>
    <div class="asset-progress-text" id="upload-progress-text">Uploading 0%...</div>
  `;
  if (list) list.prepend(progressEl);

  try {
    // Create asset entry
    const createRes = await fetch(`${getTileTopiaBase()}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, asset_type: assetType }),
    });

    if (!createRes.ok) throw new Error(`Create failed: ${createRes.status}`);
    const asset = await createRes.json();

    // Upload file with progress tracking via XMLHttpRequest
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getTileTopiaBase()}/assets/${encodeURIComponent(asset.id)}/upload`);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          const fill = document.getElementById('upload-progress-fill');
          const text = document.getElementById('upload-progress-text');
          if (fill) fill.style.width = `${pct}%`;
          if (text) text.textContent = `Uploading ${pct}%... (${formatBytes(ev.loaded)} / ${formatBytes(ev.total)})`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Upload network error'));

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });

    if (statusEl) statusEl.textContent = 'Tiling…';
    const text = document.getElementById('upload-progress-text');
    if (text) text.textContent = 'Upload complete — tiling in progress...';

    // Refresh panel to show tiling status
    setTimeout(renderAssetPanel, 1000);
  } catch (err) {
    console.error('Upload error:', err);
    if (statusEl) statusEl.textContent = 'Upload failed';
    progressEl.remove();
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

/** Format large numbers with K/M suffixes */
function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Get icon for asset type */
function getAssetIcon(type) {
  switch (type) {
    case 'pointcloud': return '☁';
    case 'terrain': return '⛰';
    case 'model': return '🏗';
    case 'vector': return '📐';
    default: return '📦';
  }
}

/** Unload a tileset from the viewer */
function unloadTileset(assetId) {
  if (!cesiumViewer) return;
  const tileset = loadedTilesets.get(assetId);
  if (tileset) {
    cesiumViewer.scene.primitives.remove(tileset);
    loadedTilesets.delete(assetId);
    const el = document.querySelector(`.asset-item[data-id="${CSS.escape(assetId)}"]`);
    if (el) el.classList.remove('active');
  }
}

/** Show detailed asset info in a panel */
async function showAssetInfo(assetId, assets) {
  const asset = assets?.find(a => a.id === assetId);
  if (!asset) return;

  let detail = document.getElementById('asset-detail-panel');
  if (detail) detail.remove();

  detail = document.createElement('div');
  detail.id = 'asset-detail-panel';
  detail.className = 'floating-panel';
  detail.innerHTML = `
    <div class="panel-header">
      <span>${getAssetIcon(asset.asset_type)} ${sanitize(asset.name)}</span>
      <button class="panel-close" onclick="this.closest('.floating-panel').remove()">✕</button>
    </div>
    <div class="panel-body" style="font-size:0.75rem">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">ID</td><td style="font-family:monospace;font-size:0.7rem">${sanitize(asset.id)}</td></tr>
        <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Type</td><td>${sanitize(asset.asset_type)}</td></tr>
        <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Status</td><td>${sanitize(asset.status)}</td></tr>
        ${asset.size_bytes ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">File size</td><td>${formatBytes(asset.size_bytes)}</td></tr>` : ''}
        ${asset.point_count ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Points</td><td>${formatNumber(asset.point_count)}</td></tr>` : ''}
        ${asset.tile_count ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Tiles</td><td>${asset.tile_count}</td></tr>` : ''}
        ${asset.geometric_error ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Geometric error</td><td>${asset.geometric_error.toFixed(2)}</td></tr>` : ''}
        ${asset.crs ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">CRS</td><td>${sanitize(asset.crs)}</td></tr>` : ''}
        ${asset.created_at ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Created</td><td>${new Date(asset.created_at).toLocaleString()}</td></tr>` : ''}
      </table>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(detail);
}
