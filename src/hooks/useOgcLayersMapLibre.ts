import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import {
  useOgcLayerStore,
  rasterTileTemplate,
  pmtilesStyleUrl,
  ogcLayerOpacity,
  ogcLayerVisible,
  type OGCLayer,
} from '../store/ogcLayers';
import { useAppStore } from '../store/app';
import { addPmtilesLayers } from '../features/pmtiles/mapLayers';

const PREFIX = 'ogc-layer-';

function addOgcPmtilesLayers(map: maplibregl.Map, layer: OGCLayer, id: string): void {
  if (!layer.pmtiles) return;
  addPmtilesLayers(map, {
    id,
    url: pmtilesStyleUrl(layer),
    info: layer.pmtiles,
    opacity: ogcLayerOpacity(layer),
    visible: ogcLayerVisible(layer),
  });
}

/** Draws the user's OGC/XYZ services on MapLibre as raster sources. */
export function useOgcLayersMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const layers = useOgcLayerStore((s) => s.layers);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // WFS is vector: its features are drawn from the agent layers instead.
    // A PMTiles layer is drawable only once its header has been read.
    const rasterLayers = layers.filter(
      (layer) => layer.type !== 'wfs' && (layer.type !== 'pmtiles' || layer.pmtiles),
    );

    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(PREFIX)) map.removeLayer(layer.id);
      }
      for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
        if (id.startsWith(PREFIX)) map.removeSource(id);
      }
      for (const layer of rasterLayers) {
        const id = `${PREFIX}${layer.id}`;
        if (layer.type === 'pmtiles') {
          addOgcPmtilesLayers(map, layer, id);
          continue;
        }
        map.addSource(id, {
          type: 'raster',
          tiles: [rasterTileTemplate(layer)],
          tileSize: 256,
        });
        map.addLayer({
          id: `${id}-raster`,
          type: 'raster',
          source: id,
          layout: { visibility: ogcLayerVisible(layer) ? 'visible' : 'none' },
          paint: { 'raster-opacity': ogcLayerOpacity(layer) },
        });
      }
    };

    // A basemap change calls setStyle, which drops every source with it, so
    // re-add ours once a settled style comes back without them.
    const reapplyIfDropped = () => {
      if (!map.isStyleLoaded()) return;
      const sources = Object.keys(map.getStyle()?.sources ?? {});
      if (rasterLayers.some((layer) => !sources.includes(`${PREFIX}${layer.id}`))) apply();
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
