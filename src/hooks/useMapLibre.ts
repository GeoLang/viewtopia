import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

interface UseMapLibreOptions {
  containerId?: string;
  style?: string;
}

export function useMapLibre(opts: UseMapLibreOptions = {}) {
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = document.getElementById(
      opts.containerId ?? 'maplibre-container',
    );
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style:
        opts.style ??
        'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [0, 20],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [opts.containerId, opts.style]);

  return mapRef;
}
