/**
 * Routing service.
 *
 * Primary: the platform's own **itinera** service (same-origin via the nginx
 * proxy `/api/route?from=lat,lon&to=lat,lon`). itinera routes on the loaded OSM
 * extract, so we fall back to the public OSRM demo server for coverage outside
 * it or when the platform backend is unavailable.
 */

export interface RouteResult {
  distance: number; // meters
  duration: number; // seconds
  /** [lng, lat] pairs, GeoJSON order */
  geometry: [number, number][];
  source: 'itinera' | 'osrm';
}

interface ItineraRouteResponse {
  distance_m: number;
  duration_s: number;
  /** [lat, lon] pairs */
  geometry: [number, number][];
}

async function itineraRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: string,
): Promise<RouteResult | null> {
  const res = await fetch(
    `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&profile=${profile}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ItineraRouteResponse;
  if (!Array.isArray(data.geometry) || data.geometry.length === 0) return null;
  return {
    distance: data.distance_m,
    duration: data.duration_s,
    geometry: data.geometry.map(([lat, lon]) => [lon, lat] as [number, number]),
    source: 'itinera',
  };
}

async function osrmRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteResult | null> {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: {
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }[];
  };
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
    source: 'osrm',
  };
}

/** Route between two points, preferring itinera and falling back to OSRM. */
export async function route(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile = 'car',
): Promise<RouteResult | null> {
  try {
    const r = await itineraRoute(from, to, profile);
    if (r) return r;
  } catch {
    /* itinera unavailable — fall through to OSRM */
  }
  try {
    return await osrmRoute(from, to);
  } catch {
    return null;
  }
}
