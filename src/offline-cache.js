/**
 * Offline Tile Caching — download map tiles for offline use via Service Worker.
 */

let cacheActive = false;

export function initOfflineCache() {
  const btn = document.getElementById('offline-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    cacheActive = !cacheActive;
    btn.classList.toggle('active', cacheActive);

    if (cacheActive) {
      showCachePanel();
    } else {
      document.getElementById('offline-panel')?.remove();
    }
  });
}

function showCachePanel() {
  let panel = document.getElementById('offline-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'offline-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>💾 Offline Cache</span><button class="panel-close" id="offline-close">✕</button></div>
    <div class="panel-body">
      <label>Tile source
        <select id="cache-source">
          <option value="osm">OpenStreetMap</option>
          <option value="topo">OpenTopoMap</option>
          <option value="satellite">ESRI Satellite</option>
        </select>
      </label>
      <label>Zoom range
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="cache-min-z" min="0" max="18" value="10" style="width:50px;">
          <span>to</span>
          <input type="number" id="cache-max-z" min="0" max="18" value="14" style="width:50px;">
        </div>
      </label>
      <div id="cache-tile-count" style="font-size:12px;color:#aaa;margin:4px 0;">Tiles: calculating…</div>
      <div style="display:flex;gap:8px;">
        <button class="map-action-btn" id="cache-download">⬇ Download Area</button>
        <button class="map-action-btn" id="cache-clear">🗑 Clear Cache</button>
      </div>
      <div id="cache-progress" style="margin-top:8px;"></div>
      <div id="cache-stats" style="font-size:11px;color:#888;margin-top:4px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('offline-close').onclick = () => {
    panel.remove();
    cacheActive = false;
    document.getElementById('offline-btn')?.classList.remove('active');
  };

  updateTileCount();
  document.getElementById('cache-min-z').oninput = updateTileCount;
  document.getElementById('cache-max-z').oninput = updateTileCount;

  document.getElementById('cache-download').onclick = () => downloadTiles();
  document.getElementById('cache-clear').onclick = () => clearCache();

  showCacheStats();
}

function updateTileCount() {
  const minZ = parseInt(document.getElementById('cache-min-z')?.value || '10');
  const maxZ = parseInt(document.getElementById('cache-max-z')?.value || '14');
  const el = document.getElementById('cache-tile-count');
  if (!el) return;

  // Estimate tiles for current view
  let totalTiles = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const tilesAtZoom = Math.pow(4, z - minZ);
    totalTiles += tilesAtZoom;
  }
  // Rough: assume view covers about 4 tiles at minZ
  totalTiles *= 4;
  el.textContent = `Estimated tiles: ~${totalTiles.toLocaleString()} (${(totalTiles * 30 / 1024).toFixed(1)} MB est.)`;
}

const TILE_URLS = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

async function downloadTiles() {
  const source = document.getElementById('cache-source')?.value || 'osm';
  const minZ = parseInt(document.getElementById('cache-min-z')?.value || '10');
  const maxZ = parseInt(document.getElementById('cache-max-z')?.value || '14');
  const progress = document.getElementById('cache-progress');

  if (!('caches' in window)) {
    if (progress) progress.innerHTML = '<span style="color:#f85149;">Cache API not available (requires HTTPS)</span>';
    return;
  }

  const cache = await caches.open('viewtopia-tiles-v1');
  const urlTemplate = TILE_URLS[source] || TILE_URLS.osm;

  // Get current view bounds (approximate from Cesium or fallback)
  let bounds = { minX: 0, maxX: 3, minY: 0, maxY: 3 };
  try {
    const viewer = window.__viewtopia_viewer;
    if (viewer) {
      const rect = viewer.camera.computeViewRectangle();
      if (rect) {
        const west = Cesium.Math.toDegrees(rect.west);
        const east = Cesium.Math.toDegrees(rect.east);
        const south = Cesium.Math.toDegrees(rect.south);
        const north = Cesium.Math.toDegrees(rect.north);
        bounds = getTileBounds(west, south, east, north, minZ);
      }
    }
  } catch { /* use default bounds */ }

  let downloaded = 0;
  let errors = 0;
  let total = 0;

  // Count total tiles
  for (let z = minZ; z <= maxZ; z++) {
    const scale = Math.pow(2, z - minZ);
    const xRange = (bounds.maxX - bounds.minX + 1) * scale;
    const yRange = (bounds.maxY - bounds.minY + 1) * scale;
    total += xRange * yRange;
  }

  if (progress) progress.innerHTML = `<progress value="0" max="${total}" style="width:100%;"></progress><br><span>0/${total}</span>`;

  for (let z = minZ; z <= maxZ; z++) {
    const scale = Math.pow(2, z - minZ);
    for (let x = bounds.minX * scale; x <= (bounds.maxX + 1) * scale - 1; x++) {
      for (let y = bounds.minY * scale; y <= (bounds.maxY + 1) * scale - 1; y++) {
        const url = urlTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
          downloaded++;
        } catch { errors++; }

        if (progress && downloaded % 10 === 0) {
          const prog = downloaded + errors;
          progress.innerHTML = `<progress value="${prog}" max="${total}" style="width:100%;"></progress><br><span>${prog}/${total} (${errors} errors)</span>`;
        }
      }
    }
  }

  if (progress) progress.innerHTML = `<span style="color:#3fb950;">✓ Downloaded ${downloaded} tiles (${errors} errors)</span>`;
  showCacheStats();
}

function getTileBounds(west, south, east, north, zoom) {
  const toTileX = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
  const toTileY = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));

  return {
    minX: toTileX(west, zoom),
    maxX: toTileX(east, zoom),
    minY: toTileY(north, zoom),
    maxY: toTileY(south, zoom),
  };
}

async function clearCache() {
  if (!('caches' in window)) return;
  await caches.delete('viewtopia-tiles-v1');
  const progress = document.getElementById('cache-progress');
  if (progress) progress.innerHTML = '<span style="color:#f0c000;">Cache cleared</span>';
  showCacheStats();
}

async function showCacheStats() {
  const el = document.getElementById('cache-stats');
  if (!el) return;

  if (!('caches' in window)) {
    el.textContent = 'Cache API not available';
    return;
  }

  try {
    const cache = await caches.open('viewtopia-tiles-v1');
    const keys = await cache.keys();
    if ('estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      el.textContent = `Cached tiles: ${keys.length} | Storage used: ${(est.usage / 1024 / 1024).toFixed(1)} MB / ${(est.quota / 1024 / 1024).toFixed(0)} MB`;
    } else {
      el.textContent = `Cached tiles: ${keys.length}`;
    }
  } catch {
    el.textContent = 'Unable to read cache stats';
  }
}
