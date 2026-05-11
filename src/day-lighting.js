/**
 * Time-of-Day Lighting — simulate sun position for any date/time.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let lightingActive = false;

export function initDayLighting() {
  const btn = document.getElementById('lighting-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    lightingActive = !lightingActive;
    btn.classList.toggle('active', lightingActive);

    if (lightingActive) {
      showLightingPanel();
    } else {
      resetLighting();
      document.getElementById('lighting-panel')?.remove();
    }
  });
}

function showLightingPanel() {
  let panel = document.getElementById('lighting-panel');
  if (panel) panel.remove();

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  panel = document.createElement('div');
  panel.id = 'lighting-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>☀ Day Lighting</span><button class="panel-close" id="lighting-close">✕</button></div>
    <div class="panel-body">
      <label>Date
        <input type="date" id="light-date" value="${dateStr}">
      </label>
      <label>Time (local)
        <input type="time" id="light-time" value="${timeStr}">
      </label>
      <label>Time slider
        <input type="range" id="light-slider" min="0" max="1440" value="${now.getHours() * 60 + now.getMinutes()}" step="5">
        <span id="light-slider-val">${timeStr}</span>
      </label>
      <label>
        <input type="checkbox" id="light-shadows" checked> Enable shadows
      </label>
      <label>
        <input type="checkbox" id="light-animate"> Animate day cycle
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="light-apply">Apply</button>
        <button class="map-action-btn" id="light-reset">Reset</button>
      </div>
      <div id="light-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('lighting-close').onclick = () => {
    panel.remove();
    lightingActive = false;
    document.getElementById('lighting-btn')?.classList.remove('active');
    resetLighting();
  };

  const slider = document.getElementById('light-slider');
  slider.oninput = () => {
    const mins = parseInt(slider.value);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    document.getElementById('light-slider-val').textContent = timeLabel;
    document.getElementById('light-time').value = timeLabel;
    applyLighting();
  };

  document.getElementById('light-time').oninput = (e) => {
    const [h, m] = e.target.value.split(':').map(Number);
    slider.value = h * 60 + m;
    document.getElementById('light-slider-val').textContent = e.target.value;
    applyLighting();
  };

  document.getElementById('light-shadows').onchange = () => applyLighting();
  document.getElementById('light-animate').onchange = (e) => {
    if (e.target.checked) startAnimation();
    else stopAnimation();
  };

  document.getElementById('light-apply').onclick = () => applyLighting();
  document.getElementById('light-reset').onclick = () => resetLighting();

  applyLighting();
}

function applyLighting() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const date = document.getElementById('light-date')?.value;
  const time = document.getElementById('light-time')?.value;
  const shadows = document.getElementById('light-shadows')?.checked;

  if (!date || !time) return;

  const dt = new Date(`${date}T${time}:00`);
  const julianDate = Cesium.JulianDate.fromDate(dt);

  viewer.clock.currentTime = julianDate;
  viewer.clock.shouldAnimate = false;
  viewer.scene.globe.enableLighting = true;
  viewer.shadows = shadows;

  // Update info
  const info = document.getElementById('light-info');
  if (info) {
    const hour = dt.getHours();
    let period = 'Night';
    if (hour >= 6 && hour < 8) period = 'Dawn';
    else if (hour >= 8 && hour < 17) period = 'Day';
    else if (hour >= 17 && hour < 20) period = 'Dusk';

    info.textContent = `${dt.toLocaleString()} | ${period} | Shadows: ${shadows ? 'ON' : 'OFF'}`;
  }
}

let animId = null;

function startAnimation() {
  const slider = document.getElementById('light-slider');
  if (!slider) return;

  function step() {
    let val = parseInt(slider.value) + 2;
    if (val > 1440) val = 0;
    slider.value = val;
    const h = Math.floor(val / 60);
    const m = val % 60;
    document.getElementById('light-slider-val').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    document.getElementById('light-time').value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    applyLighting();
    animId = requestAnimationFrame(step);
  }
  animId = requestAnimationFrame(step);
}

function stopAnimation() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

function resetLighting() {
  stopAnimation();
  const viewer = getCesiumViewer();
  if (!viewer) return;

  viewer.clock.currentTime = Cesium.JulianDate.now();
  viewer.clock.shouldAnimate = true;
  viewer.scene.globe.enableLighting = false;
  viewer.shadows = false;
}
