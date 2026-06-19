/**
 * Agent viewer-command dispatcher (React port of viewer-commands.js).
 *
 * The GeoLang agent streams `viewer_cmd` SSE events of shape
 * `{ action, params }`. executeViewerCommand runs the matching handler against
 * the live renderer (via the registry) and/or the app store.
 *
 * NOTE: this ports the navigation / marker / geojson / tileset / tab / renderer
 * commands. Deck-layer and analysis commands (add_heatmap, slope_map, …) are
 * not yet ported — see DESIGN_TODO Track 2.
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
import { getActiveCesiumViewer } from './registry';
import { useAppStore, type Renderer, type ViewerTab } from '../store/app';

export interface ViewerCommand {
  action: string;
  params?: Record<string, unknown>;
}

type Handler = (params: Record<string, unknown>) => void | Promise<void>;

const num = (v: unknown, dflt = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

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
};

export function executeViewerCommand(cmd: ViewerCommand): void {
  const handler = handlers[cmd.action];
  if (!handler) {
    console.warn(`Unported viewer command: ${cmd.action}`);
    return;
  }
  void handler(cmd.params ?? {});
}
