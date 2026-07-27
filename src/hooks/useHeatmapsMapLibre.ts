import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { applyHeatmaps, heatmapStyleId, useHeatmapStore } from '../lib/mapHeatmap';

/** Draws the panel's and the agent's heatmaps as native maplibre heatmap layers. */
export function useHeatmapsMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  const heatmaps = useHeatmapStore((s) => s.heatmaps);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => applyHeatmaps(map, heatmaps);

    // A basemap change calls setStyle, which drops our source and layer with the
    // rest of the old style. `styledata` only ever fires mid-load, so `idle` is
    // the one that catches a settled style; it no-ops once ours are back.
    const reapplyIfDropped = () => {
      if (!map.isStyleLoaded()) return;
      const sources = Object.keys(map.getStyle()?.sources ?? {});
      if (heatmaps.some((h) => h.points.length > 0 && !sources.includes(heatmapStyleId(h.id)))) {
        apply();
      }
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
  }, [heatmaps, mapRef, renderer, activeTab]);
}
