import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JulianDate, type ClippingPlaneCollection, type Viewer } from 'cesium';
import '../../src/actions/scene';
import { runViewerAction } from '../../src/actions/dispatch';
import { runAction } from '../../src/actions/registry';
import { SPATIAL_STATS_GROUP } from '../../src/features/analysis/spatialStats';
import { planeDistance } from '../../src/features/scene/clipping';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useChatStore } from '../../src/store/chat';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

/** a square ring itinera leaves open, in its own [lat, lon] order */
const BOUNDARY = [
  [45.5, -73.6],
  [45.5, -73.5],
  [45.6, -73.5],
  [45.6, -73.6],
];

const SERVICE_AREA_LAYER = 'travel-time-service-area';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeViewer() {
  return {
    shadows: false,
    shadowMap: { darkness: 0, softShadows: false, size: 0 },
    clock: { shouldAnimate: true, currentTime: JulianDate.fromDate(new Date(0)) },
    scene: {
      globe: {
        enableLighting: false,
        clippingPlanes: undefined as ClippingPlaneCollection | undefined,
      },
      renders: 0,
      requestRender() {
        this.renders += 1;
      },
    },
    entities: {
      removals: 0,
      removeAll() {
        this.removals += 1;
      },
    },
    renders: 0,
    render() {
      this.renders += 1;
    },
    canvas: {
      toBlob(callback: (blob: Blob | null) => void) {
        callback(new Blob(['png bytes'], { type: 'image/png' }));
      },
    },
    isDestroyed: () => false,
  };
}

function pointLayer(id: string, name: string): AgentLayer {
  return {
    id,
    name,
    geojson: {
      type: 'FeatureCollection',
      features: [
        [-73.6, 45.5, 4],
        [-73.6001, 45.5001, 6],
        [-73.4, 45.7, 20],
      ].map(([lon, lat, height]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: { height },
      })),
    },
  };
}

let viewer: ReturnType<typeof fakeViewer>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  viewer = fakeViewer();
  setActiveCesiumViewer(viewer as unknown as Viewer);
  useAgentLayerStore.setState({ layers: [], markers: [] });
  useDeckLayersStore.setState({ groups: {} });
  useAppStore.setState({ renderer: 'cesium', activeTab: 'map', layers: [] });
  useChatStore.setState({ sessions: [], activeSessionId: null, followUp: null, followUpCount: 0 });
  fetchMock = vi.fn(async () => jsonResponse({ error: 'unexpected call' }, 500));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  setActiveCesiumViewer(null);
  vi.unstubAllGlobals();
});

describe('scene.shadows', () => {
  it('lights the globe from the sun at the date and hour it is given', async () => {
    const result = await runAction('scene.shadows', {
      on: true,
      date: '2026-06-21',
      hour: 14.5,
      darkness: 0.6,
      soft_shadows: false,
    });

    expect(viewer.shadows).toBe(true);
    expect(viewer.scene.globe.enableLighting).toBe(true);
    expect(viewer.shadowMap).toEqual({ darkness: 0.6, softShadows: false, size: 2048 });
    expect(viewer.clock.shouldAnimate).toBe(false);
    const at = JulianDate.toDate(viewer.clock.currentTime);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual([2026, 6, 21]);
    expect([at.getHours(), at.getMinutes()]).toEqual([14, 30]);
    expect(result.text).toBe(
      'Shadows are on, sun at 2026-06-21 14:30, darkness 0.60, soft shadows off.',
    );
  });

  it('turns the shadows off and leaves the lighting flat', async () => {
    await runAction('scene.shadows', { on: true });
    const result = await runAction('scene.shadows', { on: false, date: '2026-06-21' });

    expect(viewer.shadows).toBe(false);
    expect(viewer.scene.globe.enableLighting).toBe(false);
    expect(result.text).toContain('Shadows are off');
    expect(result.text).toContain('darkness 0.30, soft shadows on');
  });

  it('refuses an hour outside the day and a date that is not a day', async () => {
    await expect(runAction('scene.shadows', { on: true, hour: 26 })).rejects.toThrow(
      'hour is between 0 and 24, not 26',
    );
    await expect(runAction('scene.shadows', { on: true, date: 'midsummer' })).rejects.toThrow(
      'date is a day as yyyy-mm-dd, not midsummer',
    );
  });

  it('says the globe is not on screen when no viewer is registered', async () => {
    setActiveCesiumViewer(null);
    await expect(runAction('scene.shadows', { on: true })).rejects.toThrow(
      'there is no Cesium globe on screen',
    );
  });
});

describe('scene.clipping', () => {
  it('cuts the globe along the axis it is given', async () => {
    const result = await runAction('scene.clipping', { on: true, axis: 'x', position: 25 });

    const planes = viewer.scene.globe.clippingPlanes;
    expect(planes?.enabled).toBe(true);
    expect(planes?.length).toBe(1);
    expect(planes?.get(0).normal.x).toBe(1);
    expect(planes?.get(0).distance).toBeCloseTo(planeDistance(25));
    expect(viewer.scene.renders).toBe(1);
    expect(result.text).toBe('The globe is cut along the x axis at 25%.');
  });

  it('moves the plane it already made rather than building a second one', async () => {
    await runAction('scene.clipping', { on: true, axis: 'x', position: 25 });
    const planes = viewer.scene.globe.clippingPlanes;
    const result = await runAction('scene.clipping', { on: false, axis: 'z', position: 75 });

    expect(viewer.scene.globe.clippingPlanes).toBe(planes);
    expect(planes?.get(0).normal.z).toBe(1);
    expect(planes?.get(0).distance).toBeCloseTo(planeDistance(75));
    expect(planes?.enabled).toBe(false);
    expect(result.text).toBe('The globe is whole again.');
  });

  it('refuses a position off the axis', async () => {
    await expect(runAction('scene.clipping', { on: true, position: 140 })).rejects.toThrow(
      'position is between 0 and 100, not 140',
    );
  });
});

describe('analysis.travel_time', () => {
  it('draws one ring per band and reports the area of each', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ reachable_nodes: 42, boundary: BOUNDARY }));

    const result = await runAction('analysis.travel_time', {
      lon: -73.55,
      lat: 45.55,
      bands: '10, 5',
      profile: 'bicycle',
    });

    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual([
      '/api/isochrone?lat=45.55&lon=-73.55&max_seconds=300&profile=bicycle',
      '/api/isochrone?lat=45.55&lon=-73.55&max_seconds=600&profile=bicycle',
    ]);
    const layer = useAgentLayerStore.getState().layers.find((l) => l.id === SERVICE_AREA_LAYER);
    expect(layer?.name).toBe('Service area (bicycle)');
    expect(layer?.geojson.features.map((f) => f.properties?.minutes)).toEqual([10, 5]);
    // the same ring for both bands, so both areas read the same
    expect(result.text).toBe(
      'By bicycle from -73.5500, 45.5500: 5 min 8658.56 ha, 10 min 8658.56 ha.',
    );
  });

  it('keeps the bands that drew and names how many did not', async () => {
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ reachable_nodes: 3, boundary: BOUNDARY }))
      .mockImplementationOnce(async () => jsonResponse({ error: 'no node found' }, 400));

    const result = await runAction('analysis.travel_time', { lon: -73.55, lat: 45.55, bands: '5, 10' });

    expect(
      useAgentLayerStore.getState().layers.find((l) => l.id === SERVICE_AREA_LAYER)?.geojson.features,
    ).toHaveLength(1);
    expect(result.text).toContain('1 of 2 bands: no node found');
  });

  it("carries itinera's own message when no band drew", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'graph is empty' }, 400));

    await expect(
      runAction('analysis.travel_time', { lon: -73.55, lat: 45.55, bands: '5' }),
    ).rejects.toThrow('graph is empty');
    expect(useAgentLayerStore.getState().layers).toEqual([]);
  });

  it('refuses bands that are not minutes', async () => {
    await expect(
      runAction('analysis.travel_time', { lon: -73.55, lat: 45.55, bands: 'soon' }),
    ).rejects.toThrow('bands is a list of minutes, not soon');
  });

  it('posts what it drew in the chat when the model runs it', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ reachable_nodes: 7, boundary: BOUNDARY }));

    await runViewerAction({
      name: 'analysis.travel_time',
      args: { lon: -73.55, lat: 45.55, bands: '5' },
    });

    const posted = useChatStore
      .getState()
      .activeMessages()
      .map((message) => message.content);
    expect(posted).toEqual(['By car from -73.5500, 45.5500: 5 min 8658.56 ha.']);
  });
});

describe('analysis.spatial_stats', () => {
  beforeEach(() => {
    useAgentLayerStore.setState({ layers: [pointLayer('sensors', 'Sensors')] });
  });

  it('grids a layer by name and reports the cells and their range', async () => {
    const result = await runAction('analysis.spatial_stats', {
      layer: 'sensor',
      method: 'mean',
      property: 'height',
      cell_size: 500,
    });

    const drawn = useDeckLayersStore.getState().groups[SPATIAL_STATS_GROUP];
    expect(drawn).toHaveLength(1);
    expect(drawn[0].props.cellSize).toBe(500);
    expect(drawn[0].props.data).toHaveLength(3);
    // the grid draws on the deck overlay, which only maplibre carries
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(result.text).toBe(
      '3 points of Sensors in 2 cells of 500 m, mean(height) from 5 to 20.',
    );
  });

  it('counts the points in a cell when no method is given', async () => {
    const result = await runAction('analysis.spatial_stats', { layer: 'sensors' });

    expect(result.text).toBe('3 points of Sensors in 2 cells of 500 m, count from 1 to 2.');
  });

  it('refuses a layer with no features and a cell size off the slider', async () => {
    await expect(runAction('analysis.spatial_stats', { layer: 'nowhere' })).rejects.toThrow(
      'no layer matches "nowhere"',
    );
    await expect(
      runAction('analysis.spatial_stats', { layer: 'sensors', cell_size: 9000 }),
    ).rejects.toThrow('cell_size is between 50 and 5000, not 9000');
  });
});

describe('scene.screenshot', () => {
  it('renders a frame and hands the canvas to a PNG download', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:shot');
    URL.revokeObjectURL = vi.fn();
    const downloaded: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded.push(this);
      });

    const result = await runAction('scene.screenshot', {});

    expect(viewer.renders).toBe(1);
    expect(downloaded.map((anchor) => [anchor.download, anchor.href])).toEqual([
      ['viewtopia-screenshot.png', 'blob:shot'],
    ]);
    expect(result.text).toBe('Took a PNG picture of the globe.');
    click.mockRestore();
  });

  it('says the globe is not on screen when no viewer is registered', async () => {
    setActiveCesiumViewer(null);
    await expect(runAction('scene.screenshot', {})).rejects.toThrow(
      'there is no Cesium globe on screen',
    );
  });
});

describe('scene.clear', () => {
  it('empties the markers and clears the globe entities', async () => {
    useAgentLayerStore.getState().addMarker({ lon: 2.2945, lat: 48.8584, color: '#ff0000' });
    useAgentLayerStore.getState().addMarker({ lon: -0.09, lat: 51.51, color: '#ff0000' });

    const result = await runAction('scene.clear', {});

    expect(useAgentLayerStore.getState().markers).toEqual([]);
    expect(viewer.entities.removals).toBe(1);
    expect(result.text).toBe('Cleared 2 markers.');
  });

  it('counts one marker in the singular', async () => {
    useAgentLayerStore.getState().addMarker({ lon: 2.2945, lat: 48.8584, color: '#ff0000' });
    const result = await runAction('scene.clear', {});
    expect(result.text).toBe('Cleared 1 marker.');
  });
});
