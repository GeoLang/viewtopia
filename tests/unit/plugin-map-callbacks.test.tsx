import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PluginPanel } from '../../src/plugins/PluginHost';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { listTowers, optimizeDelivery } from '../../src/lib/verticals';
import { searchParcels, splitParcel } from '../../src/lib/realEstate';

/**
 * The vertical plugins are only useful if their panel callbacks put real
 * geometry on the map, so these drive the panels and read the layer store the
 * renderers draw from. Only the network clients are stubbed.
 */

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// jsdom has no ResizeObserver, which Mantine's ScrollArea constructs on mount
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('../../src/lib/verticals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/verticals')>()),
  discoverBranch: vi.fn(async () => 'towers-branch'),
  listTowers: vi.fn(),
  optimizeDelivery: vi.fn(),
}));

vi.mock('../../src/lib/realEstate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/realEstate')>()),
  discoverBranch: vi.fn(async () => 'parcels-branch'),
  searchParcels: vi.fn(),
  splitParcel: vi.fn(async () => ({ newApns: ['12-1', '12-2'] })),
}));

const renderPlugin = (id: string) =>
  render(
    <MantineProvider>
      <PluginPanel pluginId={id} onClose={() => {}} />
    </MantineProvider>,
  );

const layer = (id: string) => useAgentLayerStore.getState().layers.find((l) => l.id === id);

const parcel = {
  id: 'p1',
  apn: '12',
  address: '1 Main St',
  owner: 'Smith',
  zoning: 'R-1',
  sqft: 5000,
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[10, 50], [10.001, 50], [10.001, 50.001], [10, 50.001], [10, 50]]],
  } as GeoJSON.Geometry,
};

describe('vertical plugin map callbacks', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
  });

  it('telecom draws a coverage footprint from the clicked tower attributes', async () => {
    vi.mocked(listTowers).mockResolvedValue([
      {
        id: 't1',
        name: 'Horizon site',
        technology: '5G',
        height_m: 30,
        frequency_mhz: 3500,
        lat: 50,
        lng: 10,
        properties: {},
      },
      {
        id: 't2',
        name: 'Sector site',
        technology: '4G',
        height_m: 25,
        frequency_mhz: 1800,
        lat: 50.1,
        lng: 10.1,
        properties: { coverage_radius_m: 2000, azimuth: 90, beamwidth: 60 },
      },
    ]);

    renderPlugin('telecom');
    fireEvent.click(screen.getByRole('button', { name: /load towers/i }));

    const horizonRow = (await screen.findByText('Horizon site')).closest('tr');
    fireEvent.click(horizonRow!);

    const coverage = layer('telecom-coverage-simulated');
    expect(coverage).toBeDefined();
    const omni = coverage!.geojson.features[0];
    expect(omni.geometry.type).toBe('Polygon');
    // 4/3-earth radio horizon for a 30 m antenna
    expect(omni.properties?.radius_m).toBe(Math.round(4120 * Math.sqrt(30)));
    expect(omni.properties?.radius_source).toBe('radio horizon from height_m');
    expect(omni.properties?.shape).toBe('omnidirectional');

    fireEvent.click(screen.getByText('Sector site').closest('tr')!);
    const sector = layer('telecom-coverage-simulated')!.geojson.features[0];
    expect(sector.properties?.radius_m).toBe(2000);
    expect(sector.properties?.radius_source).toBe('coverage_radius_m attribute');
    expect(sector.properties?.shape).toBe('60° sector at 90° azimuth');
    // a sector is not a full ring: its outline comes back to the tower
    expect((sector.geometry as GeoJSON.Polygon).coordinates[0]).toContainEqual([10.1, 50.1]);
  });

  it('logistics draws the optimized stop order as points and a sequence line', async () => {
    const geocoded = [
      { lat: 50, lon: 10 },
      { lat: 51, lon: 11 },
    ];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const hit = geocoded[call++];
        return {
          ok: true,
          json: async () => ({ results: [{ lat: hit.lat, lon: hit.lon, address: { full: `stop ${call}` } }] }),
        } as Response;
      }),
    );
    vi.mocked(optimizeDelivery).mockImplementation(async (_depot, stops) => ({
      // reversed, to prove the drawn order is the one the optimizer returned
      ordered_stops: [...stops].reverse().map((s, i) => ({ ...s, sequence: i + 1 })),
      total_distance_m: 1500,
      estimated_duration_s: 180,
    }));

    renderPlugin('logistics');
    fireEvent.click(screen.getByRole('tab', { name: /delivery/i }));
    fireEvent.click(screen.getByRole('button', { name: /new route/i }));

    const input = screen.getByPlaceholderText(/add delivery address/i);
    for (const n of [1, 2]) {
      fireEvent.change(input, { target: { value: `address ${n}` } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await screen.findByText(`stop ${n}`);
    }

    fireEvent.click(screen.getByRole('button', { name: /optimize route/i }));

    await waitFor(() => expect(layer('logistics-route-sequence')).toBeDefined());
    const line = layer('logistics-route-sequence')!.geojson.features[0];
    expect((line.geometry as GeoJSON.LineString).coordinates).toEqual([
      [11, 51],
      [10, 50],
    ]);
    const stops = layer('logistics-route-stops')!.geojson.features;
    expect(stops.map((f) => (f.geometry as GeoJSON.Point).coordinates)).toEqual([
      [11, 51],
      [10, 50],
    ]);
    vi.unstubAllGlobals();
  });

  it('real estate highlights the found parcel and splits it along the drawn line', async () => {
    vi.mocked(searchParcels).mockResolvedValue([parcel]);

    renderPlugin('real-estate');
    // let the panel's branch discovery settle before searching
    await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText('123-456-789'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(layer('real-estate-parcel')).toBeDefined());
    expect(layer('real-estate-parcel')!.geojson.features[0].geometry).toEqual(parcel.geometry);

    fireEvent.click(await screen.findByRole('button', { name: /add to selection/i }));
    expect(layer('real-estate-selection')!.geojson.features[0].properties?.apn).toBe('12');

    fireEvent.click(screen.getByRole('tab', { name: /edit/i }));
    const splitOption = document.querySelector('input[value="split"]');
    fireEvent.click(splitOption!);

    for (const [lng, lat] of [[9.999, 50.0005], [10.002, 50.0005]]) {
      window.dispatchEvent(new CustomEvent('viewtopia:map:click', { detail: { lat, lng } }));
    }
    const drawn = layer('real-estate-split-line');
    expect((drawn!.geojson.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([
      [9.999, 50.0005],
      [10.002, 50.0005],
    ]);

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(splitParcel).toHaveBeenCalled());
    expect(vi.mocked(splitParcel).mock.calls[0][2]).toEqual({
      type: 'LineString',
      coordinates: [
        [9.999, 50.0005],
        [10.002, 50.0005],
      ],
    });
  });
});
