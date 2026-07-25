/**
 * Client for tiletopia's terrain-analysis endpoints, reached same-origin through
 * the /tiles/ proxy (nginx rewrites /tiles/(.*) -> tiletopia /api/$1). Also holds
 * the Cesium helpers the panels share: current-view bbox and PNG raster overlays.
 */
import {
  ImageryLayer,
  Math as CesiumMath,
  Rectangle,
  SingleTileImageryProvider,
} from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';
import { apiHeaders } from './apiAuth';

const BASE = '/tiles/v1/analysis';

export type Bbox = [number, number, number, number]; // [west, south, east, north]

/** Current camera view as a lon/lat bbox, or null when it can't be resolved. */
export function currentBbox(): Bbox | null {
  const viewer = getActiveCesiumViewer();
  if (!viewer) return null;
  const rect = viewer.camera.computeViewRectangle();
  if (!rect) return null;
  return [
    CesiumMath.toDegrees(rect.west),
    CesiumMath.toDegrees(rect.south),
    CesiumMath.toDegrees(rect.east),
    CesiumMath.toDegrees(rect.north),
  ];
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
): Promise<string> {
  return postBlobUrl('/terrain', { op, bbox });
}

export function solarRaster(bbox: Bbox, date: string): Promise<string> {
  return postBlobUrl('/solar', { bbox, date });
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
