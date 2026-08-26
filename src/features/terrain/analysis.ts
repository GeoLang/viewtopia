/**
 * Viewshed and flood: the request to tiletopia, the result layer on the map and
 * what the result says. The Viewshed and Flood panels and the chat actions all
 * run these, and read the store for what is drawn right now.
 */

import * as turf from '@turf/turf';
import { create } from 'zustand';
import { flood, viewshed, type Bbox } from '../../lib/terrainAnalysis';
import { drawTerrainResult, type TerrainResultLayer } from './resultLayer';

export const VIEWSHED_LAYER_ID = 'viewshed-result';
export const FLOOD_LAYER_ID = 'flood-result';

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

// a result outlives the panel that asked for it, so what to take off the map is
// held here rather than in a component
let viewshedLayer: TerrainResultLayer | null = null;
let floodLayer: TerrainResultLayer | null = null;

export function clearViewshed(): void {
  viewshedLayer?.remove();
  viewshedLayer = null;
  useTerrainAnalysisStore.setState({ viewshed: null });
}

export function clearFlood(): void {
  floodLayer?.remove();
  floodLayer = null;
  useTerrainAnalysisStore.setState({ flood: null });
}

/** Draw what an observer can see, and answer how much ground that is. */
export async function runViewshed(request: ViewshedRequest): Promise<ViewshedResult> {
  clearViewshed();
  const collection = await viewshed({
    observer: [request.longitude, request.latitude],
    height_m: request.heightMeters,
    radius_m: request.radiusMeters,
  });
  viewshedLayer = await drawTerrainResult(VIEWSHED_LAYER_ID, collection, VIEWSHED_COLOR, true);
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
  floodLayer = await drawTerrainResult(FLOOD_LAYER_ID, collection, FLOOD_COLOR, false);
  const result: FloodResult = { levelMeters, bbox, floodedCells: floodedCells(collection) };
  useTerrainAnalysisStore.setState({ flood: result });
  return result;
}
