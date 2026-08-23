/**
 * Offline-aware fetch — intercepts API calls to serve from cache when offline.
 *
 * Strategy:
 * - Online: fetch from server, cache the response
 * - Offline: serve from IndexedDB cache
 * - Stale-while-revalidate: return cached immediately, refresh in background
 */

import { apiCache, cachedRegions, tileCache } from './db';
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
  options?: { ttl?: number },
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method?.toUpperCase() || 'GET';

  // Only cache GET requests
  if (method !== 'GET' || !shouldCache(url)) {
    return fetch(input, init);
  }

  // If online, try network first (stale-while-revalidate)
  if (isOnline()) {
    let resp: Response | null = null;
    try {
      resp = await fetch(input, init);
    } catch {
      // Network error — fall through to cache
    }
    if (resp) {
      if (resp.ok) {
        try {
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
            ttl: options?.ttl ?? DEFAULT_TTL,
          });
        } catch {
          // a failed cache write must not lose the response
        }
      }
      return resp;
    }
  }

  // Offline or network error — serve from cache
  let cached: Awaited<ReturnType<typeof apiCache.get>>;
  try {
    cached = await apiCache.get(url);
  } catch {
    // no usable cache (e.g. storage blocked) reads the same as a miss
  }
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

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ZoomRange {
  min: number;
  max: number;
}

/** How many tiles an area covers, for sizing a download before starting it. */
export function countTilesForArea(bounds: TileBounds, zoomRange: ZoomRange): number {
  return getTilesInBounds(bounds, zoomRange).length;
}

/**
 * The one cache key for a tile. Every renderer has to build it the same way or
 * a tile MapLibre stored is a tile Cesium and Leaflet never find, so the
 * coordinates stay in z/x/y order here whatever order the template writes them.
 */
export function tileCacheKey(
  tileUrlTemplate: string,
  z: number,
  x: number,
  y: number,
): string {
  return `${z}/${x}/${y}@${tileUrlTemplate}`;
}

export function tileUrlFromTemplate(
  tileUrlTemplate: string,
  z: number,
  x: number,
  y: number,
): string {
  return tileUrlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

const DEFAULT_TILE_CONTENT_TYPE = 'image/png';

export interface TileBytes {
  bytes: ArrayBuffer;
  contentType: string;
}

/**
 * Read one raster tile: network while online, the offline tile cache when the
 * network is gone or refuses. Every renderer goes through here, so a tile any
 * of them fetched is a tile all of them can serve offline.
 */
export async function loadTile(
  tileUrlTemplate: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<TileBytes> {
  const key = tileCacheKey(tileUrlTemplate, z, x, y);

  if (isOnline()) {
    try {
      const resp = await fetch(tileUrlFromTemplate(tileUrlTemplate, z, x, y), { signal });
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        const contentType = resp.headers.get('content-type') || DEFAULT_TILE_CONTENT_TYPE;
        // a store that is full or blocked must not blank the tile it just fetched
        await tileCache
          .put({ key, blob: bytes, contentType, cachedAt: Date.now() })
          .then(() => noteTileWritten(bytes.byteLength))
          .catch(() => {});
        return { bytes, contentType };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
    }
  }

  const hit = await tileCache.get(key);
  if (hit) return { bytes: hit.blob, contentType: hit.contentType };
  throw new Error(`tile not cached: ${key}`);
}

/**
 * Cache map tiles for a given bounding box and zoom range.
 * This downloads and stores tiles for offline map viewing.
 */
export async function cacheTilesForArea(
  tileUrlTemplate: string,
  bounds: TileBounds,
  zoomRange: ZoomRange,
  onProgress?: (done: number, total: number) => void,
): Promise<{ cached: number; total: number; bytes: number }> {
  const tiles = getTilesInBounds(bounds, zoomRange);
  let cached = 0;
  let bytes = 0;

  // the region record only exists once the download finishes, so until then
  // these keys are what keeps the budget from eating what it is downloading
  const arrivingKeys = tiles.map(({ z, x, y }) => tileCacheKey(tileUrlTemplate, z, x, y));
  for (const key of arrivingKeys) downloadingTileKeys.add(key);

  try {
    for (let i = 0; i < tiles.length; i++) {
      const { z, x, y } = tiles[i];
      const url = tileUrlFromTemplate(tileUrlTemplate, z, x, y);

      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const blob = await resp.arrayBuffer();
          await tileCache.put({
            key: arrivingKeys[i],
            blob,
            contentType: resp.headers.get('content-type') || 'image/png',
            cachedAt: Date.now(),
          });
          await noteTileWritten(blob.byteLength);
          cached++;
          bytes += blob.byteLength;
        }
      } catch {
        // Skip failed tiles
      }

      onProgress?.(i + 1, tiles.length);
    }
  } finally {
    for (const key of arrivingKeys) downloadingTileKeys.delete(key);
  }

  return { cached, total: tiles.length, bytes };
}

/** The cache key of every tile an area covers. */
export function tileKeysForArea(
  tileUrlTemplate: string,
  bounds: TileBounds,
  zoomRange: ZoomRange,
): string[] {
  return getTilesInBounds(bounds, zoomRange).map(({ z, x, y }) =>
    tileCacheKey(tileUrlTemplate, z, x, y),
  );
}

/** Drop the tiles an earlier cacheTilesForArea call stored for the same area. */
export async function evictTilesForArea(
  tileUrlTemplate: string,
  bounds: TileBounds,
  zoomRange: ZoomRange,
): Promise<void> {
  for (const key of tileKeysForArea(tileUrlTemplate, bounds, zoomRange)) {
    await tileCache.remove(key);
  }
  forgetTrackedTileBytes();
}

/**
 * How many bytes of tiles the cache may hold. Only tiles outside a saved region
 * are dropped to get back under it, so a region's badge never overstates what
 * is still on disk.
 */
export const TILE_CACHE_BUDGET_BYTES = 200 * 1024 * 1024;

/**
 * Running total of the stored tile bytes, so a tile write never scans the whole
 * store. Chained rather than a plain number so concurrent writes queue instead
 * of overwriting each other's sum.
 */
let trackedTileBytes: Promise<number> | null = null;

/** keys a cacheTilesForArea call is downloading, before its region record exists */
const downloadingTileKeys = new Set<string>();

let evictionPass: Promise<void> | null = null;

function addTileBytes(delta: number): Promise<number> {
  const next = (trackedTileBytes ?? tileCache.size()).then((total) => total + delta);
  trackedTileBytes = next;
  return next;
}

function forgetTrackedTileBytes(): void {
  trackedTileBytes = null;
}

async function noteTileWritten(bytes: number): Promise<void> {
  // the seeding scan already counts the tile just written, so only a total that
  // was already running gets the delta
  const total = trackedTileBytes ? await addTileBytes(bytes) : await seedTrackedTileBytes();
  if (total > TILE_CACHE_BUDGET_BYTES) await enforceTileBudget();
}

function seedTrackedTileBytes(): Promise<number> {
  const seeded = tileCache.size();
  trackedTileBytes = seeded;
  return seeded;
}

function enforceTileBudget(): Promise<void> {
  if (!evictionPass) {
    evictionPass = evictOldestBrowsingTiles().finally(() => {
      evictionPass = null;
    });
  }
  return evictionPass;
}

async function evictOldestBrowsingTiles(): Promise<void> {
  const pinned = await pinnedTileKeys();
  const stored = await tileCache.summaries();
  // the scan is the truth, so a total another tab has drifted comes back in line
  let total = stored.reduce((sum, tile) => sum + tile.bytes, 0);
  trackedTileBytes = Promise.resolve(total);
  if (total <= TILE_CACHE_BUDGET_BYTES) return;

  const oldestFirst = stored
    .filter((tile) => !pinned.has(tile.key))
    .sort((a, b) => a.cachedAt - b.cachedAt);

  for (const tile of oldestFirst) {
    if (total <= TILE_CACHE_BUDGET_BYTES) break;
    await tileCache.remove(tile.key);
    total = await addTileBytes(-tile.bytes);
  }
}

/** Tiles the user asked for by name, which only a region delete removes. */
async function pinnedTileKeys(): Promise<Set<string>> {
  const pinned = new Set<string>(downloadingTileKeys);
  for (const region of await cachedRegions.getAll()) {
    const keys = tileKeysForArea(region.tileUrlTemplate, region.bounds, {
      min: region.minZoom,
      max: region.maxZoom,
    });
    for (const key of keys) pinned.add(key);
  }
  return pinned;
}

/** Bytes held by tiles that panning the map cached, outside every saved region. */
export async function browsingCacheBytes(): Promise<number> {
  const pinned = await pinnedTileKeys();
  const stored = await tileCache.summaries();
  return stored
    .filter((tile) => !pinned.has(tile.key))
    .reduce((sum, tile) => sum + tile.bytes, 0);
}

/** Bytes held by saved region tiles, which the budget cannot evict. */
export async function pinnedCacheBytes(): Promise<number> {
  const pinned = await pinnedTileKeys();
  const stored = await tileCache.summaries();
  return stored
    .filter((tile) => pinned.has(tile.key))
    .reduce((sum, tile) => sum + tile.bytes, 0);
}

/** Drop every tile outside a saved region. Returns the bytes freed. */
export async function clearBrowsingCache(): Promise<number> {
  const pinned = await pinnedTileKeys();
  const stored = await tileCache.summaries();
  trackedTileBytes = Promise.resolve(stored.reduce((sum, tile) => sum + tile.bytes, 0));
  let freed = 0;
  for (const tile of stored) {
    if (pinned.has(tile.key)) continue;
    await tileCache.remove(tile.key);
    freed += tile.bytes;
  }
  await addTileBytes(-freed);
  return freed;
}

/** Calculate tile coordinates for a bounding box at given zoom levels */
function getTilesInBounds(
  bounds: TileBounds,
  zoomRange: ZoomRange,
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
