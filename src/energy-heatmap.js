/**
 * Building Energy Heatmap — color buildings by energy rating.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let energyActive = false;
let energyEntities = [];

export function initEnergyHeatmap() {
  const btn = document.getElementById('energy-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    energyActive = !energyActive;
    btn.classList.toggle('active', energyActive);

    if (energyActive) {
      showEnergyPanel();
    } else {
      clearEnergy();
      document.getElementById('energy-panel')?.remove();
    }
  });
}

function showEnergyPanel() {
  let panel = document.getElementById('energy-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'energy-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🔋 Energy Heatmap</span><button class="panel-close" id="energy-close">✕</button></div>
    <div class="panel-body">
      <label>Data source
        <select id="energy-source">
          <option value="simulated">Simulated (demo)</option>
          <option value="file">Load CSV/GeoJSON</option>
          <option value="osm">OSM Energy Tags</option>
        </select>
      </label>
      <label>Metric
        <select id="energy-metric">
          <option value="rating">EPC Rating (A–G)</option>
          <option value="kwh">kWh/m²/year</option>
          <option value="co2">CO₂ kg/m²/year</option>
        </select>
      </label>
      <label>Opacity
        <input type="range" id="energy-opacity" min="20" max="100" value="70">
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="energy-apply">Apply to Buildings</button>
        <button class="map-action-btn" id="energy-load">Load File</button>
        <button class="map-action-btn" id="energy-clear">Clear</button>
      </div>
      <input type="file" id="energy-file-input" accept=".csv,.geojson,.json" hidden>
      <div id="energy-legend" style="margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('energy-close').onclick = () => {
    panel.remove();
    energyActive = false;
    document.getElementById('energy-btn')?.classList.remove('active');
    clearEnergy();
  };

  document.getElementById('energy-apply').onclick = () => applyEnergyHeatmap();
  document.getElementById('energy-clear').onclick = () => clearEnergy();

  document.getElementById('energy-load').onclick = () => {
    document.getElementById('energy-file-input')?.click();
  };

  document.getElementById('energy-file-input').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadEnergyFile(file);
  };

  showEnergyLegend();
}

function showEnergyLegend() {
  const legend = document.getElementById('energy-legend');
  if (!legend) return;

  const ratings = [
    { label: 'A (≤50)', color: '#1b7340' },
    { label: 'B (51–75)', color: '#2ca02c' },
    { label: 'C (76–100)', color: '#8bc34a' },
    { label: 'D (101–125)', color: '#ffeb3b' },
    { label: 'E (126–150)', color: '#ff9800' },
    { label: 'F (151–200)', color: '#f44336' },
    { label: 'G (200+)', color: '#9c27b0' },
  ];

  legend.innerHTML = `<div style="font-size:11px;font-weight:600;margin-bottom:4px;">EPC Rating (kWh/m²/yr)</div>` +
    ratings.map(r => `<div style="display:flex;align-items:center;gap:4px;font-size:11px;">
      <span style="width:14px;height:14px;background:${r.color};border-radius:2px;display:inline-block;"></span>
      <span>${r.label}</span>
    </div>`).join('');
}

function applyEnergyHeatmap() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearEnergy();

  const opacity = parseInt(document.getElementById('energy-opacity')?.value || '70') / 100;

  // Check if there are already buildings loaded (from OSM Buildings)
  const existingEntities = viewer.entities.values.filter(e => e.polygon);

  if (existingEntities.length > 0) {
    // Color existing building entities
    for (const entity of existingEntities) {
      const rating = simulateRating();
      const color = getRatingColor(rating).withAlpha(opacity);
      if (entity.polygon) {
        entity.polygon.material = color;
      }
    }
  } else {
    // Generate demo buildings with energy colors
    generateDemoEnergyBuildings(viewer, opacity);
  }
}

function generateDemoEnergyBuildings(viewer, opacity) {
  let rect = viewer.camera.computeViewRectangle();
  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const span = 0.003;
    rect = new Cesium.Rectangle(
      carto.longitude - span, carto.latitude - span,
      carto.longitude + span, carto.latitude + span,
    );
  }

  const west = Cesium.Math.toDegrees(rect.west);
  const south = Cesium.Math.toDegrees(rect.south);
  const east = Cesium.Math.toDegrees(rect.east);
  const north = Cesium.Math.toDegrees(rect.north);

  // Generate a grid of buildings
  const rows = 8, cols = 8;
  const stepX = (east - west) / cols;
  const stepY = (north - south) / rows;
  const size = Math.min(stepX, stepY) * 0.3;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cx = west + stepX * (j + 0.5);
      const cy = south + stepY * (i + 0.5);
      const rating = simulateRating();
      const color = getRatingColor(rating).withAlpha(opacity);
      const height = 8 + Math.random() * 20;

      const positions = [
        cx - size, cy - size,
        cx + size, cy - size,
        cx + size, cy + size,
        cx - size, cy + size,
      ];

      const entity = viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
          height: 0,
          extrudedHeight: height,
          material: color,
          outline: true,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.3),
        },
        properties: { energyRating: rating, kwhPerM2: ratingToKwh(rating) },
      });
      energyEntities.push(entity);
    }
  }
}

function simulateRating() {
  // Weighted random — most buildings are C-E
  const weights = [0.05, 0.1, 0.25, 0.25, 0.2, 0.1, 0.05];
  const ratings = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r <= cum) return ratings[i];
  }
  return 'D';
}

function getRatingColor(rating) {
  const colors = {
    A: '#1b7340', B: '#2ca02c', C: '#8bc34a',
    D: '#ffeb3b', E: '#ff9800', F: '#f44336', G: '#9c27b0',
  };
  return Cesium.Color.fromCssColorString(colors[rating] || '#888');
}

function ratingToKwh(rating) {
  const map = { A: 40, B: 65, C: 88, D: 112, E: 138, F: 175, G: 250 };
  return map[rating] || 100;
}

async function loadEnergyFile(file) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  try {
    const text = await file.text();
    if (file.name.endsWith('.csv')) {
      // Simple CSV: lat,lon,rating
      const lines = text.trim().split('\n');
      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('lat') || header.includes('rating');
      const startIdx = hasHeader ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 3) continue;
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        const rating = parts[2].trim().toUpperCase();
        if (isNaN(lat) || isNaN(lon)) continue;

        const color = getRatingColor(rating).withAlpha(0.7);
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 5),
          point: { pixelSize: 12, color },
          properties: { rating },
        });
        energyEntities.push(entity);
      }
    } else {
      const geojson = JSON.parse(text);
      const dataSource = await Cesium.GeoJsonDataSource.load(geojson);
      viewer.dataSources.add(dataSource);
      viewer.flyTo(dataSource);
    }
  } catch (e) {
    alert(`Failed to load energy file: ${e.message}`);
  }
}

function clearEnergy() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of energyEntities) viewer.entities.remove(e);
  energyEntities = [];
}
