/**
 * One list of everything on screen, across the stores that draw layers. The
 * chat resolves a layer name against this list and the state snapshot sends it.
 */

import { layerStyle, useAgentLayerStore } from '../store/agentLayers';
import { useAppStore } from '../store/app';
import { ogcLayerOpacity, ogcLayerVisible, useOgcLayerStore } from '../store/ogcLayers';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';

export type ViewerLayerKind = 'map' | 'agent' | 'raster' | 'ogc' | 'tiles3d';

export interface ViewerLayer {
  id: string;
  name: string;
  kind: ViewerLayerKind;
  visible: boolean;
  /** unset for a kind that draws at one opacity only */
  opacity?: number;
}

/**
 * Every layer, listed once. addGeoJsonLayer puts one id in both the app store
 * and the store the renderers draw from, and the drawing store is the one that
 * reports it, the way the layer panel lists it.
 */
export function listViewerLayers(): ViewerLayer[] {
  const listed: ViewerLayer[] = [];
  const seen = new Set<string>();
  const add = (layer: ViewerLayer) => {
    if (seen.has(layer.id)) return;
    seen.add(layer.id);
    listed.push(layer);
  };

  const agent = useAgentLayerStore.getState();
  for (const layer of agent.layers) {
    add({
      id: layer.id,
      name: layer.name,
      kind: 'agent',
      visible: layer.visible !== false,
      opacity: layerStyle(layer).opacity,
    });
  }
  for (const layer of agent.rasterLayers) {
    add({
      id: layer.id,
      name: layer.name,
      kind: 'raster',
      visible: layer.visible,
      opacity: layer.opacity,
    });
  }
  for (const layer of useOgcLayerStore.getState().layers) {
    add({
      id: layer.id,
      name: layer.name,
      kind: 'ogc',
      visible: ogcLayerVisible(layer),
      opacity: ogcLayerOpacity(layer),
    });
  }
  for (const layer of useTiles3dLayerStore.getState().layers) {
    add({ id: layer.id, name: layer.name, kind: 'tiles3d', visible: layer.visible });
  }
  for (const layer of useAppStore.getState().layers) {
    add({
      id: layer.id,
      name: layer.name,
      kind: 'map',
      visible: layer.visible,
      opacity: layer.opacity,
    });
  }
  return listed;
}
