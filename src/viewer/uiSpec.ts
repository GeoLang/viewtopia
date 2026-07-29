/**
 * UI-spec renderer (React port of ui-spec-renderer.js).
 *
 * Besides `viewer_cmd` events, the GeoLang agent emits `ui_spec` events for
 * analysis results — a declarative map spec whose layers reference output files
 * (GPKG/SHP/GeoJSON). We fetch each via the agent's `/geojson/<file>` endpoint
 * (which converts to GeoJSON) and render it on the Cesium globe.
 */
import { useAppStore } from '../store/app';
import { useAgentLayerStore, type AgentLayer } from '../store/agentLayers';

const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export interface UiSpecLayer {
  name?: string;
  file?: string;
  path?: string;
  color?: string;
}

export interface UiSpec {
  type?: string;
  ui_type?: string;
  layers?: UiSpecLayer[];
  center?: [number, number];
  zoom?: number;
}

/**
 * Fetch a map ui_spec's layers and hand them to the agent-layer store. The
 * per-renderer hooks (useAgentLayers*) draw whatever is in the store, so the
 * result survives a renderer switch and can be replayed from chat history.
 */
export async function renderUISpec(spec: UiSpec): Promise<void> {
  if (!spec || (spec.type !== 'map' && spec.ui_type !== 'map')) return;

  // The agent's map output is a globe layer set. Every globe renderer draws from
  // the agent-layer store, so whichever one is active is left alone.
  const store = useAppStore.getState();
  if (store.activeTab !== 'globe') store.setActiveTab('globe');

  const specLayers = spec.layers ?? [];
  const loaded: AgentLayer[] = [];

  for (let i = 0; i < specLayers.length; i++) {
    const layer = specLayers[i];
    // the spec's path is relative ("outputs/x.gpkg"), the endpoint takes the
    // basename; the layer keeps the path so the panel can offer a download
    const source = layer.file || layer.path || '';
    const file = source.split('/').pop();
    if (!file) continue;
    const color = layer.color || LAYER_COLORS[i % LAYER_COLORS.length];

    try {
      const res = await fetch(`/agent/geojson/${file}`);
      if (!res.ok) continue;
      const geojson = (await res.json()) as GeoJSON.FeatureCollection;
      loaded.push({ id: `${i}-${file}`, name: layer.name || file, color, geojson, path: source });
    } catch (e) {
      console.error('renderUISpec: failed to load layer', layer, e);
    }
  }

  useAgentLayerStore.getState().setLayers(loaded);
}
