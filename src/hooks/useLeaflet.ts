import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { rasterTiles } from './basemapTiles';

interface UseLeafletOptions {
  containerId?: string;
}

export function useLeaflet(opts: UseLeafletOptions = {}) {
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    // Only initialize when the map tab is active (container visible)
    if (activeTab !== 'map') return;
    const container = document.getElementById(
      opts.containerId ?? 'leaflet-container',
    );
    if (!container || mapRef.current) return;

    const cam = getSharedCamera();

    const map = L.map(container, {
      center: [cam.latitude, cam.longitude],
      zoom: cam.zoom,
      zoomControl: true,
    });

    const tile = rasterTiles(useAppStore.getState().basemap);
    const layer = L.tileLayer(tile.url, {
      attribution: tile.attr,
      maxZoom: 19,
    }).addTo(map);

    tileRef.current = layer;

    // Write shared camera on move
    map.on('moveend', () => {
      const c = map.getCenter();
      setSharedCamera({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
  }, [opts.containerId, activeTab]);

  // Swap basemap tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove existing tile layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });
    const tile = rasterTiles(basemap);
    const layer = L.tileLayer(tile.url, {
      attribution: tile.attr,
      maxZoom: 19,
    }).addTo(map);
    tileRef.current = layer;
  }, [basemap]);

  // Restore shared camera when switching TO map tab
  useEffect(() => {
    if (activeTab !== 'map') return;
    const map = mapRef.current;
    if (!map) return;
    const cam = getSharedCamera();
    map.setView([cam.latitude, cam.longitude], cam.zoom, { animate: false });
    // leaving the tab destroys the map, and invalidateSize on a destroyed one
    // throws on its missing pane
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [activeTab]);

  return mapRef;
}
