/**
 * Raster ops backed by terrano-core compiled to WASM (src/raster/wasm/), the
 * same engine tiletopia runs server-side, so a browser result and a served
 * tile disagree only by resolution. The wasm module must be initialized
 * before any call: the worker does it with the bundled .wasm URL, tests with
 * initSync over the file bytes.
 *
 * Buffers cross the boundary as f64 and come back with every nodata cell
 * mapped to NaN, which is what the renderer treats as transparent.
 */
import * as wasm from './wasm/terrano_wasm';
import { computeStats } from './operations';
import type { ContourResult, RasterMetadata, RasterResult } from './types';

/**
 * Ground cell size for gradient ops. Geographic rasters carry degrees in
 * their resolution, and a gradient over degree spacing reads a hundred
 * thousand times too steep, so degrees convert at the raster's center
 * latitude.
 */
export function cellSizeMeters(metadata: RasterMetadata): number {
  const res = metadata.resolution[0];
  if (metadata.crs !== 'EPSG:4326') return res;
  const centerLat = (metadata.bbox[1] + metadata.bbox[3]) / 2;
  return res * 111320 * Math.cos((centerLat * Math.PI) / 180);
}

function toF64(data: Float32Array): Float64Array {
  return Float64Array.from(data);
}

function toF32(data: Float64Array, nodata: number): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    out[i] = v === nodata || Number.isNaN(v) ? NaN : v;
  }
  return out;
}

function result(
  operation: RasterResult['operation'],
  data: Float32Array,
  width: number,
  height: number,
  colorMap: string,
  range?: [number, number],
): RasterResult {
  const stats = computeStats(data);
  return {
    operation,
    data,
    width,
    height,
    bbox: [0, 0, 0, 0], // caller sets the geo frame
    range: range ?? [stats.min, stats.max],
    colorMap,
    stats,
  };
}

// terrano treats NaN as nodata regardless, so a raster without a declared
// nodata value still masks correctly
const NO_NODATA = Number.NaN;

export function terranoNdvi(
  nir: Float32Array,
  red: Float32Array,
  width: number,
  height: number,
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const out = wasm.normalizedDifference(toF64(nir), toF64(red), width, height, 1.0, nodata);
  return result('ndvi', toF32(out, nodata), width, height, 'rdylgn');
}

export function terranoHillshade(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  zFactor: number,
  azimuth: number,
  altitude: number,
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  // z-factor scales elevation, and dz/(8*cs/zf) == (dz*zf)/(8*cs), so it
  // rides in as a smaller cell instead of a pass over the buffer
  const cell = cellSize / (zFactor > 0 ? zFactor : 1);
  const out = wasm.hillshade(toF64(dem), width, height, cell, nodata, azimuth, altitude);
  return result('hillshade', toF32(out, nodata), width, height, 'grays', [0, 255]);
}

export function terranoSlope(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  zFactor: number,
  units: 'degrees' | 'percent',
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const cell = cellSize / (zFactor > 0 ? zFactor : 1);
  const out = toF32(wasm.slope(toF64(dem), width, height, cell, nodata), nodata);
  if (units === 'percent') {
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.tan((out[i] * Math.PI) / 180) * 100;
    }
  }
  return result('slope', out, width, height, 'inferno');
}

export function terranoAspect(
  dem: Float32Array,
  width: number,
  height: number,
  cellSize: number,
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const out = wasm.aspect(toF64(dem), width, height, cellSize, nodata);
  return result('aspect', toF32(out, nodata), width, height, 'spectral', [0, 360]);
}

export function terranoReclass(
  data: Float32Array,
  width: number,
  height: number,
  classes: { min: number; max: number; value: number }[],
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const flat = new Float64Array(classes.length * 3);
  classes.forEach((c, i) => {
    flat[i * 3] = c.min;
    flat[i * 3 + 1] = c.max;
    flat[i * 3 + 2] = c.value;
  });
  const out = wasm.reclassify(toF64(data), width, height, 1.0, nodata, flat);
  return result('reclass', toF32(out, nodata), width, height, 'viridis', [
    0,
    Math.max(0, classes.length - 1),
  ]);
}

/**
 * Contours as GeoJSON. terrano returns connected polylines flat-encoded as
 * [level, vertex_count, x, y, ...] in cell units (cell_size 1), mapped here
 * onto the raster's bbox, one LineString feature per line.
 */
export function terranoContours(
  dem: Float32Array,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  interval: number,
  base: number,
  noData: number | null,
): ContourResult {
  const nodata = noData ?? NO_NODATA;
  const flat = wasm.contours(toF64(dem), width, height, 1.0, nodata, interval, base);
  const [xmin, ymin, xmax, ymax] = bbox;
  const cellW = (xmax - xmin) / (width - 1);
  const cellH = (ymax - ymin) / (height - 1);

  const features: GeoJSON.Feature[] = [];
  let i = 0;
  while (i < flat.length) {
    const level = flat[i];
    const n = flat[i + 1];
    const coords: [number, number][] = [];
    for (let v = 0; v < n; v++) {
      const x = flat[i + 2 + v * 2];
      const y = flat[i + 3 + v * 2];
      coords.push([xmin + x * cellW, ymax - y * cellH]);
    }
    features.push({
      type: 'Feature',
      properties: { elevation: level },
      geometry: { type: 'LineString', coordinates: coords },
    });
    i += 2 + n * 2;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const v of dem) {
    if (Number.isNaN(v) || v === nodata) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    interval,
    elevationRange: [min, max],
  };
}
