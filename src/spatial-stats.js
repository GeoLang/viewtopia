/**
 * Spatial stats dashboard — summary statistics for loaded datasets.
 * Shows feature counts, bounding box, attribute histograms, spatial density.
 */
import { getCesiumViewer } from './renderers.js';

let panel;

export function initSpatialStats() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'spatial-stats-btn';
  btn.title = 'Spatial statistics';
  btn.textContent = '📊 Stats';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'spatial-stats-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="ss-header">
      <span>📊 Spatial Statistics</span>
      <button id="ss-close">×</button>
    </div>
    <div class="ss-body">
      <div id="ss-summary"></div>
      <canvas id="ss-density-canvas" width="300" height="200"></canvas>
      <div id="ss-attrs"></div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') computeStats();
  });
  document.getElementById('ss-close').addEventListener('click', () => panel.style.display = 'none');
}

function computeStats() {
  const viewer = getCesiumViewer();
  const summary = document.getElementById('ss-summary');
  const canvas = document.getElementById('ss-density-canvas');

  if (!viewer) {
    summary.innerHTML = '<div class="ss-empty">No viewer available</div>';
    return;
  }

  // Count entities and data sources
  const entityCount = viewer.entities.values.length;
  const dsCount = viewer.dataSources.length;
  const primitiveCount = viewer.scene.primitives.length;

  // Collect entity positions
  const positions = [];
  for (const entity of viewer.entities.values) {
    if (entity.position) {
      try {
        const cart = entity.position.getValue?.(viewer.clock.currentTime);
        if (cart) {
          const carto = Cesium.Cartographic.fromCartesian(cart);
          positions.push({
            lon: Cesium.Math.toDegrees(carto.longitude),
            lat: Cesium.Math.toDegrees(carto.latitude),
            height: carto.height,
          });
        }
      } catch {}
    }
  }

  // Bounding box
  let bbox = null;
  if (positions.length > 0) {
    bbox = {
      minLon: Math.min(...positions.map(p => p.lon)),
      maxLon: Math.max(...positions.map(p => p.lon)),
      minLat: Math.min(...positions.map(p => p.lat)),
      maxLat: Math.max(...positions.map(p => p.lat)),
    };
  }

  summary.innerHTML = `
    <div class="ss-row"><span>Entities:</span><strong>${entityCount}</strong></div>
    <div class="ss-row"><span>Data Sources:</span><strong>${dsCount}</strong></div>
    <div class="ss-row"><span>Primitives:</span><strong>${primitiveCount}</strong></div>
    <div class="ss-row"><span>Positioned:</span><strong>${positions.length}</strong></div>
    ${bbox ? `
      <div class="ss-row"><span>Bounding Box:</span></div>
      <div class="ss-bbox">
        ${bbox.minLat.toFixed(4)}° – ${bbox.maxLat.toFixed(4)}° N<br>
        ${bbox.minLon.toFixed(4)}° – ${bbox.maxLon.toFixed(4)}° E
      </div>
    ` : ''}
  `;

  // Draw density heatmap on canvas
  if (positions.length > 0 && bbox) {
    drawDensityMap(canvas, positions, bbox);
  }

  // Collect properties
  const attrs = document.getElementById('ss-attrs');
  const propCounts = {};
  for (const entity of viewer.entities.values) {
    if (entity.properties) {
      const names = entity.properties.propertyNames;
      for (const name of names) {
        propCounts[name] = (propCounts[name] || 0) + 1;
      }
    }
  }

  if (Object.keys(propCounts).length > 0) {
    attrs.innerHTML = '<div class="ss-section-title">Properties</div>' +
      Object.entries(propCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([k, v]) => `<div class="ss-row"><span>${k}:</span><strong>${v}</strong></div>`)
        .join('');
  }
}

function drawDensityMap(canvas, positions, bbox) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gridX = 30;
  const gridY = 20;
  const cells = Array.from({ length: gridX * gridY }, () => 0);
  const cellW = canvas.width / gridX;
  const cellH = canvas.height / gridY;

  const lonRange = bbox.maxLon - bbox.minLon || 1;
  const latRange = bbox.maxLat - bbox.minLat || 1;

  for (const p of positions) {
    const xi = Math.min(Math.floor(((p.lon - bbox.minLon) / lonRange) * gridX), gridX - 1);
    const yi = Math.min(Math.floor(((bbox.maxLat - p.lat) / latRange) * gridY), gridY - 1);
    cells[yi * gridX + xi]++;
  }

  const maxCount = Math.max(...cells);
  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const count = cells[y * gridX + x];
      if (count === 0) continue;
      const intensity = count / maxCount;
      const r = Math.round(255 * intensity);
      const g = Math.round(100 * (1 - intensity));
      const b = Math.round(200 * (1 - intensity));
      ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + intensity * 0.7})`;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }

  // Border
  ctx.strokeStyle = '#3d4166';
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.fillText(`${positions.length} points`, 4, 12);
}
