import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MAX_STEPS,
  buildSteps,
  layersUrl,
  listLayers,
  parseLayers,
  stepInterval,
  stepLabel,
  tileUrl,
  timedLayers,
} from '../../src/lib/geoplumb';

/** What GET /layers answers for the two layers the platform stack configures. */
const LAYERS = [
  {
    name: 'cop-dem-hillshade',
    source: 'stac',
    collection: 'cop-dem-glo-30',
    default_datetime: null,
    // the DEM collection advertises no interval, so nothing to step through
    temporal_extent: null,
  },
  {
    name: 'ndvi',
    source: 'stac',
    collection: 'sentinel-2-l2a',
    default_datetime: '2025-06-01T00:00:00Z/2025-09-01T00:00:00Z',
    temporal_extent: { start: '2015-06-27T10:25:31Z', end: null },
  },
  {
    name: 'local-dem',
    source: 'cog',
    collection: null,
    default_datetime: null,
    temporal_extent: null,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('step sequences from a temporal extent', () => {
  it('covers the partial months at both ends', () => {
    const steps = buildSteps(
      { start: '2024-03-14T10:00:00Z', end: '2024-06-02T00:00:00Z' },
      'month',
    );
    expect(steps).toEqual([
      '2024-03-01T00:00:00Z',
      '2024-04-01T00:00:00Z',
      '2024-05-01T00:00:00Z',
      '2024-06-01T00:00:00Z',
    ]);
  });

  it('keeps a single step when the extent sits inside one month', () => {
    const steps = buildSteps(
      { start: '2024-03-14T10:00:00Z', end: '2024-03-20T00:00:00Z' },
      'month',
    );
    expect(steps).toEqual(['2024-03-01T00:00:00Z']);
  });

  it('snaps to whole years on a year step', () => {
    const steps = buildSteps(
      { start: '2019-07-04T00:00:00Z', end: '2021-02-01T00:00:00Z' },
      'year',
    );
    expect(steps).toEqual([
      '2019-01-01T00:00:00Z',
      '2020-01-01T00:00:00Z',
      '2021-01-01T00:00:00Z',
    ]);
  });

  it('runs an open end up to now', () => {
    const now = Date.parse('2026-02-10T00:00:00Z');
    const steps = buildSteps({ start: '2025-11-01T00:00:00Z', end: null }, 'month', now);
    expect(steps).toEqual([
      '2025-11-01T00:00:00Z',
      '2025-12-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
    ]);
  });

  it('caps a long extent at the most recent steps', () => {
    const steps = buildSteps({ start: '1972-07-23T00:00:00Z', end: null }, 'month', Date.parse('2026-02-10T00:00:00Z'));
    expect(steps).toHaveLength(MAX_STEPS);
    // the newest step is kept and the oldest dropped
    expect(steps[steps.length - 1]).toBe('2026-02-01T00:00:00Z');
    expect(steps[0]).toBe('2006-03-01T00:00:00Z');
  });

  it('gives nothing to step through without a readable start', () => {
    expect(buildSteps({ start: null, end: '2024-01-01T00:00:00Z' }, 'month')).toEqual([]);
    expect(buildSteps({ start: 'last summer', end: null }, 'month')).toEqual([]);
  });

  it('gives nothing when the extent ends before it starts', () => {
    expect(
      buildSteps({ start: '2024-06-01T00:00:00Z', end: '2024-01-01T00:00:00Z' }, 'month'),
    ).toEqual([]);
  });
});

describe('the t interval a step asks for', () => {
  it('runs from the step to the next one', () => {
    expect(stepInterval('2024-06-01T00:00:00Z', 'month')).toBe(
      '2024-06-01T00:00:00Z/2024-07-01T00:00:00Z',
    );
  });

  it('rolls over the year boundary', () => {
    expect(stepInterval('2024-12-01T00:00:00Z', 'month')).toBe(
      '2024-12-01T00:00:00Z/2025-01-01T00:00:00Z',
    );
  });

  it('spans the whole year on a year step', () => {
    expect(stepInterval('2024-01-01T00:00:00Z', 'year')).toBe(
      '2024-01-01T00:00:00Z/2025-01-01T00:00:00Z',
    );
  });

  it('every step of a sequence butts against the next', () => {
    const steps = buildSteps(
      { start: '2024-01-01T00:00:00Z', end: '2024-04-01T00:00:00Z' },
      'month',
    );
    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(stepInterval(steps[i], 'month').split('/')[1]).toBe(steps[i + 1]);
    }
  });

  it('labels a step by its calendar unit', () => {
    expect(stepLabel('2024-06-01T00:00:00Z', 'month')).toBe('2024-06');
    expect(stepLabel('2024-06-01T00:00:00Z', 'year')).toBe('2024');
  });
});

describe('tile urls', () => {
  it('leaves the tile placeholders for maplibre and encodes the interval', () => {
    const url = tileUrl('ndvi', '2024-06-01T00:00:00Z/2024-07-01T00:00:00Z');
    expect(url).toBe(
      '/plumb/tiles/ndvi/{z}/{x}/{y}.png?t=2024-06-01T00%3A00%3A00Z%2F2024-07-01T00%3A00%3A00Z',
    );
    // the server reads the interval back whole
    const t = new URL(url.replace('{z}/{x}/{y}', '1/2/3'), 'http://x').searchParams.get('t');
    expect(t).toBe('2024-06-01T00:00:00Z/2024-07-01T00:00:00Z');
  });

  it('goes through the proxied prefix', () => {
    expect(layersUrl()).toBe('/plumb/layers');
    expect(tileUrl('a b', '2024-01-01T00:00:00Z/2024-02-01T00:00:00Z')).toContain(
      '/plumb/tiles/a%20b/',
    );
  });
});

describe('the layer list', () => {
  it('reads the server field names', () => {
    const parsed = parseLayers(LAYERS);
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toEqual({
      name: 'ndvi',
      source: 'stac',
      collection: 'sentinel-2-l2a',
      defaultDatetime: '2025-06-01T00:00:00Z/2025-09-01T00:00:00Z',
      temporalExtent: { start: '2015-06-27T10:25:31Z', end: null },
    });
  });

  it('drops entries with no layer name to ask for', () => {
    expect(parseLayers([{ source: 'stac' }, ...LAYERS])).toHaveLength(3);
    expect(parseLayers({ layers: [] })).toEqual([]);
  });

  it('offers only the layers with a time axis', () => {
    const timed = timedLayers(parseLayers(LAYERS));
    expect(timed.map((l) => l.name)).toEqual(['ndvi']);
  });

  it('rejects an extent whose start will not parse', () => {
    const timed = timedLayers(
      parseLayers([
        { name: 'broken', source: 'stac', temporal_extent: { start: 'whenever', end: null } },
      ]),
    );
    expect(timed).toEqual([]);
  });

  it('fetches the list through the proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LAYERS));
    vi.stubGlobal('fetch', fetchMock);
    const layers = await listLayers();
    expect(fetchMock).toHaveBeenCalledWith('/plumb/layers');
    expect(layers.map((l) => l.name)).toEqual(['cop-dem-hillshade', 'ndvi', 'local-dem']);
  });

  it('says so when the service answers an error or is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 502)));
    await expect(listLayers()).rejects.toThrow('HTTP 502');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(listLayers()).rejects.toThrow('unreachable');
  });
});
