import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Geocoding and routing prefer the platform's own geokode and itinera, and only
 * reach for the public endpoint when the platform one is not there. Offline,
 * the platform answer can come from the cache and the public fallback is never
 * attempted, so the caller gets a message that says "offline".
 */

const store = vi.hoisted(() => {
  const entries = new Map<string, { url: string; status: number; headers: Record<string, string>; body: string }>();
  return { entries };
});

vi.mock('../../src/offline/db', () => ({
  apiCache: {
    get: async (url: string) => store.entries.get(url),
    put: async (entry: { url: string; status: number; headers: Record<string, string>; body: string }) => {
      store.entries.set(entry.url, entry);
    },
  },
  cachedRegions: { getAll: async () => [] },
  tileCache: { get: async () => undefined, put: async () => {}, summaries: async () => [], size: async () => 0 },
}));

import { geocode } from '../../src/services/geocode';
import { route } from '../../src/services/route';
import { fetchElevations } from '../../src/lib/elevationProfile';
import { fetchCurrentWeather, fetchWeatherGrid } from '../../src/lib/weatherData';
import { fetchOsmBuildings } from '../../src/store/buildings';
import { useNetworkStore } from '../../src/offline/network';

const GEOKODE_HIT = {
  results: [
    {
      address: { house_number: '10', street: 'Downing St', city: 'London', full: '10 Downing St, London' },
      lat: 51.5034,
      lon: -0.1276,
      confidence: 0.95,
      match_type: 'exact',
    },
  ],
};

const NOMINATIM_HIT = [{ lat: '48.8584', lon: '2.2945', display_name: 'Eiffel Tower', type: 'attraction' }];

const ITINERA_ROUTE = {
  distance_m: 2400,
  duration_s: 300,
  geometry: [
    [45, 10],
    [45.01, 10.02],
  ],
  steps: [],
};

const OSRM_ROUTE = {
  routes: [
    {
      distance: 3100,
      duration: 420,
      geometry: {
        coordinates: [
          [10, 45],
          [10.02, 45.01],
        ],
      },
    },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

/** Serve the platform routes, and 404 anything the platform does not answer. */
function servePlatform(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return json(body);
    }
    return json({ error: 'not found' }, 404);
  });
}

const fetchedUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

const setOffline = (offline: boolean) => useNetworkStore.setState({ online: !offline });

beforeEach(() => {
  store.entries.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setOffline(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocoding', () => {
  it('answers from geokode without ever asking Nominatim', async () => {
    servePlatform({ '/api/geocode/forward': GEOKODE_HIT });

    const hits = await geocode('10 Downing St', 1);

    expect(hits).toEqual([
      { lat: 51.5034, lng: -0.1276, label: '10 Downing St, London', type: 'address' },
    ]);
    expect(fetchedUrls().some((url) => url.includes('nominatim'))).toBe(false);
  });

  it('falls back to Nominatim where geokode is not deployed', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/geocode/')) return json({ error: 'no such service' }, 404);
      if (url.includes('nominatim')) return json(NOMINATIM_HIT);
      throw new Error(`unexpected fetch ${url}`);
    });

    const hits = await geocode('Eiffel Tower', 1);

    expect(hits).toEqual([
      { lat: 48.8584, lng: 2.2945, label: 'Eiffel Tower', type: 'attraction' },
    ]);
  });

  it('falls back to Nominatim when geokode is deployed but down', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/geocode/')) throw new Error('connection refused');
      if (url.includes('nominatim')) return json(NOMINATIM_HIT);
      throw new Error(`unexpected fetch ${url}`);
    });

    const hits = await geocode('Eiffel Tower', 1);

    expect(hits[0].label).toBe('Eiffel Tower');
  });

  it('serves a repeat query from the offline cache', async () => {
    servePlatform({ '/api/geocode/forward': GEOKODE_HIT });
    await geocode('10 Downing St', 1);

    setOffline(true);
    fetchMock.mockRejectedValue(new Error('network down'));
    const hits = await geocode('10 Downing St', 1);

    expect(hits[0].label).toBe('10 Downing St, London');
  });

  it('says it is offline rather than reporting no such place', async () => {
    setOffline(true);
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(geocode('Eiffel Tower', 1)).rejects.toThrow(
      'You are offline, and place search needs a network connection.',
    );
    expect(fetchedUrls().some((url) => url.includes('nominatim'))).toBe(false);
  });
});

describe('routing', () => {
  const from = { lat: 45, lng: 10 };
  const to = { lat: 45.01, lng: 10.02 };

  it('answers from itinera without ever asking the public OSRM', async () => {
    servePlatform({ '/api/route': ITINERA_ROUTE });

    const result = await route(from, to);

    expect(result).toEqual({
      distance: 2400,
      duration: 300,
      geometry: [
        [10, 45],
        [10.02, 45.01],
      ],
      source: 'itinera',
    });
    expect(fetchedUrls().some((url) => url.includes('project-osrm'))).toBe(false);
  });

  it('falls back to the public OSRM where itinera is not deployed', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/route')) return json({ error: 'no such service' }, 404);
      if (url.includes('project-osrm')) return json(OSRM_ROUTE);
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await route(from, to);

    expect(result?.source).toBe('osrm');
    expect(result?.distance).toBe(3100);
  });

  it('falls back to the public OSRM when itinera is deployed but down', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/route')) throw new Error('connection refused');
      if (url.includes('project-osrm')) return json(OSRM_ROUTE);
      throw new Error(`unexpected fetch ${url}`);
    });

    expect((await route(from, to))?.source).toBe('osrm');
  });

  it('serves a repeat route from the offline cache', async () => {
    servePlatform({ '/api/route': ITINERA_ROUTE });
    await route(from, to);

    setOffline(true);
    fetchMock.mockRejectedValue(new Error('network down'));
    const result = await route(from, to);

    expect(result?.source).toBe('itinera');
  });

  it('says it is offline rather than reporting no route', async () => {
    setOffline(true);
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(route(from, to)).rejects.toThrow(
      'You are offline, and routing needs a network connection.',
    );
    expect(fetchedUrls().some((url) => url.includes('project-osrm'))).toBe(false);
  });
});

describe('the services with no in-tree replacement', () => {
  beforeEach(() => {
    setOffline(true);
  });

  it('refuses an elevation lookup with a message naming the network', async () => {
    await expect(fetchElevations([[10, 45]])).rejects.toThrow(
      'You are offline, and the elevation lookup needs a network connection.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a weather reading, at a point and over a grid', async () => {
    await expect(fetchCurrentWeather(45, 10)).rejects.toThrow(
      'You are offline, and the weather forecast needs a network connection.',
    );
    await expect(
      fetchWeatherGrid({ west: 9, south: 44, east: 11, north: 46, centerLat: 45, centerLng: 10 }, 2),
    ).rejects.toThrow('You are offline, and the weather forecast needs a network connection.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an Overpass buildings query instead of trying three mirrors', async () => {
    await expect(fetchOsmBuildings(45, 10, 1000)).rejects.toThrow(
      'You are offline, and OSM buildings needs a network connection.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
