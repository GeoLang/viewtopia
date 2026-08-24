import { describe, it, expect } from 'vitest';
import { geojsonToWkbHex, wkbHexToGeojson } from '../../src/lib/wkb';

const GEOMETRIES: GeoJSON.Geometry[] = [
  { type: 'Point', coordinates: [1, 2] },
  { type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0.5]] },
  {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [2, 1], [2, 2], [1, 1]],
    ],
  },
  { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] },
  {
    type: 'MultiLineString',
    coordinates: [
      [[0, 0], [1, 1]],
      [[2, 2], [3, 3], [4, 2]],
    ],
  },
  {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      [[[5, 5], [6, 5], [6, 6], [5, 5]]],
    ],
  },
];

describe('wkb codec', () => {
  for (const geometry of GEOMETRIES) {
    it(`roundtrips a ${geometry.type}`, () => {
      expect(wkbHexToGeojson(geojsonToWkbHex(geometry))).toEqual(geometry);
    });
  }

  it('writes the linestring hex postgis writes', () => {
    // SELECT ST_AsBinary('SRID=4326;LINESTRING(1 2, 3 4)'::geometry)
    expect(
      geojsonToWkbHex({ type: 'LineString', coordinates: [[1, 2], [3, 4]] }),
    ).toBe(
      '010200000002000000000000000000f03f000000000000004000000000000008400000000000001040',
    );
  });

  it('refuses a geometry type it does not cover', () => {
    expect(() =>
      geojsonToWkbHex({ type: 'GeometryCollection', geometries: [] }),
    ).toThrow('unsupported');
    // type 7 is GeometryCollection
    expect(() => wkbHexToGeojson('0107000000')).toThrow('unsupported');
  });

  it('refuses a multi geometry whose member is another type', () => {
    // MultiPoint header claiming one member, but the member is a LineString
    const memberless =
      '010400000001000000' + geojsonToWkbHex({ type: 'LineString', coordinates: [[0, 0], [1, 1]] });
    expect(() => wkbHexToGeojson(memberless)).toThrow('expected member type 1');
  });
});
