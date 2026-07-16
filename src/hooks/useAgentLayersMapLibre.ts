import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { agentLayersBounds } from './agentLayerBounds';

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
      }

      const bounds = agentLayersBounds(layers);
      if (bounds && framedRef.current !== generation) {
        framedRef.current = generation;
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 0 });
      }
    };

    // A basemap change calls setStyle, which drops every source and layer with
    // it, so re-add ours whenever a reloaded style comes back without them.
    // `styledata` only ever fires mid-load (isStyleLoaded false), so `idle` is
    // the one that catches a settled style; it no-ops once ours are back.
    const reapplyIfDropped = () => {
      if (!map.isStyleLoaded()) return;
      const sources = Object.keys(map.getStyle()?.sources ?? {});
      if (layers.some((layer) => !sources.includes(`${PREFIX}${layer.id}`))) apply();
    };

    if (map.isStyleLoaded()) apply();
    else map.on('load', apply);
    map.on('styledata', reapplyIfDropped);
    map.on('idle', reapplyIfDropped);

    return () => {
      map.off('load', apply);
      map.off('styledata', reapplyIfDropped);
      map.off('idle', reapplyIfDropped);
    };
  }, [layers, generation, mapRef, renderer, activeTab]);
}
