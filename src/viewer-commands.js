/**
 * Unified viewer command protocol.
 *
 * Both GeoLang and TileTopia backends can issue commands through this
 * interface. Commands work on whichever renderer/view is active.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

const handlers = {};

export function registerCommand(name, fn) {
  handlers[name] = fn;
}

export function executeCommand(cmd) {
  const handler = handlers[cmd.action];
  if (handler) {
    return handler(cmd.params || {});
  }
  console.warn(`Unknown viewer command: ${cmd.action}`);
}

export function initViewerCommands() {
  registerCommand('fly_to', (params) => {
    const { lon, lat, height = 1000, duration = 2 } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        duration,
      });
    }
    const map = getLeafletMap();
    if (map) {
      const zoom = Math.max(2, Math.min(18, Math.round(Math.log2(4e7 / Math.max(height, 1)))));
      map.flyTo([lat, lon], zoom);
    }
  });

  registerCommand('set_view', (params) => {
    const { lon, lat, height = 5000, heading = 0, pitch = -45, roll = 0 } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: Cesium.Math.toRadians(pitch),
          roll: Cesium.Math.toRadians(roll),
        },
      });
    }
  });

  registerCommand('add_marker', (params) => {
    const { lon, lat, label, color = '#ff0000' } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 10, color: Cesium.Color.fromCssColorString(color) },
        label: label
          ? { text: label, font: '14px sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12) }
          : undefined,
      });
    }
    const map = getLeafletMap();
    if (map) {
      const L = window.L;
      if (L) {
        L.circleMarker([lat, lon], {
          radius: 6, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.9,
        }).addTo(map).bindPopup(label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    }
  });

  registerCommand('clear_entities', () => {
    const viewer = getCesiumViewer();
    if (viewer) viewer.entities.removeAll();
  });

  registerCommand('load_tileset', async (params) => {
    const { url, label } = params;
    const viewer = getCesiumViewer();
    if (!viewer) return;
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
      viewer.scene.primitives.add(tileset);
      viewer.flyTo(tileset);
    } catch (e) {
      console.error('Failed to load tileset:', e);
    }
  });

  registerCommand('classify', (params) => {
    const { attribute = 'Classification' } = params;
    const viewer = getCesiumViewer();
    if (!viewer) return;
    import('./classification-viz.js').then(({ applyClassificationStyle }) => {
      for (const prim of viewer.scene.primitives) {
        if (prim instanceof Cesium.Cesium3DTileset) {
          applyClassificationStyle(prim, attribute);
        }
      }
    });
  });

  registerCommand('add_geojson', async (params) => {
    const { url, color = '#3388ff', label } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      try {
        const ds = await Cesium.GeoJsonDataSource.load(url, {
          stroke: Cesium.Color.fromCssColorString(color),
          fill: Cesium.Color.fromCssColorString(color).withAlpha(0.3),
          strokeWidth: 2,
        });
        viewer.dataSources.add(ds);
        viewer.flyTo(ds);
      } catch (e) {
        console.error('Failed to load GeoJSON in 3D view:', e);
      }
    }
    // Also add to 2D map if available
    const map = getLeafletMap();
    if (map && window.L) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const geojson = await res.json();
          window.L.geoJSON(geojson, {
            style: { color, weight: 1.5, fillOpacity: 0.2 },
            pointToLayer: (f, latlng) => window.L.circleMarker(latlng, {
              radius: 5, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.8,
            }),
          }).addTo(map);
        }
      } catch (e) {
        console.error('Failed to load GeoJSON in 2D view:', e);
      }
    }
  });

  registerCommand('set_time', (params) => {
    const { iso } = params;
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(iso);
    }
  });

  registerCommand('screenshot', () => {
    const viewer = getCesiumViewer();
    if (viewer) {
      viewer.render();
      viewer.canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'viewtopia-screenshot.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  });
}
