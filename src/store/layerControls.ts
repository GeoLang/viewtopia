import { useAgentLayerStore } from './agentLayers';
import { useAppStore } from './app';
import { useOgcLayerStore } from './ogcLayers';

/**
 * One id can sit both in the layer list and in the store a renderer draws from
 * (a plugin layer, an OGC service, anything in a live document). Writing one of
 * them changes the layer in the list and leaves it as it was on the map, so
 * every switch and slider goes through here. Each store ignores an id it does
 * not hold.
 */
export function setLayerVisible(id: string, visible: boolean): void {
  useAppStore.getState().setLayerVisible(id, visible);
  useAgentLayerStore.getState().setLayerVisible(id, visible);
  useOgcLayerStore.getState().setLayerVisible(id, visible);
}

// an agent layer's opacity is the fill opacity of its features, which is a
// different number and has its own slider
export function setLayerOpacity(id: string, opacity: number): void {
  useAppStore.getState().setLayerOpacity(id, opacity);
  useOgcLayerStore.getState().setLayerOpacity(id, opacity);
}
