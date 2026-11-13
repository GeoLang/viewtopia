import { describe, expect, it } from 'vitest';
import { clipRingToKeptSides, type SectionPoint } from '../../src/features/scene/sectionCut';

const square: SectionPoint[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
];

describe('clipRingToKeptSides', () => {
  it('returns the ring when every point is on the kept side', () => {
    expect(clipRingToKeptSides(square, [{ normal: [1, 0, 0], offset: 5 }])).toEqual(square);
  });

  it('drops a ring that lies entirely on the removed side', () => {
    expect(clipRingToKeptSides(square, [{ normal: [1, 0, 0], offset: -1 }])).toEqual([]);
  });

  it('splits edges at the plane and keeps the side where the dot is not past the offset', () => {
    expect(clipRingToKeptSides(square, [{ normal: [1, 0, 0], offset: 0.5 }])).toEqual([
      [0, 0, 0],
      [0.5, 0, 0],
      [0.5, 1, 0],
      [0, 1, 0],
    ]);
  });

  it('keeps a point within a tenth of a millimetre of the plane', () => {
    const ring: SectionPoint[] = [
      [0, 0, 0],
      [1e-4, 0, 0],
      [1e-4, 1, 0],
    ];
    expect(clipRingToKeptSides(ring, [{ normal: [1, 0, 0], offset: 0 }])).toEqual(ring);

    const past: SectionPoint[] = [
      [0, 0, 0],
      [2e-4, 0, 0],
      [2e-4, 1, 0],
    ];
    const clipped = clipRingToKeptSides(past, [{ normal: [1, 0, 0], offset: 0 }]);
    expect(clipped.some((point) => point[0] > 1e-4)).toBe(false);
    expect(clipped[0]).toEqual([0, 0, 0]);
  });

  it('applies a second plane to the ring the first plane left', () => {
    const clipped = clipRingToKeptSides(square, [
      { normal: [1, 0, 0], offset: 0.5 },
      { normal: [0, 1, 0], offset: 0.25 },
    ]);
    expect(clipped.every((point) => point[0] <= 0.5 + 1e-9 && point[1] <= 0.25 + 1e-9)).toBe(true);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
  });

  it('returns an empty ring unchanged', () => {
    expect(clipRingToKeptSides([], [{ normal: [0, 0, 1], offset: 0 }])).toEqual([]);
  });
});
