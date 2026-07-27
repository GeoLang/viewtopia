import { create } from 'zustand';
import type { Layer } from '@deck.gl/core';

/**
 * Registry of deck.gl layer groups for the MapLibre map's deck overlay.
 *
 * A Deck takes ONE flat `layers` array, so multiple feature hooks (buildings,
 * spacetime, panels, …) each own a named group here and `useDeckOverlay`
 * composes them into the overlay. Setting a group to `[]` removes that
 * contribution.
 */
interface DeckLayersState {
  groups: Record<string, Layer[]>;
  setGroup: (key: string, layers: Layer[]) => void;
}

export const useDeckLayersStore = create<DeckLayersState>((set) => ({
  groups: {},
  setGroup: (key, layers) =>
    set((s) => ({ groups: { ...s.groups, [key]: layers } })),
}));

/**
 * Flatten all registered groups into the single layer array the overlay takes.
 * The layers are handed over as fresh clones: a Layer instance belongs to one
 * Deck for its lifetime, and a group outlives the overlay (every renderer switch
 * rebuilds the map, and the Deck with it). Reusing the instance asserts inside
 * deck instead of drawing.
 */
export function composedDeckLayers(groups: Record<string, Layer[]>): Layer[] {
  return Object.values(groups)
    .flat()
    .map((layer) => layer.clone({}) as Layer);
}
