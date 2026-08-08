import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CameraState } from './cameraViews';
import type { Basemap, CustomBasemap } from '../hooks/basemapTiles';

export type ViewerTab = 'globe' | 'map';
export type Renderer = 'cesium' | 'maplibre';
export type { Basemap, CustomBasemap };

/**
 * Read a renderer from persisted state, a share link or an agent command.
 * 'deckgl' was a standalone renderer whose layers now draw on the MapLibre map,
 * so old links and localStorage land there. null when the value is not a renderer.
 */
export function asRenderer(value: unknown): Renderer | null {
  if (value === 'deckgl') return 'maplibre';
  return value === 'cesium' || value === 'maplibre' ? value : null;
}
export type ToolPanel =
  | null
  | 'measure'
  | 'geocoding'
  | 'bookmark'
  | 'routing'
  | 'draw'
  | 'annotate'
  | 'geofence'
  | 'layers'
  | 'legend'
  | 'ogc'
  | 'import'
  | 'project'
  | 'sqlWorkspace'
  | 'clipping'
  | 'crossSection'
  | 'heatmap'
  | 'timelapse'
  | 'weather'
  | 'flood'
  | 'wind'
  | 'lighting'
  | 'solar'
  | 'traffic'
  | 'photo'
  | 'offline'
  | 'indoor'
  | 'drone'
  | 'accessibility'
  | 'export3d'
  | 'flythrough'
  | 'shadows'
  | 'viewshed'
  | 'volume'
  | 'terrainAnalysis'
  | 'terrainProfile'
  | 'spatialStats'
  | 'charts'
  | 'splitView'
  | 'stories'
  | 'collaboration'
  | 'timeline'
  | 'dataTable'
  | 'tour'
  | 'shareLink'
  | 'settings'
  | 'assets'
  | 'buildings'
  | 'modelImport'
  | 'trackImport'
  | 'cesiumIon'
  | 'google3d'
  | 'globalTerrain'
  | 'vectorTiles'
  | 'rasterViewer'
  | 'toolbox'
  | 'convert'
  | 'featurePicker'
  | 'geojsonEditor'
  | 'styleEditor'
  | 'portal'
  | 'dashboards'
  | 'printExport';

export interface LayerItem {
  id: string;
  name: string;
  type: 'raster' | 'vector' | 'tiles3d' | 'terrain' | 'geojson';
  visible: boolean;
  opacity: number;
}

export interface Bookmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  heading?: number;
  pitch?: number;
  // full camera state when saved from a live viewer (BookmarkPanel)
  camera?: CameraState;
  createdAt: number;
}

interface Settings {
  showMinimap: boolean;
  showCoordReadout: boolean;
  /** reveal unfinished preview tools in the toolbar menus */
  showPreviewTools: boolean;
  defaultRenderer: Renderer;
  defaultBasemap: Basemap;
  /** MapLibre style JSON or .pmtiles URL for the 'selfhosted' basemap */
  selfHostedBasemapUrl: string;
  probeIntervalSec: number;
  tiletopiaUrl: string;
  geolangUrl: string;
  livekitUrl: string;
  /** Cesium Ion access token, used for both the asset REST API and Ion.defaultAccessToken */
  cesiumIonToken: string;
  googleMapsApiKey: string;
}

interface AppState {
  // Layout
  navOpened: boolean;
  toggleNav: () => void;
  asideWidth: number;
  setAsideWidth: (w: number) => void;
  /** presentation mode: every piece of chrome hidden, only the map (Ctrl+.) */
  uiHidden: boolean;
  toggleUiHidden: () => void;

  // Viewer
  activeTab: ViewerTab;
  setActiveTab: (tab: ViewerTab) => void;
  renderer: Renderer;
  setRenderer: (r: Renderer) => void;
  basemap: Basemap;
  setBasemap: (b: Basemap) => void;
  /** tiles behind basemap 'custom', set by the basemap catalog plugin */
  customBasemap: CustomBasemap | null;
  setCustomBasemap: (bm: CustomBasemap) => void;

  // Tool panels
  activePanel: ToolPanel;
  setActivePanel: (p: ToolPanel) => void;
  togglePanel: (p: ToolPanel) => void;

  // Backends
  tiletopiaOnline: boolean;
  geolangOnline: boolean;
  setBackendStatus: (tt: boolean, gl: boolean) => void;

  // Layers
  layers: LayerItem[];
  addLayer: (layer: LayerItem) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  reorderLayers: (from: number, to: number) => void;

  // Bookmarks
  bookmarks: Bookmark[];
  addBookmark: (bm: Bookmark) => void;
  removeBookmark: (id: string) => void;

  // Coord readout
  cursorCoords: { lat: number; lng: number; elevation?: number } | null;
  setCursorCoords: (c: { lat: number; lng: number; elevation?: number } | null) => void;

  // Context menu
  contextMenu: { x: number; y: number; lat: number; lng: number } | null;
  showContextMenu: (ctx: { x: number; y: number; lat: number; lng: number }) => void;
  hideContextMenu: () => void;

  // Settings
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
}

const DEFAULT_SETTINGS: Settings = {
  showMinimap: false,
  showCoordReadout: true,
  showPreviewTools: false,
  defaultRenderer: 'maplibre',
  defaultBasemap: 'dark',
  selfHostedBasemapUrl: '',
  probeIntervalSec: 30,
  tiletopiaUrl: '/api/v1',
  geolangUrl: '/agent',
  livekitUrl: '',
  cesiumIonToken: '',
  googleMapsApiKey: '',
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      navOpened: false,
      toggleNav: () => set((s) => ({ navOpened: !s.navOpened })),
      asideWidth: 340,
      setAsideWidth: (asideWidth) => set({ asideWidth: Math.max(250, Math.min(700, asideWidth)) }),
      uiHidden: false,
      toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),

      activeTab: 'globe',
      setActiveTab: (tab) => set({ activeTab: tab }),
      renderer: 'maplibre',
      setRenderer: (renderer) => set({ renderer }),
      basemap: 'dark',
      setBasemap: (basemap) => set({ basemap }),
      customBasemap: null,
      setCustomBasemap: (customBasemap) => set({ customBasemap, basemap: 'custom' }),

      activePanel: null,
      setActivePanel: (activePanel) => set({ activePanel }),
      togglePanel: (p) => set((s) => ({ activePanel: s.activePanel === p ? null : p })),

      tiletopiaOnline: false,
      geolangOnline: false,
      setBackendStatus: (tiletopiaOnline, geolangOnline) =>
        set({ tiletopiaOnline, geolangOnline }),

      // Layers
      layers: [],
      addLayer: (layer) =>
        set((s) => ({
          layers: s.layers.some((l) => l.id === layer.id)
            ? s.layers.map((l) => (l.id === layer.id ? layer : l))
            : [...s.layers, layer],
        })),
      removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
      toggleLayerVisibility: (id) =>
        set((s) => ({
          layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
        })),
      setLayerOpacity: (id, opacity) =>
        set((s) => ({
          layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
        })),
      reorderLayers: (from, to) =>
        set((s) => {
          const layers = [...s.layers];
          const [item] = layers.splice(from, 1);
          layers.splice(to, 0, item);
          return { layers };
        }),

      // Bookmarks
      bookmarks: [],
      addBookmark: (bm) => set((s) => ({ bookmarks: [...s.bookmarks, bm] })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      // Coord readout
      cursorCoords: null,
      setCursorCoords: (cursorCoords) => set({ cursorCoords }),

      // Context menu
      contextMenu: null,
      showContextMenu: (contextMenu) => set({ contextMenu }),
      hideContextMenu: () => set({ contextMenu: null }),

      // Settings
      settings: DEFAULT_SETTINGS,
      updateSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),
    }),
    {
      name: 'viewtopia-app',
      partialize: (state) => ({
        basemap: state.basemap,
        // persisted with the basemap so a reload of 'custom' still has its tiles
        customBasemap: state.customBasemap,
        renderer: state.renderer,
        bookmarks: state.bookmarks,
        settings: state.settings,
        asideWidth: state.asideWidth,
      }),
      // deep-merge settings so a persisted object from an older build backfills
      // any settings key added since (a missing key would crash the panel), and
      // map a retired renderer name onto the one that took it over
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const settings = { ...current.settings, ...(p.settings ?? {}) };
        return {
          ...current,
          ...p,
          renderer: asRenderer(p.renderer) ?? current.renderer,
          settings: {
            ...settings,
            defaultRenderer:
              asRenderer(settings.defaultRenderer) ?? current.settings.defaultRenderer,
          },
        };
      },
    },
  ),
);
