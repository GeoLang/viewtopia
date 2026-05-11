/**
 * GPX/KML import — load outdoor track files and visualize them.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';

export function initTrackImport() {
  // Extend the file input to accept GPX/KML
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    const accept = fileInput.getAttribute('accept') || '';
    if (!accept.includes('.gpx')) {
      fileInput.setAttribute('accept', accept + ',.gpx,.kml,.kmz');
    }
  }

  // Listen for track file drops/uploads
  document.addEventListener('track-file-loaded', (e) => {
    const { name, content, type } = e.detail;
    if (type === 'gpx') loadGPX(name, content);
    else if (type === 'kml') loadKML(name, content);
  });
}

export function detectTrackFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'gpx' || ext === 'kml' || ext === 'kmz') return ext;
  return null;
}

export async function loadTrackFile(file) {
  const ext = detectTrackFile(file);
  if (!ext) return false;

  const text = await file.text();
  if (ext === 'gpx') loadGPX(file.name, text);
  else if (ext === 'kml') loadKML(file.name, text);
  return true;
}

function loadGPX(name, gpxText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'text/xml');
  const points = [];

  // Extract track points
  const trkpts = doc.querySelectorAll('trkpt');
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent) : 0;
    const timeEl = pt.querySelector('time');
    const time = timeEl ? timeEl.textContent : null;
    if (!isNaN(lat) && !isNaN(lon)) points.push({ lat, lon, ele, time });
  }

  // Also check waypoints
  const wpts = doc.querySelectorAll('wpt');
  const waypoints = [];
  for (const pt of wpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const nameEl = pt.querySelector('name');
    const wptName = nameEl ? nameEl.textContent : '';
    if (!isNaN(lat) && !isNaN(lon)) waypoints.push({ lat, lon, name: wptName });
  }

  if (points.length > 0) renderTrack(name, points, waypoints);
}

function loadKML(name, kmlText) {
  const viewer = getCesiumViewer();
  if (viewer) {
    try {
      const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      Cesium.KmlDataSource.load(url).then(ds => {
        viewer.dataSources.add(ds);
        viewer.flyTo(ds);
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      console.error('KML load failed:', e);
    }
  }

  // Parse coordinates for Leaflet
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const coords = doc.querySelectorAll('coordinates');
  const map = getLeafletMap();
  if (map && window.L && coords.length > 0) {
    for (const coordEl of coords) {
      const latLngs = coordEl.textContent.trim().split(/\s+/).map(s => {
        const parts = s.split(',').map(Number);
        return parts.length >= 2 ? [parts[1], parts[0]] : null;
      }).filter(Boolean);
      if (latLngs.length > 1) {
        window.L.polyline(latLngs, { color: '#ff6b00', weight: 3 }).addTo(map);
      }
    }
  }
}

function renderTrack(name, points, waypoints) {
  const viewer = getCesiumViewer();
  if (viewer) {
    const positions = points.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.ele));
    viewer.entities.add({
      polyline: {
        positions, width: 3,
        material: Cesium.Color.fromCssColorString('#ff6b00'),
        clampToGround: true,
        depthFailMaterial: Cesium.Color.fromCssColorString('#ff6b00').withAlpha(0.4),
      },
      name,
    });

    for (const wp of waypoints) {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat),
        point: { pixelSize: 8, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
        label: wp.name ? {
          text: wp.name, font: '12px sans-serif', fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
      });
    }

    // Fly to track
    viewer.zoomTo(viewer.entities);
  }

  const map = getLeafletMap();
  if (map && window.L) {
    const latLngs = points.map(p => [p.lat, p.lon]);
    window.L.polyline(latLngs, { color: '#ff6b00', weight: 3 }).addTo(map)
      .bindPopup(name);

    for (const wp of waypoints) {
      window.L.marker([wp.lat, wp.lon]).addTo(map)
        .bindPopup(wp.name || 'Waypoint');
    }

    if (latLngs.length > 0) map.fitBounds(latLngs);
  }
}
