import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  datasetStyleLayers,
  fetchDatasetStyle,
  PTOLEMY_SOURCE_LAYER,
} from '../../src/lib/datasetStyle';

const source = 'vt-1';

describe('datasetStyleLayers', () => {
  it('keeps the response order and binds every layer to the source we asked for', () => {
    const style = datasetStyleLayers(
      {
        source: 'stale-source',
        sourceLayer: 'stale-layer',
        layers: [
          { id: 'fill', type: 'fill', source: 'stale-source', paint: { 'fill-color': '#f00' } },
          { id: 'outline', type: 'line', 'source-layer': 'stale-layer' },
        ],
        losses: [],
      },
      source,
      PTOLEMY_SOURCE_LAYER,
    );
    expect(style?.layers.map((l) => l.id)).toEqual(['vt-1-fill', 'vt-1-outline']);
    expect(style?.layers.map((l) => l.type)).toEqual(['fill', 'line']);
    for (const layer of style?.layers ?? []) {
      expect(layer).toMatchObject({ source, 'source-layer': 'features' });
    }
    expect(style?.layers[0]).toMatchObject({ paint: { 'fill-color': '#f00' } });
  });

  it('reports losses and drops malformed ones', () => {
    const style = datasetStyleLayers(
      {
        layers: [{ id: 'fill', type: 'fill' }],
        losses: [{ path: 'renderer.symbol', reason: 'unsupported marker' }, { path: 42 }, 'nope'],
      },
      source,
      'features',
    );
    expect(style?.losses).toEqual([{ path: 'renderer.symbol', reason: 'unsupported marker' }]);
  });

  it('returns null for bodies with no usable layer', () => {
    expect(datasetStyleLayers(null, source, 'features')).toBeNull();
    expect(datasetStyleLayers('<html>404</html>', source, 'features')).toBeNull();
    expect(datasetStyleLayers({ layers: [] }, source, 'features')).toBeNull();
    expect(datasetStyleLayers({ layers: 'fill' }, source, 'features')).toBeNull();
    expect(datasetStyleLayers({ layers: [{ id: 'fill' }, null, 7] }, source, 'features')).toBeNull();
  });

  it('names an unnamed layer after its position', () => {
    const style = datasetStyleLayers({ layers: [{ type: 'fill' }] }, source, 'features');
    expect(style?.layers[0].id).toBe('vt-1-0');
  });
});

describe('fetchDatasetStyle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the source and source layer it was given', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ layers: [{ id: 'fill', type: 'fill' }], losses: [] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const style = await fetchDatasetStyle('ds-7', source, PTOLEMY_SOURCE_LAYER);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/v1/datasets/ds-7/style?source=vt-1&sourceLayer=features',
    );
    expect(style?.layers[0].id).toBe('vt-1-fill');
  });

  it('falls back on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no style', { status: 404 })));
    expect(await fetchDatasetStyle('ds-7', source, 'features')).toBeNull();
  });

  it('falls back on 422', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unusable', { status: 422 })));
    expect(await fetchDatasetStyle('ds-7', source, 'features')).toBeNull();
  });

  it('falls back without throwing on a body that is not json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await fetchDatasetStyle('ds-7', source, 'features')).toBeNull();
  });

  it('falls back when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchDatasetStyle('ds-7', source, 'features')).toBeNull();
  });
});
