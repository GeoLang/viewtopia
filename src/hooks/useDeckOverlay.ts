import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { MapLibreOverlay } from '@deck.gl/maplibre';
import { useAppStore } from '../store/app';
import { useFeaturePickerStore } from '../store/featurePicker';
import { setActiveDeckLayers, setActiveDeckOverlay } from '../viewer/registry';
import { useDeckLayersStore, composedDeckLayers } from './deckLayers';

/**
 * Attaches deck.gl to the live MapLibre map as an interleaved MapLibreOverlay,
 * so deck layers share the map's camera and depth buffer instead of needing a
 * Deck of their own. Every feature hook and panel registers a named group in the
 * deck-layers store; this is the one place those groups are composed and pushed.
 */
export function useDeckOverlay(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    // No onClick/onHover here: interleaved deck shares the map's canvas, so the
    // feature picker's single map click handler asks deck first (see
    // useFeaturePickerMapLibre). Two handlers would answer the same click twice.
    // deck rewrites the shared canvas cursor on every move, so it is the one
    // place the picker's hover affordance can be shown without being clobbered.
    const overlay = new MapLibreOverlay({
      interleaved: true,
      layers: [],
      // picking throws until the Deck has loaded, so publish the overlay here
      onLoad: () => {
        if (!disposed) setActiveDeckOverlay(overlay);
      },
      getCursor: ({ isDragging }) => {
        if (isDragging) return 'grabbing';
        return useFeaturePickerStore.getState().hovering ? 'pointer' : 'grab';
      },
    });
    map.addControl(overlay);

    // Interleaved layers become style layers, which the overlay can only insert
    // once the style is loaded. It keeps the layers either way and re-inserts
    // them on every styledata, so pushing early is safe and a basemap swap keeps
    // them. Waiting on isStyleLoaded() instead would strand layers set while
    // tiles were still in flight.
    const push = () => {
      const layers = composedDeckLayers(useDeckLayersStore.getState().groups);
      overlay.setProps({ layers });
      setActiveDeckLayers(layers);
    };

    const unsub = useDeckLayersStore.subscribe(push);
    push();

    return () => {
      disposed = true;
      unsub();
      setActiveDeckOverlay(null);
      setActiveDeckLayers(null);
      overlay.finalize();
    };
  }, [mapRef, renderer, activeTab]);
}
