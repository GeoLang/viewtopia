/**
 * COG (Cloud Optimized GeoTIFF) loader — reads raster data from URLs or files.
 */
import { fromUrl, fromArrayBuffer, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import type { RasterMetadata } from './types';

/** Loaded raster with bands and metadata */
export interface LoadedRaster {
  metadata: RasterMetadata;
  bands: Float32Array[];
  image: GeoTIFFImage;
}

/**
 * Load a COG from a URL (supports HTTP range requests for efficient access).
 */
export async function loadCogFromUrl(url: string, options?: {
  /** Specific bands to load (0-indexed). If omitted, loads all. */
  bands?: number[];
  /** Subsample window [x, y, width, height] in pixels */
  window?: [number, number, number, number];
  /** Max dimension for auto-downsampling */
  maxDimension?: number;
}): Promise<LoadedRaster> {
  const tiff = await fromUrl(url);
  return loadFromTiff(tiff, options);
}

/**
 * Load a GeoTIFF from an ArrayBuffer (e.g. from a File input).
 */
export async function loadCogFromBuffer(buffer: ArrayBuffer, options?: {
  bands?: number[];
  window?: [number, number, number, number];
  maxDimension?: number;
}): Promise<LoadedRaster> {
  const tiff = await fromArrayBuffer(buffer);
  return loadFromTiff(tiff, options);
}

async function loadFromTiff(tiff: GeoTIFF, options?: {
  bands?: number[];
  window?: [number, number, number, number];
  maxDimension?: number;
}): Promise<LoadedRaster> {
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const numBands = image.getSamplesPerPixel();
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const resolution = image.getResolution() as [number, number];

  // Determine read window and output size
  let readWidth = width;
  let readHeight = height;

  if (options?.maxDimension && (width > options.maxDimension || height > options.maxDimension)) {
    const scale = options.maxDimension / Math.max(width, height);
    readWidth = Math.round(width * scale);
    readHeight = Math.round(height * scale);
  }

  // Read raster data
  const bandIndices = options?.bands ?? Array.from({ length: numBands }, (_, i) => i);
  const rasterData = await image.readRasters({
    window: options?.window,
    width: readWidth,
    height: readHeight,
    samples: bandIndices,
  });

  const bands: Float32Array[] = [];
  for (let i = 0; i < bandIndices.length; i++) {
    const bandData = rasterData[i] as ArrayLike<number>;
    bands.push(new Float32Array(bandData));
  }

  // Get noData value
  const fileDir = image.getFileDirectory() as unknown as Record<string, unknown>;
  const noDataRaw = fileDir['GDAL_NODATA'];
  const noData = noDataRaw != null ? parseFloat(String(noDataRaw)) : null;

  // CRS info
  const geoKeys = image.getGeoKeys();
  const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey || 4326;

  const metadata: RasterMetadata = {
    width: readWidth,
    height: readHeight,
    bands: bandIndices.length,
    bbox,
    crs: `EPSG:${epsg}`,
    noData,
    resolution: [Math.abs(resolution[0]), Math.abs(resolution[1])],
    bandLabels: bandIndices.map((i) => `Band ${i + 1}`),
  };

  return { metadata, bands, image };
}

/**
 * Read a specific overview level (for efficient preview).
 */
export async function loadCogOverview(url: string, overviewLevel: number): Promise<LoadedRaster> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage(overviewLevel);
  const width = image.getWidth();
  const height = image.getHeight();
  const numBands = image.getSamplesPerPixel();
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const resolution = image.getResolution() as [number, number];

  const rasterData = await image.readRasters();
  const bands: Float32Array[] = [];
  for (let i = 0; i < numBands; i++) {
    bands.push(new Float32Array(rasterData[i] as ArrayLike<number>));
  }

  const fileDir2 = image.getFileDirectory() as unknown as Record<string, unknown>;
  const noDataRaw = fileDir2['GDAL_NODATA'];
  const noData = noDataRaw != null ? parseFloat(String(noDataRaw)) : null;
  const geoKeys = image.getGeoKeys();
  const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey || 4326;

  return {
    metadata: {
      width, height, bands: numBands, bbox,
      crs: `EPSG:${epsg}`, noData,
      resolution: [Math.abs(resolution[0]), Math.abs(resolution[1])],
    },
    bands,
    image,
  };
}

/**
 * Get all overview levels available in a COG.
 */
export async function getCogOverviews(url: string): Promise<{ level: number; width: number; height: number }[]> {
  const tiff = await fromUrl(url);
  const count = await tiff.getImageCount();
  const overviews: { level: number; width: number; height: number }[] = [];

  for (let i = 0; i < count; i++) {
    const img = await tiff.getImage(i);
    overviews.push({ level: i, width: img.getWidth(), height: img.getHeight() });
  }

  return overviews;
}
