/**
 * Raster renderer — converts analysis results to visual images.
 */
import type { ColorRamp, RasterResult } from './types';

/** Color as [r, g, b, a] 0-255 */
type RGBA = [number, number, number, number];

/** Color ramp definitions (5 stops each) */
const RAMPS: Record<ColorRamp, RGBA[]> = {
  viridis: [[68, 1, 84, 255], [59, 82, 139, 255], [33, 145, 140, 255], [94, 201, 98, 255], [253, 231, 37, 255]],
  magma: [[0, 0, 4, 255], [81, 18, 124, 255], [183, 55, 121, 255], [254, 136, 74, 255], [252, 253, 191, 255]],
  inferno: [[0, 0, 4, 255], [87, 16, 110, 255], [188, 55, 84, 255], [249, 142, 9, 255], [252, 255, 164, 255]],
  plasma: [[13, 8, 135, 255], [126, 3, 168, 255], [204, 71, 120, 255], [248, 149, 64, 255], [240, 249, 33, 255]],
  terrain: [[51, 128, 0, 255], [102, 178, 51, 255], [204, 204, 102, 255], [153, 102, 51, 255], [255, 255, 255, 255]],
  rdylgn: [[215, 48, 39, 255], [253, 174, 97, 255], [255, 255, 191, 255], [166, 217, 106, 255], [26, 152, 80, 255]],
  spectral: [[158, 1, 66, 255], [252, 141, 89, 255], [255, 255, 191, 255], [145, 207, 96, 255], [94, 79, 162, 255]],
  greens: [[247, 252, 245, 255], [199, 233, 192, 255], [116, 196, 118, 255], [35, 139, 69, 255], [0, 68, 27, 255]],
  reds: [[255, 245, 240, 255], [252, 174, 145, 255], [251, 106, 74, 255], [203, 24, 29, 255], [103, 0, 13, 255]],
  blues: [[247, 251, 255, 255], [198, 219, 239, 255], [107, 174, 214, 255], [33, 113, 181, 255], [8, 48, 107, 255]],
  grays: [[0, 0, 0, 255], [64, 64, 64, 255], [128, 128, 128, 255], [192, 192, 192, 255], [255, 255, 255, 255]],
};

/** Interpolate between two colors */
function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

/** Get color from ramp at position t (0-1) */
export function sampleRamp(ramp: ColorRamp, t: number): RGBA {
  const stops = RAMPS[ramp];
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (stops.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.min(lower + 1, stops.length - 1);
  const frac = idx - lower;
  return lerpColor(stops[lower], stops[upper], frac);
}

/**
 * Render a RasterResult to an ImageData (for canvas display).
 */
export function renderToImageData(
  result: RasterResult,
  options?: {
    ramp?: ColorRamp;
    min?: number;
    max?: number;
    opacity?: number;
    noDataColor?: RGBA;
  }
): ImageData {
  const ramp = options?.ramp ?? (result.colorMap as ColorRamp) ?? 'viridis';
  const min = options?.min ?? result.range[0];
  const max = options?.max ?? result.range[1];
  const opacity = options?.opacity ?? 1;
  const noDataColor: RGBA = options?.noDataColor ?? [0, 0, 0, 0];

  const { data, width, height } = result;
  const imageData = new ImageData(width, height);
  const pixels = imageData.data;
  const range = max - min || 1;

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const pixIdx = i * 4;

    if (isNaN(v)) {
      pixels[pixIdx] = noDataColor[0];
      pixels[pixIdx + 1] = noDataColor[1];
      pixels[pixIdx + 2] = noDataColor[2];
      pixels[pixIdx + 3] = noDataColor[3];
      continue;
    }

    const t = (v - min) / range;
    const color = sampleRamp(ramp, t);
    pixels[pixIdx] = color[0];
    pixels[pixIdx + 1] = color[1];
    pixels[pixIdx + 2] = color[2];
    pixels[pixIdx + 3] = Math.round(color[3] * opacity);
  }

  return imageData;
}

/**
 * Render to a data URL (PNG) for use as map overlay.
 */
export function renderToDataUrl(
  result: RasterResult,
  options?: {
    ramp?: ColorRamp;
    min?: number;
    max?: number;
    opacity?: number;
  }
): string {
  const imageData = renderToImageData(result, options);
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Generate a legend for a color ramp.
 */
export function generateLegend(
  ramp: ColorRamp,
  min: number,
  max: number,
  steps: number = 5
): { value: number; color: string }[] {
  const legend: { value: number; color: string }[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const value = min + t * (max - min);
    const [r, g, b] = sampleRamp(ramp, t);
    legend.push({ value, color: `rgb(${r},${g},${b})` });
  }
  return legend;
}
