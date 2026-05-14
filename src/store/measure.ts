import { create } from 'zustand';

export type MeasureMode = 'distance' | 'area' | 'elevation' | null;

export interface MeasureResult {
  id: string;
  mode: 'distance' | 'area' | 'elevation';
  value: number;
  unit: string;
  points: [number, number][];
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Geodesic area using spherical excess (m²) */
function geodesicAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;

  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const lng1 = toRad(points[i][0]);
    const lat1 = toRad(points[i][1]);
    const lng2 = toRad(points[j][0]);
    const lat2 = toRad(points[j][1]);
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((total * R * R) / 2);
}

function computeDistance(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return total;
}

function formatDistance(m: number): { value: number; unit: string } {
  if (m >= 1000) return { value: m / 1000, unit: 'km' };
  return { value: m, unit: 'm' };
}

function formatArea(m2: number): { value: number; unit: string } {
  if (m2 >= 1_000_000) return { value: m2 / 1_000_000, unit: 'km²' };
  if (m2 >= 10_000) return { value: m2 / 10_000, unit: 'ha' };
  return { value: m2, unit: 'm²' };
}

interface MeasureState {
  mode: MeasureMode;
  pending: [number, number][];
  liveDistance: number; // meters, updates as points are added
  results: MeasureResult[];
  setMode: (m: MeasureMode) => void;
  addPoint: (lng: number, lat: number) => void;
  finishMeasure: () => void;
  cancelPending: () => void;
  clearAll: () => void;
  removeResult: (id: string) => void;
}

export const useMeasureStore = create<MeasureState>((set, get) => ({
  mode: null,
  pending: [],
  liveDistance: 0,
  results: [],

  setMode: (mode) => set({ mode, pending: [], liveDistance: 0 }),

  addPoint: (lng, lat) => {
    const { pending } = get();
    const newPending: [number, number][] = [...pending, [lng, lat]];
    const live = computeDistance(newPending);
    set({ pending: newPending, liveDistance: live });
  },

  finishMeasure: () => {
    const { mode, pending, results } = get();
    if (!mode || pending.length < 2) return;

    let value: number;
    let unit: string;

    if (mode === 'area') {
      if (pending.length < 3) return;
      const a = geodesicAreaM2(pending);
      const fmt = formatArea(a);
      value = fmt.value;
      unit = fmt.unit;
    } else {
      // distance or elevation
      const d = computeDistance(pending);
      const fmt = formatDistance(d);
      value = fmt.value;
      unit = fmt.unit;
    }

    const result: MeasureResult = {
      id: crypto.randomUUID(),
      mode: mode as 'distance' | 'area' | 'elevation',
      value,
      unit,
      points: [...pending],
    };

    set({ results: [...results, result], pending: [], liveDistance: 0 });
  },

  cancelPending: () => set({ pending: [], liveDistance: 0 }),

  clearAll: () => set({ results: [], pending: [], liveDistance: 0 }),

  removeResult: (id) =>
    set((s) => ({ results: s.results.filter((r) => r.id !== id) })),
}));
