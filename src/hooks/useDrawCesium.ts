import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  Viewer,
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  Color,
  Entity,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { useDrawStore, type DrawMode, type DrawnFeature } from '../store/draw';
import { useAppStore } from '../store/app';
import { Cartesian3 } from 'cesium';

function cssToColor(hex: string, alpha = 0.8): Color {
  try {
    return Color.fromCssColorString(hex).withAlpha(alpha);
  } catch {
    return Color.fromCssColorString('#a78bfa').withAlpha(alpha);
  }
}

function cartToLngLat(viewer: Viewer, screenX: number, screenY: number): [number, number] | null {
  const cart = viewer.camera.pickEllipsoid(new Cartesian2(screenX, screenY));
  if (!cart) return null;
  const carto = Cartographic.fromCartesian(cart);
  return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
}

export function useDrawCesium(
  viewerRef: MutableRefObject<Viewer | null>,
) {
  const entityIdsRef = useRef<string[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // A renderer switch destroys and rebuilds the viewer, so rebind to the new
  // one — handlers and entities left on the old canvas are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  // Click handler
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const sync = (state: { mode: DrawMode }) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      if (state.mode && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click: { position: Cartesian2 }) => {
          const { mode, addPendingPoint, finishFeature, pending } = useDrawStore.getState();
          if (!mode) return;
          const lngLat = cartToLngLat(viewer, click.position.x, click.position.y);
          if (!lngLat) return;

          addPendingPoint(lngLat[0], lngLat[1]);

          if (mode === 'point') {
            finishFeature();
          }
          if ((mode === 'circle' || mode === 'rectangle') && pending.length >= 1) {
            setTimeout(() => finishFeature(), 0);
          }
        }, ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(() => {
          const { mode, finishFeature } = useDrawStore.getState();
          if (mode === 'line' || mode === 'polygon') {
            finishFeature();
          }
        }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        handlerRef.current = handler;
        viewer.scene.canvas.style.cursor = 'crosshair';
      }

      if (!state.mode && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.canvas.style.cursor = '';
        }
      }
    };

    // Apply the mode that's already set: after a renderer switch the store won't
    // fire again for a tool the user turned on before the switch.
    sync(useDrawStore.getState());
    const unsub = useDrawStore.subscribe(sync);

    return () => {
      unsub();
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, renderer, activeTab]);

  // Render drawn features as Cesium entities
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const render = () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      // Clear old
      for (const eid of entityIdsRef.current) {
        const e = v.entities.getById(eid);
        if (e) v.entities.remove(e);
      }
      entityIdsRef.current = [];

      const { features, pending } = useDrawStore.getState();

      // Render completed features
      for (const f of features) {
        const color = cssToColor(f.color);
        if (f.type === 'Point') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(f.coords[0][0], f.coords[0][1]),
            point: { pixelSize: 8, color, outlineColor: Color.WHITE, outlineWidth: 2 },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'LineString') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            polyline: {
              positions: Cartesian3.fromDegreesArray(f.coords.flat()),
              width: f.lineWidth,
              material: color,
              clampToGround: true,
            },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'Polygon') {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray(f.coords.flat()),
              material: cssToColor(f.color, 0.25),
              outline: true,
              outlineColor: color,
              outlineWidth: f.lineWidth,
            },
          });
          entityIdsRef.current.push(eid);
        } else if (f.type === 'Circle' && f.radius) {
          const eid = `draw-${f.id}`;
          v.entities.add({
            id: eid,
            position: Cartesian3.fromDegrees(f.coords[0][0], f.coords[0][1]),
            ellipse: {
              semiMajorAxis: f.radius,
              semiMinorAxis: f.radius,
              material: cssToColor(f.color, 0.25),
              outline: true,
              outlineColor: color,
              outlineWidth: f.lineWidth,
            },
          });
          entityIdsRef.current.push(eid);
        }
      }

      // Render pending preview
      if (pending.length >= 2) {
        const eid = 'draw-pending-line';
        const existing = v.entities.getById(eid);
        if (existing) v.entities.remove(existing);
        v.entities.add({
          id: eid,
          polyline: {
            positions: Cartesian3.fromDegreesArray(pending.flat()),
            width: 2,
            material: new PolylineDashMaterialProperty({
              color: Color.WHITE,
              dashLength: 8,
            }),
            clampToGround: true,
          },
        });
        entityIdsRef.current.push(eid);
      }
      for (let i = 0; i < pending.length; i++) {
        const eid = `draw-pending-pt-${i}`;
        const existing = v.entities.getById(eid);
        if (existing) v.entities.remove(existing);
        v.entities.add({
          id: eid,
          position: Cartesian3.fromDegrees(pending[i][0], pending[i][1]),
          point: { pixelSize: 6, color: Color.WHITE, outlineColor: Color.VIOLET, outlineWidth: 1 },
        });
        entityIdsRef.current.push(eid);
      }
    };

    const unsub = useDrawStore.subscribe(render);
    // Re-render onto the rebuilt viewer; the old entities went with it.
    entityIdsRef.current = [];
    render();

    return () => {
      unsub();
    };
  }, [viewerRef, renderer, activeTab]);
}
