import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/actions/view';
import { runAction } from '../../src/actions/registry';
import { useAppStore } from '../../src/store/app';
import { GRID_PANE_COUNT, useSplitViewStore } from '../../src/store/splitView';

describe('view actions', () => {
  beforeEach(() => {
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe', basemap: 'dark' });
    useSplitViewStore.setState({ active: false });
  });

  it('renderer.set switches the globe renderer and leaves the tab alone', async () => {
    await expect(runAction('renderer.set', { renderer: 'cesium' })).resolves.toEqual({
      text: 'Drawing with cesium.',
    });
    expect(useAppStore.getState().renderer).toBe('cesium');
    expect(useAppStore.getState().activeTab).toBe('globe');
  });

  it('view.set_tab shows the flat map and the globe', async () => {
    await expect(runAction('view.set_tab', { tab: 'map' })).resolves.toEqual({
      text: 'Showing the flat map.',
    });
    expect(useAppStore.getState().activeTab).toBe('map');
    expect(useAppStore.getState().renderer).toBe('maplibre');

    await runAction('view.set_tab', { tab: 'globe' });
    expect(useAppStore.getState().activeTab).toBe('globe');
  });

  it('renderer.set refuses a renderer the viewer does not have', async () => {
    await expect(runAction('renderer.set', { renderer: 'leaflet' })).rejects.toThrow(
      'renderer must be one of cesium, maplibre',
    );
    expect(useAppStore.getState().renderer).toBe('maplibre');
  });

  it('basemap.set puts the named basemap under the layers', async () => {
    await expect(runAction('basemap.set', { basemap: 'satellite' })).resolves.toEqual({
      text: 'Basemap is satellite.',
    });
    expect(useAppStore.getState().basemap).toBe('satellite');
  });

  it('basemap.set refuses a basemap nobody has', async () => {
    await expect(runAction('basemap.set', { basemap: 'moon' })).rejects.toThrow(
      'basemap must be one of',
    );
    expect(useAppStore.getState().basemap).toBe('dark');
  });

  it('split_view.set opens the panes and lays them out', async () => {
    await expect(runAction('split_view.set', { active: true, layout: 'grid' })).resolves.toEqual({
      text: 'Split view is on, grid.',
    });
    const split = useSplitViewStore.getState();
    expect(split.active).toBe(true);
    expect(split.comparePanes).toHaveLength(GRID_PANE_COUNT - 1);
  });

  it('split_view.set closes the split again', async () => {
    await runAction('split_view.set', { active: true });
    await expect(runAction('split_view.set', { active: 'false' })).resolves.toEqual({
      text: 'Split view is off.',
    });
    expect(useSplitViewStore.getState().active).toBe(false);
  });

  it('split_view.set needs to be told which way', async () => {
    await expect(runAction('split_view.set', {})).rejects.toThrow('active is required');
  });
});
