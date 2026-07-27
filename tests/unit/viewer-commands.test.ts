import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeViewerCommand, SCREENGRID_NOTICE } from '../../src/viewer/commands';
import { useAppStore } from '../../src/store/app';
import { useMeasureStore } from '../../src/store/measure';
import { useDeckLayersStore } from '../../src/hooks/deckLayers';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useChatStore } from '../../src/store/chat';
import { useHeatmapStore } from '../../src/lib/mapHeatmap';
import { getSharedCamera } from '../../src/hooks/sharedCamera';

// registry is mocked so we can drive fly_to with no live Cesium viewer and a
// stub MapLibre map, mirroring the globe renderer the command must now support.
const reg = vi.hoisted(() => ({ map: null as { flyTo: (o: unknown) => void } | null }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: () => null,
  getActiveMapLibre: () => reg.map,
}));

describe('agent viewer commands', () => {
  beforeEach(() => {
    useAppStore.setState({ activePanel: null, renderer: 'cesium', activeTab: 'globe' });
    useDeckLayersStore.setState({ groups: {} });
    useHeatmapStore.setState({ heatmaps: [] });
    useChatStore.setState({ sessions: [], activeSessionId: null });
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

  it('deck-layer commands register a layer and switch to the renderer that draws it', () => {
    executeViewerCommand({
      action: 'add_scatter',
      params: { data: [[7.42, 43.73]], radius: 40 },
    });
    const groups = useDeckLayersStore.getState().groups;
    expect(groups.agent?.length).toBe(1);
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(useAppStore.getState().activeTab).toBe('globe');
  });

  it('add_heatmap registers a native maplibre heatmap, not a deck layer', () => {
    executeViewerCommand({
      action: 'add_heatmap',
      params: {
        data: [
          { lon: 7.42, lat: 43.73, weight: 4 },
          [7.43, 43.74],
        ],
        radius: 45,
        intensity: 2,
      },
    });

    const heatmaps = useHeatmapStore.getState().heatmaps;
    expect(heatmaps).toHaveLength(1);
    expect(heatmaps[0]).toMatchObject({ radius: 45, intensity: 2 });
    expect(heatmaps[0].points).toEqual([
      { position: [7.42, 43.73], weight: 4 },
      // a bare [lng,lat] pair carries no weight, so it counts as one
      { position: [7.43, 43.74], weight: 1 },
    ]);
    // deck no longer draws heatmaps at all
    expect(useDeckLayersStore.getState().groups.agent ?? []).toHaveLength(0);
    expect(useAppStore.getState().renderer).toBe('maplibre');
  });

  it('add_screengrid reports that the globe renderer cannot draw it', () => {
    executeViewerCommand({ action: 'add_screengrid', params: { data: [[7.42, 43.73]] } });

    const messages = useChatStore.getState().activeMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'system', content: SCREENGRID_NOTICE });
    // the deck layer is still registered, so it draws the day the view allows it
    const ids = (useDeckLayersStore.getState().groups.agent ?? []).map((l) => l.id);
    expect(ids.some((id) => id.startsWith('agent-screengrid-'))).toBe(true);
  });

  it('add_marker stores the marker so every renderer can draw it; clear_entities empties it', () => {
    useAgentLayerStore.setState({ markers: [] });
    executeViewerCommand({
      action: 'add_marker',
      params: { lon: 7.42, lat: 43.74, label: 'Monaco', color: '#00ff00' },
    });
    const markers = useAgentLayerStore.getState().markers;
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ lon: 7.42, lat: 43.74, label: 'Monaco', color: '#00ff00' });

    executeViewerCommand({ action: 'clear_entities' });
    expect(useAgentLayerStore.getState().markers).toHaveLength(0);
  });

  it('add_geojson normalizes a bare geometry into an agent layer every renderer draws', async () => {
    useAgentLayerStore.setState({ layers: [], generation: 0 });
    executeViewerCommand({
      action: 'add_geojson',
      params: { geojson: { type: 'Point', coordinates: [7.42, 43.73] }, color: '#123456' },
    });
    await vi.waitFor(() => expect(useAgentLayerStore.getState().layers).toHaveLength(1));
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.color).toBe('#123456');
    expect(layer.geojson.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [7.42, 43.73],
    });
    expect(useAgentLayerStore.getState().generation).toBe(1);
  });

  it('switch_renderer lands a retired deckgl request on maplibre and ignores junk', () => {
    executeViewerCommand({ action: 'switch_renderer', params: { renderer: 'deckgl' } });
    expect(useAppStore.getState().renderer).toBe('maplibre');

    executeViewerCommand({ action: 'switch_renderer', params: { renderer: 'nonsense' } });
    expect(useAppStore.getState().renderer).toBe('maplibre');
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
