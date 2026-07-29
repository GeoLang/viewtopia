import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runOperation } from '../../src/plugins/geoprocessing/index';
import { slopeAspect } from '../../src/plugins/point-sampling/index';
import { fetchElevations } from '../../src/lib/elevationProfile';
import type { GeoJsonSource } from '../../src/lib/geojsonSources';

/**
 * The three analysis plugins used to run on hardcoded empty geometry, random
 * values and a sine-wave DEM fallback, so these cover the real inputs.
 */

function square(west: number, name: string): GeoJsonSource {
  return {
    id: name,
    name,
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'plot' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [west, 0],
                [west + 1, 0],
                [west + 1, 1],
                [west, 1],
                [west, 0],
              ],
            ],
          },
        },
      ],
    },
  };
}

const params = { bufferDist: 100, bufferUnits: 'meters' as const, simplifyTol: 0.001, field: '' };

describe('geoprocessing runs on the selected source', () => {
  it('buffers the source features instead of an empty collection', () => {
    const out = runOperation('buffer', square(0, 'a'), undefined, params);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].geometry.type).toBe('Polygon');
    // the buffer has to be bigger than the input square
    const [w, s, e, n] = out.features[0].geometry.type === 'Polygon'
      ? out.features[0].geometry.coordinates[0].reduce(
          ([mw, ms, me, mn], [x, y]) => [Math.min(mw, x), Math.min(ms, y), Math.max(me, x), Math.max(mn, y)],
          [Infinity, Infinity, -Infinity, -Infinity],
        )
      : [0, 0, 0, 0];
    expect(w).toBeLessThan(0);
    expect(s).toBeLessThan(0);
    expect(e).toBeGreaterThan(1);
    expect(n).toBeGreaterThan(1);
  });

  it('intersects two overlapping sources', () => {
    const out = runOperation('intersect', square(0, 'a'), square(0.5, 'b'), params);
    expect(out.features).toHaveLength(1);
    const ring = (out.features[0].geometry as GeoJSON.Polygon).coordinates[0];
    for (const [x] of ring) {
      expect(x).toBeGreaterThanOrEqual(0.5);
      expect(x).toBeLessThanOrEqual(1);
    }
  });

  it('reports layers that cannot satisfy the operation', () => {
    expect(() => runOperation('intersect', square(0, 'a'), square(5, 'far'), params)).toThrow(
      /produced no geometry/,
    );
    const empty: GeoJsonSource = { id: 'e', name: 'empty', geojson: { type: 'FeatureCollection', features: [] } };
    expect(() => runOperation('buffer', empty, undefined, params)).toThrow(/no features/);
    expect(() => runOperation('union', square(0, 'a'), undefined, params)).toThrow(/overlay/);
  });
});

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
