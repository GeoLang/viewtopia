import { create } from 'zustand';
import type { Layer } from '@deck.gl/core';

/**
 * Registry of deck.gl layer groups for the standalone Deck renderer.
 *
 * The deck.gl renderer is a single `Deck` instance (its own framework — not a
 * MapLibre map), and a Deck takes ONE flat `layers` array. Multiple feature
 * hooks (buildings, spacetime, …) each own a named group here; `useDeckGL`
 * composes them — under the basemap — into the Deck. Setting a group to `[]`
 * removes that contribution.
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

/** Flatten all registered groups into a single layer array (basemap added separately). */
export function composedDeckLayers(groups: Record<string, Layer[]>): Layer[] {
  return Object.values(groups).flat();
}
