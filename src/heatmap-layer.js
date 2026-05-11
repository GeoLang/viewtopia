/**
 * Heatmap Layer — generic heatmap from CSV/GeoJSON point data with density kernel.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let heatmapActive = false;
let heatmapEntity = null;

export function initHeatmapLayer() {
  const btn = document.getElementById('heatmap-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    heatmapActive = !heatmapActive;
    btn.classList.toggle('active', heatmapActive);
    if (heatmapActive) showHeatmapPanel();
    else { document.getElementById('heatmap-panel')?.remove(); clearHeatmap(); }
  });
}

function showHeatmapPanel() {
  let panel = document.getElementById('heatmap-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'heatmap-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🔥 Heatmap Layer</span><button class="panel-close" id="heatmap-close">✕</button></div>
    <div class="panel-body">
      <label>Data source
        <select id="heatmap-source">
          <option value="demo">Demo (random points)</option>
          <option value="csv">Load CSV (lon,lat,value)</option>
          <option value="geojson">Load GeoJSON points</option>
        </select>
      </label>
      <label>Radius (px)
        <input type="range" id="heatmap-radius" min="5" max="80" value="30">
        <span id="heatmap-radius-val">30</span>
      </label>
      <label>Intensity
        <input type="range" id="heatmap-intensity" min="1" max="20" value="10">
        <span id="heatmap-intensity-val">10</span>
      </label>
      <label>Color scheme
        <select id="heatmap-colors">
          <option value="fire">Fire (red-yellow)</option>
          <option value="cool">Cool (blue-green)</option>
          <option value="viridis">Viridis</option>
          <option value="plasma">Plasma</option>
          <option value="grayscale">Grayscale</option>
        </select>
      </label>
      <label>Opacity
        <input type="range" id="heatmap-opacity" min="20" max="100" value="70">
        <span id="heatmap-opacity-val">70%</span>
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="heatmap-generate">Generate</button>
        <button class="map-action-btn" id="heatmap-clear">Clear</button>
      </div>
      <input type="file" id="heatmap-file" accept=".csv,.geojson,.json" hidden>
      <div id="heatmap-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('heatmap-close').onclick = () => {
    panel.remove();
    heatmapActive = false;
    document.getElementById('heatmap-btn')?.classList.remove('active');
    clearHeatmap();
  };

  document.getElementById('heatmap-radius').oninput = (e) => {
    document.getElementById('heatmap-radius-val').textContent = e.target.value;
  };
  document.getElementById('heatmap-intensity').oninput = (e) => {
    document.getElementById('heatmap-intensity-val').textContent = e.target.value;
  };
  document.getElementById('heatmap-opacity').oninput = (e) => {
    document.getElementById('heatmap-opacity-val').textContent = `${e.target.value}%`;
  };

  document.getElementById('heatmap-generate').onclick = () => generateHeatmap();
  document.getElementById('heatmap-clear').onclick = () => clearHeatmap();
  document.getElementById('heatmap-file').onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadHeatmapFile(file);
  };
}

function generateHeatmap() {
  const source = document.getElementById('heatmap-source')?.value;

  if (source === 'csv' || source === 'geojson') {
    document.getElementById('heatmap-file')?.click();
    return;
  }

  // Generate demo points around camera
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const carto = viewer.camera.positionCartographic;
  const centerLon = Cesium.Math.toDegrees(carto.longitude);
  const centerLat = Cesium.Math.toDegrees(carto.latitude);

  const points = [];
  const numPoints = 200;
  const spread = 0.005;

  // Create clustered random points
  const clusters = 5;
  for (let c = 0; c < clusters; c++) {
    const cx = centerLon + (Math.random() - 0.5) * spread * 2;
    const cy = centerLat + (Math.random() - 0.5) * spread * 2;
    const clusterSize = Math.floor(numPoints / clusters);

    for (let i = 0; i < clusterSize; i++) {
      points.push({
        lon: cx + (Math.random() - 0.5) * spread * 0.5,
        lat: cy + (Math.random() - 0.5) * spread * 0.5,
        value: Math.random(),
      });
    }
  }

  renderHeatmap(points);
}

async function loadHeatmapFile(file) {
  try {
    const text = await file.text();
    let points = [];

    if (file.name.endsWith('.csv')) {
      const lines = text.trim().split('\n');
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          points.push({
            lon: parseFloat(parts[0]),
            lat: parseFloat(parts[1]),
            value: parts.length > 2 ? parseFloat(parts[2]) : 1,
          });
        }
      }
    } else {
      const geojson = JSON.parse(text);
      const features = geojson.features || [];
      for (const f of features) {
        if (f.geometry?.type === 'Point') {
          points.push({
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
            value: f.properties?.value ?? f.properties?.weight ?? 1,
          });
        }
      }
    }

    if (points.length > 0) {
      renderHeatmap(points);
    } else {
      setInfo('No valid points found in file');
    }
  } catch (e) {
    setInfo(`Error: ${e.message}`);
  }
}

function renderHeatmap(points) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  clearHeatmap();

  const radius = parseInt(document.getElementById('heatmap-radius')?.value || '30');
  const intensity = parseInt(document.getElementById('heatmap-intensity')?.value || '10');
  const opacity = parseInt(document.getElementById('heatmap-opacity')?.value || '70') / 100;
  const colorScheme = document.getElementById('heatmap-colors')?.value || 'fire';

  // Generate heatmap as a canvas texture
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Determine bounds
  const lons = points.map(p => p.lon);
  const lats = points.map(p => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLon = maxLon - minLon || 0.01;
  const spanLat = maxLat - minLat || 0.01;

  // Draw density with radial gradients
  for (const pt of points) {
    const x = ((pt.lon - minLon) / spanLon) * size;
    const y = size - ((pt.lat - minLat) / spanLat) * size;
    const r = radius * (pt.value || 1);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(255,255,255,${0.05 * intensity})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Colorize
  const imageData = ctx.getImageData(0, 0, size, size);
  const palette = getColorPalette(colorScheme);
  colorize(imageData, palette, opacity);
  ctx.putImageData(imageData, 0, 0);

  // Apply as ground overlay
  const padding = 0.001;
  const rect = Cesium.Rectangle.fromDegrees(
    minLon - padding, minLat - padding,
    maxLon + padding, maxLat + padding
  );

  heatmapEntity = viewer.entities.add({
    rectangle: {
      coordinates: rect,
      material: new Cesium.ImageMaterialProperty({
        image: canvas,
        transparent: true,
      }),
      height: 0,
    },
  });

  setInfo(`Rendered ${points.length} points, ${colorScheme} palette`);
  viewer.flyTo(heatmapEntity);
}

function colorize(imageData, palette, opacity) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]; // Use alpha as intensity
    if (alpha === 0) continue;

    const idx = Math.min(255, alpha);
    const color = palette[idx];
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = Math.floor(alpha * opacity);
  }
}

function getColorPalette(scheme) {
  const palette = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    switch (scheme) {
      case 'fire':
        palette[i] = [Math.floor(255 * Math.min(1, t * 2)), Math.floor(255 * Math.max(0, t * 2 - 1)), 0];
        break;
      case 'cool':
        palette[i] = [0, Math.floor(255 * t), Math.floor(255 * (1 - t))];
        break;
      case 'viridis':
        palette[i] = [Math.floor(68 + t * 185), Math.floor(1 + t * 210), Math.floor(84 + t * 80)];
        break;
      case 'plasma':
        palette[i] = [Math.floor(13 + t * 240), Math.floor(8 + t * 90 * (1 - t)), Math.floor(135 - t * 135)];
        break;
      case 'grayscale':
        palette[i] = [Math.floor(t * 255), Math.floor(t * 255), Math.floor(t * 255)];
        break;
      default:
        palette[i] = [Math.floor(t * 255), 0, Math.floor((1 - t) * 255)];
    }
  }
  return palette;
}

function setInfo(msg) {
  const el = document.getElementById('heatmap-info');
  if (el) el.textContent = msg;
}

function clearHeatmap() {
  const viewer = getCesiumViewer();
  if (viewer && heatmapEntity) {
    viewer.entities.remove(heatmapEntity);
    heatmapEntity = null;
  }
}
