/**
 * 3D Clipping Planes — slice through buildings, terrain, and tilesets.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let clippingActive = false;
let clippingPlane = null;
let planeEntity = null;

export function initClippingPlanes() {
  const btn = document.getElementById('clipping-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const viewer = getCesiumViewer();
    if (!viewer) { alert('Clipping requires 3D Globe view'); return; }

    clippingActive = !clippingActive;
    btn.classList.toggle('active', clippingActive);

    if (clippingActive) {
      showClippingPanel(viewer);
    } else {
      removeClipping(viewer);
      document.getElementById('clipping-panel')?.remove();
    }
  });
}

function showClippingPanel(viewer) {
  let panel = document.getElementById('clipping-panel');
  if (panel) { panel.remove(); }

  panel = document.createElement('div');
  panel.id = 'clipping-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>✂ Clipping Plane</span><button class="panel-close" id="clipping-close">✕</button></div>
    <div class="panel-body">
      <label>Plane axis
        <select id="clip-axis">
          <option value="x">X (East–West)</option>
          <option value="y">Y (North–South)</option>
          <option value="z" selected>Z (Vertical)</option>
        </select>
      </label>
      <label>Height / offset (m)
        <input type="range" id="clip-offset" min="-500" max="500" value="0" step="1">
        <span id="clip-offset-val">0</span>
      </label>
      <button class="map-action-btn" id="clip-apply">Apply to tilesets</button>
      <button class="map-action-btn" id="clip-clear">Clear</button>
    </div>
  `;
  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('clipping-close').onclick = () => {
    panel.remove();
    clippingActive = false;
    document.getElementById('clipping-btn')?.classList.remove('active');
    removeClipping(viewer);
  };

  const offsetSlider = document.getElementById('clip-offset');
  const offsetVal = document.getElementById('clip-offset-val');
  offsetSlider.oninput = () => { offsetVal.textContent = offsetSlider.value; };

  document.getElementById('clip-apply').onclick = () => {
    const axis = document.getElementById('clip-axis').value;
    const offset = parseFloat(offsetSlider.value);
    applyClipping(viewer, axis, offset);
  };

  document.getElementById('clip-clear').onclick = () => removeClipping(viewer);
}

function applyClipping(viewer, axis, offset) {
  const normals = {
    x: new Cesium.Cartesian3(1, 0, 0),
    y: new Cesium.Cartesian3(0, 1, 0),
    z: new Cesium.Cartesian3(0, 0, -1),
  };
  const normal = normals[axis] || normals.z;

  clippingPlane = new Cesium.ClippingPlane(normal, offset);
  const collection = new Cesium.ClippingPlaneCollection({
    planes: [clippingPlane],
    edgeWidth: 2.0,
    edgeColor: Cesium.Color.RED,
  });

  // Apply to all 3D tilesets in the scene
  const primitives = viewer.scene.primitives;
  for (let i = 0; i < primitives.length; i++) {
    const p = primitives.get(i);
    if (p instanceof Cesium.Cesium3DTileset) {
      p.clippingPlanes = collection;
    }
  }

  // Apply to globe
  viewer.scene.globe.clippingPlanes = collection;
}

function removeClipping(viewer) {
  const primitives = viewer.scene.primitives;
  for (let i = 0; i < primitives.length; i++) {
    const p = primitives.get(i);
    if (p instanceof Cesium.Cesium3DTileset && p.clippingPlanes) {
      p.clippingPlanes = undefined;
    }
  }
  if (viewer.scene.globe.clippingPlanes) {
    viewer.scene.globe.clippingPlanes = undefined;
  }
  clippingPlane = null;
  if (planeEntity) {
    viewer.entities.remove(planeEntity);
    planeEntity = null;
  }
}
