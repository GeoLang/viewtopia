/**
 * Drone Flight Planner — waypoint mission planning on the 3D globe.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let droneActive = false;
let waypoints = [];
let waypointEntities = [];
let routeEntity = null;
let simulationRunning = false;
let droneEntity = null;

export function initDronePlanner() {
  const btn = document.getElementById('drone-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    droneActive = !droneActive;
    btn.classList.toggle('active', droneActive);

    if (droneActive) {
      showDronePanel();
    } else {
      clearDrone();
      document.getElementById('drone-panel')?.remove();
    }
  });
}

function showDronePanel() {
  let panel = document.getElementById('drone-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'drone-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🛸 Drone Flight Planner</span><button class="panel-close" id="drone-close">✕</button></div>
    <div class="panel-body">
      <label>Flight altitude (m AGL)
        <input type="number" id="drone-alt" value="50" min="10" max="400" step="5" style="width:70px;">
      </label>
      <label>Speed (m/s)
        <input type="number" id="drone-speed" value="8" min="1" max="25" step="1" style="width:70px;">
      </label>
      <label>Camera interval
        <select id="drone-interval">
          <option value="2">Every 2s</option>
          <option value="5" selected>Every 5s</option>
          <option value="10">Every 10s</option>
          <option value="0">No capture</option>
        </select>
      </label>
      <label>Mission pattern
        <select id="drone-pattern">
          <option value="waypoint">Waypoint</option>
          <option value="grid">Grid survey</option>
          <option value="orbit">Orbit (POI)</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="map-action-btn" id="drone-add-wp">+ Add Waypoints</button>
        <button class="map-action-btn" id="drone-sim">▶ Simulate</button>
        <button class="map-action-btn" id="drone-export">⬇ Export KML</button>
        <button class="map-action-btn" id="drone-clear">Clear</button>
      </div>
      <div id="drone-stats" style="margin-top:8px;font-size:11px;color:#aaa;"></div>
      <div id="drone-wp-list" style="margin-top:4px;font-size:10px;color:#888;max-height:100px;overflow-y:auto;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('drone-close').onclick = () => {
    panel.remove();
    droneActive = false;
    document.getElementById('drone-btn')?.classList.remove('active');
    clearDrone();
  };

  document.getElementById('drone-add-wp').onclick = () => startWaypointPick();
  document.getElementById('drone-sim').onclick = () => simulateFlight();
  document.getElementById('drone-export').onclick = () => exportKML();
  document.getElementById('drone-clear').onclick = () => clearDrone();
}

function startWaypointPick() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  viewer.canvas.style.cursor = 'crosshair';
  const stats = document.getElementById('drone-stats');
  if (stats) stats.textContent = 'Left-click to add waypoints, right-click to finish';

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  handler.setInputAction((click) => {
    const ray = viewer.camera.getPickRay(click.position);
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;

    const carto = Cesium.Cartographic.fromCartesian(pos);
    const alt = parseFloat(document.getElementById('drone-alt')?.value || '50');
    const wpPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + alt);

    waypoints.push({
      position: wpPos,
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude),
      alt,
    });

    const entity = viewer.entities.add({
      position: wpPos,
      point: { pixelSize: 10, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: `WP${waypoints.length}`,
        font: '10px sans-serif',
        fillColor: Cesium.Color.CYAN,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
      },
    });
    waypointEntities.push(entity);

    // Draw line from previous waypoint
    drawRoute();
    updateStats();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(() => {
    handler.destroy();
    viewer.canvas.style.cursor = '';
    const stats = document.getElementById('drone-stats');
    if (stats && waypoints.length > 0) {
      stats.textContent = `${waypoints.length} waypoints placed. Ready to simulate.`;
    }
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

function drawRoute() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (routeEntity) viewer.entities.remove(routeEntity);
  if (waypoints.length < 2) return;

  routeEntity = viewer.entities.add({
    polyline: {
      positions: waypoints.map(w => w.position),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.CYAN.withAlpha(0.8),
        dashLength: 8,
      }),
    },
  });
}

function updateStats() {
  if (waypoints.length < 2) return;

  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += Cesium.Cartesian3.distance(waypoints[i - 1].position, waypoints[i].position);
  }

  const speed = parseFloat(document.getElementById('drone-speed')?.value || '8');
  const flightTime = totalDist / speed;
  const interval = parseInt(document.getElementById('drone-interval')?.value || '5');
  const photos = interval > 0 ? Math.floor(flightTime / interval) : 0;

  const stats = document.getElementById('drone-stats');
  if (stats) {
    stats.innerHTML = `📏 Distance: ${totalDist.toFixed(0)}m | ⏱ Time: ${formatTime(flightTime)} | 📸 Photos: ${photos}`;
  }

  // Update WP list
  const wpList = document.getElementById('drone-wp-list');
  if (wpList) {
    wpList.innerHTML = waypoints.map((w, i) =>
      `WP${i + 1}: ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}, ${w.alt}m`
    ).join('<br>');
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function simulateFlight() {
  const viewer = getCesiumViewer();
  if (!viewer || waypoints.length < 2) return;

  if (simulationRunning) return;
  simulationRunning = true;

  const speed = parseFloat(document.getElementById('drone-speed')?.value || '8');
  let currentSegment = 0;
  let t = 0;

  if (droneEntity) viewer.entities.remove(droneEntity);

  droneEntity = viewer.entities.add({
    position: waypoints[0].position,
    point: { pixelSize: 14, color: Cesium.Color.LIME },
    label: {
      text: '🛸',
      font: '20px sans-serif',
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
    },
  });

  const interval = setInterval(() => {
    if (currentSegment >= waypoints.length - 1) {
      clearInterval(interval);
      simulationRunning = false;
      viewer.entities.remove(droneEntity);
      droneEntity = null;
      return;
    }

    const from = waypoints[currentSegment].position;
    const to = waypoints[currentSegment + 1].position;
    const segDist = Cesium.Cartesian3.distance(from, to);
    const segTime = segDist / speed;

    t += 0.05 / segTime;

    if (t >= 1) {
      t = 0;
      currentSegment++;
    } else {
      const pos = Cesium.Cartesian3.lerp(from, to, t, new Cesium.Cartesian3());
      droneEntity.position = pos;
    }
  }, 50);
}

function exportKML() {
  if (waypoints.length === 0) return;

  const alt = waypoints[0].alt;
  const coords = waypoints.map(w => `${w.lon},${w.lat},${w.alt}`).join('\n            ');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Flight Plan</name>
    <description>Generated by ViewTopia</description>
    <Style id="flightPath">
      <LineStyle><color>ffff00ff</color><width>2</width></LineStyle>
    </Style>
    <Placemark>
      <name>Flight Path</name>
      <styleUrl>#flightPath</styleUrl>
      <LineString>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
            ${coords}
        </coordinates>
      </LineString>
    </Placemark>
    ${waypoints.map((w, i) => `
    <Placemark>
      <name>WP${i + 1}</name>
      <Point>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${w.lon},${w.lat},${w.alt}</coordinates>
      </Point>
    </Placemark>`).join('')}
  </Document>
</kml>`;

  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drone-flight-plan.kml';
  a.click();
  URL.revokeObjectURL(url);
}

function clearDrone() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  for (const e of waypointEntities) viewer.entities.remove(e);
  waypointEntities = [];
  waypoints = [];
  if (routeEntity) { viewer.entities.remove(routeEntity); routeEntity = null; }
  if (droneEntity) { viewer.entities.remove(droneEntity); droneEntity = null; }
  simulationRunning = false;
}
