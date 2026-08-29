import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/camera';
import '../../src/actions/data';
import '../../src/actions/dataset';
import '../../src/actions/find';
import '../../src/actions/history';
import '../../src/actions/layers';
import '../../src/actions/live';
import '../../src/actions/marker';
import '../../src/actions/project';
import '../../src/actions/scenario';
import '../../src/actions/scene';
import '../../src/actions/terrain';
import '../../src/actions/tileset';
import '../../src/actions/view';
import { ActionError, runAction, type ActionArguments } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { useScenarioCompareStore } from '../../src/features/scenario/compare';
import { FALLBACK_ASSET_COLOR, FALLBACK_OFFLINE_COLOR } from '../../src/live/assetRule';
import { useAssetStateStore } from '../../src/live/assetState';
import { useLiveStore } from '../../src/live/liveStore';
import { ASSET_RULE_ID, emptyLiveDocument, type AssetRule } from '../../src/live/types';
import { useProjectsStore } from '../../src/projects/projectsStore';
import type { Project } from '../../src/projects/types';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useSplitViewStore, type Pane } from '../../src/store/splitView';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';

const MOMENT = '2026-08-25T10:00:00.000Z';

const DOCUMENTS = [{ id: 'doc-1', name: 'Coastline' }];

const HARBOUR: Project = {
  id: 'p-1',
  workspaceId: 'w-1',
  name: 'Harbour survey',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  createdBy: 'ada',
  role: 'owner',
};

function point(risk: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [7.42 + risk / 100, 43.73] },
    properties: { risk },
  };
}

const ROADS: AgentLayer = {
  id: 'agent-roads',
  name: 'Roads',
  geojson: { type: 'FeatureCollection', features: [point(1), point(2), point(3)] },
};

const SENSORS: AgentLayer = {
  id: 'agent-sensors',
  name: 'Sensors',
  geojson: { type: 'FeatureCollection', features: [] },
};

const ASSET_RULE: AssetRule = {
  layerId: SENSORS.id,
  kind: 'temperature',
  breakpoints: [
    { value: 0, color: '#2ecc71' },
    { value: 25, color: '#f1c40f' },
  ],
  defaultColor: FALLBACK_ASSET_COLOR,
  offlineColor: FALLBACK_OFFLINE_COLOR,
};

function pane(): Pane {
  return { renderer: 'maplibre', basemap: 'osm' };
}

function agentLayers(...layers: AgentLayer[]): void {
  useAgentLayerStore.setState({ layers, rasterLayers: [], markers: [], generation: 0 });
}

function joinedWithRule(): void {
  useLiveStore.setState({
    documentId: 'doc-1',
    role: 'edit',
    document: { ...emptyLiveDocument(), assets: { [ASSET_RULE_ID]: ASSET_RULE } },
  });
  agentLayers(SENSORS);
}

function seed(): void {
  useAppStore.setState({
    renderer: 'maplibre',
    activeTab: 'globe',
    basemap: 'dark',
    layers: [
      { id: 'map-contours', name: 'Contours', type: 'geojson', visible: true, opacity: 1 },
      { id: 'map-branch', name: 'Branch main', type: 'geojson', visible: true, opacity: 1 },
    ],
  });
  useSplitViewStore.setState({ active: false, comparePanes: [pane()], activePane: 0 });
  agentLayers(ROADS);
  useOgcLayerStore.setState({ layers: [] });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  useProjectsStore.setState({ items: [HARBOUR], activeProjectId: null, loading: false });
  useLiveStore.setState({ documentId: null, role: 'edit', document: emptyLiveDocument() });
  useAssetStateStore.getState().clear();
  useScenarioCompareStore.setState({ compared: null, coverage: null });
}

const STORES = [
  useAppStore,
  useSplitViewStore,
  useAgentLayerStore,
  useOgcLayerStore,
  useTiles3dLayerStore,
  useProjectsStore,
  useLiveStore,
  useAssetStateStore,
  useScenarioCompareStore,
];

function storeStates(): unknown[] {
  return STORES.map((store) => store.getState());
}

interface NoopCase {
  action: string;
  /** puts the viewer in the state the arguments then ask for */
  setup: () => void;
  args: ActionArguments;
  message: string;
}

const NOOP_CASES: NoopCase[] = [
  {
    action: 'renderer.set',
    setup: () => useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' }),
    args: { renderer: 'cesium' },
    message: 'The globe is already drawn with cesium. For the flat 2D map use view.set_tab.',
  },
  {
    action: 'view.set_tab',
    setup: () => useAppStore.setState({ activeTab: 'map' }),
    args: { tab: 'map' },
    message: 'The flat map is already showing.',
  },
  {
    action: 'view.set_tab',
    setup: () => useAppStore.setState({ activeTab: 'globe' }),
    args: { tab: 'globe' },
    message: 'The globe is already showing.',
  },
  {
    action: 'basemap.set',
    setup: () => useAppStore.setState({ basemap: 'satellite' }),
    args: { basemap: 'satellite' },
    message: 'The basemap is already satellite.',
  },
  {
    action: 'split_view.set',
    setup: () => useSplitViewStore.setState({ active: false }),
    args: { active: false },
    message: 'Split view is already off.',
  },
  {
    action: 'split_view.set',
    setup: () => useSplitViewStore.setState({ active: true, comparePanes: [pane()] }),
    args: { active: true },
    message: 'Split view is already on, twoAcross.',
  },
  {
    action: 'split_view.set',
    setup: () =>
      useSplitViewStore.setState({ active: true, comparePanes: [pane(), pane(), pane()] }),
    args: { active: true, layout: 'grid' },
    message: 'Split view is already on, grid.',
  },
  {
    action: 'layers.set_visible',
    setup: () => agentLayers({ ...ROADS, visible: true }),
    args: { layer: 'Roads', visible: true },
    message: 'Roads is already visible.',
  },
  {
    action: 'layers.set_visible',
    setup: () => agentLayers({ ...ROADS, visible: false }),
    args: { layer: 'Roads', visible: false },
    message: 'Roads is already hidden.',
  },
  {
    action: 'layers.set_opacity',
    setup: () => agentLayers({ ...ROADS, style: { opacity: 0.25 } }),
    args: { layer: 'Roads', opacity: 0.25 },
    message: 'Roads already draws at 0.25 opacity.',
  },
  {
    action: 'layers.move',
    setup: seed,
    args: { layer: 'Contours', position: 'bottom' },
    message: 'Contours is already at the bottom of the drawing order.',
  },
  {
    action: 'layers.move',
    setup: seed,
    args: { layer: 'Branch main', position: 'up' },
    message: 'Branch main is already at the top of the drawing order.',
  },
  {
    action: 'layers.set_color',
    setup: () => agentLayers({ ...ROADS, color: '#ff8800' }),
    args: { layer: 'Roads', color: '#ff8800' },
    message: 'Roads is already #ff8800.',
  },
  {
    action: 'layers.shade_by',
    setup: () =>
      agentLayers({ ...ROADS, symbology: { kind: 'categorized', field: 'risk', categories: [] } }),
    args: { layer: 'Roads', column: 'risk' },
    message: 'Roads is already shaded by risk.',
  },
  {
    action: 'history.show_at',
    setup: () => {
      useLiveStore.setState({ documentId: 'doc-1' });
      useAssetStateStore.setState({ historyAt: MOMENT, history: {} });
    },
    args: { at: MOMENT },
    message: `The map is already showing every asset as it stood at ${MOMENT}.`,
  },
  {
    action: 'history.show_live',
    setup: () => useAssetStateStore.setState({ historyAt: null, history: null }),
    args: {},
    message: 'The map is already following the live readings.',
  },
  {
    action: 'project.open',
    setup: () => useProjectsStore.setState({ items: [HARBOUR], activeProjectId: HARBOUR.id }),
    args: { project: HARBOUR.id },
    message: 'Harbour survey is already open.',
  },
  {
    action: 'live.join',
    setup: () => useLiveStore.setState({ documentId: 'doc-1' }),
    args: { document: 'doc-1' },
    message: 'This session is already in Coastline.',
  },
  {
    action: 'live.leave',
    setup: () => useLiveStore.setState({ documentId: null }),
    args: {},
    message: 'this session is not joined to a live document',
  },
  {
    action: 'live.set_asset_rule',
    setup: joinedWithRule,
    args: { layer: 'Sensors', kind: 'temperature', breakpoints: '0:#2ecc71, 25:#f1c40f' },
    message: 'Sensors is already coloured by temperature over those breakpoints.',
  },
  {
    action: 'scenario.stop',
    setup: () => useScenarioCompareStore.setState({ compared: null, coverage: null }),
    args: {},
    message: 'no comparison is running',
  },
];

/** What the action threw, or null when it ran. */
async function refusal(action: string, args: ActionArguments): Promise<unknown> {
  try {
    await runAction(action, args);
    return null;
  } catch (thrown) {
    return thrown;
  }
}

describe('an action asked for the state the viewer already has', () => {
  beforeEach(() => {
    seed();
    useAuthStore.setState({ token: 'jwt-token' });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(DOCUMENTS), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  });

  it.each(NOOP_CASES)('$action refuses: $message', async ({ action, setup, args, message }) => {
    setup();
    const before = storeStates();

    const thrown = await refusal(action, args);

    expect(thrown).toBeInstanceOf(ActionError);
    expect((thrown as ActionError).message).toBe(message);
    expect(storeStates()).toEqual(before);
  });
});
