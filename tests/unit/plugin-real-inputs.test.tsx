import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { slopeAspect } from '../../src/plugins/point-sampling/index';
import { fetchElevations } from '../../src/lib/elevationProfile';

/**
 * Point sampling and the elevation lookup used to run on random values and a
 * sine-wave DEM fallback, so these cover the real inputs.
 */

describe('point sampling derives slope and aspect from neighbour elevations', () => {
  it('gives the downhill bearing of the neighbour cross', () => {
    // drops 20 m over 200 m towards the east
    const east = slopeAspect({ east: 90, west: 110, north: 100, south: 100 }, 100);
    expect(east.slope).toBeCloseTo(5.71, 2);
    expect(east.aspect).toBeCloseTo(90, 6);

    const north = slopeAspect({ east: 100, west: 100, north: 90, south: 110 }, 100);
    expect(north.aspect).toBeCloseTo(0, 6);
  });

  it('leaves aspect undefined on flat ground', () => {
    expect(slopeAspect({ east: 50, west: 50, north: 50, south: 50 }, 100)).toEqual({
      slope: 0,
      aspect: null,
    });
  });
});

describe('elevation lookup', () => {
  const coords = (n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [i / 1000, 51] as [number, number]);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws instead of returning a synthetic profile when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }),
    );
    await expect(fetchElevations(coords(3))).rejects.toThrow(/503/);
  });

  it('throws when the response has no usable elevations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchElevations(coords(3))).rejects.toThrow(/no usable data/);
  });

  it('splits long point lists into chunked lookups', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const count = new URL(url).searchParams.get('locations')?.split('|').length ?? 0;
      return { ok: true, json: async () => ({ results: Array.from({ length: count }, () => ({ elevation: 42 })) }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const elevations = await fetchElevations(coords(250));
    expect(elevations).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
