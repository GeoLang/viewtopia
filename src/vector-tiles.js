/**
 * Vector tile (MVT) support — render Mapbox Vector Tiles from any source.
 * Uses MapLibre GL for rendering MVT on the 2D map tab.
 */

let panel;

export function initVectorTiles() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'mvt-btn';
  btn.title = 'Add vector tiles';
  btn.textContent = '🔷 MVT';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'mvt-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="mvt-header">
      <span>🔷 Vector Tiles</span>
      <button id="mvt-close">×</button>
    </div>
    <div class="mvt-body">
      <label>Tile URL (with {z}/{x}/{y}):
        <input type="text" id="mvt-url" placeholder="https://…/{z}/{x}/{y}.pbf" />
      </label>
      <label>Source layer name:
        <input type="text" id="mvt-layer" placeholder="default" value="default" />
      </label>
      <div class="mvt-style-row">
        <label>Color: <input type="color" id="mvt-color" value="#7c3aed" /></label>
        <label>Opacity: <input type="range" id="mvt-opacity" min="0" max="100" value="80" /></label>
      </div>
      <label>Type:
        <select id="mvt-type">
          <option value="fill">Fill (polygon)</option>
          <option value="line">Line</option>
          <option value="circle">Circle (point)</option>
        </select>
      </label>
      <div class="mvt-presets">
        <button class="mvt-preset" data-url="https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf" data-layer="water">OpenFreeMap Water</button>
        <button class="mvt-preset" data-url="https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf" data-layer="building">OpenFreeMap Buildings</button>
      </div>
      <button id="mvt-add" class="map-action-btn">+ Add Layer</button>
      <div id="mvt-status"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('mvt-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('mvt-add').addEventListener('click', addMVTLayer);

  // Presets
  panel.querySelectorAll('.mvt-preset').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('mvt-url').value = el.dataset.url;
      document.getElementById('mvt-layer').value = el.dataset.layer;
    });
  });
}

function addMVTLayer() {
  const url = document.getElementById('mvt-url').value.trim();
  if (!url) return;
  const sourceLayer = document.getElementById('mvt-layer').value.trim() || 'default';
  const color = document.getElementById('mvt-color').value;
  const opacity = parseInt(document.getElementById('mvt-opacity').value) / 100;
  const type = document.getElementById('mvt-type').value;
  const status = document.getElementById('mvt-status');

  // Try MapLibre first
  import('./renderers.js').then(({ switchRenderer, getRendererInfo }) => {
    const info = getRendererInfo?.();
    // Switch to MapLibre for MVT
    if (info?.type !== 'maplibre') {
      switchRenderer('maplibre');
    }

    setTimeout(() => {
      const container = document.getElementById('globe-container');
      const maplibreMap = container?.__maplibreMap;
      if (!maplibreMap) {
        status.textContent = 'MapLibre not available — switch to MapLibre renderer';
        return;
      }

      const sourceId = 'mvt-' + Date.now();
      const layerId = sourceId + '-layer';

      maplibreMap.addSource(sourceId, {
        type: 'vector',
        tiles: [url],
        maxzoom: 14,
      });

      const layerDef = {
        id: layerId,
        source: sourceId,
        'source-layer': sourceLayer,
      };

      if (type === 'fill') {
        layerDef.type = 'fill';
        layerDef.paint = { 'fill-color': color, 'fill-opacity': opacity };
      } else if (type === 'line') {
        layerDef.type = 'line';
        layerDef.paint = { 'line-color': color, 'line-width': 2, 'line-opacity': opacity };
      } else {
        layerDef.type = 'circle';
        layerDef.paint = { 'circle-color': color, 'circle-radius': 4, 'circle-opacity': opacity };
      }

      maplibreMap.addLayer(layerDef);
      status.textContent = `Layer added: ${sourceLayer}`;

      // Register in layer manager
      import('./layer-manager.js').then(lm => {
        lm.addLayer({ name: `MVT: ${sourceLayer}`, type: 'mvt' });
      });
    }, 500);
  });
}
