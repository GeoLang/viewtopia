import type maplibregl from 'maplibre-gl';
import { CATEGORY_PALETTE } from '../symbology/symbology';
import type { PmtilesInfo } from './source';

export interface PmtilesDraw {
  /** Source id. Every style layer built here is named `<id>-…`. */
  id: string;
  /** pmtiles:// url of the archive. */
  url: string;
  info: PmtilesInfo;
  opacity: number;
  visible: boolean;
}

/**
 * A vector tile source says nothing about how to draw itself, so each source
 * layer gets one colour across the three geometry kinds, like an agent layer
 * would. Shared with the server-built tilesets, which differ only in how the
 * source is declared.
 */
export function addVectorTileStyleLayers(
  map: maplibregl.Map,
  id: string,
  sourceLayers: string[],
  opacity: number,
  visible: boolean,
): void {
  const visibility = visible ? 'visible' : 'none';
  sourceLayers.forEach((sourceLayer, i) => {
    const color = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    map.addLayer({
      id: `${id}-${sourceLayer}-fill`,
      type: 'fill',
      source: id,
      'source-layer': sourceLayer,
      filter: ['==', '$type', 'Polygon'],
      layout: { visibility },
      paint: { 'fill-color': color, 'fill-opacity': 0.3 * opacity },
    });
    map.addLayer({
      id: `${id}-${sourceLayer}-line`,
      type: 'line',
      source: id,
      'source-layer': sourceLayer,
      layout: { visibility },
      paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': opacity },
    });
    map.addLayer({
      id: `${id}-${sourceLayer}-circle`,
      type: 'circle',
      source: id,
      'source-layer': sourceLayer,
      filter: ['==', '$type', 'Point'],
      layout: { visibility },
      paint: { 'circle-color': color, 'circle-radius': 4, 'circle-opacity': opacity },
    });
  });
}

export function addPmtilesLayers(map: maplibregl.Map, draw: PmtilesDraw): void {
  const { id, url, info, opacity } = draw;
  if (info.kind === 'raster') {
    map.addSource(id, { type: 'raster', url });
    map.addLayer({
      id: `${id}-raster`,
      type: 'raster',
      source: id,
      layout: { visibility: draw.visible ? 'visible' : 'none' },
      paint: { 'raster-opacity': opacity },
    });
    return;
  }
  map.addSource(id, { type: 'vector', url });
  addVectorTileStyleLayers(map, id, info.vectorLayers, opacity, draw.visible);
}

/** Take one archive's source and every layer drawn from it back off the map. */
export function removePmtilesLayers(map: maplibregl.Map, id: string): void {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(`${id}-`)) map.removeLayer(layer.id);
  }
  if (map.getSource(id)) map.removeSource(id);
}
