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
import { addPmtilesLayers, addVectorTileStyleLayers } from '../features/pmtiles/mapLayers';

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

// the tile url and the layer names came off the archive's TileJSON when the
// tileset was added, so nothing is read here. The map's request transform is
// what puts the bearer on the tile requests
function addTilesetLayers(map: maplibregl.Map, layer: OGCLayer, id: string): void {
  if (!layer.tileset) return;
  const { layers, minZoom, maxZoom } = layer.tileset;
  map.addSource(id, {
    type: 'vector',
    tiles: [layer.url],
    ...(minZoom === undefined ? {} : { minzoom: minZoom }),
    // past the archive's top zoom MapLibre would ask for tiles nothing holds
    ...(maxZoom === undefined ? {} : { maxzoom: maxZoom }),
  });
  addVectorTileStyleLayers(map, id, layers, ogcLayerOpacity(layer), ogcLayerVisible(layer));
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
    // A PMTiles layer is drawable only once its header has been read, and a
    // tileset only once its TileJSON named the layers inside the archive.
    const drawable = layers.filter(
      (layer) =>
        layer.type !== 'wfs' &&
        (layer.type !== 'pmtiles' || layer.pmtiles) &&
        (layer.type !== 'tileset' || layer.tileset?.layers.length),
    );

    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(PREFIX)) map.removeLayer(layer.id);
      }
      for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
        if (id.startsWith(PREFIX)) map.removeSource(id);
      }
      for (const layer of drawable) {
        const id = `${PREFIX}${layer.id}`;
        if (layer.type === 'pmtiles') {
          addOgcPmtilesLayers(map, layer, id);
          continue;
        }
        if (layer.type === 'tileset') {
          addTilesetLayers(map, layer, id);
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
      if (drawable.some((layer) => !sources.includes(`${PREFIX}${layer.id}`))) apply();
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
