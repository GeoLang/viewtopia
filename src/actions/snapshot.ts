/**
 * What the model is told the viewer is showing. Built fresh for every chat
 * message and sent as the AG-UI run state, so a prompt like "hide the second
 * layer" has ids and names to work from.
 */
import {
  useScenarioCompareStore,
  type ComparedBranches,
  type CoveragePair,
} from '../features/scenario/compare';
import { getSharedCamera, type SharedCamera } from '../hooks/sharedCamera';
import { useAssetStateStore } from '../live/assetState';
import { useLiveStore } from '../live/liveStore';
import { ASSET_RULE_ID, type AssetRule } from '../live/types';
import { useProjectsStore } from '../projects/projectsStore';
import { useAppStore, type Basemap, type Renderer, type ViewerTab } from '../store/app';
import { useFeaturePickerStore } from '../store/featurePicker';
import { paneLayout, useSplitViewStore, type SplitLayout } from '../store/splitView';
import { listViewerLayers, type ViewerLayer } from './layerIndex';

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
  scenario: { compared: ComparedBranches; coverage: CoveragePair | null } | null;
}

function pickedFeatureProperties(): Record<string, string> | null {
  const selected = useFeaturePickerStore.getState().selected;
  if (!selected) return null;
  return Object.fromEntries(selected.map((property) => [property.id, property.value]));
}

function scenarioInProgress(): ViewerSnapshot['scenario'] {
  const { compared, coverage } = useScenarioCompareStore.getState();
  return compared ? { compared, coverage } : null;
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
    scenario: scenarioInProgress(),
  };
}

declare global {
  interface Window {
    // exposed for e2e/debug so tests can read what the model would be told
    __viewtopiaSnapshot?: () => ViewerSnapshot;
  }
}

window.__viewtopiaSnapshot = buildViewerSnapshot;
