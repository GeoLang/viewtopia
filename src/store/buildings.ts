import { create } from 'zustand';

export interface BuildingFeature {
  coords: number[];
  height: number;
  color: string;
  tags: Record<string, string>;
}

interface BuildingState {
  buildings: BuildingFeature[];
  loading: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setBuildings: (b: BuildingFeature[]) => void;
  clearBuildings: () => void;
}

export const useBuildingStore = create<BuildingState>((set) => ({
  buildings: [],
  loading: false,
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
  setLoading: (loading) => set({ loading }),
  setBuildings: (buildings) => set({ buildings }),
  clearBuildings: () => set({ buildings: [], enabled: false }),
}));

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export async function fetchOsmBuildings(
  centerLat: number,
  centerLon: number,
  cameraHeight: number,
): Promise<BuildingFeature[]> {
  const span = Math.min(Math.max(cameraHeight * 0.000005, 0.002), 0.02);
  const south = centerLat - span;
  const north = centerLat + span;
  const west = centerLon - span;
  const east = centerLon + span;

  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];way["building"](${bbox});out body;>;out skel qt;`;

  let res: Response | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) break;
        res = null;
      } else {
        res = null;
      }
    } catch {
      res = null;
    }
  }

  // every mirror refused or timed out: that is a failure, not an empty area
  if (!res) {
    throw new Error('Overpass API unreachable. Try again in a moment.');
  }

  const data = await res.json();
  const nodes = new Map<number, { lon: number; lat: number }>();
  const ways: { nodes: number[]; tags: Record<string, string> }[] = [];

  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, { lon: el.lon, lat: el.lat });
    else if (el.type === 'way') ways.push({ nodes: el.nodes, tags: el.tags || {} });
  }

  const features: BuildingFeature[] = [];
  for (const way of ways) {
    const coords = way.nodes
      .map((id: number) => nodes.get(id))
      .filter(Boolean)
      .flatMap((n) => [n!.lon, n!.lat]);
    if (coords.length < 6) continue;

    const levels = parseInt(way.tags['building:levels'] ?? '3', 10);
    const height = parseFloat(way.tags['height'] ?? String(levels * 3.2));
    const color = way.tags['building:colour'] || '#c8b896';

    features.push({ coords, height, color, tags: way.tags });
  }

  return features;
}
