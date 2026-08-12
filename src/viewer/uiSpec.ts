/**
 * UI-spec renderer (React port of ui-spec-renderer.js).
 *
 * Besides `viewer_cmd` events, the GeoLang agent emits `ui_spec` events for
 * analysis results — a declarative map spec whose layers reference output files
 * (GPKG/SHP/GeoJSON). We fetch each via the agent's `/geojson/<file>` endpoint
 * (which converts to GeoJSON) and render it on the Cesium globe.
 */
import { notifications } from '@mantine/notifications';
import { applySymbology, suggestSymbology } from '../features/symbology/symbology';
import { authHeaders } from '../lib/apiAuth';
import { useAppStore } from '../store/app';
import { useAgentLayerStore, type AgentLayer } from '../store/agentLayers';

const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export interface UiSpecLayer {
  name?: string;
  file?: string;
  path?: string;
  color?: string;
  /**
   * Column the tool that wrote the file says is worth colouring by. The layer
   * is shaded by it on arrival, and the symbology editor can change or drop it
   * like any other.
   */
  shade_by?: string;
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
  let unauthorized = 0;
  let failed = 0;

  for (let i = 0; i < specLayers.length; i++) {
    const layer = specLayers[i];
    // the spec's path is relative ("outputs/x.gpkg"), the endpoint takes the
    // basename; the layer keeps the path so the panel can offer a download
    const source = layer.file || layer.path || '';
    const file = source.split('/').pop();
    if (!file) continue;
    const color = layer.color || LAYER_COLORS[i % LAYER_COLORS.length];

    try {
      const res = await fetch(`/agent/geojson/${file}`, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) unauthorized++;
        else failed++;
        continue;
      }
      const geojson = (await res.json()) as GeoJSON.FeatureCollection;
      const agentLayer: AgentLayer = {
        id: `${i}-${file}`,
        name: layer.name || file,
        color,
        geojson,
        path: source,
      };
      const suggested = layer.shade_by ? suggestSymbology(agentLayer, layer.shade_by) : null;
      loaded.push(suggested ? applySymbology(agentLayer, suggested) : agentLayer);
    } catch (e) {
      failed++;
      console.error('renderUISpec: failed to load layer', layer, e);
    }
  }

  // a silently empty map reads as "history is broken", so name the reason
  if (unauthorized) {
    notifications.show({
      title: 'Sign in required',
      message: 'Sign in to load analysis layers.',
      color: 'yellow',
    });
  } else if (failed) {
    notifications.show({
      title: 'Layers failed to load',
      message: `Could not load ${failed} layer${failed === 1 ? '' : 's'}.`,
      color: 'red',
    });
  }

  useAgentLayerStore.getState().setLayers(loaded);
}
