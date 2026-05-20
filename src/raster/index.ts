/**
 * Raster Analysis module — barrel export.
 */

export type {
  RasterOperation,
  RasterMetadata,
  RasterResult,
  ColorRamp,
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
  ClassDef,
} from './types';

export { loadCogFromUrl, loadCogFromBuffer, loadCogOverview, getCogOverviews } from './loader';
export type { LoadedRaster } from './loader';

export {
  computeNdvi,
  computeHillshade,
  computeSlope,
  computeAspect,
  computeBandMath,
  computeReclass,
  computeContours,
} from './operations';

export { renderToImageData, renderToDataUrl, sampleRamp, generateLegend } from './renderer';

export { RasterPanel } from './RasterPanel';
