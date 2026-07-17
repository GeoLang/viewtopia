import { describe, it, expect } from 'vitest';
import { buildChartData } from '../../src/components/tools/ChartsPanel';

describe('charts panel attribute binning', () => {
  it('bins numeric attributes into a histogram', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const data = buildChartData(values);
    expect(data).toHaveLength(8);
    expect(data.reduce((s, d) => s + d.value, 0)).toBe(100);
  });

  it('counts categorical attributes', () => {
    const data = buildChartData(['a', 'a', 'b', null, undefined]);
    expect(data).toEqual([
      { label: 'a', value: 2 },
      { label: 'b', value: 1 },
    ]);
  });

  it('rolls long category tails into other', () => {
    const values = Array.from({ length: 20 }, (_, i) => `cat${i}`);
    const data = buildChartData(values);
    expect(data).toHaveLength(9);
    expect(data[data.length - 1]).toEqual({ label: 'other', value: 12 });
  });

  it('returns empty for empty input', () => {
    expect(buildChartData([])).toEqual([]);
    expect(buildChartData([null, ''])).toEqual([]);
  });
});
