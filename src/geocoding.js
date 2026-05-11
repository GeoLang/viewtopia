/**
 * Geocoding search — fly to addresses/places using Nominatim.
 * Works in both 3D globe (Cesium) and 2D map (Leaflet).
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap } from './leaflet-view.js';
import { getCurrentTab } from './tabs.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function initGeocoding() {
  // Globe tab search (already exists in HTML for 2D map)
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const wrap = document.createElement('div');
  wrap.className = 'geocode-wrap';
  wrap.innerHTML = `
    <input type="text" id="geocode-input" class="geocode-input" placeholder="Search places…" autocomplete="off" />
    <div id="geocode-results" class="geocode-results" style="display:none"></div>
  `;
  toolbar.insertBefore(wrap, toolbar.firstChild);

  const input = document.getElementById('geocode-input');
  const results = document.getElementById('geocode-results');
  let debounce = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { results.style.display = 'none'; return; }
    debounce = setTimeout(() => searchPlaces(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (q) searchPlaces(q);
    }
    if (e.key === 'Escape') {
      results.style.display = 'none';
      input.blur();
    }
  });

  // Close results on outside click
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) results.style.display = 'none';
  });

  // Also wire the existing 2D map search
  const mapSearchBtn = document.getElementById('map-search-btn');
  const mapSearchInput = document.getElementById('map-search-input');
  if (mapSearchBtn && mapSearchInput) {
    mapSearchBtn.addEventListener('click', () => {
      const q = mapSearchInput.value.trim();
      if (q) flyToPlace(q);
    });
    mapSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = mapSearchInput.value.trim();
        if (q) flyToPlace(q);
      }
    });
  }
}

async function searchPlaces(query) {
  const results = document.getElementById('geocode-results');
  if (!results) return;

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data.length === 0) {
      results.innerHTML = '<div class="gc-empty">No results</div>';
      results.style.display = 'block';
      return;
    }

    results.innerHTML = data.map(r => `
      <div class="gc-item" data-lat="${r.lat}" data-lon="${r.lon}" data-bb="${r.boundingbox?.join(',')}">
        <div class="gc-name">${escapeHtml(r.display_name)}</div>
        <div class="gc-type">${escapeHtml(r.type)} · ${parseFloat(r.lat).toFixed(4)}, ${parseFloat(r.lon).toFixed(4)}</div>
      </div>
    `).join('');

    results.querySelectorAll('.gc-item').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        flyToCoords(lat, lon);
        results.style.display = 'none';
        document.getElementById('geocode-input').value = item.querySelector('.gc-name').textContent;
      });
    });

    results.style.display = 'block';
  } catch (e) {
    console.error('Geocoding failed:', e);
  }
}

async function flyToPlace(query) {
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return;
    const data = await res.json();
    if (data.length > 0) {
      flyToCoords(parseFloat(data[0].lat), parseFloat(data[0].lon));
    }
  } catch (e) {
    console.error('Geocoding failed:', e);
  }
}

function flyToCoords(lat, lon) {
  const viewer = getCesiumViewer();
  if (viewer && getCurrentTab() === 'globe') {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 5000),
      duration: 2,
    });
  }

  const map = getLeafletMap();
  if (map && getCurrentTab() === 'map') {
    map.flyTo([lat, lon], 14);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
