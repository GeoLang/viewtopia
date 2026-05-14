/**
 * Space-Time panel — main integration point for ViewTopia.
 *
 * Manages the space-time visualization mode:
 * - Sidebar panel with entity list, time controls
 * - deck.gl layer management
 * - File import (drag-and-drop CSV/GPX)
 * - Time scrubber with play/pause animation
 */

import { createSpaceTimeLayers, createLinkLayer, getTimeBounds } from './layers.js';
import { createLink } from './models.js';
import { ingestFile } from './ingest.js';
import { initEntityManager, showEntityDetail, searchEntities, addEntity } from './entity-manager.js';
import { detectColocations, colocationLinks } from './colocation.js';
import { detectFrequentLocations, computeDailyPattern, detectAnomalies, classifyLocations } from './pattern-of-life.js';
import { createCircleFence, getFences, clearFences, detectFenceCrossings, summarizeFenceActivity } from './geofence.js';
import { showNetworkGraph } from './network-graph.js';
import { showActivityHistogram } from './activity-histogram.js';
import { saveSession, loadSession } from './persistence.js';
import { ingestKML, ingestGeoJSON } from './ingest-formats.js';

/** @type {Map<string, import('./models.js').Entity>} */
const entityMap = new Map();
/** @type {import('./models.js').Track[]} */
let tracks = [];
/** @type {import('./models.js').Link[]} */
let links = [];
/** @type {{timeMin: number, timeMax: number}} */
let timeBounds = { timeMin: 0, timeMax: 0 };
/** @type {number|null} */
let currentTime = null;
/** @type {number|null} */
let animationId = null;
let playing = false;
let playSpeed = 1; // multiplier: 1 = real-time
let trailDuration = null; // null = show all
let elevationScale = 5000;

/** @type {Function|null} Callback to update deck.gl layers */
let updateLayersCallback = null;
/** @type {Function|null} Callback to fly camera to [west, south, east, north] */
let flyToCallback = null;
/** @type {Function|null} Callback for lightweight time-only updates */
let timeUpdateCallback = null;

/**
 * Initialize the space-time panel.
 * @param {Object} opts
 * @param {Function} opts.onLayersUpdate - Called with new deck.gl layers array (full rebuild)
 * @param {Function} [opts.onFlyTo] - Called with {west, south, east, north} bounding box
 * @param {Function} [opts.onTimeUpdate] - Called with {currentTime, trailDuration} for lightweight per-frame updates
 */
export function initSpaceTime({ onLayersUpdate, onFlyTo, onTimeUpdate }) {
  updateLayersCallback = onLayersUpdate;
  flyToCallback = onFlyTo || null;
  timeUpdateCallback = onTimeUpdate || null;
  initEntityManager(entityMap, () => { updateEntityList(); refreshLayers(); });
  createPanel();
  restoreSession();

  // Toolbar toggle button
  const btn = document.getElementById('spacetime-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const panel = document.getElementById('spacetime-panel');
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
  }

  // Re-push layers when renderer switches (new deck instance won't have them)
  const rendererSelect = document.getElementById('renderer-choice');
  if (rendererSelect) {
    rendererSelect.addEventListener('change', () => {
      setTimeout(() => refreshLayers(), 200);
    });
  }
}

/**
 * Load tracks from file content.
 * @param {string} text - File content
 * @param {string} filename - Filename for format detection
 */
export function loadSpaceTimeData(text, filename) {
  const ext = filename.split('.').pop().toLowerCase();

  if (ext === 'kml') {
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    ingestKML(text, entityMap, trackMap);
    tracks = [...trackMap.values()];
  } else if (ext === 'geojson') {
    const geojson = JSON.parse(text);
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    ingestGeoJSON(geojson, entityMap, trackMap);
    tracks = [...trackMap.values()];
  } else {
    const result = ingestFile(text, filename);
    for (const entity of result.entities) {
      entityMap.set(entity.id, entity);
    }
    tracks = tracks.concat(result.tracks);
  }

  timeBounds = getTimeBounds(tracks);
  currentTime = timeBounds.timeMin;

  updateEntityList();
  updateTimeSlider();
  refreshLayers();
  showPanel();

  // Fly to data extent
  if (flyToCallback) {
    const allEvents = tracks.flatMap(t => t.events);
    if (allEvents.length > 0) {
      let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
      for (const e of allEvents) {
        if (e.lng < west) west = e.lng;
        if (e.lng > east) east = e.lng;
        if (e.lat < south) south = e.lat;
        if (e.lat > north) north = e.lat;
      }
      // Add a small padding
      const padLng = (east - west) * 0.2 || 0.01;
      const padLat = (north - south) * 0.2 || 0.01;
      flyToCallback({ west: west - padLng, south: south - padLat, east: east + padLng, north: north + padLat });
    }
  }

  // Auto-save to IndexedDB
  persistSession();
}

/**
 * Clear all space-time data.
 */
export function clearSpaceTimeData() {
  entityMap.clear();
  tracks = [];
  timeBounds = { timeMin: 0, timeMax: 0 };
  currentTime = null;
  stopAnimation();
  updateEntityList();
  refreshLayers();
}

function refreshLayers() {
  if (!updateLayersCallback) return;
  const layers = createSpaceTimeLayers({
    tracks,
    entities: entityMap,
    timeMin: timeBounds.timeMin,
    timeMax: timeBounds.timeMax,
    elevationScale,
    currentTime,
    trailDuration,
  });
  updateLayersCallback(layers);
}

// --- Animation ---

function startAnimation() {
  if (playing) return;
  playing = true;
  const duration = timeBounds.timeMax - timeBounds.timeMin;
  if (duration <= 0) return;

  let lastFrame = performance.now();
  function frame(now) {
    if (!playing) return;
    const dt = now - lastFrame;
    lastFrame = now;
    // Advance current time: playSpeed * dt maps to time progression
    // Default: 60x real-time speed (1 second = 1 minute of data)
    currentTime += dt * playSpeed * 60;
    if (currentTime > timeBounds.timeMax) {
      currentTime = timeBounds.timeMin; // loop
    }
    updateTimeSlider();
    // Use lightweight time update during animation (avoid full layer rebuild)
    if (timeUpdateCallback) {
      timeUpdateCallback({ currentTime, trailDuration, tracks, entities: entityMap, timeMin: timeBounds.timeMin, timeMax: timeBounds.timeMax, elevationScale });
    } else {
      refreshLayers();
    }
    animationId = requestAnimationFrame(frame);
  }
  animationId = requestAnimationFrame(frame);
}

function stopAnimation() {
  playing = false;
  if (animationId != null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// --- UI ---

function createPanel() {
  if (document.getElementById('spacetime-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'spacetime-panel';
  panel.className = 'spacetime-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="st-header">
      <h3>Space-Time</h3>
      <button id="st-close" class="st-btn" title="Close">✕</button>
    </div>
    <div class="st-controls">
      <div class="st-time-row">
        <button id="st-play" class="st-btn" title="Play/Pause">▶</button>
        <input type="range" id="st-slider" class="st-slider" min="0" max="1000" value="0">
        <span id="st-time-label" class="st-label"></span>
      </div>
      <div class="st-options">
        <label>Speed: <select id="st-speed">
          <option value="0.1">0.1×</option>
          <option value="1" selected>1×</option>
          <option value="10">10×</option>
          <option value="60">60×</option>
        </select></label>
        <label>Height: <input type="range" id="st-elevation" min="1000" max="50000" value="5000"></label>
      </div>
    </div>
    <div class="st-import">
      <p>Drop CSV, GPX, KML, or GeoJSON file here</p>
      <button id="st-browse" class="st-btn">Browse…</button>
      <input type="file" id="st-file-input" accept=".csv,.gpx,.json,.kml,.geojson" style="display:none">
    </div>
    <div class="st-analysis">
      <h4>Analysis Tools</h4>
      <button id="st-colocation" class="st-btn" title="Detect entity colocations">Colocations</button>
      <button id="st-network" class="st-btn" title="Link analysis graph">Network Graph</button>
      <button id="st-pattern" class="st-btn" title="Pattern-of-life analysis">Patterns</button>
      <button id="st-histogram" class="st-btn" title="Activity timeline">Histogram</button>
      <button id="st-geofence" class="st-btn" title="Manage geo-fences">Geo-fences</button>
      <button id="st-add-entity" class="st-btn" title="Add new entity">+ Entity</button>
      <button id="st-link-entities" class="st-btn" title="Manually link two entities">+ Link</button>
    </div>
    <div class="st-search">
      <input type="text" id="st-search-input" placeholder="Search entities…">
    </div>
    <div id="st-entity-list" class="st-entities"></div>
  `;
  document.body.appendChild(panel);

  // Event handlers
  panel.querySelector('#st-close').addEventListener('click', hidePanel);
  panel.querySelector('#st-play').addEventListener('click', () => {
    if (playing) {
      stopAnimation();
      panel.querySelector('#st-play').textContent = '▶';
    } else {
      startAnimation();
      panel.querySelector('#st-play').textContent = '⏸';
    }
  });
  panel.querySelector('#st-slider').addEventListener('input', (e) => {
    const frac = parseInt(e.target.value) / 1000;
    currentTime = timeBounds.timeMin + frac * (timeBounds.timeMax - timeBounds.timeMin);
    refreshLayers();
    updateTimeLabel();
  });
  panel.querySelector('#st-speed').addEventListener('change', (e) => {
    playSpeed = parseFloat(e.target.value);
  });
  panel.querySelector('#st-elevation').addEventListener('input', (e) => {
    elevationScale = parseInt(e.target.value);
    refreshLayers();
  });

  // Drag-and-drop
  const importArea = panel.querySelector('.st-import');
  importArea.addEventListener('dragover', (e) => { e.preventDefault(); importArea.classList.add('dragover'); });
  importArea.addEventListener('dragleave', () => importArea.classList.remove('dragover'));
  importArea.addEventListener('drop', (e) => {
    e.preventDefault();
    importArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadSpaceTimeData(reader.result, file.name);
    reader.readAsText(file);
  });

  // File browse button
  const fileInput = panel.querySelector('#st-file-input');
  panel.querySelector('#st-browse').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadSpaceTimeData(reader.result, file.name);
    reader.readAsText(file);
    fileInput.value = '';
  });

  // --- Analysis tool buttons ---
  panel.querySelector('#st-colocation').addEventListener('click', runColocationDetection);
  panel.querySelector('#st-network').addEventListener('click', runNetworkGraph);
  panel.querySelector('#st-pattern').addEventListener('click', runPatternOfLife);
  panel.querySelector('#st-histogram').addEventListener('click', () => {
    showActivityHistogram(tracks, entityMap, { onTimeSelect: (start, end) => {
      currentTime = start;
      updateTimeSlider();
      refreshLayers();
    }});
  });
  panel.querySelector('#st-geofence').addEventListener('click', runGeofenceUI);
  panel.querySelector('#st-add-entity').addEventListener('click', () => {
    const name = prompt('Entity name:');
    if (!name) return;
    const kind = prompt('Kind (person/vehicle/device/organization/location/custom):', 'person') || 'person';
    addEntity(name, kind);
  });
  panel.querySelector('#st-link-entities').addEventListener('click', () => showLinkDialog());
  panel.querySelector('#st-search-input').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (q.length < 2) { updateEntityList(); return; }
    const results = searchEntities(q);
    renderEntityList(results);
  });
}

function showPanel() {
  const el = document.getElementById('spacetime-panel');
  if (el) el.style.display = '';
}

function hidePanel() {
  const el = document.getElementById('spacetime-panel');
  if (el) el.style.display = 'none';
}

function updateEntityList() {
  const list = document.getElementById('st-entity-list');
  if (!list) return;
  renderEntityList([...entityMap.values()]);
}

function renderEntityList(entities) {
  const list = document.getElementById('st-entity-list');
  if (!list) return;
  list.innerHTML = entities.map(e => `
    <div class="st-entity" style="border-left: 4px solid ${e.color}" data-entity-id="${e.id}">
      <span class="st-entity-name">${e.name}</span>
      <span class="st-entity-kind">${e.kind}</span>
      ${e.aliases && e.aliases.length ? `<span class="st-entity-aliases">${e.aliases.join(', ')}</span>` : ''}
    </div>
  `).join('');

  // Click to open entity detail
  list.querySelectorAll('.st-entity').forEach(el => {
    el.addEventListener('click', () => showEntityDetail(el.dataset.entityId));
  });
}

function updateTimeSlider() {
  const slider = document.getElementById('st-slider');
  if (!slider || timeBounds.timeMax === timeBounds.timeMin) return;
  const frac = (currentTime - timeBounds.timeMin) / (timeBounds.timeMax - timeBounds.timeMin);
  slider.value = Math.round(frac * 1000);
  updateTimeLabel();
}

function updateTimeLabel() {
  const label = document.getElementById('st-time-label');
  if (!label || currentTime == null) return;
  label.textContent = new Date(currentTime).toISOString().replace('T', ' ').slice(0, 19);
}

// --- Analysis Tool Runners ---

function runColocationDetection() {
  if (tracks.length < 2) { alert('Need at least 2 entity tracks for colocation detection.'); return; }
  const distStr = prompt('Distance threshold (meters):', '100');
  const dist = parseInt(distStr) || 100;
  const timeStr = prompt('Time threshold (seconds):', '300');
  const timeMs = (parseInt(timeStr) || 300) * 1000;

  const colocations = detectColocations(tracks, { distanceThresholdM: dist, timeThresholdMs: timeMs });
  links = colocationLinks(colocations);

  // Add link layer
  if (updateLayersCallback) {
    const baseLayers = createSpaceTimeLayers({ tracks, entities: entityMap, timeMin: timeBounds.timeMin, timeMax: timeBounds.timeMax, elevationScale, currentTime, trailDuration });
    const linkLayer = createLinkLayer({ links, entities: entityMap, tracks, currentTime });
    updateLayersCallback([...baseLayers, linkLayer]);
  }

  alert(`Found ${colocations.length} colocation events → ${links.length} entity links.`);
}

function runNetworkGraph() {
  if (entityMap.size === 0) { alert('No entities loaded.'); return; }
  showNetworkGraph(entityMap, links, { onNodeClick: (id) => showEntityDetail(id) });
}

function runPatternOfLife() {
  if (tracks.length === 0) { alert('No tracks loaded.'); return; }
  const results = [];
  for (const track of tracks) {
    const entity = entityMap.get(track.entityId);
    if (!entity) continue;
    const locs = detectFrequentLocations(track);
    classifyLocations(locs);
    const pattern = computeDailyPattern(track);
    const anomalies = detectAnomalies(track, pattern);
    results.push({ entity: entity.name, locations: locs.length, anomalies: anomalies.length });
  }
  const summary = results.map(r => `${r.entity}: ${r.locations} frequent locations, ${r.anomalies} anomalies`).join('\n');
  alert('Pattern-of-Life Analysis:\n\n' + summary);
}

function runGeofenceUI() {
  const action = prompt('Geo-fence: (1) Add circle fence, (2) Run crossing detection, (3) Clear all:', '1');
  if (action === '1') {
    const name = prompt('Fence name:', 'Zone 1') || 'Zone 1';
    const lng = parseFloat(prompt('Center longitude:', '0'));
    const lat = parseFloat(prompt('Center latitude:', '0'));
    const radius = parseFloat(prompt('Radius (meters):', '500')) || 500;
    createCircleFence(name, lng, lat, radius);
    alert(`Created geo-fence "${name}" at ${lat}, ${lng} (${radius}m radius).`);
  } else if (action === '2') {
    const fences = getFences();
    if (fences.length === 0) { alert('No geo-fences defined.'); return; }
    const crossings = detectFenceCrossings(tracks);
    const summary = summarizeFenceActivity(crossings);
    let msg = `${crossings.length} fence crossings detected.\n\n`;
    for (const [fenceId, entityStats] of summary) {
      const fence = fences.find(f => f.id === fenceId);
      msg += `${fence?.name || fenceId}:\n`;
      for (const [entityId, stats] of entityStats) {
        const ent = entityMap.get(entityId);
        msg += `  ${ent?.name || entityId}: ${stats.enters} enters, ${stats.exits} exits\n`;
      }
    }
    alert(msg);
  } else if (action === '3') {
    clearFences();
    alert('All geo-fences cleared.');
  }
}

// --- KML/GeoJSON ingest handled in loadSpaceTimeData ---

// --- Manual Link Creation Dialog ---

let linkDialog = null;

function showLinkDialog() {
  const entityList = [...entityMap.values()];
  if (entityList.length < 2) { alert('Need at least 2 entities to create a link.'); return; }

  if (!linkDialog) {
    linkDialog = document.createElement('div');
    linkDialog.id = 'link-dialog';
    linkDialog.className = 'link-dialog';
    document.body.appendChild(linkDialog);
  }

  const options = entityList.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  const now = new Date().toISOString().slice(0, 16);

  linkDialog.style.display = '';
  linkDialog.innerHTML = `
    <div class="ld-header">
      <span>Create Link</span>
      <button class="st-btn ld-close">✕</button>
    </div>
    <div class="ld-body">
      <label>From Entity<select id="ld-from">${options}</select></label>
      <label>To Entity<select id="ld-to">${options.replace('selected', '')}</select></label>
      <label>Link Type
        <select id="ld-type">
          <option value="colocation">Colocation (met in person)</option>
          <option value="communication">Communication (call/message)</option>
          <option value="financial">Financial (transaction)</option>
          <option value="organizational">Organizational (same group)</option>
          <option value="inferred">Inferred (analyst judgement)</option>
        </select>
      </label>
      <label>Time<input type="datetime-local" id="ld-time" value="${now}"></label>
      <label>Location (optional)
        <div class="ld-loc-row">
          <input type="number" id="ld-lng" placeholder="Longitude" step="any">
          <input type="number" id="ld-lat" placeholder="Latitude" step="any">
        </div>
      </label>
      <label>Notes<textarea id="ld-notes" placeholder="Evidence or description…"></textarea></label>
      <div class="ld-actions">
        <button class="st-btn ld-cancel">Cancel</button>
        <button class="st-btn ld-confirm">Create Link</button>
      </div>
    </div>
  `;

  // Set second select to a different entity by default
  if (entityList.length > 1) {
    linkDialog.querySelector('#ld-to').selectedIndex = 1;
  }

  linkDialog.querySelector('.ld-close').onclick = () => linkDialog.style.display = 'none';
  linkDialog.querySelector('.ld-cancel').onclick = () => linkDialog.style.display = 'none';
  linkDialog.querySelector('.ld-confirm').onclick = () => {
    const fromId = linkDialog.querySelector('#ld-from').value;
    const toId = linkDialog.querySelector('#ld-to').value;
    if (fromId === toId) { alert('Select two different entities.'); return; }

    const kind = linkDialog.querySelector('#ld-type').value;
    const timeStr = linkDialog.querySelector('#ld-time').value;
    const timestamp = timeStr ? new Date(timeStr).getTime() : Date.now();
    const lng = parseFloat(linkDialog.querySelector('#ld-lng').value) || null;
    const lat = parseFloat(linkDialog.querySelector('#ld-lat').value) || null;
    const notes = linkDialog.querySelector('#ld-notes').value.trim();

    const link = createLink(fromId, toId, kind, {
      firstSeen: timestamp,
      lastSeen: timestamp,
      evidenceCount: 1,
      metadata: { notes, lng, lat },
    });

    links.push(link);
    linkDialog.style.display = 'none';

    // Refresh visualization with link
    if (updateLayersCallback) {
      const baseLayers = createSpaceTimeLayers({ tracks, entities: entityMap, timeMin: timeBounds.timeMin, timeMax: timeBounds.timeMax, elevationScale, currentTime, trailDuration });
      const linkLayer = createLinkLayer({ links, entities: entityMap, tracks, currentTime });
      updateLayersCallback([...baseLayers, ...(linkLayer ? [linkLayer] : [])]);
    }

    const fromName = entityMap.get(fromId)?.name || fromId;
    const toName = entityMap.get(toId)?.name || toId;
    alert(`Link created: ${fromName} ↔ ${toName} (${kind}) at ${new Date(timestamp).toLocaleString()}`);
  };
}

// --- Persistence ---

function persistSession() {
  const entities = [...entityMap.values()];
  saveSession(entities, tracks, links).catch(() => {});
}

async function restoreSession() {
  try {
    const session = await loadSession();
    if (!session.entities || session.entities.length === 0) return;

    for (const entity of session.entities) {
      entityMap.set(entity.id, entity);
    }
    tracks = session.tracks || [];
    links = session.links || [];

    if (tracks.length > 0) {
      timeBounds = getTimeBounds(tracks);
      currentTime = timeBounds.timeMin;
      updateEntityList();
      updateTimeSlider();
      refreshLayers();
    }
  } catch {
    // IndexedDB not available or empty — ignore
  }
}
