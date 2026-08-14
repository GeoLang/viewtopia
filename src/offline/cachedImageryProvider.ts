import { UrlTemplateImageryProvider, type ImageryTypes, type Request } from 'cesium';
import { loadTile } from './cache';

/**
 * Cesium's raster imagery read through the offline tile cache, the same store
 * and the same keys the cached:// scheme serves MapLibre from.
 *
 * Only requestImage changes: the tiling scheme, level limits and credit stay
 * whatever UrlTemplateImageryProvider makes of the same options.
 */
export class CachedImageryProvider extends UrlTemplateImageryProvider {
  private readonly tileUrlTemplate: string;

  constructor(options: { url: string; maximumLevel?: number; credit?: string }) {
    super(options);
    this.tileUrlTemplate = options.url;
  }

  requestImage(
    x: number,
    y: number,
    level: number,
    _request?: Request,
  ): Promise<ImageryTypes> | undefined {
    return cachedTileImage(this.tileUrlTemplate, level, x, y);
  }
}

async function cachedTileImage(
  tileUrlTemplate: string,
  z: number,
  x: number,
  y: number,
): Promise<ImageBitmap> {
  const { bytes, contentType } = await loadTile(tileUrlTemplate, z, x, y);
  // ImageryProvider.loadImage fetches with flipY, so decoding any other way
  // renders the tile upside down on the globe
  return createImageBitmap(new Blob([bytes], { type: contentType }), {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'default',
  });
}
