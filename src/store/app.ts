import { create } from 'zustand';

export type ViewerTab = 'globe' | 'map' | 'image' | 'table';
export type Renderer = 'cesium' | 'deckgl' | 'maplibre';

interface AppState {
  // Layout
  navOpened: boolean;
  toggleNav: () => void;

  // Viewer
  activeTab: ViewerTab;
  setActiveTab: (tab: ViewerTab) => void;
  renderer: Renderer;
  setRenderer: (r: Renderer) => void;

  // Backends
  tiletopiaOnline: boolean;
  geolangOnline: boolean;
  setBackendStatus: (tt: boolean, gl: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  navOpened: true,
  toggleNav: () => set((s) => ({ navOpened: !s.navOpened })),

  activeTab: 'globe',
  setActiveTab: (tab) => set({ activeTab: tab }),
  renderer: 'cesium',
  setRenderer: (renderer) => set({ renderer }),

  tiletopiaOnline: false,
  geolangOnline: false,
  setBackendStatus: (tiletopiaOnline, geolangOnline) =>
    set({ tiletopiaOnline, geolangOnline }),
}));
