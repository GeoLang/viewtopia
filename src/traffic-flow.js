/**
 * Traffic Flow Animation — animated polylines with speed data.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let trafficActive = false;
let trafficEntities = [];
let animInterval = null;

export function initTrafficFlow() {
  const btn = document.getElementById('traffic-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    trafficActive = !trafficActive;
    btn.classList.toggle('active', trafficActive);

    if (trafficActive) {
      showTrafficPanel();
    } else {
      clearTraffic();
      document.getElementById('traffic-panel')?.remove();
    }
  });
}

function showTrafficPanel() {
  let panel = document.getElementById('traffic-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'traffic-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🚗 Traffic Flow</span><button class="panel-close" id="traffic-close">✕</button></div>
    <div class="panel-body">
      <label>Mode
        <select id="traffic-mode">
          <option value="demo">Demo (generated roads)</option>
          <option value="geojson">Load road GeoJSON</option>
        </select>
      </label>
      <label>Congestion level
        <select id="traffic-congestion">
          <option value="free">Free flow (green)</option>
          <option value="moderate">Moderate (yellow)</option>
          <option value="heavy">Heavy (orange)</option>
          <option value="jam">Traffic jam (red)</option>
          <option value="mixed" selected>Mixed (realistic)</option>
        </select>
      </label>
      <label>Animation speed
        <input type="range" id="traffic-speed" min="1" max="10" value="5">
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="traffic-start">▶ Start</button>
        <button class="map-action-btn" id="traffic-stop">⏸ Stop</button>
        <button class="map-action-btn" id="traffic-clear">Clear</button>
      </div>
      <input type="file" id="traffic-file" accept=".geojson,.json" hidden>
      <div id="traffic-legend" style="margin-top:8px;font-size:11px;">
        <span style="color:#3fb950;">● Free</span>
        <span style="color:#f0c000;">● Moderate</span>
        <span style="color:#e67e22;">● Heavy</span>
        <span style="color:#f85149;">● Jam</span>
      </div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('traffic-close').onclick = () => {
    panel.remove();
    trafficActive = false;
    document.getElementById('traffic-btn')?.classList.remove('active');
    clearTraffic();
  };

  document.getElementById('traffic-start').onclick = () => startTraffic();
  document.getElementById('traffic-stop').onclick = () => stopTraffic();
  document.getElementById('traffic-clear').onclick = () => clearTraffic();

  document.getElementById('traffic-file').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadTrafficGeoJSON(file);
  };
}

function startTraffic() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearTraffic();

  const mode = document.getElementById('traffic-mode')?.value;
  if (mode === 'geojson') {
    document.getElementById('traffic-file')?.click();
    return;
  }

  // Generate demo roads around camera center
  const carto = viewer.camera.positionCartographic;
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);
  const congestion = document.getElementById('traffic-congestion')?.value || 'mixed';

  // Scale road span based on camera height
  const height = carto.height;
  const span = Math.max(0.002, Math.min(0.05, height * 0.000008));

  const roads = generateDemoRoads(centerLon, centerLat, span);

  // Draw static road lines with traffic colors
  for (const road of roads) {
    const level = congestion === 'mixed' ? randomCongestion() : congestion;
    const color = congestionColor(level);
    const width = road.major ? 6 : 3;

    const entity = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(road.coords),
        width,
        material: color,
        clampToGround: true,
      },
      properties: { speed: congestionSpeed(level), congestion: level },
    });
    trafficEntities.push(entity);
  }

  // Fly camera to see the traffic grid
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, Math.max(500, span * 111000 * 3)),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
    duration: 1.5,
  });

  // Animate "cars" moving along roads
  animateTraffic(viewer, roads, span);
}

function generateDemoRoads(centerLon, centerLat, span) {
  const roads = [];

  // Main roads (grid pattern)
  for (let i = -2; i <= 2; i++) {
    // Horizontal
    roads.push({
      coords: [
        centerLon - span, centerLat + i * span * 0.4,
        centerLon + span, centerLat + i * span * 0.4,
      ],
      major: i === 0,
    });
    // Vertical
    roads.push({
      coords: [
        centerLon + i * span * 0.4, centerLat - span,
        centerLon + i * span * 0.4, centerLat + span,
      ],
      major: i === 0,
    });
  }

  // Diagonal
  roads.push({
    coords: [centerLon - span * 0.8, centerLat - span * 0.8, centerLon + span * 0.8, centerLat + span * 0.8],
    major: false,
  });

  return roads;
}

function animateTraffic(viewer, roads, span) {
  const speed = parseInt(document.getElementById('traffic-speed')?.value || '5');
  const cars = [];

  // Place cars on roads
  for (const road of roads) {
    const numCars = road.major ? 5 : 2;
    for (let i = 0; i < numCars; i++) {
      cars.push({
        road,
        t: Math.random(),
        speed: (0.001 + Math.random() * 0.003) * speed,
        entity: null,
      });
    }
  }

  animInterval = setInterval(() => {
    for (const car of cars) {
      car.t += car.speed;
      if (car.t > 1) car.t = 0;

      const coords = car.road.coords;
      const startLon = coords[0], startLat = coords[1];
      const endLon = coords[2], endLat = coords[3];
      const lon = startLon + (endLon - startLon) * car.t;
      const lat = startLat + (endLat - startLat) * car.t;

      if (car.entity) {
        viewer.entities.remove(car.entity);
      }
      car.entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 5),
        point: { pixelSize: 6, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
      });
      trafficEntities.push(car.entity);
    }
  }, 100);
}

function stopTraffic() {
  if (animInterval) {
    clearInterval(animInterval);
    animInterval = null;
  }
}

function randomCongestion() {
  const r = Math.random();
  if (r < 0.4) return 'free';
  if (r < 0.7) return 'moderate';
  if (r < 0.9) return 'heavy';
  return 'jam';
}

function congestionColor(level) {
  switch (level) {
    case 'free': return Cesium.Color.fromCssColorString('#3fb950').withAlpha(0.8);
    case 'moderate': return Cesium.Color.fromCssColorString('#f0c000').withAlpha(0.8);
    case 'heavy': return Cesium.Color.fromCssColorString('#e67e22').withAlpha(0.8);
    case 'jam': return Cesium.Color.fromCssColorString('#f85149').withAlpha(0.8);
    default: return Cesium.Color.GRAY.withAlpha(0.5);
  }
}

function congestionSpeed(level) {
  switch (level) {
    case 'free': return 50;
    case 'moderate': return 30;
    case 'heavy': return 15;
    case 'jam': return 5;
    default: return 30;
  }
}

async function loadTrafficGeoJSON(file) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  try {
    const text = await file.text();
    const geojson = JSON.parse(text);
    const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
      stroke: Cesium.Color.GREEN,
      strokeWidth: 3,
      clampToGround: true,
    });
    viewer.dataSources.add(dataSource);
    viewer.flyTo(dataSource);
  } catch (e) {
    alert(`Failed to load traffic data: ${e.message}`);
  }
}

function clearTraffic() {
  stopTraffic();
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of trafficEntities) viewer.entities.remove(e);
  trafficEntities = [];
}
