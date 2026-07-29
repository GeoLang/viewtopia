import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PluginPanel } from '../../src/plugins/PluginHost';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { geojsonToWkbHex } from '../../src/lib/wkb';
import { listFields, fieldNdvi, listSurveys, compareSurveys, listIncidents } from '../../src/lib/verticals';

/**
 * ptolemy's vertical endpoints return attributes without geometry, so these
 * plugins join it back from the branch features and, for evacuations, from the
 * evacuate and routing services. The point of these tests is that what lands in
 * the layer store is the geometry the API returned, and that a row with no
 * geometry draws nothing at all.
 */

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mantine's Combobox scrolls the active option into view
Element.prototype.scrollIntoView = vi.fn();

/** Row lookup scoped to the table, since the report form's selects hold the same words. */
const incidentRow = async (cell: string) =>
  within(await screen.findByRole('table')).getByText(cell).closest('tr')!;

vi.mock('../../src/lib/verticals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/verticals')>()),
  discoverBranch: vi.fn(async () => 'vertical-branch'),
  listFields: vi.fn(),
  fieldNdvi: vi.fn(),
  listSurveys: vi.fn(),
  listMilestones: vi.fn(async () => []),
  compareSurveys: vi.fn(),
  listIncidents: vi.fn(),
}));

const renderPlugin = (id: string) =>
  render(
    <MantineProvider>
      <PluginPanel pluginId={id} onClose={() => {}} />
    </MantineProvider>,
  );

const layer = (id: string) => useAgentLayerStore.getState().layers.find((l) => l.id === id);

const square = (lng: number, lat: number): GeoJSON.Geometry => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
});

/** ptolemy serialises ST_AsBinary output as a byte array. */
const wkbBytes = (geometry: GeoJSON.Geometry): number[] => {
  const hex = geojsonToWkbHex(geometry);
  return Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
};

const branchFeatures = (entries: Array<{ id: string; geometry: GeoJSON.Geometry }>) => ({
  features: entries.map((e) => ({ id: e.id, geometry_wkb: wkbBytes(e.geometry) })),
});

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('vertical plugins draw API geometry', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('agriculture highlights the clicked field and colours the NDVI overlay by class', async () => {
    vi.mocked(listFields).mockResolvedValue([
      { id: 'f1', name: 'North field', crop: 'wheat', area_ha: 12, soil_type: 'loam', properties: { ndvi_mean: 0.8 } },
      { id: 'f2', name: 'South field', crop: 'wheat', area_ha: 8, soil_type: 'loam', properties: { ndvi_mean: 0.2 } },
    ]);
    vi.mocked(fieldNdvi).mockResolvedValue({
      field_id: 'f1',
      mean_ndvi: 0.8,
      min_ndvi: 0.7,
      max_ndvi: 0.9,
      timestamp: null,
      health_classification: 'healthy',
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      branchFeatures([{ id: 'f1', geometry: square(10, 50) }, { id: 'f2', geometry: square(11, 51) }]),
    )));

    renderPlugin('agriculture');
    fireEvent.click(screen.getByRole('button', { name: /load fields/i }));

    fireEvent.click((await screen.findByText('North field')).closest('tr')!);
    await waitFor(() => expect(layer('field-highlight')).toBeDefined());
    expect(layer('field-highlight')!.geojson.features[0].geometry).toEqual(square(10, 50));

    fireEvent.click(screen.getByRole('button', { name: /color by ndvi/i }));
    // the ramp puts 0.8 and 0.2 in different classes, so each gets its own layer
    const healthy = layer('field-ndvi-2E7D32');
    const stressed = layer('field-ndvi-FF8F00');
    expect(healthy!.color).toBe('#2E7D32');
    expect(healthy!.geojson.features[0].geometry).toEqual(square(10, 50));
    expect(stressed!.color).toBe('#FF8F00');
    expect(stressed!.geojson.features[0].geometry).toEqual(square(11, 51));
  });

  it('agriculture says so instead of drawing when the field has no geometry', async () => {
    vi.mocked(listFields).mockResolvedValue([
      { id: 'f1', name: 'North field', crop: 'wheat', area_ha: 12, soil_type: 'loam', properties: { ndvi_mean: 0.8 } },
    ]);
    vi.mocked(fieldNdvi).mockRejectedValue(new Error('no ndvi'));
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(branchFeatures([]))));

    renderPlugin('agriculture');
    fireEvent.click(screen.getByRole('button', { name: /load fields/i }));

    fireEvent.click((await screen.findByText('North field')).closest('tr')!);
    expect(await screen.findByText('North field: no geometry in API')).toBeInTheDocument();
    expect(layer('field-highlight')).toBeUndefined();
    expect(screen.getByRole('button', { name: /color by ndvi/i })).toBeDisabled();
  });

  it('construction draws each compared survey as its own layer', async () => {
    vi.mocked(listSurveys).mockResolvedValue([
      { id: 's1', name: 'Survey A', date: '2026-01-01', point_count: 100, mean_elevation: 12 },
      { id: 's2', name: 'Survey B', date: '2026-02-01', point_count: 120, mean_elevation: 13 },
    ]);
    vi.mocked(compareSurveys).mockResolvedValue({
      survey_a: 's1',
      survey_b: 's2',
      point_count_a: 100,
      point_count_b: 120,
      elevation_diff_stats: { mean_diff: 1, max_cut: 2, max_fill: 3, net_volume_m3: 400 },
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      branchFeatures([{ id: 's1', geometry: square(10, 50) }, { id: 's2', geometry: square(11, 51) }]),
    )));

    renderPlugin('construction');
    fireEvent.click(screen.getByRole('button', { name: /load surveys/i }));

    fireEvent.click((await screen.findByText('Survey A')).closest('tr')!);
    await waitFor(() => expect(layer('survey-extent')).toBeDefined());
    expect(layer('survey-extent')!.geojson.features[0].geometry).toEqual(square(10, 50));

    const pickSurvey = (select: string, option: string) => {
      fireEvent.click(screen.getByRole('textbox', { name: select }));
      fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
    };
    pickSurvey('Base', 'Survey A (2026-01-01)');
    pickSurvey('Compare', 'Survey B (2026-02-01)');
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }));

    await waitFor(() => expect(layer('survey-compare-target')).toBeDefined());
    expect(layer('survey-compare-base')!.geojson.features[0].geometry).toEqual(square(10, 50));
    expect(layer('survey-compare-target')!.geojson.features[0].geometry).toEqual(square(11, 51));
    expect(layer('survey-compare-base')!.color).not.toBe(layer('survey-compare-target')!.color);
  });

  it('emergency draws the danger zone the API returned and the routed evacuation paths', async () => {
    const dangerZone: GeoJSON.Feature = {
      type: 'Feature',
      geometry: square(9.99, 49.99),
      properties: { type: 'danger_zone', radius_m: 1000 },
    };
    vi.mocked(listIncidents).mockResolvedValue([
      {
        id: 'i1',
        incident_type: 'fire',
        severity: 'critical',
        status: 'active',
        lat: 50,
        lng: 10,
        reported_at: '2026-07-29T00:00:00Z',
        description: 'warehouse fire',
        properties: { assembly_points: [{ id: 'ap1', lat: 50.02, lng: 10.02, capacity: 200 }] },
      },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/v1/incidents/evacuate')) {
        return jsonResponse({
          danger_zone_geojson: dangerZone,
          assembly_points: [{ id: 'ap1', lat: 50.02, lng: 10.02, capacity: 200, distance_m: 2500, estimated_travel_s: 1800 }],
        });
      }
      if (url.startsWith('/api/route')) {
        // itinera answers with [lat, lon] pairs
        return jsonResponse({ distance_m: 2600, duration_s: 1900, geometry: [[50, 10], [50.02, 10.02]], steps: [] });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    renderPlugin('emergency');
    fireEvent.click(screen.getByRole('button', { name: /load incidents/i }));

    fireEvent.click(await incidentRow('fire'));

    await waitFor(() => expect(layer('incident-affected-area')).toBeDefined());
    expect(layer('incident-affected-area')!.geojson.features[0].geometry).toEqual(dangerZone.geometry);
    expect(layer('incident-assembly-points')!.geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [10.02, 50.02],
    });

    await waitFor(() => expect(layer('incident-evac-routes')).toBeDefined());
    expect(layer('incident-evac-routes')!.geojson.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[10, 50], [10.02, 50.02]],
    });
  });

  it('emergency draws nothing when the incident carries no assembly points', async () => {
    vi.mocked(listIncidents).mockResolvedValue([
      {
        id: 'i1',
        incident_type: 'flood',
        severity: 'high',
        status: 'active',
        lat: 50,
        lng: 10,
        reported_at: '2026-07-29T00:00:00Z',
        description: 'river burst',
        properties: {},
      },
    ]);
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    renderPlugin('emergency');
    fireEvent.click(screen.getByRole('button', { name: /load incidents/i }));

    fireEvent.click(await incidentRow('flood'));

    expect(await screen.findAllByText(/no assembly_points on this incident/)).toHaveLength(2);
    expect(layer('incident-affected-area')).toBeUndefined();
    expect(layer('incident-evac-routes')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
