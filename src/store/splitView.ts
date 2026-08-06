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
  /**
   * Percentage across the viewer where a swipe compare cuts. Set, the right
   * pane overlays the left at full width and is clipped from here rightward,
   * so both panes draw the same ground and the cut moves without either
   * renderer resizing. Null is the plain half-and-half split.
   */
  swipeAt: number | null;
  setActive: (v: boolean) => void;
  setPaneRenderer: (r: PaneRenderer) => void;
  setSwipeAt: (v: number | null) => void;
}

export const useSplitViewStore = create<SplitViewState>((set) => ({
  active: false,
  paneRenderer: 'maplibre',
  swipeAt: null,
  setActive: (active) => set({ active }),
  setPaneRenderer: (paneRenderer) => set({ paneRenderer }),
  setSwipeAt: (swipeAt) => set({ swipeAt }),
}));
