import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  type Viewer,
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { useAppStore } from '../store/app';
import type { ToolClickHandlers, ToolModeStore } from './useToolClicksMapLibre';

export function cartToLngLat(viewer: Viewer, screenX: number, screenY: number): [number, number] | null {
  const cart = viewer.camera.pickEllipsoid(new Cartesian2(screenX, screenY));
  if (!cart) return null;
  const carto = Cartographic.fromCartesian(cart);
  return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
}

export function useToolClicksCesium(
  viewerRef: MutableRefObject<Viewer | null>,
  toolStore: ToolModeStore,
  clickHandlers: ToolClickHandlers,
  locate: (viewer: Viewer, screenX: number, screenY: number) => [number, number] | [number, number, number] | null = cartToLngLat,
) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  // renderer switches destroy and rebuild the viewer, which kills handlers on the old canvas
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const sync = (state: { mode: unknown }) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      if (state.mode && !handlerRef.current) {
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click: { position: Cartesian2 }) => {
          const point = locate(viewer, click.position.x, click.position.y);
          if (point) clickHandlers.onClick(point[0], point[1], point[2]);
        }, ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction(clickHandlers.onDoubleClick, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        handlerRef.current = handler;
        viewer.scene.canvas.style.cursor = 'crosshair';
      }

      if (!state.mode && handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
        viewer.scene.canvas.style.cursor = '';
      }
    };

    // zustand does not fire again for a mode set before the renderer switch
    sync(toolStore.getState());
    const unsubscribe = toolStore.subscribe(sync);

    return () => {
      unsubscribe();
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewerRef, toolStore, clickHandlers, locate, renderer, activeTab]);
}
