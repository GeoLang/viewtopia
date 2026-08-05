/**
 * topoi computes in a plane while layers carry lon/lat, so every op runs in a
 * local equirectangular frame in meters, centred on the combined bbox of its
 * inputs. That is what makes a buffer distance, a simplify tolerance and a grid
 * cell mean meters, and what keeps voronoi cells and nearest-neighbour
 * distances isotropic instead of stretched by the latitude the data sits at.
 */

export type Bbox = [number, number, number, number];

export interface Frame {
  lon0: number;
  lat0: number;
  /** meters per degree of longitude at lat0 */
  mPerDegLon: number;
  mPerDegLat: number;
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON_EQUATOR = 111320;

/** A frame centred on `bbox`, which every input of one op shares. */
export function frameFor(bbox: Bbox): Frame {
  const lon0 = (bbox[0] + bbox[2]) / 2;
  const lat0 = (bbox[1] + bbox[3]) / 2;
  return {
    lon0,
    lat0,
    mPerDegLon: M_PER_DEG_LON_EQUATOR * Math.cos((lat0 * Math.PI) / 180),
    mPerDegLat: M_PER_DEG_LAT,
  };
}

function toMeters(frame: Frame, c: number[]): number[] {
  return [
    (c[0] - frame.lon0) * frame.mPerDegLon,
    (c[1] - frame.lat0) * frame.mPerDegLat,
    ...c.slice(2),
  ];
}

function toDegrees(frame: Frame, c: number[]): number[] {
  return [c[0] / frame.mPerDegLon + frame.lon0, c[1] / frame.mPerDegLat + frame.lat0, ...c.slice(2)];
}

type Mapper = (c: number[]) => number[];

function mapCoords(coords: unknown, fn: Mapper): unknown {
  const arr = coords as unknown[];
  if (typeof arr[0] === 'number') return fn(arr as number[]);
  return arr.map((c) => mapCoords(c, fn));
}

function eachCoord(coords: unknown, fn: (c: number[]) => void): void {
  const arr = coords as unknown[];
  if (typeof arr[0] === 'number') {
    fn(arr as number[]);
    return;
  }
  for (const c of arr) eachCoord(c, fn);
}

function mapGeometry(g: GeoJSON.Geometry, fn: Mapper): GeoJSON.Geometry {
  if (g.type === 'GeometryCollection') {
    return { ...g, geometries: g.geometries.map((inner) => mapGeometry(inner, fn)) };
  }
  return { ...g, coordinates: mapCoords(g.coordinates, fn) } as GeoJSON.Geometry;
}

function mapFc(fc: GeoJSON.FeatureCollection, fn: Mapper): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) =>
      f.geometry ? { ...f, geometry: mapGeometry(f.geometry, fn) } : f,
    ),
  };
}

export function projectFc(fc: GeoJSON.FeatureCollection, frame: Frame): GeoJSON.FeatureCollection {
  return mapFc(fc, (c) => toMeters(frame, c));
}

export function unprojectFc(fc: GeoJSON.FeatureCollection, frame: Frame): GeoJSON.FeatureCollection {
  return mapFc(fc, (c) => toDegrees(frame, c));
}

export function projectBbox(bbox: Bbox, frame: Frame): Bbox {
  const [minX, minY] = toMeters(frame, [bbox[0], bbox[1]]);
  const [maxX, maxY] = toMeters(frame, [bbox[2], bbox[3]]);
  return [minX, minY, maxX, maxY];
}

/** Bbox over every coordinate of `fcs`, widened by any `boxes` given. */
export function bboxOf(fcs: GeoJSON.FeatureCollection[], boxes: Bbox[] = []): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const fold = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const fc of fcs) {
    for (const f of fc.features) {
      if (f.geometry) eachCoord(coordsOf(f.geometry), ([x, y]) => fold(x, y));
    }
  }
  for (const box of boxes) {
    fold(box[0], box[1]);
    fold(box[2], box[3]);
  }

  if (!Number.isFinite(minX)) throw new Error('the input has no coordinates');
  return [minX, minY, maxX, maxY];
}

function coordsOf(g: GeoJSON.Geometry): unknown {
  return g.type === 'GeometryCollection' ? g.geometries.map(coordsOf) : g.coordinates;
}
