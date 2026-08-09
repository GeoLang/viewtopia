import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEmbedMessaging } from '../../src/lib/embedMessaging';
import { useAppStore, type LayerItem } from '../../src/store/app';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { setActiveMapLibre } from '../../src/viewer/registry';
import type { Map as MapLibreMap } from 'maplibre-gl';

const hostPostMessage = vi.fn();
const fakeParent = { postMessage: hostPostMessage } as unknown as Window;

const fromHost = (data: Record<string, unknown>) =>
  window.dispatchEvent(new MessageEvent('message', { data, source: fakeParent }));

const hostReceived = (type: string) =>
  hostPostMessage.mock.calls.map(([message]) => message).filter((m) => m.type === type);

const testLayer = (id: string, visible: boolean): LayerItem => ({
  id,
  name: id,
  type: 'geojson',
  visible,
  opacity: 1,
});

describe('embed postMessage API', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    useSpaceTimeStore.setState({ flyToTarget: null });
    useAppStore.setState({ layers: [] });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    setActiveMapLibre(null);
    hostPostMessage.mockClear();
  });

  it('announces itself to the host once mounted', () => {
    renderHook(() => useEmbedMessaging(true));
    expect(hostReceived('viewtopia:ready')).toHaveLength(1);
  });

  it('stays silent outside an iframe or outside embed mode', () => {
    renderHook(() => useEmbedMessaging(false));
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    renderHook(() => useEmbedMessaging(true));
    expect(hostPostMessage).not.toHaveBeenCalled();
  });

  it('flies the shared pipeline on flyTo', () => {
    renderHook(() => useEmbedMessaging(true));
    fromHost({ type: 'viewtopia:flyTo', lng: 7.42, lat: 43.73, zoom: 11 });
    expect(useSpaceTimeStore.getState().flyToTarget).toEqual({ lng: 7.42, lat: 43.73, zoom: 11 });
  });

  it('ignores a flyTo without numeric coordinates', () => {
    renderHook(() => useEmbedMessaging(true));
    fromHost({ type: 'viewtopia:flyTo', lng: 'x', lat: 43.73 });
    expect(useSpaceTimeStore.getState().flyToTarget).toBeNull();
  });

  it('answers getCamera with the shared camera and the requestId', () => {
    renderHook(() => useEmbedMessaging(true));
    setSharedCamera({ longitude: 7.42, latitude: 43.73, zoom: 11, bearing: 0, pitch: 0 });
    fromHost({ type: 'viewtopia:getCamera', requestId: 'r1' });
    const [reply] = hostReceived('viewtopia:camera');
    expect(reply.requestId).toBe('r1');
    expect(reply.camera.longitude).toBe(7.42);
    expect(reply.camera.latitude).toBe(43.73);
  });

  it('answers listLayers and honours setLayerVisibility', () => {
    useAppStore.setState({ layers: [testLayer('roads', true), testLayer('parcels', false)] });
    renderHook(() => useEmbedMessaging(true));

    fromHost({ type: 'viewtopia:listLayers', requestId: 'r2' });
    const [reply] = hostReceived('viewtopia:layers');
    expect(reply.requestId).toBe('r2');
    expect(reply.layers).toEqual([
      { id: 'roads', name: 'roads', type: 'geojson', visible: true },
      { id: 'parcels', name: 'parcels', type: 'geojson', visible: false },
    ]);

    fromHost({ type: 'viewtopia:setLayerVisibility', layerId: 'roads', visible: false });
    expect(useAppStore.getState().layers.find((l) => l.id === 'roads')?.visible).toBe(false);
    // setting the value it already has must not toggle it back
    fromHost({ type: 'viewtopia:setLayerVisibility', layerId: 'roads', visible: false });
    expect(useAppStore.getState().layers.find((l) => l.id === 'roads')?.visible).toBe(false);
  });

  it('ignores messages that are not from the parent window', () => {
    renderHook(() => useEmbedMessaging(true));
    hostPostMessage.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'viewtopia:getCamera' }, source: window }),
    );
    expect(hostReceived('viewtopia:camera')).toHaveLength(0);
  });

  it('streams throttled camera events while the view moves', () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useEmbedMessaging(true));
      setSharedCamera({ longitude: 1 });
      setSharedCamera({ longitude: 2 });
      setSharedCamera({ longitude: 3 });
      expect(hostReceived('viewtopia:camera')).toHaveLength(0);
      vi.advanceTimersByTime(250);
      const events = hostReceived('viewtopia:camera');
      expect(events).toHaveLength(1);
      expect(events[0].camera.longitude).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports map clicks as coordinates', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    setActiveMapLibre({
      getCanvas: () => canvas,
      unproject: ([x, y]: [number, number]) => ({ lng: x / 10, lat: y / 10 }),
    } as unknown as MapLibreMap);

    renderHook(() => useEmbedMessaging(true));
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30, clientY: 40 }));

    const [click] = hostReceived('viewtopia:click');
    expect(click).toEqual({ type: 'viewtopia:click', lng: 3, lat: 4 });
    canvas.remove();
  });
});
