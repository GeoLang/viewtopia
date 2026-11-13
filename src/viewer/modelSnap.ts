import {
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  type Cartesian3,
  type Viewer,
} from 'cesium';
import type { MeasurePoint } from '../store/measure';

export const MEASURE_SNAP_HOVER_ID = 'meas-snap-hover';

export interface ModelSnap {
  point: MeasurePoint;
  edge: boolean;
}

function hideHover(viewer: Viewer): boolean {
  const entities = viewer.entities;
  if (!entities || typeof entities.getById !== 'function') return false;
  const hover = entities.getById(MEASURE_SNAP_HOVER_ID);
  if (!hover?.show) return false;
  hover.show = false;
  return true;
}

function restoreHover(viewer: Viewer, wasShown: boolean) {
  if (!wasShown) return;
  const hover = viewer.entities?.getById(MEASURE_SNAP_HOVER_ID);
  if (hover) hover.show = true;
}

function toPoint(cartesian: Cartesian3, onModel: boolean): MeasurePoint | null {
  const cartographic = Cartographic.fromCartesian(cartesian);
  if (!Number.isFinite(cartographic.longitude) || !Number.isFinite(cartographic.latitude)) return null;
  const lng = CesiumMath.toDegrees(cartographic.longitude);
  const lat = CesiumMath.toDegrees(cartographic.latitude);
  if (!onModel || !Number.isFinite(cartographic.height)) return [lng, lat];
  return [lng, lat, cartographic.height];
}

function readSnap(viewer: Viewer, x: number, y: number): ModelSnap | null {
  const snap = viewer.scene.snap;
  if (typeof snap !== 'function') return null;
  const hit = snap.call(viewer.scene, new Cartesian2(x, y));
  if (!hit?.position) return null;
  const point = toPoint(hit.position, true);
  if (!point) return null;
  return { point, edge: hit.isEdge === true };
}

export function snapUnderPointer(viewer: Viewer, x: number, y: number): ModelSnap | null {
  const wasShown = hideHover(viewer);
  const hit = readSnap(viewer, x, y);
  restoreHover(viewer, wasShown);
  return hit;
}

export function locateMeasurePoint(viewer: Viewer, x: number, y: number): MeasurePoint | null {
  const wasShown = hideHover(viewer);
  const snapped = readSnap(viewer, x, y);
  if (snapped) {
    restoreHover(viewer, wasShown);
    return snapped.point;
  }

  const windowPosition = new Cartesian2(x, y);
  const { scene } = viewer;
  const picked = scene.pickPositionSupported ? scene.pickPosition(windowPosition) : undefined;
  const ground = picked
    ? undefined
    : viewer.camera.pickEllipsoid(windowPosition, scene.globe?.ellipsoid);
  restoreHover(viewer, wasShown);

  if (picked) return toPoint(picked, true);
  if (!ground) return null;
  return toPoint(ground, false);
}
