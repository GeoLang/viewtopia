/**
 * Routing service.
 *
 * Primary: the platform's own **itinera** service (same-origin via the nginx
 * proxy `/api/route?from=lat,lon&to=lat,lon`). itinera routes on the loaded OSM
 * extract, so we fall back to the public OSRM demo server for coverage outside
 * it or when the platform backend is unavailable. itinera goes through the
 * offline cache, so a route asked for before still answers with no network. The
 * OSRM fallback never can, so offline it raises rather than reporting no route.
 */
import { offlineFetch } from '../offline/cache';
import { requireOnline } from '../offline/network';

export interface RouteStep {
  instruction: string;
  distance: number; // meters
}

export interface RouteResult {
  distance: number; // meters
  duration: number; // seconds
  /** [lng, lat] pairs, GeoJSON order */
  geometry: [number, number][];
  steps: RouteStep[];
  source: 'itinera' | 'osrm';
}

interface ItineraStep {
  distance_m: number;
  duration_s: number;
  name: string | null;
  maneuver: string;
}

interface ItineraRouteResponse {
  distance_m: number;
  duration_s: number;
  /** [lat, lon] pairs */
  geometry: [number, number][];
  steps: ItineraStep[];
}

const ITINERA_MANEUVER_PHRASES = {
  Depart: { action: 'Head out', roadPreposition: 'on' },
  Continue: { action: 'Continue', roadPreposition: 'onto' },
  TurnLeft: { action: 'Turn left', roadPreposition: 'onto' },
  TurnRight: { action: 'Turn right', roadPreposition: 'onto' },
  TurnSlightLeft: { action: 'Turn slightly left', roadPreposition: 'onto' },
  TurnSlightRight: { action: 'Turn slightly right', roadPreposition: 'onto' },
  TurnSharpLeft: { action: 'Turn sharply left', roadPreposition: 'onto' },
  TurnSharpRight: { action: 'Turn sharply right', roadPreposition: 'onto' },
  UTurn: { action: 'Make a U-turn', roadPreposition: 'onto' },
  Merge: { action: 'Merge', roadPreposition: 'onto' },
  Arrive: { action: 'Arrive at the destination', roadPreposition: null },
} satisfies Record<string, { action: string; roadPreposition: string | null }>;

type ItineraManeuver = keyof typeof ITINERA_MANEUVER_PHRASES;

function isItineraManeuver(maneuver: string): maneuver is ItineraManeuver {
  return Object.hasOwn(ITINERA_MANEUVER_PHRASES, maneuver);
}

function instruction(maneuver: ItineraManeuver, road: string | null): string {
  const { action, roadPreposition } = ITINERA_MANEUVER_PHRASES[maneuver];
  if (!road || !roadPreposition) return action;
  return `${action} ${roadPreposition} ${road}`;
}

// itinera sends one step per graph edge
function itineraSteps(steps: ItineraStep[]): RouteStep[] {
  const folded: { maneuver: ItineraManeuver; road: string | null; distance: number }[] = [];
  for (const step of steps) {
    const { maneuver } = step;
    if (!isItineraManeuver(maneuver)) {
      throw new Error(`itinera sent a maneuver the viewer cannot phrase: ${maneuver}`);
    }
    const previous = folded.at(-1);
    if (previous && maneuver === 'Continue' && step.name === previous.road) {
      previous.distance += step.distance_m;
      continue;
    }
    folded.push({ maneuver, road: step.name, distance: step.distance_m });
  }
  return folded.map((step) => ({
    instruction: instruction(step.maneuver, step.road),
    distance: step.distance,
  }));
}

async function itineraRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: string,
): Promise<RouteResult | null> {
  const res = await offlineFetch(
    `/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&profile=${profile}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ItineraRouteResponse;
  if (!Array.isArray(data.geometry) || data.geometry.length === 0) return null;
  return {
    distance: data.distance_m,
    duration: data.duration_s,
    geometry: data.geometry.map(([lat, lon]) => [lon, lat] as [number, number]),
    steps: itineraSteps(data.steps),
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
    // the request does not ask OSRM for steps
    steps: [],
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
    /* itinera unavailable, fall through to OSRM */
  }
  requireOnline('routing');
  try {
    return await osrmRoute(from, to);
  } catch {
    return null;
  }
}
