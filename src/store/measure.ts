import { create } from 'zustand';
import { randomUuid } from '../lib/randomUuid';

export type MeasureMode = 'distance' | 'area' | 'elevation' | null;

export type MeasurePoint = [number, number] | [number, number, number];

export interface MeasureResult {
  id: string;
  mode: 'distance' | 'area' | 'elevation';
  value: number;
  unit: string;
  points: MeasurePoint[];
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
export function geodesicAreaSquareMeters(points: [number, number][]): number {
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

const WGS84_A = 6_378_137;
const WGS84_E2 = 6.69437999014e-3;

function toEcef(lng: number, lat: number, height: number): [number, number, number] {
  const lon = (lng * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return [
    (radius + height) * cosLat * Math.cos(lon),
    (radius + height) * cosLat * Math.sin(lon),
    (radius * (1 - WGS84_E2) + height) * sinLat,
  ];
}

function chordM(from: MeasurePoint, to: MeasurePoint): number {
  const start = toEcef(from[0], from[1], from[2] ?? 0);
  const end = toEcef(to[0], to[1], to[2] ?? 0);
  return Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
}

export function pointHasHeight(point: MeasurePoint): boolean {
  return point.length === 3 && Number.isFinite(point[2]);
}

function anyHeight(points: MeasurePoint[]): boolean {
  return points.some(pointHasHeight);
}

function computeDistance(points: MeasurePoint[]): number {
  let total = 0;
  const throughSpace = anyHeight(points);
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    total += throughSpace
      ? chordM(from, to)
      : haversineM(from[1], from[0], to[1], to[0]);
  }
  return total;
}

function spaceAreaSquareMeters(points: MeasurePoint[]): number {
  const ecef = points.map((point) => toEcef(point[0], point[1], point[2] ?? 0));
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < ecef.length; i++) {
    const start = ecef[i];
    const end = ecef[(i + 1) % ecef.length];
    nx += (start[1] - end[1]) * (start[2] + end[2]);
    ny += (start[2] - end[2]) * (start[0] + end[0]);
    nz += (start[0] - end[0]) * (start[1] + end[1]);
  }
  return Math.hypot(nx, ny, nz) / 2;
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
  pending: MeasurePoint[];
  liveDistance: number; // meters, updates as points are added
  results: MeasureResult[];
  setMode: (m: MeasureMode) => void;
  addPoint: (lng: number, lat: number, height?: number) => void;
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

  addPoint: (lng, lat, height) => {
    const { pending } = get();
    const point: MeasurePoint = height === undefined ? [lng, lat] : [lng, lat, height];
    const newPending = [...pending, point];
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
      const a = anyHeight(pending)
        ? spaceAreaSquareMeters(pending)
        : geodesicAreaSquareMeters(pending.map((point): [number, number] => [point[0], point[1]]));
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
      id: randomUuid(),
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

export const measureToolClicks = {
  onClick: (lng: number, lat: number, height?: number) => {
    const { mode, addPoint } = useMeasureStore.getState();
    if (mode) addPoint(lng, lat, height);
  },
  onDoubleClick: () => {
    const { mode, finishMeasure } = useMeasureStore.getState();
    if (mode) finishMeasure();
  },
};
