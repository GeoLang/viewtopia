/**
 * 3D model import — load glTF/GLB/IFC files into the 3D viewer.
 * Supports positioning models at a clicked location or at specified coordinates.
 */
import { getCesiumViewer } from './renderers.js';

let panel;

export function initModelImport() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'model-import-btn';
  btn.title = 'Import 3D model';
  btn.textContent = '🏗 Model';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'model-import-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="mi-header">
      <span>🏗 3D Model Import</span>
      <button id="mi-close">×</button>
    </div>
    <div class="mi-body">
      <label>Model file (glTF/GLB):
        <input type="file" id="mi-file" accept=".gltf,.glb,.obj" />
      </label>
      <label>Or URL:
        <input type="text" id="mi-url" placeholder="https://…/model.glb" />
      </label>
      <div class="mi-coords">
        <label>Lon: <input type="number" id="mi-lon" step="0.000001" value="0" /></label>
        <label>Lat: <input type="number" id="mi-lat" step="0.000001" value="0" /></label>
        <label>Height: <input type="number" id="mi-height" step="1" value="0" /></label>
      </div>
      <div class="mi-transform">
        <label>Scale: <input type="number" id="mi-scale" step="0.1" value="1" min="0.01" /></label>
        <label>Heading: <input type="number" id="mi-heading" step="1" value="0" />°</label>
      </div>
      <div class="mi-actions">
        <button id="mi-place" class="map-action-btn">📍 Place at coords</button>
        <button id="mi-click" class="map-action-btn">🖱 Click to place</button>
        <button id="mi-load-url" class="map-action-btn">🔗 Load URL</button>
      </div>
      <div id="mi-status"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('mi-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('mi-place').addEventListener('click', placeFromCoords);
  document.getElementById('mi-click').addEventListener('click', placeByClick);
  document.getElementById('mi-load-url').addEventListener('click', loadFromUrl);
  document.getElementById('mi-file').addEventListener('change', handleFileSelect);
}

let pendingModelUrl = null;

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  pendingModelUrl = URL.createObjectURL(file);
  document.getElementById('mi-status').textContent = `File ready: ${file.name}`;
}

function loadFromUrl() {
  const url = document.getElementById('mi-url').value.trim();
  if (!url) return;
  pendingModelUrl = url;
  placeFromCoords();
}

function placeFromCoords() {
  if (!pendingModelUrl) {
    document.getElementById('mi-status').textContent = 'Select a file or enter URL first';
    return;
  }

  const lon = parseFloat(document.getElementById('mi-lon').value);
  const lat = parseFloat(document.getElementById('mi-lat').value);
  const height = parseFloat(document.getElementById('mi-height').value) || 0;
  const scale = parseFloat(document.getElementById('mi-scale').value) || 1;
  const heading = parseFloat(document.getElementById('mi-heading').value) || 0;

  addModel(pendingModelUrl, lon, lat, height, scale, heading);
}

function placeByClick() {
  if (!pendingModelUrl) {
    document.getElementById('mi-status').textContent = 'Select a file or enter URL first';
    return;
  }

  const viewer = getCesiumViewer();
  if (!viewer) return;

  document.getElementById('mi-status').textContent = 'Click on the globe to place model…';
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const cart = viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
    if (cart) {
      const carto = Cesium.Cartographic.fromCartesian(cart);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const scale = parseFloat(document.getElementById('mi-scale').value) || 1;
      const heading = parseFloat(document.getElementById('mi-heading').value) || 0;
      addModel(pendingModelUrl, lon, lat, carto.height, scale, heading);
    }
    handler.destroy();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function addModel(url, lon, lat, height, scale, headingDeg) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(headingDeg), 0, 0
  );
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

  const entity = viewer.entities.add({
    position,
    orientation,
    model: {
      uri: url,
      scale,
      minimumPixelSize: 32,
      maximumScale: 20000,
    },
  });

  viewer.flyTo(entity);
  document.getElementById('mi-status').textContent = `Model placed at ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}
