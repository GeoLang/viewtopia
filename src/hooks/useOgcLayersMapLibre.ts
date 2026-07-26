import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useOgcLayerStore, rasterTileTemplate } from '../store/ogcLayers';
import { useAppStore } from '../store/app';

const PREFIX = 'ogc-layer-';

/** Draws the user's OGC/XYZ services on MapLibre as raster sources. */
export function useOgcLayersMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const layers = useOgcLayerStore((s) => s.layers);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(PREFIX)) map.removeLayer(layer.id);
      }
      for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
        if (id.startsWith(PREFIX)) map.removeSource(id);
      }
      for (const layer of layers) {
        const id = `${PREFIX}${layer.id}`;
        map.addSource(id, {
          type: 'raster',
          tiles: [rasterTileTemplate(layer)],
          tileSize: 256,
        });
        map.addLayer({ id: `${id}-raster`, type: 'raster', source: id });
      }
    };

    // A basemap change calls setStyle, which drops every source with it, so
    // re-add ours once a settled style comes back without them.
    const reapplyIfDropped = () => {
      if (!map.isStyleLoaded()) return;
      const sources = Object.keys(map.getStyle()?.sources ?? {});
      if (layers.some((layer) => !sources.includes(`${PREFIX}${layer.id}`))) apply();
    };

    if (map.isStyleLoaded()) apply();
    else map.on('load', apply);
    map.on('idle', reapplyIfDropped);

    return () => {
      map.off('load', apply);
      map.off('idle', reapplyIfDropped);
    };
  }, [layers, mapRef, renderer, activeTab]);
}
