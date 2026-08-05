/**
 * The two raster helpers that stay in JS. Everything neighborhood- or
 * class-shaped (hillshade, slope, aspect, ndvi, contours, reclass) runs in
 * terrano-core via wasm (terrano.ts / engine.ts), so browser and server
 * results come from one engine. Band math stays here because it evaluates a
 * user-typed expression, which the wasm surface deliberately has no parser
 * for.
 */
import type { BandMathParams, RasterResult } from './types';

/**
 * Band math — evaluate an expression with band references (b1, b2, ...).
 */
export function computeBandMath(
  bands: Float32Array[],
  width: number,
  height: number,
  params: BandMathParams,
  noData: number | null,
): RasterResult {
  const result = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;

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
    if (!Number.isNaN(value)) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return {
    operation: params.operation ?? 'band-math',
    data: result,
    width,
    height,
    bbox: [0, 0, 0, 0],
    range: [min, max],
    colorMap: params.colorMap ?? 'viridis',
    stats: computeStats(result),
  };
}

/**
 * Compute basic statistics for a Float32Array.
 */
export function computeStats(data: Float32Array): {
  min: number;
  max: number;
  mean: number;
  std: number;
} {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v)) continue;
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
