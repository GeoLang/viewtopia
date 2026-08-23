import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { useAnnotationStore, type Annotation, type PendingPlacement } from '../store/annotations';
import { useAppStore } from '../store/app';

const DOT_DIAMETER = 12;
const DOT_BORDER = 2;
/** Where the dot's centre sits, measured from the element's left edge and top. */
export const DOT_CENTRE_OFFSET = DOT_DIAMETER / 2 + DOT_BORDER;
// anchor 'left' puts the element's left edge on the point, so shift the row
// left by half a dot to sit the dot itself there
const MARKER_OFFSET: [number, number] = [-DOT_CENTRE_OFFSET, 0];

/**
 * A dot plus the label text. MapLibre draws no text without a `glyphs` entry on
 * the style, and only one basemap has one, so a symbol layer would lose the
 * label on every other basemap.
 */
export function annotationMarkerElement(annotation: Annotation): HTMLElement {
  const element = document.createElement('div');
  element.dataset.testid = 'annotation-marker';
  element.style.cssText =
    'display:flex;align-items:center;gap:4px;white-space:nowrap;pointer-events:none;' +
    'font:13px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;';

  const dot = document.createElement('div');
  dot.style.cssText = `width:${DOT_DIAMETER}px;height:${DOT_DIAMETER}px;border-radius:50%;border:${DOT_BORDER}px solid #fff;flex:none;`;
  dot.style.background = annotation.color;

  const label = document.createElement('span');
  label.textContent = annotation.label;

  element.append(dot, label);
  return element;
}

export function useAnnotationsMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const handlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  // A renderer switch destroys and rebuilds the map, so rebind to the new one —
  // markers and handlers left on the old instance are dead.
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const markers = markersRef.current;

    const render = () => {
      const map = mapRef.current;
      if (!map) return;
      const { annotations } = useAnnotationStore.getState();
      const listed = new Set(annotations.map((a) => a.id));
      for (const [id, marker] of markers) {
        if (listed.has(id)) continue;
        marker.remove();
        markers.delete(id);
      }
      for (const annotation of annotations) {
        if (markers.has(annotation.id)) continue;
        markers.set(
          annotation.id,
          new maplibregl.Marker({
            element: annotationMarkerElement(annotation),
            anchor: 'left',
            offset: MARKER_OFFSET,
          })
            .setLngLat([annotation.lng, annotation.lat])
            .addTo(map),
        );
      }
    };

    const unsubscribe = useAnnotationStore.subscribe(render);
    // Draw onto the rebuilt map; the cleanup below took the old markers with it.
    render();

    return () => {
      unsubscribe();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, [mapRef, renderer, activeTab]);

  useEffect(() => {
    if (renderer !== 'maplibre' || activeTab !== 'globe') return;

    const sync = (state: { pendingPlacement: PendingPlacement | null }) => {
      const map = mapRef.current;
      if (!map) return;

      if (state.pendingPlacement && !handlerRef.current) {
        const handler = (event: maplibregl.MapMouseEvent) => {
          useAnnotationStore
            .getState()
            .placePendingAnnotation(event.lngLat.lng, event.lngLat.lat);
        };
        map.on('click', handler);
        handlerRef.current = handler;
        map.getCanvas().style.cursor = 'crosshair';
      }

      if (!state.pendingPlacement && handlerRef.current) {
        map.off('click', handlerRef.current);
        handlerRef.current = null;
        map.getCanvas().style.cursor = '';
      }
    };

    // Arm a placement the user started before the renderer switch: the store
    // will not fire again for it.
    sync(useAnnotationStore.getState());
    const unsubscribe = useAnnotationStore.subscribe(sync);

    return () => {
      unsubscribe();
      const map = mapRef.current;
      if (map && handlerRef.current) {
        map.off('click', handlerRef.current);
        map.getCanvas().style.cursor = '';
      }
      handlerRef.current = null;
    };
  }, [mapRef, renderer, activeTab]);
}
