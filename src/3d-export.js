/**
 * 3D Export — export visible terrain/entities as STL, OBJ, or glTF for 3D printing.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

export function init3DExport() {
  const btn = document.getElementById('export3d-btn');
  if (!btn) return;

  btn.addEventListener('click', () => showExportPanel());
}

function showExportPanel() {
  let panel = document.getElementById('export3d-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'export3d-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🖨 3D Export</span><button class="panel-close" id="export3d-close">✕</button></div>
    <div class="panel-body">
      <label>Format
        <select id="export3d-format">
          <option value="stl">STL (3D Printing)</option>
          <option value="obj">OBJ (Wavefront)</option>
          <option value="gltf">glTF (Web/AR)</option>
        </select>
      </label>
      <label>Region
        <select id="export3d-region">
          <option value="view">Current view extent</option>
          <option value="draw">Draw rectangle</option>
        </select>
      </label>
      <label>Terrain resolution
        <select id="export3d-res">
          <option value="64">Low (64×64)</option>
          <option value="128" selected>Medium (128×128)</option>
          <option value="256">High (256×256)</option>
        </select>
      </label>
      <label>Vertical exaggeration
        <input type="range" id="export3d-exag" min="1" max="10" value="2">
        <span id="export3d-exag-val">2×</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="export3d-base" checked> Add solid base
      </label>
      <label>Base thickness (mm)
        <input type="number" id="export3d-base-h" value="5" min="1" max="20" style="width:60px;">
      </label>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="map-action-btn" id="export3d-go">⬇ Export</button>
        <button class="map-action-btn" id="export3d-preview">👁 Preview</button>
      </div>
      <div id="export3d-status" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
      <canvas id="export3d-preview-canvas" width="300" height="200" style="margin-top:8px;border:1px solid #333;border-radius:4px;display:none;background:#0d1117;"></canvas>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('export3d-close').onclick = () => panel.remove();
  document.getElementById('export3d-exag').oninput = (e) => {
    document.getElementById('export3d-exag-val').textContent = `${e.target.value}×`;
  };
  document.getElementById('export3d-go').onclick = () => doExport();
  document.getElementById('export3d-preview').onclick = () => doPreview();
}

function getTerrainGrid(resolution, exaggeration) {
  const viewer = getCesiumViewer();
  if (!viewer) return null;

  const rect = viewer.camera.computeViewRectangle();
  if (!rect) return null;

  const res = parseInt(resolution);
  const grid = [];
  const west = Cesium.Math.toDegrees(rect.west);
  const south = Cesium.Math.toDegrees(rect.south);
  const east = Cesium.Math.toDegrees(rect.east);
  const north = Cesium.Math.toDegrees(rect.north);

  // Generate flat grid (real terrain sampling would use sampleTerrainMostDetailed)
  for (let y = 0; y < res; y++) {
    const row = [];
    for (let x = 0; x < res; x++) {
      const lon = west + (east - west) * x / (res - 1);
      const lat = south + (north - south) * y / (res - 1);
      // Simulated height: use a noise function for demo
      const h = simulateHeight(lon, lat) * exaggeration;
      row.push({ lon, lat, h });
    }
    grid.push(row);
  }

  return { grid, res, west, south, east, north };
}

function simulateHeight(lon, lat) {
  // Perlin-like noise approximation for demo
  const x = lon * 100;
  const y = lat * 100;
  return (Math.sin(x * 0.3) * Math.cos(y * 0.4) + Math.sin(x * 0.7 + y * 0.5)) * 50 + 100;
}

function doPreview() {
  const res = document.getElementById('export3d-res')?.value || '128';
  const exag = parseInt(document.getElementById('export3d-exag')?.value || '2');
  const terrain = getTerrainGrid(Math.min(parseInt(res), 64), exag); // Lower res for preview

  if (!terrain) {
    setStatus('No terrain data available');
    return;
  }

  const canvas = document.getElementById('export3d-preview-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Simple isometric preview
  const gridRes = terrain.res;
  const scaleX = canvas.width / gridRes;
  const scaleY = canvas.height / gridRes * 0.5;
  const heightScale = 0.3;

  for (let y = 0; y < gridRes - 1; y++) {
    for (let x = 0; x < gridRes - 1; x++) {
      const h = terrain.grid[y][x].h;
      const px = x * scaleX + (y * scaleX * 0.3);
      const py = canvas.height - (y * scaleY) - h * heightScale;

      // Color by height
      const norm = Math.min(1, Math.max(0, (h - 50) / 200));
      const r = Math.floor(50 + norm * 150);
      const g = Math.floor(150 - norm * 80);
      const b = Math.floor(50 + (1 - norm) * 100);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px, py, scaleX + 1, scaleY + 1);
    }
  }

  setStatus(`Preview: ${gridRes}×${gridRes} grid, ${exag}× exaggeration`);
}

function doExport() {
  const format = document.getElementById('export3d-format')?.value || 'stl';
  const res = document.getElementById('export3d-res')?.value || '128';
  const exag = parseInt(document.getElementById('export3d-exag')?.value || '2');
  const addBase = document.getElementById('export3d-base')?.checked;
  const baseH = parseInt(document.getElementById('export3d-base-h')?.value || '5');

  setStatus('Generating mesh...');

  const terrain = getTerrainGrid(res, exag);
  if (!terrain) { setStatus('No terrain data'); return; }

  let blob, filename;

  switch (format) {
    case 'stl':
      blob = generateSTL(terrain, addBase, baseH);
      filename = 'viewtopia-terrain.stl';
      break;
    case 'obj':
      blob = generateOBJ(terrain);
      filename = 'viewtopia-terrain.obj';
      break;
    case 'gltf':
      blob = generateGLTF(terrain);
      filename = 'viewtopia-terrain.gltf';
      break;
  }

  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
  }
}

function generateSTL(terrain, addBase, baseH) {
  const { grid, res } = terrain;
  const triangles = [];

  // Generate triangles from grid
  for (let y = 0; y < res - 1; y++) {
    for (let x = 0; x < res - 1; x++) {
      const scale = 100 / res; // Normalize to 100mm
      const v00 = [x * scale, y * scale, grid[y][x].h * 0.1];
      const v10 = [(x + 1) * scale, y * scale, grid[y][x + 1].h * 0.1];
      const v01 = [x * scale, (y + 1) * scale, grid[y + 1][x].h * 0.1];
      const v11 = [(x + 1) * scale, (y + 1) * scale, grid[y + 1][x + 1].h * 0.1];

      triangles.push([v00, v10, v01]);
      triangles.push([v10, v11, v01]);
    }
  }

  // Add base if requested
  if (addBase) {
    const scale = 100 / res;
    const maxX = (res - 1) * scale;
    const maxY = (res - 1) * scale;
    const baseZ = -baseH;

    // Bottom face
    triangles.push([[0, 0, baseZ], [maxX, 0, baseZ], [0, maxY, baseZ]]);
    triangles.push([[maxX, 0, baseZ], [maxX, maxY, baseZ], [0, maxY, baseZ]]);
  }

  // Write binary STL
  const numTriangles = triangles.length;
  const buffer = new ArrayBuffer(84 + numTriangles * 50);
  const view = new DataView(buffer);

  // Header (80 bytes)
  const header = 'ViewTopia 3D Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Number of triangles
  view.setUint32(80, numTriangles, true);

  // Triangle data
  let offset = 84;
  for (const tri of triangles) {
    // Normal (simplified: zero normal)
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 1, true); offset += 4;

    // Vertices
    for (const v of tri) {
      view.setFloat32(offset, v[0], true); offset += 4;
      view.setFloat32(offset, v[1], true); offset += 4;
      view.setFloat32(offset, v[2], true); offset += 4;
    }

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return new Blob([buffer], { type: 'application/sla' });
}

function generateOBJ(terrain) {
  const { grid, res } = terrain;
  let obj = '# ViewTopia 3D Terrain Export\n# Format: Wavefront OBJ\n\n';

  const scale = 100 / res;

  // Vertices
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      obj += `v ${(x * scale).toFixed(3)} ${(grid[y][x].h * 0.1).toFixed(3)} ${(y * scale).toFixed(3)}\n`;
    }
  }

  obj += '\n';

  // Faces (1-indexed)
  for (let y = 0; y < res - 1; y++) {
    for (let x = 0; x < res - 1; x++) {
      const i = y * res + x + 1;
      obj += `f ${i} ${i + 1} ${i + res + 1} ${i + res}\n`;
    }
  }

  return new Blob([obj], { type: 'text/plain' });
}

function generateGLTF(terrain) {
  const { grid, res } = terrain;
  const scale = 100 / res;

  // Minimal glTF 2.0 with embedded buffer
  const vertices = [];
  const indices = [];

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      vertices.push(x * scale, grid[y][x].h * 0.1, y * scale);
    }
  }

  for (let y = 0; y < res - 1; y++) {
    for (let x = 0; x < res - 1; x++) {
      const i = y * res + x;
      indices.push(i, i + 1, i + res);
      indices.push(i + 1, i + res + 1, i + res);
    }
  }

  const gltf = {
    asset: { version: '2.0', generator: 'ViewTopia' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertices.length / 3, type: 'VEC3', max: [100, 50, 100], min: [0, 0, 0] },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertices.length * 4 },
      { buffer: 0, byteOffset: vertices.length * 4, byteLength: indices.length * 4 },
    ],
    buffers: [{ byteLength: (vertices.length + indices.length) * 4 }],
  };

  // Note: A full implementation would embed the binary buffer as base64 in the .gltf
  // For now, export just the JSON descriptor
  return new Blob([JSON.stringify(gltf, null, 2)], { type: 'model/gltf+json' });
}

function setStatus(msg) {
  const el = document.getElementById('export3d-status');
  if (el) el.textContent = msg;
}
