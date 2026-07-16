import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { useAppStore } from '../store/app';

const SOURCE_ID = 'spacetime-tracks';
const LINE_LAYER_ID = 'spacetime-tracks-line';
const POINT_LAYER_ID = 'spacetime-tracks-points';

/**
 * Renders spacetime tracks as GeoJSON lines + points on a MapLibre map.
 */
export function useSpaceTimeTracks(
  mapRef: MutableRefObject<maplibregl.Map | null>,
) {
  const tracks = useSpaceTimeStore((s) => s.tracks);
  const entities = useSpaceTimeStore((s) => s.entities);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyTracks = () => {
      // Build GeoJSON FeatureCollection of LineStrings + Points
      const lineFeatures: GeoJSON.Feature[] = [];
      const pointFeatures: GeoJSON.Feature[] = [];

      for (const track of tracks) {
        if (track.events.length < 1) continue;
        const entity = entities.get(track.entityId);
        const color = entity?.color ?? '#a78bfa';
        const name = entity?.name ?? track.entityId;

        // LineString from all events
        if (track.events.length >= 2) {
          lineFeatures.push({
            type: 'Feature',
            properties: { color, name },
            geometry: {
              type: 'LineString',
              coordinates: track.events.map((e) => [e.lng, e.lat]),
            },
          });
        }

        // Points for each event
        for (const ev of track.events) {
          pointFeatures.push({
            type: 'Feature',
            properties: { color, name },
            geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
          });
        }
      }

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [...lineFeatures, ...pointFeatures],
      };

      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.8,
          },
        });
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 4,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        });
      }
    };

    // If map is already loaded, apply immediately; otherwise wait for load
    if (map.isStyleLoaded()) {
      applyTracks();
    } else {
      map.on('load', applyTracks);
    }

    return () => {
      map.off('load', applyTracks);
    };
    // renderer/activeTab: a switch rebuilds the map, so the tracks must be
    // redrawn onto the new one.
  }, [tracks, entities, mapRef, renderer, activeTab]);
}
