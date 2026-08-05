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
  PolygonizeResult,
  ZonalStatsParams,
  ZonalResult,
  ClassDef,
} from './types';

export { loadCogFromUrl, loadCogFromBuffer, loadCogOverview, getCogOverviews } from './loader';
export type { LoadedRaster } from './loader';

export { computeBandMath, computeStats } from './operations';
export {
  cellSizeMeters,
  terranoAspect,
  terranoContours,
  terranoHillshade,
  terranoNormalizedDifference,
  terranoPolygonize,
  terranoReclass,
  terranoSlope,
} from './terrano';
export * as rasterEngine from './engine';

export { renderToImageData, renderToDataUrl, sampleRamp, generateLegend } from './renderer';

export { RasterPanel } from './RasterPanel';
