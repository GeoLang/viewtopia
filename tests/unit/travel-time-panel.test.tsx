import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TravelTimePanel } from '../../src/components/tools/TravelTimePanel';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
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

/** a square ring itinera leaves open, in its own [lat, lon] order */
const BOUNDARY = [
  [45.5, -73.6],
  [45.5, -73.5],
  [45.6, -73.5],
  [45.6, -73.6],
];

function pointLayer(id: string, name: string, points: [number, number][]): AgentLayer {
  return {
    id,
    name,
    geojson: {
      type: 'FeatureCollection',
      features: points.map(([lon, lat]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: {},
      })),
    },
  };
}

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
      <TravelTimePanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return view;
}

const serviceAreaLayer = () =>
  useAgentLayerStore.getState().layers.find((l) => l.id === 'travel-time-service-area');
const odLayer = () =>
  useAgentLayerStore.getState().layers.find((l) => l.id === 'travel-time-od-matrix');

beforeEach(() => {
  useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null, error: null });
  useAgentLayerStore.setState({ layers: [] });
  fetchMock = vi.fn(async () => jsonResponse({ error: 'unexpected call' }, 500));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TravelTimePanel service areas', () => {
  it('draws one polygon per band from a map-picked centre', async () => {
    await panel();
    fireEvent.click(screen.getByText('Set centre'));
    clickMap(-73.55, 45.55);
    expect(screen.getByTestId('travel-time-centre')).toHaveTextContent('45.55000, -73.55000');

    fireEvent.change(screen.getByTestId('travel-time-bands'), { target: { value: '5, 10' } });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ reachable_nodes: 42, boundary: BOUNDARY }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Draw service area'));
    });

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls).toEqual([
      '/api/isochrone?lat=45.55&lon=-73.55&max_seconds=300&profile=car',
      '/api/isochrone?lat=45.55&lon=-73.55&max_seconds=600&profile=car',
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');

    const features = serviceAreaLayer()?.geojson.features ?? [];
    expect(features).toHaveLength(2);
    // widest band first, so the narrower one draws on top of it
    expect(features.map((f) => f.properties?.minutes)).toEqual([10, 5]);
    // itinera leaves the ring open, a polygon ring has to close
    const ring = (features[0].geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(BOUNDARY.length + 1);
    expect(ring[0]).toEqual([-73.6, 45.5]);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    expect(screen.getByTestId('travel-time-area-result')).toHaveTextContent('5 min · 42 nodes');
  });

  it("shows itinera's message and draws nothing when every band fails", async () => {
    await panel();
    fireEvent.click(screen.getByText('Set centre'));
    clickMap(-73.55, 45.55);
    fireEvent.change(screen.getByTestId('travel-time-bands'), { target: { value: '5' } });

    fetchMock.mockImplementation(async () => jsonResponse({ error: 'graph is empty' }, 400));
    await act(async () => {
      fireEvent.click(screen.getByText('Draw service area'));
    });

    expect(screen.getByTestId('travel-time-area-error')).toHaveTextContent('graph is empty');
    expect(serviceAreaLayer()).toBeUndefined();
  });

  it('keeps the bands that worked and names how many did not', async () => {
    await panel();
    fireEvent.click(screen.getByText('Set centre'));
    clickMap(-73.55, 45.55);
    fireEvent.change(screen.getByTestId('travel-time-bands'), { target: { value: '5, 10' } });

    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ reachable_nodes: 3, boundary: BOUNDARY }))
      .mockImplementationOnce(async () => jsonResponse({ error: 'no node found' }, 400));
    await act(async () => {
      fireEvent.click(screen.getByText('Draw service area'));
    });

    expect(screen.getByTestId('travel-time-area-error')).toHaveTextContent('1 of 2 bands');
    expect(serviceAreaLayer()?.geojson.features).toHaveLength(1);
  });
});

describe('TravelTimePanel OD matrix', () => {
  beforeEach(() => {
    useAgentLayerStore.setState({
      layers: [
        pointLayer('depots', 'Depots', [
          [-73.6, 45.5],
          [-73.55, 45.52],
        ]),
        pointLayer('shops', 'Shops', [[-73.5, 45.6]]),
      ],
    });
  });

  async function odPanel() {
    const view = await panel();
    fireEvent.click(screen.getByText('OD matrix'));
    pick('Origins', 'Depots (2)');
    pick('Destinations', 'Shops (1)');
    return view;
  }

  it('posts the picked layers as points and draws a line per routed pair', async () => {
    await odPanel();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        entries: [
          { origin_index: 0, destination_index: 0, origin_node: 1, destination_node: 9, duration_s: 600 },
          { origin_index: 1, destination_index: 0, origin_node: 2, destination_node: 9, duration_s: 330 },
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Build matrix'));
    });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('/api/network/od-matrix');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
    expect(JSON.parse(init.body as string)).toEqual({
      origins: [
        { lat: 45.5, lon: -73.6 },
        { lat: 45.52, lon: -73.55 },
      ],
      destinations: [{ lat: 45.6, lon: -73.5 }],
      profile: 'car',
    });

    expect(screen.getByTestId('travel-time-matrix')).toHaveTextContent('10.0');
    expect(screen.getByTestId('travel-time-matrix')).toHaveTextContent('5.5');

    const features = odLayer()?.geojson.features ?? [];
    expect(features).toHaveLength(2);
    expect((features[0].geometry as GeoJSON.LineString).coordinates).toEqual([
      [-73.6, 45.5],
      [-73.5, 45.6],
    ]);
    expect(features[0].properties?.duration_s).toBe(600);
  });

  it('leaves a pair itinera could not route blank rather than inventing one', async () => {
    await odPanel();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        entries: [
          { origin_index: 1, destination_index: 0, origin_node: 2, destination_node: 9, duration_s: 330 },
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Build matrix'));
    });

    const rows = within(screen.getByTestId('travel-time-matrix')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('—');
    expect(rows[2]).toHaveTextContent('5.5');
    expect(odLayer()?.geojson.features).toHaveLength(1);
  });

  it("shows itinera's own limit message on a refused matrix", async () => {
    await odPanel();
    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: 'origins has 150 points, max 100' }, 400),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Build matrix'));
    });

    expect(screen.getByTestId('travel-time-matrix-error')).toHaveTextContent(
      'origins has 150 points, max 100',
    );
    expect(screen.queryByTestId('travel-time-matrix')).not.toBeInTheDocument();
    expect(odLayer()).toBeUndefined();
  });

  it('says so when the graph could route nothing at all', async () => {
    await odPanel();
    fetchMock.mockImplementation(async () => jsonResponse({ entries: [] }));
    await act(async () => {
      fireEvent.click(screen.getByText('Build matrix'));
    });

    expect(screen.getByTestId('travel-time-matrix-error')).toHaveTextContent(
      'no pair could be routed',
    );
    expect(odLayer()).toBeUndefined();
  });

  it('takes its layers off the map when the panel closes', async () => {
    const view = await odPanel();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        entries: [
          { origin_index: 0, destination_index: 0, origin_node: 1, destination_node: 9, duration_s: 600 },
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Build matrix'));
    });
    expect(odLayer()).toBeDefined();

    view.unmount();
    expect(odLayer()).toBeUndefined();
  });
});
