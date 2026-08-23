import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { useOgcLayerStore } from '../../store/ogcLayers';
import {
  deleteTileset,
  getTileset,
  listTilesets,
  pollUntilBuilt,
  readTileset,
  uploadTileset,
  type Tileset,
} from './api';

interface TilesetState {
  /** A file the user was offered the tileset route for, waiting on an answer. */
  offered: File | null;
  /**
   * Parse the offered file in the tab after all. Unset when the file came from
   * the deliberate "build a tileset" pick rather than from an ordinary import.
   */
  browserFallback: (() => void) | null;
  /** How much of the offered file has gone up, unset while nothing is uploading. */
  uploadFraction: number | null;
  /** The row being built, from the 202 until it leaves `building`. */
  building: Tileset | null;
  /** What went wrong with the offered file's upload or build. */
  buildError: string | null;
  /** Every archive on the server, as of the last refresh. */
  tilesets: Tileset[];
  listing: boolean;
  listError: string | null;

  offer: (file: File, browserFallback?: () => void) => void;
  dismissOffer: () => void;
  /** Upload the offered file, wait for the build, and draw the result. */
  build: () => Promise<void>;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Put a ready archive on the map as a vector tile layer. */
  addLayer: (tileset: Tileset) => Promise<void>;
}

function reason(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useTilesetStore = create<TilesetState>((set, get) => ({
  offered: null,
  browserFallback: null,
  uploadFraction: null,
  building: null,
  buildError: null,
  tilesets: [],
  listing: false,
  listError: null,

  offer: (file, browserFallback) =>
    set({
      offered: file,
      browserFallback: browserFallback ?? null,
      uploadFraction: null,
      building: null,
      buildError: null,
    }),

  dismissOffer: () =>
    set({
      offered: null,
      browserFallback: null,
      uploadFraction: null,
      building: null,
      buildError: null,
    }),

  build: async () => {
    const file = get().offered;
    if (!file) return;
    set({ uploadFraction: 0, buildError: null });
    try {
      const queued = await uploadTileset(file, (fraction) => set({ uploadFraction: fraction }));
      set({ uploadFraction: 1, building: queued });
      const built = await pollUntilBuilt(queued.id, (tileset) => set({ building: tileset }));
      await get().refresh();
      if (built.status === 'failed') {
        set({ buildError: built.error ?? 'tippecanoe said nothing about why it failed' });
        return;
      }
      await get().addLayer(built);
      set({ offered: null, browserFallback: null, uploadFraction: null, building: null });
    } catch (err) {
      set({ buildError: reason(err, 'the tileset could not be built'), uploadFraction: null });
    }
  },

  refresh: async () => {
    set({ listing: true, listError: null });
    try {
      set({ tilesets: await listTilesets(), listing: false });
    } catch (err) {
      set({ listError: reason(err, 'could not list tilesets'), listing: false });
    }
  },

  remove: async (id) => {
    try {
      await deleteTileset(id);
      // the archive is gone, so anything drawing it is drawing nothing
      const ogc = useOgcLayerStore.getState();
      for (const layer of ogc.layers.filter((l) => l.tileset?.id === id)) ogc.removeLayer(layer.id);
      set((s) => ({ tilesets: s.tilesets.filter((t) => t.id !== id) }));
    } catch (err) {
      notifications.show({
        title: 'Delete failed',
        message: reason(err, 'could not delete the tileset'),
        color: 'red',
      });
    }
  },

  addLayer: async (tileset) => {
    // the row may have been listed before the build finished
    const current = tileset.status === 'ready' ? tileset : await getTileset(tileset.id);
    if (current.status !== 'ready') throw new Error(`${current.name} is ${current.status}`);
    const { url, source } = await readTileset(current);
    useOgcLayerStore.getState().putLayer({
      id: `tileset-${current.id}`,
      name: current.name,
      type: 'tileset',
      url,
      tileset: source,
    });
    notifications.show({
      title: 'Tileset added',
      message: `${current.name} — ${source.layers.join(', ')}`,
      color: 'green',
    });
  },
}));
