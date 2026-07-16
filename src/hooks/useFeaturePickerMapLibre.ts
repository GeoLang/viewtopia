import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { useFeaturePickerStore, propsToRows, toRow } from '../store/featurePicker';

const AGENT_PREFIX = 'agent-layer-';

/**
 * MapLibre binding for the feature picker. While the picker is enabled, a left
 * click reads the clicked feature's properties into the store, preferring the
 * agent's layers over basemap fill so clicking a result doesn't select the road
 * underneath it.
 */
export function useFeaturePickerMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Hover affordance: MapLibre has no built-in picking cursor, and the layers
    // come and go with each spec, so query on move rather than bind per layer.
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const canvas = map.getCanvas();
      if (!useFeaturePickerStore.getState().enabled) {
        canvas.style.cursor = '';
        return;
      }
      const over = map.queryRenderedFeatures(e.point).length > 0;
      canvas.style.cursor = over ? 'pointer' : '';
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!useFeaturePickerStore.getState().enabled) return;

      const hits = map.queryRenderedFeatures(e.point);
      const feature =
        hits.find((f) => f.layer?.id?.startsWith(AGENT_PREFIX)) ?? hits[0];

      if (!feature) {
        useFeaturePickerStore.getState().setSelected(null);
        return;
      }

      const rows = propsToRows(feature.properties ?? {});
      if (rows.length === 0) rows.push(toRow('(no properties)', ''));
      useFeaturePickerStore.getState().setSelected(rows);
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [mapRef, renderer, activeTab]);
}
