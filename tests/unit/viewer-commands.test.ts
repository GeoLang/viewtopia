import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeViewerCommand } from '../../src/viewer/commands';
import { useAppStore } from '../../src/store/app';
import { useMeasureStore } from '../../src/store/measure';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { getSharedCamera } from '../../src/hooks/sharedCamera';

// registry is mocked so we can drive fly_to with no live Cesium viewer and a
// stub MapLibre map, mirroring the globe renderer the command must now support.
const reg = vi.hoisted(() => ({ map: null as { flyTo: (o: unknown) => void } | null }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: () => null,
  getActiveMapLibre: () => reg.map,
  getActiveDeck: () => null,
}));

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

  it('fly_to drives the active MapLibre map and shared camera when Cesium is not active', () => {
    const flyTo = vi.fn();
    reg.map = { flyTo };
    executeViewerCommand({
      action: 'fly_to',
      params: { lon: 7.42, lat: 43.74, height: 1000, duration: 2 },
    });
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [7.42, 43.74] }));
    const cam = getSharedCamera();
    expect(cam.longitude).toBeCloseTo(7.42);
    expect(cam.latitude).toBeCloseTo(43.74);
    reg.map = null;
  });

  it('unknown commands are ignored without throwing', () => {
    expect(() => executeViewerCommand({ action: 'does_not_exist' })).not.toThrow();
  });
});
