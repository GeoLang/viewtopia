import {
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  type Viewer,
} from 'cesium';
import { cartToLngLat } from '../hooks/useToolClicksCesium';
import type { MeasurePoint } from '../store/measure';

export const MEASURE_SNAP_HOVER_ID = 'meas-snap-hover';

export interface ModelSnap {
  point: MeasurePoint;
  edge: boolean;
}

export function snapUnderPointer(viewer: Viewer, x: number, y: number): ModelSnap | null {
  const { entities } = viewer;
  // cesium applies entity.show to the point primitive only on the next DataSourceDisplay update
  const hover = entities.getById(MEASURE_SNAP_HOVER_ID);
  if (hover) entities.remove(hover);
  const hit = viewer.scene.snap(new Cartesian2(x, y));
  if (hover) entities.add(hover);
  if (!hit) return null;
  const cartographic = Cartographic.fromCartesian(hit.position);
  return {
    point: [
      CesiumMath.toDegrees(cartographic.longitude),
      CesiumMath.toDegrees(cartographic.latitude),
      cartographic.height,
    ],
    edge: hit.isEdge,
  };
}

export function locateMeasurePoint(viewer: Viewer, x: number, y: number): MeasurePoint | null {
  const snapped = snapUnderPointer(viewer, x, y);
  if (snapped) return snapped.point;
  return cartToLngLat(viewer, x, y);
}
