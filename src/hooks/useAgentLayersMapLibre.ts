import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';

const PREFIX = 'agent-layer-';

/** Draws the agent's ui_spec layers on MapLibre, so switching renderers keeps them. */
export function useAgentLayersMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const layers = useAgentLayerStore((s) => s.layers);
  const generation = useAgentLayerStore((s) => s.generation);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const framedRef = useRef(-1);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // Drop everything we previously added, then redraw from the store.
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(PREFIX)) map.removeLayer(layer.id);
      }
      for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
        if (id.startsWith(PREFIX)) map.removeSource(id);
      }

      const bounds: [number, number, number, number] = [180, 90, -180, -90];
      let any = false;

      for (const layer of layers) {
        const src = `${PREFIX}${layer.id}`;
        map.addSource(src, { type: 'geojson', data: layer.geojson });
        // One source can hold mixed geometry, so add a layer per kind.
        map.addLayer({
          id: `${src}-fill`,
          type: 'fill',
          source: src,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': layer.color, 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: `${src}-line`,
          type: 'line',
          source: src,
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
          paint: { 'line-color': layer.color, 'line-width': 2 },
        });
        map.addLayer({
          id: `${src}-circle`,
          type: 'circle',
          source: src,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': layer.color,
            'circle-radius': 5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        });

        for (const f of layer.geojson.features ?? []) {
          forEachPosition(f.geometry, ([lng, lat]) => {
            any = true;
            if (lng < bounds[0]) bounds[0] = lng;
            if (lat < bounds[1]) bounds[1] = lat;
            if (lng > bounds[2]) bounds[2] = lng;
            if (lat > bounds[3]) bounds[3] = lat;
          });
        }
      }

      if (any && framedRef.current !== generation) {
        framedRef.current = generation;
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 0 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.on('load', apply);

    return () => {
      map.off('load', apply);
    };
  }, [layers, generation, mapRef, renderer, activeTab]);
}

function forEachPosition(
  geometry: GeoJSON.Geometry | null,
  fn: (pos: GeoJSON.Position) => void,
): void {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) forEachPosition(g, fn);
    return;
  }
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      fn(c as GeoJSON.Position);
    } else if (Array.isArray(c)) {
      for (const inner of c) walk(inner);
    }
  };
  walk(geometry.coordinates);
}
