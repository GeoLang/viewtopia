import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import L from 'leaflet';
import { useLeaflet } from '../../src/hooks/useLeaflet';
import { useAnnotationsLeaflet } from '../../src/hooks/useAnnotationsLeaflet';
import { useAnnotationStore, type Annotation } from '../../src/store/annotations';
import { useAppStore } from '../../src/store/app';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

const CONTAINER_ID = 'leaflet-container';

/** jsdom does no layout, and a 0x0 map makes leaflet compute a NaN zoom */
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

/** Same hook order as ViewerArea: the map is created before the annotations hook runs. */
function useMapWithAnnotations() {
  const mapRef = useLeaflet({ containerId: CONTAINER_ID });
  useAnnotationsLeaflet(mapRef);
  return mapRef;
}

const annotation = (id: string, lat: number, lng: number): Annotation => ({
  id,
  label: id,
  color: '#a78bfa',
  lat,
  lng,
  createdAt: 0,
});

const markersOn = (map: L.Map): L.Marker[] => {
  const out: L.Marker[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) out.push(layer);
  });
  return out;
};

const setTab = (tab: 'globe' | 'map') =>
  act(() => {
    useAppStore.setState({ activeTab: tab });
  });

describe('useAnnotationsLeaflet', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    cleanup();
    container = makeContainer();
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
    useAppStore.setState({ activeTab: 'map' });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
  });

  afterEach(() => {
    cleanup();
    container.remove();
  });

  it('draws an annotation added while the 2D tab is open and drops it on remove', () => {
    const { result } = renderHook(() => useMapWithAnnotations());
    const map = result.current.current!;
    expect(map).toBeTruthy();
    expect(markersOn(map)).toHaveLength(0);

    act(() => {
      useAnnotationStore.getState().addAnnotation(annotation('flood-edge', 50, 10));
    });
    expect(markersOn(map)).toHaveLength(1);
    expect(markersOn(map)[0].getLatLng()).toMatchObject({ lat: 50, lng: 10 });

    act(() => {
      useAnnotationStore.getState().removeAnnotation('flood-edge');
    });
    expect(markersOn(map)).toHaveLength(0);
  });

  it('shows the label and colour, not leaflet’s own icon box', () => {
    const { result } = renderHook(() => useMapWithAnnotations());
    act(() => {
      useAnnotationStore.getState().addAnnotation(annotation('gauge', 50, 10));
    });

    const icon = markersOn(result.current.current!)[0].getElement()!;
    expect(icon.classList.contains('leaflet-div-icon')).toBe(false);
    const row = icon.querySelector('[data-testid="annotation-marker"]')!;
    expect(row.textContent).toBe('gauge');
    expect(row.querySelector('div')!.getAttribute('style')).toContain(
      'background: rgb(167, 139, 250)',
    );
  });

  it('re-draws the annotations when the map is rebuilt on tab return', () => {
    const { result } = renderHook(() => useMapWithAnnotations());
    act(() => {
      useAnnotationStore.getState().addAnnotation(annotation('gauge', 50, 10));
    });
    const first = result.current.current!;
    expect(markersOn(first)).toHaveLength(1);

    setTab('globe');
    expect(result.current.current).toBeNull();

    setTab('map');
    const second = result.current.current!;
    expect(second).not.toBe(first);
    expect(markersOn(second)).toHaveLength(1);
  });

  it('turns a map click into an annotation only while a placement is armed', () => {
    const { result } = renderHook(() => useMapWithAnnotations());
    const map = result.current.current!;

    act(() => {
      map.fire('click', { latlng: L.latLng(12, 34) });
    });
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);

    act(() => {
      useAnnotationStore.getState().startPlacement('gauge', '#f87171');
    });
    expect(map.getContainer().style.cursor).toBe('crosshair');

    act(() => {
      map.fire('click', { latlng: L.latLng(12, 34) });
    });
    const [placed] = useAnnotationStore.getState().annotations;
    expect(placed).toMatchObject({ label: 'gauge', color: '#f87171', lat: 12, lng: 34 });
    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();
    expect(map.getContainer().style.cursor).toBe('');

    act(() => {
      map.fire('click', { latlng: L.latLng(56, 78) });
    });
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it('arms a placement the user started before switching to the 2D tab', () => {
    useAppStore.setState({ activeTab: 'globe' });
    const { result } = renderHook(() => useMapWithAnnotations());
    act(() => {
      useAnnotationStore.getState().startPlacement('gauge', '#f87171');
    });

    setTab('map');
    const map = result.current.current!;
    expect(map.getContainer().style.cursor).toBe('crosshair');

    act(() => {
      map.fire('click', { latlng: L.latLng(12, 34) });
    });
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });
});
