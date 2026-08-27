import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runViewerAction } from '../../src/actions/dispatch';
import { listViewerLayers } from '../../src/actions/layerIndex';
import { runAction } from '../../src/actions/registry';
import '../../src/actions/layers';
import '../../src/actions/terrain';
import { useTerrainAnalysisStore } from '../../src/features/terrain/analysis';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';

/** The view every default-bbox request is expected to carry. */
const VIEW = { west: -0.2, south: 51.4, east: -0.05, north: 51.6 };

/** A 0.01 degree square of visible ground, so the area comes out the same every run. */
const VISIBLE_SQUARE: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { visible_cells: 4 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      },
    },
  ],
};

const FLOODED_CELLS = 431;

const FLOODED_AREA: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { flooded_cells: FLOODED_CELLS },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-0.2, 51.4],
            [-0.05, 51.4],
            [-0.05, 51.6],
            [-0.2, 51.6],
            [-0.2, 51.4],
          ],
        ],
      },
    },
  ],
};

/** A ramp with one deep notch, so a profile carrying it can only be this DEM. */
const NOTCH_SAMPLE = 5;
const sampleElevation = (index: number) => (index === NOTCH_SAMPLE ? 0 : 100 + index * 20);

/** Enough of a MapLibre map for the result layers, and for reading the view back. */
function fakeMapLibre() {
  const sources: Record<string, unknown> = {};
  const layers: string[] = [];
  return {
    sources,
    layers,
    getBounds: () => ({
      getWest: () => VIEW.west,
      getSouth: () => VIEW.south,
      getEast: () => VIEW.east,
      getNorth: () => VIEW.north,
    }),
    getSource: (id: string) => sources[id],
    addSource: (id: string, spec: unknown) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (spec: { id: string }) => {
      layers.push(spec.id);
    },
    removeLayer: (id: string) => {
      layers.splice(layers.indexOf(id), 1);
    },
  };
}

const registry = vi.hoisted(() => ({ map: null as ReturnType<typeof fakeMapLibre> | null }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: () => null,
  getActiveMapLibre: () => registry.map,
  getActiveDeck: () => null,
}));

/** Every request the terrain actions make, answered without a backend. */
function fakeBackend(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  requests.push({ url, body });
  if (url.includes('/analysis/viewshed')) return jsonResponse(VISIBLE_SQUARE);
  if (url.includes('/analysis/flood')) return jsonResponse(FLOODED_AREA);
  if (url.includes('api.open-elevation.com')) {
    const locations = new URL(url).searchParams.get('locations') ?? '';
    const results = locations.split('|').map((_, index) => ({ elevation: sampleElevation(index) }));
    return jsonResponse({ results });
  }
  throw new Error(`nothing stubbed for ${url}`);
}

function jsonResponse(payload: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

let requests: { url: string; body: unknown }[];

const TWO_POINTS = { start_lon: 0, start_lat: 0, end_lon: 0.1, end_lat: 0, samples: 10 };

/** the notch is the only descent, and the rest is 20 m a sample: added up from the DEM above. */
const PROFILE_TEXT =
  '11.12 km of ground: lowest 0 m, highest 300 m, 380 m of climb and 180 m of descent.';

beforeEach(() => {
  requests = [];
  registry.map = fakeMapLibre();
  vi.stubGlobal('fetch', vi.fn(fakeBackend));
  useAppStore.setState({ renderer: 'maplibre', layers: [] });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  useTerrainAnalysisStore.setState({ viewshed: null, flood: null });
  useChatStore.setState({ sessions: [], activeSessionId: null, followUp: null, followUpCount: 0 });
});

afterEach(() => vi.unstubAllGlobals());

describe('analysis.viewshed', () => {
  it('asks tiletopia what the observer sees and draws it', async () => {
    const result = await runAction('analysis.viewshed', {
      lon: 7.42,
      lat: 43.73,
      height_m: 10,
      radius_m: 2500,
    });

    expect(requests).toEqual([
      {
        url: '/tiles/v1/analysis/viewshed',
        body: { observer: [7.42, 43.73], height_m: 10, radius_m: 2500 },
      },
    ]);
    expect(listViewerLayers()).toContainEqual(
      expect.objectContaining({ id: 'viewshed-result', name: 'Viewshed' }),
    );
    expect(useTerrainAnalysisStore.getState().viewshed).toEqual({
      longitude: 7.42,
      latitude: 43.73,
      heightMeters: 10,
      radiusMeters: 2500,
      visibleSquareMeters: expect.closeTo(1_236_435, -1),
    });
    expect(result.text).toBe('The observer at 7.4200, 43.7300 sees 1.24 km² within 2500 m.');
  });

  it('stands the observer 2 m up and looks 1000 m out when nobody says', async () => {
    await runAction('analysis.viewshed', { lon: 7.42, lat: 43.73 });

    expect(requests[0].body).toEqual({ observer: [7.42, 43.73], height_m: 2, radius_m: 1000 });
  });

  it('refuses an observer off the globe', async () => {
    await expect(runAction('analysis.viewshed', { lon: 743, lat: 43.73 })).rejects.toThrow(
      'is not a longitude and latitude',
    );
    expect(requests).toEqual([]);
  });

  it('leaves a layer the layers actions can hide and take off', async () => {
    await runAction('analysis.viewshed', { lon: 7.42, lat: 43.73 });

    const hidden = await runAction('layers.set_visible', { layer: 'Viewshed', visible: false });
    expect(hidden.text).toBe('Viewshed is now hidden.');

    const removed = await runAction('layers.remove', { layer: 'Viewshed' });
    expect(removed.text).toBe('Viewshed is off the map.');
    expect(listViewerLayers().map((layer) => layer.id)).not.toContain('viewshed-result');
    // the panel reads this, and must not go on reporting a result nobody can see
    expect(useTerrainAnalysisStore.getState().viewshed).toBeNull();
  });
});

describe('analysis.flood', () => {
  it('floods the current view and reports the cells', async () => {
    const result = await runAction('analysis.flood', { level_m: 20 });

    expect(requests).toEqual([
      {
        url: '/tiles/v1/analysis/flood',
        body: { level_m: 20, bbox: [VIEW.west, VIEW.south, VIEW.east, VIEW.north] },
      },
    ]);
    expect(listViewerLayers()).toContainEqual(
      expect.objectContaining({ id: 'flood-result', name: 'Flood' }),
    );
    expect(useTerrainAnalysisStore.getState().flood).toEqual({
      levelMeters: 20,
      bbox: [VIEW.west, VIEW.south, VIEW.east, VIEW.north],
      floodedCells: FLOODED_CELLS,
    });
    expect(result.text).toBe('A 20 m water level floods 431 cells.');
  });

  it('floods the bbox it was given instead', async () => {
    await runAction('analysis.flood', { level_m: 5, bbox: [1, 2, 3, 4] });

    expect(requests[0].body).toEqual({ level_m: 5, bbox: [1, 2, 3, 4] });
  });

  it('refuses a bbox that is not a box', async () => {
    await expect(runAction('analysis.flood', { level_m: 5, bbox: [3, 2, 1, 4] })).rejects.toThrow(
      'is not a box',
    );
    expect(requests).toEqual([]);
  });
});

describe('analysis.terrain_profile', () => {
  it('reads the ground between two points and answers how it rises and falls', async () => {
    const result = await runAction('analysis.terrain_profile', TWO_POINTS);

    expect(result.text).toBe(PROFILE_TEXT);
    // the profile answers a question, it does not put anything on the map
    expect(listViewerLayers()).toEqual([]);
  });

  it('runs along a line the prompt named by layer name', async () => {
    useAgentLayerStore.setState({
      layers: [
        {
          id: 'layer-1',
          name: 'Ridge walk',
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [0, 0],
                    [0.1, 0],
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    const result = await runAction('analysis.terrain_profile', { layer: 'ridge', samples: 10 });

    expect(result.text).toBe(PROFILE_TEXT);
  });

  it('says so when the named layer carries no line', async () => {
    useAgentLayerStore.setState({
      layers: [
        {
          id: 'layer-1',
          name: 'Trees',
          geojson: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
            ],
          },
        },
      ],
    });

    await expect(runAction('analysis.terrain_profile', { layer: 'Trees' })).rejects.toThrow(
      'Trees carries no line to run a profile along',
    );
  });

  it('refuses a line with neither a layer nor two ends', async () => {
    await expect(runAction('analysis.terrain_profile', { start_lon: 0 })).rejects.toThrow(
      'a profile runs along a layer, or between start_lon, start_lat, end_lon and end_lat',
    );
  });

  it('refuses more samples than the elevation lookup is asked for', async () => {
    await expect(
      runAction('analysis.terrain_profile', { ...TWO_POINTS, samples: 500 }),
    ).rejects.toThrow('a profile reads 10 to 200 points, not 500');
    expect(requests).toEqual([]);
  });

  it('sends its answer back to the model through the chat', async () => {
    await runViewerAction({ name: 'analysis.terrain_profile', args: TWO_POINTS });

    expect(useChatStore.getState().activeMessages().map((message) => message.content)).toEqual([
      PROFILE_TEXT,
    ]);
    expect(useChatStore.getState().followUp).toBe(
      `Result of analysis.terrain_profile: ${PROFILE_TEXT}`,
    );
  });
});

describe('analysis.cross_section', () => {
  it('answers the same numbers and draws the line it sampled', async () => {
    const result = await runAction('analysis.cross_section', TWO_POINTS);

    expect(result.text).toBe(PROFILE_TEXT);
    expect(listViewerLayers()).toContainEqual(
      expect.objectContaining({ id: 'cross-section-line', name: 'Cross section' }),
    );
    const drawn = useAgentLayerStore
      .getState()
      .layers.find((layer) => layer.id === 'cross-section-line');
    const line = drawn?.geojson.features[0].geometry as GeoJSON.LineString;
    expect(line.coordinates).toHaveLength(TWO_POINTS.samples + 1);
    expect(line.coordinates[0]).toEqual([0, 0]);
  });
});
