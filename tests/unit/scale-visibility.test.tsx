import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Event as CesiumEvent, type Viewer } from 'cesium';
import {
  useAgentLayerStore,
  drawnAtZoom,
  normalizeZoomRange,
  type AgentLayer,
} from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useAgentLayersCesium } from '../../src/hooks/useAgentLayersCesium';
import { SymbologyEditor } from '../../src/features/symbology/SymbologyEditor';
import { cameraHeight } from '../../src/hooks/cameraSync';
import { serializeProject, parseProject, applyProject } from '../../src/features/project/projectFile';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const parcels = (zoomRange?: { min: number; max: number }): AgentLayer => ({
  id: 'parcels',
  name: 'Parcels',
  color: '#ff0000',
  ...(zoomRange ? { zoomRange } : {}),
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { risk: 5 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[12, 45], [13, 45], [13, 46], [12, 46], [12, 45]]],
        },
      },
    ],
  },
});

function resetLayers() {
  useAgentLayerStore.setState({
    layers: [],
    rasterLayers: [],
    editingRasterId: null,
    markers: [],
    generation: 0,
  });
}

beforeEach(() => {
  cleanup();
  resetLayers();
});

describe('zoom range on a layer', () => {
  it('draws inside the range and not outside it', () => {
    const limited = parcels({ min: 8, max: 12 });
    expect(drawnAtZoom(limited, 7.9)).toBe(false);
    expect(drawnAtZoom(limited, 8)).toBe(true);
    expect(drawnAtZoom(limited, 11.99)).toBe(true);
    // max is exclusive, matching MapLibre's maxzoom
    expect(drawnAtZoom(limited, 12)).toBe(false);
    expect(drawnAtZoom(parcels(), 0)).toBe(true);
    expect(drawnAtZoom(parcels(), 24)).toBe(true);
  });

  it('keeps a range MapLibre would accept, and drops one that limits nothing', () => {
    expect(normalizeZoomRange({ min: 0, max: 24 })).toBeNull();
    expect(normalizeZoomRange({ min: 8.4, max: 12.6 })).toEqual({ min: 8, max: 13 });
    // a max at or under the min is not a range maplibre can take
    expect(normalizeZoomRange({ min: 10, max: 10 })).toEqual({ min: 10, max: 11 });
    expect(normalizeZoomRange({ min: -5, max: 99 })).toBeNull();
    expect(normalizeZoomRange({ min: 30, max: 40 })).toEqual({ min: 23, max: 24 });
    expect(normalizeZoomRange({ min: Number.NaN, max: 4 })).toBeNull();
  });

  it('normalizes what setZoomRange is given, and clears the whole span', () => {
    act(() => {
      useAgentLayerStore.getState().addLayer(parcels());
      useAgentLayerStore.getState().setZoomRange('parcels', { min: 8.2, max: 12 });
    });
    expect(useAgentLayerStore.getState().layers[0].zoomRange).toEqual({ min: 8, max: 12 });

    act(() => {
      useAgentLayerStore.getState().setZoomRange('parcels', { min: 0, max: 24 });
    });
    expect(useAgentLayerStore.getState().layers[0].zoomRange).toBeUndefined();
  });

  it('survives a project file save and load', () => {
    act(() => {
      useAgentLayerStore.getState().setLayers([parcels({ min: 8, max: 12 })]);
    });
    const saved = JSON.stringify(serializeProject('parcels study'));
    resetLayers();

    vi.useFakeTimers();
    try {
      applyProject(parseProject(saved));
      vi.advanceTimersByTime(4200);
    } finally {
      vi.useRealTimers();
    }

    expect(useAgentLayerStore.getState().layers[0].zoomRange).toEqual({ min: 8, max: 12 });
  });

  it('drops a saved range no renderer could draw', () => {
    act(() => {
      useAgentLayerStore.getState().setLayers([parcels({ min: 40, max: -3 })]);
    });
    expect(useAgentLayerStore.getState().layers[0].zoomRange).toEqual({ min: 23, max: 24 });
  });
});

/** The editor as the layer panel mounts it: fed the layer straight from the store. */
function LiveSymbologyEditor({ layerId }: { layerId: string }) {
  const layer = useAgentLayerStore((s) => s.layers.find((l) => l.id === layerId));
  return layer ? <SymbologyEditor layer={layer} /> : null;
}

describe('SymbologyEditor zoom range control', () => {
  const showEditor = (layerId: string) =>
    render(
      <MantineProvider>
        <LiveSymbologyEditor layerId={layerId} />
      </MantineProvider>,
    );

  it('starts at the whole span and writes what the user types to the store', () => {
    act(() => {
      useAgentLayerStore.getState().addLayer(parcels());
    });
    showEditor('parcels');

    const min = screen.getByTestId('agent-layer-min-zoom');
    const max = screen.getByTestId('agent-layer-max-zoom');
    expect(min).toHaveValue('0');
    expect(max).toHaveValue('24');

    fireEvent.change(min, { target: { value: '8' } });
    expect(useAgentLayerStore.getState().layers[0].zoomRange).toEqual({ min: 8, max: 24 });

    fireEvent.change(max, { target: { value: '12' } });
    expect(useAgentLayerStore.getState().layers[0].zoomRange).toEqual({ min: 8, max: 12 });
  });

  it('is offered even when no field is worth shading by', () => {
    const bare = parcels();
    act(() => {
      useAgentLayerStore.getState().addLayer({
        ...bare,
        geojson: {
          ...bare.geojson,
          features: bare.geojson.features.map((f) => ({ ...f, properties: {} })),
        },
      });
    });
    showEditor('parcels');

    expect(screen.getByTestId('agent-layer-no-shading')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layer-zoom-range')).toBeInTheDocument();
  });
});

/** Enough of a Cesium viewer for the data sources and camera the hook reads. */
function fakeViewer(zoom: number) {
  const sources: { name?: string; show?: boolean }[] = [];
  const camera = {
    positionCartographic: { height: cameraHeight(zoom) },
    changed: new CesiumEvent(),
    moveEnd: new CesiumEvent(),
  };
  return {
    isDestroyed: () => false,
    entities: { values: [], add: () => undefined, remove: () => undefined },
    imageryLayers: {
      addImageryProvider: () => ({}),
      contains: () => false,
      remove: () => undefined,
    },
    dataSources: {
      get length() {
        return sources.length;
      },
      get: (i: number) => sources[i],
      add: async (ds: { name?: string }) => {
        sources.push(ds);
      },
      remove: (ds: { name?: string }) => {
        sources.splice(sources.indexOf(ds), 1);
      },
    },
    flyTo: async () => true,
    camera,
    /** move the camera to a zoom and tell the hook, as Cesium's own events do */
    moveTo: (next: number) => {
      camera.positionCartographic.height = cameraHeight(next);
      camera.moveEnd.raiseEvent();
    },
    drawn: () => sources.filter((ds) => ds.show !== false).map((ds) => ds.name),
  };
}

describe('useAgentLayersCesium zoom range', () => {
  beforeEach(() => {
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
  });

  afterEach(() => {
    cleanup();
  });

  const mount = (viewer: ReturnType<typeof fakeViewer>) =>
    renderHook(() =>
      useAgentLayersCesium({ current: viewer as unknown as Viewer } as {
        current: Viewer | null;
      }),
    );

  it('shows the layer only while the camera is inside its zoom range', async () => {
    const viewer = fakeViewer(10);
    act(() => {
      useAgentLayerStore.getState().addLayer(parcels({ min: 8, max: 12 }));
    });
    mount(viewer);

    await waitFor(() => expect(viewer.drawn()).toEqual(['agent-layer-parcels']));

    act(() => {
      viewer.moveTo(4);
    });
    expect(viewer.drawn()).toEqual([]);

    act(() => {
      viewer.moveTo(9);
    });
    expect(viewer.drawn()).toEqual(['agent-layer-parcels']);
  });

  it('leaves a layer with no range on at every zoom', async () => {
    const viewer = fakeViewer(2);
    act(() => {
      useAgentLayerStore.getState().addLayer(parcels());
    });
    mount(viewer);

    await waitFor(() => expect(viewer.drawn()).toEqual(['agent-layer-parcels']));

    act(() => {
      viewer.moveTo(18);
    });
    expect(viewer.drawn()).toEqual(['agent-layer-parcels']);
  });
});
