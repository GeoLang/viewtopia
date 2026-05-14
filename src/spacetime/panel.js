/**
 * Space-Time panel — main integration point for ViewTopia.
 *
 * Manages the space-time visualization mode:
 * - Sidebar panel with entity list, time controls
 * - deck.gl layer management
 * - File import (drag-and-drop CSV/GPX)
 * - Time scrubber with play/pause animation
 */

import { createSpaceTimeLayers, getTimeBounds } from './layers.js';
import { ingestFile } from './ingest.js';

/** @type {Map<string, import('./models.js').Entity>} */
const entityMap = new Map();
/** @type {import('./models.js').Track[]} */
let tracks = [];
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

/**
 * Initialize the space-time panel.
 * @param {Object} opts
 * @param {Function} opts.onLayersUpdate - Called with new deck.gl layers array
 */
export function initSpaceTime({ onLayersUpdate }) {
  updateLayersCallback = onLayersUpdate;
  createPanel();
}

/**
 * Load tracks from file content.
 * @param {string} text - File content
 * @param {string} filename - Filename for format detection
 */
export function loadSpaceTimeData(text, filename) {
  const result = ingestFile(text, filename);

  for (const entity of result.entities) {
    entityMap.set(entity.id, entity);
  }
  tracks = tracks.concat(result.tracks);
  timeBounds = getTimeBounds(tracks);
  currentTime = timeBounds.timeMin;

  updateEntityList();
  updateTimeSlider();
  refreshLayers();
  showPanel();
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
    refreshLayers();
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
      <p>Drop CSV or GPX file here</p>
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
  list.innerHTML = [...entityMap.values()].map(e => `
    <div class="st-entity" style="border-left: 4px solid ${e.color}">
      <span class="st-entity-name">${e.name}</span>
      <span class="st-entity-kind">${e.kind}</span>
    </div>
  `).join('');
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
