import { create } from 'zustand';

export type DrawMode = 'point' | 'line' | 'polygon' | 'circle' | 'rectangle' | null;

export interface DrawnFeature {
  id: string;
  type: 'Point' | 'LineString' | 'Polygon' | 'Circle';
  coords: [number, number][]; // [lng, lat] pairs
  radius?: number; // for circle, in meters
  color: string;
  lineWidth: number;
  /** Free-form attributes, editable via the GeoJSON editor. */
  properties?: Record<string, string>;
}

interface DrawState {
  mode: DrawMode;
  color: string;
  lineWidth: number;
  features: DrawnFeature[];
  /** Points being drawn for the current in-progress shape */
  pending: [number, number][];
  setMode: (m: DrawMode) => void;
  setColor: (c: string) => void;
  setLineWidth: (w: number) => void;
  addPendingPoint: (lng: number, lat: number) => void;
  finishFeature: () => void;
  cancelPending: () => void;
  removeFeature: (id: string) => void;
  /** Replace a feature's full attribute map (GeoJSON editor). */
  setFeatureProperties: (id: string, properties: Record<string, string>) => void;
  clearAll: () => void;
  /** The geometry whose vertices the map is currently letting the user drag. */
  vertexEdit: { geometry: GeoJSON.Geometry } | null;
  startVertexEdit: (geometry: GeoJSON.Geometry) => void;
  moveVertex: (path: number[], position: [number, number]) => void;
  stopVertexEdit: () => void;
}

/** One position, or a list of these: the shape of every `coordinates` member. */
type PositionOrList = number[] | PositionOrList[];

function isPosition(node: PositionOrList): node is number[] {
  return typeof node[0] === 'number';
}

function movedPosition(existing: number[], position: [number, number]): number[] {
  return existing.length >= 3
    ? [position[0], position[1], existing[2]]
    : [position[0], position[1]];
}

/** a closed ring's first and last position are one point, so both move together */
function movedRing(ring: number[][], index: number, position: [number, number]): number[][] {
  const last = ring.length - 1;
  const closed =
    last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  const movesBothEnds = closed && (index === 0 || index === last);
  return ring.map((existing, i) => {
    if (i === index) return movedPosition(existing, position);
    if (movesBothEnds && (i === 0 || i === last)) return movedPosition(existing, position);
    return existing;
  });
}

function movedNode(
  node: PositionOrList,
  path: number[],
  position: [number, number],
  ringLeaves: boolean,
): PositionOrList {
  if (isPosition(node)) return path.length === 0 ? movedPosition(node, position) : node;
  const [index, ...rest] = path;
  if (index === undefined || index < 0 || index >= node.length) return node;
  if (ringLeaves && rest.length === 0 && isPosition(node[index])) {
    return movedRing(node as number[][], index, position);
  }
  return node.map((child, i) =>
    i === index ? movedNode(child, rest, position, ringLeaves) : child,
  );
}

/**
 * `path` indexes into `coordinates` down to one position: Point `[]`,
 * LineString `[i]`, Polygon `[ring, i]`, MultiPolygon `[polygon, ring, i]`. A
 * collection's first index picks the member and the rest applies to it.
 */
export function geometryWithMovedVertex(
  geometry: GeoJSON.Geometry,
  path: number[],
  position: [number, number],
): GeoJSON.Geometry {
  if (geometry.type === 'GeometryCollection') {
    const [index, ...rest] = path;
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries.map((member, i) =>
        i === index ? geometryWithMovedVertex(member, rest, position) : member,
      ),
    };
  }
  const ringLeaves = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
  const coordinates = movedNode(geometry.coordinates, path, position, ringLeaves);
  return { ...geometry, coordinates } as GeoJSON.Geometry;
}

export interface GeometryVertex {
  path: number[];
  position: number[];
}

export function geometryVertices(geometry: GeoJSON.Geometry): GeometryVertex[] {
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap((member, i) =>
      geometryVertices(member).map((vertex) => ({
        path: [i, ...vertex.path],
        position: vertex.position,
      })),
    );
  }
  const found: GeometryVertex[] = [];
  const walk = (node: PositionOrList, path: number[]): void => {
    if (isPosition(node)) {
      found.push({ path, position: node });
      return;
    }
    node.forEach((child, i) => {
      walk(child, [...path, i]);
    });
  };
  walk(geometry.coordinates, []);
  return found;
}

export const useDrawStore = create<DrawState>((set, get) => ({
  mode: null,
  color: '#a78bfa',
  lineWidth: 2,
  features: [],
  pending: [],
  vertexEdit: null,

  setMode: (mode) => set({ mode, pending: [], vertexEdit: null }),
  setColor: (color) => set({ color }),
  setLineWidth: (lineWidth) => set({ lineWidth }),

  addPendingPoint: (lng, lat) =>
    set((s) => ({ pending: [...s.pending, [lng, lat]] })),

  finishFeature: () => {
    const { mode, pending, color, lineWidth, features } = get();
    if (!mode || pending.length === 0) return;

    let feature: DrawnFeature | null = null;

    if (mode === 'point' && pending.length >= 1) {
      feature = {
        id: crypto.randomUUID(),
        type: 'Point',
        coords: [pending[0]],
        color,
        lineWidth,
      };
    } else if (mode === 'line' && pending.length >= 2) {
      feature = {
        id: crypto.randomUUID(),
        type: 'LineString',
        coords: [...pending],
        color,
        lineWidth,
      };
    } else if (mode === 'polygon' && pending.length >= 3) {
      feature = {
        id: crypto.randomUUID(),
        type: 'Polygon',
        coords: [...pending],
        color,
        lineWidth,
      };
    } else if (mode === 'circle' && pending.length >= 2) {
      // center + edge point
      const [cx, cy] = pending[0];
      const [ex, ey] = pending[1];
      const R = 6_371_000;
      const dLat = ((ey - cy) * Math.PI) / 180;
      const dLng = ((ex - cx) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((cy * Math.PI) / 180) *
          Math.cos((ey * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const radius = R * 2 * Math.asin(Math.sqrt(a));
      feature = {
        id: crypto.randomUUID(),
        type: 'Circle',
        coords: [pending[0]],
        radius,
        color,
        lineWidth,
      };
    } else if (mode === 'rectangle' && pending.length >= 2) {
      const [x1, y1] = pending[0];
      const [x2, y2] = pending[1];
      feature = {
        id: crypto.randomUUID(),
        type: 'Polygon',
        coords: [
          [x1, y1],
          [x2, y1],
          [x2, y2],
          [x1, y2],
        ],
        color,
        lineWidth,
      };
    }

    if (feature) {
      set({ features: [...features, feature], pending: [] });
    }
  },

  cancelPending: () => set({ pending: [] }),

  removeFeature: (id) =>
    set((s) => ({ features: s.features.filter((f) => f.id !== id) })),

  setFeatureProperties: (id, properties) =>
    set((s) => ({
      features: s.features.map((f) => (f.id === id ? { ...f, properties } : f)),
    })),

  clearAll: () => set({ features: [], pending: [] }),

  startVertexEdit: (geometry) => set({ vertexEdit: { geometry }, mode: null, pending: [] }),

  moveVertex: (path, position) =>
    set((s) => {
      if (!s.vertexEdit) return {};
      return { vertexEdit: { geometry: geometryWithMovedVertex(s.vertexEdit.geometry, path, position) } };
    }),

  stopVertexEdit: () => set({ vertexEdit: null }),
}));

type DrawnGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] };

export function drawnFeatureGeometry(f: DrawnFeature): DrawnGeometry {
  if (f.type === 'Point' || f.type === 'Circle') {
    return { type: 'Point', coordinates: f.coords[0] };
  }
  if (f.type === 'LineString') {
    return { type: 'LineString', coordinates: f.coords };
  }
  // Polygon: close the ring.
  const ring = [...f.coords];
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** Build a GeoJSON FeatureCollection from the drawn features (incl. edited properties). */
export function featuresToGeoJSON(features: DrawnFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({
      type: 'Feature' as const,
      geometry: drawnFeatureGeometry(f),
      properties: {
        ...(f.properties ?? {}),
        ...(f.type === 'Circle' && f.radius != null ? { _radius_m: String(f.radius) } : {}),
      },
    })),
  };
}
