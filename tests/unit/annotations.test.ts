import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import {
  useAnnotationsMapLibre,
  annotationMarkerElement,
} from '../../src/hooks/useAnnotationsMapLibre';
import { useAnnotationStore, type Annotation } from '../../src/store/annotations';
import { useAppStore } from '../../src/store/app';

const annotation = (over: Partial<Annotation> = {}): Annotation => ({
  id: 'a1',
  label: 'Site A',
  color: '#ff0000',
  lat: 43.7,
  lng: 7.4,
  createdAt: 1,
  ...over,
});

/**
 * Enough of a map for the real maplibregl.Marker to attach to and for the hook
 * to bind a click on. Marker projects through the transform, so the pieces it
 * reaches for are all here.
 */
function fakeMap() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    container,
    getCanvasContainer: () => container,
    getContainer: () => container,
    getCanvas: () => ({ style: {} as CSSStyleDeclaration }),
    on: (type: string, handler: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(handler);
      listeners.set(type, set);
    },
    off: (type: string, handler: (event: unknown) => void) => {
      listeners.get(type)?.delete(handler);
    },
    loaded: () => true,
    isMoving: () => false,
    project: () => new maplibregl.Point(10, 20),
    getTerrain: () => null,
    terrain: null,
    transform: {
      lngLatToCameraDepth: () => 0.5,
      getCoveringTilesDetailsProvider: () => ({ allowWorldCopies: () => false }),
    },
    _getUIString: () => '',
    _requestDomTask: (task: () => void) => task(),
    // markers register a map click of their own, so fire the shape both they
    // and the placement handler read
    fireClick: (lng: number, lat: number) => {
      for (const handler of [...(listeners.get('click') ?? [])]) {
        handler({ lngLat: { lng, lat }, originalEvent: { target: container } });
      }
    },
  };
}

type MapRef = Parameters<typeof useAnnotationsMapLibre>[0];

const mount = (map: ReturnType<typeof fakeMap>) => {
  const ref = { current: map } as unknown as MapRef;
  return renderHook(() => useAnnotationsMapLibre(ref));
};

describe('annotation store placement', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
  });

  it('starts and cancels a placement', () => {
    const { startPlacement, cancelPlacement } = useAnnotationStore.getState();
    startPlacement('Site A', '#ff0000');
    expect(useAnnotationStore.getState().pendingPlacement).toEqual({
      label: 'Site A',
      color: '#ff0000',
    });
    cancelPlacement();
    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();
  });

  it('turns a pending placement into an annotation at the clicked point', () => {
    const { startPlacement, placePendingAnnotation } = useAnnotationStore.getState();
    startPlacement('Site A', '#ff0000');
    placePendingAnnotation(7.4, 43.7);

    const { annotations, pendingPlacement } = useAnnotationStore.getState();
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      label: 'Site A',
      color: '#ff0000',
      lng: 7.4,
      lat: 43.7,
    });
    expect(pendingPlacement).toBeNull();
  });

  it('places nothing when no placement is pending', () => {
    useAnnotationStore.getState().placePendingAnnotation(7.4, 43.7);
    expect(useAnnotationStore.getState().annotations).toEqual([]);
  });
});

describe('annotationMarkerElement', () => {
  it('carries the label text and the annotation colour', () => {
    const element = annotationMarkerElement(annotation({ label: 'Quarry', color: '#34d399' }));
    expect(element.textContent).toBe('Quarry');
    const dot = element.firstElementChild as HTMLElement;
    expect(dot.style.background).toBe('rgb(52, 211, 153)');
  });
});

describe('useAnnotationsMapLibre', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], pendingPlacement: null });
    useAppStore.setState({ renderer: 'maplibre', activeTab: 'globe' });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it('draws a labelled marker per annotation and drops it on removal', () => {
    const map = fakeMap();
    mount(map);
    expect(map.container.querySelectorAll('[data-testid="annotation-marker"]')).toHaveLength(0);

    act(() => {
      useAnnotationStore.getState().addAnnotation(annotation());
    });
    const markers = map.container.querySelectorAll('[data-testid="annotation-marker"]');
    expect(markers).toHaveLength(1);
    expect(markers[0].textContent).toBe('Site A');

    act(() => {
      useAnnotationStore.getState().removeAnnotation('a1');
    });
    expect(map.container.querySelectorAll('[data-testid="annotation-marker"]')).toHaveLength(0);
  });

  it('draws the annotations already in the store when the map comes up', () => {
    useAnnotationStore.setState({ annotations: [annotation(), annotation({ id: 'a2' })] });
    const map = fakeMap();
    mount(map);
    expect(map.container.querySelectorAll('[data-testid="annotation-marker"]')).toHaveLength(2);
  });

  it('arms the map click for a pending placement and places at the clicked point', () => {
    const map = fakeMap();
    mount(map);

    // unarmed, a click on the map is nothing to do with annotations
    act(() => {
      map.fireClick(1, 2);
    });
    expect(useAnnotationStore.getState().annotations).toEqual([]);

    act(() => {
      useAnnotationStore.getState().startPlacement('Site A', '#ff0000');
    });
    act(() => {
      map.fireClick(7.4, 43.7);
    });
    expect(useAnnotationStore.getState().annotations).toMatchObject([
      { label: 'Site A', color: '#ff0000', lng: 7.4, lat: 43.7 },
    ]);
    expect(useAnnotationStore.getState().pendingPlacement).toBeNull();
    expect(map.container.querySelectorAll('[data-testid="annotation-marker"]')).toHaveLength(1);

    // the placement was one-shot, so a second click adds nothing
    act(() => {
      map.fireClick(1, 2);
    });
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it('disarms when the placement is cancelled', () => {
    const map = fakeMap();
    mount(map);
    act(() => {
      useAnnotationStore.getState().startPlacement('Site A', '#ff0000');
    });
    act(() => {
      useAnnotationStore.getState().cancelPlacement();
    });
    act(() => {
      map.fireClick(7.4, 43.7);
    });
    expect(useAnnotationStore.getState().annotations).toEqual([]);
  });

  it('leaves the click alone while Cesium is the shown renderer', () => {
    useAppStore.setState({ renderer: 'cesium' });
    const map = fakeMap();
    mount(map);
    act(() => {
      useAnnotationStore.getState().startPlacement('Site A', '#ff0000');
    });
    act(() => {
      map.fireClick(7.4, 43.7);
    });
    expect(useAnnotationStore.getState().annotations).toEqual([]);
    expect(useAnnotationStore.getState().pendingPlacement).not.toBeNull();
  });
});
