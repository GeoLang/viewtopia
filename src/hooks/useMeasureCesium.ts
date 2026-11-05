import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Cartesian3,
  Color,
  PolylineDashMaterialProperty,
} from 'cesium';
import { measureToolClicks, useMeasureStore } from '../store/measure';
import { useAppStore } from '../store/app';
import { useToolClicksCesium } from './useToolClicksCesium';

export function useMeasureCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  useToolClicksCesium(viewerRef, useMeasureStore, measureToolClicks);
  const entityIdsRef = useRef<string[]>([]);
  // renderer switches destroy and rebuild the viewer, which drops entities on the old canvas
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const render = () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      for (const eid of entityIdsRef.current) {
        const e = v.entities.getById(eid);
        if (e) v.entities.remove(e);
      }
      entityIdsRef.current = [];

      const { results, pending } = useMeasureStore.getState();

      for (const r of results) {
        if (r.points.length >= 2) {
          const eid = `meas-line-${r.id}`;
          v.entities.add({
            id: eid,
            polyline: {
              positions: Cartesian3.fromDegreesArray(r.points.flat()),
              width: 3,
              material: Color.YELLOW,
              clampToGround: true,
            },
          });
          entityIdsRef.current.push(eid);
        }
        for (let i = 0; i < r.points.length; i++) {
          const eid = `meas-pt-${r.id}-${i}`;
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(r.points[i][0], r.points[i][1]),
            point: { pixelSize: 6, color: Color.YELLOW, outlineColor: Color.WHITE, outlineWidth: 2 },
          });
          entityIdsRef.current.push(eid);
        }
      }

      if (pending.length >= 2) {
        const eid = 'meas-pending-line';
        v.entities.add({
          id: eid,
          polyline: {
            positions: Cartesian3.fromDegreesArray(pending.flat()),
            width: 2,
            material: new PolylineDashMaterialProperty({
              color: Color.YELLOW.withAlpha(0.7),
              dashLength: 8,
            }),
            clampToGround: true,
          },
        });
        entityIdsRef.current.push(eid);
      }
      for (let i = 0; i < pending.length; i++) {
        const eid = `meas-pending-pt-${i}`;
        v.entities.add({
          id: eid,
          position: Cartesian3.fromDegrees(pending[i][0], pending[i][1]),
          point: { pixelSize: 5, color: Color.YELLOW, outlineColor: Color.WHITE, outlineWidth: 1 },
        });
        entityIdsRef.current.push(eid);
      }
    };

    const unsub = useMeasureStore.subscribe(render);
    // Re-render onto the rebuilt viewer; the old entities went with it.
    entityIdsRef.current = [];
    render();
    return () => { unsub(); };
  }, [viewerRef, renderer, activeTab]);
}
