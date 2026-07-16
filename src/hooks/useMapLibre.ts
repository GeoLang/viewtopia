import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { maplibreRasterStyle } from './basemapTiles';
import { setActiveMapLibre } from '../viewer/registry';

interface UseMapLibreOptions {
  containerId?: string;
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** Basemap the live style was built from, so activation doesn't re-set it. */
  const styledBasemapRef = useRef<string | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  const isActive = activeTab === 'globe' && renderer === 'maplibre';

  // Create/destroy map based on active state
  useEffect(() => {
    if (!isActive) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        styledBasemapRef.current = null;
        setActiveMapLibre(null);
      }
      return;
    }

    const container = document.getElementById(
      opts.containerId ?? 'maplibre-container',
    );
    if (!container || mapRef.current) return;

    const cam = getSharedCamera();

    const map = new maplibregl.Map({
      container,
      style: maplibreRasterStyle(basemap),
      center: [cam.longitude, cam.latitude],
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      maxPitch: 85,
      preserveDrawingBuffer: true,
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('moveend', () => {
      const c = map.getCenter();
      setSharedCamera({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    });

    mapRef.current = map;
    styledBasemapRef.current = basemap;
    setActiveMapLibre(map);
  }, [isActive, opts.containerId, basemap]);

  // Swap basemap tiles when already active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isActive) return;
    // The map is built with the current basemap, so re-setting it on activation
    // would only race whatever else is adding layers to the style.
    if (styledBasemapRef.current === basemap) return;
    styledBasemapRef.current = basemap;
    const c = map.getCenter();
    const z = map.getZoom();
    const p = map.getPitch();
    const b = map.getBearing();
    map.setStyle(maplibreRasterStyle(basemap));
    map.once('styledata', () => {
      map.jumpTo({ center: c, zoom: z, pitch: p, bearing: b });
    });
  }, [basemap, isActive]);

  return mapRef;
}
