/**
 * UI-spec renderer (React port of ui-spec-renderer.js).
 *
 * Besides `viewer_cmd` events, the GeoLang agent emits `ui_spec` events for
 * analysis results — a declarative map spec whose layers reference output files
 * (GPKG/SHP/GeoJSON). We fetch each via the agent's `/geojson/<file>` endpoint
 * (which converts to GeoJSON) and render it on the Cesium globe.
 */
import { Color, GeoJsonDataSource } from 'cesium';
import { getActiveCesiumViewer } from './registry';
import { useAppStore } from '../store/app';

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

// Names of the Cesium data sources added for the last ui_spec, so we can clear them.
let lastDataSourceNames: string[] = [];

/** Render a map ui_spec from the agent onto the Cesium globe. */
export async function renderUISpec(spec: UiSpec): Promise<void> {
  if (!spec || (spec.type !== 'map' && spec.ui_type !== 'map')) return;

  // The agent's map output is a globe layer set — make sure Cesium is active.
  const store = useAppStore.getState();
  if (store.activeTab !== 'globe' || store.renderer !== 'cesium') {
    store.setActiveTab('globe');
    store.setRenderer('cesium');
  }

  const viewer = getActiveCesiumViewer();
  if (!viewer) return; // renderer still spinning up; user can re-issue

  // Clear the previous ui_spec's layers.
  for (const name of lastDataSourceNames) {
    for (const ds of viewer.dataSources.getByName(name)) {
      viewer.dataSources.remove(ds);
    }
  }
  lastDataSourceNames = [];

  const layers = spec.layers ?? [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const file = (layer.file || layer.path || '').split('/').pop();
    if (!file) continue;
    const color = layer.color || LAYER_COLORS[i % LAYER_COLORS.length];

    try {
      const res = await fetch(`/agent/geojson/${file}`);
      if (!res.ok) continue;
      const geojson = await res.json();

      const name = `agent-uispec-${i}-${Date.now()}`;
      const ds = await GeoJsonDataSource.load(geojson, {
        stroke: Color.fromCssColorString(color),
        fill: Color.fromCssColorString(color).withAlpha(0.3),
        strokeWidth: 2,
        markerColor: Color.fromCssColorString(color),
      });
      ds.name = name;
      await viewer.dataSources.add(ds);
      lastDataSourceNames.push(name);

      // Frame the final layer.
      if (i === layers.length - 1) {
        await viewer.flyTo(ds).catch(() => undefined);
      }
    } catch (e) {
      console.error('renderUISpec: failed to render layer', layer, e);
    }
  }
}
