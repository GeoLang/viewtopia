import { useAgentLayerStore } from './agentLayers';
import { useAppStore } from './app';

/**
 * One id can sit both in the layer list and in the store a renderer draws from
 * (a plugin layer, anything in a live document). Writing one of them switches
 * the layer off in the list and leaves it on the map, so every switch goes
 * through here. Each store ignores an id it does not hold.
 */
export function setLayerVisible(id: string, visible: boolean): void {
  useAppStore.getState().setLayerVisible(id, visible);
  useAgentLayerStore.getState().setLayerVisible(id, visible);
}
