import { beforeEach, describe, expect, it } from 'vitest';
import { useMeasureStore } from '../../src/store/measure';

describe('measure snapping', () => {
  beforeEach(() => {
    useMeasureStore.setState({ mode: null, pending: [], liveDistance: 0, results: [] });
  });

  it('keeps a ground distance on the ellipsoid', () => {
    const { setMode, addPoint, finishMeasure } = useMeasureStore.getState();
    setMode('distance');
    addPoint(0, 0);
    addPoint(0, 1);
    finishMeasure();

    const result = useMeasureStore.getState().results[0];
    expect(result.unit).toBe('km');
    expect(result.value).toBeCloseTo(111.195, 0);
    expect(result.points).toEqual([[0, 0], [0, 1]]);
  });

  it('measures a vertical snap as the height between the points', () => {
    const { setMode, addPoint, finishMeasure } = useMeasureStore.getState();
    setMode('distance');
    addPoint(0, 0, 0);
    addPoint(0, 0, 10);
    finishMeasure();

    const result = useMeasureStore.getState().results[0];
    expect(result.unit).toBe('m');
    expect(result.value).toBeCloseTo(10, 1);
    expect(result.points[1]).toEqual([0, 0, 10]);
  });

  it('measures the area of a face that stands off the ground', () => {
    const { setMode, addPoint, finishMeasure } = useMeasureStore.getState();
    setMode('area');
    addPoint(0, 0, 0);
    addPoint(0.0001, 0, 0);
    addPoint(0.0001, 0, 10);
    addPoint(0, 0, 10);
    finishMeasure();

    const result = useMeasureStore.getState().results[0];
    expect(result.unit).toBe('m²');
    expect(result.value).toBeGreaterThan(100);
    expect(result.value).toBeLessThan(120);
  });
});
