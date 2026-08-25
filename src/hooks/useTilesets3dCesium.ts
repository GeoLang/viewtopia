import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Cesium3DTileset, type Viewer } from 'cesium';
import { useLayerLoadErrorStore } from '../store/layerLoadErrors';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../store/tiles3dLayers';

/** What this hook has on one scene, so a store change reaches the primitives it already put there. */
interface DrawnTilesets {
  viewer: Viewer | null;
  tilesets: Map<string, Cesium3DTileset>;
  /** ids whose tileset.json is still in flight, so a second pass does not load it again */
  loading: Set<string>;
  /** ids whose load failed, at the retry count they failed at */
  failed: Map<string, number>;
}

function firstLine(failure: unknown): string {
  return (failure instanceof Error ? failure.message : String(failure)).split('\n')[0];
}

/**
 * Draws the 3D tilesets the layer store holds on a Cesium viewer. Loading is
 * reconciled rather than redone: a visibility change sets `show` on the
 * primitive that is already there, so the tiles and any style on them stay.
 */
export function useTilesets3dCesium(viewerRef: MutableRefObject<Viewer | null>) {
  const layers = useTiles3dLayerStore((s) => s.layers);
  // retry on a layer row asks for the tileset.json again
  const reloadRequests = useLayerLoadErrorStore((s) => s.reloadRequests);
  // useCesium renders again with the new instance whenever the tab or the
  // renderer changes, so the viewer read here is the one to draw on
  const viewer = viewerRef.current;
  const drawnRef = useRef<DrawnTilesets>({
    viewer: null,
    tilesets: new Map(),
    loading: new Set(),
    failed: new Map(),
  });

  useEffect(() => {
    const { setLoaded } = useTiles3dLayerStore.getState();
    const previous = drawnRef.current;
    // a renderer or tab switch builds a new viewer, and the old scene took its
    // primitives with it
    if (previous.viewer !== viewer) {
      for (const id of previous.tilesets.keys()) setLoaded(id, null);
      drawnRef.current = {
        viewer,
        tilesets: new Map(),
        loading: new Set(),
        failed: new Map(),
      };
    }
    const drawn = drawnRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    for (const [id, tileset] of [...drawn.tilesets]) {
      if (layers.some((layer) => layer.id === id)) continue;
      drawn.tilesets.delete(id);
      setLoaded(id, null);
      viewer.scene.primitives.remove(tileset);
    }

    const load = async (layer: Tiles3dLayer) => {
      drawn.loading.add(layer.id);
      try {
        const tileset = await Cesium3DTileset.fromUrl(layer.url);
        // the scene this was loaded for may be gone, and so may the layer
        if (drawnRef.current !== drawn || viewer.isDestroyed()) {
          tileset.destroy();
          return;
        }
        tileset.show = layer.visible;
        viewer.scene.primitives.add(tileset);
        drawn.tilesets.set(layer.id, tileset);
        useLayerLoadErrorStore.getState().clearError(layer.id);
        setLoaded(layer.id, tileset);
      } catch (failure) {
        drawn.failed.set(layer.id, reloadRequests);
        useLayerLoadErrorStore.getState().setError(layer.id, firstLine(failure));
      } finally {
        drawn.loading.delete(layer.id);
      }
    };

    for (const layer of layers) {
      const known = drawn.tilesets.get(layer.id);
      if (known) {
        known.show = layer.visible;
        continue;
      }
      if (drawn.loading.has(layer.id)) continue;
      // a url that already failed waits for the retry on its layer row
      if (drawn.failed.get(layer.id) === reloadRequests) continue;
      void load(layer);
    }
  }, [layers, viewer, reloadRequests]);
}
