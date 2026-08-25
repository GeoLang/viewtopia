import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import L from 'leaflet';
import {
  useAgentLayerStore,
  drawnAtZoom,
  layerColor,
  layerStyle,
  visibleLayers,
} from '../store/agentLayers';
import {
  MARKER_RADIUS_KEY,
  POINT_RADIUS,
  simplestyleColor,
  simplestyleNumber,
} from '../features/symbology/symbology';
import { usePaneHiddenLayerIds, VIEWER_PANE } from '../store/splitView';
import { agentLayersBounds } from './agentLayerBounds';
import { bboxOfCorners } from '../overlay/georeference';

/**
 * Draws the agent's ui_spec layers and markers on a Leaflet map, the 2D Map tab
 * or a compare pane, so the set stays on screen when the user switches away
 * from a globe renderer. useLeaflet swaps the instance whenever the tab or the
 * pane's renderer changes, and renders again when it does, so every effect
 * keys on the instance and re-adds everything against the fresh one. Layers
 * this pane hides are left out of it.
 */
export function useAgentLayersLeaflet(
  mapRef: MutableRefObject<L.Map | null>,
  paneIndex = VIEWER_PANE,
) {
  const layers = useAgentLayerStore((s) => s.layers);
  const rasterLayers = useAgentLayerStore((s) => s.rasterLayers);
  const markers = useAgentLayerStore((s) => s.markers);
  const generation = useAgentLayerStore((s) => s.generation);
  const hiddenLayerIds = usePaneHiddenLayerIds(paneIndex);
  const paneLayers = useMemo(
    () => visibleLayers(layers).filter((layer) => !hiddenLayerIds.includes(layer.id)),
    [layers, hiddenLayerIds],
  );
  const map = mapRef.current;
  const framedRef = useRef(-1);

  useEffect(() => {
    if (!map) return;
    const objs = markers.map((m) => {
      const dot = L.circleMarker([m.lat, m.lon], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: m.color,
        fillOpacity: 1,
      }).addTo(map);
      // a string tooltip is parsed as html, and the label is written by the
      // agent, so it goes in as a text node the way the other renderers do it
      if (m.label) {
        const text = document.createElement('span');
        text.textContent = m.label;
        dot.bindTooltip(text, { permanent: true, direction: 'top' });
      }
      return dot;
    });
    return () => {
      for (const o of objs) o.remove();
    };
  }, [markers, map]);

  useEffect(() => {
    if (!map) return;
    // leaflet drapes onto a rectangle only, so a dragged quad shows as its
    // envelope here; corner dragging is a MapLibre feature
    const overlays = rasterLayers.filter((l) => l.visible).map((layer) => {
      const [west, south, east, north] = bboxOfCorners(layer.corners);
      return L.imageOverlay(
        layer.url,
        [
          [south, west],
          [north, east],
        ],
        { opacity: layer.opacity },
      ).addTo(map);
    });
    return () => {
      for (const o of overlays) o.remove();
    };
  }, [rasterLayers, map]);

  useEffect(() => {
    if (!map) return;

    const drawn = paneLayers.map((layer) => {
      const style = layerStyle(layer);
      const color = layerColor(layer);
      const object = L.geoJSON(layer.geojson, {
        // a callback, not an object, so a classified layer's per-feature colour
        // is read off the feature's simplestyle properties
        style: (feature) => ({
          color: simplestyleColor(feature, 'stroke', color),
          weight: style.lineWidth,
          fillColor: simplestyleColor(feature, 'fill', color),
          fillOpacity: style.opacity,
          fill: style.filled,
          stroke: style.stroked,
        }),
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: simplestyleNumber(feature, MARKER_RADIUS_KEY, POINT_RADIUS),
            color: '#ffffff',
            weight: 1,
            fillColor: simplestyleColor(feature, 'marker-color', color),
            fillOpacity: 1,
          }),
      });
      return { layer, object };
    });

    // Leaflet has no scale range of its own, so a layer outside its zoom range
    // comes off the map and goes back on when the zoom returns.
    const showForZoom = () => {
      const zoom = map.getZoom();
      for (const { layer, object } of drawn) {
        if (drawnAtZoom(layer, zoom)) object.addTo(map);
        else object.remove();
      }
    };
    showForZoom();
    map.on('zoomend', showForZoom);

    // Frame only when a new spec arrives, never on a plain map swap.
    const bounds = agentLayersBounds(paneLayers);
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
      map.off('zoomend', showForZoom);
      // the map may already be gone (leaving the tab removes it), and Leaflet's
      // remove() is a no-op once the layer is detached
      for (const { object } of drawn) object.remove();
    };
  }, [paneLayers, generation, map]);
}
