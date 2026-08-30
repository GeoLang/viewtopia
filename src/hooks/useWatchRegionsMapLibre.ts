import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useWatchStateStore } from '../live/watchState';
import type { RegionWatch } from '../live/types';
import { useAppStore } from '../store/app';

const SOURCE = 'watch-regions';
const FILL_LAYER = 'watch-region-fills';
const LINE_LAYER = 'watch-region-outlines';

/** What a watched region is painted, dark enough to read a basemap through. */
const REGION_COLOR = '#f59e0b';
const REGION_FILL_OPACITY = 0.15;
const REGION_LINE_WIDTH = 2;

function regionFeatures(watches: Record<string, RegionWatch>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(watches).map((watch) => ({
      type: 'Feature',
      id: watch.id,
      properties: { name: watch.name },
      geometry: watch.region,
    })),
  };
}

/**
 * The regions the document's watches cover, drawn from the frames agora sends
 * rather than from the document, so a view-role member and a share link guest
 * see them without anything being written.
 */
export function useWatchRegionsMapLibre(mapRef: MutableRefObject<maplibregl.Map | null>) {
  // a renderer switch rebuilds the map, so the source has to go on the new one
  const renderer = useAppStore((state) => state.renderer);
  const activeTab = useAppStore((state) => state.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // a style swap drops the source and refuses additions until the new
    // style is in, and style.load runs this again once it is
    const render = () => {
      if (!map.isStyleLoaded()) return;
      const features = regionFeatures(useWatchStateStore.getState().watches);
      const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(features);
        return;
      }
      map.addSource(SOURCE, { type: 'geojson', data: features });
      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': REGION_COLOR, 'fill-opacity': REGION_FILL_OPACITY },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': REGION_COLOR, 'line-width': REGION_LINE_WIDTH },
      });
    };

    const unsubscribe = useWatchStateStore.subscribe(render);
    map.on('style.load', render);
    render();

    return () => {
      unsubscribe();
      map.off('style.load', render);
    };
  }, [mapRef, renderer, activeTab]);
}
