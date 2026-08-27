/**
 * Viewshed and flood: the request to tiletopia, the result layer on the map and
 * what the result says. The Viewshed and Flood panels and the chat actions all
 * run these, and read the store for what is drawn right now.
 */

import * as turf from '@turf/turf';
import { create } from 'zustand';
import { addGeoJsonLayer, removeGeoJsonLayer } from '../../lib/mapLayers';
import { flood, viewshed, type Bbox } from '../../lib/terrainAnalysis';
import { useAgentLayerStore } from '../../store/agentLayers';

export const VIEWSHED_LAYER_ID = 'viewshed-result';
export const FLOOD_LAYER_ID = 'flood-result';

// a result is an ordinary layer, so the layer panel and the chat's layers.*
// actions reach it under a name somebody would say out loud
export const VIEWSHED_LAYER_NAME = 'Viewshed';
export const FLOOD_LAYER_NAME = 'Flood';

const VIEWSHED_COLOR = '#a78bfa';
const FLOOD_COLOR = '#3b82f6';

/** How high the observer stands when nobody has said. */
export const DEFAULT_OBSERVER_HEIGHT_METERS = 2;
/** How far the observer looks when nobody has said. */
export const DEFAULT_VIEWSHED_RADIUS_METERS = 1000;

export interface ViewshedRequest {
  longitude: number;
  latitude: number;
  heightMeters: number;
  radiusMeters: number;
}

export interface ViewshedResult extends ViewshedRequest {
  visibleSquareMeters: number;
}

export interface FloodResult {
  levelMeters: number;
  bbox: Bbox;
  floodedCells: number;
}

interface TerrainAnalysisState {
  viewshed: ViewshedResult | null;
  flood: FloodResult | null;
}

export const useTerrainAnalysisStore = create<TerrainAnalysisState>(() => ({
  viewshed: null,
  flood: null,
}));

export function clearViewshed(): void {
  removeGeoJsonLayer(VIEWSHED_LAYER_ID);
  useTerrainAnalysisStore.setState({ viewshed: null });
}

export function clearFlood(): void {
  removeGeoJsonLayer(FLOOD_LAYER_ID);
  useTerrainAnalysisStore.setState({ flood: null });
}

// A result is an ordinary layer now, so the layer panel and layers.remove can
// take it off without going through clearViewshed. The panels read this store
// for what is drawn, so a reading nobody can see on the map has to go with it.
useAgentLayerStore.subscribe((state) => {
  const drawn = new Set(state.layers.map((layer) => layer.id));
  const { viewshed: shed, flood: flooded } = useTerrainAnalysisStore.getState();
  if (shed && !drawn.has(VIEWSHED_LAYER_ID)) useTerrainAnalysisStore.setState({ viewshed: null });
  if (flooded && !drawn.has(FLOOD_LAYER_ID)) useTerrainAnalysisStore.setState({ flood: null });
});

/** Draw what an observer can see, and answer how much ground that is. */
export async function runViewshed(request: ViewshedRequest): Promise<ViewshedResult> {
  clearViewshed();
  const collection = await viewshed({
    observer: [request.longitude, request.latitude],
    height_m: request.heightMeters,
    radius_m: request.radiusMeters,
  });
  addGeoJsonLayer(VIEWSHED_LAYER_ID, collection, {
    name: VIEWSHED_LAYER_NAME,
    color: VIEWSHED_COLOR,
  });
  const result: ViewshedResult = { ...request, visibleSquareMeters: turf.area(collection) };
  useTerrainAnalysisStore.setState({ viewshed: result });
  return result;
}

/** tiletopia reports the cell count on the single feature it answers with. */
function floodedCells(collection: GeoJSON.FeatureCollection): number {
  if (collection.features.length === 0) return 0;
  const reported = collection.features[0].properties?.flooded_cells;
  return typeof reported === 'number' ? reported : 0;
}

/** Draw the ground under a water level, and answer how many cells it covers. */
export async function runFlood(levelMeters: number, bbox: Bbox): Promise<FloodResult> {
  clearFlood();
  const collection = await flood(levelMeters, bbox);
  // the flood is computed over what is on screen, so framing it would only
  // shove the view it came from
  addGeoJsonLayer(FLOOD_LAYER_ID, collection, {
    name: FLOOD_LAYER_NAME,
    color: FLOOD_COLOR,
    fit: false,
  });
  const result: FloodResult = { levelMeters, bbox, floodedCells: floodedCells(collection) };
  useTerrainAnalysisStore.setState({ flood: result });
  return result;
}
