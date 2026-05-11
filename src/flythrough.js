/**
 * Flythrough — cinematic camera path along terrain or custom waypoints.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let flythroughActive = false;
let pathPoints = [];
let pathEntities = [];
let isRecording = false;
let isPlaying = false;

export function initFlythrough() {
  const btn = document.getElementById('flythrough-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    flythroughActive = !flythroughActive;
    btn.classList.toggle('active', flythroughActive);
    if (flythroughActive) showFlythroughPanel();
    else { document.getElementById('flythrough-panel')?.remove(); clearFlythrough(); }
  });
}

function showFlythroughPanel() {
  let panel = document.getElementById('flythrough-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'flythrough-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🎬 Terrain Flythrough</span><button class="panel-close" id="flythrough-close">✕</button></div>
    <div class="panel-body">
      <label>Mode
        <select id="flythrough-mode">
          <option value="record">Record camera path</option>
          <option value="waypoints">Set waypoints</option>
          <option value="orbit">Orbit point</option>
          <option value="terrain">Follow terrain</option>
        </select>
      </label>
      <label>Speed
        <input type="range" id="flythrough-speed" min="1" max="20" value="5">
        <span id="flythrough-speed-val">5×</span>
      </label>
      <label>Camera height (m AGL)
        <input type="number" id="flythrough-height" value="100" min="10" max="5000" step="10" style="width:80px;">
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="flythrough-smooth" checked> Smooth interpolation (Catmull-Rom)
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="flythrough-loop"> Loop playback
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="map-action-btn" id="flythrough-record">⏺ Record</button>
        <button class="map-action-btn" id="flythrough-play">▶ Play</button>
        <button class="map-action-btn" id="flythrough-stop">⏹ Stop</button>
        <button class="map-action-btn" id="flythrough-export">⬇ Export</button>
        <button class="map-action-btn" id="flythrough-clear">Clear</button>
      </div>
      <div id="flythrough-status" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
      <div id="flythrough-points" style="font-size:10px;color:#666;max-height:80px;overflow-y:auto;margin-top:4px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('flythrough-close').onclick = () => {
    panel.remove();
    flythroughActive = false;
    document.getElementById('flythrough-btn')?.classList.remove('active');
    clearFlythrough();
  };

  document.getElementById('flythrough-speed').oninput = (e) => {
    document.getElementById('flythrough-speed-val').textContent = `${e.target.value}×`;
  };

  document.getElementById('flythrough-record').onclick = () => startRecord();
  document.getElementById('flythrough-play').onclick = () => playPath();
  document.getElementById('flythrough-stop').onclick = () => stopPlayback();
  document.getElementById('flythrough-export').onclick = () => exportPath();
  document.getElementById('flythrough-clear').onclick = () => clearFlythrough();
}

function startRecord() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const mode = document.getElementById('flythrough-mode')?.value;

  if (mode === 'record') {
    // Record camera position every 500ms while moving
    isRecording = true;
    setStatus('Recording... Move the camera. Click Stop when done.');

    const interval = setInterval(() => {
      if (!isRecording) { clearInterval(interval); return; }

      const carto = viewer.camera.positionCartographic;
      pathPoints.push({
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
        heading: Cesium.Math.toDegrees(viewer.camera.heading),
        pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
        time: Date.now(),
      });
      updatePointsList();
    }, 500);
  } else if (mode === 'waypoints') {
    // Click to add waypoints
    viewer.canvas.style.cursor = 'crosshair';
    setStatus('Click to add waypoints. Right-click to finish.');

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click) => {
      const ray = viewer.camera.getPickRay(click.position);
      const pos = viewer.scene.globe.pick(ray, viewer.scene);
      if (!pos) return;

      const carto = Cesium.Cartographic.fromCartesian(pos);
      const height = parseFloat(document.getElementById('flythrough-height')?.value || '100');
      pathPoints.push({
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height + height,
        heading: 0,
        pitch: -20,
        time: Date.now(),
      });

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          Cesium.Math.toDegrees(carto.longitude),
          Cesium.Math.toDegrees(carto.latitude),
          carto.height + height
        ),
        point: { pixelSize: 8, color: Cesium.Color.MAGENTA },
      });
      pathEntities.push(entity);
      drawPathLine();
      updatePointsList();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      handler.destroy();
      viewer.canvas.style.cursor = '';
      setStatus(`${pathPoints.length} waypoints set. Press Play.`);
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  } else if (mode === 'orbit') {
    setStatus('Click a point to orbit around.');
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click) => {
      handler.destroy();
      const ray = viewer.camera.getPickRay(click.position);
      const center = viewer.scene.globe.pick(ray, viewer.scene);
      if (center) generateOrbitPath(center);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  } else if (mode === 'terrain') {
    generateTerrainFollowPath();
  }
}

function generateOrbitPath(center) {
  const carto = Cesium.Cartographic.fromCartesian(center);
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);
  const height = parseFloat(document.getElementById('flythrough-height')?.value || '100');
  const radius = 0.002; // ~220m

  pathPoints = [];
  for (let i = 0; i <= 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    pathPoints.push({
      lon: centerLon + Math.cos(angle) * radius,
      lat: centerLat + Math.sin(angle) * radius,
      height: carto.height + height,
      heading: Cesium.Math.toDegrees(angle + Math.PI),
      pitch: -30,
      time: Date.now() + i * 500,
    });
  }

  drawPathLine();
  setStatus(`Orbit path: 72 points around target. Press Play.`);
}

function generateTerrainFollowPath() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const carto = viewer.camera.positionCartographic;
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);
  const height = parseFloat(document.getElementById('flythrough-height')?.value || '100');

  // Generate a path along a direction
  pathPoints = [];
  const steps = 50;
  const span = 0.01;

  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const lon = centerLon - span + t * span * 2;
    const lat = centerLat + Math.sin(t * Math.PI * 2) * span * 0.3;
    pathPoints.push({ lon, lat, height, heading: 90, pitch: -15, time: Date.now() + i * 1000 });
  }

  drawPathLine();
  setStatus(`Terrain follow: ${steps} points. Press Play.`);
}

function drawPathLine() {
  const viewer = getCesiumViewer();
  if (!viewer || pathPoints.length < 2) return;

  // Remove old path line
  pathEntities.forEach(e => { if (e._isPathLine) viewer.entities.remove(e); });

  const positions = pathPoints.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height));
  const entity = viewer.entities.add({
    polyline: {
      positions,
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.15, color: Cesium.Color.MAGENTA }),
    },
  });
  entity._isPathLine = true;
  pathEntities.push(entity);
}

let playTimeout = null;

function playPath() {
  if (pathPoints.length < 2) { setStatus('No path recorded. Record or set waypoints first.'); return; }

  const viewer = getCesiumViewer();
  if (!viewer) return;

  isPlaying = true;
  const speed = parseInt(document.getElementById('flythrough-speed')?.value || '5');
  const smooth = document.getElementById('flythrough-smooth')?.checked;
  const loop = document.getElementById('flythrough-loop')?.checked;
  let idx = 0;

  function flyNext() {
    if (!isPlaying || idx >= pathPoints.length) {
      if (loop && isPlaying) { idx = 0; flyNext(); }
      else { isPlaying = false; setStatus('Playback complete.'); }
      return;
    }

    const pt = pathPoints[idx];
    const duration = Math.max(0.3, 3 / speed);

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, pt.height),
      orientation: {
        heading: Cesium.Math.toRadians(pt.heading || 0),
        pitch: Cesium.Math.toRadians(pt.pitch || -15),
        roll: 0,
      },
      duration,
      easingFunction: smooth ? Cesium.EasingFunction.LINEAR_NONE : undefined,
      complete: () => {
        idx++;
        setStatus(`Playing: ${idx}/${pathPoints.length}`);
        playTimeout = setTimeout(flyNext, 50);
      },
    });
  }

  setStatus('Playing flythrough...');
  flyNext();
}

function stopPlayback() {
  isPlaying = false;
  isRecording = false;
  if (playTimeout) { clearTimeout(playTimeout); playTimeout = null; }
  setStatus('Stopped.');
}

function exportPath() {
  if (pathPoints.length === 0) return;

  const data = {
    type: 'ViewTopia Flythrough',
    version: 1,
    points: pathPoints,
    settings: {
      speed: document.getElementById('flythrough-speed')?.value,
      height: document.getElementById('flythrough-height')?.value,
      smooth: document.getElementById('flythrough-smooth')?.checked,
      loop: document.getElementById('flythrough-loop')?.checked,
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'viewtopia-flythrough.json';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported flythrough path.');
}

function updatePointsList() {
  const el = document.getElementById('flythrough-points');
  if (el) el.textContent = `${pathPoints.length} points recorded`;
}

function setStatus(msg) {
  const el = document.getElementById('flythrough-status');
  if (el) el.textContent = msg;
}

function clearFlythrough() {
  stopPlayback();
  const viewer = getCesiumViewer();
  if (viewer) {
    for (const e of pathEntities) viewer.entities.remove(e);
  }
  pathEntities = [];
  pathPoints = [];
  updatePointsList();
}
