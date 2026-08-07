import { describe, it, expect } from 'vitest';
import {
  compareFractionalIndex,
  generateIndexBetween,
} from '../../src/live/fractionalIndex';

describe('fractional index', () => {
  it('generates a first index and keeps appends ascending', () => {
    const first = generateIndexBetween(null, null);
    expect(first.length).toBeGreaterThan(0);
    let previous = first;
    for (let append = 0; append < 20; append += 1) {
      const next = generateIndexBetween(previous, null);
      expect(next > previous).toBe(true);
      previous = next;
    }
  });

  it('generates before the first index', () => {
    let first = generateIndexBetween(null, null);
    for (let prepend = 0; prepend < 20; prepend += 1) {
      const next = generateIndexBetween(null, first);
      expect(next < first).toBe(true);
      first = next;
    }
  });

  it('keeps repeated midpoints between adjacent indices strictly between them', () => {
    const lower = generateIndexBetween(null, null);
    let upper = generateIndexBetween(lower, null);
    for (let insert = 0; insert < 60; insert += 1) {
      const middle = generateIndexBetween(lower, upper);
      expect(middle > lower).toBe(true);
      expect(middle < upper).toBe(true);
      upper = middle;
    }
  });

  it('keeps repeated midpoints above the lower bound when inserting upward', () => {
    let lower = generateIndexBetween(null, null);
    const upper = generateIndexBetween(lower, null);
    for (let insert = 0; insert < 60; insert += 1) {
      const middle = generateIndexBetween(lower, upper);
      expect(middle > lower).toBe(true);
      expect(middle < upper).toBe(true);
      lower = middle;
    }
  });

  it('orders a list built by random insertions', () => {
    const indexes: string[] = [generateIndexBetween(null, null)];
    for (let insert = 0; insert < 200; insert += 1) {
      const at = Math.floor(Math.random() * (indexes.length + 1));
      const generated = generateIndexBetween(indexes[at - 1] ?? null, indexes[at] ?? null);
      indexes.splice(at, 0, generated);
    }
    const sorted = [...indexes].sort(compareFractionalIndex);
    expect(sorted).toEqual(indexes);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('never generates an index ending in the lowest digit', () => {
    let upper = generateIndexBetween(null, null);
    for (let insert = 0; insert < 40; insert += 1) {
      upper = generateIndexBetween(null, upper);
      expect(upper.endsWith('0')).toBe(false);
    }
  });

  it('rejects a lower bound that is not below the upper bound', () => {
    expect(() => generateIndexBetween('V', 'V')).toThrow();
    expect(() => generateIndexBetween('W', 'V')).toThrow();
  });

  it('rejects indexes outside the base62 alphabet', () => {
    expect(() => generateIndexBetween('!', null)).toThrow();
    expect(() => generateIndexBetween('', null)).toThrow();
  });

  it('compares indexes as plain strings', () => {
    expect(compareFractionalIndex('A', 'B')).toBe(-1);
    expect(compareFractionalIndex('B', 'A')).toBe(1);
    expect(compareFractionalIndex('A', 'A')).toBe(0);
  });
});
