import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface UseLeafletOptions {
  containerId?: string;
}

export function useLeaflet(opts: UseLeafletOptions = {}) {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const container = document.getElementById(
      opts.containerId ?? 'leaflet-container',
    );
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© CARTO',
        maxZoom: 19,
      },
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [opts.containerId]);

  return mapRef;
}
