/**
 * Client for tiletopia's terrain-analysis endpoints, reached same-origin through
 * the /tiles/ proxy (nginx rewrites /tiles/(.*) -> tiletopia /api/$1). Also holds
 * the result-drawing helpers the panels share: PNG raster overlays and GeoJSON
 * results, on Cesium and on MapLibre.
 *
 * The analysis POSTs need a session token. The live XYZ tiles under /xyz/ are
 * anonymous, so a signed-out panel can still add one as a layer.
 */
import {
  type ImageryLayer,
  Rectangle,
  SingleTileImageryProvider,
} from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getActiveCesiumViewer, getActiveMapLibre } from '../viewer/registry';
import { apiHeaders } from './apiAuth';
import { getViewBounds } from './viewBounds';

const BASE = '/tiles/v1/analysis';

export type Bbox = [number, number, number, number]; // [west, south, east, north]

/** Current view as a lon/lat bbox, or null when it can't be resolved. */
export function currentBbox(): Bbox | null {
  const b = getViewBounds();
  const bbox: Bbox = [b.west, b.south, b.east, b.north];
  return bbox.every(Number.isFinite) ? bbox : null;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postBlobUrl(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export interface ViewshedBody {
  observer: [number, number]; // [lon, lat]
  height_m: number;
  radius_m: number;
}

export function viewshed(body: ViewshedBody): Promise<GeoJSON.FeatureCollection> {
  return postJson('/viewshed', body);
}

export function flood(level_m: number, bbox: Bbox): Promise<GeoJSON.FeatureCollection> {
  return postJson('/flood', { level_m, bbox });
}

export function contours(bbox: Bbox): Promise<GeoJSON.FeatureCollection> {
  return postJson('/terrain', { op: 'contours', bbox });
}

/** slope | aspect | hillshade -> object URL of the rendered PNG. */
export function terrainRaster(
  op: 'slope' | 'aspect' | 'hillshade',
  bbox: Bbox,
  params?: SunParams,
): Promise<string> {
  return postBlobUrl('/terrain', { op, bbox, params });
}

export function solarRaster(bbox: Bbox, date: string): Promise<string> {
  return postBlobUrl('/solar', { bbox, date });
}

/** The ops the live tile endpoint renders on demand. */
export type LiveOp = 'slope' | 'hillshade' | 'ndvi';

/** Sun position for hillshade, in degrees. */
export interface SunParams {
  azimuth: number;
  altitude: number;
}

export const DEFAULT_SUN: SunParams = { azimuth: 315, altitude: 45 };

/**
 * Tile template for a live analysis layer. The {z}/{x}/{y} placeholders stay
 * literal so the renderers substitute them per tile.
 */
export function liveTileTemplate(op: LiveOp, sun: SunParams): string {
  const path = `${BASE}/xyz/${op}/{z}/{x}/{y}.png`;
  // only hillshade takes parameters
  return op === 'hillshade' ? `${path}?azimuth=${sun.azimuth}&altitude=${sun.altitude}` : path;
}

/** Layer name carrying the op and, for hillshade, the sun it was added with. */
export function liveLayerName(op: LiveOp, sun: SunParams): string {
  return op === 'hillshade' ? `hillshade ${sun.azimuth}/${sun.altitude} (live)` : `${op} (live)`;
}

/** Drape a PNG (object URL) over a bbox as a Cesium imagery layer. */
export async function addRasterOverlay(
  url: string,
  bbox: Bbox,
  opacity: number,
): Promise<ImageryLayer | null> {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return null;
  const provider = await SingleTileImageryProvider.fromUrl(url, {
    rectangle: Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]),
  });
  const layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = opacity;
  return layer;
}

export function removeOverlay(layer: ImageryLayer | null): void {
  if (!layer) return;
  const viewer = getActiveCesiumViewer();
  if (!viewer || viewer.isDestroyed()) return;
  if (viewer.imageryLayers.contains(layer)) viewer.imageryLayers.remove(layer, true);
}

// tiletopia gates the analysis POSTs, so without a session token they can only
// answer 401. the panels check the session first and show this instead of firing,
// like the portal catalog's signed-out state.
export const SIGN_IN_HINT = 'Sign in to run this analysis';

/** A result the panel added to MapLibre and has to take off again. */
export interface MapResult {
  setOpacity: (opacity: number) => void;
  remove: () => void;
}

function dropMapLayers(map: MapLibreMap, id: string, suffixes: string[]): void {
  for (const s of suffixes) {
    if (map.getLayer(`${id}${s}`)) map.removeLayer(`${id}${s}`);
  }
  if (map.getSource(id)) map.removeSource(id);
}

/**
 * Draw a GeoJSON result on the displayed MapLibre map, in the same colors the
 * Cesium path uses. Null when MapLibre is not the live renderer.
 */
export function addMapGeoJson(
  id: string,
  data: GeoJSON.FeatureCollection,
  color: string,
): MapResult | null {
  const map = getActiveMapLibre();
  if (!map) return null;
  const suffixes = ['-fill', '-line'];
  dropMapLayers(map, id, suffixes);
  map.addSource(id, { type: 'geojson', data });
  // one source can hold mixed geometry, so add a layer per kind
  map.addLayer({
    id: `${id}-fill`,
    type: 'fill',
    source: id,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': color, 'fill-opacity': 0.4 },
  });
  map.addLayer({
    id: `${id}-line`,
    type: 'line',
    source: id,
    filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
    paint: { 'line-color': color, 'line-width': 2 },
  });
  return {
    setOpacity: () => {},
    remove: () => dropMapLayers(map, id, suffixes),
  };
}

/** Drape a PNG (object URL) over a bbox on the displayed MapLibre map. */
export function addMapRaster(
  id: string,
  url: string,
  bbox: Bbox,
  opacity: number,
): MapResult | null {
  const map = getActiveMapLibre();
  if (!map) return null;
  const [west, south, east, north] = bbox;
  const suffixes = ['-raster'];
  dropMapLayers(map, id, suffixes);
  map.addSource(id, {
    type: 'image',
    url,
    // image source corners run clockwise from the top left
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  });
  map.addLayer({
    id: `${id}-raster`,
    type: 'raster',
    source: id,
    paint: { 'raster-opacity': opacity },
  });
  return {
    setOpacity: (o) => {
      if (map.getLayer(`${id}-raster`)) map.setPaintProperty(`${id}-raster`, 'raster-opacity', o);
    },
    remove: () => dropMapLayers(map, id, suffixes),
  };
}
