import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import L from 'leaflet';
import { useAgentLayerStore, layerStyle } from '../store/agentLayers';
import { simplestyleColor } from '../features/symbology/symbology';
import { useAppStore } from '../store/app';
import { agentLayersBounds } from './agentLayerBounds';

/**
 * Draws the agent's ui_spec layers and markers on the 2D Leaflet map, so the
 * set stays on screen when the user switches away from a globe renderer.
 * useLeaflet destroys the map on every tab switch, so both effects re-key on
 * activeTab and re-add everything against the fresh instance.
 */
export function useAgentLayersLeaflet(mapRef: MutableRefObject<L.Map | null>) {
  const layers = useAgentLayerStore((s) => s.layers);
  const markers = useAgentLayerStore((s) => s.markers);
  const generation = useAgentLayerStore((s) => s.generation);
  const activeTab = useAppStore((s) => s.activeTab);
  const framedRef = useRef(-1);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const objs = markers.map((m) => {
      const dot = L.circleMarker([m.lat, m.lon], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: m.color,
        fillOpacity: 1,
      }).addTo(map);
      if (m.label) dot.bindTooltip(m.label, { permanent: true, direction: 'top' });
      return dot;
    });
    return () => {
      for (const o of objs) o.remove();
    };
  }, [markers, mapRef, activeTab]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const objs = layers.map((layer) => {
      const style = layerStyle(layer);
      return L.geoJSON(layer.geojson, {
        // a callback, not an object, so a classified layer's per-feature colour
        // is read off the feature's simplestyle properties
        style: (feature) => ({
          color: simplestyleColor(feature, 'stroke', layer.color),
          weight: style.lineWidth,
          fillColor: simplestyleColor(feature, 'fill', layer.color),
          fillOpacity: style.opacity,
          fill: style.filled,
          stroke: style.stroked,
        }),
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 5,
            color: '#ffffff',
            weight: 1,
            fillColor: simplestyleColor(feature, 'marker-color', layer.color),
            fillOpacity: 1,
          }),
      }).addTo(map);
    });

    // Frame only when a new spec arrives, never on a plain tab switch.
    const bounds = agentLayersBounds(layers);
    if (bounds && framedRef.current !== generation) {
      framedRef.current = generation;
      map.fitBounds(
        [
          [bounds[1], bounds[0]],
          [bounds[3], bounds[2]],
        ],
        { padding: [60, 60], maxZoom: 17, animate: false },
      );
    }

    return () => {
      // the map may already be gone (tab switch removes it), and Leaflet's
      // remove() is a no-op once the layer is detached
      for (const o of objs) o.remove();
    };
  }, [layers, generation, mapRef, activeTab]);
}
