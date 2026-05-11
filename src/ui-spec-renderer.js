/**
 * UI Spec Renderer — handles map/image/table specs from the GeoLang agent.
 *
 * When the agent returns a UI spec (e.g. after analysis), this module
 * renders it in the appropriate view container.
 */
import { getLeafletMap, initLeafletMap } from './leaflet-view.js';
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getGeoLangBase } from './backends.js';
import { showTab } from './tabs.js';

const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

let layerMeta = [];

export function getLayerMeta() {
  return layerMeta;
}

function clearLayers(map) {
  for (const lm of layerMeta) {
    try { map.removeLayer(lm.leafletLayer); } catch { /* ignore */ }
  }
  layerMeta = [];
  // Also clear 3D data sources
  const viewer = getCesiumViewer();
  if (viewer) {
    try { viewer.dataSources.removeAll(); } catch { /* ignore */ }
  }
  const panel = document.getElementById('layer-panel');
  if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
}

export async function renderUISpec(spec) {
  document.getElementById('placeholder').style.display = 'none';

  if (spec.ui_type === 'map' || spec.type === 'map') {
    showTab('map');
    const map = initLeafletMap();
    const base = getGeoLangBase();

    // Clear previous layers before rendering new spec
    clearLayers(map);

    const layers = spec.layers || [];
    for (let i = 0; i < layers.length; i++) {
      const layerDef = layers[i];
      const filename = (layerDef.file || layerDef.path || '').replace(/^.*\//, '');
      const color = layerDef.color || LAYER_COLORS[i % LAYER_COLORS.length];

      try {
        const res = await fetch(`${base}/geojson/${filename}`);
        if (!res.ok) continue;
        const geojson = await res.json();

        const firstFeat = geojson.features?.find(f => f.geometry);
        const isPoint = firstFeat && /^(Point|MultiPoint)$/.test(firstFeat.geometry.type);

        const L = window.L;
        const geoLayer = L.geoJSON(geojson, {
          style: { color, weight: 1.5, fillOpacity: 0.2 },
          pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 5, fillColor: color, color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.8,
          }),
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            const entries = Object.entries(props).filter(([, v]) =>
              v != null && v !== '' && !(typeof v === 'number' && !isFinite(v)) && !/^(nan|none|null)$/i.test(String(v))
            );
            if (entries.length === 0) return;
            const rows = entries.map(([k, v]) =>
              `<tr><td>${k}</td><td>${typeof v === 'number' ? Number(v.toFixed(4)) : v}</td></tr>`
            ).join('');
            layer.on('click', e => {
              L.popup({ maxWidth: 320, maxHeight: 250 })
                .setLatLng(e.latlng)
                .setContent(`<div class="feat-popup"><table>${rows}</table></div>`)
                .openOn(map);
            });
          },
        });

        let leafletLayer;
        if (isPoint && typeof L.markerClusterGroup === 'function') {
          const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, showCoverageOnHover: false });
          cluster.addLayer(geoLayer);
          cluster.addTo(map);
          leafletLayer = cluster;
        } else {
          geoLayer.addTo(map);
          leafletLayer = geoLayer;
        }

        layerMeta.push({
          name: layerDef.name || filename,
          file: filename,
          color,
          leafletLayer,
          visible: true,
          opacity: 1,
          geojsonCache: geojson,
        });
      } catch (e) {
        console.error('Layer load error:', e);
      }
    }

    // Fit bounds
    if (layerMeta.length > 0) {
      let bounds = null;
      for (const lm of layerMeta) {
        try {
          const b = lm.leafletLayer.getBounds();
          if (b.isValid()) bounds = bounds ? bounds.extend(b) : b;
        } catch { /* skip */ }
      }
      if (bounds?.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: spec.zoom || 14 });
      }
    } else if (spec.center_lon != null && spec.center_lat != null) {
      map.setView([spec.center_lat, spec.center_lon], spec.zoom || 13);
    }

    rebuildLayerPanel();

    // Also load into 3D view if available
    const viewer = getCesiumViewer();
    if (viewer) {
      for (const lm of layerMeta) {
        try {
          const { default: Cesium } = await import('cesium');
          const ds = await Cesium.GeoJsonDataSource.load(lm.geojsonCache, {
            stroke: Cesium.Color.fromCssColorString(lm.color),
            fill: Cesium.Color.fromCssColorString(lm.color).withAlpha(0.3),
            strokeWidth: 2,
          });
          viewer.dataSources.add(ds);
        } catch { /* 3D loading is best-effort */ }
      }
    }

  } else if (spec.ui_type === 'image' || spec.type === 'image') {
    showTab('image');
    const filename = (spec.image_path || spec.path || '').replace(/^.*\//, '');
    const base = getGeoLangBase();
    document.getElementById('img-el').src = `${base}/outputs/${filename}`;
    document.getElementById('img-title').textContent = spec.title || filename;
    document.getElementById('viz-label').textContent = spec.title || filename;

  } else if (spec.ui_type === 'table' || spec.type === 'table') {
    showTab('table');
    document.getElementById('table-title').textContent = spec.title || 'Results';
    document.getElementById('viz-label').textContent = spec.title || 'Table';

    const thead = document.querySelector('#data-table thead');
    const tbody = document.querySelector('#data-table tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Handle both array and semicolon-separated column formats
    const columns = Array.isArray(spec.columns)
      ? spec.columns
      : (spec.columns || '').split(';').filter(Boolean);
    const rows = Array.isArray(spec.rows)
      ? spec.rows.map(r => Array.isArray(r) ? r : String(r).split('|'))
      : (spec.rows || '').split('||').map(r => r.split('|'));

    if (columns.length) {
      const headerRow = document.createElement('tr');
      columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.trim();
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
    }

    rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = (cell || '').trim();
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
}

function rebuildLayerPanel() {
  const panel = document.getElementById('layer-panel');
  if (!panel) return;
  panel.innerHTML = '';
  if (layerMeta.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const map = getLeafletMap();

  layerMeta.forEach((lm) => {
    const row = document.createElement('div');
    row.className = 'layer-row';

    // Colour swatch
    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    swatch.style.background = lm.color;
    row.appendChild(swatch);

    // Name
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = lm.name;
    name.title = lm.name;
    row.appendChild(name);

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-btn' + (lm.visible ? ' active' : '');
    visBtn.innerHTML = '👁';
    visBtn.title = 'Toggle visibility';
    visBtn.onclick = () => {
      lm.visible = !lm.visible;
      visBtn.classList.toggle('active', lm.visible);
      if (lm.visible) { if (map && lm.leafletLayer) map.addLayer(lm.leafletLayer); }
      else { if (map && lm.leafletLayer) map.removeLayer(lm.leafletLayer); }
    };
    row.appendChild(visBtn);

    // Zoom-to-layer
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'layer-btn';
    zoomBtn.innerHTML = '⊞';
    zoomBtn.title = 'Zoom to layer';
    zoomBtn.onclick = () => {
      if (!map || !lm.leafletLayer) return;
      try {
        const b = lm.leafletLayer.getBounds();
        if (b?.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
      } catch { /* no bounds */ }
    };
    row.appendChild(zoomBtn);

    // Opacity slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 1; slider.step = 0.05; slider.value = lm.opacity;
    slider.className = 'layer-opacity';
    slider.title = 'Opacity';
    slider.oninput = () => {
      lm.opacity = parseFloat(slider.value);
      if (lm.leafletLayer?.setStyle) {
        lm.leafletLayer.setStyle({ fillOpacity: lm.opacity * 0.8, opacity: lm.opacity });
      }
    };
    row.appendChild(slider);

    // Download button
    const dlBtn = document.createElement('button');
    dlBtn.className = 'layer-btn';
    dlBtn.innerHTML = '⬇';
    dlBtn.title = 'Download';
    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = `${getGeoLangBase()}/download/${encodeURIComponent(lm.file)}`;
      a.download = lm.file;
      a.click();
    };
    row.appendChild(dlBtn);

    // Attribute table button
    if (lm.geojsonCache?.features?.length) {
      const attrBtn = document.createElement('button');
      attrBtn.className = 'layer-btn';
      attrBtn.innerHTML = '⊞';
      attrBtn.title = 'Attribute table';
      attrBtn.onclick = () => openAttrTable(lm);
      row.appendChild(attrBtn);
    }

    panel.appendChild(row);
  });
}

function openAttrTable(lm) {
  const modal = document.getElementById('attr-table-modal');
  if (!modal || !lm.geojsonCache?.features?.length) return;

  modal.style.display = 'flex';
  document.getElementById('attr-table-title').textContent = lm.name;

  const thead = document.querySelector('#attr-table thead');
  const tbody = document.querySelector('#attr-table tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const features = lm.geojsonCache.features;
  const keys = Object.keys(features[0].properties || {});

  const headerRow = document.createElement('tr');
  keys.forEach(k => {
    const th = document.createElement('th');
    th.textContent = k;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  features.slice(0, 500).forEach(f => {
    const tr = document.createElement('tr');
    keys.forEach(k => {
      const td = document.createElement('td');
      const v = f.properties[k];
      td.textContent = v != null ? String(v) : '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Wire up close button
document.getElementById('attr-table-close')?.addEventListener('click', () => {
  const modal = document.getElementById('attr-table-modal');
  if (modal) modal.style.display = 'none';
});
