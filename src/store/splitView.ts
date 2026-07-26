import { create } from 'zustand';

/**
 * Split view: the left pane is the app's active renderer (so every tool that
 * acts on the registered viewer keeps working), the right pane is a second
 * renderer instance created only while the split is on.
 */
export type PaneRenderer = 'cesium' | 'maplibre';

interface SplitViewState {
  active: boolean;
  paneRenderer: PaneRenderer;
  setActive: (v: boolean) => void;
  setPaneRenderer: (r: PaneRenderer) => void;
}

export const useSplitViewStore = create<SplitViewState>((set) => ({
  active: false,
  paneRenderer: 'maplibre',
  setActive: (active) => set({ active }),
  setPaneRenderer: (paneRenderer) => set({ paneRenderer }),
}));
