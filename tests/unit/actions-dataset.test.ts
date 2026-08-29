import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/dataset';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { MAIN_BRANCH, SCENARIO_BRANCH, asked, fakePtolemy } from './stubs/fakePtolemy';

describe('dataset actions', () => {
  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal('fetch', vi.fn(fakePtolemy));
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists every dataset with its branch names', async () => {
    const result = await runAction('dataset.list', {});
    expect(result.text).toContain('twin-assets: main, more sensors');
    expect(result.text).not.toContain('d-1');
    expect(result.text).toContain('twin-roads');
  });

  it('draws the main branch when no branch is named', async () => {
    const result = await runAction('dataset.draw_branch', { dataset: 'twin-assets' });

    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual([
      `ptolemy-branch-${MAIN_BRANCH.id}`,
    ]);
    expect(result.text).toBe('Drew 2 features from main of twin-assets.');
  });

  it('draws a named branch at a past moment', async () => {
    await runAction('dataset.draw_branch', {
      dataset: 'd-1',
      branch: 'sensors',
      at: '2026-08-01T09:00:00Z',
    });

    expect(useAgentLayerStore.getState().layers[0].id).toBe(`ptolemy-branch-${SCENARIO_BRANCH.id}`);
    expect(asked.at(-1)).toContain(
      `/branches/${SCENARIO_BRANCH.id}/features/at?at=${encodeURIComponent('2026-08-01T09:00:00.000Z')}`,
    );
  });

  it('refuses a dataset name that matches both datasets', async () => {
    await expect(runAction('dataset.draw_branch', { dataset: 'twin' })).rejects.toThrow(ActionError);
    expect(useAgentLayerStore.getState().layers).toEqual([]);
  });

  it('names the branches when none matches', async () => {
    await expect(
      runAction('dataset.draw_branch', { dataset: 'twin-assets', branch: 'draft' }),
    ).rejects.toThrow('Known branches: main, more sensors');
  });

  it('refuses a moment that is not a date', async () => {
    await expect(
      runAction('dataset.draw_branch', { dataset: 'twin-assets', at: 'yesterday' }),
    ).rejects.toThrow('at is not a date');
  });
});
