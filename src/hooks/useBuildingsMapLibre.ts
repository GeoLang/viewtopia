import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useBuildingStore, type BuildingFeature } from '../store/buildings';
import { useAppStore } from '../store/app';

const SOURCE_ID = 'osm-buildings';
const LAYER_ID = 'osm-buildings-extrusion';

export function useBuildingsMapLibre(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  const buildings = useBuildingStore((s) => s.buildings);
  const enabled = useBuildingStore((s) => s.enabled);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!enabled || buildings.length === 0) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }

      const features: GeoJSON.Feature[] = buildings.map((b) => {
        const ring: [number, number][] = [];
        for (let i = 0; i < b.coords.length; i += 2) {
          ring.push([b.coords[i], b.coords[i + 1]]);
        }
        return {
          type: 'Feature' as const,
          properties: {
            height: b.height,
            color: b.color,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ring],
          },
        };
      });

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features,
      };

      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
        map.addLayer({
          id: LAYER_ID,
          type: 'fill-extrusion',
          source: SOURCE_ID,
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.7,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.on('load', apply);
    }

    return () => {
      map.off('load', apply);
    };
  }, [buildings, enabled, mapRef, renderer, activeTab]);
}
