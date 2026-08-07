import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  LabelStyle,
} from 'cesium';
import { useAnnotationStore, type PendingPlacement } from '../store/annotations';
import { useAppStore } from '../store/app';

const ENTITY_PREFIX = 'annot-';

export function useAnnotationsCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // A renderer switch destroys and rebuilds the viewer, so rebind to the new
  // one — handlers and entities left on the old canvas are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const render = () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const { annotations } = useAnnotationStore.getState();
      const wanted = new Set(annotations.map((a) => `${ENTITY_PREFIX}${a.id}`));
      for (const annotation of annotations) {
        const entityId = `${ENTITY_PREFIX}${annotation.id}`;
        if (viewer.entities.getById(entityId)) continue;
        viewer.entities.add({
          id: entityId,
          position: Cartesian3.fromDegrees(annotation.lng, annotation.lat),
          point: {
            pixelSize: 8,
            color: Color.fromCssColorString(annotation.color),
            outlineColor: Color.WHITE,
            outlineWidth: 1,
          },
          label: {
            text: annotation.label,
            font: '13px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -14),
          },
        });
      }
      const stale = viewer.entities.values.filter(
        (e) => e.id.startsWith(ENTITY_PREFIX) && !wanted.has(e.id),
      );
      for (const entity of stale) viewer.entities.remove(entity);
    };

    const unsubscribe = useAnnotationStore.subscribe(render);
    // Re-render onto the rebuilt viewer; the old entities went with it.
    render();
    return unsubscribe;
  }, [viewerRef, renderer, activeTab]);

  useEffect(() => {
    if (renderer !== 'cesium' || activeTab !== 'globe') return;

    const sync = (state: { pendingPlacement: PendingPlacement | null }) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      if (state.pendingPlacement && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: { position: Cartesian2 }) => {
          const picked = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
          if (!picked) return;
          const carto = Cartographic.fromCartesian(picked);
          useAnnotationStore
            .getState()
            .placePendingAnnotation(
              CesiumMath.toDegrees(carto.longitude),
              CesiumMath.toDegrees(carto.latitude),
            );
        }, ScreenSpaceEventType.LEFT_CLICK);
        handlerRef.current = handler;
        viewer.scene.canvas.style.cursor = 'crosshair';
      }

      if (!state.pendingPlacement && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        viewer.scene.canvas.style.cursor = '';
      }
    };

    // Arm a placement the user started before the renderer switch: the store
    // will not fire again for it.
    sync(useAnnotationStore.getState());
    const unsubscribe = useAnnotationStore.subscribe(sync);

    return () => {
      unsubscribe();
      if (!handlerRef.current) return;
      handlerRef.current.destroy();
      handlerRef.current = null;
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) viewer.scene.canvas.style.cursor = '';
    };
  }, [viewerRef, renderer, activeTab]);
}
