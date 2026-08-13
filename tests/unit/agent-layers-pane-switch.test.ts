import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

/**
 * A pane that switches renderer after mount builds its map inside an effect,
 * and the agent layers have to arrive because the hook saw a new instance, not
 * because one effect happened to run after another.
 */

const maplibre = vi.hoisted(() => {
  class FakeMarker {
    remove = () => undefined;
    setLngLat = () => this;
    addTo = (map: FakeMap) => {
      map.markers.push(this);
      return this;
    };
  }

  class FakeMap {
    static created: FakeMap[] = [];
    styleLayers: { id: string }[] = [];
    sources: Record<string, unknown> = {};
    markers: FakeMarker[] = [];
    removed = false;

    constructor() {
      FakeMap.created.push(this);
    }

    addControl = () => this;
    on = () => this;
    off = () => this;
    once = () => this;
    resize = () => this;
    remove = () => {
      this.removed = true;
    };
    isStyleLoaded = () => true;
    getStyle = () => ({ layers: [...this.styleLayers], sources: { ...this.sources } });
    addSource = (id: string, spec: unknown) => {
      this.sources[id] = spec;
    };
    removeSource = (id: string) => {
      delete this.sources[id];
    };
    addLayer = (layer: { id: string }) => {
      this.styleLayers.push(layer);
    };
    removeLayer = (id: string) => {
      this.styleLayers = this.styleLayers.filter((l) => l.id !== id);
    };
    fitBounds = () => this;
    jumpTo = () => this;
    setStyle = () => this;
    setProjection = () => this;
    getCenter = () => ({ lng: 0, lat: 20 });
    getZoom = () => 2;
    getPitch = () => 0;
    getBearing = () => 0;
  }

  return { FakeMap, FakeMarker };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibre.FakeMap,
    Marker: maplibre.FakeMarker,
    NavigationControl: class {},
    addProtocol: () => undefined,
    removeProtocol: () => undefined,
  },
}));

const cesium = vi.hoisted(() => {
  interface FakeEntity {
    id: string;
  }

  class FakeViewer {
    static created: FakeViewer[] = [];
    destroyed = false;
    entityList: FakeEntity[] = [];
    dataSourceList: { name?: string; show?: boolean }[] = [];

    constructor() {
      FakeViewer.created.push(this);
    }

    entities = {
      values: this.entityList,
      add: (entity: FakeEntity) => {
        this.entityList.push(entity);
        return entity;
      },
      remove: (entity: FakeEntity) => {
        const at = this.entityList.indexOf(entity);
        if (at >= 0) this.entityList.splice(at, 1);
        return true;
      },
    };

    dataSources = {
      get length() {
        return 0;
      },
      get: (index: number) => this.dataSourceList[index],
      add: async (ds: { name?: string }) => {
        this.dataSourceList.push(ds);
        return ds;
      },
      remove: (ds: { name?: string }) => {
        const at = this.dataSourceList.indexOf(ds);
        if (at >= 0) this.dataSourceList.splice(at, 1);
        return true;
      },
    };

    imageryLayers = {
      addImageryProvider: () => ({ alpha: 1 }),
      removeAll: () => undefined,
      contains: () => false,
      remove: () => true,
    };

    camera = {
      changed: { addEventListener: () => undefined, removeEventListener: () => undefined },
      moveEnd: { addEventListener: () => undefined, removeEventListener: () => undefined },
      positionCartographic: { longitude: 0, latitude: 0, height: 1e7 },
      pitch: -Math.PI / 2,
      heading: 0,
      setView: () => undefined,
    };

    isDestroyed = () => this.destroyed;
    destroy = () => {
      this.destroyed = true;
    };
    resize = () => undefined;
    flyTo = () => Promise.resolve(true);
  }

  return { FakeViewer };
});

vi.mock('cesium', async (importOriginal) => {
  const actual = await importOriginal<typeof import('cesium')>();
  return { ...actual, Viewer: cesium.FakeViewer };
});

import { useMapLibre } from '../../src/hooks/useMapLibre';
import { useCesium } from '../../src/hooks/useCesium';
import { useAgentLayersMapLibre } from '../../src/hooks/useAgentLayersMapLibre';
import { useAgentLayersCesium } from '../../src/hooks/useAgentLayersCesium';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useSplitViewStore, COMPARE_PANE, type Pane } from '../../src/store/splitView';
import { DEFAULT_BASEMAP } from '../../src/hooks/basemapTiles';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

const MAPLIBRE_CONTAINER_ID = `maplibre-pane-${COMPARE_PANE}`;
const CESIUM_CONTAINER_ID = `cesium-pane-${COMPARE_PANE}`;

const pane = (renderer: Pane['renderer']): Pane => ({ renderer, basemap: DEFAULT_BASEMAP });

const flood = (): AgentLayer => ({
  id: 'flood',
  name: 'Flood',
  color: '#ff0000',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]],
        },
      },
    ],
  },
});

function makeContainer(id: string) {
  const div = document.createElement('div');
  div.id = id;
  document.body.appendChild(div);
  return div;
}

/** Same hook order as SplitPane, for one compare pane. */
function usePaneWithMapLibreAgentLayers(p: Pane) {
  const mapRef = useMapLibre({
    containerId: MAPLIBRE_CONTAINER_ID,
    pane: p,
    paneIndex: COMPARE_PANE,
  });
  useAgentLayersMapLibre(mapRef);
  return mapRef;
}

function usePaneWithCesiumAgentLayers(p: Pane) {
  const viewerRef = useCesium({
    containerId: CESIUM_CONTAINER_ID,
    pane: p,
    paneIndex: COMPARE_PANE,
  });
  useAgentLayersCesium(viewerRef);
  return viewerRef;
}

beforeEach(() => {
  cleanup();
  maplibre.FakeMap.created.length = 0;
  cesium.FakeViewer.created.length = 0;
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  useAppStore.setState({ activeTab: 'globe', renderer: 'cesium' });
  useSplitViewStore.setState({ active: true });
  setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  useSplitViewStore.setState({ active: false });
});

describe('useAgentLayersMapLibre on a split-view compare pane', () => {
  beforeEach(() => {
    makeContainer(MAPLIBRE_CONTAINER_ID);
  });

  it('draws the layers already on when the pane switches to maplibre', () => {
    act(() => {
      useAgentLayerStore.getState().addLayer(flood());
      useAgentLayerStore.getState().addMarker({ lon: 5, lat: 45, color: '#00ff00' });
    });

    const { result, rerender } = renderHook(usePaneWithMapLibreAgentLayers, {
      initialProps: pane('leaflet'),
    });
    expect(result.current.current).toBeNull();

    rerender(pane('maplibre'));
    const map = maplibre.FakeMap.created[0];
    expect(map).toBeTruthy();
    expect(Object.keys(map.sources)).toContain('agent-layer-flood');
    expect(map.markers).toHaveLength(1);
  });

  it('follows the store while the pane draws, and drops the map when it stops', () => {
    const { result, rerender } = renderHook(usePaneWithMapLibreAgentLayers, {
      initialProps: pane('maplibre'),
    });
    const map = maplibre.FakeMap.created[0];

    act(() => {
      useAgentLayerStore.getState().addLayer(flood());
    });
    expect(Object.keys(map.sources)).toContain('agent-layer-flood');

    act(() => {
      useAgentLayerStore.getState().setLayerVisible('flood', false);
    });
    expect(Object.keys(map.sources)).not.toContain('agent-layer-flood');

    rerender(pane('leaflet'));
    expect(result.current.current).toBeNull();
    expect(map.removed).toBe(true);
  });
});

describe('useAgentLayersCesium on a split-view compare pane', () => {
  beforeEach(() => {
    makeContainer(CESIUM_CONTAINER_ID);
  });

  it('draws the markers already on when the pane switches to cesium', () => {
    act(() => {
      useAgentLayerStore.getState().addMarker({ lon: 5, lat: 45, color: '#00ff00' });
    });

    const { result, rerender } = renderHook(usePaneWithCesiumAgentLayers, {
      initialProps: pane('maplibre'),
    });
    expect(result.current.current).toBeNull();

    rerender(pane('cesium'));
    const viewer = cesium.FakeViewer.created[0];
    expect(viewer).toBeTruthy();
    expect(viewer.entityList.map((e) => e.id)).toEqual([
      `agent-marker-${useAgentLayerStore.getState().markers[0].id}`,
    ]);
  });

  it('follows the store while the pane draws, and destroys the viewer when it stops', () => {
    const { result, rerender } = renderHook(usePaneWithCesiumAgentLayers, {
      initialProps: pane('cesium'),
    });
    const viewer = cesium.FakeViewer.created[0];

    act(() => {
      useAgentLayerStore.getState().addMarker({ lon: 5, lat: 45, color: '#00ff00' });
    });
    expect(viewer.entityList).toHaveLength(1);

    rerender(pane('leaflet'));
    expect(result.current.current).toBeNull();
    expect(viewer.destroyed).toBe(true);
  });
});
