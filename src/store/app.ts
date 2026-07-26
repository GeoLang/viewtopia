import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CameraState } from './cameraViews';
import type { Basemap } from '../hooks/basemapTiles';

export type ViewerTab = 'globe' | 'map';
export type Renderer = 'cesium' | 'deckgl' | 'maplibre';
export type { Basemap };
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
  | 'ogc'
  | 'import'
  | 'clipping'
  | 'crossSection'
  | 'heatmap'
  | 'timelapse'
  | 'weather'
  | 'flood'
  | 'wind'
  | 'lighting'
  | 'noise'
  | 'energy'
  | 'solar'
  | 'traffic'
  | 'photo'
  | 'offline'
  | 'indoor'
  | 'drone'
  | 'webxr'
  | 'accessibility'
  | 'export3d'
  | 'flythrough'
  | 'shadows'
  | 'viewshed'
  | 'volume'
  | 'pointCloudCompare'
  | 'terrainAnalysis'
  | 'terrainProfile'
  | 'spatialStats'
  | 'classification'
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
}

interface AppState {
  // Layout
  navOpened: boolean;
  toggleNav: () => void;
  asideWidth: number;
  setAsideWidth: (w: number) => void;
  splitViewActive: boolean;
  setSplitView: (v: boolean) => void;

  // Viewer
  activeTab: ViewerTab;
  setActiveTab: (tab: ViewerTab) => void;
  renderer: Renderer;
  setRenderer: (r: Renderer) => void;
  basemap: Basemap;
  setBasemap: (b: Basemap) => void;

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
  showMinimap: true,
  showCoordReadout: true,
  showPreviewTools: false,
  defaultRenderer: 'cesium',
  defaultBasemap: 'liberty',
  selfHostedBasemapUrl: '',
  probeIntervalSec: 30,
  tiletopiaUrl: '/api/v1',
  geolangUrl: '/agent',
  livekitUrl: '',
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      navOpened: true,
      toggleNav: () => set((s) => ({ navOpened: !s.navOpened })),
      asideWidth: 340,
      setAsideWidth: (asideWidth) => set({ asideWidth: Math.max(250, Math.min(700, asideWidth)) }),
      splitViewActive: false,
      setSplitView: (splitViewActive) => set({ splitViewActive }),

      activeTab: 'globe',
      setActiveTab: (tab) => set({ activeTab: tab }),
      renderer: 'cesium',
      setRenderer: (renderer) => set({ renderer }),
      basemap: 'liberty',
      setBasemap: (basemap) => set({ basemap }),

      activePanel: null,
      setActivePanel: (activePanel) => set({ activePanel }),
      togglePanel: (p) => set((s) => ({ activePanel: s.activePanel === p ? null : p })),

      tiletopiaOnline: false,
      geolangOnline: false,
      setBackendStatus: (tiletopiaOnline, geolangOnline) =>
        set({ tiletopiaOnline, geolangOnline }),

      // Layers
      layers: [],
      addLayer: (layer) => set((s) => ({ layers: [...s.layers, layer] })),
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
        renderer: state.renderer,
        bookmarks: state.bookmarks,
        settings: state.settings,
        asideWidth: state.asideWidth,
      }),
      // deep-merge settings so a persisted object from an older build backfills
      // any settings key added since (a missing key would crash the panel)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}) },
        };
      },
    },
  ),
);
