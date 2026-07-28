import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Deck } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { useAppStore } from '../store/app';
import { useFeaturePickerStore } from '../store/featurePicker';
import { setActiveDeck } from '../viewer/registry';
import { useDeckLayersStore, composedDeckLayers } from './deckLayers';

/**
 * Interleaved mode builds one Deck per map and hangs it off the map, which is
 * how the registry (and the feature picker) reach it. Typed by deck's own
 * `Map & { __deck }`, but it is not part of maplibre's public surface.
 */
type MapWithDeck = maplibregl.Map & { __deck?: Deck | null };

/**
 * Attaches deck.gl to the live MapLibre map as an interleaved MapboxOverlay, so
 * deck layers share the map's camera and depth buffer instead of needing a Deck
 * of their own. Every feature hook and panel registers a named group in the
 * deck-layers store; this is the one place those groups are composed and pushed.
 */
export function useDeckOverlay(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // No onClick/onHover here: interleaved deck shares the map's canvas, so the
    // feature picker's single map click handler asks deck first (see
    // useFeaturePickerMapLibre). Two handlers would answer the same click twice.
    // deck rewrites the shared canvas cursor on every move, so it is the one
    // place the picker's hover affordance can be shown without being clobbered.
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getCursor: ({ isDragging }) => {
        if (isDragging) return 'grabbing';
        return useFeaturePickerStore.getState().hovering ? 'pointer' : 'grab';
      },
    });
    map.addControl(overlay);
    setActiveDeck((map as MapWithDeck).__deck ?? null);

    // Interleaved layers become style layers, which the overlay can only insert
    // once the style is loaded. It keeps the layers either way and re-inserts
    // them on every styledata, so pushing early is safe and a basemap swap keeps
    // them. Waiting on isStyleLoaded() instead would strand layers set while
    // tiles were still in flight.
    const push = () =>
      overlay.setProps({
        layers: composedDeckLayers(useDeckLayersStore.getState().groups),
      });

    const unsub = useDeckLayersStore.subscribe(push);
    push();

    return () => {
      unsub();
      setActiveDeck(null);
      overlay.finalize();
    };
  }, [mapRef, renderer, activeTab]);
}
