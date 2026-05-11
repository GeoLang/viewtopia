/**
 * Weather & Atmosphere Effects — fog, rain, snow particle systems.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let weatherActive = false;
let particleSystem = null;

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

  if (type === 'fog') {
    // Use scene fog
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0002 * (intensity / 50);
    viewer.scene.fog.minimumBrightness = 0.03;
    return;
  }

  // Particle systems for rain/snow/storm
  const emitterPosition = viewer.camera.positionWC.clone();
  const config = getParticleConfig(type, intensity, wind);

  particleSystem = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Matrix4.fromTranslation(emitterPosition),
    emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(500, 500, 200)),
    emissionRate: config.emissionRate,
    startColor: config.startColor,
    endColor: config.endColor,
    startScale: config.startScale,
    endScale: config.endScale,
    minimumParticleLife: config.minLife,
    maximumParticleLife: config.maxLife,
    minimumSpeed: config.minSpeed,
    maximumSpeed: config.maxSpeed,
    imageSize: config.imageSize,
    image: config.image,
    lifetime: 600,
    loop: true,
    updateCallback: (particle) => {
      // Apply wind drift
      particle.position.x += wind * 0.1;
    },
  });

  viewer.scene.primitives.add(particleSystem);

  // Follow camera
  viewer.scene.preRender.addEventListener(updateParticlePosition);
}

function updateParticlePosition() {
  const viewer = getCesiumViewer();
  if (!viewer || !particleSystem) return;
  particleSystem.modelMatrix = Cesium.Matrix4.fromTranslation(viewer.camera.positionWC);
}

function getParticleConfig(type, intensity, wind) {
  const rate = intensity * 20;

  if (type === 'rain') {
    return {
      emissionRate: rate,
      startColor: new Cesium.Color(0.6, 0.7, 0.9, 0.6),
      endColor: new Cesium.Color(0.4, 0.5, 0.7, 0.2),
      startScale: 1.0,
      endScale: 0.5,
      minLife: 0.5,
      maxLife: 1.5,
      minSpeed: 20,
      maxSpeed: 40 + wind,
      imageSize: new Cesium.Cartesian2(2, 12),
      image: createRainImage(),
    };
  }

  if (type === 'snow') {
    return {
      emissionRate: rate * 0.5,
      startColor: Cesium.Color.WHITE.withAlpha(0.8),
      endColor: Cesium.Color.WHITE.withAlpha(0.3),
      startScale: 1.0,
      endScale: 0.8,
      minLife: 2.0,
      maxLife: 6.0,
      minSpeed: 2,
      maxSpeed: 8 + wind * 0.5,
      imageSize: new Cesium.Cartesian2(8, 8),
      image: createSnowImage(),
    };
  }

  // Storm
  return {
    emissionRate: rate * 2,
    startColor: new Cesium.Color(0.5, 0.5, 0.6, 0.8),
    endColor: new Cesium.Color(0.3, 0.3, 0.4, 0.2),
    startScale: 1.2,
    endScale: 0.6,
    minLife: 0.3,
    maxLife: 1.0,
    minSpeed: 30,
    maxSpeed: 60 + wind * 2,
    imageSize: new Cesium.Cartesian2(3, 16),
    image: createRainImage(),
  };
}

function createRainImage() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 16;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(2, 0, 2, 16);
  grad.addColorStop(0, 'rgba(180,200,220,0.8)');
  grad.addColorStop(1, 'rgba(180,200,220,0.1)');
  ctx.fillStyle = grad;
  ctx.fillRect(1, 0, 2, 16);
  return c.toDataURL();
}

function createSnowImage() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(8, 8, 6, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 6);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = grad;
  ctx.fill();
  return c.toDataURL();
}

function clearWeather() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (particleSystem) {
    viewer.scene.primitives.remove(particleSystem);
    particleSystem = null;
  }
  viewer.scene.fog.enabled = false;
  viewer.scene.preRender.removeEventListener(updateParticlePosition);
}
