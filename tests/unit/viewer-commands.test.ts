import { describe, it, expect, beforeEach } from 'vitest';
import { executeViewerCommand } from '../../src/viewer/commands';
import { useAppStore } from '../../src/store/app';
import { useMeasureStore } from '../../src/store/measure';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';

describe('agent viewer commands', () => {
  beforeEach(() => {
    useAppStore.setState({ activePanel: null, renderer: 'cesium', activeTab: 'globe' });
    useDeckLayersStore.setState({ groups: {} });
  });

  it('panel commands open the matching tool panel', () => {
    executeViewerCommand({ action: 'slope_map' });
    expect(useAppStore.getState().activePanel).toBe('terrainAnalysis');

    executeViewerCommand({ action: 'weather' });
    expect(useAppStore.getState().activePanel).toBe('weather');
  });

  it('measure commands set the mode and open the measure panel', () => {
    executeViewerCommand({ action: 'measure_area' });
    expect(useMeasureStore.getState().mode).toBe('area');
    expect(useAppStore.getState().activePanel).toBe('measure');
  });

  it('deck-layer commands register a layer and switch to the deck renderer', () => {
    executeViewerCommand({
      action: 'add_scatter',
      params: { data: [[7.42, 43.73]], radius: 40 },
    });
    const groups = useDeckLayersStore.getState().groups;
    expect(groups.agent?.length).toBe(1);
    expect(useAppStore.getState().renderer).toBe('deckgl');
    expect(useAppStore.getState().activeTab).toBe('globe');
  });

  it('style_by_* runs without a live viewer (no tilesets → no-op)', () => {
    expect(() => executeViewerCommand({ action: 'style_by_height' })).not.toThrow();
  });

  it('unknown commands are ignored without throwing', () => {
    expect(() => executeViewerCommand({ action: 'does_not_exist' })).not.toThrow();
  });
});
