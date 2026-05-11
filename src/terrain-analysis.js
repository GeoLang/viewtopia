/**
 * Terrain analysis — slope map, aspect, and contour lines from Cesium terrain.
 */
import { getCesiumViewer } from './renderers.js';

let panel;

export function initTerrainAnalysis() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'terrain-analysis-btn';
  btn.title = 'Terrain analysis';
  btn.textContent = '⛰ Terrain';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'terrain-analysis-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="ta-header">
      <span>⛰ Terrain Analysis</span>
      <button id="ta-close">×</button>
    </div>
    <div class="ta-body">
      <button id="ta-slope" class="map-action-btn">Slope Map</button>
      <button id="ta-aspect" class="map-action-btn">Aspect Map</button>
      <button id="ta-contour" class="map-action-btn">Contour Lines</button>
      <button id="ta-clear" class="map-action-btn danger">Clear</button>
      <div id="ta-legend" class="ta-legend"></div>
      <div id="ta-status" class="ta-status"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('ta-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('ta-slope').addEventListener('click', generateSlopeMap);
  document.getElementById('ta-aspect').addEventListener('click', generateAspectMap);
  document.getElementById('ta-contour').addEventListener('click', generateContours);
  document.getElementById('ta-clear').addEventListener('click', clearAnalysis);
}

let analysisEntities = [];

function clearAnalysis() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of analysisEntities) viewer.entities.remove(e);
  analysisEntities = [];
  document.getElementById('ta-legend').innerHTML = '';
  document.getElementById('ta-status').textContent = '';
}

async function sampleGrid() {
  const viewer = getCesiumViewer();
  if (!viewer) return null;

  const camera = viewer.camera;
  const carto = Cesium.Cartographic.fromCartesian(camera.position);
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);

  // Sample a grid around camera position
  const span = 0.01; // ~1km
  const gridSize = 20;
  const positions = [];

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lon = centerLon - span + (2 * span * i) / gridSize;
      const lat = centerLat - span + (2 * span * j) / gridSize;
      positions.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }
  }

  const status = document.getElementById('ta-status');
  status.textContent = 'Sampling terrain…';

  try {
    const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions);
    status.textContent = `Sampled ${sampled.length} points`;
    return { positions: sampled, gridSize, centerLon, centerLat, span };
  } catch {
    // Fallback: use globe picking
    status.textContent = 'Using globe surface (no terrain provider)';
    for (const p of positions) p.height = 0;
    return { positions, gridSize, centerLon, centerLat, span };
  }
}

async function generateSlopeMap() {
  const data = await sampleGrid();
  if (!data) return;
  const viewer = getCesiumViewer();
  clearAnalysis();

  const { positions, gridSize } = data;
  const cellSize = (2 * data.span * 111320) / gridSize; // approx meters

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const idx = i * (gridSize + 1) + j;
      const h = positions[idx].height || 0;
      const hRight = (positions[idx + 1]?.height || h);
      const hUp = (positions[idx + gridSize + 1]?.height || h);

      const dx = (hRight - h) / cellSize;
      const dy = (hUp - h) / cellSize;
      const slope = Math.atan(Math.sqrt(dx * dx + dy * dy)) * (180 / Math.PI);

      const color = slopeColor(slope);
      const lon = Cesium.Math.toDegrees(positions[idx].longitude);
      const lat = Cesium.Math.toDegrees(positions[idx].latitude);

      analysisEntities.push(viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            lon, lat,
            lon + (2 * data.span) / gridSize,
            lat + (2 * data.span) / gridSize
          ),
          material: color,
          height: 0,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      }));
    }
  }

  document.getElementById('ta-legend').innerHTML = `
    <div class="ta-legend-title">Slope (degrees)</div>
    <div class="ta-legend-bar">
      <span style="color:#22c55e">0°</span>
      <span style="color:#eab308">15°</span>
      <span style="color:#f97316">30°</span>
      <span style="color:#ef4444">45°+</span>
    </div>
  `;
}

function slopeColor(deg) {
  if (deg < 5) return Cesium.Color.GREEN.withAlpha(0.4);
  if (deg < 15) return Cesium.Color.YELLOW.withAlpha(0.5);
  if (deg < 30) return Cesium.Color.ORANGE.withAlpha(0.5);
  return Cesium.Color.RED.withAlpha(0.6);
}

async function generateAspectMap() {
  const data = await sampleGrid();
  if (!data) return;
  const viewer = getCesiumViewer();
  clearAnalysis();

  const { positions, gridSize } = data;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const idx = i * (gridSize + 1) + j;
      const h = positions[idx].height || 0;
      const hRight = (positions[idx + 1]?.height || h);
      const hUp = (positions[idx + gridSize + 1]?.height || h);

      const dx = hRight - h;
      const dy = hUp - h;
      let aspect = Math.atan2(dy, dx) * (180 / Math.PI);
      if (aspect < 0) aspect += 360;

      const color = aspectColor(aspect);
      const lon = Cesium.Math.toDegrees(positions[idx].longitude);
      const lat = Cesium.Math.toDegrees(positions[idx].latitude);

      analysisEntities.push(viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            lon, lat,
            lon + (2 * data.span) / gridSize,
            lat + (2 * data.span) / gridSize
          ),
          material: color,
          height: 0,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      }));
    }
  }

  document.getElementById('ta-legend').innerHTML = `
    <div class="ta-legend-title">Aspect</div>
    <div class="ta-legend-bar">
      <span style="color:#ef4444">N</span>
      <span style="color:#22c55e">E</span>
      <span style="color:#3b82f6">S</span>
      <span style="color:#eab308">W</span>
    </div>
  `;
}

function aspectColor(deg) {
  if (deg < 45 || deg >= 315) return Cesium.Color.RED.withAlpha(0.4); // North
  if (deg < 135) return Cesium.Color.GREEN.withAlpha(0.4); // East
  if (deg < 225) return Cesium.Color.BLUE.withAlpha(0.4); // South
  return Cesium.Color.YELLOW.withAlpha(0.4); // West
}

async function generateContours() {
  const data = await sampleGrid();
  if (!data) return;
  const viewer = getCesiumViewer();
  clearAnalysis();

  const { positions, gridSize } = data;

  // Compute height range
  const heights = positions.map(p => p.height || 0).filter(h => !isNaN(h));
  const hMin = Math.min(...heights);
  const hMax = Math.max(...heights);
  const interval = Math.max(10, Math.round((hMax - hMin) / 10)); // ~10 contour lines

  const status = document.getElementById('ta-status');
  status.textContent = `Contours every ${interval}m (${hMin.toFixed(0)}m – ${hMax.toFixed(0)}m)`;

  // Simple marching squares for contour lines
  for (let level = Math.ceil(hMin / interval) * interval; level <= hMax; level += interval) {
    const segments = [];

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const bl = positions[i * (gridSize + 1) + j];
        const br = positions[i * (gridSize + 1) + j + 1];
        const tl = positions[(i + 1) * (gridSize + 1) + j];
        const tr = positions[(i + 1) * (gridSize + 1) + j + 1];
        if (!bl || !br || !tl || !tr) continue;

        const edges = marchCell(bl, br, tl, tr, level);
        segments.push(...edges);
      }
    }

    // Draw contour line segments
    for (const seg of segments) {
      analysisEntities.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            Cesium.Math.toDegrees(seg[0].longitude), Cesium.Math.toDegrees(seg[0].latitude), level,
            Cesium.Math.toDegrees(seg[1].longitude), Cesium.Math.toDegrees(seg[1].latitude), level,
          ]),
          width: 1.5,
          material: Cesium.Color.WHITE.withAlpha(0.7),
          clampToGround: true,
        },
      }));
    }

    // Label
    if (segments.length > 0) {
      const mid = segments[Math.floor(segments.length / 2)][0];
      analysisEntities.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromRadians(mid.longitude, mid.latitude, level + 2),
        label: {
          text: `${level}m`,
          font: '10px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }));
    }
  }
}

function marchCell(bl, br, tl, tr, level) {
  const segments = [];
  const h = [bl.height || 0, br.height || 0, tr.height || 0, tl.height || 0];
  const above = h.map(v => v >= level);

  // Classify cell (4-bit)
  const config = (above[0] ? 1 : 0) | (above[1] ? 2 : 0) | (above[2] ? 4 : 0) | (above[3] ? 8 : 0);
  if (config === 0 || config === 15) return segments; // all same side

  const corners = [bl, br, tr, tl];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
  ];

  const crossings = [];
  for (const [a, b] of edges) {
    if (above[a] !== above[b]) {
      const t = (level - h[a]) / (h[b] - h[a]);
      crossings.push(new Cesium.Cartographic(
        corners[a].longitude + t * (corners[b].longitude - corners[a].longitude),
        corners[a].latitude + t * (corners[b].latitude - corners[a].latitude),
        level
      ));
    }
  }

  // Connect crossings pairwise
  for (let i = 0; i < crossings.length - 1; i += 2) {
    segments.push([crossings[i], crossings[i + 1]]);
  }

  return segments;
}
