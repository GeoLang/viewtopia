import { describe, it, expect } from 'vitest';
import {
  agentLayerId,
  attributeColumns,
  columnStats,
  compareValues,
  layerWithField,
  nextSort,
  sortRows,
} from '../../src/features/attributes/attributes';
import type { AgentLayer } from '../../src/store/agentLayers';

const row = (attrs: Record<string, unknown>) => ({ attrs });

describe('sorting', () => {
  it('cycles a header asc, desc, then off, and starts over on another column', () => {
    const first = nextSort(null, 'pop');
    expect(first).toEqual({ column: 'pop', dir: 'asc' });
    const second = nextSort(first, 'pop');
    expect(second).toEqual({ column: 'pop', dir: 'desc' });
    expect(nextSort(second, 'pop')).toBeNull();
    expect(nextSort(second, 'name')).toEqual({ column: 'name', dir: 'asc' });
  });

  it('orders numbers numerically, not as text', () => {
    const rows = [row({ pop: 9 }), row({ pop: 100 }), row({ pop: 20 })];
    const sorted = sortRows(rows, (r) => r.attrs.pop, { column: 'pop', dir: 'asc' });
    expect(sorted.map((r) => r.attrs.pop)).toEqual([9, 20, 100]);
    expect(
      sortRows(rows, (r) => r.attrs.pop, { column: 'pop', dir: 'desc' }).map((r) => r.attrs.pop),
    ).toEqual([100, 20, 9]);
  });

  it('orders text alphabetically and leaves the rows alone with no sort', () => {
    const rows = [row({ n: 'Turin' }), row({ n: 'Lisbon' }), row({ n: 'Madrid' })];
    expect(
      sortRows(rows, (r) => r.attrs.n, { column: 'n', dir: 'asc' }).map((r) => r.attrs.n),
    ).toEqual(['Lisbon', 'Madrid', 'Turin']);
    expect(sortRows(rows, (r) => r.attrs.n, null)).toBe(rows);
  });

  it('keeps blanks at the bottom in both directions', () => {
    const rows = [row({ pop: null }), row({ pop: 5 }), row({ pop: '' }), row({ pop: 1 })];
    expect(
      sortRows(rows, (r) => r.attrs.pop, { column: 'pop', dir: 'asc' }).map((r) => r.attrs.pop),
    ).toEqual([1, 5, null, '']);
    expect(
      sortRows(rows, (r) => r.attrs.pop, { column: 'pop', dir: 'desc' }).map((r) => r.attrs.pop),
    ).toEqual([5, 1, null, '']);
  });

  it('does not reorder the caller\'s array', () => {
    const rows = [row({ pop: 2 }), row({ pop: 1 })];
    sortRows(rows, (r) => r.attrs.pop, { column: 'pop', dir: 'asc' });
    expect(rows.map((r) => r.attrs.pop)).toEqual([2, 1]);
    expect(compareValues(2, 10, 'asc')).toBeLessThan(0);
  });
});

describe('columns', () => {
  it('collects every key in first-seen order', () => {
    expect(
      attributeColumns([{ parcel: 'A', owner: 'Ivanov' }, { parcel: 'B', zone: 'x' }]),
    ).toEqual(['parcel', 'owner', 'zone']);
  });
});

describe('column stats', () => {
  it('summarizes a numeric column', () => {
    expect(columnStats([1, 2, 3, 4, 100])).toEqual({
      count: 5,
      distinct: 5,
      min: 1,
      max: 100,
      mean: 22,
      median: 3,
    });
  });

  it('averages an even count between the middle two', () => {
    expect(columnStats([1, 2, 3, 4]).median).toBe(2.5);
  });

  it('skips blanks and leaves mean and median off a text column', () => {
    expect(columnStats(['b', 'a', 'b', null, ''])).toEqual({
      count: 3,
      distinct: 2,
      min: 'a',
      max: 'b',
      mean: null,
      median: null,
    });
  });

  it('reports nothing for an empty column', () => {
    expect(columnStats([null, ''])).toEqual({
      count: 0,
      distinct: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
    });
  });
});

describe('the layer behind a data source', () => {
  it('reads the store id out of the renderer\'s name, and refuses anything else', () => {
    expect(agentLayerId('agent-layer-0-parcels.geojson')).toBe('0-parcels.geojson');
    expect(agentLayerId('some imported thing')).toBeNull();
  });
});

describe('materializing a field', () => {
  const layer: AgentLayer = {
    id: 'plots',
    name: 'parcels',
    color: '#fff',
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { pop: 10, fill: '#f00' },
          geometry: { type: 'Point', coordinates: [7, 45] },
        },
        {
          type: 'Feature',
          properties: { pop: 20, fill: '#0f0' },
          geometry: { type: 'Point', coordinates: [8, 46] },
        },
      ],
    },
    sourceGeojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { pop: 10 }, geometry: { type: 'Point', coordinates: [7, 45] } },
        { type: 'Feature', properties: { pop: 20 }, geometry: { type: 'Point', coordinates: [8, 46] } },
      ],
    },
  };

  it('writes one value per feature without touching the geometry', () => {
    const next = layerWithField(layer, 'doubled', [20, 40]);
    expect(next.geojson.features.map((f) => f.properties)).toEqual([
      { pop: 10, fill: '#f00', doubled: 20 },
      { pop: 20, fill: '#0f0', doubled: 40 },
    ]);
    expect(next.geojson.features[0].geometry).toEqual(layer.geojson.features[0].geometry);
    expect(layer.geojson.features[0].properties).toEqual({ pop: 10, fill: '#f00' });
  });

  it('puts the field on the pre-styling copy too, so clearing symbology keeps it', () => {
    const next = layerWithField(layer, 'doubled', [20, 40]);
    expect(next.sourceGeojson?.features.map((f) => f.properties)).toEqual([
      { pop: 10, doubled: 20 },
      { pop: 20, doubled: 40 },
    ]);
  });

  it('writes null where the expression produced nothing', () => {
    const next = layerWithField(layer, 'doubled', [20]);
    expect(next.geojson.features[1].properties?.doubled).toBeNull();
  });
});
