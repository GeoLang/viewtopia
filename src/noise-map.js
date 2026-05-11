/**
 * Noise Map Overlay — traffic/aircraft noise contours visualization.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let noiseActive = false;
let noiseEntities = [];

export function initNoiseMap() {
  const btn = document.getElementById('noise-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    noiseActive = !noiseActive;
    btn.classList.toggle('active', noiseActive);

    if (noiseActive) {
      showNoisePanel();
    } else {
      clearNoise();
      document.getElementById('noise-panel')?.remove();
    }
  });
}

function showNoisePanel() {
  let panel = document.getElementById('noise-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'noise-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🔊 Noise Map</span><button class="panel-close" id="noise-close">✕</button></div>
    <div class="panel-body">
      <label>Noise source
        <select id="noise-source">
          <option value="traffic">🚗 Road traffic</option>
          <option value="rail">🚂 Railway</option>
          <option value="aircraft">✈ Aircraft</option>
          <option value="industry">🏭 Industrial</option>
          <option value="custom">📁 Custom GeoJSON</option>
        </select>
      </label>
      <label>Display mode
        <select id="noise-mode">
          <option value="contours">Contour lines</option>
          <option value="heatmap">Heatmap fill</option>
          <option value="iso">Isophone bands</option>
        </select>
      </label>
      <label>dB range
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="noise-min" value="40" min="0" max="120" step="5" style="width:50px;">
          <span>to</span>
          <input type="number" id="noise-max" value="80" min="0" max="120" step="5" style="width:50px;">
          <span>dB</span>
        </div>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="noise-generate">Generate</button>
        <button class="map-action-btn" id="noise-load-file">Load File</button>
        <button class="map-action-btn" id="noise-clear">Clear</button>
      </div>
      <input type="file" id="noise-file-input" accept=".geojson,.json" hidden>
      <div id="noise-legend" style="margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('noise-close').onclick = () => {
    panel.remove();
    noiseActive = false;
    document.getElementById('noise-btn')?.classList.remove('active');
    clearNoise();
  };

  document.getElementById('noise-generate').onclick = () => generateNoiseMap();
  document.getElementById('noise-clear').onclick = () => clearNoise();

  document.getElementById('noise-load-file').onclick = () => {
    document.getElementById('noise-file-input')?.click();
  };

  document.getElementById('noise-file-input').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadNoiseFile(file);
  };

  showLegend();
}

function showLegend() {
  const legend = document.getElementById('noise-legend');
  if (!legend) return;

  const bands = [
    { db: '40-45', color: '#2ecc71', label: 'Quiet' },
    { db: '45-50', color: '#27ae60', label: 'Low' },
    { db: '50-55', color: '#f1c40f', label: 'Moderate' },
    { db: '55-60', color: '#f39c12', label: 'Notable' },
    { db: '60-65', color: '#e67e22', label: 'Loud' },
    { db: '65-70', color: '#e74c3c', label: 'Very loud' },
    { db: '70-75', color: '#c0392b', label: 'Harmful' },
    { db: '75+', color: '#8e44ad', label: 'Dangerous' },
  ];

  legend.innerHTML = bands.map(b =>
    `<div style="display:flex;align-items:center;gap:4px;font-size:11px;">
      <span style="width:12px;height:12px;background:${b.color};border-radius:2px;display:inline-block;"></span>
      <span>${b.db} dB — ${b.label}</span>
    </div>`
  ).join('');
}

function generateNoiseMap() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearNoise();

  const mode = document.getElementById('noise-mode')?.value || 'contours';
  const minDb = parseInt(document.getElementById('noise-min')?.value || '40');
  const maxDb = parseInt(document.getElementById('noise-max')?.value || '80');

  // Get view center to generate simulated noise contours
  let rect = viewer.camera.computeViewRectangle();
  if (!rect) {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const span = 0.01;
    rect = new Cesium.Rectangle(
      carto.longitude - span, carto.latitude - span,
      carto.longitude + span, carto.latitude + span,
    );
  }

  const centerLon = Cesium.Math.toDegrees((rect.west + rect.east) / 2);
  const centerLat = Cesium.Math.toDegrees((rect.south + rect.north) / 2);
  const span = Cesium.Math.toDegrees(rect.east - rect.west) / 2;

  // Generate concentric noise contours (simulated)
  const bands = Math.floor((maxDb - minDb) / 5);
  for (let i = 0; i < bands; i++) {
    const db = maxDb - i * 5;
    const radius = span * (i + 1) / bands;
    const color = getNoiseColor(db);
    const alpha = mode === 'heatmap' ? 0.3 : 0.6;

    if (mode === 'contours' || mode === 'iso') {
      // Draw contour ring
      const positions = [];
      const segments = 36;
      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        // Elliptical with some noise for realism
        const r = radius * (1 + Math.sin(angle * 3) * 0.15);
        positions.push(centerLon + Math.cos(angle) * r, centerLat + Math.sin(angle) * r * 0.7);
      }

      if (mode === 'iso') {
        const entity = viewer.entities.add({
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
            material: Cesium.Color.fromCssColorString(color).withAlpha(alpha),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
            height: 1,
          },
        });
        noiseEntities.push(entity);
      } else {
        const entity = viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(positions),
            width: 2,
            material: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
            clampToGround: true,
          },
          label: {
            text: `${db} dB`,
            font: '11px sans-serif',
            fillColor: Cesium.Color.fromCssColorString(color),
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          },
        });
        noiseEntities.push(entity);
      }
    } else {
      // Heatmap fill
      const positions = [];
      const segments = 24;
      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const r = radius * (1 + Math.sin(angle * 3) * 0.1);
        positions.push(centerLon + Math.cos(angle) * r, centerLat + Math.sin(angle) * r * 0.7);
      }
      const entity = viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
          material: Cesium.Color.fromCssColorString(color).withAlpha(alpha),
          height: 0.5,
        },
      });
      noiseEntities.push(entity);
    }
  }
}

function getNoiseColor(db) {
  if (db >= 75) return '#8e44ad';
  if (db >= 70) return '#c0392b';
  if (db >= 65) return '#e74c3c';
  if (db >= 60) return '#e67e22';
  if (db >= 55) return '#f39c12';
  if (db >= 50) return '#f1c40f';
  if (db >= 45) return '#27ae60';
  return '#2ecc71';
}

async function loadNoiseFile(file) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  try {
    const text = await file.text();
    const geojson = JSON.parse(text);
    const dataSource = await Cesium.GeoJsonDataSource.load(geojson, {
      stroke: Cesium.Color.RED.withAlpha(0.7),
      fill: Cesium.Color.RED.withAlpha(0.3),
      strokeWidth: 2,
      clampToGround: true,
    });
    viewer.dataSources.add(dataSource);
    viewer.flyTo(dataSource);
  } catch (e) {
    alert(`Failed to load noise file: ${e.message}`);
  }
}

function clearNoise() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of noiseEntities) viewer.entities.remove(e);
  noiseEntities = [];
}
