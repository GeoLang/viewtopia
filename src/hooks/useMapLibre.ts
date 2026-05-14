import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { maplibreRasterStyle } from './basemapTiles';

interface UseMapLibreOptions {
  containerId?: string;
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
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
    });

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
  }, [isActive, opts.containerId, basemap]);

  // Swap basemap tiles when already active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isActive) return;
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
