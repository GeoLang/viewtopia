import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('maplibre-gl', () => ({
  default: { addProtocol: vi.fn() },
}));

const get = vi.fn();
const put = vi.fn(async () => {});
vi.mock('../../src/offline/db', () => ({
  apiCache: { get: vi.fn(), put: vi.fn() },
  cachedRegions: { getAll: async () => [] },
  tileCache: {
    get: (key: string) => get(key),
    put: (tile: unknown) => put(tile),
    summaries: async () => [],
    size: async () => 0,
  },
}));

import maplibregl from 'maplibre-gl';
import { useNetworkStore } from '../../src/offline/network';
import {
  cachedTileUrl,
  loadCachedTile,
  registerCachedTileProtocol,
} from '../../src/offline/tileProtocol';

const TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function substituted(z: number, x: number, y: number): string {
  return cachedTileUrl(TEMPLATE)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

function setOnline(online: boolean) {
  useNetworkStore.setState({ online });
}

describe('cached tile protocol', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockClear();
    setOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the cached scheme once', () => {
    registerCachedTileProtocol();
    registerCachedTileProtocol();
    expect(maplibregl.addProtocol).toHaveBeenCalledTimes(1);
    expect(maplibregl.addProtocol).toHaveBeenCalledWith('cached', loadCachedTile);
  });

  it('fetches from the network while online and keeps the tile', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bytes,
      headers: { get: () => 'image/png' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadCachedTile({ url: substituted(10, 5, 7) }, new AbortController());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/10/5/7.png',
      expect.anything(),
    );
    expect(result.data).toBe(bytes);
    expect(get).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ key: `10/5/7@${TEMPLATE}`, blob: bytes }),
    );
  });

  it('falls back to the cache when the network fails', async () => {
    const cached = new Uint8Array([9]).buffer;
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    get.mockResolvedValue({ key: 'k', blob: cached, contentType: 'image/png', cachedAt: 1 });

    const result = await loadCachedTile({ url: substituted(10, 5, 7) }, new AbortController());

    expect(get).toHaveBeenCalledWith(`10/5/7@${TEMPLATE}`);
    expect(result.data).toBe(cached);
  });

  it('serves the cache without fetching while offline', async () => {
    setOnline(false);
    const cached = new Uint8Array([4]).buffer;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    get.mockResolvedValue({ key: 'k', blob: cached, contentType: 'image/png', cachedAt: 1 });

    const result = await loadCachedTile({ url: substituted(12, 1, 2) }, new AbortController());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data).toBe(cached);
  });

  it('throws on an offline cache miss', async () => {
    setOnline(false);
    get.mockResolvedValue(undefined);

    await expect(
      loadCachedTile({ url: substituted(3, 1, 2) }, new AbortController()),
    ).rejects.toThrow('tile not cached');
  });

  it('rethrows an aborted fetch instead of masking it with the cache', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(abortError)));

    await expect(
      loadCachedTile({ url: substituted(3, 1, 2) }, new AbortController()),
    ).rejects.toThrow('aborted');
    expect(get).not.toHaveBeenCalled();
  });
});
