import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  PolylineDashMaterialProperty,
} from 'cesium';
import { useMeasureStore, type MeasureMode } from '../store/measure';
import { useAppStore } from '../store/app';

function cartToLngLat(viewer: Viewer, x: number, y: number): [number, number] | null {
  const cart = viewer.camera.pickEllipsoid(new Cartesian2(x, y));
  if (!cart) return null;
  const c = Cartographic.fromCartesian(cart);
  return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
}

export function useMeasureCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const entityIdsRef = useRef<string[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // A renderer switch destroys and rebuilds the viewer, so rebind to the new
  // one — handlers and entities left on the old canvas are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const sync = (state: { mode: MeasureMode }) => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      if (state.mode && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(v.scene.canvas);

        handler.setInputAction((click: { position: Cartesian2 }) => {
          const { mode, addPoint } = useMeasureStore.getState();
          if (!mode) return;
          const ll = cartToLngLat(v, click.position.x, click.position.y);
          if (ll) addPoint(ll[0], ll[1]);
        }, ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(() => {
          const { mode, finishMeasure } = useMeasureStore.getState();
          if (mode) finishMeasure();
        }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        handlerRef.current = handler;
        v.scene.canvas.style.cursor = 'crosshair';
      }

      if (!state.mode && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        if (v && !v.isDestroyed()) v.scene.canvas.style.cursor = '';
      }
    };

    // Apply the mode that's already set: after a renderer switch the store won't
    // fire again for a tool the user turned on before the switch.
    sync(useMeasureStore.getState());
    const unsub = useMeasureStore.subscribe(sync);

    return () => {
      unsub();
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, renderer, activeTab]);

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
