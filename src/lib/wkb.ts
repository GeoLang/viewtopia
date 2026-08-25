// WKB codec for the seven OGC geometry types. Reading accepts either byte
// order, ISO type codes (base + 1000 Z, + 2000 M, + 3000 ZM) and the EWKB flag
// bits PostGIS writes, including an embedded SRID. Writing is little-endian
// ISO: Z when the geometry carries a third ordinate, never M, no SRID.

const WKB_POINT = 1;
const WKB_LINESTRING = 2;
const WKB_POLYGON = 3;
const WKB_MULTIPOINT = 4;
const WKB_MULTILINESTRING = 5;
const WKB_MULTIPOLYGON = 6;
const WKB_GEOMETRYCOLLECTION = 7;

const ISO_Z_OFFSET = 1000;
const ISO_M_OFFSET = 2000;
const ISO_ZM_OFFSET = 3000;

const EWKB_Z_FLAG = 0x80000000;
const EWKB_M_FLAG = 0x40000000;
const EWKB_SRID_FLAG = 0x20000000;
const EWKB_TYPE_MASK = 0x1fffffff;

const LITTLE_ENDIAN_BYTE = 1;

type Ring = number[][];

function pushUint32LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
}

function pushDoubleLE(out: number[], v: number): void {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, v, true);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 8; i++) out.push(bytes[i]);
}

function pushHeader(out: number[], type: number, withZ: boolean): void {
  out.push(LITTLE_ENDIAN_BYTE);
  pushUint32LE(out, withZ ? type + ISO_Z_OFFSET : type);
}

function pushPosition(out: number[], position: number[], withZ: boolean): void {
  pushDoubleLE(out, position[0]);
  pushDoubleLE(out, position[1]);
  if (withZ) pushDoubleLE(out, position[2] ?? 0);
}

function pushPositions(out: number[], positions: number[][], withZ: boolean): void {
  pushUint32LE(out, positions.length);
  for (const position of positions) pushPosition(out, position, withZ);
}

function pushRings(out: number[], rings: Ring[], withZ: boolean): void {
  pushUint32LE(out, rings.length);
  for (const ring of rings) pushPositions(out, ring, withZ);
}

function firstPosition(geom: GeoJSON.Geometry): number[] | undefined {
  switch (geom.type) {
    case 'Point':
      return geom.coordinates;
    case 'LineString':
    case 'MultiPoint':
      return geom.coordinates[0];
    case 'Polygon':
    case 'MultiLineString':
      return geom.coordinates[0]?.[0];
    case 'MultiPolygon':
      return geom.coordinates[0]?.[0]?.[0];
    case 'GeometryCollection':
      return undefined;
  }
}

/** Every position of a written geometry gets Z when its first one has it. */
function hasThirdOrdinate(geom: GeoJSON.Geometry): boolean {
  return (firstPosition(geom)?.length ?? 0) >= 3;
}

function pushGeometry(out: number[], geom: GeoJSON.Geometry): void {
  const withZ = hasThirdOrdinate(geom);
  switch (geom.type) {
    case 'Point':
      pushHeader(out, WKB_POINT, withZ);
      pushPosition(out, geom.coordinates, withZ);
      return;
    case 'LineString':
      pushHeader(out, WKB_LINESTRING, withZ);
      pushPositions(out, geom.coordinates, withZ);
      return;
    case 'Polygon':
      pushHeader(out, WKB_POLYGON, withZ);
      pushRings(out, geom.coordinates, withZ);
      return;
    case 'MultiPoint':
      pushHeader(out, WKB_MULTIPOINT, withZ);
      pushUint32LE(out, geom.coordinates.length);
      for (const position of geom.coordinates) {
        pushHeader(out, WKB_POINT, withZ);
        pushPosition(out, position, withZ);
      }
      return;
    case 'MultiLineString':
      pushHeader(out, WKB_MULTILINESTRING, withZ);
      pushUint32LE(out, geom.coordinates.length);
      for (const line of geom.coordinates) {
        pushHeader(out, WKB_LINESTRING, withZ);
        pushPositions(out, line, withZ);
      }
      return;
    case 'MultiPolygon':
      pushHeader(out, WKB_MULTIPOLYGON, withZ);
      pushUint32LE(out, geom.coordinates.length);
      for (const polygon of geom.coordinates) {
        pushHeader(out, WKB_POLYGON, withZ);
        pushRings(out, polygon, withZ);
      }
      return;
    case 'GeometryCollection':
      pushHeader(out, WKB_GEOMETRYCOLLECTION, false);
      pushUint32LE(out, geom.geometries.length);
      for (const member of geom.geometries) pushGeometry(out, member);
      return;
    default:
      throw new Error(`geojsonToWkbHex: unsupported geometry ${(geom as GeoJSON.Geometry).type}`);
  }
}

export function geojsonToWkbHex(geom: GeoJSON.Geometry): string {
  const out: number[] = [];
  pushGeometry(out, geom);
  return out.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface WkbHeader {
  littleEndian: boolean;
  type: number;
  hasZ: boolean;
  hasM: boolean;
}

class WkbReader {
  private view: DataView;
  private pos = 0;

  constructor(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    this.view = new DataView(bytes.buffer);
  }

  private uint32(le: boolean): number {
    const v = this.view.getUint32(this.pos, le);
    this.pos += 4;
    return v;
  }

  private double(le: boolean): number {
    const v = this.view.getFloat64(this.pos, le);
    this.pos += 8;
    return v;
  }

  private header(): WkbHeader {
    const littleEndian = this.view.getUint8(this.pos++) === LITTLE_ENDIAN_BYTE;
    const raw = this.uint32(littleEndian);
    let hasZ = (raw & EWKB_Z_FLAG) !== 0;
    let hasM = (raw & EWKB_M_FLAG) !== 0;
    const hasSrid = (raw & EWKB_SRID_FLAG) !== 0;
    let type = (raw & EWKB_TYPE_MASK) >>> 0;
    if (type >= ISO_ZM_OFFSET) {
      type -= ISO_ZM_OFFSET;
      hasZ = true;
      hasM = true;
    } else if (type >= ISO_M_OFFSET) {
      type -= ISO_M_OFFSET;
      hasM = true;
    } else if (type >= ISO_Z_OFFSET) {
      type -= ISO_Z_OFFSET;
      hasZ = true;
    }
    if (hasSrid) this.uint32(littleEndian);
    return { littleEndian, type, hasZ, hasM };
  }

  // M has no place in a GeoJSON position, so it is read past and dropped
  private position(head: WkbHeader): number[] {
    const x = this.double(head.littleEndian);
    const y = this.double(head.littleEndian);
    const z = head.hasZ ? this.double(head.littleEndian) : null;
    if (head.hasM) this.double(head.littleEndian);
    return z === null ? [x, y] : [x, y, z];
  }

  private readPositions(head: WkbHeader): number[][] {
    const count = this.uint32(head.littleEndian);
    const positions: number[][] = [];
    for (let i = 0; i < count; i++) positions.push(this.position(head));
    return positions;
  }

  private readRings(head: WkbHeader): number[][][] {
    const count = this.uint32(head.littleEndian);
    const rings: number[][][] = [];
    for (let r = 0; r < count; r++) rings.push(this.readPositions(head));
    return rings;
  }

  // each member of a multi geometry is a full WKB geometry with its own
  // byte-order flag and its own dimensions
  private member(expected: number): WkbHeader {
    const head = this.header();
    if (head.type !== expected) {
      throw new Error(`wkbHexToGeojson: expected member type ${expected}, got ${head.type}`);
    }
    return head;
  }

  geometry(): GeoJSON.Geometry {
    const head = this.header();
    const le = head.littleEndian;
    switch (head.type) {
      case WKB_POINT:
        return { type: 'Point', coordinates: this.position(head) };
      case WKB_LINESTRING:
        return { type: 'LineString', coordinates: this.readPositions(head) };
      case WKB_POLYGON:
        return { type: 'Polygon', coordinates: this.readRings(head) };
      case WKB_MULTIPOINT: {
        const count = this.uint32(le);
        const points: number[][] = [];
        for (let i = 0; i < count; i++) points.push(this.position(this.member(WKB_POINT)));
        return { type: 'MultiPoint', coordinates: points };
      }
      case WKB_MULTILINESTRING: {
        const count = this.uint32(le);
        const lines: number[][][] = [];
        for (let i = 0; i < count; i++) lines.push(this.readPositions(this.member(WKB_LINESTRING)));
        return { type: 'MultiLineString', coordinates: lines };
      }
      case WKB_MULTIPOLYGON: {
        const count = this.uint32(le);
        const polygons: number[][][][] = [];
        for (let i = 0; i < count; i++) polygons.push(this.readRings(this.member(WKB_POLYGON)));
        return { type: 'MultiPolygon', coordinates: polygons };
      }
      case WKB_GEOMETRYCOLLECTION: {
        const count = this.uint32(le);
        const geometries: GeoJSON.Geometry[] = [];
        for (let i = 0; i < count; i++) geometries.push(this.geometry());
        return { type: 'GeometryCollection', geometries };
      }
      default:
        throw new Error(`wkbHexToGeojson: unsupported WKB type ${head.type}`);
    }
  }
}

export function wkbHexToGeojson(hex: string): GeoJSON.Geometry {
  return new WkbReader(hex).geometry();
}

function positionsOf(geom: GeoJSON.Geometry): number[][] {
  switch (geom.type) {
    case 'Point':
      return [geom.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geom.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geom.coordinates.flat();
    case 'MultiPolygon':
      return geom.coordinates.flat(2);
    case 'GeometryCollection':
      return [];
  }
}

function averagePosition(positions: number[][]): [number, number] | null {
  if (positions.length === 0) return null;
  const sumX = positions.reduce((sum, p) => sum + p[0], 0);
  const sumY = positions.reduce((sum, p) => sum + p[1], 0);
  return [sumX / positions.length, sumY / positions.length];
}

export function geometryCentroid(geom: GeoJSON.Geometry): [number, number] | null {
  if (geom.type === 'GeometryCollection') {
    const centroids = geom.geometries
      .map(geometryCentroid)
      .filter((c): c is [number, number] => c !== null);
    return averagePosition(centroids);
  }
  return averagePosition(positionsOf(geom));
}
