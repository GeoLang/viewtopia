/**
 * 3D relief on the displayed MapLibre map, off tiletopia's terrain-RGB tiles
 * (the same /tiles proxy the Cesium quantized-mesh path uses). MapLibre reads a
 * raster-dem source, Cesium reads quantized mesh, so the two paths share the
 * service but not the endpoint.
 */
import type { ErrorEvent, Map as MapLibreMap } from 'maplibre-gl';
import { getActiveMapLibre } from '../viewer/registry';

/** Mapbox-encoded terrain RGB, web mercator XYZ, 256px, zoom 0-15. */
export const TERRAIN_RGB_URL = '/tiles/v1/terrain/rgb/{z}/{x}/{y}.png';

export const TERRAIN_SOURCE_ID = 'stack-terrain-dem';

/** Relief the panel put on the map and has to take off again. */
export interface MapTerrain {
  setExaggeration: (exaggeration: number) => void;
  remove: () => void;
}

function dropTerrain(map: MapLibreMap): void {
  if (map.getTerrain()) map.setTerrain(null);
  if (map.getSource(TERRAIN_SOURCE_ID)) map.removeSource(TERRAIN_SOURCE_ID);
}

/**
 * Add the terrain-RGB source and turn relief on. Null when MapLibre is not the
 * live renderer, or when its style is not up yet to take a source.
 *
 * `onError` reports tile failures, which arrive long after this returns. The
 * listener also stops maplibre logging map errors itself while relief is on:
 * it only logs when nothing listens.
 */
export function addMapTerrain(
  exaggeration: number,
  onError: () => void,
): MapTerrain | null {
  const map = getActiveMapLibre();
  if (!map || !map.isStyleLoaded()) return null;

  const handleError = (e: ErrorEvent & { sourceId?: string }) => {
    if (e.sourceId === TERRAIN_SOURCE_ID) onError();
  };
  map.on('error', handleError);

  dropTerrain(map);
  map.addSource(TERRAIN_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [TERRAIN_RGB_URL],
    tileSize: 256,
    encoding: 'mapbox',
    maxzoom: 15,
  });
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });

  /** The map is destroyed on a renderer switch, taking its terrain with it. */
  const alive = () => getActiveMapLibre() === map;

  return {
    setExaggeration: (v) => {
      if (alive() && map.getSource(TERRAIN_SOURCE_ID)) {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: v });
      }
    },
    remove: () => {
      map.off('error', handleError);
      if (alive()) dropTerrain(map);
    },
  };
}
