/**
 * Session management — new/switch/rename/delete sessions via GeoLang API.
 *
 * Also wires up:
 * - Dataset listing & file upload
 * - Basemap selector
 * - Map search (fly to place)
 * - Export PNG
 * - Clear session
 */
import { getGeoLangBase, hasGeoLang } from './backends.js';
import { switchBasemap, getLeafletMap, toggleClickQuery, toggleDraw } from './leaflet-view.js';
import { getCesiumViewer } from './renderers.js';
import * as Cesium from 'cesium';

let currentSessionId = null;

function switchCesiumBasemap(name) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Remove all existing imagery layers
  viewer.imageryLayers.removeAll();

  const providers = {
    osm: () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
    satellite: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19,
      credit: '© Esri',
    }),
    topo: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      maximumLevel: 17,
      credit: '© OpenTopoMap',
    }),
    dark: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      maximumLevel: 19,
      credit: '© CARTO',
    }),
  };

  const factory = providers[name] || providers.osm;
  viewer.imageryLayers.addImageryProvider(factory());
}

export function getCurrentSessionId() {
  return currentSessionId;
}

export function setCurrentSessionId(id) {
  currentSessionId = id;
}

// ── Sessions ────────────────────────────────────

async function loadSessions() {
  if (!hasGeoLang()) return;
  const base = getGeoLangBase();
  try {
    const res = await fetch(`${base}/sessions`);
    if (!res.ok) return;
    const sessions = await res.json();
    const select = document.getElementById('session-select');
    const nameInput = document.getElementById('session-name');
    if (!select) return;

    select.innerHTML = '';
    for (const s of sessions) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || 'Unnamed';
      if (s.active) {
        opt.selected = true;
        currentSessionId = s.id;
        if (nameInput) nameInput.value = s.name || '';
      }
      select.appendChild(opt);
    }
  } catch (e) {
    console.warn('Failed to load sessions:', e);
  }
}

async function switchSession(sessionId) {
  if (!hasGeoLang()) return;
  const base = getGeoLangBase();
  try {
    const res = await fetch(`${base}/sessions/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    currentSessionId = data.id;
    const nameInput = document.getElementById('session-name');
    if (nameInput) nameInput.value = data.name || '';

    // Clear chat and reload history for new session
    clearChatUI();
    // Dispatch event so chat.js can restore the new session
    window.dispatchEvent(new CustomEvent('session-changed', { detail: { id: data.id } }));
  } catch (e) {
    console.warn('Failed to switch session:', e);
  }
}

async function createNewSession() {
  if (!hasGeoLang()) return;
  const base = getGeoLangBase();
  const status = document.getElementById('status');
  if (status) status.textContent = 'Creating session…';
  try {
    const res = await fetch(`${base}/sessions/new`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentSessionId = data.id;
    clearChatUI();
    await loadSessions();
    window.dispatchEvent(new CustomEvent('session-changed', { detail: { id: data.id } }));
    if (status) status.textContent = 'connected';
  } catch (e) {
    console.warn('Failed to create session:', e);
    if (status) status.textContent = 'error';
  }
}

async function renameSession(sessionId, newName) {
  if (!hasGeoLang() || !sessionId) return;
  const base = getGeoLangBase();
  try {
    await fetch(`${base}/sessions/${sessionId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    await loadSessions();
  } catch (e) {
    console.warn('Failed to rename session:', e);
  }
}

function clearChatUI() {
  const messagesEl = document.getElementById('messages');
  if (messagesEl) messagesEl.innerHTML = '';
  const welcome = document.getElementById('welcome-msg');
  if (welcome) welcome.style.display = '';
}

// ── Datasets ────────────────────────────────────

async function loadDatasets() {
  if (!hasGeoLang()) return;
  const base = getGeoLangBase();
  try {
    const res = await fetch(`${base}/datasets`);
    if (!res.ok) return;
    const datasets = await res.json();
    const listEl = document.getElementById('data-list');
    const countEl = document.getElementById('data-count');
    if (!listEl) return;

    if (!datasets.length) {
      listEl.innerHTML = '<div class="dataset-empty">No datasets yet — upload a file to get started</div>';
      if (countEl) countEl.textContent = 'My Data';
      return;
    }

    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `My Data (${datasets.length})`;

    for (const ds of datasets) {
      const row = document.createElement('div');
      row.className = 'dataset-row';
      const name = document.createElement('span');
      name.className = 'dataset-name';
      name.textContent = ds.name || ds.filename || ds;
      name.title = ds.description || ds.name || '';
      row.appendChild(name);

      // Click to ask agent about this dataset
      row.addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        if (input) {
          const dsName = ds.name || ds.filename || ds;
          input.value = `Analyze the dataset "${dsName}"`;
          input.focus();
        }
      });

      listEl.appendChild(row);
    }
  } catch (e) {
    console.warn('Failed to load datasets:', e);
  }
}

async function uploadFile(file) {
  if (!hasGeoLang()) return;
  const base = getGeoLangBase();
  const status = document.getElementById('status');
  if (status) status.textContent = 'Uploading…';

  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${base}/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    await loadDatasets();
    if (status) status.textContent = 'connected';
  } catch (e) {
    console.warn('Upload failed:', e);
    if (status) status.textContent = 'upload error';
    setTimeout(() => { if (status) status.textContent = 'connected'; }, 3000);
  }
}

// ── Map search (fly to place) ───────────────────

async function flyToPlace(query) {
  if (!query.trim()) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const results = await res.json();
    if (!results.length) return;
    const { lat, lon, boundingbox } = results[0];

    // Fly Leaflet map
    const map = getLeafletMap();
    if (map) {
      if (boundingbox) {
        const bounds = [[parseFloat(boundingbox[0]), parseFloat(boundingbox[2])],
                        [parseFloat(boundingbox[1]), parseFloat(boundingbox[3])]];
        map.fitBounds(bounds, { maxZoom: 16 });
      } else {
        map.setView([parseFloat(lat), parseFloat(lon)], 14);
      }
    }

    // Fly Cesium viewer
    const viewer = getCesiumViewer();
    if (viewer) {
      const { default: Cesium } = await import('cesium');
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(parseFloat(lon), parseFloat(lat), 50000),
        duration: 1.5,
      });
    }
  } catch (e) {
    console.warn('Geocode failed:', e);
  }
}

// ── Export PNG ───────────────────────────────────

function exportPNG() {
  const viewer = getCesiumViewer();
  if (viewer) {
    viewer.render();
    const canvas = viewer.canvas;
    const link = document.createElement('a');
    link.download = 'viewtopia-3d.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    return;
  }

  const map = getLeafletMap();
  if (map) {
    // Use leaflet-image or html2canvas if available; fallback alert
    alert('PNG export for 2D map requires the leaflet-image plugin. Use browser screenshot (Ctrl+Shift+S) for now.');
  }
}

// ── Init all wiring ─────────────────────────────

export function initSessionsAndUI() {
  // Load sessions
  loadSessions();

  // Session selector
  const sessionSelect = document.getElementById('session-select');
  if (sessionSelect) {
    sessionSelect.addEventListener('change', () => {
      switchSession(sessionSelect.value);
    });
  }

  // New session button
  const newBtn = document.getElementById('new-session-btn');
  if (newBtn) {
    newBtn.addEventListener('click', createNewSession);
  }

  // Clear session button — clears chat UI and localStorage for this session
  const clearBtn = document.getElementById('clear-session-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearChatUI();
      window.dispatchEvent(new CustomEvent('clear-session'));
    });
  }

  // Session name rename on blur
  const nameInput = document.getElementById('session-name');
  if (nameInput) {
    nameInput.addEventListener('change', () => {
      if (currentSessionId && nameInput.value.trim()) {
        renameSession(currentSessionId, nameInput.value.trim());
      }
    });
  }

  // Data section toggle
  const dataHeader = document.getElementById('data-header');
  const dataList = document.getElementById('data-list');
  const dataChevron = document.getElementById('data-chevron');
  if (dataHeader && dataList) {
    dataHeader.addEventListener('click', () => {
      const open = dataList.style.display !== 'none';
      dataList.style.display = open ? 'none' : 'block';
      if (dataChevron) dataChevron.style.transform = open ? '' : 'rotate(180deg)';
      if (!open) loadDatasets(); // refresh on expand
    });
  }

  // File upload
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        uploadFile(fileInput.files[0]);
        fileInput.value = ''; // reset
      }
    });
  }

  // Basemap selector
  const basemapSelect = document.getElementById('basemap-select');
  if (basemapSelect) {
    basemapSelect.addEventListener('change', () => {
      const name = basemapSelect.value;
      switchBasemap(name);
      switchCesiumBasemap(name);
    });
  }

  // Map search
  const searchInput = document.getElementById('map-search-input');
  const searchBtn = document.getElementById('map-search-btn');
  if (searchInput) {
    const doSearch = () => flyToPlace(searchInput.value);
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  // Export PNG
  const exportBtn = document.getElementById('export-png-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportPNG);
  }

  // Toggle chat panel
  const toggleBtn = document.getElementById('toggle-chat-btn');
  const chatPanel = document.getElementById('chat-panel');
  if (toggleBtn && chatPanel) {
    toggleBtn.addEventListener('click', () => {
      chatPanel.classList.toggle('collapsed');
      // Resize Cesium/Leaflet after transition
      setTimeout(() => {
        const viewer = getCesiumViewer();
        if (viewer) viewer.resize();
        const map = getLeafletMap();
        if (map) map.invalidateSize();
      }, 300);
    });

    // Keyboard shortcut: Ctrl+B to toggle chat
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleBtn.click();
      }
    });
  }

  // Draw button — toggles Leaflet draw controls
  const drawBtn = document.getElementById('draw-btn');
  if (drawBtn) {
    drawBtn.addEventListener('click', () => {
      const active = toggleDraw();
      drawBtn.classList.toggle('active', active);
    });
  }

  // Info/pick button — toggles click-to-query on 2D map
  const pickBtn = document.getElementById('pick-btn');
  if (pickBtn) {
    pickBtn.addEventListener('click', () => {
      const active = toggleClickQuery();
      pickBtn.classList.toggle('active', active);
    });
  }

  // Resizable chat panel (drag left edge)
  initChatResize(chatPanel);

  // Load initial datasets
  loadDatasets();
}

// ── Resizable chat panel ────────────────────────

function initChatResize(panel) {
  if (!panel) return;

  const handle = document.createElement('div');
  handle.className = 'chat-resize-handle';
  panel.prepend(handle);

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e) {
    // Panel is on the right, so moving left = wider
    const dx = startX - e.clientX;
    const newWidth = Math.max(250, Math.min(700, startWidth + dx));
    panel.style.width = newWidth + 'px';
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    // Resize viewers
    const viewer = getCesiumViewer();
    if (viewer) viewer.resize();
    const map = getLeafletMap();
    if (map) map.invalidateSize();
  }

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
