/**
 * Agent viewer-command dispatcher (React port of viewer-commands.js).
 *
 * The GeoLang agent streams `viewer_cmd` SSE events of shape
 * `{ action, params }`. executeViewerCommand runs the matching handler against
 * the live renderer (via the registry) and/or the app store.
 *
 * Covers navigation / marker / geojson / tileset / tab / renderer commands, the
 * deck.gl visualization layers (add_heatmap, add_hexbin, add_arcs, add_scatter,
 * add_screengrid), 3D-tiles styling (style_by_*), and tool-panel commands
 * (measure, annotate, analysis, weather, …) which open the matching panel.
 */
import {
  Cartesian3,
  Cartesian2,
  Color,
  Math as CesiumMath,
  VerticalOrigin,
  GeoJsonDataSource,
  Cesium3DTileset,
} from 'cesium';
import { HeatmapLayer, HexagonLayer, ScreenGridLayer } from '@deck.gl/aggregation-layers';
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { getActiveCesiumViewer } from './registry';
import { useAppStore, type Renderer, type ViewerTab, type ToolPanel } from '../store/app';
import { useDeckLayersStore } from '../hooks/deckLayers';
import { colorByHeight, colorByClassification, colorByProperty } from './tileStyles';
import { useMeasureStore, type MeasureMode } from '../store/measure';

export interface ViewerCommand {
  action: string;
  params?: Record<string, unknown>;
}

type Handler = (params: Record<string, unknown>) => void | Promise<void>;

const num = (v: unknown, dflt = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** Coerce a data point to [lng, lat] from [lng,lat] | {position} | {lon/lng,lat}. */
function toPosition(d: unknown): [number, number] {
  if (Array.isArray(d)) return [num(d[0]), num(d[1])];
  const o = d as Record<string, unknown>;
  if (Array.isArray(o?.position)) return [num(o.position[0]), num(o.position[1])];
  return [num(o?.lon ?? o?.lng), num(o?.lat)];
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Agent-added deck layers accumulate in a dedicated registry group.
let agentLayers: Layer[] = [];

/** Add a deck layer from the agent, and make sure the deck.gl renderer is showing. */
function addAgentDeckLayer(layer: Layer): void {
  agentLayers = [...agentLayers, layer];
  useDeckLayersStore.getState().setGroup('agent', agentLayers);
  const store = useAppStore.getState();
  store.setActiveTab('globe');
  store.setRenderer('deckgl');
}

const handlers: Record<string, Handler> = {
  fly_to: (p) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(num(p.lon), num(p.lat), num(p.height, 1000)),
      duration: num(p.duration, 2),
    });
  },

  set_view: (p) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(num(p.lon), num(p.lat), num(p.height, 5000)),
      orientation: {
        heading: CesiumMath.toRadians(num(p.heading, 0)),
        pitch: CesiumMath.toRadians(num(p.pitch, -45)),
        roll: CesiumMath.toRadians(num(p.roll, 0)),
      },
    });
  },

  add_marker: (p) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const label = typeof p.label === 'string' ? p.label : undefined;
    const color = typeof p.color === 'string' ? p.color : '#ff0000';
    viewer.entities.add({
      position: Cartesian3.fromDegrees(num(p.lon), num(p.lat)),
      point: { pixelSize: 10, color: Color.fromCssColorString(color) },
      label: label
        ? {
            text: label,
            font: '14px sans-serif',
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -12),
          }
        : undefined,
    });
  },

  clear_entities: () => {
    const viewer = getActiveCesiumViewer();
    if (viewer) viewer.entities.removeAll();
  },

  add_geojson: async (p) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const color = typeof p.color === 'string' ? p.color : '#3388ff';
    let data: unknown = p.geojson;
    if (!data && typeof p.url === 'string') {
      try {
        const res = await fetch(p.url);
        if (res.ok) data = await res.json();
      } catch (e) {
        console.error('add_geojson: failed to fetch', e);
        return;
      }
    }
    if (!data) return;
    try {
      const ds = await GeoJsonDataSource.load(data as object, {
        stroke: Color.fromCssColorString(color),
        fill: Color.fromCssColorString(color).withAlpha(0.4),
        strokeWidth: 2,
      });
      await viewer.dataSources.add(ds);
      await viewer.flyTo(ds);
    } catch (e) {
      console.error('add_geojson: failed to render', e);
    }
  },

  load_tileset: async (p) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer || typeof p.url !== 'string') return;
    try {
      const tileset = await Cesium3DTileset.fromUrl(p.url);
      viewer.scene.primitives.add(tileset);
      await viewer.flyTo(tileset);
    } catch (e) {
      console.error('load_tileset: failed', e);
    }
  },

  screenshot: () => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    viewer.render();
    viewer.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'viewtopia-screenshot.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  },

  switch_tab: (p) => {
    const tab = p.tab;
    if (tab === 'globe' || tab === 'map') {
      useAppStore.getState().setActiveTab(tab as ViewerTab);
    }
  },

  switch_renderer: (p) => {
    const r = p.renderer;
    if (r === 'cesium' || r === 'deckgl' || r === 'maplibre') {
      useAppStore.getState().setRenderer(r as Renderer);
    }
  },

  // ─── deck.gl visualization layers ───────────────────────────────────────
  add_heatmap: (p) => {
    addAgentDeckLayer(
      new HeatmapLayer({
        id: `agent-heatmap-${Date.now()}`,
        data: asArray(p.data),
        getPosition: toPosition,
        getWeight: (d: unknown) => num((d as Record<string, unknown>)?.weight, 1),
        radiusPixels: num(p.radius, 30),
        intensity: num(p.intensity, 1),
      }),
    );
  },

  add_hexbin: (p) => {
    addAgentDeckLayer(
      new HexagonLayer({
        id: `agent-hexbin-${Date.now()}`,
        data: asArray(p.data),
        getPosition: toPosition,
        radius: num(p.radius, 200),
        elevationScale: num(p.elevationScale, 20),
        extruded: p.extruded !== false,
        pickable: true,
      }),
    );
  },

  add_arcs: (p) => {
    addAgentDeckLayer(
      new ArcLayer({
        id: `agent-arcs-${Date.now()}`,
        data: asArray(p.data),
        getSourcePosition: (d: unknown) =>
          toPosition((d as Record<string, unknown>)?.source ?? (d as Record<string, unknown>)?.from),
        getTargetPosition: (d: unknown) =>
          toPosition((d as Record<string, unknown>)?.target ?? (d as Record<string, unknown>)?.to),
        getSourceColor: [0, 200, 255],
        getTargetColor: [255, 0, 128],
        getWidth: num(p.width, 2),
      }),
    );
  },

  add_scatter: (p) => {
    const color = typeof p.color === 'string' ? Color.fromCssColorString(p.color) : null;
    addAgentDeckLayer(
      new ScatterplotLayer({
        id: `agent-scatter-${Date.now()}`,
        data: asArray(p.data),
        getPosition: toPosition,
        getRadius: num(p.radius, 50),
        radiusUnits: 'meters',
        getFillColor: color
          ? [color.red * 255, color.green * 255, color.blue * 255, 200]
          : [167, 139, 250, 200],
        pickable: true,
      }),
    );
  },

  add_screengrid: (p) => {
    addAgentDeckLayer(
      new ScreenGridLayer({
        id: `agent-screengrid-${Date.now()}`,
        data: asArray(p.data),
        getPosition: toPosition,
        getWeight: (d: unknown) => num((d as Record<string, unknown>)?.weight, 1),
        cellSizePixels: num(p.cellSize, 40),
      }),
    );
  },

  // ─── 3D-tiles styling (reuse the Style Editor helpers) ──────────────────
  style_by_height: () => {
    colorByHeight();
  },
  style_by_classification: () => {
    colorByClassification();
  },
  style_by_property: (p) => {
    if (typeof p.property === 'string') colorByProperty(p.property);
  },

  // ─── measurement ────────────────────────────────────────────────────────
  measure_distance: () => startMeasure('distance'),
  measure_area: () => startMeasure('area'),
  measure_height: () => startMeasure('elevation'),
};

/** Open a measurement mode and its panel. */
function startMeasure(mode: MeasureMode): void {
  useMeasureStore.getState().setMode(mode);
  useAppStore.getState().setActivePanel('measure');
}

// Commands that simply open the matching React tool panel. Mirrors the vanilla
// behaviour where these opened/triggered the corresponding tool.
const PANEL_COMMANDS: Record<string, ToolPanel> = {
  annotate: 'annotate',
  terrain_profile: 'terrainProfile',
  show_timeline: 'timeline',
  split_view: 'splitView',
  viewshed: 'viewshed',
  volume: 'volume',
  slope_map: 'terrainAnalysis',
  aspect_map: 'terrainAnalysis',
  contour_lines: 'terrainAnalysis',
  shadow_analysis: 'shadows',
  classify: 'classification',
  classify_pointcloud: 'classification',
  compare_pointclouds: 'pointCloudCompare',
  load_google_3d: 'google3d',
  import_model: 'modelImport',
  weather: 'weather',
  traffic: 'traffic',
  flood: 'flood',
  save_bookmark: 'bookmark',
  play_story: 'stories',
  sql_query: 'dataTable',
};

for (const [action, panel] of Object.entries(PANEL_COMMANDS)) {
  handlers[action] = () => useAppStore.getState().setActivePanel(panel);
}

export function executeViewerCommand(cmd: ViewerCommand): void {
  const handler = handlers[cmd.action];
  if (!handler) {
    console.warn(`Unported viewer command: ${cmd.action}`);
    return;
  }
  void handler(cmd.params ?? {});
}
