/**
 * Shadows analysis — time-of-day shadow simulation with sun position slider.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

export function initShadows() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'shadow-btn';
  btn.title = 'Shadow analysis';
  btn.textContent = '🌅 Shadows';
  toolbar.appendChild(btn);

  // Shadow panel
  const panel = document.createElement('div');
  panel.id = 'shadow-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="shadow-header">
      <span>🌅 Shadow Analysis</span>
      <button id="shadow-close">×</button>
    </div>
    <div class="shadow-controls">
      <label>Date: <input type="date" id="shadow-date" /></label>
      <label>Time: <input type="range" id="shadow-time" min="0" max="1439" value="720" /></label>
      <span id="shadow-time-label">12:00</span>
      <label><input type="checkbox" id="shadow-enable" /> Enable shadows</label>
      <button id="shadow-animate" class="map-action-btn">▶ Animate day</button>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
      document.getElementById('shadow-date').value = new Date().toISOString().slice(0, 10);
    }
  });

  document.getElementById('shadow-close').addEventListener('click', () => panel.style.display = 'none');

  document.getElementById('shadow-enable').addEventListener('change', (e) => {
    const viewer = getCesiumViewer();
    if (viewer) viewer.shadows = e.target.checked;
  });

  document.getElementById('shadow-time').addEventListener('input', (e) => {
    const mins = parseInt(e.target.value);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    document.getElementById('shadow-time-label').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    updateSunPosition(mins);
  });

  document.getElementById('shadow-animate').addEventListener('click', animateDay);
}

function updateSunPosition(totalMinutes) {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  const dateStr = document.getElementById('shadow-date').value;
  if (!dateStr) return;
  const date = new Date(dateStr);
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
}

let animId = null;
function animateDay() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  if (animId) { cancelAnimationFrame(animId); animId = null; return; }

  const slider = document.getElementById('shadow-time');
  let mins = 0;
  function step() {
    mins += 2;
    if (mins > 1439) { animId = null; return; }
    slider.value = mins;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    document.getElementById('shadow-time-label').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    updateSunPosition(mins);
    animId = requestAnimationFrame(step);
  }
  animId = requestAnimationFrame(step);
}
