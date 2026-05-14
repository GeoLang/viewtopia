import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMeasureStore } from '../store/measure';

const SRC = 'measure-features';
const SRC_PENDING = 'measure-pending';
const LINE_LAYER = 'measure-lines';
const POINT_LAYER = 'measure-pts';
const PENDING_LINE = 'measure-pending-line';
const PENDING_PT = 'measure-pending-pt';

function resultsToGeoJSON(results: { points: [number, number][] }[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const r of results) {
    if (r.points.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: r.points },
      });
    }
    for (const p of r.points) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: p },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function pendingToGeoJSON(pending: [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (pending.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pending },
    });
  }
  for (const p of pending) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: p },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function useMeasureMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  const handlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  const dblHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);

  // Click handler: register/unregister based on measure mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const unsub = useMeasureStore.subscribe((state) => {
      const map = mapRef.current;
      if (!map) return;

      if (state.mode && !handlerRef.current) {
        const clickHandler = (e: maplibregl.MapMouseEvent) => {
          const { mode, addPoint } = useMeasureStore.getState();
          if (!mode) return;
          addPoint(e.lngLat.lng, e.lngLat.lat);
        };

        const dblClickHandler = (e: maplibregl.MapMouseEvent) => {
          e.preventDefault();
          const { mode, finishMeasure } = useMeasureStore.getState();
          if (mode) finishMeasure();
        };

        map.on('click', clickHandler);
        map.on('dblclick', dblClickHandler);
        handlerRef.current = clickHandler;
        dblHandlerRef.current = dblClickHandler;
        map.getCanvas().style.cursor = 'crosshair';
      }

      if (!state.mode && handlerRef.current) {
        map.off('click', handlerRef.current);
        handlerRef.current = null;
        if (dblHandlerRef.current) {
          map.off('dblclick', dblHandlerRef.current);
          dblHandlerRef.current = null;
        }
        map.getCanvas().style.cursor = '';
      }
    });

    return () => {
      unsub();
      const map = mapRef.current;
      if (!map) return;
      if (handlerRef.current) map.off('click', handlerRef.current);
      if (dblHandlerRef.current) map.off('dblclick', dblHandlerRef.current);
      handlerRef.current = null;
      dblHandlerRef.current = null;
    };
  }, [mapRef]);

  // Render measurement features
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      const { results, pending } = useMeasureStore.getState();
      const geo = resultsToGeoJSON(results);
      const pendGeo = pendingToGeoJSON(pending);

      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo);
      } else {
        map.addSource(SRC, { type: 'geojson', data: geo });
        map.addLayer({
          id: LINE_LAYER,
          type: 'line',
          source: SRC,
          filter: ['==', '$type', 'LineString'],
          paint: { 'line-color': '#fbbf24', 'line-width': 3 },
        });
        map.addLayer({
          id: POINT_LAYER,
          type: 'circle',
          source: SRC,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 5,
            'circle-color': '#fbbf24',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });
      }

      const pendSrc = map.getSource(SRC_PENDING) as maplibregl.GeoJSONSource | undefined;
      if (pendSrc) {
        pendSrc.setData(pendGeo);
      } else {
        map.addSource(SRC_PENDING, { type: 'geojson', data: pendGeo });
        map.addLayer({
          id: PENDING_LINE,
          type: 'line',
          source: SRC_PENDING,
          filter: ['==', '$type', 'LineString'],
          paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [4, 4] },
        });
        map.addLayer({
          id: PENDING_PT,
          type: 'circle',
          source: SRC_PENDING,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 4,
            'circle-color': '#fbbf24',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          },
        });
      }
    };

    const unsub = useMeasureStore.subscribe(render);
    if (map.isStyleLoaded()) render();
    else map.on('load', render);

    return () => { unsub(); };
  }, [mapRef]);
}
