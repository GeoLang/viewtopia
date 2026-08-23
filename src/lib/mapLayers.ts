// Put a GeoJSON layer on the map from anywhere: a panel, a plugin, the agent.
// Two stores have to agree. The app store entry is the LayerManager list, the
// agent layer is what the three renderers draw.

import { useAppStore } from '../store/app';
import { useAgentLayerStore, toFeatureCollection } from '../store/agentLayers';
import type { LayerOptions } from '../plugins/sdk';

const DEFAULT_LAYER_COLOR = '#3388ff';

export function addGeoJsonLayer(id: string, geojson: object, options?: LayerOptions): void {
  const collection = toFeatureCollection(geojson);
  if (!collection) return;
  useAppStore.getState().addLayer({
    id,
    name: id,
    type: 'geojson',
    visible: true,
    opacity: options?.opacity ?? 1,
  });
  useAgentLayerStore.getState().addLayer({
    id,
    name: id,
    color: options?.color ?? DEFAULT_LAYER_COLOR,
    geojson: collection,
    style: {
      opacity: options?.opacity,
      lineWidth: options?.lineWidth,
      filled: options?.filled,
      stroked: options?.stroked,
    },
  });
}

export function removeGeoJsonLayer(id: string): void {
  useAppStore.getState().removeLayer(id);
  useAgentLayerStore.getState().removeLayer(id);
}
