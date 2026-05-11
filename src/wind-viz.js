/**
 * Wind Visualization — animated arrow/particle field showing wind direction.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let windActive = false;
let windEntities = [];
let animInterval = null;

export function initWindViz() {
  const btn = document.getElementById('wind-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    windActive = !windActive;
    btn.classList.toggle('active', windActive);

    if (windActive) {
      showWindPanel();
    } else {
      clearWind();
      document.getElementById('wind-panel')?.remove();
    }
  });
}

function showWindPanel() {
  let panel = document.getElementById('wind-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'wind-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>💨 Wind Visualization</span><button class="panel-close" id="wind-close">✕</button></div>
    <div class="panel-body">
      <label>Direction (°)
        <input type="range" id="wind-dir" min="0" max="360" value="225" step="5">
        <span id="wind-dir-val">225° SW</span>
      </label>
      <label>Speed (m/s)
        <input type="range" id="wind-speed" min="1" max="40" value="10">
        <span id="wind-speed-val">10</span>
      </label>
      <label>Grid density
        <select id="wind-density">
          <option value="5">Sparse (5×5)</option>
          <option value="10" selected>Medium (10×10)</option>
          <option value="20">Dense (20×20)</option>
        </select>
      </label>
      <label>Style
        <select id="wind-style">
          <option value="arrows">Arrows</option>
          <option value="streamlines">Streamlines</option>
          <option value="particles">Particles</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="wind-apply">Apply</button>
        <button class="map-action-btn" id="wind-clear">Clear</button>
      </div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('wind-close').onclick = () => {
    panel.remove();
    windActive = false;
    document.getElementById('wind-btn')?.classList.remove('active');
    clearWind();
  };

  const dirSlider = document.getElementById('wind-dir');
  dirSlider.oninput = () => {
    const d = parseInt(dirSlider.value);
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    const label = dirs[Math.round(d / 45) % 8];
    document.getElementById('wind-dir-val').textContent = `${d}° ${label}`;
  };

  document.getElementById('wind-speed').oninput = (e) => {
    document.getElementById('wind-speed-val').textContent = e.target.value;
  };

  document.getElementById('wind-apply').onclick = () => applyWind();
  document.getElementById('wind-clear').onclick = () => clearWind();
}

function applyWind() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearWind();

  const direction = parseInt(document.getElementById('wind-dir')?.value || '225');
  const speed = parseInt(document.getElementById('wind-speed')?.value || '10');
  const density = parseInt(document.getElementById('wind-density')?.value || '10');
  const style = document.getElementById('wind-style')?.value || 'arrows';

  // Get view bounds
  let rect = viewer.camera.computeViewRectangle();
  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const span = 0.02;
    rect = new Cesium.Rectangle(
      carto.longitude - span, carto.latitude - span,
      carto.longitude + span, carto.latitude + span,
    );
  }

  const west = Cesium.Math.toDegrees(rect.west);
  const south = Cesium.Math.toDegrees(rect.south);
  const east = Cesium.Math.toDegrees(rect.east);
  const north = Cesium.Math.toDegrees(rect.north);

  const dirRad = Cesium.Math.toRadians(direction);
  const dx = Math.sin(dirRad);
  const dy = Math.cos(dirRad);

  if (style === 'arrows') {
    drawArrows(viewer, west, south, east, north, density, dx, dy, speed);
  } else if (style === 'streamlines') {
    drawStreamlines(viewer, west, south, east, north, density, dx, dy, speed);
  } else {
    drawParticles(viewer, west, south, east, north, density, dx, dy, speed);
  }
}

function drawArrows(viewer, west, south, east, north, density, dx, dy, speed) {
  const stepX = (east - west) / density;
  const stepY = (north - south) / density;
  const arrowLen = Math.min(stepX, stepY) * 0.4 * (speed / 10);

  for (let i = 0; i < density; i++) {
    for (let j = 0; j < density; j++) {
      const lon = west + stepX * (i + 0.5);
      const lat = south + stepY * (j + 0.5);

      // Add some turbulence
      const turbulence = Math.sin(i * 0.7 + j * 1.3) * 0.15;
      const localDx = dx + turbulence;
      const localDy = dy - turbulence;

      const endLon = lon + localDx * arrowLen;
      const endLat = lat + localDy * arrowLen;

      // Color by speed (blue=slow, red=fast)
      const t = Math.min(speed / 30, 1);
      const color = Cesium.Color.fromHsl(0.6 - t * 0.6, 0.8, 0.5, 0.8);

      const entity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([lon, lat, endLon, endLat]),
          width: 2,
          material: new Cesium.PolylineArrowMaterialProperty(color),
          clampToGround: true,
        },
      });
      windEntities.push(entity);
    }
  }
}

function drawStreamlines(viewer, west, south, east, north, density, dx, dy, speed) {
  const stepX = (east - west) / (density / 2);
  const stepY = (north - south) / (density / 2);
  const segments = 8;
  const segLen = Math.min(stepX, stepY) * 0.3;

  for (let i = 0; i < density / 2; i++) {
    for (let j = 0; j < density / 2; j++) {
      const positions = [];
      let lon = west + stepX * (i + 0.5);
      let lat = south + stepY * (j + 0.5);

      for (let s = 0; s <= segments; s++) {
        positions.push(lon, lat);
        const turb = Math.sin(lon * 50 + lat * 50 + s) * 0.2;
        lon += (dx + turb) * segLen;
        lat += (dy - turb) * segLen;
      }

      const t = Math.min(speed / 30, 1);
      const color = Cesium.Color.fromHsl(0.55 - t * 0.5, 0.7, 0.5, 0.7);

      const entity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(positions),
          width: 1.5,
          material: color,
          clampToGround: true,
        },
      });
      windEntities.push(entity);
    }
  }
}

function drawParticles(viewer, west, south, east, north, density, dx, dy, speed) {
  const count = density * density;
  const particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      lon: west + Math.random() * (east - west),
      lat: south + Math.random() * (north - south),
    });
  }

  const stepSize = 0.0001 * speed;

  // Animate particles
  animInterval = setInterval(() => {
    // Remove old
    for (const e of windEntities) viewer.entities.remove(e);
    windEntities = [];

    for (const p of particles) {
      const turb = Math.sin(p.lon * 1000 + p.lat * 1000) * 0.3;
      p.lon += (dx + turb) * stepSize;
      p.lat += (dy - turb) * stepSize;

      // Wrap around
      if (p.lon > east) p.lon = west;
      if (p.lon < west) p.lon = east;
      if (p.lat > north) p.lat = south;
      if (p.lat < south) p.lat = north;

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 50),
        point: { pixelSize: 3, color: Cesium.Color.CYAN.withAlpha(0.7) },
      });
      windEntities.push(entity);
    }
  }, 200);
}

function clearWind() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (animInterval) { clearInterval(animInterval); animInterval = null; }
  for (const e of windEntities) viewer.entities.remove(e);
  windEntities = [];
}
