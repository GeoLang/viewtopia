/**
 * WMS/WMTS/WFS layer import — connect to any OGC service.
 * Adds layers to both Cesium and Leaflet views.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';
import { registerCommand } from './viewer-commands.js';

let panelEl = null;

export function initOGCLayers() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'ogc-btn';
  btn.title = 'Add WMS/WMTS layer';
  btn.textContent = '🌐 OGC';
  toolbar.appendChild(btn);

  panelEl = document.createElement('div');
  panelEl.id = 'ogc-panel';
  panelEl.className = 'bookmark-panel';
  panelEl.style.display = 'none';
  panelEl.innerHTML = `
    <div class="bk-header"><span>🌐 Add OGC Layer</span><button class="bk-close">&times;</button></div>
    <div class="ogc-form" style="padding:10px 12px;">
      <label class="sep-section">
        <span style="color:#94a3b8;font-size:.75rem">Service URL</span>
        <input type="text" id="ogc-url" class="bk-input" placeholder="https://example.com/wms" style="width:100%" />
      </label>
      <label class="sep-section" style="margin-top:6px">
        <span style="color:#94a3b8;font-size:.75rem">Type</span>
        <select id="ogc-type" class="tl-speed" style="width:100%;padding:5px">
          <option value="wms">WMS</option>
          <option value="wmts">WMTS</option>
          <option value="wfs">WFS (GeoJSON)</option>
          <option value="xyz">XYZ Tiles</option>
        </select>
      </label>
      <label class="sep-section" style="margin-top:6px">
        <span style="color:#94a3b8;font-size:.75rem">Layer Name</span>
        <input type="text" id="ogc-layer" class="bk-input" placeholder="Layer name" style="width:100%" />
      </label>
      <button id="ogc-add" class="sep-btn" style="margin-top:8px;width:100%">Add Layer</button>
      <div id="ogc-status" style="color:#64748b;font-size:.75rem;margin-top:6px"></div>
    </div>
  `;
  const vizContent = document.getElementById('viz-content') || document.body;
  vizContent.appendChild(panelEl);

  panelEl.querySelector('.bk-close').addEventListener('click', () => { panelEl.style.display = 'none'; });
  btn.addEventListener('click', () => {
    panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('ogc-add').addEventListener('click', addOGCLayer);

  // Register commands for agent use
  registerCommand('add_wms', (params) => {
    if (params.url && params.layer) addWMS(params.url, params.layer);
  });

  registerCommand('add_wmts', (params) => {
    if (params.url && params.layer) addWMTS(params.url, params.layer);
  });

  registerCommand('add_wfs', (params) => {
    if (params.url && params.layer) addWFS(params.url, params.layer);
  });

  registerCommand('add_xyz', (params) => {
    if (params.url) addXYZ(params.url, params.label || 'XYZ Layer');
  });
}

function addOGCLayer() {
  const url = document.getElementById('ogc-url').value.trim();
  const type = document.getElementById('ogc-type').value;
  const layer = document.getElementById('ogc-layer').value.trim();
  const status = document.getElementById('ogc-status');

  if (!url) { status.textContent = 'Enter a URL'; return; }

  try {
    switch (type) {
      case 'wms': addWMS(url, layer); break;
      case 'wmts': addWMTS(url, layer); break;
      case 'wfs': addWFS(url, layer); break;
      case 'xyz': addXYZ(url, layer || 'XYZ Layer'); break;
    }
    status.textContent = `Added ${type.toUpperCase()} layer`;
    status.style.color = '#3fb950';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    status.style.color = '#f85149';
  }
}

function addWMS(url, layerName) {
  const viewer = getCesiumViewer();
  if (viewer) {
    const provider = new Cesium.WebMapServiceImageryProvider({
      url,
      layers: layerName,
      parameters: { transparent: true, format: 'image/png' },
    });
    viewer.imageryLayers.addImageryLayer(new Cesium.ImageryLayer(provider));
  }

  const map = getLeafletMap();
  if (map && window.L) {
    window.L.tileLayer.wms(url, {
      layers: layerName,
      format: 'image/png',
      transparent: true,
    }).addTo(map);
  }
}

function addWMTS(url, layerName) {
  const viewer = getCesiumViewer();
  if (viewer) {
    try {
      Cesium.WebMapTileServiceImageryProvider.fromUrl(url, {
        layer: layerName,
        style: 'default',
        tileMatrixSetID: 'default028mm',
      }).then(provider => {
        viewer.imageryLayers.addImageryLayer(new Cesium.ImageryLayer(provider));
      });
    } catch { /* ignore */ }
  }
}

async function addWFS(url, layerName) {
  const wfsUrl = `${url}?service=WFS&version=2.0.0&request=GetFeature&typeName=${encodeURIComponent(layerName)}&outputFormat=application/json&count=5000`;

  const viewer = getCesiumViewer();
  if (viewer) {
    try {
      const ds = await Cesium.GeoJsonDataSource.load(wfsUrl, {
        stroke: Cesium.Color.CYAN,
        fill: Cesium.Color.CYAN.withAlpha(0.2),
        strokeWidth: 2,
      });
      viewer.dataSources.add(ds);
      viewer.flyTo(ds);
    } catch (e) {
      console.error('WFS load failed:', e);
    }
  }

  const map = getLeafletMap();
  if (map && window.L) {
    try {
      const res = await fetch(wfsUrl);
      if (res.ok) {
        const geojson = await res.json();
        window.L.geoJSON(geojson, {
          style: { color: '#00bcd4', weight: 1.5, fillOpacity: 0.15 },
        }).addTo(map);
      }
    } catch (e) {
      console.error('WFS load failed:', e);
    }
  }
}

function addXYZ(url, label) {
  const viewer = getCesiumViewer();
  if (viewer) {
    const provider = new Cesium.UrlTemplateImageryProvider({ url });
    viewer.imageryLayers.addImageryLayer(new Cesium.ImageryLayer(provider));
  }

  const map = getLeafletMap();
  if (map && window.L) {
    window.L.tileLayer(url).addTo(map);
  }
}
