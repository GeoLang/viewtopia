/**
 * What the model is told the viewer is showing. Built fresh for every chat
 * message and sent as the AG-UI run state, so a prompt like "hide the second
 * layer" has ids and names to work from.
 */
import { getSharedCamera, type SharedCamera } from '../hooks/sharedCamera';
import { useAssetStateStore } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ASSET_RULE_ID, type AssetRule } from '../live/types';
import { useProjectsStore } from '../projects/projectsStore';
import { useAgentLayerStore } from '../store/agentLayers';
import { useAppStore, type Basemap, type Renderer, type ViewerTab } from '../store/app';
import { useFeaturePickerStore } from '../store/featurePicker';
import { useOgcLayerStore } from '../store/ogcLayers';
import { paneLayout, useSplitViewStore, type SplitLayout } from '../store/splitView';
import { useTiles3dLayerStore } from '../store/tiles3dLayers';

/** Which store a layer came from, so an action can address it again. */
export type ViewerLayerKind = 'map' | 'agent' | 'raster' | 'ogc' | 'tiles3d';

export interface ViewerLayer {
  id: string;
  name: string;
  kind: ViewerLayerKind;
  visible: boolean;
  opacity?: number;
}

/** More than this and the state costs more prompt than it is worth. */
export const MAXIMUM_SNAPSHOT_LAYERS = 50;

export interface ViewerSnapshot {
  mode: 'chat' | 'full';
  camera: SharedCamera;
  renderer: Renderer;
  tab: ViewerTab;
  basemap: Basemap;
  splitView: { active: boolean; layout: SplitLayout };
  layers: ViewerLayer[];
  project: { id: string; name: string } | null;
  live: { documentId: string; name: string } | null;
  assetRule: AssetRule | null;
  historyAt: string | null;
  pickedFeature: Record<string, string> | null;
  scenario: null;
}

/** Every layer on the map, whichever store holds it, in drawing order. */
export function listViewerLayers(): ViewerLayer[] {
  const app = useAppStore.getState();
  const agent = useAgentLayerStore.getState();
  const ogc = useOgcLayerStore.getState();
  const tiles3d = useTiles3dLayerStore.getState();
  return [
    ...app.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: 'map' as const,
      visible: layer.visible,
      opacity: layer.opacity,
    })),
    ...agent.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: 'agent' as const,
      visible: layer.visible !== false,
      ...(typeof layer.style?.opacity === 'number' ? { opacity: layer.style.opacity } : {}),
    })),
    ...agent.rasterLayers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: 'raster' as const,
      visible: layer.visible,
      opacity: layer.opacity,
    })),
    ...ogc.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: 'ogc' as const,
      visible: layer.visible !== false,
      ...(typeof layer.opacity === 'number' ? { opacity: layer.opacity } : {}),
    })),
    ...tiles3d.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: 'tiles3d' as const,
      visible: layer.visible,
    })),
  ];
}

function pickedFeatureProperties(): Record<string, string> | null {
  const selected = useFeaturePickerStore.getState().selected;
  if (!selected) return null;
  return Object.fromEntries(selected.map((property) => [property.id, property.value]));
}

export function buildViewerSnapshot(): ViewerSnapshot {
  const app = useAppStore.getState();
  const split = useSplitViewStore.getState();
  const live = useLiveStore.getState();
  const project = useProjectsStore.getState().getActive();
  return {
    mode: app.chatMode ? 'chat' : 'full',
    camera: getSharedCamera(),
    renderer: app.renderer,
    tab: app.activeTab,
    basemap: app.basemap,
    splitView: {
      active: split.active,
      layout: paneLayout(split.comparePanes.length + 1),
    },
    layers: listViewerLayers().slice(0, MAXIMUM_SNAPSHOT_LAYERS),
    project: project ? { id: project.id, name: project.name } : null,
    live: live.documentId ? { documentId: live.documentId, name: live.document.meta.name } : null,
    assetRule: live.document.assets[ASSET_RULE_ID] ?? null,
    historyAt: useAssetStateStore.getState().historyAt,
    pickedFeature: pickedFeatureProperties(),
    scenario: null,
  };
}

declare global {
  interface Window {
    // exposed for e2e/debug so tests can read what the model would be told
    __viewtopiaSnapshot?: () => ViewerSnapshot;
  }
}

window.__viewtopiaSnapshot = buildViewerSnapshot;
