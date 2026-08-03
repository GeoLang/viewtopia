import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useOgcLayerStore, rasterTileTemplate, pmtilesStyleUrl, type OGCLayer } from '../store/ogcLayers';
import { useAppStore } from '../store/app';
import { CATEGORY_PALETTE } from '../features/symbology/symbology';

const PREFIX = 'ogc-layer-';

/**
 * A vector archive says nothing about how to draw itself, so each source layer
 * gets one colour across the three geometry kinds, like an agent layer would.
 */
function addPmtilesLayers(map: maplibregl.Map, layer: OGCLayer, id: string): void {
  const info = layer.pmtiles;
  if (!info) return;
  if (info.kind === 'raster') {
    map.addSource(id, { type: 'raster', url: pmtilesStyleUrl(layer) });
    map.addLayer({ id: `${id}-raster`, type: 'raster', source: id });
    return;
  }
  map.addSource(id, { type: 'vector', url: pmtilesStyleUrl(layer) });
  info.vectorLayers.forEach((sourceLayer, i) => {
    const color = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    map.addLayer({
      id: `${id}-${sourceLayer}-fill`,
      type: 'fill',
      source: id,
      'source-layer': sourceLayer,
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': color, 'fill-opacity': 0.3 },
    });
    map.addLayer({
      id: `${id}-${sourceLayer}-line`,
      type: 'line',
      source: id,
      'source-layer': sourceLayer,
      paint: { 'line-color': color, 'line-width': 1.5 },
    });
    map.addLayer({
      id: `${id}-${sourceLayer}-circle`,
      type: 'circle',
      source: id,
      'source-layer': sourceLayer,
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-color': color, 'circle-radius': 4 },
    });
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
          addPmtilesLayers(map, layer, id);
          continue;
        }
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
