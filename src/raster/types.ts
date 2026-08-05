/**
 * Raster Analysis types.
 */

/** Supported raster operations */
export type RasterOperation =
  | 'ndvi'
  | 'ndwi'
  | 'evi'
  | 'hillshade'
  | 'slope'
  | 'aspect'
  | 'band-math'
  | 'classification'
  | 'contours'
  | 'zonal-stats'
  | 'reclass';

/** Band reference (0-indexed) */
export interface BandRef {
  band: number;
  label?: string;
}

/** Raster dataset metadata */
export interface RasterMetadata {
  width: number;
  height: number;
  bands: number;
  bbox: [number, number, number, number];
  crs: string;
  noData: number | null;
  resolution: [number, number];
  bandLabels?: string[];
}

/** Parameters for NDVI computation */
export interface NdviParams {
  nirBand: number; // Near-infrared band index
  redBand: number; // Red band index
}

/** Parameters for hillshade */
export interface HillshadeParams {
  azimuth: number;    // Sun azimuth (degrees, 0=north, clockwise)
  altitude: number;   // Sun altitude (degrees above horizon)
  zFactor: number;    // Vertical exaggeration
}

/** Parameters for slope computation */
export interface SlopeParams {
  units: 'degrees' | 'percent';
  zFactor: number;
}

/** Parameters for aspect */
export interface AspectParams {
  flat?: number; // Value for flat areas (default: -1)
}

/** Parameters for band math (raster calculator) */
export interface BandMathParams {
  /** Expression using b1, b2, b3... for bands, e.g. "(b4 - b3) / (b4 + b3)" */
  expression: string;
  /** what to label the result as, for an index preset built on an expression */
  operation?: RasterOperation;
  colorMap?: ColorRamp;
}

/** Classification class definition */
export interface ClassDef {
  min: number;
  max: number;
  value: number;
  label: string;
  color: string;
}

/** Parameters for reclassification */
export interface ReclassParams {
  classes: ClassDef[];
}

/** Parameters for zonal statistics */
export interface ZonalStatsParams {
  zones: GeoJSON.FeatureCollection;
  stats: ('min' | 'max' | 'mean' | 'sum' | 'std' | 'count' | 'median')[];
}

/** Contour generation parameters */
export interface ContourParams {
  interval: number;  // Contour interval
  base?: number;     // Base contour value
  smoothing?: number; // Smoothing factor (0-1)
}

/** Result of a raster analysis operation */
export interface RasterResult {
  /** Operation that produced this result */
  operation: RasterOperation;
  /** Result data (Float32Array for single-band output) */
  data: Float32Array;
  /** Width of result */
  width: number;
  /** Height of result */
  height: number;
  /** Bounding box */
  bbox: [number, number, number, number];
  /** Value range [min, max] */
  range: [number, number];
  /** Color map for visualization (optional) */
  colorMap?: string;
  /** Statistics */
  stats?: { min: number; max: number; mean: number; std: number };
}

/** Zonal statistics result per zone */
export interface ZonalResult {
  zoneId: string | number;
  min: number;
  max: number;
  mean: number;
  sum: number;
  std: number;
  count: number;
  median: number;
}

/** Contour result */
export interface ContourResult {
  geojson: GeoJSON.FeatureCollection;
  interval: number;
  elevationRange: [number, number];
}

/** Polygonize result: one Polygon feature per region, its cell value in `value` */
export interface PolygonizeResult {
  geojson: GeoJSON.FeatureCollection;
  regions: number;
}

/** Color ramp for visualization */
export type ColorRamp = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'terrain' | 'rdylgn' | 'spectral' | 'greens' | 'reds' | 'blues' | 'grays';
