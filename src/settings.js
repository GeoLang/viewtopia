/**
 * Settings page — configure backends, API keys, and display preferences.
 *
 * Persists all settings to localStorage. Backends can be reconfigured
 * without page reload (re-probes after save).
 */
import { discoverBackends } from './backends.js';

const STORAGE_KEY = 'viewtopia_settings';

const defaults = {
  tiletopiaUrl: '/api/v1',
  geolangUrl: '/agent',
  googleApiKey: '',
  cesiumIonToken: '',
  mapboxToken: '',
  maptilerKey: '',
  theme: 'dark',
  defaultRenderer: 'cesium',
  defaultBasemap: 'osm',
  showMinimap: true,
  showCoordReadout: true,
  probeIntervalSec: 30,
  maxUploadMb: 500,
};

let settings = { ...defaults };

export function getSettings() {
  return { ...settings };
}

export function getSetting(key) {
  return settings[key] ?? defaults[key];
}

export function setSetting(key, value) {
  settings[key] = value;
  save();
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = { ...defaults, ...parsed };
    }
  } catch {
    settings = { ...defaults };
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Load settings from localStorage (call early, before renderer init) */
export function loadSettings() {
  load();
  // Sync Google API key with the google-3d-tiles module's storage
  if (settings.googleApiKey) {
    localStorage.setItem('viewtopia_google_api_key', settings.googleApiKey);
  }
}

export function initSettings() {
  load();

  // Add settings button to header
  const header = document.getElementById('header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.className = 'header-btn';
  btn.id = 'settings-btn';
  btn.title = 'Settings';
  btn.textContent = '⚙';
  btn.style.fontSize = '1.1rem';

  // Insert before the status element
  const status = document.getElementById('status');
  if (status) {
    header.insertBefore(btn, status);
  } else {
    header.appendChild(btn);
  }

  btn.addEventListener('click', () => toggleSettingsPanel());
}

function toggleSettingsPanel() {
  const existing = document.getElementById('settings-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  load(); // re-read latest

  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.6); display: flex;
    align-items: center; justify-content: center;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #1a1d2e; border: 1px solid #2d3148;
    border-radius: 12px; padding: 24px; width: 500px;
    max-height: 80vh; overflow-y: auto; color: #e2e8f0;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  `;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="font-size:1.1rem;color:#a78bfa;margin:0">⚙ Settings</h2>
      <button id="settings-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem">✕</button>
    </div>

    <!-- Backends -->
    <fieldset style="border:1px solid #2d3148;border-radius:8px;padding:12px;margin-bottom:12px">
      <legend style="color:#a78bfa;font-size:0.8rem;font-weight:600;padding:0 6px">Backend Servers</legend>
      <label class="settings-label">TileTopia URL
        <input type="text" id="set-tiletopia-url" class="settings-input" value="${esc(settings.tiletopiaUrl)}" placeholder="/api/v1 or http://host:3000/api/v1">
      </label>
      <label class="settings-label">GeoLang URL
        <input type="text" id="set-geolang-url" class="settings-input" value="${esc(settings.geolangUrl)}" placeholder="/agent or http://host:8080">
      </label>
      <label class="settings-label">Health probe interval (sec)
        <input type="number" id="set-probe-interval" class="settings-input" value="${settings.probeIntervalSec}" min="5" max="300">
      </label>
    </fieldset>

    <!-- API Keys -->
    <fieldset style="border:1px solid #2d3148;border-radius:8px;padding:12px;margin-bottom:12px">
      <legend style="color:#a78bfa;font-size:0.8rem;font-weight:600;padding:0 6px">API Keys</legend>
      <label class="settings-label">Google Maps API Key
        <input type="password" id="set-google-key" class="settings-input" value="${esc(settings.googleApiKey)}" placeholder="AIza...">
        <span style="font-size:0.65rem;color:#64748b">For Photorealistic 3D Tiles. Free: 2,500 sessions/month.</span>
      </label>
      <label class="settings-label">Cesium Ion Token (optional)
        <input type="password" id="set-ion-token" class="settings-input" value="${esc(settings.cesiumIonToken)}" placeholder="eyJ...">
        <span style="font-size:0.65rem;color:#64748b">Only needed for Cesium Ion assets. Not required for core ViewTopia.</span>
      </label>
      <label class="settings-label">Mapbox Token (optional)
        <input type="password" id="set-mapbox-token" class="settings-input" value="${esc(settings.mapboxToken)}" placeholder="pk.eyJ...">
        <span style="font-size:0.65rem;color:#64748b">For Mapbox basemaps. Not required — OSM tiles are used by default.</span>
      </label>
      <label class="settings-label">Maptiler API Key (optional)
        <input type="password" id="set-maptiler-key" class="settings-input" value="${esc(settings.maptilerKey)}" placeholder="Your Maptiler key...">
        <span style="font-size:0.65rem;color:#64748b">For global terrain. Free at <a href="https://cloud.maptiler.com/account/keys/" target="_blank" style="color:#a78bfa">maptiler.com</a>.</span>
      </label>
    </fieldset>

    <!-- Display -->
    <fieldset style="border:1px solid #2d3148;border-radius:8px;padding:12px;margin-bottom:12px">
      <legend style="color:#a78bfa;font-size:0.8rem;font-weight:600;padding:0 6px">Display</legend>
      <label class="settings-label">Default renderer
        <select id="set-renderer" class="settings-input">
          <option value="cesium" ${settings.defaultRenderer === 'cesium' ? 'selected' : ''}>CesiumJS (3D Globe)</option>
          <option value="deckgl" ${settings.defaultRenderer === 'deckgl' ? 'selected' : ''}>deck.gl</option>
          <option value="maplibre" ${settings.defaultRenderer === 'maplibre' ? 'selected' : ''}>MapLibre</option>
        </select>
      </label>
      <label class="settings-label">Default basemap
        <select id="set-basemap" class="settings-input">
          <option value="osm" ${settings.defaultBasemap === 'osm' ? 'selected' : ''}>OpenStreetMap</option>
          <option value="satellite" ${settings.defaultBasemap === 'satellite' ? 'selected' : ''}>Satellite</option>
          <option value="topo" ${settings.defaultBasemap === 'topo' ? 'selected' : ''}>Topographic</option>
          <option value="dark" ${settings.defaultBasemap === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </label>
      <label class="settings-label" style="flex-direction:row;align-items:center;gap:8px">
        <input type="checkbox" id="set-minimap" ${settings.showMinimap ? 'checked' : ''}>
        Show minimap
      </label>
      <label class="settings-label" style="flex-direction:row;align-items:center;gap:8px">
        <input type="checkbox" id="set-coord" ${settings.showCoordReadout ? 'checked' : ''}>
        Show coordinate readout
      </label>
    </fieldset>

    <!-- Upload -->
    <fieldset style="border:1px solid #2d3148;border-radius:8px;padding:12px;margin-bottom:16px">
      <legend style="color:#a78bfa;font-size:0.8rem;font-weight:600;padding:0 6px">Upload</legend>
      <label class="settings-label">Max upload size (MB)
        <input type="number" id="set-max-upload" class="settings-input" value="${settings.maxUploadMb}" min="10" max="10000">
      </label>
    </fieldset>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="settings-reset" class="map-action-btn" style="color:#f87171">Reset defaults</button>
      <button id="settings-save" class="map-action-btn" style="background:#312e81;color:#a78bfa;border-color:#4c1d95">Save</button>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('settings-close').onclick = () => overlay.remove();

  document.getElementById('settings-reset').onclick = () => {
    settings = { ...defaults };
    save();
    overlay.remove();
    toggleSettingsPanel(); // re-open with defaults
  };

  document.getElementById('settings-save').onclick = () => {
    settings.tiletopiaUrl = document.getElementById('set-tiletopia-url').value.trim() || defaults.tiletopiaUrl;
    settings.geolangUrl = document.getElementById('set-geolang-url').value.trim() || defaults.geolangUrl;
    settings.probeIntervalSec = parseInt(document.getElementById('set-probe-interval').value) || defaults.probeIntervalSec;
    settings.googleApiKey = document.getElementById('set-google-key').value.trim();
    settings.cesiumIonToken = document.getElementById('set-ion-token').value.trim();
    settings.mapboxToken = document.getElementById('set-mapbox-token').value.trim();
    settings.maptilerKey = document.getElementById('set-maptiler-key').value.trim();
    settings.defaultRenderer = document.getElementById('set-renderer').value;
    settings.defaultBasemap = document.getElementById('set-basemap').value;
    settings.showMinimap = document.getElementById('set-minimap').checked;
    settings.showCoordReadout = document.getElementById('set-coord').checked;
    settings.maxUploadMb = parseInt(document.getElementById('set-max-upload').value) || defaults.maxUploadMb;

    save();

    // Sync Google key
    if (settings.googleApiKey) {
      localStorage.setItem('viewtopia_google_api_key', settings.googleApiKey);
    }

    // Re-probe backends with new URLs
    discoverBackends();

    overlay.remove();
  };
}

function esc(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
