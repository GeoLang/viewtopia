import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { useFeaturePickerStore, propsToRows, toRow } from '../store/featurePicker';
import { getActiveDeck } from '../viewer/registry';

const AGENT_PREFIX = 'agent-layer-';

/** Agent points draw at a 5px radius; querying a bare point makes them near-unclickable. */
const PICK_TOLERANCE = 8;

const pickBox = (p: maplibregl.Point): [maplibregl.PointLike, maplibregl.PointLike] => [
  [p.x - PICK_TOLERANCE, p.y - PICK_TOLERANCE],
  [p.x + PICK_TOLERANCE, p.y + PICK_TOLERANCE],
];

/**
 * Properties of the deck overlay's topmost layer at a point, or null. Deck
 * layers are custom style layers, so queryRenderedFeatures never sees them.
 */
function pickDeckProps(p: maplibregl.Point): Record<string, unknown> | null {
  const deck = getActiveDeck();
  if (!deck?.isInitialized) return null;
  const info = deck.pickObject({ x: p.x, y: p.y, radius: PICK_TOLERANCE });
  const props = (info?.object as { properties?: Record<string, unknown> } | undefined)
    ?.properties;
  return props ?? null;
}

/**
 * MapLibre binding for the feature picker. While the picker is enabled, a left
 * click reads the clicked feature's properties into the store, preferring the
 * agent's layers over basemap fill so clicking a result doesn't select the road
 * underneath it. Deck overlay layers sit on the same map and the same click, so
 * they are picked here too rather than through a second handler.
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
      const over =
        map.queryRenderedFeatures(pickBox(e.point)).length > 0 ||
        pickDeckProps(e.point) !== null;
      canvas.style.cursor = over ? 'pointer' : '';
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!useFeaturePickerStore.getState().enabled) return;

      // A deck layer draws over the basemap, so it answers the click first
      const deckProps = pickDeckProps(e.point);
      if (deckProps) {
        useFeaturePickerStore.getState().setSelected(propsToRows(deckProps));
        return;
      }

      const hits = map.queryRenderedFeatures(pickBox(e.point));
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
