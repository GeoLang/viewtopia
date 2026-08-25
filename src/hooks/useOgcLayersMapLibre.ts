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
import { useLayerLoadErrorStore } from '../store/layerLoadErrors';
import { addPmtilesLayers, addVectorTileStyleLayers } from '../features/pmtiles/mapLayers';

const PREFIX = 'ogc-layer-';

const TILE_REQUEST_FAILED = 'tile request failed';

/**
 * What to say about a failed tile request. MapLibre throws an AJAXError with the
 * response status, which is the only part a reader can act on.
 */
export function tileErrorMessage(error: unknown): string {
  const { status, message } = (error ?? {}) as { status?: unknown; message?: unknown };
  if (typeof status === 'number') return `tiles unavailable (${status})`;
  if (typeof message === 'string' && message) return message;
  return TILE_REQUEST_FAILED;
}

/**
 * The OGC layer a map event is about, or null for anything else on the map. The
 * source id is bubbled onto every source event by the style, error events
 * included, though only the source data events declare it in the types.
 */
function ogcLayerIdOf(event: unknown): string | null {
  const { sourceId } = (event ?? {}) as { sourceId?: unknown };
  if (typeof sourceId !== 'string' || !sourceId.startsWith(PREFIX)) return null;
  return sourceId.slice(PREFIX.length);
}

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
  const reloadRequests = useLayerLoadErrorStore((s) => s.reloadRequests);

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

    const onError = (event: maplibregl.ErrorEvent) => {
      const layerId = ogcLayerIdOf(event);
      if (!layerId) return;
      useLayerLoadErrorStore.getState().setError(layerId, tileErrorMessage(event.error));
    };

    // a tile is on the event only once it came back, so this is the one
    // source event that proves the layer can be fetched
    const onSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if (!event.tile) return;
      const layerId = ogcLayerIdOf(event);
      if (!layerId) return;
      useLayerLoadErrorStore.getState().clearError(layerId);
    };

    if (map.isStyleLoaded()) apply();
    else map.on('load', apply);
    map.on('idle', reapplyIfDropped);
    map.on('error', onError);
    map.on('sourcedata', onSourceData);

    return () => {
      map.off('load', apply);
      map.off('idle', reapplyIfDropped);
      map.off('error', onError);
      map.off('sourcedata', onSourceData);
    };
  }, [layers, mapRef, renderer, activeTab, reloadRequests]);
}
