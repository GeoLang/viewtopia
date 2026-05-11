/**
 * COG/Raster viewer — load Cloud-Optimized GeoTIFFs with band math.
 * Uses Cesium imagery layer with URL template for COG tiles.
 */
import { getCesiumViewer } from './renderers.js';

let panel;

export function initRasterViewer() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'raster-btn';
  btn.title = 'Raster/COG viewer';
  btn.textContent = '🗺 Raster';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'raster-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="raster-header">
      <span>🗺 Raster / COG Viewer</span>
      <button id="raster-close">×</button>
    </div>
    <div class="raster-body">
      <label>COG URL or TileJSON:
        <input type="text" id="raster-url" placeholder="https://…/cog.tif or tiles/{z}/{x}/{y}.png" />
      </label>
      <label>Band math expression:
        <input type="text" id="raster-expr" placeholder="(b4-b3)/(b4+b3)" />
      </label>
      <div class="raster-options">
        <label>Min: <input type="number" id="raster-min" value="0" step="0.1" /></label>
        <label>Max: <input type="number" id="raster-max" value="1" step="0.1" /></label>
        <label>Colormap:
          <select id="raster-cmap">
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="rdylgn">RdYlGn</option>
            <option value="terrain">Terrain</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </label>
      </div>
      <div class="raster-presets">
        <button class="raster-preset" data-expr="(b4-b3)/(b4+b3)">NDVI</button>
        <button class="raster-preset" data-expr="(b3-b5)/(b3+b5)">NDWI</button>
        <button class="raster-preset" data-expr="b4">NIR</button>
        <button class="raster-preset" data-expr="(b1+b2+b3)/3">True color avg</button>
      </div>
      <div class="raster-actions">
        <button id="raster-load" class="map-action-btn">Load Raster</button>
        <button id="raster-load-cog" class="map-action-btn">Load via TileTopia</button>
      </div>
      <div id="raster-status"></div>
      <div id="raster-info"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('raster-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('raster-load').addEventListener('click', loadRasterDirect);
  document.getElementById('raster-load-cog').addEventListener('click', loadCOGViaTileTopia);

  panel.querySelectorAll('.raster-preset').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('raster-expr').value = el.dataset.expr;
    });
  });
}

function loadRasterDirect() {
  const url = document.getElementById('raster-url').value.trim();
  if (!url) return;

  const viewer = getCesiumViewer();
  if (!viewer) {
    document.getElementById('raster-status').textContent = 'Cesium not initialized';
    return;
  }

  try {
    // If URL has {z}/{x}/{y}, treat as tile URL
    if (url.includes('{z}') || url.includes('{x}')) {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url,
        maximumLevel: 18,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0.8;
      document.getElementById('raster-status').textContent = 'Raster tile layer added';

      import('./layer-manager.js').then(lm => {
        lm.addLayer({ name: 'Raster: ' + url.split('/').pop(), type: 'raster', cesiumLayer: layer });
      });
    } else {
      // Single image overlay
      document.getElementById('raster-status').textContent = 'For COG files, use "Load via TileTopia"';
    }
  } catch (e) {
    document.getElementById('raster-status').textContent = 'Error: ' + e.message;
  }
}

async function loadCOGViaTileTopia() {
  const url = document.getElementById('raster-url').value.trim();
  const expr = document.getElementById('raster-expr').value.trim();
  const cmap = document.getElementById('raster-cmap').value;
  const vmin = document.getElementById('raster-min').value;
  const vmax = document.getElementById('raster-max').value;

  if (!url) return;
  const status = document.getElementById('raster-status');
  status.textContent = 'Loading via TileTopia…';

  try {
    // Ask TileTopia to serve the COG as tiles
    const params = new URLSearchParams({ url, expression: expr, colormap: cmap, vmin, vmax });
    const res = await fetch(`/api/v1/cog/tiles?${params}`);
    if (!res.ok) throw new Error('TileTopia COG service unavailable');
    const data = await res.json();

    const viewer = getCesiumViewer();
    if (!viewer) return;

    const tileUrl = data.tiles?.[0] || `/api/v1/cog/tiles/{z}/{x}/{y}.png?url=${encodeURIComponent(url)}&expression=${encodeURIComponent(expr)}&colormap=${cmap}&vmin=${vmin}&vmax=${vmax}`;

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: tileUrl,
      maximumLevel: 18,
    });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = 0.8;

    status.textContent = 'COG loaded';

    // Show info
    if (data.bounds) {
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(...data.bounds),
      });
    }

    import('./layer-manager.js').then(lm => {
      lm.addLayer({ name: `COG: ${expr || 'RGB'}`, type: 'cog', cesiumLayer: layer });
    });
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
}
