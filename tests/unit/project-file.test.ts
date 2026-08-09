import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serializeProject,
  parseProject,
  applyProject,
  asProject,
} from '../../src/features/project/projectFile';
import { useAppStore } from '../../src/store/app';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useSplitViewStore } from '../../src/store/splitView';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { cornersOfBbox } from '../../src/overlay/georeference';

const venice: AgentLayer = {
  id: 'venice',
  name: 'Venice canals',
  color: '#38bdf8',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { depth: 3 },
        geometry: { type: 'Point', coordinates: [12.33, 45.44] },
      },
    ],
  },
  style: { opacity: 0.6 },
  path: 'outputs/venice.gpkg',
};

function resetStores() {
  useAppStore.setState({ renderer: 'cesium', basemap: 'liberty', customBasemap: null });
  useAgentLayerStore.setState({
    layers: [],
    rasterLayers: [],
    editingRasterId: null,
    markers: [],
    generation: 0,
  });
  useOgcLayerStore.setState({ layers: [] });
  useSplitViewStore.setState({ active: false, paneRenderer: 'maplibre' });
}

// applyProject polls for a Cesium viewer that never arrives in jsdom, so run the
// poll out on fake timers rather than leaving it live between tests
function flushCameraPoll() {
  vi.advanceTimersByTime(4200);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetStores();
  setSharedCamera({ longitude: 0, latitude: 20, zoom: 2, bearing: 0, pitch: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('project round trip', () => {
  it('restores renderer, basemap, layers, markers, ogc services and split view', () => {
    useAppStore.setState({ renderer: 'maplibre', basemap: 'dark' });
    useAgentLayerStore.getState().setLayers([venice]);
    useAgentLayerStore.setState({
      markers: [{ id: 'm1', lon: 12.33, lat: 45.44, color: '#f00', label: 'dock' }],
    });
    useOgcLayerStore.getState().addLayer('bathymetry', 'https://example.org/wms', 'wms');
    useSplitViewStore.setState({ active: true, paneRenderer: 'cesium' });

    const saved = JSON.stringify(serializeProject('venice study'));
    resetStores();

    applyProject(parseProject(saved));
    flushCameraPoll();

    const app = useAppStore.getState();
    expect(app.renderer).toBe('maplibre');
    expect(app.basemap).toBe('dark');

    const agent = useAgentLayerStore.getState();
    expect(agent.layers).toHaveLength(1);
    expect(agent.layers[0].name).toBe('Venice canals');
    expect(agent.layers[0].path).toBe('outputs/venice.gpkg');
    expect(agent.layers[0].style?.opacity).toBe(0.6);
    expect(agent.layers[0].geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [12.33, 45.44],
    });
    expect(agent.markers).toEqual([
      { id: 'm1', lon: 12.33, lat: 45.44, color: '#f00', label: 'dock' },
    ]);

    const ogc = useOgcLayerStore.getState().layers;
    expect(ogc).toHaveLength(1);
    expect(ogc[0]).toMatchObject({
      name: 'bathymetry',
      url: 'https://example.org/wms',
      type: 'wms',
    });

    const split = useSplitViewStore.getState();
    expect(split.active).toBe(true);
    expect(split.paneRenderer).toBe('cesium');
  });

  it('names an image overlay and its placement, without the bitmap', () => {
    useAgentLayerStore.getState().addRasterLayer({
      id: 'plan',
      name: 'site plan.png',
      url: 'data:image/png;base64,AAA',
      corners: cornersOfBbox([12, 45, 13, 46]),
      opacity: 0.5,
      visible: false,
    });

    const saved = parseProject(JSON.stringify(serializeProject('site')));

    expect(saved.imageOverlays).toEqual([
      {
        id: 'plan',
        name: 'site plan.png',
        corners: cornersOfBbox([12, 45, 13, 46]),
        opacity: 0.5,
        visible: false,
      },
    ]);
    // megabytes of data URL have no business in a shared JSON file
    expect(JSON.stringify(saved)).not.toContain('base64');
  });

  it('reads a project file written before image overlays existed', () => {
    const { imageOverlays: _dropped, ...older } = serializeProject('older');
    expect(parseProject(JSON.stringify(older)).imageOverlays).toEqual([]);
  });

  it('replaces the ogc layers already present', () => {
    useOgcLayerStore.getState().addLayer('stale', 'https://example.org/old', 'xyz');
    const project = parseProject(
      JSON.stringify({
        ...serializeProject('p'),
        ogcLayers: [{ id: 'x', name: 'fresh', url: 'https://example.org/new', type: 'xyz' }],
      }),
    );

    applyProject(project);
    flushCameraPoll();

    expect(useOgcLayerStore.getState().layers.map((l) => l.name)).toEqual(['fresh']);
  });

  it('restores a custom basemap', () => {
    const tiles = { url: 'https://tiles.example.org/{z}/{x}/{y}.png', attr: 'Example' };
    const project = parseProject(
      JSON.stringify({ ...serializeProject('p'), basemap: 'custom', customBasemap: tiles }),
    );

    applyProject(project);
    flushCameraPoll();

    const app = useAppStore.getState();
    expect(app.basemap).toBe('custom');
    expect(app.customBasemap).toEqual(tiles);
  });
});

describe('parseProject', () => {
  it('rejects json that is not a project', () => {
    expect(() => parseProject('{"type":"FeatureCollection","features":[]}')).toThrow(
      /not a Viewtopia project/,
    );
  });

  it('rejects an unsupported schema version', () => {
    expect(() => parseProject('{"app":"viewtopia","schemaVersion":2}')).toThrow(
      /schema version 2/,
    );
  });

  it('rejects text that is not json', () => {
    expect(() => parseProject('not json at all')).toThrow(/not valid JSON/);
  });

  it('rejects a project with no camera', () => {
    expect(() =>
      parseProject('{"app":"viewtopia","schemaVersion":1,"renderer":"cesium","basemap":"dark"}'),
    ).toThrow(/camera/);
  });

  it('migrates a layer saved with the old choropleth shape', () => {
    const project = parseProject(
      JSON.stringify({
        ...serializeProject('p'),
        agentLayers: [
          {
            id: 'risk',
            name: 'risk',
            color: '#3388ff',
            geojson: { type: 'FeatureCollection', features: [] },
            choropleth: { field: 'risk', breaks: [0, 50], colors: ['#111111', '#222222'] },
          },
        ],
      }),
    );

    expect(project.agentLayers[0].symbology).toMatchObject({
      kind: 'graduated',
      field: 'risk',
      breaks: [0, 50],
      colors: ['#111111', '#222222'],
    });
  });
});

describe('asProject', () => {
  it('passes over geojson so the importer still handles it', () => {
    expect(asProject('{"type":"FeatureCollection","features":[]}')).toBeNull();
    expect(asProject('not json')).toBeNull();
  });

  it('throws on a project it cannot read, rather than falling through', () => {
    expect(() => asProject('{"app":"viewtopia","schemaVersion":2}')).toThrow(/schema version/);
  });
});

describe('serializeProject without a live viewer', () => {
  it('falls back to the shared camera', () => {
    setSharedCamera({ longitude: 12.33, latitude: 45.44, zoom: 5, bearing: 30, pitch: 40 });

    const project = serializeProject('venice');

    expect(project.camera.lng).toBeCloseTo(12.33);
    expect(project.camera.lat).toBeCloseTo(45.44);
    expect(project.camera.height).toBeCloseTo(4e7 / 2 ** 5);
    expect(project.camera.heading).toBe(30);
    expect(project.camera.pitch).toBe(-50);
    expect(project.savedAt).not.toBe('');
  });

  it('round trips the camera back through zoom without drifting', () => {
    setSharedCamera({ longitude: -0.12, latitude: 51.5, zoom: 8, bearing: 0, pitch: 60 });
    const project = serializeProject('london');

    applyProject(parseProject(JSON.stringify(project)));
    flushCameraPoll();

    expect(serializeProject('again').camera.height).toBeCloseTo(project.camera.height, 3);
  });
});
