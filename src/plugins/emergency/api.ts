// Evacuation geometry comes from two backends that nginx puts on the same origin:
// ptolemy's POST /api/v1/incidents/evacuate builds the danger-zone polygon, and
// itinera's GET /api/route returns road geometry between two points. Both check the
// session bearer token when their JWT secret is set, so these go through apiHeaders
// rather than ctx.api.fetch, which sends no token and pins the /api/v1 prefix.

import { apiHeaders } from '../../lib/apiAuth';

export interface AssemblyPointInput {
  id: string;
  lat: number;
  lng: number;
  capacity: number;
}

export interface EvacAssemblyPoint extends AssemblyPointInput {
  distance_m: number;
  estimated_travel_s: number;
}

export interface EvacuationPlan {
  danger_zone_geojson: GeoJSON.Feature;
  assembly_points: EvacAssemblyPoint[];
}

async function failure(res: Response, label: string): Promise<Error> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return new Error(`${label}: ${parsed.error}`);
  } catch {
    // non-JSON error body
  }
  return new Error(`${label} failed: ${res.status} ${res.statusText}`);
}

export async function evacuationPlan(input: {
  lat: number;
  lng: number;
  radiusM: number;
  assemblyPoints: AssemblyPointInput[];
}): Promise<EvacuationPlan> {
  const res = await fetch('/api/v1/incidents/evacuate', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      incident_lat: input.lat,
      incident_lng: input.lng,
      radius_m: input.radiusM,
      assembly_points: input.assemblyPoints,
    }),
  });
  if (!res.ok) throw await failure(res, 'incidents/evacuate');
  return res.json() as Promise<EvacuationPlan>;
}

/** Road route between two points, as GeoJSON [lng, lat] positions. */
export async function walkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<GeoJSON.Position[]> {
  const params = new URLSearchParams({
    from: `${from.lat},${from.lng}`,
    to: `${to.lat},${to.lng}`,
    profile: 'pedestrian',
  });
  const res = await fetch(`/api/route?${params}`, { headers: apiHeaders() });
  if (!res.ok) throw await failure(res, 'route');
  const data = (await res.json()) as { geometry: [number, number][] };
  // itinera returns [lat, lon] pairs
  return data.geometry.map(([lat, lng]) => [lng, lat]);
}

/** Assembly points recorded on an incident feature, or none when the API has none. */
export function assemblyPointsOf(properties: Record<string, unknown>): AssemblyPointInput[] {
  const raw = properties.assembly_points;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const p = entry as Record<string, unknown>;
    if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return [];
    return [{
      id: typeof p.id === 'string' ? p.id : `${p.lat},${p.lng}`,
      lat: p.lat,
      lng: p.lng,
      // the endpoint requires a capacity and only echoes it back
      capacity: typeof p.capacity === 'number' ? p.capacity : 0,
    }];
  });
}

/** Danger-zone radius the incident itself records, else the plugin's configured default. */
export function evacRadiusOf(properties: Record<string, unknown>, fallbackM: number): number {
  const recorded = properties.affected_radius_m ?? properties.radius_m;
  return typeof recorded === 'number' ? recorded : fallbackM;
}
