/**
 * Spectral index presets. Every normalized-difference index is the same wasm
 * call with different bands, so only the ones with another shape carry an
 * expression, and those run through band math where user expressions already
 * evaluate.
 */
import type { ColorRamp, RasterOperation } from './types';

export interface IndexPreset {
  operation: RasterOperation;
  label: string;
  /** band roles the user picks, in the order the formula consumes them */
  roles: string[];
  /** 0-indexed band defaults, matching a Landsat 8 / Sentinel-2 style stack */
  defaults: number[];
  ramp: ColorRamp;
  /** built from the picked 1-indexed band numbers; absent means (a-b)/(a+b) */
  expression?: (bands: number[]) => string;
  hint?: string;
}

export const INDEX_PRESETS: Record<string, IndexPreset> = {
  ndvi: {
    operation: 'ndvi',
    label: 'NDVI (vegetation)',
    roles: ['NIR', 'Red'],
    defaults: [3, 2],
    ramp: 'rdylgn',
  },
  ndwi: {
    operation: 'ndwi',
    label: 'NDWI (water)',
    roles: ['Green', 'NIR'],
    defaults: [1, 3],
    ramp: 'blues',
  },
  evi: {
    operation: 'evi',
    label: 'EVI (vegetation, soil/aerosol corrected)',
    roles: ['NIR', 'Red', 'Blue'],
    defaults: [3, 2, 0],
    ramp: 'greens',
    expression: ([nir, red, blue]) =>
      `2.5 * (b${nir} - b${red}) / (b${nir} + 6 * b${red} - 7.5 * b${blue} + 1)`,
    hint: 'EVI assumes reflectance scaled 0–1, not raw DN.',
  },
};
