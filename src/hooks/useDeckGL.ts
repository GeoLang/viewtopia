import { useEffect, useRef } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { maplibreRasterStyle } from './basemapTiles';

interface UseDeckGLOptions {
  containerId?: string;
}

export function useDeckGL(opts: UseDeckGLOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  const isActive = activeTab === 'globe' && renderer === 'deckgl';

  // Create/destroy map based on active state
  useEffect(() => {
    if (!isActive) {
      // Destroy when not active
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        overlayRef.current = null;
      }
      return;
    }

    const container = document.getElementById(
      opts.containerId ?? 'deckgl-container',
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
      preserveDrawingBuffer: true,
    });

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

    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;
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

  return { mapRef, overlayRef };
}
