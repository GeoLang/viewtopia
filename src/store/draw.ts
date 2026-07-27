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
}

export const useDrawStore = create<DrawState>((set, get) => ({
  mode: null,
  color: '#a78bfa',
  lineWidth: 2,
  features: [],
  pending: [],

  setMode: (mode) => set({ mode, pending: [] }),
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
}));

/** Build a GeoJSON FeatureCollection from the drawn features (incl. edited properties). */
export function featuresToGeoJSON(features: DrawnFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => {
      let geometry:
        | { type: 'Point'; coordinates: [number, number] }
        | { type: 'LineString'; coordinates: [number, number][] }
        | { type: 'Polygon'; coordinates: [number, number][][] };
      if (f.type === 'Point' || f.type === 'Circle') {
        geometry = { type: 'Point' as const, coordinates: f.coords[0] };
      } else if (f.type === 'LineString') {
        geometry = { type: 'LineString' as const, coordinates: f.coords };
      } else {
        // Polygon: close the ring.
        const ring = [...f.coords];
        if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
          ring.push(ring[0]);
        }
        geometry = { type: 'Polygon' as const, coordinates: [ring] };
      }
      return {
        type: 'Feature' as const,
        geometry,
        properties: {
          ...(f.properties ?? {}),
          ...(f.type === 'Circle' && f.radius != null ? { _radius_m: String(f.radius) } : {}),
        },
      };
    }),
  };
}
