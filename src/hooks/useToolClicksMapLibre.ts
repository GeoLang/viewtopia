import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';

export interface ToolModeStore {
  getState: () => { mode: unknown };
  subscribe: (listener: (state: { mode: unknown }) => void) => () => void;
}

export interface ToolClickHandlers {
  onClick: (lng: number, lat: number) => void;
  onDoubleClick: () => void;
}

interface MapToolListeners {
  click: (e: maplibregl.MapMouseEvent) => void;
  doubleClick: (e: maplibregl.MapMouseEvent) => void;
}

export function useToolClicksMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  toolStore: ToolModeStore,
  clickHandlers: ToolClickHandlers,
) {
  const listenersRef = useRef<MapToolListeners | null>(null);
  // renderer switches destroy and rebuild the map, which kills handlers on the old instance
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    if (!mapRef.current) return;

    const sync = (state: { mode: unknown }) => {
      const map = mapRef.current;
      if (!map) return;

      if (state.mode && !listenersRef.current) {
        const click = (e: maplibregl.MapMouseEvent) => {
          clickHandlers.onClick(e.lngLat.lng, e.lngLat.lat);
        };
        const doubleClick = (e: maplibregl.MapMouseEvent) => {
          e.preventDefault();
          clickHandlers.onDoubleClick();
        };
        map.on('click', click);
        map.on('dblclick', doubleClick);
        listenersRef.current = { click, doubleClick };
        map.getCanvas().style.cursor = 'crosshair';
      }

      if (!state.mode && listenersRef.current) {
        map.off('click', listenersRef.current.click);
        map.off('dblclick', listenersRef.current.doubleClick);
        listenersRef.current = null;
        map.getCanvas().style.cursor = '';
      }
    };

    // zustand does not fire again for a mode set before the renderer switch
    sync(toolStore.getState());
    const unsubscribe = toolStore.subscribe(sync);

    return () => {
      unsubscribe();
      const map = mapRef.current;
      const listeners = listenersRef.current;
      if (map && listeners) {
        map.off('click', listeners.click);
        map.off('dblclick', listeners.doubleClick);
      }
      listenersRef.current = null;
    };
  }, [mapRef, toolStore, clickHandlers, renderer, activeTab]);
}
