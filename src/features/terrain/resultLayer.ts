/**
 * One analysis result drawn on whichever renderer is on screen, and taken off
 * again by whoever put it there. The tool panels and the chat actions both draw
 * through this, so a result looks the same however it was asked for.
 */

import type { GeoJsonDataSource } from 'cesium';
import { addMapGeoJson } from '../../lib/terrainAnalysis';
import { useAppStore } from '../../store/app';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { renderGeoJson } from '../../viewer/renderGeoJson';

export interface TerrainResultLayer {
  remove: () => void;
}

function cesiumLayer(dataSource: GeoJsonDataSource | undefined): TerrainResultLayer {
  return {
    remove: () => {
      const viewer = getActiveCesiumViewer();
      if (dataSource && viewer && !viewer.isDestroyed()) viewer.dataSources.remove(dataSource);
    },
  };
}

/**
 * Draw a result as a named layer. `frame` flies the camera to it, which only
 * the Cesium path can do.
 */
export async function drawTerrainResult(
  layerId: string,
  collection: GeoJSON.FeatureCollection,
  color: string,
  frame: boolean,
): Promise<TerrainResultLayer> {
  if (useAppStore.getState().renderer === 'maplibre') {
    const drawn = addMapGeoJson(layerId, collection, color);
    return { remove: () => drawn?.remove() };
  }
  return cesiumLayer(await renderGeoJson(collection, color, frame, layerId));
}
