import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CachedRegion, CachedTile, CachedTileSummary } from '../../src/offline/db';

// no indexeddb in jsdom and fake-indexeddb is not a dependency, so the store is
// the seam: the budget, the pinning and the eviction order under test stay real
const db = vi.hoisted(() => ({
  regions: [] as CachedRegion[],
  tiles: new Map<string, CachedTileSummary>(),
}));

vi.mock('../../src/offline/db', () => ({
  apiCache: { get: vi.fn(), put: vi.fn() },
  cachedRegions: {
    getAll: async () => db.regions,
    put: async (region: CachedRegion) => {
      db.regions.push(region);
    },
    remove: async (id: string) => {
      db.regions = db.regions.filter((r) => r.id !== id);
    },
  },
  tileCache: {
    get: async (key: string) => db.tiles.get(key),
    put: async (tile: CachedTile) => {
      db.tiles.set(tile.key, {
        key: tile.key,
        bytes: tile.blob.byteLength,
        cachedAt: tile.cachedAt,
      });
    },
    remove: async (key: string) => {
      db.tiles.delete(key);
    },
    summaries: async () => [...db.tiles.values()],
    size: async () => [...db.tiles.values()].reduce((sum, tile) => sum + tile.bytes, 0),
  },
}));

const MEGABYTE = 1024 * 1024;
const TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const REGION_BOUNDS = { west: 10, south: 50, east: 10.05, north: 50.05 };
const REGION_ZOOM = { min: 10, max: 10 };
const BROWSED_TILE = { z: 3, x: 4, y: 5 };

// the running byte total is module state, so each test gets its own module
async function loadCache() {
  vi.resetModules();
  return import('../../src/offline/cache');
}

function seedTile(key: string, megabytes: number, cachedAt: number) {
  db.tiles.set(key, { key, bytes: megabytes * MEGABYTE, cachedAt });
}

function savedRegion(tiles: number, megabytes: number): CachedRegion {
  return {
    id: 'r1',
    name: 'Alps',
    tileUrlTemplate: TEMPLATE,
    bounds: REGION_BOUNDS,
    minZoom: REGION_ZOOM.min,
    maxZoom: REGION_ZOOM.max,
    tiles,
    bytes: megabytes * MEGABYTE,
    createdAt: 1,
  };
}

function respondWithTile(megabytes: number) {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(megabytes * MEGABYTE),
    headers: { get: () => 'image/png' },
  }));
}

function storedBytes(keys: string[]): number {
  return keys.reduce((sum, key) => sum + (db.tiles.get(key)?.bytes ?? 0), 0);
}

describe('tile cache budget', () => {
  beforeEach(() => {
    db.regions = [];
    db.tiles.clear();
    vi.stubGlobal('fetch', respondWithTile(6));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('evicts the oldest browsing tile once a write crosses the budget', async () => {
    const cache = await loadCache();
    seedTile('oldest-browsed', 150, 1);
    seedTile('newer-browsed', 45, 2);

    await cache.loadTile(TEMPLATE, BROWSED_TILE.z, BROWSED_TILE.x, BROWSED_TILE.y);

    expect(db.tiles.has('oldest-browsed')).toBe(false);
    expect(db.tiles.has('newer-browsed')).toBe(true);
    expect(
      db.tiles.has(cache.tileCacheKey(TEMPLATE, BROWSED_TILE.z, BROWSED_TILE.x, BROWSED_TILE.y)),
    ).toBe(true);
  });

  it('keeps a saved region tile over the budget even when it is the oldest', async () => {
    const cache = await loadCache();
    const regionKeys = cache.tileKeysForArea(TEMPLATE, REGION_BOUNDS, REGION_ZOOM);
    seedTile(regionKeys[0], 150, 1);
    seedTile('newer-browsed', 45, 2);
    db.regions = [savedRegion(regionKeys.length, 150)];

    await cache.loadTile(TEMPLATE, BROWSED_TILE.z, BROWSED_TILE.x, BROWSED_TILE.y);

    expect(db.tiles.has(regionKeys[0])).toBe(true);
    expect(db.tiles.get(regionKeys[0])?.bytes).toBe(150 * MEGABYTE);
    expect(db.tiles.has('newer-browsed')).toBe(false);
  });

  it('stops evicting once only saved region tiles are left, over budget or not', async () => {
    const cache = await loadCache();
    const regionKeys = cache.tileKeysForArea(TEMPLATE, REGION_BOUNDS, REGION_ZOOM);
    for (const key of regionKeys) seedTile(key, 201 / regionKeys.length, 1);
    seedTile('browsed', 1, 2);
    db.regions = [savedRegion(regionKeys.length, 201)];

    await cache.loadTile(TEMPLATE, BROWSED_TILE.z, BROWSED_TILE.x, BROWSED_TILE.y);

    for (const key of regionKeys) expect(db.tiles.has(key)).toBe(true);
    expect(db.tiles.has('browsed')).toBe(false);
    expect(storedBytes(regionKeys)).toBe(201 * MEGABYTE);
  });

  it('leaves a saved region untouched when the browsing cache is cleared', async () => {
    const cache = await loadCache();
    const regionKeys = cache.tileKeysForArea(TEMPLATE, REGION_BOUNDS, REGION_ZOOM);
    for (const key of regionKeys) seedTile(key, 5, 1);
    seedTile('browsed-one', 3, 2);
    seedTile('browsed-two', 2, 3);
    const region = savedRegion(regionKeys.length, 5 * regionKeys.length);
    db.regions = [region];

    expect(await cache.browsingCacheBytes()).toBe(5 * MEGABYTE);

    const freed = await cache.clearBrowsingCache();

    expect(freed).toBe(5 * MEGABYTE);
    expect(db.tiles.has('browsed-one')).toBe(false);
    expect(db.tiles.has('browsed-two')).toBe(false);
    for (const key of regionKeys) expect(db.tiles.has(key)).toBe(true);
    expect(storedBytes(regionKeys)).toBe(region.bytes);
    expect(await cache.browsingCacheBytes()).toBe(0);
  });

  it('does not evict the tiles a region download is still writing', async () => {
    const cache = await loadCache();
    seedTile('oldest-browsed', 199, 1);
    vi.stubGlobal('fetch', respondWithTile(3));

    const result = await cache.cacheTilesForArea(TEMPLATE, REGION_BOUNDS, REGION_ZOOM);
    const regionKeys = cache.tileKeysForArea(TEMPLATE, REGION_BOUNDS, REGION_ZOOM);

    expect(result.cached).toBe(regionKeys.length);
    for (const key of regionKeys) expect(db.tiles.has(key)).toBe(true);
    expect(db.tiles.has('oldest-browsed')).toBe(false);
  });
});
