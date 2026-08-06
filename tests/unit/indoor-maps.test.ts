import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IndoorError,
  floorGeojson,
  floorUrl,
  listVenues,
  parseRoute,
  parseVenues,
  requestRoute,
  routeUrl,
  uploadVenue,
  venuesUrl,
} from '../../src/lib/indoorMaps';
import { useAuthStore } from '../../src/features/auth/store';

const VENUES = [
  {
    id: '3f2a1b4c-0000-4000-8000-000000000001',
    name: 'Meridian Centre',
    category: 'ShoppingMall',
    lat: 45.5019,
    lon: -73.5674,
    floor_count: 3,
    floors: [-1, 0, 1],
  },
  // no id: nothing to select, so it must not reach the picker
  { name: 'Nameless', floors: [0] },
];

const FLOOR = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-73.5674, 45.5019], [-73.5673, 45.5019], [-73.5673, 45.502], [-73.5674, 45.5019]]] },
      properties: { feature: 'unit', id: 'u1', name: 'Atrium', category: 'Room', level: 0, level_name: 'Ground' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5673, 45.5019] },
      properties: { feature: 'opening', id: 'o1', category: 'Door', level: 0, level_name: 'Ground', accessible: true },
    },
  ],
};

const ROUTE = {
  geometry: {
    type: 'LineString',
    coordinates: [[-73.5674, 45.5019], [-73.5673, 45.502]],
  },
  total_distance: 42.5,
  estimated_time_s: 34.2,
  instructions: ['Walk 20 m', 'Take the stairs up'],
  floors: [0, 1],
};

const VENUE_ID = VENUES[0].id as string;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null, error: null });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastHeaders(): Headers {
  return new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers);
}

describe('indoor map URLs', () => {
  it('sits under the /api/indoor proxy prefix', () => {
    expect(venuesUrl()).toBe('/api/indoor/venues');
    expect(floorUrl(VENUE_ID, 2)).toBe(`/api/indoor/venues/${VENUE_ID}/floors/2/geojson`);
    expect(routeUrl(VENUE_ID)).toBe(`/api/indoor/venues/${VENUE_ID}/route`);
  });

  it('keeps a negative floor ordinal and escapes the venue id', () => {
    expect(floorUrl('a b/c', -1)).toBe('/api/indoor/venues/a%20b%2Fc/floors/-1/geojson');
  });
});

describe('parseVenues', () => {
  it('reads the catalogue and drops entries with no id', () => {
    const venues = parseVenues(VENUES);
    expect(venues).toHaveLength(1);
    expect(venues[0]).toEqual({
      id: VENUE_ID,
      name: 'Meridian Centre',
      category: 'ShoppingMall',
      lat: 45.5019,
      lon: -73.5674,
      floorCount: 3,
      floors: [-1, 0, 1],
    });
  });

  it('answers empty for a body that is not a list', () => {
    expect(parseVenues({ error: 'nope' })).toEqual([]);
  });
});

describe('parseRoute', () => {
  it('reads geometry, totals and instructions', () => {
    const route = parseRoute(ROUTE);
    expect(route.geometry.coordinates).toEqual(ROUTE.geometry.coordinates);
    expect(route.totalDistance).toBe(42.5);
    expect(route.estimatedTimeS).toBe(34.2);
    expect(route.instructions).toEqual(['Walk 20 m', 'Take the stairs up']);
    expect(route.floors).toEqual([0, 1]);
  });

  it('refuses a response without a LineString', () => {
    expect(() => parseRoute({ ...ROUTE, geometry: { type: 'Point', coordinates: [0, 0] } })).toThrow(
      /LineString/,
    );
  });
});

describe('listVenues', () => {
  it('attaches the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VENUES));
    const venues = await listVenues();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/indoor/venues');
    expect(lastHeaders().get('Authorization')).toBe('Bearer jwt-abc');
    expect(venues[0].name).toBe('Meridian Centre');
  });

  it('surfaces 401 as an IndoorError carrying the status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'missing bearer token' }, 401));
    const error = await listVenues().catch((e) => e);
    expect(error).toBeInstanceOf(IndoorError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('missing bearer token');
  });

  it('reports an unreachable service instead of throwing the fetch failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(listVenues()).rejects.toThrow(/unreachable/);
  });
});

describe('floorGeojson', () => {
  it('requests the floor and returns the collection', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FLOOR));
    const collection = await floorGeojson(VENUE_ID, 0);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/indoor/venues/${VENUE_ID}/floors/0/geojson`);
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].properties?.name).toBe('Atrium');
  });

  it('passes the server message through for a missing floor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'venue x has no floor 9' }, 404));
    await expect(floorGeojson(VENUE_ID, 9)).rejects.toThrow('venue x has no floor 9');
  });
});

describe('requestRoute', () => {
  it('posts both endpoints with the mode and a bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ROUTE));
    const route = await requestRoute(
      VENUE_ID,
      { lon: -73.5674, lat: 45.5019, floor: 0 },
      { lon: -73.5673, lat: 45.502, floor: 1 },
      'accessible',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/indoor/venues/${VENUE_ID}/route`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      from: { lon: -73.5674, lat: 45.5019, floor: 0 },
      to: { lon: -73.5673, lat: 45.502, floor: 1 },
      mode: 'accessible',
    });
    expect(lastHeaders().get('Authorization')).toBe('Bearer jwt-abc');
    expect(lastHeaders().get('Content-Type')).toBe('application/json');
    expect(route.instructions).toHaveLength(2);
  });

  it('carries the 422 message for a floor with no graph node', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'no graph node on floor 3' }, 422));
    const error = await requestRoute(
      VENUE_ID,
      { lon: 0, lat: 0, floor: 3 },
      { lon: 1, lat: 1, floor: 3 },
      'default',
    ).catch((e) => e);
    expect(error.status).toBe(422);
    expect(error.message).toBe('no graph node on floor 3');
  });
});

describe('uploadVenue', () => {
  it('posts the document and returns the new id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: VENUE_ID }));
    const doc = JSON.stringify({ venue: { name: 'Meridian Centre' } });
    expect(await uploadVenue(doc)).toBe(VENUE_ID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/indoor/venues');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(doc);
    expect(lastHeaders().get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('reports a viewer role as 403', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'editor or admin role required' }, 403));
    const error = await uploadVenue('{}').catch((e) => e);
    expect(error.status).toBe(403);
    expect(error.message).toBe('editor or admin role required');
  });

  it('sends no bearer when nobody is signed in', async () => {
    useAuthStore.setState({ loggedIn: false, token: null, user: null });
    fetchMock.mockResolvedValue(jsonResponse({ id: VENUE_ID }));
    await uploadVenue('{}');
    expect(lastHeaders().has('Authorization')).toBe(false);
  });
});
