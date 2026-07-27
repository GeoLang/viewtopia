import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import L from 'leaflet';
import { useLeaflet } from '../../src/hooks/useLeaflet';
import { useAgentLayersLeaflet } from '../../src/hooks/useAgentLayersLeaflet';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

const CONTAINER_ID = 'leaflet-container';

/** jsdom does no layout, and a 0x0 map makes fitBounds compute a NaN zoom */
function makeContainer() {
  const div = document.createElement('div');
  div.id = CONTAINER_ID;
  for (const [prop, value] of [
    ['clientWidth', 800],
    ['clientHeight', 600],
    ['offsetWidth', 800],
    ['offsetHeight', 600],
  ] as const) {
    Object.defineProperty(div, prop, { value, configurable: true });
  }
  document.body.appendChild(div);
  return div;
}

const polygon = (id: string, lon: number, lat: number): AgentLayer => ({
  id,
  name: id,
  color: '#ff0000',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lon, lat],
              [lon + 1, lat],
              [lon + 1, lat + 1],
              [lon, lat + 1],
              [lon, lat],
            ],
          ],
        },
      },
    ],
  },
});

/** Same hook order as ViewerArea: the map is created before the layers hook runs. */
function useMapWithAgentLayers() {
  const mapRef = useLeaflet({ containerId: CONTAINER_ID });
  useAgentLayersLeaflet(mapRef);
  return mapRef;
}

const countOn = (map: L.Map, kind: new (...args: never[]) => L.Layer) => {
  let n = 0;
  map.eachLayer((l) => {
    if (l instanceof kind) n++;
  });
  return n;
};

const setTab = (tab: 'globe' | 'map') =>
  act(() => {
    useAppStore.setState({ activeTab: tab });
  });

describe('useAgentLayersLeaflet', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    cleanup();
    container = makeContainer();
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
    useAppStore.setState({ activeTab: 'map' });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
  });

  afterEach(() => {
    cleanup();
    container.remove();
  });

  it('draws a layer added while the 2D tab is open, and drops it on removeLayer', () => {
    const { result } = renderHook(() => useMapWithAgentLayers());
    const map = result.current.current!;
    expect(map).toBeTruthy();
    expect(countOn(map, L.GeoJSON)).toBe(0);

    act(() => {
      useAgentLayerStore.getState().addLayer(polygon('flood', 10, 50));
    });
    expect(countOn(map, L.GeoJSON)).toBe(1);

    act(() => {
      useAgentLayerStore.getState().removeLayer('flood');
    });
    expect(countOn(map, L.GeoJSON)).toBe(0);
  });

  it('shows layers added on a globe tab once the user switches to 2D', () => {
    useAppStore.setState({ activeTab: 'globe' });
    const { result } = renderHook(() => useMapWithAgentLayers());
    expect(result.current.current).toBeNull();

    act(() => {
      useAgentLayerStore.getState().addLayer(polygon('flood', 10, 50));
    });
    expect(result.current.current).toBeNull();

    setTab('map');
    expect(countOn(result.current.current!, L.GeoJSON)).toBe(1);
  });

  it('re-adds the layers when the map is recreated on tab return', () => {
    const { result } = renderHook(() => useMapWithAgentLayers());
    act(() => {
      useAgentLayerStore.getState().addLayer(polygon('flood', 10, 50));
    });
    const first = result.current.current!;
    expect(countOn(first, L.GeoJSON)).toBe(1);

    setTab('globe');
    expect(result.current.current).toBeNull();

    setTab('map');
    const second = result.current.current!;
    expect(second).not.toBe(first);
    expect(countOn(second, L.GeoJSON)).toBe(1);

    act(() => {
      useAgentLayerStore.getState().removeLayer('flood');
    });
    expect(countOn(second, L.GeoJSON)).toBe(0);
  });

  it('fits the view to the layers on a generation bump, but not on a tab switch', () => {
    const { result } = renderHook(() => useMapWithAgentLayers());
    act(() => {
      useAgentLayerStore.getState().addLayer(polygon('flood', 10, 50));
    });
    const center = result.current.current!.getCenter();
    expect(center.lng).toBeCloseTo(10.5, 1);
    expect(center.lat).toBeCloseTo(50.5, 1);

    // a tab switch reuses the shared camera, so no second fit is needed, but
    // the map must not end up somewhere else either
    setTab('globe');
    setTab('map');
    expect(result.current.current!.getCenter().lng).toBeCloseTo(10.5, 1);
  });

  it('does not fit when every layer is empty', () => {
    const { result } = renderHook(() => useMapWithAgentLayers());
    act(() => {
      useAgentLayerStore.getState().addLayer({
        id: 'empty',
        name: 'empty',
        color: '#ff0000',
        geojson: { type: 'FeatureCollection', features: [] },
      });
    });
    const center = result.current.current!.getCenter();
    expect(center.lng).toBeCloseTo(0, 5);
    expect(center.lat).toBeCloseTo(20, 5);
  });

  it('draws markers with their label, and clears them', () => {
    const { result } = renderHook(() => useMapWithAgentLayers());
    const map = result.current.current!;

    act(() => {
      useAgentLayerStore.getState().addMarker({ lon: 5, lat: 45, color: '#00ff00', label: 'site' });
    });
    expect(countOn(map, L.CircleMarker)).toBe(1);
    let marker: L.CircleMarker | undefined;
    map.eachLayer((l) => {
      if (l instanceof L.CircleMarker) marker = l;
    });
    expect(marker!.getLatLng()).toMatchObject({ lat: 45, lng: 5 });
    expect(marker!.options.fillColor).toBe('#00ff00');
    expect(marker!.getTooltip()?.getContent()).toBe('site');

    act(() => {
      useAgentLayerStore.getState().clearMarkers();
    });
    expect(countOn(map, L.CircleMarker)).toBe(0);
  });

  it('leaves nothing behind when the hook unmounts', () => {
    const { result, unmount } = renderHook(() => useMapWithAgentLayers());
    act(() => {
      useAgentLayerStore.getState().addLayer(polygon('flood', 10, 50));
      useAgentLayerStore.getState().addMarker({ lon: 5, lat: 45, color: '#00ff00' });
    });
    const map = result.current.current!;
    unmount();
    expect(result.current.current).toBeNull();
    expect(countOn(map, L.GeoJSON)).toBe(0);
    expect(countOn(map, L.CircleMarker)).toBe(0);
  });
});
