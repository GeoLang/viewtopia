import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useOgcLayersMapLibre } from '../../src/hooks/useOgcLayersMapLibre';
import { useOgcLayersCesium } from '../../src/hooks/useOgcLayersCesium';
import { useOgcLayerStore, type OGCLayer } from '../../src/store/ogcLayers';
import { useAppStore } from '../../src/store/app';

interface FakeStyleLayer {
  id: string;
  layout?: { visibility?: string };
  paint?: Record<string, unknown>;
}

/** Enough of a maplibre style surface for the layers the hook adds. */
function fakeMap() {
  const layers: FakeStyleLayer[] = [];
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
    addLayer: (layer: FakeStyleLayer) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
    },
    layer: (id: string) => layers.find((l) => l.id === id),
  };
}

/** An imagery layer of the shape the Cesium hook writes alpha and show onto. */
interface FakeImagery {
  alpha: number;
  show: boolean;
}

function fakeViewer() {
  const added: FakeImagery[] = [];
  return {
    added,
    isDestroyed: () => false,
    imageryLayers: {
      addImageryProvider: () => {
        const imagery: FakeImagery = { alpha: 1, show: true };
        added.push(imagery);
        return imagery;
      },
      contains: () => true,
      remove: () => undefined,
    },
  };
}

const wms = (over: Partial<OGCLayer> = {}): OGCLayer => ({
  id: 'w1',
  name: 'roads',
  type: 'wms',
  url: 'https://maps.example/wms',
  ...over,
});

const archive = (over: Partial<OGCLayer> = {}): OGCLayer => ({
  id: 'p1',
  name: 'parcels',
  type: 'pmtiles',
  url: 'https://archives.example/parcels.pmtiles',
  pmtiles: { kind: 'vector', vectorLayers: ['parcels'], minZoom: 0, maxZoom: 12 },
  ...over,
});

const mountMapLibre = (map: ReturnType<typeof fakeMap>) => {
  const ref = { current: map } as unknown as Parameters<typeof useOgcLayersMapLibre>[0];
  return renderHook(() => useOgcLayersMapLibre(ref));
};

const mountCesium = (viewer: ReturnType<typeof fakeViewer>) => {
  const ref = { current: viewer } as unknown as Parameters<typeof useOgcLayersCesium>[0];
  return renderHook(() => useOgcLayersCesium(ref));
};

describe('an OGC layer switch and slider reach the renderers', () => {
  beforeEach(() => {
    cleanup();
    useOgcLayerStore.setState({ layers: [] });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  it('draws a service at full opacity when nobody chose', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    mountMapLibre(map);

    expect(map.layer('ogc-layer-w1-raster')).toMatchObject({
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 1 },
    });
  });

  it('fades and hides a service on MapLibre', () => {
    useOgcLayerStore.setState({ layers: [wms({ visible: false, opacity: 0.3 })] });
    const map = fakeMap();
    mountMapLibre(map);

    expect(map.layer('ogc-layer-w1-raster')).toMatchObject({
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.3 },
    });
  });

  it('fades and hides every layer of a vector archive', () => {
    useOgcLayerStore.setState({ layers: [archive({ visible: false, opacity: 0.5 })] });
    const map = fakeMap();
    mountMapLibre(map);

    for (const kind of ['fill', 'line', 'circle']) {
      expect(map.layer(`ogc-layer-p1-parcels-${kind}`)?.layout?.visibility).toBe('none');
    }
    expect(map.layer('ogc-layer-p1-parcels-line')?.paint).toMatchObject({ 'line-opacity': 0.5 });
    expect(map.layer('ogc-layer-p1-parcels-circle')?.paint).toMatchObject({
      'circle-opacity': 0.5,
    });
    expect(map.layer('ogc-layer-p1-parcels-fill')?.paint).toMatchObject({ 'fill-opacity': 0.15 });
  });

  it('fades and hides a service on Cesium', () => {
    useOgcLayerStore.setState({
      layers: [wms({ visible: false, opacity: 0.3 }), wms({ id: 'x1', type: 'xyz' })],
    });
    const viewer = fakeViewer();
    mountCesium(viewer);

    expect(viewer.added).toEqual([
      { alpha: 0.3, show: false },
      { alpha: 1, show: true },
    ]);
  });
});
