/**
 * Indoor Navigation — floor plan viewer with pathfinding.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let indoorActive = false;
let floorEntities = [];

export function initIndoorNav() {
  const btn = document.getElementById('indoor-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    indoorActive = !indoorActive;
    btn.classList.toggle('active', indoorActive);

    if (indoorActive) {
      showIndoorPanel();
    } else {
      clearIndoor();
      document.getElementById('indoor-panel')?.remove();
    }
  });
}

function showIndoorPanel() {
  let panel = document.getElementById('indoor-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'indoor-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🏛 Indoor Navigation</span><button class="panel-close" id="indoor-close">✕</button></div>
    <div class="panel-body">
      <label>Floor plan source
        <select id="indoor-source">
          <option value="demo">Demo floor plan</option>
          <option value="geojson">Load GeoJSON</option>
          <option value="osm">OSM Indoor (Simple Indoor Tagging)</option>
        </select>
      </label>
      <label>Floor level
        <select id="indoor-floor">
          <option value="0">Ground floor (0)</option>
          <option value="1">Floor 1</option>
          <option value="2">Floor 2</option>
          <option value="-1">Basement (-1)</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="indoor-load">Load Floor Plan</button>
        <button class="map-action-btn" id="indoor-route">Find Route</button>
        <button class="map-action-btn" id="indoor-clear">Clear</button>
      </div>
      <input type="file" id="indoor-file" accept=".geojson,.json" hidden>
      <div id="indoor-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
      <canvas id="indoor-minimap" width="300" height="200" style="margin-top:8px;border:1px solid #333;border-radius:4px;background:#1a1a2e;display:none;"></canvas>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('indoor-close').onclick = () => {
    panel.remove();
    indoorActive = false;
    document.getElementById('indoor-btn')?.classList.remove('active');
    clearIndoor();
  };

  document.getElementById('indoor-load').onclick = () => {
    const source = document.getElementById('indoor-source')?.value;
    if (source === 'geojson') {
      document.getElementById('indoor-file')?.click();
    } else if (source === 'demo') {
      loadDemoFloorPlan();
    } else {
      loadOsmIndoor();
    }
  };

  document.getElementById('indoor-file').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadGeoJSONFloor(file);
  };

  document.getElementById('indoor-route').onclick = () => startRoutePick();
  document.getElementById('indoor-clear').onclick = () => clearIndoor();
}

function loadDemoFloorPlan() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearIndoor();

  const carto = viewer.camera.positionCartographic;
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);
  const floor = parseInt(document.getElementById('indoor-floor')?.value || '0');
  const baseHeight = floor * 3.5;

  // Generate a demo building with rooms
  const rooms = [
    { name: 'Lobby', dx: 0, dy: 0, w: 0.0003, h: 0.0002, color: '#4a9eff' },
    { name: 'Office A', dx: 0.0003, dy: 0, w: 0.0002, h: 0.0002, color: '#ff9f43' },
    { name: 'Office B', dx: 0.0003, dy: 0.0002, w: 0.0002, h: 0.0002, color: '#ff6b6b' },
    { name: 'Meeting Room', dx: 0, dy: 0.0002, w: 0.0003, h: 0.00015, color: '#5ed5a8' },
    { name: 'Corridor', dx: 0.00012, dy: 0.00008, w: 0.00006, h: 0.0003, color: '#ddd' },
    { name: 'Restroom', dx: -0.0002, dy: 0, w: 0.0002, h: 0.00015, color: '#b8e0ff' },
    { name: 'Kitchen', dx: -0.0002, dy: 0.00015, w: 0.0002, h: 0.0002, color: '#ffd93d' },
    { name: 'Server Room', dx: 0.0005, dy: 0.0001, w: 0.00015, h: 0.00015, color: '#c56cf0' },
  ];

  for (const room of rooms) {
    const lon = centerLon + room.dx;
    const lat = centerLat + room.dy;
    const positions = [
      lon, lat,
      lon + room.w, lat,
      lon + room.w, lat + room.h,
      lon, lat + room.h,
    ];

    const entity = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
        height: baseHeight,
        extrudedHeight: baseHeight + 3,
        material: Cesium.Color.fromCssColorString(room.color).withAlpha(0.6),
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
      },
      label: {
        text: room.name,
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.NONE,
      },
      position: Cesium.Cartesian3.fromDegrees(lon + room.w / 2, lat + room.h / 2, baseHeight + 3.5),
      properties: { type: 'room', name: room.name, floor },
    });
    floorEntities.push(entity);
  }

  // Draw minimap
  drawMinimap(rooms);

  const info = document.getElementById('indoor-info');
  if (info) info.textContent = `Floor ${floor}: ${rooms.length} rooms loaded (demo)`;

  viewer.flyTo(viewer.entities, { offset: new Cesium.HeadingPitchRange(0, -0.5, 200) });
}

function drawMinimap(rooms) {
  const canvas = document.getElementById('indoor-minimap');
  if (!canvas) return;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 800000;
  const offsetX = 100, offsetY = 50;

  for (const room of rooms) {
    const x = offsetX + room.dx * scale;
    const y = offsetY + room.dy * scale;
    const w = room.w * scale;
    const h = room.h * scale;

    ctx.fillStyle = room.color + '80';
    ctx.strokeStyle = room.color;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.fillText(room.name, x + 2, y + 10);
  }
}

async function loadOsmIndoor() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const carto = viewer.camera.positionCartographic;
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const span = 0.002;

  const bbox = `${lat - span},${lon - span},${lat + span},${lon + span}`;
  const query = `[out:json][timeout:15];(way["indoor"](${bbox});relation["indoor"](${bbox}););out body;>;out skel qt;`;

  const info = document.getElementById('indoor-info');
  if (info) info.textContent = 'Loading OSM indoor data...';

  try {
    const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) { if (info) info.textContent = 'Overpass request failed'; return; }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) { if (info) info.textContent = 'Server busy, try again'; return; }

    const data = await res.json();
    const ways = data.elements.filter(e => e.type === 'way' && e.tags?.indoor);
    if (info) info.textContent = `Found ${ways.length} indoor elements`;
  } catch (e) {
    if (info) info.textContent = `Error: ${e.message}`;
  }
}

async function loadGeoJSONFloor(file) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  try {
    const text = await file.text();
    const geojson = JSON.parse(text);
    const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
      stroke: Cesium.Color.CYAN,
      fill: Cesium.Color.CYAN.withAlpha(0.3),
      strokeWidth: 2,
    });
    viewer.dataSources.add(dataSource);
    viewer.flyTo(dataSource);
    const info = document.getElementById('indoor-info');
    if (info) info.textContent = `Loaded: ${file.name}`;
  } catch (e) {
    alert(`Failed to load floor plan: ${e.message}`);
  }
}

let routePoints = [];

function startRoutePick() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  routePoints = [];
  viewer.canvas.style.cursor = 'crosshair';
  const info = document.getElementById('indoor-info');
  if (info) info.textContent = 'Click start point, then end point...';

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction((click) => {
    const ray = viewer.camera.getPickRay(click.position);
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;

    routePoints.push(pos);

    viewer.entities.add({
      position: pos,
      point: { pixelSize: 10, color: routePoints.length === 1 ? Cesium.Color.GREEN : Cesium.Color.RED },
    });

    if (routePoints.length === 2) {
      handler.destroy();
      viewer.canvas.style.cursor = '';
      drawRoute(viewer, routePoints[0], routePoints[1]);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function drawRoute(viewer, start, end) {
  // Simple straight-line route (real pathfinding would use A* on graph)
  const midpoint = Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());

  viewer.entities.add({
    polyline: {
      positions: [start, midpoint, end],
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.CYAN,
      }),
    },
  });

  const dist = Cesium.Cartesian3.distance(start, end);
  const info = document.getElementById('indoor-info');
  if (info) info.textContent = `Route: ${dist.toFixed(1)}m (straight line)`;
}

function clearIndoor() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of floorEntities) viewer.entities.remove(e);
  floorEntities = [];
  routePoints = [];
  const canvas = document.getElementById('indoor-minimap');
  if (canvas) canvas.style.display = 'none';
}
