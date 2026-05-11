/**
 * Weather & Atmosphere Effects — canvas overlay for rain, snow, fog, storm.
 * Uses a transparent canvas overlay on top of the globe for reliable rendering.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let weatherActive = false;
let animFrameId = null;
let weatherCanvas = null;
let particles = [];

export function initWeather() {
  const btn = document.getElementById('weather-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    weatherActive = !weatherActive;
    btn.classList.toggle('active', weatherActive);

    if (weatherActive) {
      showWeatherPanel();
    } else {
      clearWeather();
      document.getElementById('weather-panel')?.remove();
    }
  });
}

function showWeatherPanel() {
  let panel = document.getElementById('weather-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'weather-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🌦 Weather</span><button class="panel-close" id="weather-close">✕</button></div>
    <div class="panel-body">
      <label>Effect
        <select id="weather-type">
          <option value="none">None</option>
          <option value="rain">🌧 Rain</option>
          <option value="snow">❄ Snow</option>
          <option value="fog">🌫 Fog</option>
          <option value="storm">⛈ Storm</option>
        </select>
      </label>
      <label>Intensity
        <input type="range" id="weather-intensity" min="1" max="100" value="50">
      </label>
      <label>Wind speed (m/s)
        <input type="range" id="weather-wind" min="0" max="30" value="5">
        <span id="weather-wind-val">5</span>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="weather-apply">Apply</button>
        <button class="map-action-btn" id="weather-clear">Clear</button>
      </div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('weather-close').onclick = () => {
    panel.remove();
    weatherActive = false;
    document.getElementById('weather-btn')?.classList.remove('active');
    clearWeather();
  };

  const windSlider = document.getElementById('weather-wind');
  windSlider.oninput = () => { document.getElementById('weather-wind-val').textContent = windSlider.value; };

  document.getElementById('weather-apply').onclick = () => applyWeather();
  document.getElementById('weather-clear').onclick = () => clearWeather();
}

function applyWeather() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearWeather();

  const type = document.getElementById('weather-type')?.value || 'none';
  const intensity = parseInt(document.getElementById('weather-intensity')?.value || '50');
  const wind = parseInt(document.getElementById('weather-wind')?.value || '5');

  if (type === 'none') return;

  // Fog uses Cesium's built-in fog
  if (type === 'fog') {
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0003 * (intensity / 50);
    viewer.scene.fog.minimumBrightness = 0.02;
    // Also darken the sky
    viewer.scene.skyAtmosphere.show = false;
    return;
  }

  // Create canvas overlay for rain/snow/storm
  const container = document.getElementById('globe-container') || viewer.container;
  weatherCanvas = document.createElement('canvas');
  weatherCanvas.id = 'weather-overlay';
  weatherCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  container.style.position = 'relative';
  container.appendChild(weatherCanvas);

  // Match canvas resolution
  const rect = container.getBoundingClientRect();
  weatherCanvas.width = rect.width;
  weatherCanvas.height = rect.height;

  // Create particles
  const numParticles = Math.floor(intensity * (type === 'snow' ? 3 : 8));
  particles = [];
  for (let i = 0; i < numParticles; i++) {
    particles.push(createParticle(type, weatherCanvas.width, weatherCanvas.height, wind));
  }

  // Start animation
  const ctx = weatherCanvas.getContext('2d');
  function animate() {
    ctx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);

    for (const p of particles) {
      updateParticle(p, type, weatherCanvas.width, weatherCanvas.height, wind);
      drawParticle(ctx, p, type);
    }

    animFrameId = requestAnimationFrame(animate);
  }
  animate();
}

function createParticle(type, w, h, wind) {
  if (type === 'snow') {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size: 2 + Math.random() * 4,
      speed: 0.5 + Math.random() * 1.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.03,
      opacity: 0.4 + Math.random() * 0.5,
    };
  }

  // Rain / Storm
  return {
    x: Math.random() * (w + 100) - 50,
    y: Math.random() * h,
    length: type === 'storm' ? 15 + Math.random() * 25 : 8 + Math.random() * 15,
    speed: type === 'storm' ? 12 + Math.random() * 18 : 6 + Math.random() * 10,
    opacity: 0.2 + Math.random() * 0.4,
    windDrift: wind * 0.3,
  };
}

function updateParticle(p, type, w, h, wind) {
  if (type === 'snow') {
    p.y += p.speed;
    p.wobble += p.wobbleSpeed;
    p.x += Math.sin(p.wobble) * 0.5 + wind * 0.1;

    if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
    if (p.x > w) p.x = 0;
    if (p.x < 0) p.x = w;
  } else {
    // Rain / Storm
    p.y += p.speed;
    p.x += p.windDrift;

    if (p.y > h) {
      p.y = -p.length;
      p.x = Math.random() * (w + 100) - 50;
    }
  }
}

function drawParticle(ctx, p, type) {
  if (type === 'snow') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
    ctx.fill();
  } else {
    // Rain / Storm
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.windDrift * 0.5, p.y + p.length);
    ctx.strokeStyle = type === 'storm'
      ? `rgba(180, 190, 220, ${p.opacity})`
      : `rgba(174, 194, 224, ${p.opacity})`;
    ctx.lineWidth = type === 'storm' ? 2 : 1;
    ctx.stroke();
  }
}

function clearWeather() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (weatherCanvas) {
    weatherCanvas.remove();
    weatherCanvas = null;
  }

  particles = [];

  const viewer = getCesiumViewer();
  if (viewer) {
    viewer.scene.fog.enabled = false;
    viewer.scene.fog.density = 0.0001;
    viewer.scene.skyAtmosphere.show = true;
  }
}
