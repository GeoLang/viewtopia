// Client for interiora's indoor mapping service, proxied at /api/indoor/
// (nginx strips the prefix, so /api/indoor/venues reaches the server's
// /venues). Every route but /health needs the platform bearer token: any known
// role reads, editor or admin uploads. Failures carry the server's own message
// so the panel can show "no graph node on floor 2" rather than "HTTP 422".

import { apiHeaders } from './apiAuth';
import { toFeatureCollection } from '../store/agentLayers';

const API = '/api/indoor';

export interface Venue {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  floorCount: number;
  /** floor ordinals, low to high */
  floors: number[];
}

export interface RoutePoint {
  lon: number;
  lat: number;
  floor: number;
}

export type RouteMode = 'default' | 'accessible';

export interface IndoorRoute {
  geometry: GeoJSON.LineString;
  totalDistance: number;
  estimatedTimeS: number;
  instructions: string[];
  /** floor ordinal per geometry vertex */
  floors: number[];
}

export class IndoorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function venuesUrl(): string {
  return `${API}/venues`;
}

export function floorUrl(venueId: string, ordinal: number): string {
  return `${API}/venues/${encodeURIComponent(venueId)}/floors/${ordinal}/geojson`;
}

export function routeUrl(venueId: string): string {
  return `${API}/venues/${encodeURIComponent(venueId)}/route`;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseVenues(body: unknown): Venue[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((raw) => {
    const v = raw as Record<string, unknown> | null;
    if (!v || typeof v.id !== 'string') return [];
    const floors = Array.isArray(v.floors) ? v.floors.filter((f) => typeof f === 'number') : [];
    return [
      {
        id: v.id,
        name: typeof v.name === 'string' && v.name ? v.name : v.id,
        category: typeof v.category === 'string' ? v.category : 'Unknown',
        lat: num(v.lat),
        lon: num(v.lon),
        floorCount: typeof v.floor_count === 'number' ? v.floor_count : floors.length,
        floors,
      },
    ];
  });
}

export function parseRoute(body: unknown): IndoorRoute {
  const r = body as Record<string, unknown> | null;
  const geometry = r?.geometry as GeoJSON.LineString | undefined;
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    throw new Error('the route response has no LineString geometry');
  }
  return {
    geometry,
    totalDistance: num(r?.total_distance),
    estimatedTimeS: num(r?.estimated_time_s),
    instructions: Array.isArray(r?.instructions)
      ? r.instructions.filter((i): i is string => typeof i === 'string')
      : [],
    floors: Array.isArray(r?.floors) ? r.floors.filter((f): f is number => typeof f === 'number') : [],
  };
}

/** The server's `{error}` body, falling back to the status when it has none. */
async function failure(res: Response): Promise<IndoorError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    typeof body?.error === 'string' && body.error ? body.error : `HTTP ${res.status}`;
  return new IndoorError(res.status, message);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { ...init, headers: apiHeaders(init?.headers) }).catch(() => null);
  if (!res) throw new IndoorError(0, 'The indoor map service is unreachable.');
  if (!res.ok) throw await failure(res);
  return res;
}

export async function listVenues(): Promise<Venue[]> {
  const res = await request(venuesUrl());
  return parseVenues(await res.json());
}

export async function floorGeojson(
  venueId: string,
  ordinal: number,
): Promise<GeoJSON.FeatureCollection> {
  const res = await request(floorUrl(venueId, ordinal));
  const collection = toFeatureCollection(await res.json());
  if (!collection) throw new Error(`floor ${ordinal} came back as something other than GeoJSON`);
  return collection;
}

export async function requestRoute(
  venueId: string,
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode,
): Promise<IndoorRoute> {
  const res = await request(routeUrl(venueId), {
    method: 'POST',
    body: JSON.stringify({ from, to, mode }),
  });
  return parseRoute(await res.json());
}

/** Upload an IndoorMapDoc; returns the new venue id. Needs editor or admin. */
export async function uploadVenue(doc: string): Promise<string> {
  const res = await request(venuesUrl(), { method: 'POST', body: doc });
  const body = (await res.json()) as { id?: unknown };
  if (typeof body?.id !== 'string') throw new Error('the upload response carried no venue id');
  return body.id;
}
