import maplibregl from 'maplibre-gl';
import { tileCache } from './db';

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
  const template = decodeURIComponent(encoded);
  const key = `${z}/${x}/${y}@${template}`;

  if (navigator.onLine) {
    try {
      const networkUrl = template
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y);
      const resp = await fetch(networkUrl, { signal: abortController.signal });
      if (resp.ok) return { data: await resp.arrayBuffer() };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
    }
  }

  const hit = await tileCache.get(key);
  if (hit) return { data: hit.blob };
  throw new Error(`tile not cached: ${key}`);
}
