/**
 * Leaflet 2D map view for ViewTopia.
 *
 * Used for GeoLang-style 2D visualization: GeoJSON layers, choropleth,
 * marker clusters, attribute tables, and drawing tools.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

let map = null;
let clickQueryActive = false;
let mapClickHandler = null;

export function getLeafletMap() {
  return map;
}

export function initLeafletMap(containerId = 'leaflet-map', center = [20, 0], zoom = 2) {
  if (map) return map;

  map = L.map(containerId, { center, zoom });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  // Make L available globally for dynamic layer additions
  window.L = L;

  return map;
}

export function destroyLeafletMap() {
  if (map) {
    map.remove();
    map = null;
  }
}

export function switchBasemap(name) {
  if (!map) return;

  // Remove existing tile layers
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) map.removeLayer(layer);
  });

  const tiles = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '&copy; Esri' },
    topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenTopoMap' },
    dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  };

  const t = tiles[name] || tiles.osm;
  L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map);
}

// ── Click-to-query ──────────────────────────────

export function toggleClickQuery() {
  if (!map) return;
  clickQueryActive = !clickQueryActive;

  if (clickQueryActive) {
    map.getContainer().style.cursor = 'crosshair';
    mapClickHandler = (e) => {
      const lat = e.latlng.lat.toFixed(5);
      const lon = e.latlng.lng.toFixed(5);

      // Show toast
      showToast(`Querying ${lat}, ${lon}…`);

      // Inject into chat
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = `I clicked the map at latitude ${lat}, longitude ${lon}. Use query_elevation to get the elevation and flood risk. Use assess_environmental_risk with place_name="${lat},${lon}" and radius_km=1. Use download_osm_data to find nearby amenities (restaurants, shops, hospitals) within 500m. Then summarise what is at this location.`;
        // Auto-send
        toggleClickQuery();
        document.getElementById('chat-send')?.click();
      }
    };
    map.on('click', mapClickHandler);
  } else {
    map.getContainer().style.cursor = '';
    if (mapClickHandler) {
      map.off('click', mapClickHandler);
      mapClickHandler = null;
    }
  }
  return clickQueryActive;
}

export function isClickQueryActive() {
  return clickQueryActive;
}

function showToast(text) {
  let toast = document.getElementById('map-click-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'map-click-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ── Draw tools ──────────────────────────────────

let drawControl = null;
let drawnItems = null;

export function toggleDraw() {
  if (!map) return;

  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
    return false;
  }

  if (!drawnItems) {
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.addLayer(e.layer);
    });
  }

  drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
      polygon: true,
      polyline: true,
      rectangle: true,
      circle: true,
      marker: true,
      circlemarker: false,
    },
  });
  map.addControl(drawControl);
  return true;
}
