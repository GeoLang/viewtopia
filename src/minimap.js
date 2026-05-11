/**
 * Minimap — overview map in the corner showing the current viewport extent.
 * Uses a small Leaflet instance synced to the Cesium camera.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let minimapEl = null;
let minimapInstance = null;
let viewportRect = null;

export function initMinimap() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  minimapEl = document.createElement('div');
  minimapEl.id = 'minimap';
  minimapEl.className = 'minimap';
  minimapEl.innerHTML = '<div id="minimap-map" style="width:100%;height:100%;border-radius:6px;"></div>';

  const vizContent = document.getElementById('viz-content') || document.body;
  vizContent.appendChild(minimapEl);

  // Wait for Leaflet to be available
  const checkL = () => {
    if (window.L) {
      setupMinimap(viewer);
    } else {
      // Load leaflet from CDN
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setupMinimap(viewer);
      document.head.appendChild(script);
    }
  };

  // Use requestIdleCallback to avoid blocking
  if (window.requestIdleCallback) {
    window.requestIdleCallback(checkL);
  } else {
    setTimeout(checkL, 500);
  }
}

function setupMinimap(viewer) {
  const L = window.L;
  if (!L) return;

  minimapInstance = L.map('minimap-map', {
    attributionControl: false,
    zoomControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
  }).setView([37.8, -122.4], 4);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
  }).addTo(minimapInstance);

  // Viewport rectangle
  viewportRect = L.rectangle([[0, 0], [0, 0]], {
    color: '#7c3aed',
    weight: 2,
    fillColor: '#7c3aed',
    fillOpacity: 0.15,
    interactive: false,
  }).addTo(minimapInstance);

  // Sync on camera move
  viewer.camera.changed.addEventListener(() => updateMinimap(viewer));
  viewer.camera.moveEnd.addEventListener(() => updateMinimap(viewer));

  // Click minimap to fly to location
  minimapInstance.on('click', (e) => {
    const { lat, lng } = e.latlng;
    const carto = viewer.camera.positionCartographic;
    const height = carto ? carto.height : 5000000;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      duration: 1.5,
    });
  });

  // Initial sync
  updateMinimap(viewer);
}

function updateMinimap(viewer) {
  if (!minimapInstance || !viewportRect) return;

  const carto = viewer.camera.positionCartographic;
  if (!carto) return;

  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const height = carto.height;

  // Approximate viewport extent based on height
  const fov = viewer.camera.frustum.fov || 1;
  const extent = (height / 111000) * Math.tan(fov / 2) * 2;

  const bounds = [
    [lat - extent / 2, lon - extent / 2],
    [lat + extent / 2, lon + extent / 2],
  ];

  viewportRect.setBounds(bounds);

  // Center minimap on viewport
  const minimapZoom = Math.max(0, Math.min(10, Math.round(Math.log2(4e7 / height)) - 3));
  minimapInstance.setView([lat, lon], minimapZoom, { animate: false });
}
