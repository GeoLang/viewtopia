import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, renderHook } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LayerManager } from '../../src/components/layers/LayerManager';
import { useOgcLayersMapLibre, tileErrorMessage } from '../../src/hooks/useOgcLayersMapLibre';
import { useLayerLoadErrorStore } from '../../src/store/layerLoadErrors';
import { useOgcLayerStore, type OGCLayer } from '../../src/store/ogcLayers';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';

/**
 * A tile request that fails reaches the map's error event and nothing else, so
 * the hook is what has to turn it into something a layer row can show.
 */

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

type Listener = (event: unknown) => void;

/** Enough of a maplibre map to record its listeners and feed them events. */
function fakeMap() {
  const listeners: Record<string, Listener[]> = {};
  const sources: Record<string, unknown> = {};
  const layers: { id: string }[] = [];
  const sourceCalls: string[] = [];
  return {
    sources,
    sourceCalls,
    listenerCount: (type: string) => listeners[type]?.length ?? 0,
    emit: (type: string, event: unknown) => {
      for (const listener of [...(listeners[type] ?? [])]) listener(event);
    },
    isStyleLoaded: () => true,
    on: (type: string, listener: Listener) => {
      listeners[type] = [...(listeners[type] ?? []), listener];
    },
    off: (type: string, listener: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    getStyle: () => ({ layers: [...layers], sources: { ...sources } }),
    addSource: (id: string, spec: unknown) => {
      sources[id] = spec;
      sourceCalls.push(`add ${id}`);
    },
    removeSource: (id: string) => {
      delete sources[id];
      sourceCalls.push(`remove ${id}`);
    },
    addLayer: (layer: { id: string }) => {
      layers.push(layer);
    },
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1,
      );
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

const mount = (map: ReturnType<typeof fakeMap>) => {
  const ref = { current: map } as unknown as Parameters<typeof useOgcLayersMapLibre>[0];
  return renderHook(() => useOgcLayersMapLibre(ref));
};

const errors = () => useLayerLoadErrorStore.getState().errors;

beforeEach(() => {
  cleanup();
  useLayerLoadErrorStore.setState({ errors: {}, reloadRequests: 0 });
  useOgcLayerStore.setState({ layers: [] });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  useAppStore.setState({ layers: [], renderer: 'maplibre', activeTab: 'globe' });
});

afterEach(cleanup);

describe('the layer load error store', () => {
  it('holds a reason per layer and drops it when the layer loads', () => {
    const { setError, clearError } = useLayerLoadErrorStore.getState();
    setError('w1', 'tiles unavailable (503)');
    setError('p1', 'tile request failed');
    expect(errors()).toEqual({ w1: 'tiles unavailable (503)', p1: 'tile request failed' });

    clearError('w1');
    expect(errors()).toEqual({ p1: 'tile request failed' });
  });

  it('clears the reason and asks the map for the tiles again on retry', () => {
    useLayerLoadErrorStore.getState().setError('w1', 'tiles unavailable (503)');
    useLayerLoadErrorStore.getState().retry('w1');

    expect(errors()).toEqual({});
    expect(useLayerLoadErrorStore.getState().reloadRequests).toBe(1);
  });
});

describe('the message a failed tile request gets', () => {
  it('names the status an AJAXError carries', () => {
    const ajax = Object.assign(new Error('Not Found: https://maps.example/wms'), {
      status: 503,
      url: 'https://maps.example/wms',
    });
    expect(tileErrorMessage(ajax)).toBe('tiles unavailable (503)');
  });

  it('falls back to the error text, then to a plain sentence', () => {
    expect(tileErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(tileErrorMessage(undefined)).toBe('tile request failed');
  });
});

describe('the MapLibre listeners the OGC layers hook registers', () => {
  it('records why an OGC source failed, under the layer id the panel uses', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    mount(map);

    act(() => {
      map.emit('error', {
        sourceId: 'ogc-layer-w1',
        error: Object.assign(new Error('AJAXError'), { status: 503 }),
      });
    });

    expect(errors()).toEqual({ w1: 'tiles unavailable (503)' });
  });

  it('ignores an error on a source that is not an OGC layer', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    mount(map);

    act(() => {
      map.emit('error', { sourceId: 'basemap', error: new Error('boom') });
    });
    act(() => {
      map.emit('error', { error: new Error('no source at all') });
    });

    expect(errors()).toEqual({});
  });

  it('clears the reason once a tile of that source comes back', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    mount(map);
    act(() => {
      map.emit('error', {
        sourceId: 'ogc-layer-w1',
        error: Object.assign(new Error('AJAXError'), { status: 503 }),
      });
    });

    // the source declaring itself loaded says nothing about its tiles: only an
    // event carrying a tile proves one was fetched
    act(() => {
      map.emit('sourcedata', {
        sourceId: 'ogc-layer-w1',
        dataType: 'source',
        sourceDataType: 'metadata',
        isSourceLoaded: true,
      });
    });
    expect(errors()).toEqual({ w1: 'tiles unavailable (503)' });

    act(() => {
      map.emit('sourcedata', {
        sourceId: 'ogc-layer-w1',
        dataType: 'source',
        isSourceLoaded: true,
        tile: { state: 'loaded' },
      });
    });
    expect(errors()).toEqual({});
  });

  it('leaves no listener behind when the map goes', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    const { unmount } = mount(map);
    expect(map.listenerCount('error')).toBe(1);
    expect(map.listenerCount('sourcedata')).toBe(1);

    unmount();

    expect(map.listenerCount('error')).toBe(0);
    expect(map.listenerCount('sourcedata')).toBe(0);
  });

  it('re-requests the tiles on retry without the map moving', () => {
    useOgcLayerStore.setState({ layers: [wms()] });
    const map = fakeMap();
    mount(map);
    map.sourceCalls.length = 0;

    act(() => {
      useLayerLoadErrorStore.getState().retry('w1');
    });

    expect(map.sourceCalls).toEqual(['remove ogc-layer-w1', 'add ogc-layer-w1']);
    expect(map.sources['ogc-layer-w1']).toBeDefined();
  });
});

describe('the Layers panel row of a layer that cannot load', () => {
  const renderPanel = () =>
    render(
      <MantineProvider>
        <LayerManager
          layers={[{ id: 'w1', name: 'roads', type: 'raster', visible: true, opacity: 1 }]}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
          onClose={vi.fn()}
        />
      </MantineProvider>,
    );

  it('says the layer is unavailable and why', () => {
    useLayerLoadErrorStore.setState({ errors: { w1: 'tiles unavailable (503)' } });
    renderPanel();

    const badge = screen.getByTestId('layer-load-error');
    expect(badge).toHaveTextContent('unavailable');
    expect(badge).toHaveAttribute('title', 'tiles unavailable (503)');
  });

  it('shows nothing while the layer is drawing', () => {
    renderPanel();
    expect(screen.queryByTestId('layer-load-error')).toBeNull();
  });

  it('asks for the tiles again when Retry is pressed', () => {
    useLayerLoadErrorStore.setState({ errors: { w1: 'tiles unavailable (503)' } });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Retry roads' }));

    expect(errors()).toEqual({});
    expect(useLayerLoadErrorStore.getState().reloadRequests).toBe(1);
    expect(screen.queryByTestId('layer-load-error')).toBeNull();
  });
});
