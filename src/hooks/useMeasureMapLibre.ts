import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { type MeasurePoint, measureToolClicks, useMeasureStore } from '../store/measure';
import { useAppStore } from '../store/app';
import { lineWithVertexFeatures, setToolGeoJson } from './toolLayersMapLibre';
import { useToolClicksMapLibre } from './useToolClicksMapLibre';

function groundPoints(points: MeasurePoint[]): [number, number][] {
  return points.map((point) => [point[0], point[1]]);
}

const SRC = 'measure-features';
const SRC_PENDING = 'measure-pending';
const LINE_LAYER = 'measure-lines';
const POINT_LAYER = 'measure-pts';
const PENDING_LINE = 'measure-pending-line';
const PENDING_PT = 'measure-pending-pt';

export function useMeasureMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  useToolClicksMapLibre(mapRef, useMeasureStore, measureToolClicks);
  // renderer switches destroy and rebuild the map, which drops layers on the old instance
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  // Render measurement features
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      const { results, pending } = useMeasureStore.getState();

      setToolGeoJson(
        map,
        SRC,
        {
          type: 'FeatureCollection',
          features: results.flatMap((result) => lineWithVertexFeatures(groundPoints(result.points))),
        },
        [
          {
            id: LINE_LAYER,
            type: 'line',
            source: SRC,
            filter: ['==', '$type', 'LineString'],
            paint: { 'line-color': '#fbbf24', 'line-width': 3 },
          },
          {
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
          },
        ],
      );

      setToolGeoJson(
        map,
        SRC_PENDING,
        { type: 'FeatureCollection', features: lineWithVertexFeatures(groundPoints(pending)) },
        [
          {
            id: PENDING_LINE,
            type: 'line',
            source: SRC_PENDING,
            filter: ['==', '$type', 'LineString'],
            paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [4, 4] },
          },
          {
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
          },
        ],
      );
    };

    const unsub = useMeasureStore.subscribe(render);
    if (map.isStyleLoaded()) render();
    else map.on('load', render);

    return () => {
      unsub();
      map.off('load', render);
    };
  }, [mapRef, renderer, activeTab]);
}
