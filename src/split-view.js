/**
 * Split view / compare — side-by-side or overlay comparison.
 * Supports 2D+3D, before/after, or temporal split.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { getLeafletMap, initLeafletMap } from './leaflet-view.js';

let splitActive = false;
let splitEl = null;

export function initSplitView() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'split-btn';
  btn.title = 'Split view';
  btn.textContent = '⬜ Split';
  toolbar.appendChild(btn);

  btn.addEventListener('click', () => {
    if (splitActive) {
      deactivateSplit();
      btn.classList.remove('active');
    } else {
      activateSplit();
      btn.classList.add('active');
    }
  });
}

function activateSplit() {
  splitActive = true;
  const vizContent = document.getElementById('viz-content');
  if (!vizContent) return;

  // Create split container
  splitEl = document.createElement('div');
  splitEl.id = 'split-view';
  splitEl.className = 'split-view';
  splitEl.innerHTML = `
    <div class="split-pane split-left" id="split-left">
      <div class="split-label">3D Globe</div>
    </div>
    <div class="split-divider" id="split-divider"></div>
    <div class="split-pane split-right" id="split-right">
      <div class="split-label">2D Map</div>
      <div id="split-map" style="width:100%;height:100%"></div>
    </div>
  `;
  vizContent.appendChild(splitEl);

  // Move the globe container into the left pane
  const globeContainer = document.getElementById('globe-container');
  const leftPane = document.getElementById('split-left');
  if (globeContainer && leftPane) {
    leftPane.appendChild(globeContainer);
  }

  // Initialize a second Leaflet map in the right pane
  const L = window.L;
  if (L) {
    const splitMap = L.map('split-map', {
      center: [37.8, -122.4],
      zoom: 11,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(splitMap);
    setTimeout(() => splitMap.invalidateSize(), 200);

    // Sync from Cesium camera
    const viewer = getCesiumViewer();
    if (viewer) {
      const carto = viewer.camera.positionCartographic;
      if (carto) {
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const zoom = Math.max(0, Math.log2(4e7 / Math.max(carto.height, 1)));
        splitMap.setView([lat, lon], Math.round(zoom));
      }
    }

    splitEl._splitMap = splitMap;
  }

  // Draggable divider
  const divider = document.getElementById('split-divider');
  if (divider) {
    let dragging = false;
    divider.addEventListener('mousedown', () => { dragging = true; });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('mousemove', (e) => {
      if (!dragging || !splitEl) return;
      const rect = splitEl.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, pct));
      splitEl.querySelector('.split-left').style.width = `${clamped}%`;
      splitEl.querySelector('.split-right').style.width = `${100 - clamped}%`;

      const viewer = getCesiumViewer();
      if (viewer) setTimeout(() => viewer.resize(), 50);
      if (splitEl._splitMap) setTimeout(() => splitEl._splitMap.invalidateSize(), 50);
    });
  }

  // Resize Cesium
  const viewer = getCesiumViewer();
  if (viewer) setTimeout(() => viewer.resize(), 200);
}

function deactivateSplit() {
  splitActive = false;

  // Move globe container back
  const globeContainer = document.getElementById('globe-container');
  const vizContent = document.getElementById('viz-content');
  if (globeContainer && vizContent) {
    vizContent.insertBefore(globeContainer, vizContent.firstChild);
  }

  // Clean up split map
  if (splitEl?._splitMap) {
    splitEl._splitMap.remove();
  }
  if (splitEl) {
    splitEl.remove();
    splitEl = null;
  }

  // Resize Cesium
  const viewer = getCesiumViewer();
  if (viewer) setTimeout(() => viewer.resize(), 100);
}
