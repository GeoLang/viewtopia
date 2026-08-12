// Client for itinera's travel-time routes, proxied on the same origin: GET
// /api/isochrone reaches its /isochrone, POST /api/network/od-matrix its
// /network/od-matrix. itinera checks the platform bearer when its JWT secret is
// set and is open when it is not, so these carry the token without gating on
// one. Failures carry the server's own `{error}` so a panel can show "origins
// has 150 points, max 100" rather than "HTTP 400".

import { apiHeaders, noticeRefusal } from './apiAuth';

const ISOCHRONE_URL = '/api/isochrone';
const OD_MATRIX_URL = '/api/network/od-matrix';

/** The four graph profiles itinera builds speeds for. */
export const TRAVEL_PROFILES = ['car', 'bicycle', 'pedestrian', 'truck'] as const;

export type TravelProfile = (typeof TRAVEL_PROFILES)[number];

export interface TravelPoint {
  lat: number;
  lon: number;
}

export interface ServiceArea {
  maxSeconds: number;
  reachableNodes: number;
  /** hull ring as GeoJSON [lon, lat] positions, closed */
  ring: GeoJSON.Position[];
}

export interface OdEntry {
  originIndex: number;
  destinationIndex: number;
  durationS: number;
}

export class TravelTimeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The server's `{error}` body, falling back to the status when it has none. */
async function failure(res: Response): Promise<TravelTimeError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    typeof body?.error === 'string' && body.error ? body.error : `HTTP ${res.status}`;
  return new TravelTimeError(res.status, message);
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: apiHeaders(init?.headers) }).catch(() => null);
  if (!res) throw new TravelTimeError(0, 'The routing service is unreachable.');
  if (!res.ok) {
    noticeRefusal(res.status);
    throw await failure(res);
  }
  return res.json();
}

function latLonPairs(value: unknown): GeoJSON.Position[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((pair) =>
    Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number'
      ? [[pair[1], pair[0]] as GeoJSON.Position]
      : [],
  );
}

/** A hull ring itinera leaves open, closed so it is a valid polygon ring. */
function closedRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/**
 * The area reachable from `centre` within `maxSeconds`. Throws when the hull
 * has too few points to be a polygon, which is what a source with nothing but
 * its own node around it comes back as.
 */
export async function serviceArea(
  centre: TravelPoint,
  maxSeconds: number,
  profile: TravelProfile,
): Promise<ServiceArea> {
  const params = new URLSearchParams({
    lat: String(centre.lat),
    lon: String(centre.lon),
    max_seconds: String(maxSeconds),
    profile,
  });
  const body = (await request(`${ISOCHRONE_URL}?${params}`)) as Record<string, unknown> | null;
  const ring = latLonPairs(body?.boundary);
  if (ring.length < 3) {
    throw new TravelTimeError(0, `nothing reachable within ${maxSeconds} s of that point`);
  }
  return {
    maxSeconds,
    reachableNodes: typeof body?.reachable_nodes === 'number' ? body.reachable_nodes : ring.length,
    ring: closedRing(ring),
  };
}

/**
 * Travel time for every origin-destination pair. itinera drops a pair it cannot
 * route, so the result is sparse rather than origins x destinations long.
 */
export async function odMatrix(
  origins: TravelPoint[],
  destinations: TravelPoint[],
  profile: TravelProfile,
): Promise<OdEntry[]> {
  const body = (await request(OD_MATRIX_URL, {
    method: 'POST',
    body: JSON.stringify({ origins, destinations, profile }),
  })) as { entries?: unknown } | null;
  if (!Array.isArray(body?.entries)) return [];
  return body.entries.flatMap((raw) => {
    const e = raw as Record<string, unknown>;
    if (
      typeof e?.origin_index !== 'number' ||
      typeof e?.destination_index !== 'number' ||
      typeof e?.duration_s !== 'number'
    ) {
      return [];
    }
    return [
      {
        originIndex: e.origin_index,
        destinationIndex: e.destination_index,
        durationS: e.duration_s,
      },
    ];
  });
}

function minutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

/**
 * The bands as one polygon layer, widest first so the narrower ones draw on
 * top of it rather than under.
 */
export function serviceAreaCollection(areas: ServiceArea[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [...areas]
      .sort((a, b) => b.maxSeconds - a.maxSeconds)
      .map((area) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [area.ring] },
        properties: {
          minutes: minutes(area.maxSeconds),
          max_seconds: area.maxSeconds,
          reachable_nodes: area.reachableNodes,
        },
      })),
  };
}

/**
 * One straight connector per routed pair, carrying the road travel time. The
 * line is a desire line, not the route itinera drove to get the duration.
 */
export function odLineCollection(
  origins: TravelPoint[],
  destinations: TravelPoint[],
  entries: OdEntry[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries.flatMap((entry) => {
      const origin = origins[entry.originIndex];
      const destination = destinations[entry.destinationIndex];
      if (!origin || !destination) return [];
      return [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [origin.lon, origin.lat],
              [destination.lon, destination.lat],
            ],
          },
          properties: {
            origin_index: entry.originIndex,
            destination_index: entry.destinationIndex,
            duration_s: Math.round(entry.durationS),
            minutes: minutes(entry.durationS),
          },
        },
      ];
    }),
  };
}

/**
 * One row per routed pair, the same shape as the desire-line layer's
 * attributes. Long rather than a grid because itinera omits a pair it cannot
 * route, and a grid would have to invent a cell for it.
 */
export function odCsv(
  origins: TravelPoint[],
  destinations: TravelPoint[],
  entries: OdEntry[],
): string {
  const header =
    'origin_index,origin_lat,origin_lon,destination_index,destination_lat,destination_lon,duration_s,minutes';
  const rows = entries.flatMap((entry) => {
    const origin = origins[entry.originIndex];
    const destination = destinations[entry.destinationIndex];
    if (!origin || !destination) return [];
    return [
      [
        entry.originIndex,
        origin.lat,
        origin.lon,
        entry.destinationIndex,
        destination.lat,
        destination.lon,
        Math.round(entry.durationS),
        minutes(entry.durationS),
      ].join(','),
    ];
  });
  return [header, ...rows].join('\n');
}
