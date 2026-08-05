/**
 * Main-thread client for the raster compute worker. One worker holds the
 * initialized wasm module for the whole session, calls resolve in request
 * order per op but interleave freely across ops.
 */
import type {
  ContourResult,
  FocalStat,
  Neighborhood,
  PolygonizeResult,
  RasterResult,
  ZonalResult,
} from './types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
  }
  return worker;
}

function call<T>(op: string, args: unknown[]): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage({ id, op, args });
  });
}

export function normalizedDifference(
  a: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
  noData: number | null,
  operation: RasterResult['operation'],
  colorMap: string,
): Promise<RasterResult> {
  return call('normdiff', [a, b, width, height, noData, operation, colorMap]);
}

export function hillshade(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  zFactor: number,
  azimuth: number,
  altitude: number,
  noData: number | null,
): Promise<RasterResult> {
  return call('hillshade', [dem, width, height, cellSize, zFactor, azimuth, altitude, noData]);
}

export function slope(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  zFactor: number,
  units: 'degrees' | 'percent',
  noData: number | null,
): Promise<RasterResult> {
  return call('slope', [dem, width, height, cellSize, zFactor, units, noData]);
}

export function aspect(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  noData: number | null,
): Promise<RasterResult> {
  return call('aspect', [dem, width, height, cellSize, noData]);
}

export function reclass(
  data: Float32Array,
  width: number,
  height: number,
  classes: { min: number; max: number; value: number }[],
  noData: number | null,
): Promise<RasterResult> {
  return call('reclass', [data, width, height, classes, noData]);
}

export function polygonize(
  data: Float32Array,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  noData: number | null,
): Promise<PolygonizeResult> {
  return call('polygonize', [data, width, height, bbox, noData]);
}

export function contours(
  dem: Float32Array,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  interval: number,
  base: number,
  noData: number | null,
): Promise<ContourResult> {
  return call('contours', [dem, width, height, bbox, interval, base, noData]);
}

export function focalStats(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  shape: Neighborhood,
  stat: FocalStat,
  noData: number | null,
): Promise<RasterResult> {
  return call('focal', [data, width, height, radius, shape, stat, noData]);
}

export function zonalStats(
  values: Float32Array,
  zones: Float32Array,
  width: number,
  height: number,
  noData: number | null,
): Promise<ZonalResult[]> {
  return call('zonal', [values, zones, width, height, noData]);
}

export function zonalStatsByPolygons(
  values: Float32Array,
  features: GeoJSON.Feature[],
  width: number,
  height: number,
  bbox: [number, number, number, number],
  noData: number | null,
): Promise<ZonalResult[]> {
  return call('zonal-polygons', [values, features, width, height, bbox, noData]);
}
