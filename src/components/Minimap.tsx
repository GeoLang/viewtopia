import { useEffect, useRef } from 'react';
import { Box } from '@mantine/core';
import L from 'leaflet';
import { useAppStore } from '../store/app';
import { getSharedCamera } from '../hooks/sharedCamera';
import { rasterTiles } from '../hooks/basemapTiles';

/**
 * Minimap — Leaflet overview map synced to the active renderer's camera
 * via the shared camera state (polling).
 */
export function Minimap() {
  const settings = useAppStore((s) => s.settings);
  const basemap = useAppStore((s) => s.basemap);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!settings.showMinimap) return;
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      attributionControl: false,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    } as L.MapOptions).setView([37.8, -122.4], 4);

    // follows the selected basemap so the overview isn't stuck on one provider
    const tile = rasterTiles(basemap);
    L.tileLayer(tile.url, { attribution: tile.attr, maxZoom: 18 }).addTo(map);

    const rect = L.rectangle(
      [
        [0, 0],
        [0, 0],
      ],
      {
        color: '#7c3aed',
        weight: 2,
        fillColor: '#7c3aed',
        fillOpacity: 0.15,
        interactive: false,
      },
    ).addTo(map);

    mapRef.current = map;
    rectRef.current = rect;

    // Poll shared camera to stay in sync with any renderer
    const interval = setInterval(() => {
      try {
        const cam = getSharedCamera();
        const extent = (4e7 / Math.pow(2, cam.zoom)) / 111000;
        rect.setBounds([
          [cam.latitude - extent / 2, cam.longitude - extent / 2],
          [cam.latitude + extent / 2, cam.longitude + extent / 2],
        ]);
        const z = Math.max(0, Math.min(10, Math.round(cam.zoom) - 3));
        map.setView([cam.latitude, cam.longitude], z, { animate: false });
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      clearInterval(interval);
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
    };
  }, [settings.showMinimap, basemap]);

  if (!settings.showMinimap) return null;

  return (
    <Box
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: 160,
        height: 100,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #30363d',
        background: '#0d1117',
        zIndex: 200,
        opacity: 0.9,
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', borderRadius: 6 }}
      />
    </Box>
  );
}
