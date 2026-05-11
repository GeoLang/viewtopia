/**
 * Coordinate readout — show lat/lon/height under cursor in real time.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

let coordEl;

export function initCoordReadout() {
  coordEl = document.createElement('div');
  coordEl.id = 'coord-readout';
  const vizContent = document.getElementById('viz-content');
  if (vizContent) vizContent.appendChild(coordEl);

  // Cesium mouse move
  const viewer = getCesiumViewer();
  if (viewer) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      const cart = viewer.scene.globe.pick(viewer.camera.getPickRay(movement.endPosition), viewer.scene);
      if (cart) {
        const carto = Cesium.Cartographic.fromCartesian(cart);
        const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(6);
        const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(6);
        const alt = carto.height.toFixed(1);
        coordEl.textContent = `${lat}°, ${lon}° | ${alt}m`;
        coordEl.style.display = 'block';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  // Leaflet mouse move
  const map = getLeafletMap();
  if (map) {
    map.on('mousemove', (e) => {
      coordEl.textContent = `${e.latlng.lat.toFixed(6)}°, ${e.latlng.lng.toFixed(6)}°`;
      coordEl.style.display = 'block';
    });
  }
}
