/**
 * Flood Simulation — water level slider over terrain.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let floodActive = false;
let floodEntity = null;

export function initFloodSim() {
  const btn = document.getElementById('flood-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    floodActive = !floodActive;
    btn.classList.toggle('active', floodActive);

    if (floodActive) {
      showFloodPanel();
    } else {
      clearFlood();
      document.getElementById('flood-panel')?.remove();
    }
  });
}

function showFloodPanel() {
  let panel = document.getElementById('flood-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'flood-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🌊 Flood Simulation</span><button class="panel-close" id="flood-close">✕</button></div>
    <div class="panel-body">
      <label>Water level (m above sea level)
        <input type="range" id="flood-level" min="0" max="100" value="5" step="0.5">
        <span id="flood-level-val">5.0</span>m
      </label>
      <label>Opacity
        <input type="range" id="flood-opacity" min="10" max="90" value="60">
      </label>
      <label>Water color
        <input type="color" id="flood-color" value="#1e88e5">
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="flood-apply">Apply</button>
        <button class="map-action-btn" id="flood-animate">▶ Animate Rise</button>
        <button class="map-action-btn" id="flood-clear">Clear</button>
      </div>
      <div id="flood-stats" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('flood-close').onclick = () => {
    panel.remove();
    floodActive = false;
    document.getElementById('flood-btn')?.classList.remove('active');
    clearFlood();
  };

  const levelSlider = document.getElementById('flood-level');
  levelSlider.oninput = () => {
    document.getElementById('flood-level-val').textContent = parseFloat(levelSlider.value).toFixed(1);
    updateFlood();
  };

  document.getElementById('flood-opacity').oninput = () => updateFlood();
  document.getElementById('flood-color').oninput = () => updateFlood();
  document.getElementById('flood-apply').onclick = () => updateFlood();
  document.getElementById('flood-animate').onclick = () => animateFlood();
  document.getElementById('flood-clear').onclick = () => clearFlood();

  updateFlood();
}

function updateFlood() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const level = parseFloat(document.getElementById('flood-level')?.value || '5');
  const opacity = parseInt(document.getElementById('flood-opacity')?.value || '60') / 100;
  const color = document.getElementById('flood-color')?.value || '#1e88e5';

  // Get current view extent
  let rect = viewer.camera.computeViewRectangle();
  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const span = 0.01;
    rect = new Cesium.Rectangle(
      carto.longitude - span, carto.latitude - span,
      carto.longitude + span, carto.latitude + span,
    );
  }

  // Remove old flood entity
  if (floodEntity) viewer.entities.remove(floodEntity);

  // Create a rectangle at the water level
  const cesiumColor = Cesium.Color.fromCssColorString(color).withAlpha(opacity);

  floodEntity = viewer.entities.add({
    rectangle: {
      coordinates: rect,
      height: level,
      material: cesiumColor,
      outline: true,
      outlineColor: cesiumColor.withAlpha(0.8),
      outlineWidth: 1,
    },
  });

  // Update stats
  const statsEl = document.getElementById('flood-stats');
  if (statsEl) {
    const areaDeg = (Cesium.Math.toDegrees(rect.east) - Cesium.Math.toDegrees(rect.west)) *
                    (Cesium.Math.toDegrees(rect.north) - Cesium.Math.toDegrees(rect.south));
    const areaKm2 = areaDeg * 111 * 111; // rough approximation
    statsEl.textContent = `Water level: ${level}m | Area: ~${areaKm2.toFixed(1)} km² | Volume: ~${(areaKm2 * level * 0.001).toFixed(2)} km³`;
  }
}

let animationFrame = null;

function animateFlood() {
  const slider = document.getElementById('flood-level');
  const btn = document.getElementById('flood-animate');
  if (!slider || !btn) return;

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    btn.textContent = '▶ Animate Rise';
    return;
  }

  btn.textContent = '⏸ Pause';
  let currentLevel = 0;
  const maxLevel = parseFloat(slider.max);
  const speed = 0.1;

  function step() {
    currentLevel += speed;
    if (currentLevel > maxLevel) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
      btn.textContent = '▶ Animate Rise';
      return;
    }
    slider.value = currentLevel;
    document.getElementById('flood-level-val').textContent = currentLevel.toFixed(1);
    updateFlood();
    animationFrame = requestAnimationFrame(step);
  }

  animationFrame = requestAnimationFrame(step);
}

function clearFlood() {
  const viewer = getCesiumViewer();
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  if (viewer && floodEntity) {
    viewer.entities.remove(floodEntity);
    floodEntity = null;
  }
}
