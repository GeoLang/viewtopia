import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import {
  useAgentLayerStore,
  layerColor,
  layerStyle,
  visibleLayers,
  ZOOM_LIMITS,
  type AgentMarker,
} from '../store/agentLayers';
import { usePaneHiddenLayerIds, VIEWER_PANE } from '../store/splitView';
import { MARKER_RADIUS_KEY, POINT_RADIUS } from '../features/symbology/symbology';
import { agentLayersBounds } from './agentLayerBounds';

const PREFIX = 'agent-layer-';
const RASTER_PREFIX = 'agent-raster-';

/**
 * A classified layer carries its colour, and its point radius where the
 * symbology sizes points, on each feature as a simplestyle property, so the
 * paint reads that and falls back to what the layer draws otherwise.
 */
export function featureValue(key: string, fallback: string | number): ExpressionSpecification {
  return ['coalesce', ['get', key], fallback];
}

/** Colored dot + optional label, matching the Cesium marker look. */
export function markerElement(m: AgentMarker): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  if (m.label) {
    const text = document.createElement('div');
    text.textContent = m.label;
    text.style.cssText =
      'color:#fff;font:14px sans-serif;text-shadow:0 0 3px #000;margin-bottom:2px;white-space:nowrap;';
    el.appendChild(text);
  }
  const dot = document.createElement('div');
  dot.style.cssText = 'width:12px;height:12px;border-radius:50%;border:2px solid #fff;';
  // assigned rather than interpolated into the css above: the colour is the
  // agent's, and a property assignment drops a value that carries more than one
  dot.style.background = m.color;
  el.appendChild(dot);
  return el;
}

/**
 * Draws the agent's ui_spec layers and markers on a MapLibre map, the viewer or
 * a compare pane, so switching renderers keeps them. useMapLibre swaps the
 * instance whenever the tab or the pane's renderer changes, and renders again
 * when it does, so every effect keys on the instance and re-adds everything
 * against the fresh one. Layers this pane hides are left out of it.
 */
export function useAgentLayersMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
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

  // Markers are DOM overlays, so they survive basemap setStyle; just rebuild
  // the small set whenever the store changes or the map remounts.
  useEffect(() => {
    if (!map) return;
    const objs = markers.map((m) =>
      new maplibregl.Marker({ element: markerElement(m) }).setLngLat([m.lon, m.lat]).addTo(map),
    );
    return () => {
      for (const o of objs) o.remove();
    };
  }, [markers, map]);

  useEffect(() => {
    if (!map) return;

    const apply = () => {
      // Drop everything we previously added, then redraw from the store.
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(PREFIX) || layer.id.startsWith(RASTER_PREFIX)) {
          map.removeLayer(layer.id);
        }
      }
      for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
        if (id.startsWith(PREFIX) || id.startsWith(RASTER_PREFIX)) map.removeSource(id);
      }

      // rasters first, so features draw over the image they describe
      for (const layer of rasterLayers) {
        if (!layer.visible) continue;
        const src = `${RASTER_PREFIX}${layer.id}`;
        // an image source takes any quad, so a dragged corner needs no resampling
        map.addSource(src, {
          type: 'image',
          url: layer.url,
          coordinates: layer.corners,
        });
        map.addLayer({
          id: `${src}-raster`,
          type: 'raster',
          source: src,
          paint: { 'raster-opacity': layer.opacity },
        });
      }

      for (const layer of paneLayers) {
        const src = `${PREFIX}${layer.id}`;
        const style = layerStyle(layer);
        const color = layerColor(layer);
        // the store's zoom range is already MapLibre's own, and the limits it
        // falls back to are MapLibre's defaults, so this can go on unconditionally
        const { min: minzoom, max: maxzoom } = layer.zoomRange ?? ZOOM_LIMITS;
        map.addSource(src, { type: 'geojson', data: layer.geojson });
        // One source can hold mixed geometry, so add a layer per kind.
        if (style.filled) {
          map.addLayer({
            id: `${src}-fill`,
            type: 'fill',
            source: src,
            minzoom,
            maxzoom,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
              'fill-color': featureValue('fill', color),
              'fill-opacity': style.opacity,
            },
          });
        }
        if (style.stroked) {
          map.addLayer({
            id: `${src}-line`,
            type: 'line',
            source: src,
            minzoom,
            maxzoom,
            filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
            paint: {
              'line-color': featureValue('stroke', color),
              'line-width': style.lineWidth,
            },
          });
        }
        map.addLayer({
          id: `${src}-circle`,
          type: 'circle',
          source: src,
          minzoom,
          maxzoom,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': featureValue('marker-color', color),
            'circle-radius': featureValue(MARKER_RADIUS_KEY, POINT_RADIUS),
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        });
      }

      const bounds = agentLayersBounds(paneLayers);
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
      const missing =
        paneLayers.some((layer) => !sources.includes(`${PREFIX}${layer.id}`)) ||
        rasterLayers.some(
          (layer) => layer.visible && !sources.includes(`${RASTER_PREFIX}${layer.id}`),
        );
      if (missing) apply();
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
  }, [paneLayers, rasterLayers, generation, map]);
}
