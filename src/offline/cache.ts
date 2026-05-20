/**
 * Offline-aware fetch — intercepts API calls to serve from cache when offline.
 *
 * Strategy:
 * - Online: fetch from server, cache the response
 * - Offline: serve from IndexedDB cache
 * - Stale-while-revalidate: return cached immediately, refresh in background
 */

import { apiCache, type CachedResponse } from './db';
import { isOnline } from './network';

/** Default TTL for cached API responses (1 hour) */
const DEFAULT_TTL = 60 * 60 * 1000;

/** URLs that should never be cached */
const NO_CACHE_PATTERNS = ['/auth/', '/login', '/token', '/ws/'];

function shouldCache(url: string): boolean {
  return !NO_CACHE_PATTERNS.some((p) => url.includes(p));
}

/**
 * Fetch with offline support. Drop-in replacement for window.fetch
 * for GET requests to the backend API.
 */
export async function offlineFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method?.toUpperCase() || 'GET';

  // Only cache GET requests
  if (method !== 'GET' || !shouldCache(url)) {
    return fetch(input, init);
  }

  // If online, try network first (stale-while-revalidate)
  if (isOnline()) {
    try {
      const resp = await fetch(input, init);
      // Cache successful responses
      if (resp.ok) {
        const body = await resp.clone().text();
        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => (headers[k] = v));
        await apiCache.put({
          url,
          method,
          status: resp.status,
          headers,
          body,
          cachedAt: Date.now(),
          ttl: DEFAULT_TTL,
        });
      }
      return resp;
    } catch {
      // Network error — fall through to cache
    }
  }

  // Offline or network error — serve from cache
  const cached = await apiCache.get(url);
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: cached.headers,
    });
  }

  // Nothing cached — return an offline error response
  return new Response(
    JSON.stringify({ error: 'offline', message: 'No cached data available' }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Pre-cache a set of URLs for offline use (e.g. tile metadata, basemap config).
 * Call this when the user explicitly requests offline capability for an area.
 */
export async function precacheUrls(urls: string[]): Promise<{ cached: number; failed: number }> {
  let cached = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const body = await resp.text();
        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => (headers[k] = v));
        await apiCache.put({
          url,
          method: 'GET',
          status: resp.status,
          headers,
          body,
          cachedAt: Date.now(),
          ttl: 0, // Cache forever (pre-cached)
        });
        cached++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { cached, failed };
}

/**
 * Cache map tiles for a given bounding box and zoom range.
 * This downloads and stores tiles for offline map viewing.
 */
export async function cacheTilesForArea(
  tileUrlTemplate: string,
  bounds: { west: number; south: number; east: number; north: number },
  zoomRange: { min: number; max: number },
  onProgress?: (done: number, total: number) => void,
): Promise<{ cached: number; total: number }> {
  const { tileCache } = await import('./db');
  const tiles = getTilesInBounds(bounds, zoomRange);
  let cached = 0;

  for (let i = 0; i < tiles.length; i++) {
    const { z, x, y } = tiles[i];
    const url = tileUrlTemplate
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    const key = `${z}/${x}/${y}@${tileUrlTemplate}`;

    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.arrayBuffer();
        await tileCache.put({
          key,
          blob,
          contentType: resp.headers.get('content-type') || 'image/png',
          cachedAt: Date.now(),
        });
        cached++;
      }
    } catch {
      // Skip failed tiles
    }

    onProgress?.(i + 1, tiles.length);
  }

  return { cached, total: tiles.length };
}

/** Calculate tile coordinates for a bounding box at given zoom levels */
function getTilesInBounds(
  bounds: { west: number; south: number; east: number; north: number },
  zoomRange: { min: number; max: number },
): Array<{ z: number; x: number; y: number }> {
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  for (let z = zoomRange.min; z <= zoomRange.max; z++) {
    const n = 2 ** z;
    const xMin = Math.floor(((bounds.west + 180) / 360) * n);
    const xMax = Math.floor(((bounds.east + 180) / 360) * n);
    const yMin = Math.floor(
      ((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2) * n,
    );
    const yMax = Math.floor(
      ((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2) * n,
    );

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) });
      }
    }
  }

  return tiles;
}
