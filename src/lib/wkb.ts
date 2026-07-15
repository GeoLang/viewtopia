// Minimal WKB codec for the geometry types the real-estate flow uses:
// 2D Point, Polygon, MultiPolygon. Little-endian, no embedded SRID.
// ptolemy stores geometry as SRID 4326 and returns plain WKB via ST_AsBinary,
// so we neither read nor write an SRID flag here.

const WKB_POINT = 1;
const WKB_POLYGON = 3;
const WKB_MULTIPOLYGON = 6;

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

function pushRings(out: number[], rings: Ring[]): void {
  pushUint32LE(out, rings.length);
  for (const ring of rings) {
    pushUint32LE(out, ring.length);
    for (const [x, y] of ring) {
      pushDoubleLE(out, x);
      pushDoubleLE(out, y);
    }
  }
}

export function geojsonToWkbHex(geom: GeoJSON.Geometry): string {
  const out: number[] = [];
  switch (geom.type) {
    case 'Point': {
      out.push(1);
      pushUint32LE(out, WKB_POINT);
      const [x, y] = geom.coordinates;
      pushDoubleLE(out, x);
      pushDoubleLE(out, y);
      break;
    }
    case 'Polygon': {
      out.push(1);
      pushUint32LE(out, WKB_POLYGON);
      pushRings(out, geom.coordinates);
      break;
    }
    case 'MultiPolygon': {
      out.push(1);
      pushUint32LE(out, WKB_MULTIPOLYGON);
      pushUint32LE(out, geom.coordinates.length);
      for (const poly of geom.coordinates) {
        out.push(1);
        pushUint32LE(out, WKB_POLYGON);
        pushRings(out, poly);
      }
      break;
    }
    default:
      throw new Error(`geojsonToWkbHex: unsupported geometry ${geom.type}`);
  }
  return out.map((b) => b.toString(16).padStart(2, '0')).join('');
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

  private littleEndian(): boolean {
    return this.view.getUint8(this.pos++) === 1;
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

  private readRings(le: boolean): number[][][] {
    const numRings = this.uint32(le);
    const rings: number[][][] = [];
    for (let r = 0; r < numRings; r++) {
      const numPts = this.uint32(le);
      const ring: number[][] = [];
      for (let p = 0; p < numPts; p++) {
        ring.push([this.double(le), this.double(le)]);
      }
      rings.push(ring);
    }
    return rings;
  }

  geometry(): GeoJSON.Geometry {
    const le = this.littleEndian();
    const type = this.uint32(le);
    switch (type) {
      case WKB_POINT:
        return { type: 'Point', coordinates: [this.double(le), this.double(le)] };
      case WKB_POLYGON:
        return { type: 'Polygon', coordinates: this.readRings(le) };
      case WKB_MULTIPOLYGON: {
        const numPolys = this.uint32(le);
        const polys: number[][][][] = [];
        for (let i = 0; i < numPolys; i++) {
          this.littleEndian();
          this.uint32(le); // inner type, always polygon
          polys.push(this.readRings(le));
        }
        return { type: 'MultiPolygon', coordinates: polys };
      }
      default:
        throw new Error(`wkbHexToGeojson: unsupported WKB type ${type}`);
    }
  }
}

export function wkbHexToGeojson(hex: string): GeoJSON.Geometry {
  return new WkbReader(hex).geometry();
}

export function geometryCentroid(geom: GeoJSON.Geometry): [number, number] | null {
  const coords: number[][] = [];
  const walk = (g: GeoJSON.Geometry): void => {
    switch (g.type) {
      case 'Point':
        coords.push(g.coordinates);
        break;
      case 'MultiPoint':
      case 'LineString':
        coords.push(...g.coordinates);
        break;
      case 'MultiLineString':
      case 'Polygon':
        g.coordinates.forEach((ring) => coords.push(...ring));
        break;
      case 'MultiPolygon':
        g.coordinates.forEach((poly) => poly.forEach((ring) => coords.push(...ring)));
        break;
    }
  };
  walk(geom);
  if (coords.length === 0) return null;
  const sx = coords.reduce((s, c) => s + c[0], 0);
  const sy = coords.reduce((s, c) => s + c[1], 0);
  return [sx / coords.length, sy / coords.length];
}
