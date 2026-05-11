/**
 * Time-lapse — satellite imagery comparison with before/after swipe slider.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let timelapseActive = false;
let layerA = null;
let layerB = null;
let splitPosition = 0.5;

export function initTimelapse() {
  const btn = document.getElementById('timelapse-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    timelapseActive = !timelapseActive;
    btn.classList.toggle('active', timelapseActive);
    if (timelapseActive) showTimelapsePanel();
    else { document.getElementById('timelapse-panel')?.remove(); clearTimelapse(); }
  });
}

function showTimelapsePanel() {
  let panel = document.getElementById('timelapse-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'timelapse-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>⏳ Time-lapse / Comparison</span><button class="panel-close" id="timelapse-close">✕</button></div>
    <div class="panel-body">
      <label>Left layer (Before)
        <select id="timelapse-left">
          <option value="osm">OpenStreetMap</option>
          <option value="satellite">Satellite (Esri)</option>
          <option value="topo">OpenTopo</option>
          <option value="stamen-toner">Stamen Toner</option>
          <option value="carto-dark">CartoDB Dark</option>
        </select>
      </label>
      <label>Right layer (After)
        <select id="timelapse-right">
          <option value="satellite" selected>Satellite (Esri)</option>
          <option value="osm">OpenStreetMap</option>
          <option value="topo">OpenTopo</option>
          <option value="stamen-toner">Stamen Toner</option>
          <option value="carto-dark">CartoDB Dark</option>
        </select>
      </label>
      <label>Split position
        <input type="range" id="timelapse-split" min="0" max="100" value="50" style="width:100%;">
      </label>
      <label>Mode
        <select id="timelapse-mode">
          <option value="swipe">Swipe (split screen)</option>
          <option value="fade">Fade (opacity blend)</option>
          <option value="flicker">Flicker (toggle)</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="timelapse-apply">Apply</button>
        <button class="map-action-btn" id="timelapse-animate">▶ Animate</button>
        <button class="map-action-btn" id="timelapse-clear">Reset</button>
      </div>
      <div id="timelapse-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('timelapse-close').onclick = () => {
    panel.remove();
    timelapseActive = false;
    document.getElementById('timelapse-btn')?.classList.remove('active');
    clearTimelapse();
  };

  document.getElementById('timelapse-split').oninput = (e) => {
    splitPosition = e.target.value / 100;
    updateSplit();
  };

  document.getElementById('timelapse-apply').onclick = () => applyComparison();
  document.getElementById('timelapse-animate').onclick = () => animateComparison();
  document.getElementById('timelapse-clear').onclick = () => clearTimelapse();
}

function getImageryProvider(name) {
  switch (name) {
    case 'osm':
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
    case 'satellite':
      return new Cesium.ArcGisMapServerImageryProvider({ url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' });
    case 'topo':
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.opentopomap.org/' });
    case 'stamen-toner':
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/' });
    case 'carto-dark':
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://basemaps.cartocdn.com/dark_all/' });
    default:
      return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
  }
}

function applyComparison() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearTimelapse();

  const leftName = document.getElementById('timelapse-left')?.value || 'osm';
  const rightName = document.getElementById('timelapse-right')?.value || 'satellite';
  const mode = document.getElementById('timelapse-mode')?.value || 'swipe';

  const leftProvider = getImageryProvider(leftName);
  const rightProvider = getImageryProvider(rightName);

  // Remove existing base layer and add two new layers
  const layers = viewer.imageryLayers;

  layerA = layers.addImageryProvider(leftProvider);
  layerB = layers.addImageryProvider(rightProvider);

  if (mode === 'swipe') {
    // Use Cesium's splitDirection for swipe comparison
    layerA.splitDirection = Cesium.SplitDirection.LEFT;
    layerB.splitDirection = Cesium.SplitDirection.RIGHT;
    viewer.scene.splitPosition = splitPosition;
    setInfo(`Swipe: ${leftName} (left) | ${rightName} (right)`);
  } else if (mode === 'fade') {
    layerB.alpha = splitPosition;
    setInfo(`Fade blend: ${leftName} → ${rightName} (${Math.round(splitPosition * 100)}%)`);
  } else {
    // Flicker mode: toggle visibility
    setInfo(`Flicker: alternating ${leftName} / ${rightName}`);
  }
}

function updateSplit() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const mode = document.getElementById('timelapse-mode')?.value || 'swipe';

  if (mode === 'swipe') {
    viewer.scene.splitPosition = splitPosition;
  } else if (mode === 'fade' && layerB) {
    layerB.alpha = splitPosition;
  }
}

let animInterval = null;

function animateComparison() {
  const mode = document.getElementById('timelapse-mode')?.value || 'swipe';
  const slider = document.getElementById('timelapse-split');

  if (animInterval) { clearInterval(animInterval); animInterval = null; setInfo('Animation stopped'); return; }

  let pos = 0;
  let direction = 1;

  if (mode === 'flicker') {
    // Toggle layers
    let showA = true;
    animInterval = setInterval(() => {
      if (layerA) layerA.show = showA;
      if (layerB) layerB.show = !showA;
      showA = !showA;
    }, 1000);
    setInfo('Flickering between layers...');
  } else {
    // Animate split position
    animInterval = setInterval(() => {
      pos += 0.01 * direction;
      if (pos >= 1) direction = -1;
      if (pos <= 0) direction = 1;

      splitPosition = pos;
      if (slider) slider.value = Math.round(pos * 100);
      updateSplit();
    }, 30);
    setInfo('Animating split...');
  }
}

function setInfo(msg) {
  const el = document.getElementById('timelapse-info');
  if (el) el.textContent = msg;
}

function clearTimelapse() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (animInterval) { clearInterval(animInterval); animInterval = null; }

  const layers = viewer.imageryLayers;
  if (layerA) { layers.remove(layerA, false); layerA = null; }
  if (layerB) { layers.remove(layerB, false); layerB = null; }

  viewer.scene.splitPosition = 0.5;
  setInfo('');
}
