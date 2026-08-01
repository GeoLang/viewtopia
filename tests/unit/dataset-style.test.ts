import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  datasetStyleLayers,
  fetchDatasetStyle,
  PTOLEMY_SOURCE_LAYER,
} from '../../src/lib/datasetStyle';
import type { DatasetStyleImage } from '../../src/lib/datasetStyle';
import { decodeStyleImages } from '../../src/lib/styleImages';

const source = 'vt-1';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

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

  it('has no images when the server leaves the key out', () => {
    const style = datasetStyleLayers(
      { layers: [{ id: 'icons', type: 'symbol', layout: { 'icon-image': 'pin' } }] },
      source,
      'features',
    );
    expect(style?.images).toEqual([]);
    // nothing to rename against, so the reference is left as it came
    expect(style?.layers[0]).toMatchObject({ layout: { 'icon-image': 'pin' } });
  });

  it('prefixes image names and the layer references to them', () => {
    const style = datasetStyleLayers(
      {
        layers: [
          { id: 'icons', type: 'symbol', layout: { 'icon-image': 'pin' } },
          { id: 'hatch', type: 'fill', paint: { 'fill-pattern': 'hatch' } },
        ],
        images: {
          pin: { data_uri: PNG, width: 24.0, height: 24.0 },
          hatch: { data_uri: PNG, width: 8, height: 8 },
        },
      },
      source,
      'features',
    );
    expect(style?.images).toEqual([
      { name: 'vt-1-pin', dataUri: PNG, width: 24, height: 24 },
      { name: 'vt-1-hatch', dataUri: PNG, width: 8, height: 8 },
    ]);
    expect(style?.layers[0]).toMatchObject({ layout: { 'icon-image': 'vt-1-pin' } });
    expect(style?.layers[1]).toMatchObject({ paint: { 'fill-pattern': 'vt-1-hatch' } });
  });

  it('renames references inside match and step expressions, leaving "" alone', () => {
    const style = datasetStyleLayers(
      {
        layers: [
          {
            id: 'icons',
            type: 'symbol',
            layout: {
              'icon-image': ['match', ['get', 'kind'], 'a', 'pin', 'b', 'flag', ''],
            },
          },
          {
            id: 'hatch',
            type: 'fill',
            paint: { 'fill-pattern': ['step', ['zoom'], 'hatch', 12, ''] },
          },
        ],
        images: {
          pin: { data_uri: PNG, width: 24, height: 24 },
          flag: { data_uri: PNG, width: 16, height: 16 },
          hatch: { data_uri: PNG, width: 8, height: 8 },
        },
      },
      source,
      'features',
    );
    expect(style?.layers[0]).toMatchObject({
      layout: { 'icon-image': ['match', ['get', 'kind'], 'a', 'vt-1-pin', 'b', 'vt-1-flag', ''] },
    });
    expect(style?.layers[1]).toMatchObject({
      paint: { 'fill-pattern': ['step', ['zoom'], 'vt-1-hatch', 12, ''] },
    });
  });

  it('skips malformed image entries and keeps the good ones', () => {
    const style = datasetStyleLayers(
      {
        layers: [{ id: 'icons', type: 'symbol', layout: { 'icon-image': 'pin' } }],
        images: {
          pin: { data_uri: PNG, width: 24, height: 24 },
          nosize: { data_uri: PNG, width: 0, height: 24 },
          badsize: { data_uri: PNG, width: '24', height: 24 },
          nan: { data_uri: PNG, width: Number.NaN, height: 24 },
          script: { data_uri: 'javascript:alert(1)', width: 24, height: 24 },
          nothtml: { data_uri: 'data:text/html,<script>', width: 24, height: 24 },
          nouri: { width: 24, height: 24 },
          notanobject: 'pin.png',
          '': { data_uri: PNG, width: 24, height: 24 },
        },
      },
      source,
      'features',
    );
    expect(style?.images.map((i) => i.name)).toEqual(['vt-1-pin']);
    expect(style?.layers[0]).toMatchObject({ layout: { 'icon-image': 'vt-1-pin' } });
  });

  it('ignores an images value that is not an object', () => {
    const style = datasetStyleLayers(
      { layers: [{ id: 'fill', type: 'fill' }], images: ['pin.png'] },
      source,
      'features',
    );
    expect(style?.images).toEqual([]);
  });
});

describe('decodeStyleImages', () => {
  const image = (name: string): DatasetStyleImage => ({
    name,
    dataUri: PNG,
    width: 24,
    height: 24,
  });

  it('keeps the decoded sprites in order', async () => {
    const decode = vi.fn(async () => ({ width: 24, height: 24 }) as ImageData);
    const decoded = await decodeStyleImages([image('a'), image('b')], decode);
    expect(decoded.map((d) => d.name)).toEqual(['a', 'b']);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('skips a sprite the browser will not decode', async () => {
    const decode = vi.fn(async (img: DatasetStyleImage) => {
      if (img.name === 'bad') throw new Error('corrupt');
      return { width: 24, height: 24 } as ImageData;
    });
    expect(await decodeStyleImages([image('bad'), image('good')], decode)).toEqual([
      { name: 'good', image: { width: 24, height: 24 } },
    ]);
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
