import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { IndoorPanel } from '../../src/components/tools/IndoorPanel';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAuthStore } from '../../src/features/auth/store';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const VENUE_ID = '3f2a1b4c-0000-4000-8000-000000000001';

const VENUES = [
  {
    id: VENUE_ID,
    name: 'Meridian Centre',
    category: 'ShoppingMall',
    lat: 45.5019,
    lon: -73.5674,
    floor_count: 2,
    floors: [0, 1],
  },
];

const floorCollection = (level: number) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5674, 45.5019] },
      properties: { feature: 'amenity', id: `a${level}`, level },
    },
  ],
});

const ROUTE = {
  geometry: { type: 'LineString', coordinates: [[-73.5674, 45.5019], [-73.5673, 45.502]] },
  total_distance: 42.4,
  estimated_time_s: 120,
  instructions: ['Walk 20 m', 'Take the stairs up'],
  floors: [0, 0],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

function clickMap(lng: number, lat: number) {
  act(() => {
    window.dispatchEvent(new CustomEvent('viewtopia:map:click', { detail: { lat, lng } }));
  });
}

async function panel() {
  const view = render(
    <MantineProvider>
      <IndoorPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null, error: null });
  useAgentLayerStore.setState({ layers: [] });
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/indoor/venues') return jsonResponse(VENUES);
    const floor = url.match(/\/floors\/(-?\d+)\/geojson$/);
    if (floor) return jsonResponse(floorCollection(Number(floor[1])));
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const floorLayer = () => useAgentLayerStore.getState().layers.find((l) => l.id === 'indoor-floor');

describe('IndoorPanel', () => {
  it('asks for a sign-in instead of calling a route that can only 401', async () => {
    useAuthStore.setState({ loggedIn: false, token: null, user: null });
    await panel();
    expect(screen.getByTestId('indoor-signin')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('draws the picked floor and swaps it when the floor changes', async () => {
    const view = await panel();
    pick('Venue', 'Meridian Centre');
    await act(async () => {});

    expect(floorLayer()?.geojson.features[0].properties?.level).toBe(0);

    pick('Floor', 'Floor 1');
    await act(async () => {});
    expect(floorLayer()?.geojson.features[0].properties?.level).toBe(1);
    // one layer, replaced rather than stacked
    expect(useAgentLayerStore.getState().layers).toHaveLength(1);

    view.unmount();
    expect(floorLayer()).toBeUndefined();
  });

  it('routes between two map clicks and shows the distance and steps', async () => {
    await panel();
    pick('Venue', 'Meridian Centre');
    await act(async () => {});

    fireEvent.click(screen.getByText('Set start'));
    clickMap(-73.5674, 45.5019);
    fireEvent.click(screen.getByText('Set end'));
    clickMap(-73.5673, 45.502);

    fetchMock.mockResolvedValueOnce(jsonResponse(ROUTE));
    await act(async () => {
      fireEvent.click(screen.getByText('Route'));
    });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe(`/api/indoor/venues/${VENUE_ID}/route`);
    expect(JSON.parse(init.body as string)).toEqual({
      from: { lon: -73.5674, lat: 45.5019, floor: 0 },
      to: { lon: -73.5673, lat: 45.502, floor: 0 },
      mode: 'default',
    });
    expect(screen.getByTestId('indoor-route-result')).toHaveTextContent('42 m');
    expect(screen.getByTestId('indoor-route-result')).toHaveTextContent('2 min');
    expect(screen.getByTestId('indoor-instructions')).toHaveTextContent('1. Walk 20 m');
    expect(
      useAgentLayerStore.getState().layers.find((l) => l.id === 'indoor-route'),
    ).toBeDefined();
  });

  it('shows the server message when a floor has no graph node', async () => {
    await panel();
    pick('Venue', 'Meridian Centre');
    await act(async () => {});

    fireEvent.click(screen.getByText('Set start'));
    clickMap(-73.5674, 45.5019);
    fireEvent.click(screen.getByText('Set end'));
    clickMap(-73.5673, 45.502);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'no graph node on floor 0' }, 422));
    await act(async () => {
      fireEvent.click(screen.getByText('Route'));
    });

    expect(screen.getByTestId('indoor-route-error')).toHaveTextContent('no graph node on floor 0');
    expect(useAgentLayerStore.getState().layers.some((l) => l.id === 'indoor-route')).toBe(false);
  });

  it('tells a viewer account it cannot upload', async () => {
    await panel();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'editor or admin role required' }, 403));
    const file = new File(['{}'], 'venue.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(screen.getByTestId('indoor-error')).toHaveTextContent('editor or admin role');
  });
});
