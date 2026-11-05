import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEffect, type MutableRefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useToolClicksMapLibre } from '../../src/hooks/useToolClicksMapLibre';
import { useAppStore } from '../../src/store/app';
import { measureToolClicks, useMeasureStore } from '../../src/store/measure';

function fakeMap() {
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    listeners,
    canvas: { style: { cursor: '' } },
    getCanvas() {
      return this.canvas;
    },
    on: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    off: (type: string) => listeners.delete(type),
  };
}

function asMap(map: ReturnType<typeof fakeMap>) {
  return map as unknown as MapLibreMap;
}

describe('useToolClicksMapLibre', () => {
  beforeEach(() => {
    useMeasureStore.setState({ mode: null, pending: [], results: [] });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  afterEach(() => {
    useMeasureStore.setState({ mode: null, pending: [], results: [] });
  });

  it('sends clicks to the tool while its mode is set and stops when it clears', () => {
    const map = fakeMap();
    const mapRef: MutableRefObject<MapLibreMap | null> = { current: asMap(map) };
    renderHook(() => useToolClicksMapLibre(mapRef, useMeasureStore, measureToolClicks));
    expect(map.listeners.size).toBe(0);

    act(() => useMeasureStore.getState().setMode('distance'));
    expect(map.canvas.style.cursor).toBe('crosshair');
    map.listeners.get('click')?.({ lngLat: { lng: 7, lat: 43 } });
    expect(useMeasureStore.getState().pending).toEqual([[7, 43]]);

    act(() => useMeasureStore.getState().setMode(null));
    expect(map.listeners.size).toBe(0);
    expect(map.canvas.style.cursor).toBe('');
  });

  it('moves the listeners to the rebuilt map across a renderer switch', () => {
    const firstMap = fakeMap();
    const secondMap = fakeMap();
    const unbuiltMaps = [firstMap, secondMap];
    const mapRef: MutableRefObject<MapLibreMap | null> = { current: null };
    useMeasureStore.getState().setMode('distance');

    renderHook(() => {
      const renderer = useAppStore((s) => s.renderer);
      // useMapLibre swaps mapRef in an effect body that runs ahead of the tool hooks
      useEffect(() => {
        const next = renderer === 'maplibre' ? unbuiltMaps.shift() : undefined;
        mapRef.current = next ? asMap(next) : null;
      }, [renderer]);
      useToolClicksMapLibre(mapRef, useMeasureStore, measureToolClicks);
    });
    expect(firstMap.listeners.has('click')).toBe(true);

    act(() => useAppStore.setState({ renderer: 'cesium' }));
    expect(firstMap.listeners.size).toBe(0);

    act(() => useAppStore.setState({ renderer: 'maplibre' }));
    expect(firstMap.listeners.size).toBe(0);
    expect(secondMap.listeners.has('click')).toBe(true);

    const preventDefault = vi.fn();
    secondMap.listeners.get('dblclick')?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });
});
