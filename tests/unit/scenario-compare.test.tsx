import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import {
  ScenarioPanel,
  coverageDifference,
  formatArea,
  formatDifference,
} from '../../src/components/tools/ScenarioPanel';
import { useAgentLayersMapLibre } from '../../src/hooks/useAgentLayersMapLibre';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useSplitViewStore, COMPARE_PANE, VIEWER_PANE } from '../../src/store/splitView';

// MantineProvider reads the color scheme through matchMedia, which jsdom lacks
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Mantine's combobox measures and scrolls the dropdown, neither of which jsdom has
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const DATASET = { id: 'd1', name: 'twin-assets', project_id: null, visibility: 'private' };
const BASE_BRANCH = { id: 'b-main', name: 'main' };
const SCENARIO_BRANCH = { id: 'b-sensors', name: 'more sensors' };

const BASE_LAYER = `ptolemy-branch-${BASE_BRANCH.id}`;
const SCENARIO_LAYER = `ptolemy-branch-${SCENARIO_BRANCH.id}`;

/** point (1 2) as ptolemy hands geometry back on /features */
const POINT_WKB_HEX = '0101000000000000000000f03f0000000000000040';

function wkbBytes(hex: string): number[] {
  return (hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
}

function feature(id: string) {
  return { id, geometry_wkb: wkbBytes(POINT_WKB_HEX), properties: { name: id } };
}

const COVERAGE = {
  [BASE_BRANCH.id]: { feature_count: 3, distance_meters: 100, coverage_sq_meters: 31_000 },
  [SCENARIO_BRANCH.id]: { feature_count: 4, distance_meters: 100, coverage_sq_meters: 62_000 },
};

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Enough of ptolemy for one compare: datasets, branches, features, coverage. */
function fakePtolemy(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/api/v1/datasets')) return Promise.resolve(answer([DATASET]));
  if (url.endsWith(`/datasets/${DATASET.id}/branches`)) {
    return Promise.resolve(answer([BASE_BRANCH, SCENARIO_BRANCH]));
  }
  const features = /\/branches\/([^/]+)\/features\?/.exec(url);
  if (features) {
    return Promise.resolve(answer({ features: [feature(`${features[1]}-a`)] }));
  }
  const coverage = /\/branches\/([^/]+)\/analytics\/coverage\?distance=(\d+)/.exec(url);
  if (coverage) {
    expect(coverage[2]).toBe('100');
    return Promise.resolve(answer(COVERAGE[coverage[1]]));
  }
  throw new Error(`nothing fake answers ${url}`);
}

describe('coverage difference', () => {
  it('reads small areas in square metres and large ones in hectares', () => {
    expect(formatArea(940)).toBe('940 m²');
    expect(formatArea(31_000)).toBe('3.10 ha');
    // the threshold itself is already a hectare
    expect(formatArea(10_000)).toBe('1.00 ha');
  });

  it('takes the scenario minus the base, as an area and a share', () => {
    const difference = coverageDifference(
      { featureCount: 3, squareMeters: 31_000 },
      { featureCount: 4, squareMeters: 62_000 },
    );
    expect(difference).toEqual({ squareMeters: 31_000, percent: 100 });
    expect(formatDifference(difference)).toBe('+3.10 ha (+100.0%)');
  });

  it('signs a scenario that covers less than the base', () => {
    const difference = coverageDifference(
      { featureCount: 4, squareMeters: 40_000 },
      { featureCount: 2, squareMeters: 30_000 },
    );
    expect(formatDifference(difference)).toBe('-1.00 ha (-25.0%)');
  });

  it('gives no share when the base covers nothing', () => {
    const difference = coverageDifference(
      { featureCount: 0, squareMeters: 0 },
      { featureCount: 1, squareMeters: 900 },
    );
    expect(difference.percent).toBeNull();
    expect(formatDifference(difference)).toBe('+900 m²');
  });
});

describe('per-pane layer visibility', () => {
  beforeEach(() => {
    useSplitViewStore.setState({
      viewerHiddenLayerIds: [],
      comparePanes: [{ renderer: 'maplibre', basemap: 'dark' }],
    });
  });

  it('hides a layer in the viewer pane without touching the compare pane', () => {
    useSplitViewStore.getState().hideLayerInPane(VIEWER_PANE, SCENARIO_LAYER);

    expect(useSplitViewStore.getState().viewerHiddenLayerIds).toEqual([SCENARIO_LAYER]);
    expect(useSplitViewStore.getState().comparePanes[0].hiddenLayerIds).toBeUndefined();
  });

  it('hides a layer in a compare pane, addressed by its pane index', () => {
    useSplitViewStore.getState().hideLayerInPane(COMPARE_PANE, BASE_LAYER);

    expect(useSplitViewStore.getState().comparePanes[0].hiddenLayerIds).toEqual([BASE_LAYER]);
    expect(useSplitViewStore.getState().viewerHiddenLayerIds).toEqual([]);
  });

  it('hides a layer once and shows it again', () => {
    const split = useSplitViewStore.getState();
    split.hideLayerInPane(COMPARE_PANE, BASE_LAYER);
    split.hideLayerInPane(COMPARE_PANE, BASE_LAYER);
    expect(useSplitViewStore.getState().comparePanes[0].hiddenLayerIds).toEqual([BASE_LAYER]);

    split.showLayerInPane(COMPARE_PANE, BASE_LAYER);
    expect(useSplitViewStore.getState().comparePanes[0].hiddenLayerIds).toEqual([]);
  });
});

/** Enough of a maplibre style surface for the layers the agent hook adds. */
function fakeMap() {
  const layers: { id: string }[] = [];
  const sources: Record<string, unknown> = {};
  return {
    isStyleLoaded: () => true,
    on: () => undefined,
    off: () => undefined,
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: unknown) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    addLayer: (layer: { id: string }) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    fitBounds: () => undefined,
    sourceIds: () => Object.keys(sources),
  };
}

const branchLayer = (id: string): AgentLayer => ({
  id,
  name: id,
  color: '#4dabf7',
  geojson: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } }],
  },
});

describe('useAgentLayersMapLibre with a pane index', () => {
  beforeEach(() => {
    cleanup();
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useSplitViewStore.setState({
      viewerHiddenLayerIds: [SCENARIO_LAYER],
      comparePanes: [{ renderer: 'maplibre', basemap: 'dark', hiddenLayerIds: [BASE_LAYER] }],
    });
    act(() => {
      useAgentLayerStore.getState().addLayer(branchLayer(BASE_LAYER));
      useAgentLayerStore.getState().addLayer(branchLayer(SCENARIO_LAYER));
    });
  });

  const mount = (map: ReturnType<typeof fakeMap>, paneIndex: number) => {
    const ref = { current: map } as unknown as Parameters<typeof useAgentLayersMapLibre>[0];
    return renderHook(() => useAgentLayersMapLibre(ref, paneIndex));
  };

  it('draws every layer the pane does not hide', () => {
    const viewer = fakeMap();
    mount(viewer, VIEWER_PANE);
    expect(viewer.sourceIds()).toEqual([`agent-layer-${BASE_LAYER}`]);

    cleanup();
    const compare = fakeMap();
    mount(compare, COMPARE_PANE);
    expect(compare.sourceIds()).toEqual([`agent-layer-${SCENARIO_LAYER}`]);
  });

  it('takes a layer off the pane that starts hiding it', () => {
    const map = fakeMap();
    mount(map, COMPARE_PANE);

    act(() => {
      useSplitViewStore.getState().hideLayerInPane(COMPARE_PANE, SCENARIO_LAYER);
    });
    expect(map.sourceIds()).toEqual([]);
  });
});

describe('the scenario panel', () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal('fetch', vi.fn(fakePtolemy));
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
    useSplitViewStore.setState({
      active: false,
      viewerHiddenLayerIds: [],
      comparePanes: [{ renderer: 'maplibre', basemap: 'dark' }],
      swipeAt: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function panel() {
    return render(
      <MantineProvider>
        <ScenarioPanel onClose={() => {}} />
      </MantineProvider>,
    );
  }

  /** Mantine selects are comboboxes, and only the open one has its options in the dom. */
  async function pick(testId: string, option: string) {
    // the branch selects stay disabled until the dataset's branches arrive
    await waitFor(() => expect(screen.getByTestId(testId)).toBeEnabled());
    fireEvent.click(screen.getByTestId(testId));
    fireEvent.click(await screen.findByRole('option', { name: option }));
  }

  it('draws a branch per pane and shows the coverage of each', async () => {
    panel();

    await pick('scenario-dataset', DATASET.name);
    await pick('scenario-branch', SCENARIO_BRANCH.name);
    fireEvent.change(screen.getByTestId('scenario-distance'), { target: { value: '100' } });

    fireEvent.click(screen.getByTestId('scenario-compare'));

    await waitFor(() =>
      expect(screen.getByTestId('scenario-base-coverage')).toHaveTextContent(
        '3 features, 3.10 ha',
      ),
    );
    expect(screen.getByTestId('scenario-branch-coverage')).toHaveTextContent('4 features, 6.20 ha');
    expect(screen.getByTestId('scenario-difference')).toHaveTextContent('+3.10 ha (+100.0%)');

    const drawn = useAgentLayerStore.getState().layers.map((layer) => layer.id);
    expect(drawn).toEqual([BASE_LAYER, SCENARIO_LAYER]);
    const split = useSplitViewStore.getState();
    expect(split.active).toBe(true);
    expect(split.viewerHiddenLayerIds).toEqual([SCENARIO_LAYER]);
    expect(split.comparePanes[0].hiddenLayerIds).toEqual([BASE_LAYER]);

    fireEvent.click(screen.getByTestId('scenario-stop'));

    expect(useAgentLayerStore.getState().layers).toEqual([]);
    const stopped = useSplitViewStore.getState();
    expect(stopped.active).toBe(false);
    expect(stopped.viewerHiddenLayerIds).toEqual([]);
    expect(stopped.comparePanes[0].hiddenLayerIds ?? []).toEqual([]);
    expect(screen.queryByTestId('scenario-base-coverage')).toBeNull();
  });

  it('refuses to compare a branch with itself', async () => {
    panel();

    await pick('scenario-dataset', DATASET.name);
    await pick('scenario-branch', BASE_BRANCH.name);

    fireEvent.click(screen.getByTestId('scenario-compare'));

    await waitFor(() => expect(useAgentLayerStore.getState().layers).toEqual([]));
    expect(useSplitViewStore.getState().active).toBe(false);
  });
});
