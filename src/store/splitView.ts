import { useMemo } from 'react';
import { create } from 'zustand';
import { DEFAULT_BASEMAP } from '../hooks/basemapTiles';
import { useAppStore, type Basemap, type Renderer } from './app';

export type PaneRenderer = Renderer;

/** What one pane draws: its own renderer and its own basemap. */
export interface Pane {
  renderer: PaneRenderer;
  basemap: Basemap;
}

/**
 * Panes in left-to-right order. The viewer is pane 0: it is the app's active
 * renderer, so every tool that acts on the registered viewer keeps working, and
 * its renderer and basemap live in the app store. The rest are created only
 * while the split is on.
 */
export const VIEWER_PANE = 0;

/** The one pane beside the viewer in today's two-pane layout. */
export const COMPARE_PANE = 1;

const DEFAULT_COMPARE_PANES: Pane[] = [{ renderer: 'maplibre', basemap: DEFAULT_BASEMAP }];

interface SplitViewState {
  active: boolean;
  /** The panes after the viewer, so pane index n is comparePanes[n - 1]. */
  comparePanes: Pane[];
  /**
   * Percentage across the viewer where a swipe compare cuts. Set, the second
   * pane overlays the first at full width and is clipped from here rightward,
   * so both panes draw the same ground and the cut moves without either
   * renderer resizing. Null is the plain half-and-half split.
   */
  swipeAt: number | null;
  setActive: (v: boolean) => void;
  setComparePanes: (panes: Pane[]) => void;
  setPaneRenderer: (index: number, r: PaneRenderer) => void;
  setPaneBasemap: (index: number, b: Basemap) => void;
  setSwipeAt: (v: number | null) => void;
}

/** Rewrite one compare pane, addressed by its pane index. */
function withPane(panes: Pane[], index: number, change: Partial<Pane>): Pane[] {
  return panes.map((pane, i) => (i === index - 1 ? { ...pane, ...change } : pane));
}

export const useSplitViewStore = create<SplitViewState>((set) => ({
  active: false,
  comparePanes: DEFAULT_COMPARE_PANES,
  swipeAt: null,
  setActive: (active) => set({ active }),
  setComparePanes: (comparePanes) => set({ comparePanes }),
  setPaneRenderer: (index, renderer) => {
    if (index === VIEWER_PANE) {
      useAppStore.getState().setRenderer(renderer);
      return;
    }
    set((s) => ({ comparePanes: withPane(s.comparePanes, index, { renderer }) }));
  },
  setPaneBasemap: (index, basemap) => {
    if (index === VIEWER_PANE) {
      useAppStore.getState().setBasemap(basemap);
      return;
    }
    set((s) => ({ comparePanes: withPane(s.comparePanes, index, { basemap }) }));
  },
  setSwipeAt: (swipeAt) => set({ swipeAt }),
}));

/** Every pane, viewer first, indexed the way the pane setters are. */
export function usePanes(): Pane[] {
  const renderer = useAppStore((s) => s.renderer);
  const basemap = useAppStore((s) => s.basemap);
  const comparePanes = useSplitViewStore((s) => s.comparePanes);
  return useMemo(
    () => [{ renderer, basemap }, ...comparePanes],
    [renderer, basemap, comparePanes],
  );
}
