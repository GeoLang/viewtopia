import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import L from 'leaflet';
import { useAnnotationStore, type PendingPlacement } from '../store/annotations';
import { useAppStore } from '../store/app';
import { annotationMarkerElement, DOT_CENTRE_OFFSET } from './useAnnotationsMapLibre';

/**
 * useLeaflet destroys the map when the tab changes, so every effect keys on the
 * tab and redraws against the new one.
 */
export function useAnnotationsLeaflet(mapRef: MutableRefObject<L.Map | null>) {
  const markersRef = useRef(new Map<string, L.Marker>());
  const handlerRef = useRef<((event: L.LeafletMouseEvent) => void) | null>(null);
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
          L.marker([annotation.lat, annotation.lng], {
            // leaflet's own .leaflet-div-icon draws a white box, so no className
            icon: L.divIcon({
              html: annotationMarkerElement(annotation),
              className: '',
              iconAnchor: [DOT_CENTRE_OFFSET, DOT_CENTRE_OFFSET],
            }),
            interactive: false,
          }).addTo(map),
        );
      }
    };

    const unsubscribe = useAnnotationStore.subscribe(render);
    render();

    return () => {
      unsubscribe();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, [mapRef, activeTab]);

  useEffect(() => {
    if (activeTab !== 'map') return;

    const sync = (state: { pendingPlacement: PendingPlacement | null }) => {
      const map = mapRef.current;
      if (!map) return;

      if (state.pendingPlacement && !handlerRef.current) {
        const handler = (event: L.LeafletMouseEvent) => {
          useAnnotationStore
            .getState()
            .placePendingAnnotation(event.latlng.lng, event.latlng.lat);
        };
        map.on('click', handler);
        handlerRef.current = handler;
        map.getContainer().style.cursor = 'crosshair';
      }

      if (!state.pendingPlacement && handlerRef.current) {
        map.off('click', handlerRef.current);
        handlerRef.current = null;
        map.getContainer().style.cursor = '';
      }
    };

    // Arm a placement the user started on the globe tab: the store will not
    // fire again for it.
    sync(useAnnotationStore.getState());
    const unsubscribe = useAnnotationStore.subscribe(sync);

    return () => {
      unsubscribe();
      const map = mapRef.current;
      if (map && handlerRef.current) {
        map.off('click', handlerRef.current);
        map.getContainer().style.cursor = '';
      }
      handlerRef.current = null;
    };
  }, [mapRef, activeTab]);
}
