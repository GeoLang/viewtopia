/**
 * Street-level photo / panorama viewer — integrates Mapillary imagery.
 */
import { getCesiumViewer } from './renderers.js';

let photoActive = false;

export function initPhotoViewer() {
  const btn = document.getElementById('photo-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    photoActive = !photoActive;
    btn.classList.toggle('active', photoActive);

    if (photoActive) {
      showPhotoPanel();
    } else {
      document.getElementById('photo-panel')?.remove();
    }
  });
}

function showPhotoPanel() {
  let panel = document.getElementById('photo-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'photo-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>📷 Street View</span><button class="panel-close" id="photo-close">✕</button></div>
    <div class="panel-body">
      <label>Mapillary Image ID
        <input type="text" id="photo-image-id" placeholder="e.g. 123456789">
      </label>
      <button class="map-action-btn" id="photo-load">Load Image</button>
      <button class="map-action-btn" id="photo-pick">Pick from Map</button>
      <div id="photo-container" style="margin-top:8px;border-radius:6px;overflow:hidden;background:#000;min-height:200px;display:flex;align-items:center;justify-content:center;color:#666;">
        Click "Pick from Map" then click a location
      </div>
      <div id="photo-meta" style="margin-top:4px;font-size:11px;color:#aaa;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('photo-close').onclick = () => {
    panel.remove();
    photoActive = false;
    document.getElementById('photo-btn')?.classList.remove('active');
  };

  document.getElementById('photo-load').onclick = () => {
    const id = document.getElementById('photo-image-id').value.trim();
    if (id) loadMapillaryImage(id);
  };

  document.getElementById('photo-pick').onclick = () => startPhotoPick();
}

function loadMapillaryImage(imageId) {
  const container = document.getElementById('photo-container');
  if (!container) return;

  // Mapillary embed
  container.innerHTML = `
    <iframe
      src="https://www.mapillary.com/embed?image_key=${encodeURIComponent(imageId)}&style=photo"
      width="100%" height="300"
      frameborder="0"
      style="border-radius:4px;"
      allow="fullscreen"
    ></iframe>
  `;
  const meta = document.getElementById('photo-meta');
  if (meta) meta.textContent = `Image: ${imageId}`;
}

function startPhotoPick() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const container = document.getElementById('photo-container');
  if (container) container.innerHTML = '<div style="padding:20px;color:#58a6ff;">Click on the map to search for nearby street-level photos…</div>';

  viewer.canvas.style.cursor = 'crosshair';
  const handler = new (window.Cesium || { ScreenSpaceEventHandler: class {} }).ScreenSpaceEventHandler(viewer.canvas);

  handler.setInputAction(async (click) => {
    handler.destroy();
    viewer.canvas.style.cursor = '';

    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return;

    const carto = window.Cesium.Cartographic.fromCartesian(cartesian);
    const lon = window.Cesium.Math.toDegrees(carto.longitude);
    const lat = window.Cesium.Math.toDegrees(carto.latitude);

    await searchNearbyPhotos(lon, lat);
  }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

async function searchNearbyPhotos(lon, lat) {
  const container = document.getElementById('photo-container');
  const meta = document.getElementById('photo-meta');
  if (!container) return;

  container.innerHTML = '<div style="padding:20px;color:#f0c000;">Searching for nearby photos…</div>';

  // Try Mapillary API v4 (requires access token)
  // Fallback: show a link to Mapillary
  try {
    const token = import.meta.env?.VITE_MAPILLARY_TOKEN;
    if (token) {
      const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_1024_url,captured_at&bbox=${lon - 0.001},${lat - 0.001},${lon + 0.001},${lat + 0.001}&limit=5`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.data?.length > 0) {
          const img = data.data[0];
          container.innerHTML = `<img src="${img.thumb_1024_url}" style="width:100%;border-radius:4px;" alt="Street photo">`;
          if (meta) meta.textContent = `Image ${img.id} | ${new Date(img.captured_at).toLocaleDateString()}`;
          return;
        }
      }
    }
  } catch { /* fallback below */ }

  container.innerHTML = `
    <div style="padding:16px;text-align:center;">
      <p style="color:#aaa;">No Mapillary token configured.</p>
      <a href="https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17" target="_blank" rel="noopener"
         style="color:#58a6ff;">View on Mapillary ↗</a>
      <br><br>
      <a href="https://www.google.com/maps/@${lat},${lon},17z" target="_blank" rel="noopener"
         style="color:#58a6ff;">View on Google Maps ↗</a>
    </div>
  `;
  if (meta) meta.textContent = `Location: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
