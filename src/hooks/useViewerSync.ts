import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Viewer } from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Map as LeafletMap } from 'leaflet';

interface ViewerRefs {
  cesium?: MutableRefObject<Viewer | null>;
  maplibre?: MutableRefObject<MapLibreMap | null>;
  leaflet?: MutableRefObject<LeafletMap | null>;
}

/**
 * Returns a flyTo function that moves all provided viewer refs to the same location.
 */
export function useViewerSync(refs: ViewerRefs) {
  const flyTo = useCallback(
    (lng: number, lat: number, zoom?: number) => {
      const altitude = zoom ? 40_000_000 / Math.pow(2, zoom) : 5_000_000;

      if (refs.cesium?.current && !refs.cesium.current.isDestroyed()) {
        const { Cartesian3 } = require('cesium');
        refs.cesium.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(lng, lat, altitude),
          duration: 1.5,
        });
      }

      if (refs.maplibre?.current) {
        refs.maplibre.current.flyTo({
          center: [lng, lat],
          zoom: zoom ?? 8,
          duration: 1500,
        });
      }

      if (refs.leaflet?.current) {
        refs.leaflet.current.flyTo([lat, lng], zoom ?? 8, {
          duration: 1.5,
        });
      }
    },
    [refs],
  );

  return { flyTo };
}
