/**
 * Shareable View Links — encode camera position, layers, and settings
 * into a URL hash so views can be bookmarked and shared.
 *
 * Format: #view=lat,lon,height,heading,pitch&layers=osm-buildings&basemap=osm
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

export function initShareLinks() {
  // Restore view from URL hash on load
  restoreFromHash();

  // Add share button to toolbar
  const toolbar = document.getElementById('toolbar-actions');
  if (toolbar) {
    const btn = document.createElement('button');
    btn.className = 'map-action-btn';
    btn.id = 'share-btn';
    btn.title = 'Share this view';
    btn.textContent = '🔗 Share';
    toolbar.appendChild(btn);

    btn.addEventListener('click', () => showSharePanel());
  }

  // Update URL hash as camera moves (debounced)
  let hashTimer = null;
  const viewer = getCesiumViewer();
  if (viewer) {
    viewer.camera.changed.addEventListener(() => {
      clearTimeout(hashTimer);
      hashTimer = setTimeout(updateHash, 1000);
    });
  }
}

function updateHash() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const carto = viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(6);
  const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(6);
  const height = Math.round(carto.height);
  const heading = Math.round(Cesium.Math.toDegrees(viewer.camera.heading));
  const pitch = Math.round(Cesium.Math.toDegrees(viewer.camera.pitch));

  const params = new URLSearchParams();
  params.set('view', `${lat},${lon},${height},${heading},${pitch}`);

  // Capture active basemap
  const basemap = document.getElementById('basemap-select')?.value;
  if (basemap && basemap !== 'osm') params.set('basemap', basemap);

  // Capture active layers (from toolbar buttons)
  const activeLayers = [];
  document.querySelectorAll('.map-action-btn.active').forEach(btn => {
    if (btn.id && btn.id !== 'share-btn') activeLayers.push(btn.id.replace('-btn', ''));
  });
  if (activeLayers.length > 0) params.set('layers', activeLayers.join(','));

  // Update hash without triggering hashchange
  const newHash = params.toString();
  if (location.hash.slice(1) !== newHash) {
    history.replaceState(null, '', `#${newHash}`);
  }
}

function restoreFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;

  try {
    const params = new URLSearchParams(hash);

    // Restore camera view
    const view = params.get('view');
    if (view) {
      const parts = view.split(',').map(Number);
      if (parts.length >= 3) {
        const [lat, lon, height, heading = 0, pitch = -45] = parts;
        // Delay to ensure viewer is initialized
        setTimeout(() => {
          const viewer = getCesiumViewer();
          if (viewer) {
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
              orientation: {
                heading: Cesium.Math.toRadians(heading),
                pitch: Cesium.Math.toRadians(pitch),
                roll: 0,
              },
            });
          }
        }, 1000);
      }
    }

    // Restore basemap
    const basemap = params.get('basemap');
    if (basemap) {
      setTimeout(() => {
        const sel = document.getElementById('basemap-select');
        if (sel) { sel.value = basemap; sel.dispatchEvent(new Event('change')); }
      }, 500);
    }

    // Restore active layers
    const layers = params.get('layers');
    if (layers) {
      setTimeout(() => {
        for (const layer of layers.split(',')) {
          const btn = document.getElementById(`${layer}-btn`);
          if (btn && !btn.classList.contains('active')) btn.click();
        }
      }, 1500);
    }
  } catch (e) {
    console.warn('[Share] Failed to restore from hash:', e);
  }
}

function showSharePanel() {
  let panel = document.getElementById('share-panel');
  if (panel) { panel.remove(); return; }

  // Generate the share URL
  updateHash();
  const url = location.href;

  // Generate embed code
  const embedCode = `<iframe src="${url}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;

  panel = document.createElement('div');
  panel.id = 'share-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🔗 Share View</span><button class="panel-close" id="share-close">✕</button></div>
    <div class="panel-body">
      <label style="font-size:0.72rem;color:#94a3b8">Share Link</label>
      <div style="display:flex;gap:4px;margin-bottom:8px">
        <input type="text" id="share-url" readonly value="${url.replace(/"/g, '&quot;')}"
          style="flex:1;font-size:0.7rem;padding:4px 6px;background:#0f1117;border:1px solid #2d3148;border-radius:4px;color:#e2e8f0;font-family:monospace">
        <button class="map-action-btn" id="share-copy">📋 Copy</button>
      </div>

      <label style="font-size:0.72rem;color:#94a3b8">Embed Code</label>
      <textarea id="share-embed" readonly rows="3"
        style="width:100%;font-size:0.65rem;padding:4px 6px;background:#0f1117;border:1px solid #2d3148;border-radius:4px;color:#e2e8f0;font-family:monospace;resize:none">${embedCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      <button class="map-action-btn" id="share-copy-embed" style="margin-top:4px">📋 Copy Embed</button>

      <div id="share-status" style="font-size:0.72rem;margin-top:6px;color:#3fb950"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('share-close').onclick = () => panel.remove();

  document.getElementById('share-copy').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('share-url').value);
    document.getElementById('share-status').textContent = 'Link copied!';
    setTimeout(() => { document.getElementById('share-status').textContent = ''; }, 2000);
  };

  document.getElementById('share-copy-embed').onclick = () => {
    navigator.clipboard.writeText(embedCode);
    document.getElementById('share-status').textContent = 'Embed code copied!';
    setTimeout(() => { document.getElementById('share-status').textContent = ''; }, 2000);
  };
}
