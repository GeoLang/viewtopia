import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/actions/panel';
import { runAction } from '../../src/actions/registry';
import { useAppStore } from '../../src/store/app';

describe('panel actions', () => {
  beforeEach(() => {
    useAppStore.setState({ activePanel: null });
  });

  it('panel.open shows a toolbar panel by id', async () => {
    await expect(runAction('panel.open', { panel: 'dataSources' })).resolves.toEqual({
      text: 'Opened the Data Sources panel.',
    });
    expect(useAppStore.getState().activePanel).toBe('dataSources');
  });

  it('panel.open reaches the panels the toolbar buttons open, not only the menus', async () => {
    await expect(runAction('panel.open', { panel: 'layers' })).resolves.toEqual({
      text: 'Opened the Layers panel.',
    });
    expect(useAppStore.getState().activePanel).toBe('layers');
  });

  it('panel.open refuses an unknown id and names the real ones', async () => {
    await expect(runAction('panel.open', { panel: 'data' })).rejects.toThrow('dataSources');
    expect(useAppStore.getState().activePanel).toBeNull();
  });

  it('panel.open refuses to reopen the open panel', async () => {
    useAppStore.setState({ activePanel: 'dataSources' });
    await expect(runAction('panel.open', { panel: 'dataSources' })).rejects.toThrow(
      'already open',
    );
  });

  it('panel.close closes the open panel and refuses when none is', async () => {
    useAppStore.setState({ activePanel: 'dataSources' });
    await expect(runAction('panel.close', {})).resolves.toEqual({
      text: 'Closed the Data Sources panel.',
    });
    expect(useAppStore.getState().activePanel).toBeNull();
    await expect(runAction('panel.close', {})).rejects.toThrow('No panel is open.');
  });
});
