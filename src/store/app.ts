import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CameraState } from './cameraViews';
import {
  DEFAULT_BASEMAP,
  type Basemap,
  type CustomBasemap,
  type LocalBasemap,
} from '../hooks/basemapTiles';

export type ViewerTab = 'globe' | 'map';
export type Renderer = 'cesium' | 'maplibre';
export type { Basemap, CustomBasemap, LocalBasemap };

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
  | 'travelTime'
  | 'draw'
  | 'annotate'
  | 'geofence'
  | 'layers'
  | 'legend'
  | 'dataSources'
  // the panels the data sources manager took over, kept as deep links to its tabs
  | 'ogc'
  | 'import'
  | 'sqlWorkspace'
  | 'project'
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
  | 'collecta'
  | 'google3d'
  | 'globalTerrain'
  | 'vectorTiles'
  | 'rasterViewer'
  | 'imageOverlay'
  | 'toolbox'
  | 'runHistory'
  | 'convert'
  | 'featurePicker'
  | 'geojsonEditor'
  | 'styleEditor'
  | 'portal'
  | 'stacBrowser'
  | 'dashboards'
  | 'printLayout'
  // the panel the print layout took over, kept so an old id still opens it
  | 'printExport'
  | 'pluginManager';

/** minimizing and dragging last only as long as the panel that was minimized or dragged */
export interface PanelPlacement {
  minimized: boolean;
  /** viewport coords the card was dragged to, null while it sits where it belongs */
  position: { x: number; y: number } | null;
}

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
  /** overrides VITE_PLUGIN_REGISTRY_URL; empty falls back to the build's value */
  pluginRegistryUrl: string;
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
  /** archive behind basemap 'local', picked off disk in the basemap picker */
  localBasemap: LocalBasemap | null;
  setLocalBasemap: (local: LocalBasemap) => void;

  // Tool panels
  activePanel: ToolPanel;
  setActivePanel: (p: ToolPanel) => void;
  togglePanel: (p: ToolPanel) => void;
  /**
   * How each panel card on screen was collapsed or dragged, keyed by the card's
   * own id. The space-time panel opens beside a tool panel, so one entry each.
   */
  panelPlacements: Record<string, PanelPlacement>;
  togglePanelMinimized: (cardId: string) => void;
  setPanelPosition: (cardId: string, position: { x: number; y: number }) => void;
  forgetPanelPlacement: (cardId: string) => void;

  // Backends
  tiletopiaOnline: boolean;
  geolangOnline: boolean;
  setBackendStatus: (tt: boolean, gl: boolean) => void;

  // Layers
  layers: LayerItem[];
  addLayer: (layer: LayerItem) => void;
  removeLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
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
  defaultBasemap: DEFAULT_BASEMAP,
  selfHostedBasemapUrl: '',
  probeIntervalSec: 30,
  tiletopiaUrl: '/api/v1',
  geolangUrl: '/agent',
  livekitUrl: '',
  pluginRegistryUrl: '',
  cesiumIonToken: '',
  googleMapsApiKey: '',
};

/**
 * The bookmarks this browser owns, held aside while a live document's bookmarks
 * are the ones on screen. Null when no live document is showing.
 */
let localBookmarks: Bookmark[] | null = null;

/** Called when a live document takes over the bookmark list. */
export function holdLocalBookmarks(): void {
  localBookmarks = useAppStore.getState().bookmarks;
}

/** Called when the live session ends, putting this browser's own list back. */
export function restoreLocalBookmarks(): void {
  const held = localBookmarks;
  localBookmarks = null;
  if (held) useAppStore.setState({ bookmarks: held });
}

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
      basemap: DEFAULT_BASEMAP,
      setBasemap: (basemap) => set({ basemap }),
      customBasemap: null,
      setCustomBasemap: (customBasemap) => set({ customBasemap, basemap: 'custom' }),
      localBasemap: null,
      setLocalBasemap: (localBasemap) => set({ localBasemap, basemap: 'local' }),

      activePanel: null,
      setActivePanel: (activePanel) => set({ activePanel, panelPlacements: {} }),
      togglePanel: (p) =>
        set((s) => ({ activePanel: s.activePanel === p ? null : p, panelPlacements: {} })),
      panelPlacements: {},
      togglePanelMinimized: (cardId) =>
        set((s) => ({
          panelPlacements: {
            ...s.panelPlacements,
            [cardId]: {
              minimized: !s.panelPlacements[cardId]?.minimized,
              position: s.panelPlacements[cardId]?.position ?? null,
            },
          },
        })),
      setPanelPosition: (cardId, position) =>
        set((s) => ({
          panelPlacements: {
            ...s.panelPlacements,
            [cardId]: { minimized: s.panelPlacements[cardId]?.minimized ?? false, position },
          },
        })),
      forgetPanelPlacement: (cardId) =>
        set((s) => {
          if (!(cardId in s.panelPlacements)) return {};
          const panelPlacements = { ...s.panelPlacements };
          delete panelPlacements[cardId];
          return { panelPlacements };
        }),

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
      setLayerVisible: (id, visible) =>
        set((s) => ({
          layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
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
        // the archive is a File this tab holds, so a reload comes back knowing
        // which one to ask for and nothing more
        localBasemap: state.localBasemap
          ? { name: state.localBasemap.name, status: 'needs-file' as const }
          : null,
        renderer: state.renderer,
        // a live document's bookmarks belong to the document, so they never
        // overwrite the ones this browser owns
        bookmarks: localBookmarks ?? state.bookmarks,
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
