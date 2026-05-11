/**
 * Layer manager — reorder, toggle visibility, opacity, remove layers.
 */
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

let panelEl;
let layers = []; // { id, name, visible, opacity, cesiumLayer?, leafletLayer?, type }

export function initLayerManager() {
  panelEl = document.getElementById('layer-panel');
  if (!panelEl) return;

  panelEl.innerHTML = `
    <div class="layer-panel-header">
      <span>🗂 Layers</span>
      <button id="layer-panel-toggle" class="layer-toggle-btn" title="Toggle layers">▾</button>
    </div>
    <div id="layer-list" class="layer-list"></div>
  `;

  document.getElementById('layer-panel-toggle').addEventListener('click', () => {
    const list = document.getElementById('layer-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
  });

  refreshUI();
}

export function addLayer(opts) {
  const id = 'layer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const layer = { id, name: opts.name || 'Untitled', visible: true, opacity: 1, type: opts.type || 'custom', ...opts };
  layers.push(layer);
  refreshUI();
  return id;
}

export function removeLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx < 0) return;
  const layer = layers[idx];
  // Remove from viewers
  const viewer = getCesiumViewer();
  if (viewer && layer.cesiumLayer) {
    try { viewer.dataSources.remove(layer.cesiumLayer, true); } catch {}
    try { viewer.entities.removeAll(); } catch {}
  }
  const map = getLeafletMap();
  if (map && layer.leafletLayer) {
    try { map.removeLayer(layer.leafletLayer); } catch {}
  }
  layers.splice(idx, 1);
  refreshUI();
}

export function getLayers() { return layers; }

function refreshUI() {
  const list = document.getElementById('layer-list');
  if (!list) return;
  list.innerHTML = '';

  if (layers.length === 0) {
    list.innerHTML = '<div class="layer-empty">No layers added</div>';
    return;
  }

  for (const layer of [...layers].reverse()) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = `
      <label class="layer-vis">
        <input type="checkbox" ${layer.visible ? 'checked' : ''} data-id="${layer.id}" class="layer-vis-cb" />
        <span class="layer-name">${escapeHtml(layer.name)}</span>
      </label>
      <input type="range" min="0" max="100" value="${Math.round(layer.opacity * 100)}" class="layer-opacity" data-id="${layer.id}" title="Opacity" />
      <button class="layer-remove" data-id="${layer.id}" title="Remove">×</button>
    `;
    list.appendChild(row);
  }

  // Events
  list.querySelectorAll('.layer-vis-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const layer = layers.find(l => l.id === e.target.dataset.id);
      if (layer) {
        layer.visible = e.target.checked;
        applyVisibility(layer);
      }
    });
  });

  list.querySelectorAll('.layer-opacity').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const layer = layers.find(l => l.id === e.target.dataset.id);
      if (layer) {
        layer.opacity = parseInt(e.target.value) / 100;
        applyOpacity(layer);
      }
    });
  });

  list.querySelectorAll('.layer-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      removeLayer(e.target.dataset.id);
    });
  });
}

function applyVisibility(layer) {
  if (layer.cesiumLayer) {
    if (layer.cesiumLayer.show !== undefined) layer.cesiumLayer.show = layer.visible;
  }
  if (layer.leafletLayer) {
    const map = getLeafletMap();
    if (map) {
      if (layer.visible) map.addLayer(layer.leafletLayer);
      else map.removeLayer(layer.leafletLayer);
    }
  }
}

function applyOpacity(layer) {
  if (layer.cesiumLayer && layer.cesiumLayer.alpha !== undefined) {
    layer.cesiumLayer.alpha = layer.opacity;
  }
  if (layer.leafletLayer && layer.leafletLayer.setOpacity) {
    layer.leafletLayer.setOpacity(layer.opacity);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
