import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useHeatmapsMapLibre } from '../../src/hooks/useHeatmapsMapLibre';
import {
  applyHeatmaps,
  clearHeatmap,
  heatmapFeatures,
  heatmapPaint,
  heatmapStyleId,
  showHeatmap,
  useHeatmapStore,
  type HeatmapSpec,
} from '../../src/lib/mapHeatmap';
import { useAppStore } from '../../src/store/app';

/** Enough of a maplibre style and event surface for the paths under test. */
function fakeMap() {
  const layers: { id: string; type: string; source: string; paint: Record<string, unknown> }[] = [];
  const sources: Record<string, unknown> = {};
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  let styleLoaded = true;
  return {
    isStyleLoaded: () => styleLoaded,
    setStyleLoaded: (v: boolean) => {
      styleLoaded = v;
    },
    on: (event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] = [...(listeners[event] ?? []), fn];
    },
    off: (event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
    },
    emit: (event: string) => {
      for (const fn of [...(listeners[event] ?? [])]) fn();
    },
    listenerCount: (event: string) => (listeners[event] ?? []).length,
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: unknown) => {
      sources[id] = spec;
    },
    removeSource: (id: string) => {
      delete sources[id];
    },
    addLayer: (layer: { id: string; type: string; source: string; paint: Record<string, unknown> }) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    /** What setStyle does to a basemap swap: the old style and everything on it goes. */
    dropStyle: () => {
      layers.length = 0;
      for (const id of Object.keys(sources)) delete sources[id];
    },
    layerIds: () => layers.map((l) => l.id),
    sourceIds: () => Object.keys(sources),
    layer: (id: string) => layers.find((l) => l.id === id),
  };
}

type FakeMap = ReturnType<typeof fakeMap>;
const apply = (map: FakeMap, specs: HeatmapSpec[]) =>
  applyHeatmaps(map as unknown as Parameters<typeof applyHeatmaps>[0], specs);

const spec = (id: string, over: Partial<HeatmapSpec> = {}): HeatmapSpec => ({
  id,
  points: [
    { position: [-0.1, 51.5], weight: 5 },
    { position: [-0.12, 51.51], weight: 2 },
  ],
  radius: 35,
  intensity: 1.4,
  ...over,
});

describe('native maplibre heatmaps', () => {
  beforeEach(() => {
    useHeatmapStore.setState({ heatmaps: [] });
    useAppStore.setState({ renderer: 'cesium', activeTab: 'map' });
  });

  it('maps radius, intensity and weight onto maplibre paint properties', () => {
    const paint = heatmapPaint(spec('p', { colorLow: '#001122', colorHigh: '#ffaa00' }));

    expect(paint['heatmap-radius']).toBe(35);
    expect(paint['heatmap-intensity']).toBe(1.4);
    // the per-point weight comes off the feature property the source carries
    expect(paint['heatmap-weight']).toEqual(['to-number', ['get', 'weight'], 1]);
    // the ramp must be transparent at density 0, or the layer tints the viewport
    expect(paint['heatmap-color']).toEqual([
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0,0,0,0)',
      0.1,
      '#001122',
      1,
      '#ffaa00',
    ]);
  });

  it('falls back to the default ramp colours', () => {
    const paint = heatmapPaint(spec('p'));
    expect(paint['heatmap-color']).toEqual(
      expect.arrayContaining(['#0000ff', '#ff0000']),
    );
  });

  it('turns points into weighted point features', () => {
    expect(heatmapFeatures([{ position: [7.42, 43.73], weight: 3 }])).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [7.42, 43.73] },
          properties: { weight: 3 },
        },
      ],
    });
  });

  it('adds one source and one heatmap layer per spec', () => {
    const map = fakeMap();
    apply(map, [spec('panel-heatmap'), spec('agent-heatmap-1')]);

    expect(map.layerIds()).toEqual([
      heatmapStyleId('panel-heatmap'),
      heatmapStyleId('agent-heatmap-1'),
    ]);
    expect(map.sourceIds()).toEqual(map.layerIds());
    expect(map.layer(heatmapStyleId('panel-heatmap'))).toMatchObject({
      type: 'heatmap',
      source: heatmapStyleId('panel-heatmap'),
    });
  });

  it('re-applying replaces our layers instead of stacking them', () => {
    const map = fakeMap();
    map.addSource('basemap', { type: 'raster' });
    map.addLayer({ id: 'basemap-raster', type: 'raster', source: 'basemap', paint: {} });

    apply(map, [spec('panel-heatmap')]);
    apply(map, [spec('panel-heatmap', { radius: 80 })]);

    expect(map.layerIds()).toEqual(['basemap-raster', heatmapStyleId('panel-heatmap')]);
    expect(map.layer(heatmapStyleId('panel-heatmap'))?.paint['heatmap-radius']).toBe(80);
  });

  it('an empty spec list leaves the style as it found it', () => {
    const map = fakeMap();
    map.addSource('basemap', { type: 'raster' });
    map.addLayer({ id: 'basemap-raster', type: 'raster', source: 'basemap', paint: {} });

    apply(map, [spec('panel-heatmap')]);
    apply(map, []);

    expect(map.layerIds()).toEqual(['basemap-raster']);
    expect(map.sourceIds()).toEqual(['basemap']);
  });

  it('showHeatmap registers the spec and shows the renderer that draws it', () => {
    showHeatmap(spec('panel-heatmap'));

    expect(useHeatmapStore.getState().heatmaps.map((h) => h.id)).toEqual(['panel-heatmap']);
    expect(useAppStore.getState().renderer).toBe('maplibre');
    expect(useAppStore.getState().activeTab).toBe('globe');

    // re-adding the same owner replaces its spec
    showHeatmap(spec('panel-heatmap', { radius: 12 }));
    expect(useHeatmapStore.getState().heatmaps).toHaveLength(1);
    expect(useHeatmapStore.getState().heatmaps[0].radius).toBe(12);
  });

  it('clearHeatmap drops only that owner, so the next apply takes it off the map', () => {
    showHeatmap(spec('panel-heatmap'));
    showHeatmap(spec('agent-heatmap-1'));

    clearHeatmap('panel-heatmap');
    expect(useHeatmapStore.getState().heatmaps.map((h) => h.id)).toEqual(['agent-heatmap-1']);

    const map = fakeMap();
    apply(map, useHeatmapStore.getState().heatmaps);
    expect(map.layerIds()).toEqual([heatmapStyleId('agent-heatmap-1')]);
  });
});

describe('useHeatmapsMapLibre', () => {
  beforeEach(() => {
    cleanup();
    useHeatmapStore.setState({ heatmaps: [] });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  const mount = (map: FakeMap) => {
    const ref = { current: map } as unknown as Parameters<typeof useHeatmapsMapLibre>[0];
    return renderHook(() => useHeatmapsMapLibre(ref));
  };

  it('draws the stored heatmaps and re-adds them after a basemap swap', () => {
    const map = fakeMap();
    showHeatmap(spec('panel-heatmap'));
    const view = mount(map);

    expect(map.layerIds()).toEqual([heatmapStyleId('panel-heatmap')]);

    // setStyle drops our layer with the old style; only `idle` sees a settled one
    map.dropStyle();
    map.setStyleLoaded(false);
    map.emit('styledata');
    expect(map.layerIds()).toEqual([]);

    map.setStyleLoaded(true);
    map.emit('idle');
    expect(map.layerIds()).toEqual([heatmapStyleId('panel-heatmap')]);

    // and the settled style is not rebuilt on every later idle
    const paint = map.layer(heatmapStyleId('panel-heatmap'));
    map.emit('idle');
    expect(map.layer(heatmapStyleId('panel-heatmap'))).toBe(paint);

    view.unmount();
    expect(map.listenerCount('idle')).toBe(0);
    expect(map.listenerCount('styledata')).toBe(0);
  });

  it('applies a heatmap added after mount, and takes it off when it is cleared', () => {
    const map = fakeMap();
    mount(map);
    expect(map.layerIds()).toEqual([]);

    act(() => showHeatmap(spec('panel-heatmap')));
    expect(map.layerIds()).toEqual([heatmapStyleId('panel-heatmap')]);

    act(() => clearHeatmap('panel-heatmap'));
    expect(map.layerIds()).toEqual([]);
    expect(map.sourceIds()).toEqual([]);
  });

  it('waits for load when the style is not up yet', () => {
    const map = fakeMap();
    map.setStyleLoaded(false);
    showHeatmap(spec('panel-heatmap'));
    mount(map);

    expect(map.layerIds()).toEqual([]);
    map.setStyleLoaded(true);
    map.emit('load');
    expect(map.layerIds()).toEqual([heatmapStyleId('panel-heatmap')]);
  });
});
