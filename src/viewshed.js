/**
 * Viewshed analysis — line-of-sight visibility from a point.
 * Uses ray-casting against Cesium terrain/globe to build a visibility fan.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let active = false;
let entities = [];

export function initViewshed() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'viewshed-btn';
  btn.title = 'Viewshed analysis';
  btn.textContent = '👁 Viewshed';
  toolbar.appendChild(btn);

  btn.addEventListener('click', toggleViewshed);
}

function toggleViewshed() {
  active = !active;
  const btn = document.getElementById('viewshed-btn');
  btn.classList.toggle('active', active);

  const viewer = getCesiumViewer();
  if (!viewer) return;

  if (active) {
    document.getElementById('measure-status').textContent = 'Click to set viewshed origin';
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const cart = viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
      if (cart) {
        computeViewshed(cart);
        handler.destroy();
        active = false;
        btn.classList.remove('active');
        document.getElementById('measure-status').textContent = '';
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}

function computeViewshed(origin) {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Clear previous
  for (const e of entities) viewer.entities.remove(e);
  entities = [];

  const carto = Cesium.Cartographic.fromCartesian(origin);
  const observerHeight = carto.height + 1.8; // eye height
  const radius = 500; // meters
  const steps = 72; // rays

  const visiblePositions = [];
  const blockedPositions = [];

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    const targetCarto = new Cesium.Cartographic(
      carto.longitude + dx / (111320 * Math.cos(carto.latitude)),
      carto.latitude + dy / 110540,
      0
    );

    // Simple terrain-based LOS check (approximate)
    const targetCart = Cesium.Cartesian3.fromRadians(targetCarto.longitude, targetCarto.latitude, observerHeight);
    const ray = new Cesium.Ray(
      Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight),
      Cesium.Cartesian3.subtract(targetCart, Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight), new Cesium.Cartesian3())
    );
    const hit = viewer.scene.globe.pick(ray, viewer.scene);
    if (hit) {
      const dist = Cesium.Cartesian3.distance(Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight), hit);
      if (dist < radius * 0.9) {
        blockedPositions.push(hit);
      } else {
        visiblePositions.push(targetCart);
      }
    } else {
      visiblePositions.push(targetCart);
    }
  }

  // Draw visible rays in green
  for (const pos of visiblePositions) {
    entities.push(viewer.entities.add({
      polyline: {
        positions: [Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight), pos],
        width: 2,
        material: Cesium.Color.LIME.withAlpha(0.5),
      },
    }));
  }

  // Draw blocked rays in red
  for (const pos of blockedPositions) {
    entities.push(viewer.entities.add({
      polyline: {
        positions: [Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight), pos],
        width: 2,
        material: Cesium.Color.RED.withAlpha(0.5),
      },
    }));
  }

  // Observer marker
  entities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, observerHeight),
    point: { pixelSize: 10, color: Cesium.Color.YELLOW },
    label: { text: 'Observer', font: '12px sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -15) },
  }));
}
