import { describe, it, expect } from 'vitest';
import { INDEX_PRESETS } from '../../src/raster/indices';
import { equalIntervals } from '../../src/raster/ReclassEditor';
import { computeBandMath } from '../../src/raster/operations';

describe('index presets', () => {
  it('every preset picks as many default bands as it has roles', () => {
    for (const [key, preset] of Object.entries(INDEX_PRESETS)) {
      expect(preset.defaults, key).toHaveLength(preset.roles.length);
    }
  });

  it('evi evaluates its expression over the picked bands', () => {
    const preset = INDEX_PRESETS.evi;
    // bands 1..3 = blue, red, nir, so the picked 0-indexed set is [2, 1, 0]
    const blue = new Float32Array([0.05]);
    const red = new Float32Array([0.1]);
    const nir = new Float32Array([0.5]);

    const res = computeBandMath([blue, red, nir], 1, 1, {
      expression: preset.expression!([3, 2, 1]),
      operation: preset.operation,
      colorMap: preset.ramp,
    }, null);

    const expected = (2.5 * (0.5 - 0.1)) / (0.5 + 6 * 0.1 - 7.5 * 0.05 + 1);
    expect(res.data[0]).toBeCloseTo(expected, 5);
    expect(res.operation).toBe('evi');
    expect(res.colorMap).toBe('greens');
  });

  it('band math still defaults to its own label when a preset does not set one', () => {
    const res = computeBandMath([new Float32Array([2])], 1, 1, { expression: 'b1 * 3' }, null);
    expect(res.data[0]).toBe(6);
    expect(res.operation).toBe('band-math');
  });
});

describe('equalIntervals', () => {
  it('splits the range into contiguous classes numbered from one', () => {
    const classes = equalIntervals(0, 100, 4);

    expect(classes).toHaveLength(4);
    expect(classes.map((c) => c.value)).toEqual([1, 2, 3, 4]);
    expect(classes[0].min).toBe(0);
    for (let i = 1; i < classes.length; i++) {
      expect(classes[i].min).toBe(classes[i - 1].max);
    }
  });

  it('pushes the top class past the maximum, which reclass excludes', () => {
    const classes = equalIntervals(0, 100, 4);
    expect(classes[3].max).toBeGreaterThan(100);
  });

  it('returns nothing for a non-finite range', () => {
    expect(equalIntervals(Infinity, -Infinity, 3)).toEqual([]);
  });
});
