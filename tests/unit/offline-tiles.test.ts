import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import L from 'leaflet';
import type { CachedTile } from '../../src/offline/db';

const store = new Map<string, CachedTile>();
const get = vi.fn(async (key: string) => store.get(key));

vi.mock('../../src/offline/db', () => ({
  apiCache: { get: vi.fn(), put: vi.fn() },
  cachedRegions: { getAll: async () => [] },
  tileCache: {
    get: (key: string) => get(key),
    put: async (tile: CachedTile) => {
      store.set(tile.key, tile);
    },
    remove: async (key: string) => {
      store.delete(key);
    },
    summaries: async () =>
      [...store.values()].map((t) => ({
        key: t.key,
        bytes: t.blob.byteLength,
        cachedAt: t.cachedAt,
      })),
    size: async () => [...store.values()].reduce((sum, t) => sum + t.blob.byteLength, 0),
  },
}));

import { cacheTilesForArea, loadTile, tileCacheKey } from '../../src/offline/cache';
import { useNetworkStore } from '../../src/offline/network';
import { cachedTileUrl, loadCachedTile } from '../../src/offline/tileProtocol';
import { CachedImageryProvider } from '../../src/offline/cachedImageryProvider';
import { CachedTileLayer } from '../../src/offline/cachedTileLayer';

const TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_TEMPLATE = 'https://example.test/tile/{z}/{y}/{x}';
const TILE = { z: 10, x: 5, y: 7 };
const KEY = `${TILE.z}/${TILE.x}/${TILE.y}@${TEMPLATE}`;

function seed(key: string, bytes: ArrayBuffer) {
  store.set(key, { key, blob: bytes, contentType: 'image/png', cachedAt: 1 });
}

function maplibreUrl(template: string, z: number, x: number, y: number): string {
  return cachedTileUrl(template)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

async function maplibreTile(template: string, z: number, x: number, y: number) {
  const { data } = await loadCachedTile(
    { url: maplibreUrl(template, z, x, y) },
    new AbortController(),
  );
  return data;
}

async function cesiumTile(template: string, z: number, x: number, y: number) {
  const provider = new CachedImageryProvider({ url: template, maximumLevel: 19 });
  await provider.requestImage(x, y, z);
  return imageBitmapBlobs.at(-1) as Blob;
}

async function leafletTile(
  template: string,
  z: number,
  x: number,
  y: number,
): Promise<Blob> {
  const layer = new CachedTileLayer(template, { maxZoom: 19 });
  const coords = L.point(x, y) as L.Coords;
  coords.z = z;

  const before = objectUrlBlobs.length;
  let failure: Error | undefined;
  layer.createTile(coords, (err) => {
    failure = err;
  });

  await vi.waitFor(() => {
    if (!failure && objectUrlBlobs.length === before) throw new Error('tile still loading');
  });
  if (failure) throw failure;
  return objectUrlBlobs[before];
}

let imageBitmapBlobs: Blob[] = [];
let objectUrlBlobs: Blob[] = [];

function setOnline(online: boolean) {
  useNetworkStore.setState({ online });
}

function respondWith(bytes: ArrayBuffer) {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => bytes,
    headers: { get: () => 'image/png' },
  }));
}

describe('offline tile cache across renderers', () => {
  beforeEach(() => {
    store.clear();
    get.mockClear();
    imageBitmapBlobs = [];
    objectUrlBlobs = [];
    setOnline(true);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        imageBitmapBlobs.push(blob);
        return {} as ImageBitmap;
      }),
    );
    URL.createObjectURL = vi.fn((blob: Blob) => {
      objectUrlBlobs.push(blob);
      return `blob:tile-${objectUrlBlobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a cached tile to all three renderers without a network fetch', async () => {
    const cached = new Uint8Array([1, 2, 3]).buffer;
    seed(KEY, cached);
    setOnline(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const fromMapLibre = await maplibreTile(TEMPLATE, TILE.z, TILE.x, TILE.y);
    const fromCesium = await cesiumTile(TEMPLATE, TILE.z, TILE.x, TILE.y);
    const fromLeaflet = await leafletTile(TEMPLATE, TILE.z, TILE.x, TILE.y);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(new Uint8Array(fromMapLibre)).toEqual(new Uint8Array(cached));
    expect(new Uint8Array(await fromCesium.arrayBuffer())).toEqual(new Uint8Array(cached));
    expect(new Uint8Array(await fromLeaflet.arrayBuffer())).toEqual(new Uint8Array(cached));
  });

  it('asks the cache for one key whichever renderer renders the tile', async () => {
    setOnline(false);

    await expect(maplibreTile(TEMPLATE, TILE.z, TILE.x, TILE.y)).rejects.toThrow('tile not cached');
    await expect(cesiumTile(TEMPLATE, TILE.z, TILE.x, TILE.y)).rejects.toThrow('tile not cached');
    await expect(leafletTile(TEMPLATE, TILE.z, TILE.x, TILE.y)).rejects.toThrow('tile not cached');

    expect(get.mock.calls).toEqual([[KEY], [KEY], [KEY]]);
  });

  it('finds the tiles the offline panel downloaded, in every renderer', async () => {
    const downloaded = new Uint8Array([7, 7, 7]).buffer;
    vi.stubGlobal('fetch', respondWith(downloaded));

    const result = await cacheTilesForArea(
      TEMPLATE,
      { west: -45.1, south: 39.9, east: -45, north: 40 },
      { min: 2, max: 2 },
    );
    expect(result.cached).toBe(1);

    setOnline(false);
    vi.stubGlobal('fetch', vi.fn());

    const fromMapLibre = await maplibreTile(TEMPLATE, 2, 1, 1);
    const fromCesium = await cesiumTile(TEMPLATE, 2, 1, 1);
    const fromLeaflet = await leafletTile(TEMPLATE, 2, 1, 1);

    expect(new Uint8Array(fromMapLibre)).toEqual(new Uint8Array(downloaded));
    expect(new Uint8Array(await fromCesium.arrayBuffer())).toEqual(new Uint8Array(downloaded));
    expect(new Uint8Array(await fromLeaflet.arrayBuffer())).toEqual(new Uint8Array(downloaded));
  });

  it('puts a tile fetched from the network into the cache', async () => {
    const bytes = new Uint8Array([4, 2]).buffer;
    const fetchMock = respondWith(bytes);
    vi.stubGlobal('fetch', fetchMock);

    await cesiumTile(TEMPLATE, TILE.z, TILE.x, TILE.y);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/10/5/7.png',
      expect.anything(),
    );
    expect(new Uint8Array(store.get(KEY)?.blob as ArrayBuffer)).toEqual(new Uint8Array(bytes));

    setOnline(false);
    const offlineFetch = vi.fn();
    vi.stubGlobal('fetch', offlineFetch);
    const fromLeaflet = await leafletTile(TEMPLATE, TILE.z, TILE.x, TILE.y);

    expect(offlineFetch).not.toHaveBeenCalled();
    expect(new Uint8Array(await fromLeaflet.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it('keys a y/x template by z/x/y all the same', async () => {
    const bytes = new Uint8Array([9]).buffer;
    const fetchMock = respondWith(bytes);
    vi.stubGlobal('fetch', fetchMock);

    await loadTile(SATELLITE_TEMPLATE, TILE.z, TILE.x, TILE.y);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/tile/10/7/5', expect.anything());
    expect(store.has(tileCacheKey(SATELLITE_TEMPLATE, TILE.z, TILE.x, TILE.y))).toBe(true);
    expect([...store.keys()]).toEqual([`10/5/7@${SATELLITE_TEMPLATE}`]);
  });
});
