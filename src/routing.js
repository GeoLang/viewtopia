/**
 * Routing & isochrone analysis using OSRM (Open Source Routing Machine).
 * Renders route polylines on both 3D globe and 2D map.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';
import { registerCommand } from './viewer-commands.js';

const OSRM_BASE = 'https://router.project-osrm.org';
const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de';

export function initRouting() {
  registerCommand('route', async (params) => {
    const { from, to, profile = 'driving' } = params;
    if (!from || !to) return;
    await showRoute(from, to, profile);
  });

  registerCommand('isochrone', async (params) => {
    const { lon, lat, minutes = 15, mode = 'pedestrian' } = params;
    if (lon == null || lat == null) return;
    await showIsochrone(lon, lat, minutes, mode);
  });
}

async function showRoute(from, to, profile = 'driving') {
  // from/to can be {lon, lat} or "lon,lat" string
  const start = parseCoord(from);
  const end = parseCoord(to);
  if (!start || !end) return;

  const osrmProfile = profile === 'walking' ? 'foot' : profile === 'cycling' ? 'bike' : 'car';
  const url = `${OSRM_BASE}/route/v1/${osrmProfile}/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed');
    const data = await res.json();

    if (data.routes?.length > 0) {
      const route = data.routes[0];
      const coords = route.geometry.coordinates;
      const distance = route.distance;
      const duration = route.duration;

      renderRoute(coords, distance, duration, start, end);
    }
  } catch (e) {
    console.error('Routing failed:', e);
  }
}

function renderRoute(coordinates, distance, duration, start, end) {
  const viewer = getCesiumViewer();
  if (viewer) {
    // Route polyline
    const positions = coordinates.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));
    viewer.entities.add({
      polyline: {
        positions, width: 4, material: Cesium.Color.fromCssColorString('#7c3aed'),
        clampToGround: true, depthFailMaterial: Cesium.Color.fromCssColorString('#7c3aed').withAlpha(0.4),
      },
    });

    // Start/end markers
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat),
      point: { pixelSize: 10, color: Cesium.Color.GREEN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: { text: 'Start', font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -16) },
    });
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(end.lon, end.lat),
      point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: { text: `${fmtDist(distance)} · ${fmtTime(duration)}`, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -16) },
    });
  }

  const map = getLeafletMap();
  if (map && window.L) {
    const latLngs = coordinates.map(c => [c[1], c[0]]);
    window.L.polyline(latLngs, { color: '#7c3aed', weight: 4 }).addTo(map)
      .bindPopup(`${fmtDist(distance)} · ${fmtTime(duration)}`);
    window.L.circleMarker([start.lat, start.lon], { radius: 6, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
    window.L.circleMarker([end.lat, end.lon], { radius: 6, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
  }
}

async function showIsochrone(lon, lat, minutes = 15, mode = 'pedestrian') {
  const valhallaMode = mode === 'driving' ? 'auto' : mode === 'cycling' ? 'bicycle' : 'pedestrian';
  const url = `${VALHALLA_BASE}/isochrone?json=${encodeURIComponent(JSON.stringify({
    locations: [{ lat, lon }],
    costing: valhallaMode,
    contours: [{ time: minutes, color: '7c3aed' }],
    polygons: true,
  }))}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Isochrone request failed');
    const geojson = await res.json();
    renderIsochrone(geojson, lon, lat, minutes);
  } catch (e) {
    console.error('Isochrone failed:', e);
    // Fallback: draw approximate circle
    renderCircleIsochrone(lon, lat, minutes, mode);
  }
}

function renderIsochrone(geojson, lon, lat, minutes) {
  const viewer = getCesiumViewer();
  if (viewer) {
    try {
      Cesium.GeoJsonDataSource.load(geojson, {
        stroke: Cesium.Color.fromCssColorString('#7c3aed'),
        fill: Cesium.Color.fromCssColorString('#7c3aed').withAlpha(0.2),
        strokeWidth: 2,
      }).then(ds => {
        viewer.dataSources.add(ds);
        viewer.flyTo(ds);
      });
    } catch { /* ignore */ }
  }

  const map = getLeafletMap();
  if (map && window.L) {
    window.L.geoJSON(geojson, {
      style: { color: '#7c3aed', weight: 2, fillOpacity: 0.15 },
    }).addTo(map).bindPopup(`${minutes} min isochrone`);
  }
}

function renderCircleIsochrone(lon, lat, minutes, mode) {
  // Approximate: walk ~5km/h, cycle ~15km/h, drive ~40km/h
  const speeds = { pedestrian: 5, cycling: 15, driving: 40 };
  const speed = speeds[mode] || 5;
  const radiusKm = (speed * minutes) / 60;
  const radiusM = radiusKm * 1000;

  const viewer = getCesiumViewer();
  if (viewer) {
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      ellipse: {
        semiMajorAxis: radiusM, semiMinorAxis: radiusM,
        material: Cesium.Color.fromCssColorString('#7c3aed').withAlpha(0.2),
        outline: true, outlineColor: Cesium.Color.fromCssColorString('#7c3aed'), outlineWidth: 2,
      },
      label: {
        text: `${minutes} min ${mode}`, font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  const map = getLeafletMap();
  if (map && window.L) {
    window.L.circle([lat, lon], { radius: radiusM, color: '#7c3aed', fillOpacity: 0.15, weight: 2 })
      .addTo(map).bindPopup(`${minutes} min ${mode} (~${radiusKm.toFixed(1)} km)`);
  }
}

function parseCoord(input) {
  if (typeof input === 'object' && input.lon != null && input.lat != null) return input;
  if (typeof input === 'string') {
    const parts = input.split(',').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { lon: parts[0], lat: parts[1] };
  }
  return null;
}

function fmtDist(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function fmtTime(seconds) {
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}
