import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/scenario';
import { ActionError, runAction } from '../../src/actions/registry';
import { useScenarioCompareStore } from '../../src/features/scenario/compare';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useSplitViewStore } from '../../src/store/splitView';
import { MAIN_BRANCH, SCENARIO_BRANCH, fakePtolemy } from './stubs/fakePtolemy';

const BASE_LAYER = `ptolemy-branch-${MAIN_BRANCH.id}`;
const SCENARIO_LAYER = `ptolemy-branch-${SCENARIO_BRANCH.id}`;

const COMPARE = {
  dataset: 'twin-assets',
  base_branch: 'main',
  scenario_branch: 'more sensors',
  distance: 100,
};

describe('scenario actions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakePtolemy));
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
    useSplitViewStore.setState({
      active: false,
      viewerHiddenLayerIds: [],
      comparePanes: [{ renderer: 'maplibre', basemap: 'dark' }],
      swipeAt: null,
    });
    useScenarioCompareStore.setState({ compared: null, coverage: null });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('draws a branch per pane and reports the difference', async () => {
    const result = await runAction('scenario.compare', COMPARE);

    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual([
      BASE_LAYER,
      SCENARIO_LAYER,
    ]);
    const split = useSplitViewStore.getState();
    expect(split.active).toBe(true);
    expect(split.viewerHiddenLayerIds).toEqual([SCENARIO_LAYER]);
    expect(split.comparePanes[0].hiddenLayerIds).toEqual([BASE_LAYER]);
    expect(result.text).toContain('main covers 3.10 ha over 3 features');
    expect(result.text).toContain('a difference of +3.10 ha (+100.0%)');
  });

  it('holds what is being compared, so a snapshot can read it', async () => {
    await runAction('scenario.compare', { ...COMPARE, base_at: '2026-08-01T09:00:00Z' });

    expect(useScenarioCompareStore.getState().compared).toEqual({
      datasetId: 'd-1',
      baseBranchId: MAIN_BRANCH.id,
      scenarioBranchId: SCENARIO_BRANCH.id,
      baseAt: '2026-08-01T09:00:00.000Z',
      scenarioAt: null,
      distanceMeters: 100,
    });
    expect(useScenarioCompareStore.getState().coverage?.scenario.featureCount).toBe(4);
  });

  it('stops the comparison and gives the split view back', async () => {
    await runAction('scenario.compare', COMPARE);
    const result = await runAction('scenario.stop', {});

    expect(useAgentLayerStore.getState().layers).toEqual([]);
    expect(useSplitViewStore.getState().active).toBe(false);
    expect(useSplitViewStore.getState().viewerHiddenLayerIds).toEqual([]);
    expect(useScenarioCompareStore.getState().compared).toBeNull();
    expect(result.text).toBe('The comparison is off the map.');
  });

  it('says when there is no comparison to stop', async () => {
    await expect(runAction('scenario.stop', {})).rejects.toThrow('no comparison is running');
  });

  it('refuses to compare a branch with itself', async () => {
    await expect(
      runAction('scenario.compare', { ...COMPARE, scenario_branch: 'main' }),
    ).rejects.toThrow(ActionError);
    expect(useAgentLayerStore.getState().layers).toEqual([]);
  });

  it('refuses a coverage distance ptolemy would refuse', async () => {
    await expect(runAction('scenario.compare', { ...COMPARE, distance: 0 })).rejects.toThrow(
      'a coverage distance is between',
    );
  });

  it('refuses a branch name matching neither branch', async () => {
    await expect(
      runAction('scenario.compare', { ...COMPARE, scenario_branch: 'draft' }),
    ).rejects.toThrow('no branch matches "draft"');
  });

  it('refuses a dataset name matching both datasets', async () => {
    await expect(runAction('scenario.compare', { ...COMPARE, dataset: 'twin' })).rejects.toThrow(
      'matches 2 datasets',
    );
  });
});
