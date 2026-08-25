import { create } from 'zustand';
import type { Cesium3DTileset } from 'cesium';

/**
 * 3D Tiles tilesets on the globe: an uploaded model the Assets panel added, or
 * one an agent command or a live document named. Only the url travels, so every
 * member loads the same tiles for themselves, and `useTilesets3dCesium` is what
 * turns an entry here into a primitive in the scene.
 */
export interface Tiles3dLayer {
  id: string;
  name: string;
  /** the tileset.json url, which is what a peer loads too */
  url: string;
  visible: boolean;
}

interface Tiles3dLayerState {
  layers: Tiles3dLayer[];
  /** the primitive drawing each layer, put here once the Cesium hook has loaded it */
  loaded: Record<string, Cesium3DTileset>;
  /** Put a layer in under its own id; a known id replaces that layer. */
  putLayer: (layer: Tiles3dLayer) => void;
  removeLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
  setLoaded: (id: string, tileset: Cesium3DTileset | null) => void;
}

export const useTiles3dLayerStore = create<Tiles3dLayerState>((set) => ({
  layers: [],
  loaded: {},

  putLayer: (layer) =>
    set((state) => ({
      layers: state.layers.some((known) => known.id === layer.id)
        ? state.layers.map((known) => (known.id === layer.id ? layer : known))
        : [...state.layers, layer],
    })),

  removeLayer: (id) =>
    set((state) => {
      if (!state.layers.some((layer) => layer.id === id)) return state;
      const loaded = { ...state.loaded };
      delete loaded[id];
      return { layers: state.layers.filter((layer) => layer.id !== id), loaded };
    }),

  // every layer switch on the panel comes through here, so an id this store
  // does not hold must leave it as it was
  setLayerVisible: (id, visible) =>
    set((state) =>
      state.layers.some((layer) => layer.id === id)
        ? {
            layers: state.layers.map((layer) =>
              layer.id === id ? { ...layer, visible } : layer,
            ),
          }
        : state,
    ),

  setLoaded: (id, tileset) =>
    set((state) => {
      const loaded = { ...state.loaded };
      if (tileset) loaded[id] = tileset;
      else delete loaded[id];
      return { loaded };
    }),
}));

/** How long a caller that wants to fly to a tileset waits for it to load. */
const TILESET_LOAD_TIMEOUT_MS = 60_000;

/**
 * The primitive drawing this layer, once the Cesium hook has it. Answers null if
 * the tileset never arrives, which a failed load and no Cesium viewer both look
 * like from here.
 */
export function loadedTileset(id: string): Promise<Cesium3DTileset | null> {
  const known = useTiles3dLayerStore.getState().loaded[id];
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, TILESET_LOAD_TIMEOUT_MS);
    const unsubscribe = useTiles3dLayerStore.subscribe((state) => {
      const tileset = state.loaded[id];
      if (!tileset) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(tileset);
    });
  });
}
