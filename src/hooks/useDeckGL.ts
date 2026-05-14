import { useEffect, useRef } from 'react';
import { Deck } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';

interface UseDeckGLOptions {
  containerId?: string;
}

export function useDeckGL(opts: UseDeckGLOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  useEffect(() => {
    const container = document.getElementById(
      opts.containerId ?? 'deckgl-container',
    );
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
          },
        },
        layers: [
          { id: 'carto-dark', type: 'raster', source: 'carto-dark' },
        ],
      },
      center: [0, 20],
      zoom: 2,
    });

    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [opts.containerId]);

  return { mapRef, overlayRef };
}
