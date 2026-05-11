/**
 * Volume measurement — cut/fill volume estimation from a drawn polygon.
 * Uses terrain sampling to compute the volume between a reference plane and terrain.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let active = false;
let positions = [];
let entities = [];

export function initVolumeMeasurement() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'volume-btn';
  btn.title = 'Volume measurement (cut/fill)';
  btn.textContent = '📐 Volume';
  toolbar.appendChild(btn);

  btn.addEventListener('click', toggleVolume);
}

function toggleVolume() {
  active = !active;
  const btn = document.getElementById('volume-btn');
  btn.classList.toggle('active', active);
  const status = document.getElementById('measure-status');

  if (active) {
    positions = [];
    clearEntities();
    status.textContent = 'Click vertices of measurement polygon, double-click to finish';
    startDrawing();
  } else {
    status.textContent = '';
  }
}

function clearEntities() {
  const viewer = getCesiumViewer();
  if (!viewer) return;
  for (const e of entities) viewer.entities.remove(e);
  entities = [];
}

function startDrawing() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((click) => {
    const cart = viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
    if (!cart) return;
    positions.push(cart);

    entities.push(viewer.entities.add({
      position: cart,
      point: { pixelSize: 8, color: Cesium.Color.ORANGE },
    }));

    if (positions.length > 1) {
      entities.push(viewer.entities.add({
        polyline: {
          positions: [positions[positions.length - 2], positions[positions.length - 1]],
          width: 2,
          material: Cesium.Color.ORANGE,
        },
      }));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction(() => {
    handler.destroy();
    active = false;
    document.getElementById('volume-btn').classList.remove('active');

    if (positions.length < 3) {
      document.getElementById('measure-status').textContent = 'Need at least 3 points';
      return;
    }

    // Close polygon
    entities.push(viewer.entities.add({
      polyline: {
        positions: [positions[positions.length - 1], positions[0]],
        width: 2,
        material: Cesium.Color.ORANGE,
      },
    }));

    computeVolume();
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

function computeVolume() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  // Get cartographic positions
  const cartos = positions.map(p => Cesium.Cartographic.fromCartesian(p));
  const heights = cartos.map(c => c.height);

  // Reference plane = average of polygon vertices
  const refHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  // Sample terrain inside polygon on a grid
  const lonMin = Math.min(...cartos.map(c => c.longitude));
  const lonMax = Math.max(...cartos.map(c => c.longitude));
  const latMin = Math.min(...cartos.map(c => c.latitude));
  const latMax = Math.max(...cartos.map(c => c.latitude));

  const gridSize = 20;
  const dLon = (lonMax - lonMin) / gridSize;
  const dLat = (latMax - latMin) / gridSize;
  const cellArea = computeCellArea(latMin, dLon, dLat);

  let cutVolume = 0; // terrain above ref (material to remove)
  let fillVolume = 0; // terrain below ref (material to add)
  let sampleCount = 0;

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lon = lonMin + i * dLon;
      const lat = latMin + j * dLat;
      if (!pointInPolygon(lon, lat, cartos)) continue;

      // Sample terrain height at this point
      const ray = viewer.camera.getPickRay(
        Cesium.SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          Cesium.Cartesian3.fromRadians(lon, lat, refHeight + 1000)
        )
      );
      if (!ray) continue;
      const hit = viewer.scene.globe.pick(ray, viewer.scene);
      if (!hit) continue;

      const hitCarto = Cesium.Cartographic.fromCartesian(hit);
      const diff = hitCarto.height - refHeight;

      if (diff > 0) cutVolume += diff * cellArea;
      else fillVolume += Math.abs(diff) * cellArea;
      sampleCount++;
    }
  }

  // Display result
  const status = document.getElementById('measure-status');
  status.innerHTML = `
    <strong>Volume Result</strong> (${sampleCount} samples)<br>
    Cut: ${formatVolume(cutVolume)} | Fill: ${formatVolume(fillVolume)} | Net: ${formatVolume(cutVolume - fillVolume)}<br>
    Reference height: ${refHeight.toFixed(1)}m
  `;

  // Add reference plane visualization
  entities.push(viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: Cesium.Color.ORANGE.withAlpha(0.3),
      height: refHeight,
      outline: true,
      outlineColor: Cesium.Color.ORANGE,
    },
  }));
}

function formatVolume(v) {
  if (Math.abs(v) > 1000000) return (v / 1000000).toFixed(2) + ' Mm³';
  if (Math.abs(v) > 1000) return (v / 1000).toFixed(2) + ' km³';
  return v.toFixed(1) + ' m³';
}

function computeCellArea(latRad, dLon, dLat) {
  const R = 6371000;
  const w = R * Math.cos(latRad) * dLon;
  const h = R * dLat;
  return Math.abs(w * h);
}

function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude, yi = polygon[i].latitude;
    const xj = polygon[j].longitude, yj = polygon[j].latitude;
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
