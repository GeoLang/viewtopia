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
import type {
  ContourResult,
  FocalStat,
  Neighborhood,
  PolygonizeResult,
  RasterMetadata,
  RasterResult,
  ZonalResult,
} from './types';

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

/** (a - b) / (a + b), the shape every normalized-difference index shares. */
export function terranoNormalizedDifference(
  a: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
  noData: number | null,
  operation: RasterResult['operation'],
  colorMap: string,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const out = wasm.normalizedDifference(toF64(a), toF64(b), width, height, 1.0, nodata);
  return result(operation, toF32(out, nodata), width, height, colorMap);
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
  // the range comes from the assigned class values, which are arbitrary
  return result('reclass', toF32(out, nodata), width, height, 'viridis');
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

/**
 * A continuous raster has a distinct value in nearly every cell, and
 * polygonizing that returns one square per cell, which is a million features
 * on a full-size read. Reclass first.
 */
const MAX_DISTINCT_VALUES = 256;

function distinctValuesWithin(data: Float32Array, cap: number): boolean {
  const seen = new Set<number>();
  for (const v of data) {
    if (Number.isNaN(v)) continue;
    seen.add(v);
    if (seen.size > cap) return false;
  }
  return true;
}

/**
 * Regions as GeoJSON polygons. terrano returns [value, ring_count, then per
 * ring (vertex_count, x, y, ...)] with the exterior ring first, in cell-corner
 * units (cell_size 1), so the raster spans `width` cells rather than the
 * width-1 centre spacing contours work in.
 */
export function terranoPolygonize(
  data: Float32Array,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  noData: number | null,
): PolygonizeResult {
  if (!distinctValuesWithin(data, MAX_DISTINCT_VALUES)) {
    throw new Error(
      `polygonize needs a classified raster (at most ${MAX_DISTINCT_VALUES} distinct values); reclass it first`,
    );
  }
  const nodata = noData ?? NO_NODATA;
  const flat = wasm.polygonize(toF64(data), width, height, 1.0, nodata);
  const [xmin, ymin, xmax, ymax] = bbox;
  const cellW = (xmax - xmin) / width;
  const cellH = (ymax - ymin) / height;

  const features: GeoJSON.Feature[] = [];
  let i = 0;
  while (i < flat.length) {
    const value = flat[i];
    const ringCount = flat[i + 1];
    i += 2;
    const rings: [number, number][][] = [];
    for (let r = 0; r < ringCount; r++) {
      const n = flat[i];
      const ring: [number, number][] = [];
      // flipping y to north-up reverses winding, so each ring reads backwards
      // to land on the GeoJSON convention: exterior CCW, holes CW
      for (let v = n - 1; v >= 0; v--) {
        ring.push([xmin + flat[i + 1 + v * 2] * cellW, ymax - flat[i + 2 + v * 2] * cellH]);
      }
      rings.push(ring);
      i += 1 + n * 2;
    }
    features.push({
      type: 'Feature',
      properties: { value },
      geometry: { type: 'Polygon', coordinates: rings },
    });
  }

  return { geojson: { type: 'FeatureCollection', features }, regions: features.length };
}

export function terranoFocalStats(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  shape: Neighborhood,
  stat: FocalStat,
  noData: number | null,
): RasterResult {
  const nodata = noData ?? NO_NODATA;
  const out = wasm.focalStats(toF64(data), width, height, nodata, radius, shape, stat);
  return result('focal', toF32(out, nodata), width, height, 'viridis');
}

function decodeZoneRows(flat: Float64Array): ZonalResult[] {
  const rows: ZonalResult[] = [];
  // [zone, count, min, max, mean, sum, std, median] per zone
  for (let i = 0; i + 7 < flat.length; i += 8) {
    rows.push({
      zoneId: flat[i],
      count: flat[i + 1],
      min: flat[i + 2],
      max: flat[i + 3],
      mean: flat[i + 4],
      sum: flat[i + 5],
      std: flat[i + 6],
      median: flat[i + 7],
    });
  }
  return rows;
}

/** Summarize `values` per zone, both grids sharing one shape. */
export function terranoZonalStats(
  values: Float32Array,
  zones: Float32Array,
  width: number,
  height: number,
  noData: number | null,
): ZonalResult[] {
  const nodata = noData ?? NO_NODATA;
  return decodeZoneRows(wasm.zonalStats(toF64(values), toF64(zones), width, height, 1.0, nodata));
}

/**
 * Polygons in the flat encoding terrano reads, one entry per Polygon and one
 * per member of a MultiPolygon. A feature's zone label is its 1-based position
 * in the collection, so a non-polygon feature still consumes a label and the
 * rows line up with the layer's features.
 */
function encodePolygons(features: GeoJSON.Feature[]): Float64Array {
  const flat: number[] = [];
  features.forEach((feature, i) => {
    const geometry = feature.geometry;
    const polygons: GeoJSON.Position[][][] =
      geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
    for (const rings of polygons) {
      flat.push(i + 1, rings.length);
      for (const ring of rings) {
        // terrano walks ring edges pairwise, so an unclosed ring would leak
        const closed =
          ring.length > 0 &&
          (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
            ? [...ring, ring[0]]
            : ring;
        flat.push(closed.length);
        for (const [x, y] of closed) flat.push(x, y);
      }
    }
  });
  return Float64Array.from(flat);
}

/**
 * Zonal stats over polygon zones: the features burn onto the raster's own grid
 * first, so a zone is whichever cells its outline covers.
 */
export function terranoZonalStatsByPolygons(
  values: Float32Array,
  features: GeoJSON.Feature[],
  width: number,
  height: number,
  bbox: [number, number, number, number],
  noData: number | null,
): ZonalResult[] {
  const nodata = noData ?? NO_NODATA;
  const zones = wasm.rasterize(
    encodePolygons(features),
    width,
    height,
    Float64Array.from(bbox),
    1.0,
    nodata,
  );
  return decodeZoneRows(wasm.zonalStats(toF64(values), zones, width, height, 1.0, nodata));
}
