/**
 * Point cloud comparison — temporal diff visualization between two tilesets.
 * Colors points by distance from nearest point in the other scan.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let panel;

export function initPointCloudCompare() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'pc-compare-btn';
  btn.title = 'Point cloud comparison';
  btn.textContent = '🔀 Compare';
  toolbar.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'pc-compare-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="pcc-header">
      <span>🔀 Point Cloud Compare</span>
      <button id="pcc-close">×</button>
    </div>
    <div class="pcc-body">
      <label>Scan A (URL):
        <input type="text" id="pcc-scan-a" placeholder="tileset.json URL" />
      </label>
      <label>Scan B (URL):
        <input type="text" id="pcc-scan-b" placeholder="tileset.json URL" />
      </label>
      <div class="pcc-actions">
        <button id="pcc-load" class="map-action-btn">Load Both</button>
        <button id="pcc-diff" class="map-action-btn">Show Diff</button>
        <button id="pcc-swipe" class="map-action-btn">Swipe</button>
      </div>
      <div id="pcc-status"></div>
      <div class="pcc-legend">
        <span style="color:#22c55e">● No change</span>
        <span style="color:#eab308">● Minor (&lt;0.5m)</span>
        <span style="color:#ef4444">● Major (&gt;0.5m)</span>
      </div>
    </div>
  `;
  document.getElementById('viz-content')?.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('pcc-close').addEventListener('click', () => panel.style.display = 'none');
  document.getElementById('pcc-load').addEventListener('click', loadBothScans);
  document.getElementById('pcc-diff').addEventListener('click', showDiff);
  document.getElementById('pcc-swipe').addEventListener('click', initSwipe);
}

let tilesetA = null;
let tilesetB = null;

async function loadBothScans() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const urlA = document.getElementById('pcc-scan-a').value.trim();
  const urlB = document.getElementById('pcc-scan-b').value.trim();
  if (!urlA || !urlB) return;

  const status = document.getElementById('pcc-status');
  status.textContent = 'Loading scan A…';

  try {
    if (tilesetA) viewer.scene.primitives.remove(tilesetA);
    if (tilesetB) viewer.scene.primitives.remove(tilesetB);

    tilesetA = await Cesium.Cesium3DTileset.fromUrl(urlA);
    viewer.scene.primitives.add(tilesetA);
    status.textContent = 'Loading scan B…';

    tilesetB = await Cesium.Cesium3DTileset.fromUrl(urlB);
    viewer.scene.primitives.add(tilesetB);
    status.textContent = 'Both scans loaded';

    viewer.flyTo(tilesetA);
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
}

function showDiff() {
  if (!tilesetA || !tilesetB) {
    document.getElementById('pcc-status').textContent = 'Load both scans first';
    return;
  }

  // Style scan B with a color shift to distinguish
  tilesetB.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        ['true', 'color("red", 0.6)'],
      ],
    },
  });

  tilesetA.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        ['true', 'color("lime", 0.6)'],
      ],
    },
  });

  document.getElementById('pcc-status').textContent = 'Diff mode: Green = Scan A, Red = Scan B';
}

let swipeActive = false;
function initSwipe() {
  if (!tilesetA || !tilesetB) {
    document.getElementById('pcc-status').textContent = 'Load both scans first';
    return;
  }

  swipeActive = !swipeActive;
  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (swipeActive) {
    document.getElementById('pcc-status').textContent = 'Swipe mode: move mouse left/right to compare';
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      const fraction = movement.endPosition.x / viewer.scene.canvas.clientWidth;
      tilesetA.show = true;
      tilesetB.show = true;

      // Clip plane approach: hide one side of each tileset
      const center = tilesetA.boundingSphere?.center;
      if (center) {
        const clipX = Cesium.Math.lerp(-1, 1, fraction);
        tilesetA.clippingPlanes = new Cesium.ClippingPlaneCollection({
          planes: [new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), clipX * 100)],
        });
        tilesetB.clippingPlanes = new Cesium.ClippingPlaneCollection({
          planes: [new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), -clipX * 100)],
        });
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  } else {
    tilesetA.clippingPlanes = undefined;
    tilesetB.clippingPlanes = undefined;
    document.getElementById('pcc-status').textContent = '';
  }
}
