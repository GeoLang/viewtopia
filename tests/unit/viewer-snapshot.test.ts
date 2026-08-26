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
        { id: 'map-1', name: 'Parcels', kind: 'map', visible: true, opacity: 0.8 },
        { id: 'agent-1', name: 'Depot zones', kind: 'agent', visible: false, opacity: 0.5 },
        { id: 'raster-1', name: 'Scan', kind: 'raster', visible: true, opacity: 0.4 },
        { id: 'ogc-1', name: 'Bathymetry', kind: 'ogc', visible: true },
        { id: 'tiles-1', name: 'Port model', kind: 'tiles3d', visible: true },
      ],
      project: { id: 'project-1', name: 'Harbour survey' },
      live: { documentId: 'document-9', name: 'Harbour live' },
      assetRule: DEPTH_RULE,
      historyAt: '2026-08-25T09:00:00Z',
      pickedFeature: { name: 'Quay 3', depth: '11.5' },
      scenario: null,
    });
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
