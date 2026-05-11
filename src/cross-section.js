/**
 * Cross-Section Tool — vertical slice through point clouds / tilesets.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let crossSectionActive = false;
let pickPoints = [];
let polylineEntity = null;

export function initCrossSection() {
  const btn = document.getElementById('cross-section-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const viewer = getCesiumViewer();
    if (!viewer) { alert('Cross-section requires 3D Globe view'); return; }

    crossSectionActive = !crossSectionActive;
    btn.classList.toggle('active', crossSectionActive);

    if (crossSectionActive) {
      pickPoints = [];
      viewer.canvas.style.cursor = 'crosshair';
      startPicking(viewer);
    } else {
      viewer.canvas.style.cursor = '';
      cleanup(viewer);
    }
  });
}

function startPicking(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  handler.setInputAction((click) => {
    if (!crossSectionActive) { handler.destroy(); return; }

    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return;

    pickPoints.push(cartesian);

    if (pickPoints.length === 2) {
      handler.destroy();
      viewer.canvas.style.cursor = '';
      drawCrossSection(viewer, pickPoints[0], pickPoints[1]);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Store handler for cleanup
  viewer._crossSectionHandler = handler;
}

function drawCrossSection(viewer, start, end) {
  // Draw the section line on the globe
  polylineEntity = viewer.entities.add({
    polyline: {
      positions: [start, end],
      width: 3,
      material: Cesium.Color.CYAN,
      clampToGround: true,
    },
  });

  // Sample terrain along the line
  const startCarto = Cesium.Cartographic.fromCartesian(start);
  const endCarto = Cesium.Cartographic.fromCartesian(end);
  const numSamples = 100;
  const positions = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    positions.push(new Cesium.Cartographic(
      Cesium.Math.lerp(startCarto.longitude, endCarto.longitude, t),
      Cesium.Math.lerp(startCarto.latitude, endCarto.latitude, t),
    ));
  }

  Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions).then((sampled) => {
    showCrossSectionChart(sampled, startCarto, endCarto);
  }).catch(() => {
    // Fallback for ellipsoid terrain
    showCrossSectionChart(positions.map(p => { p.height = 0; return p; }), startCarto, endCarto);
  });
}

function showCrossSectionChart(samples, startCarto, endCarto) {
  let panel = document.getElementById('cross-section-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'cross-section-panel';
  panel.className = 'floating-panel';

  const totalDist = Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromRadians(startCarto.longitude, startCarto.latitude),
    Cesium.Cartesian3.fromRadians(endCarto.longitude, endCarto.latitude),
  );

  const heights = samples.map(s => s.height || 0);
  const maxH = Math.max(...heights, 1);
  const minH = Math.min(...heights, 0);
  const range = maxH - minH || 1;

  // Build SVG profile
  const w = 400, h = 150;
  const points = heights.map((ht, i) => {
    const x = (i / (heights.length - 1)) * w;
    const y = h - ((ht - minH) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  panel.innerHTML = `
    <div class="panel-header"><span>📐 Cross-Section</span><button class="panel-close" id="xsec-close">✕</button></div>
    <div class="panel-body">
      <svg width="${w}" height="${h}" style="background:#1e1e2e;border-radius:4px;">
        <polyline points="${points}" fill="none" stroke="#58a6ff" stroke-width="2"/>
        <text x="5" y="15" fill="#999" font-size="11">${maxH.toFixed(1)}m</text>
        <text x="5" y="${h - 5}" fill="#999" font-size="11">${minH.toFixed(1)}m</text>
        <text x="${w - 60}" y="${h - 5}" fill="#999" font-size="11">${(totalDist / 1000).toFixed(2)}km</text>
      </svg>
      <div style="margin-top:6px;font-size:12px;color:#aaa;">
        Samples: ${heights.length} | Δh: ${(maxH - minH).toFixed(1)}m | Dist: ${(totalDist / 1000).toFixed(2)}km
      </div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);
  document.getElementById('xsec-close').onclick = () => {
    panel.remove();
    const viewer = getCesiumViewer();
    if (viewer && polylineEntity) viewer.entities.remove(polylineEntity);
    polylineEntity = null;
    pickPoints = [];
    crossSectionActive = false;
    document.getElementById('cross-section-btn')?.classList.remove('active');
  };
}

function cleanup(viewer) {
  if (viewer._crossSectionHandler && !viewer._crossSectionHandler.isDestroyed()) {
    viewer._crossSectionHandler.destroy();
  }
  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  pickPoints = [];
  document.getElementById('cross-section-panel')?.remove();
}
