import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  type Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { type MeasurePoint, measureToolClicks, pointHasHeight, useMeasureStore } from '../store/measure';
import { useAppStore } from '../store/app';
import { useToolClicksCesium } from './useToolClicksCesium';
import { depthTestOffUntilHorizon } from '../viewer/horizonDepthTest';
import { MEASURE_SNAP_HOVER_ID, locateMeasurePoint, snapUnderPointer } from '../viewer/modelSnap';

function measurePositions(points: MeasurePoint[]) {
  if (points.some(pointHasHeight)) {
    return points.map((point) => Cartesian3.fromDegrees(point[0], point[1], point[2] ?? 0));
  }
  return Cartesian3.fromDegreesArray(points.flat());
}

export function useMeasureCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  useToolClicksCesium(viewerRef, useMeasureStore, measureToolClicks, locateMeasurePoint);
  const entityIdsRef = useRef<string[]>([]);
  // renderer switches destroy and rebuild the viewer, which drops entities on the old canvas
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const hideHover = () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      const hover = v.entities.getById(MEASURE_SNAP_HOVER_ID);
      if (hover) v.entities.remove(hover);
    };

    const render = () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      if (!useMeasureStore.getState().mode) hideHover();

      for (const eid of entityIdsRef.current) {
        const e = v.entities.getById(eid);
        if (e) v.entities.remove(e);
      }
      entityIdsRef.current = [];

      const { results, pending } = useMeasureStore.getState();

      for (const r of results) {
        const onModel = r.points.some(pointHasHeight);
        if (r.points.length >= 2) {
          const eid = `meas-line-${r.id}`;
          v.entities.add({
            id: eid,
            polyline: {
              positions: measurePositions(r.points),
              width: 3,
              material: Color.YELLOW,
              clampToGround: !onModel,
            },
          });
          entityIdsRef.current.push(eid);
        }
        for (let i = 0; i < r.points.length; i++) {
          const eid = `meas-pt-${r.id}-${i}`;
          const point = r.points[i];
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(point[0], point[1], point[2] ?? 0),
            point: { pixelSize: 6, color: Color.YELLOW, outlineColor: Color.WHITE, outlineWidth: 2 },
          });
          entityIdsRef.current.push(eid);
        }
      }

      const pendingOnModel = pending.some(pointHasHeight);
      if (pending.length >= 2) {
        const eid = 'meas-pending-line';
        v.entities.add({
          id: eid,
          polyline: {
            positions: measurePositions(pending),
            width: 2,
            material: new PolylineDashMaterialProperty({
              color: Color.YELLOW.withAlpha(0.7),
              dashLength: 8,
            }),
            clampToGround: !pendingOnModel,
          },
        });
        entityIdsRef.current.push(eid);
      }
      for (let i = 0; i < pending.length; i++) {
        const eid = `meas-pending-pt-${i}`;
        const point = pending[i];
        v.entities.add({
          id: eid,
          position: Cartesian3.fromDegrees(point[0], point[1], point[2] ?? 0),
          point: { pixelSize: 5, color: Color.YELLOW, outlineColor: Color.WHITE, outlineWidth: 1 },
        });
        entityIdsRef.current.push(eid);
      }
    };

    const unsub = useMeasureStore.subscribe(render);
    // Re-render onto the rebuilt viewer; the old entities went with it.
    entityIdsRef.current = [];
    render();

    const hoverHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    hoverHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      if (!useMeasureStore.getState().mode) {
        hideHover();
        return;
      }
      const hit = snapUnderPointer(v, movement.endPosition.x, movement.endPosition.y);
      if (!hit) {
        hideHover();
        return;
      }
      const [lng, lat, height] = hit.point;
      const position = Cartesian3.fromDegrees(lng, lat, height ?? 0);
      const color = hit.edge ? Color.CYAN : Color.YELLOW;
      const existing = v.entities.getById(MEASURE_SNAP_HOVER_ID);
      if (existing) {
        existing.position = new ConstantPositionProperty(position);
        if (existing.point) existing.point.color = new ConstantProperty(color);
        return;
      }
      v.entities.add({
        id: MEASURE_SNAP_HOVER_ID,
        position,
        point: {
          pixelSize: 10,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: depthTestOffUntilHorizon(v),
        },
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      unsub();
      hoverHandler.destroy();
      hideHover();
    };
  }, [viewerRef, renderer, activeTab]);
}
