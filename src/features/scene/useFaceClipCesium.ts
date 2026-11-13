import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Cartesian2, Cartesian3, ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import type { Viewer } from 'cesium';
import { useAppStore } from '../../store/app';
import {
  addFacePlane,
  armFaceClip,
  armedFaceClipTileset,
  facePlaneFromWorld,
  subscribeTilesetSections,
} from './tilesetSection';

const SAMPLE_PIXELS = 2;

function normalTowardCamera(
  viewer: Viewer,
  windowPosition: Cartesian2,
  point: Cartesian3,
): Cartesian3 | null {
  const { scene, camera } = viewer;
  const besideRight = scene.pickPosition(new Cartesian2(windowPosition.x + SAMPLE_PIXELS, windowPosition.y));
  const besideBelow = scene.pickPosition(new Cartesian2(windowPosition.x, windowPosition.y + SAMPLE_PIXELS));
  if (!besideRight || !besideBelow) return null;
  const normal = Cartesian3.cross(
    Cartesian3.subtract(besideRight, point, new Cartesian3()),
    Cartesian3.subtract(besideBelow, point, new Cartesian3()),
    new Cartesian3(),
  );
  if (Cartesian3.equals(normal, Cartesian3.ZERO)) return null;
  const towardCamera = Cartesian3.subtract(camera.positionWC, point, new Cartesian3());
  if (Cartesian3.dot(normal, towardCamera) < 0) Cartesian3.negate(normal, normal);
  return normal;
}

export function useFaceClipCesium(viewerRef: MutableRefObject<Viewer | null>): void {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const renderer = useAppStore((state) => state.renderer);
  const activeTab = useAppStore((state) => state.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const sync = () => {
      const current = viewerRef.current;
      if (!current || current.isDestroyed()) return;
      const armed = armedFaceClipTileset();
      if (armed && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(current.scene.canvas);
        handler.setInputAction((click: { position: Cartesian2 }) => {
          const tileset = armedFaceClipTileset();
          if (!tileset || current.isDestroyed()) return;
          const { scene } = current;
          if (!scene.pickPositionSupported || scene.pick(click.position)?.primitive !== tileset) return;
          const point = scene.pickPosition(click.position);
          if (!point) return;
          const normal = normalTowardCamera(current, click.position, point);
          if (!normal) return;
          const plane = facePlaneFromWorld(tileset, point, normal);
          if (!plane) return;
          addFacePlane(tileset, plane, () => current.scene.requestRender());
          armFaceClip(null, () => current.scene.requestRender());
        }, ScreenSpaceEventType.LEFT_CLICK);
        handlerRef.current = handler;
        current.scene.canvas.style.cursor = 'crosshair';
      }
      if (!armed && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        if (!current.isDestroyed()) current.scene.canvas.style.cursor = '';
      }
    };

    sync();
    const unsubscribe = subscribeTilesetSections(sync);
    return () => {
      unsubscribe();
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, renderer, activeTab]);
}
