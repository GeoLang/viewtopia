import { describe, expect, it } from 'vitest';
import {
  alignmentsFrom,
  crossSectionPlane,
  stationAt,
  type AlignmentStation,
} from '../../src/features/scene/alignmentSection';

function station(distance: number, position: [number, number, number], tangent: [number, number, number]): AlignmentStation {
  return { distance, position, tangent };
}

const road = [
  station(0, [0, 0, 0], [2, 0, 0]),
  station(10, [10, 0, 0], [0, 4, 0]),
  station(20, [10, 10, 0], [0, 1, 0]),
];

describe('stationAt', () => {
  it('returns nothing for an empty curve', () => {
    expect(stationAt([], 4)).toBeNull();
  });

  it('stays on the only station and makes its tangent a unit', () => {
    const only = stationAt([station(3, [1, 2, 3], [0, 0, 5])], 100);
    expect(only).toEqual({ distance: 3, position: [1, 2, 3], tangent: [0, 0, 1] });
  });

  it('clamps before the start and after the end', () => {
    expect(stationAt(road, -5)?.position).toEqual([0, 0, 0]);
    expect(stationAt(road, 40)?.position).toEqual([10, 10, 0]);
    expect(stationAt(road, 40)?.distance).toBe(20);
  });

  it('interpolates position and keeps the tangent of the station behind', () => {
    const at = stationAt(road, 4);
    expect(at?.distance).toBe(4);
    expect(at?.position).toEqual([4, 0, 0]);
    expect(at?.tangent).toEqual([1, 0, 0]);

    const corner = stationAt(road, 10);
    expect(corner?.position).toEqual([10, 0, 0]);
    expect(corner?.tangent).toEqual([1, 0, 0]);
  });

  it('uses the next tangent when the station behind has none', () => {
    const at = stationAt(
      [station(0, [0, 0, 0], [0, 0, 0]), station(8, [0, 8, 0], [0, 2, 0])],
      2,
    );
    expect(at?.position).toEqual([0, 2, 0]);
    expect(at?.tangent).toEqual([0, 1, 0]);
  });

  it('does not move when two stations share a distance', () => {
    const at = stationAt(
      [station(5, [1, 0, 0], [1, 0, 0]), station(5, [9, 0, 0], [0, 1, 0])],
      5,
    );
    expect(at?.position).toEqual([1, 0, 0]);
  });
});

describe('crossSectionPlane', () => {
  it('removes the side in front of a unit tangent', () => {
    expect(crossSectionPlane(station(4, [1, 3, 0], [0, 2, 0]))).toEqual({
      normal: [0, 1, 0],
      offset: 3,
    });
  });

  it('returns nothing for a zero tangent', () => {
    expect(crossSectionPlane(station(0, [1, 2, 3], [0, 0, 0]))).toBeNull();
  });
});

describe('alignmentsFrom', () => {
  const road = {
    id: 'road',
    name: 'Road',
    length: 10,
    approximate: false,
    stations: [{ distance: 0, position: [0, 0, 0], tangent: [1, 0, 0] }],
  };

  it('reads a list and drops a curve or a station that is not a point', () => {
    expect(
      alignmentsFrom([
        road,
        { id: 'bare' },
        null,
        {
          id: 'gap',
          name: 4,
          length: Number.NaN,
          approximate: 'yes',
          stations: [{ distance: 1, position: [1, 2], tangent: [0, 1, 0] }, road.stations[0]],
        },
      ]),
    ).toEqual([
      road,
      {
        id: 'gap',
        name: '',
        length: 0,
        approximate: false,
        stations: [road.stations[0]],
      },
    ]);
  });

  it('refuses a payload that is not a list', () => {
    expect(() => alignmentsFrom({ alignments: [] })).toThrow('not a list');
    expect(() => alignmentsFrom(null)).toThrow('not a list');
  });
});
