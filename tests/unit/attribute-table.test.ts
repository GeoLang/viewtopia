import { describe, it, expect } from 'vitest';
import {
  attributeColumns,
  columnStats,
  compareValues,
  nextSort,
  sortRows,
} from '../../src/features/attributes/attributes';

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
