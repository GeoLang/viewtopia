import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { getActiveMapLibre } from '../viewer/registry';
import type { Corners } from './georeference';

/**
 * Drag handles on the four corners of the image being georeferenced. MapLibre
 * only: its image source takes any quad, while Cesium and Leaflet drape onto a
 * rectangle and would show the envelope instead.
 */

const HANDLE_SIZE = 14;

function handleElement(): HTMLElement {
  const element = document.createElement('div');
  element.dataset.testid = 'overlay-corner-handle';
  element.style.cssText = `width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;border-radius:3px;background:var(--mantine-color-violet-5,#7950f2);border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.6);cursor:move;`;
  return element;
}

export function OverlayCornerHandles() {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const editingRasterId = useAgentLayerStore((s) => s.editingRasterId);
  const onMapLibre = renderer === 'maplibre' && activeTab === 'globe';

  useEffect(() => {
    if (!onMapLibre || !editingRasterId) return;
    const map = getActiveMapLibre();
    if (!map) return;
    const store = useAgentLayerStore.getState();
    const editing = store.rasterLayers.find((l) => l.id === editingRasterId);
    if (!editing) return;

    let dragging = false;
    const markers = editing.corners.map(([lng, lat], index) => {
      const marker = new maplibregl.Marker({ element: handleElement(), draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      marker.on('dragstart', () => {
        dragging = true;
      });
      const move = () => {
        const { lng: movedLng, lat: movedLat } = marker.getLngLat();
        const current = useAgentLayerStore
          .getState()
          .rasterLayers.find((l) => l.id === editingRasterId);
        if (!current) return;
        const corners = current.corners.map((corner, i) =>
          i === index ? [movedLng, movedLat] : corner,
        ) as Corners;
        useAgentLayerStore.getState().setRasterCorners(editingRasterId, corners);
      };
      marker.on('drag', move);
      marker.on('dragend', () => {
        dragging = false;
        move();
      });
      return marker;
    });

    // corners also move from the panel's coordinate fields, so follow the store
    // except while a handle is under the pointer and is the one writing to it
    const unsubscribe = useAgentLayerStore.subscribe((state) => {
      if (dragging) return;
      const layer = state.rasterLayers.find((l) => l.id === editingRasterId);
      if (!layer) return;
      layer.corners.forEach(([lng, lat], index) => markers[index]?.setLngLat([lng, lat]));
    });

    return () => {
      unsubscribe();
      for (const marker of markers) marker.remove();
    };
  }, [onMapLibre, editingRasterId]);

  return null;
}
