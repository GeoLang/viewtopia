import maplibregl from 'maplibre-gl';
import { loadTile } from './cache';

/**
 * cached:// tile scheme: network first while online, IndexedDB tile cache as
 * the fallback, so regions downloaded in the Offline panel keep rendering when
 * the network is gone. The template rides along percent-encoded because the
 * key format is z/x/y@template and the concrete URL alone cannot recover it.
 */

let registered = false;

/** Register once per page, like the pmtiles protocol. */
export function registerCachedTileProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('cached', loadCachedTile);
}

/** Style URL for a raster template, keeping {z}/{x}/{y} for MapLibre to fill. */
export function cachedTileUrl(template: string): string {
  return `cached://{z}/{x}/{y}?t=${encodeURIComponent(template)}`;
}

export async function loadCachedTile(
  params: { url: string },
  abortController: AbortController,
): Promise<{ data: ArrayBuffer }> {
  const match = params.url.match(/^cached:\/\/(\d+)\/(\d+)\/(\d+)\?t=(.+)$/);
  if (!match) throw new Error(`bad cached tile url: ${params.url}`);
  const [, z, x, y, encoded] = match;

  const tile = await loadTile(
    decodeURIComponent(encoded),
    Number(z),
    Number(x),
    Number(y),
    abortController.signal,
  );
  return { data: tile.bytes };
}
