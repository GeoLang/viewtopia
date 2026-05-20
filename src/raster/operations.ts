/**
 * Raster operations — pure computation functions for raster analysis.
 * These run in the main thread or a Web Worker.
 */
import type {
  RasterResult,
  NdviParams,
  HillshadeParams,
  SlopeParams,
  AspectParams,
  BandMathParams,
  ReclassParams,
  ContourParams,
  ContourResult,
  ZonalStatsParams,
  ZonalResult,
} from './types';

/**
 * Compute NDVI: (NIR - Red) / (NIR + Red)
 */
export function computeNdvi(
  bands: Float32Array[],
  width: number,
  height: number,
  params: NdviParams,
  noData: number | null
): RasterResult {
  const nir = bands[params.nirBand];
  const red = bands[params.redBand];
  const result = new Float32Array(width * height);
  let min = Infinity, max = -Infinity;

  for (let i = 0; i < result.length; i++) {
    const n = nir[i];
    const r = red[i];
    if (noData !== null && (n === noData || r === noData)) {
      result[i] = NaN;
      continue;
    }
    const sum = n + r;
    const ndvi = sum === 0 ? 0 : (n - r) / sum;
    result[i] = ndvi;
    if (ndvi < min) min = ndvi;
    if (ndvi > max) max = ndvi;
  }

  return {
    operation: 'ndvi',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0], // Caller sets bbox
    range: [min, max],
    colorMap: 'rdylgn',
    stats: computeStats(result),
  };
}

/**
 * Compute hillshade from a DEM.
 */
export function computeHillshade(
  dem: Float32Array,
  width: number,
  height: number,
  params: HillshadeParams,
  cellSize: number,
  noData: number | null
): RasterResult {
  const { azimuth, altitude, zFactor } = params;
  const result = new Float32Array(width * height);

  const azRad = ((360 - azimuth + 90) * Math.PI) / 180;
  const altRad = (altitude * Math.PI) / 180;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // 3x3 window
      const a = dem[(y - 1) * width + (x - 1)];
      const b = dem[(y - 1) * width + x];
      const c = dem[(y - 1) * width + (x + 1)];
      const d = dem[y * width + (x - 1)];
      const f = dem[y * width + (x + 1)];
      const g = dem[(y + 1) * width + (x - 1)];
      const h = dem[(y + 1) * width + x];
      const ii = dem[(y + 1) * width + (x + 1)];

      if (noData !== null && (a === noData || b === noData || c === noData ||
        d === noData || f === noData || g === noData || h === noData || ii === noData)) {
        result[idx] = NaN;
        continue;
      }

      // Horn's method
      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cellSize) * zFactor;
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * cellSize) * zFactor;

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspectRad = Math.atan2(dzdy, -dzdx);

      let hs = Math.cos(altRad) * Math.cos(slopeRad) +
        Math.sin(altRad) * Math.sin(slopeRad) * Math.cos(azRad - aspectRad);
      hs = Math.max(0, Math.min(1, hs)) * 255;
      result[idx] = hs;
    }
  }

  // Edge pixels
  for (let x = 0; x < width; x++) {
    result[x] = result[width + x]; // Top row
    result[(height - 1) * width + x] = result[(height - 2) * width + x]; // Bottom
  }
  for (let y = 0; y < height; y++) {
    result[y * width] = result[y * width + 1]; // Left col
    result[y * width + width - 1] = result[y * width + width - 2]; // Right col
  }

  return {
    operation: 'hillshade',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [0, 255],
    colorMap: 'grays',
    stats: computeStats(result),
  };
}

/**
 * Compute slope from DEM.
 */
export function computeSlope(
  dem: Float32Array,
  width: number,
  height: number,
  params: SlopeParams,
  cellSize: number,
  noData: number | null
): RasterResult {
  const { units, zFactor } = params;
  const result = new Float32Array(width * height);
  let min = Infinity, max = -Infinity;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = dem[(y - 1) * width + (x - 1)];
      const b = dem[(y - 1) * width + x];
      const c = dem[(y - 1) * width + (x + 1)];
      const d = dem[y * width + (x - 1)];
      const f = dem[y * width + (x + 1)];
      const g = dem[(y + 1) * width + (x - 1)];
      const h = dem[(y + 1) * width + x];
      const ii = dem[(y + 1) * width + (x + 1)];

      if (noData !== null && (a === noData || b === noData || c === noData ||
        d === noData || f === noData || g === noData || h === noData || ii === noData)) {
        result[idx] = NaN;
        continue;
      }

      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cellSize) * zFactor;
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * cellSize) * zFactor;
      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));

      const value = units === 'degrees' ? (slopeRad * 180) / Math.PI : Math.tan(slopeRad) * 100;
      result[idx] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return {
    operation: 'slope',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [min, max],
    colorMap: 'inferno',
    stats: computeStats(result),
  };
}

/**
 * Compute aspect from DEM (degrees, 0=north, clockwise).
 */
export function computeAspect(
  dem: Float32Array,
  width: number,
  height: number,
  params: AspectParams,
  cellSize: number,
  noData: number | null
): RasterResult {
  const flatValue = params.flat ?? -1;
  const result = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = dem[(y - 1) * width + (x - 1)];
      const b = dem[(y - 1) * width + x];
      const c = dem[(y - 1) * width + (x + 1)];
      const d = dem[y * width + (x - 1)];
      const f = dem[y * width + (x + 1)];
      const g = dem[(y + 1) * width + (x - 1)];
      const h = dem[(y + 1) * width + x];
      const ii = dem[(y + 1) * width + (x + 1)];

      if (noData !== null && (a === noData || b === noData || c === noData ||
        d === noData || f === noData || g === noData || h === noData || ii === noData)) {
        result[idx] = NaN;
        continue;
      }

      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cellSize);
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * cellSize);

      if (dzdx === 0 && dzdy === 0) {
        result[idx] = flatValue;
      } else {
        let aspect = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
        if (aspect < 0) aspect += 360;
        // Convert to compass (0=north)
        aspect = (90 - aspect + 360) % 360;
        result[idx] = aspect;
      }
    }
  }

  return {
    operation: 'aspect',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [0, 360],
    colorMap: 'spectral',
    stats: computeStats(result),
  };
}

/**
 * Band math — evaluate an expression with band references (b1, b2, ...).
 */
export function computeBandMath(
  bands: Float32Array[],
  width: number,
  height: number,
  params: BandMathParams,
  noData: number | null
): RasterResult {
  const result = new Float32Array(width * height);
  let min = Infinity, max = -Infinity;

  // Build function from expression
  const bandNames = bands.map((_, i) => `b${i + 1}`);
  const fn = new Function(...bandNames, `"use strict"; return ${params.expression};`);

  for (let i = 0; i < result.length; i++) {
    const values = bands.map((b) => b[i]);
    if (noData !== null && values.some((v) => v === noData)) {
      result[i] = NaN;
      continue;
    }
    const value = fn(...values) as number;
    result[i] = value;
    if (!isNaN(value)) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return {
    operation: 'band-math',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [min, max],
    colorMap: 'viridis',
    stats: computeStats(result),
  };
}

/**
 * Reclassify raster values into discrete classes.
 */
export function computeReclass(
  data: Float32Array,
  width: number,
  height: number,
  params: ReclassParams,
  noData: number | null
): RasterResult {
  const result = new Float32Array(width * height);

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (noData !== null && v === noData) {
      result[i] = NaN;
      continue;
    }
    let classified = NaN;
    for (const cls of params.classes) {
      if (v >= cls.min && v < cls.max) {
        classified = cls.value;
        break;
      }
    }
    result[i] = classified;
  }

  return {
    operation: 'reclass',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [0, params.classes.length - 1],
    stats: computeStats(result),
  };
}

/**
 * Generate contour lines from a DEM using marching squares.
 */
export function computeContours(
  dem: Float32Array,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  params: ContourParams
): ContourResult {
  const { interval, base = 0 } = params;
  const features: GeoJSON.Feature[] = [];

  // Find elevation range
  let minElev = Infinity, maxElev = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    if (!isNaN(dem[i])) {
      if (dem[i] < minElev) minElev = dem[i];
      if (dem[i] > maxElev) maxElev = dem[i];
    }
  }

  // Generate contour levels
  const startLevel = Math.ceil((minElev - base) / interval) * interval + base;
  const [xmin, ymin, xmax, ymax] = bbox;
  const cellW = (xmax - xmin) / (width - 1);
  const cellH = (ymax - ymin) / (height - 1);

  for (let level = startLevel; level <= maxElev; level += interval) {
    const segments: [number, number][][] = [];

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        // Four corners of the cell
        const tl = dem[y * width + x];
        const tr = dem[y * width + x + 1];
        const bl = dem[(y + 1) * width + x];
        const br = dem[(y + 1) * width + x + 1];

        if (isNaN(tl) || isNaN(tr) || isNaN(bl) || isNaN(br)) continue;

        // Marching squares case
        const code =
          (tl >= level ? 8 : 0) |
          (tr >= level ? 4 : 0) |
          (br >= level ? 2 : 0) |
          (bl >= level ? 1 : 0);

        if (code === 0 || code === 15) continue;

        // Interpolate edge crossings
        const lerp = (v1: number, v2: number) => (v1 === v2) ? 0.5 : (level - v1) / (v2 - v1);

        const top: [number, number] = [xmin + (x + lerp(tl, tr)) * cellW, ymax - y * cellH];
        const bottom: [number, number] = [xmin + (x + lerp(bl, br)) * cellW, ymax - (y + 1) * cellH];
        const left: [number, number] = [xmin + x * cellW, ymax - (y + lerp(tl, bl)) * cellH];
        const right: [number, number] = [xmin + (x + 1) * cellW, ymax - (y + lerp(tr, br)) * cellH];

        // Generate line segments based on marching squares case
        const segs = marchingSquaresSegments(code, top, right, bottom, left);
        segments.push(...segs);
      }
    }

    // Convert segments to a feature
    if (segments.length > 0) {
      features.push({
        type: 'Feature',
        properties: { elevation: level },
        geometry: {
          type: 'MultiLineString',
          coordinates: segments,
        },
      });
    }
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    interval,
    elevationRange: [minElev, maxElev],
  };
}

/** Marching squares — returns line segments for a given case */
function marchingSquaresSegments(
  code: number,
  top: [number, number],
  right: [number, number],
  bottom: [number, number],
  left: [number, number]
): [number, number][][] {
  switch (code) {
    case 1: return [[left, bottom]];
    case 2: return [[bottom, right]];
    case 3: return [[left, right]];
    case 4: return [[top, right]];
    case 5: return [[top, left], [bottom, right]]; // Saddle
    case 6: return [[top, bottom]];
    case 7: return [[top, left]];
    case 8: return [[top, left]];
    case 9: return [[top, bottom]];
    case 10: return [[top, right], [left, bottom]]; // Saddle
    case 11: return [[top, right]];
    case 12: return [[left, right]];
    case 13: return [[bottom, right]];
    case 14: return [[left, bottom]];
    default: return [];
  }
}

/**
 * Compute basic statistics for a Float32Array.
 */
function computeStats(data: Float32Array): { min: number; max: number; mean: number; std: number } {
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
    count++;
  }
  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? sumSq / count - mean * mean : 0;
  return { min, max, mean, std: Math.sqrt(Math.max(0, variance)) };
}
