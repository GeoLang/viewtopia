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
  {
    type: 'GeometryCollection',
    geometries: [
      { type: 'Point', coordinates: [1, 2] },
      { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    ],
  },
];

/** IEEE 754 doubles little-endian, the coordinate values the fixtures below use. */
const DOUBLE_HEX: Record<number, string> = {
  0: '0000000000000000',
  1: '000000000000f03f',
  2: '0000000000000040',
  3: '0000000000000840',
  5: '0000000000001440',
  9: '0000000000002240',
  10: '0000000000002440',
  20: '0000000000003440',
};

const LITTLE_ENDIAN = '01';
const POINT_HEADER = `${LITTLE_ENDIAN}01000000`;
const LINESTRING_HEADER = `${LITTLE_ENDIAN}02000000`;
const COUNT_HEX: Record<number, string> = {
  1: '01000000',
  2: '02000000',
  4: '04000000',
};

const POINT_2D_HEX = POINT_HEADER + DOUBLE_HEX[1] + DOUBLE_HEX[2];
// type 1001, POINT Z (1 2 3)
const POINT_Z_ISO_HEX =
  `${LITTLE_ENDIAN}e9030000` + DOUBLE_HEX[1] + DOUBLE_HEX[2] + DOUBLE_HEX[3];
// the same point with the EWKB Z flag bit instead of the ISO offset
const POINT_Z_EWKB_HEX =
  `${LITTLE_ENDIAN}01000080` + DOUBLE_HEX[1] + DOUBLE_HEX[2] + DOUBLE_HEX[3];
// SRID=4326;POINT(1 2), the EWKB PostGIS writes without ST_AsBinary
const POINT_SRID_EWKB_HEX =
  `${LITTLE_ENDIAN}01000020e6100000` + DOUBLE_HEX[1] + DOUBLE_HEX[2];
// type 3003, POLYGON ZM with one ring, every position (z 5, m 9)
const ZM_POSITIONS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
];
const POLYGON_ZM_HEX =
  `${LITTLE_ENDIAN}bb0b0000` +
  COUNT_HEX[1] +
  COUNT_HEX[4] +
  ZM_POSITIONS.map(
    ([x, y]) => DOUBLE_HEX[x] + DOUBLE_HEX[y] + DOUBLE_HEX[5] + DOUBLE_HEX[9],
  ).join('');
// type 7, GEOMETRYCOLLECTION(POINT(1 2), LINESTRING(0 0, 1 1))
const GEOMETRY_COLLECTION_HEX =
  `${LITTLE_ENDIAN}07000000` +
  COUNT_HEX[2] +
  POINT_2D_HEX +
  LINESTRING_HEADER +
  COUNT_HEX[2] +
  DOUBLE_HEX[0] +
  DOUBLE_HEX[0] +
  DOUBLE_HEX[1] +
  DOUBLE_HEX[1];

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

  it('refuses a WKB type it does not cover', () => {
    // type 8 is CircularString
    expect(() => wkbHexToGeojson('0108000000')).toThrow('unsupported WKB type 8');
  });

  it('spells its fixture doubles the way the encoder does', () => {
    for (const [value, hex] of Object.entries(DOUBLE_HEX)) {
      expect(geojsonToWkbHex({ type: 'Point', coordinates: [Number(value), 0] })).toBe(
        POINT_HEADER + hex + DOUBLE_HEX[0],
      );
    }
  });

  it('reads a Z point written either way', () => {
    const flat = wkbHexToGeojson(POINT_2D_HEX);
    expect(flat).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(wkbHexToGeojson(POINT_Z_ISO_HEX)).toEqual({ type: 'Point', coordinates: [1, 2, 3] });
    expect(wkbHexToGeojson(POINT_Z_EWKB_HEX)).toEqual({ type: 'Point', coordinates: [1, 2, 3] });
  });

  it('reads past an embedded SRID', () => {
    expect(wkbHexToGeojson(POINT_SRID_EWKB_HEX)).toEqual({ type: 'Point', coordinates: [1, 2] });
  });

  it('keeps Z and drops M', () => {
    expect(wkbHexToGeojson(POLYGON_ZM_HEX)).toEqual({
      type: 'Polygon',
      coordinates: [[[0, 0, 5], [1, 0, 5], [1, 1, 5], [0, 0, 5]]],
    });
  });

  it('reads and writes a geometry collection', () => {
    const collection: GeoJSON.Geometry = {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 2] },
        { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      ],
    };
    expect(wkbHexToGeojson(GEOMETRY_COLLECTION_HEX)).toEqual(collection);
    expect(geojsonToWkbHex(collection)).toBe(GEOMETRY_COLLECTION_HEX);
  });

  it('roundtrips a LineString carrying Z', () => {
    const line: GeoJSON.Geometry = { type: 'LineString', coordinates: [[0, 0, 10], [1, 1, 20]] };
    expect(geojsonToWkbHex(line)).toBe(
      `${LITTLE_ENDIAN}ea030000` +
        COUNT_HEX[2] +
        DOUBLE_HEX[0] +
        DOUBLE_HEX[0] +
        DOUBLE_HEX[10] +
        DOUBLE_HEX[1] +
        DOUBLE_HEX[1] +
        DOUBLE_HEX[20],
    );
    expect(wkbHexToGeojson(geojsonToWkbHex(line))).toEqual(line);
  });

  it('fills Z for a position that has none', () => {
    const line: GeoJSON.Geometry = { type: 'LineString', coordinates: [[0, 0, 10], [1, 1]] };
    expect(wkbHexToGeojson(geojsonToWkbHex(line))).toEqual({
      type: 'LineString',
      coordinates: [[0, 0, 10], [1, 1, 0]],
    });
  });

  it('refuses a multi geometry whose member is another type', () => {
    // MultiPoint header claiming one member, but the member is a LineString
    const memberless =
      '010400000001000000' + geojsonToWkbHex({ type: 'LineString', coordinates: [[0, 0], [1, 1]] });
    expect(() => wkbHexToGeojson(memberless)).toThrow('expected member type 1');
  });
});
