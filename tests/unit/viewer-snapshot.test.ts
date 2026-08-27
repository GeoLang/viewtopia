import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/projects/api', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('../../src/offline/db', () => ({
  projectMaps: { getAll: vi.fn(async () => []), get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

import { buildViewerSnapshot } from '../../src/actions/snapshot';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { useAssetStateStore } from '../../src/live/assetState';
import { useLiveStore } from '../../src/live/liveStore';
import { ASSET_RULE_ID, emptyLiveDocument, type AssetRule } from '../../src/live/types';
import { useProjectsStore } from '../../src/projects/projectsStore';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useSplitViewStore } from '../../src/store/splitView';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import type { Project } from '../../src/projects/types';
import { useScenarioCompareStore } from '../../src/features/scenario/compare';

/**
 * The state as the viewer sends it, kept on disk so geolang's viewer evals can
 * copy it (geolang/evals/viewer/snapshot.json) and score a model against the
 * shape the viewer really builds. Run with UPDATE_VIEWER_SNAPSHOT=1 to rewrite
 * it after changing the snapshot.
 */
const FIXTURE = resolve('tests/unit/fixtures/viewer-snapshot.json');

const RIVERSIDE: Project = {
  id: 'prj_riverside',
  workspaceId: 'wsp_thames',
  name: 'Riverside Widening',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-20T00:00:00Z',
  createdBy: 'someone',
  role: 'editor',
};

const WATER_LEVEL_RULE: AssetRule = {
  layerId: 'lyr_sensors',
  kind: 'water_level',
  breakpoints: [
    { value: 0.5, color: '#2c7fb8' },
    { value: 1.5, color: '#f03b20' },
  ],
  defaultColor: '#999999',
  offlineColor: '#444444',
};

const NO_FEATURES: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * The scene the eval prompts are written against: a project under revision,
 * three vector layers, a 3D Tiles city, a live document colouring its sensors,
 * and a parcel picked on the map.
 */
function seedRiverside(): void {
  setSharedCamera({ longitude: -0.1276, latitude: 51.5072, zoom: 14, pitch: 0, bearing: 0 });
  useAppStore.setState({ chatMode: true, renderer: 'cesium', activeTab: 'globe', basemap: 'osm' });
  // the layout is the pane count, which beforeEach does not put back
  useSplitViewStore.getState().setLayout('twoAcross');
  useAgentLayerStore.setState({
    layers: [
      { id: 'lyr_parcels', name: 'Parcels', geojson: NO_FEATURES, style: { opacity: 1 } },
      {
        id: 'lyr_flood',
        name: 'Flood zones',
        geojson: NO_FEATURES,
        visible: false,
        style: { opacity: 0.6 },
      },
      { id: 'lyr_sensors', name: 'Sensors', geojson: NO_FEATURES, style: { opacity: 1 } },
    ],
  });
  useTiles3dLayerStore.setState({
    layers: [
      { id: 'lyr_buildings', name: 'Buildings', url: 'https://example.test/tileset.json', visible: true },
    ],
  });
  useProjectsStore.setState({ items: [RIVERSIDE], activeProjectId: RIVERSIDE.id });
  useLiveStore.setState({
    documentId: 'doc_riverside',
    document: {
      ...emptyLiveDocument('Riverside Live'),
      assets: { [ASSET_RULE_ID]: WATER_LEVEL_RULE },
    },
  });
  // the picker reports the feature's own properties as text, so a coordinate
  // reaches the model as the string the data carried
  useFeaturePickerStore.setState({
    selected: [
      { id: 'id', value: 'P-1183' },
      { id: 'name', value: '12 Mill Lane' },
      { id: 'lon', value: '-0.1291' },
      { id: 'lat', value: '51.5085' },
    ],
  });
}

const HARBOUR: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Harbour survey',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  createdBy: 'someone',
  role: 'owner',
};

const DEPTH_RULE: AssetRule = {
  layerId: 'buoys',
  kind: 'depth',
  breakpoints: [{ value: 0, color: '#2ecc71' }],
  defaultColor: '#888888',
  offlineColor: '#333333',
};

beforeEach(() => {
  setSharedCamera({ longitude: 0, latitude: 20, zoom: 2, pitch: 0, bearing: 0 });
  useAppStore.setState({
    chatMode: false,
    renderer: 'maplibre',
    activeTab: 'globe',
    basemap: 'dark',
    layers: [],
  });
  useSplitViewStore.setState({ active: false });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [] });
  useOgcLayerStore.setState({ layers: [] });
  useTiles3dLayerStore.setState({ layers: [] });
  useProjectsStore.setState({ items: [], activeProjectId: null });
  useLiveStore.setState({ documentId: null, document: emptyLiveDocument() });
  useAssetStateStore.setState({ historyAt: null });
  useFeaturePickerStore.setState({ selected: null });
});

describe('buildViewerSnapshot', () => {
  it('describes an app nobody has touched yet', () => {
    expect(buildViewerSnapshot()).toEqual({
      mode: 'full',
      camera: { longitude: 0, latitude: 20, zoom: 2, pitch: 0, bearing: 0 },
      renderer: 'maplibre',
      tab: 'globe',
      basemap: 'dark',
      splitView: { active: false, layout: 'twoAcross' },
      layers: [],
      project: null,
      live: null,
      assetRule: null,
      historyAt: null,
      pickedFeature: null,
      scenario: null,
    });
  });

  it('describes what is on screen, whichever store holds it', () => {
    setSharedCamera({ longitude: 7.42, latitude: 43.74, zoom: 14 });
    useAppStore.setState({
      chatMode: true,
      renderer: 'cesium',
      activeTab: 'map',
      basemap: 'satellite',
      layers: [
        { id: 'map-1', name: 'Parcels', type: 'vector', visible: true, opacity: 0.8 },
      ],
    });
    useSplitViewStore.getState().setLayout('grid');
    useSplitViewStore.getState().setActive(true);
    useAgentLayerStore.setState({
      layers: [
        {
          id: 'agent-1',
          name: 'Depot zones',
          geojson: { type: 'FeatureCollection', features: [] },
          visible: false,
          style: { opacity: 0.5 },
        },
      ],
      rasterLayers: [
        {
          id: 'raster-1',
          name: 'Scan',
          url: 'data:image/png;base64,',
          corners: {
            topLeft: [0, 1],
            topRight: [1, 1],
            bottomRight: [1, 0],
            bottomLeft: [0, 0],
          },
          opacity: 0.4,
          visible: true,
        },
      ],
    });
    useOgcLayerStore.setState({
      layers: [{ id: 'ogc-1', name: 'Bathymetry', type: 'wms', url: 'https://example.test' }],
    });
    useTiles3dLayerStore.setState({
      layers: [{ id: 'tiles-1', name: 'Port model', url: 'https://example.test/tileset.json', visible: true }],
    });
    useProjectsStore.setState({ items: [HARBOUR], activeProjectId: HARBOUR.id });
    useLiveStore.setState({
      documentId: 'document-9',
      document: {
        ...emptyLiveDocument('Harbour live'),
        assets: { [ASSET_RULE_ID]: DEPTH_RULE },
      },
    });
    useAssetStateStore.setState({ historyAt: '2026-08-25T09:00:00Z' });
    useFeaturePickerStore.setState({
      selected: [
        { id: 'name', value: 'Quay 3' },
        { id: 'depth', value: '11.5' },
      ],
    });

    expect(buildViewerSnapshot()).toEqual({
      mode: 'chat',
      camera: { longitude: 7.42, latitude: 43.74, zoom: 14, pitch: 0, bearing: 0 },
      renderer: 'cesium',
      tab: 'map',
      basemap: 'satellite',
      splitView: { active: true, layout: 'grid' },
      layers: [
        { id: 'agent-1', name: 'Depot zones', kind: 'agent', visible: false, opacity: 0.5 },
        { id: 'raster-1', name: 'Scan', kind: 'raster', visible: true, opacity: 0.4 },
        { id: 'ogc-1', name: 'Bathymetry', kind: 'ogc', visible: true, opacity: 1 },
        { id: 'tiles-1', name: 'Port model', kind: 'tiles3d', visible: true },
        { id: 'map-1', name: 'Parcels', kind: 'map', visible: true, opacity: 0.8 },
      ],
      project: { id: 'project-1', name: 'Harbour survey' },
      live: { documentId: 'document-9', name: 'Harbour live' },
      assetRule: DEPTH_RULE,
      historyAt: '2026-08-25T09:00:00Z',
      pickedFeature: { name: 'Quay 3', depth: '11.5' },
      scenario: null,
    });
  });

  it('names the comparison in progress', () => {
    const compared = {
      datasetId: 'dataset-1',
      baseBranchId: 'branch-main',
      scenarioBranchId: 'branch-widening',
      baseAt: null,
      scenarioAt: '2026-08-25T09:00:00.000Z',
      distanceMeters: 50,
    };
    const coverage = {
      base: { featureCount: 3, squareMeters: 900 },
      scenario: { featureCount: 4, squareMeters: 1200 },
    };
    useScenarioCompareStore.setState({ compared, coverage });

    expect(buildViewerSnapshot().scenario).toEqual({ compared, coverage });

    useScenarioCompareStore.setState({ compared: null, coverage: null });
    expect(buildViewerSnapshot().scenario).toBeNull();
  });

  it('sends the model no more layers than it can use', () => {
    useAppStore.setState({
      layers: Array.from({ length: 60 }, (_, index) => ({
        id: `map-${index}`,
        name: `Layer ${index}`,
        type: 'vector' as const,
        visible: true,
        opacity: 1,
      })),
    });

    expect(buildViewerSnapshot().layers).toHaveLength(50);
  });
});

describe('the viewer snapshot fixture', () => {
  it('matches what the viewer sends with every chat message', () => {
    seedRiverside();
    const current = buildViewerSnapshot();
    if (process.env.UPDATE_VIEWER_SNAPSHOT) {
      writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
    }
    // parsed, since a windows checkout rewrites the fixture's line endings
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(current);
  });
});
