import { useMemo } from 'react';
import { create } from 'zustand';
import { DEFAULT_BASEMAP } from '../hooks/basemapTiles';
import { useAppStore, asRenderer, type Basemap, type Renderer } from './app';

/**
 * The viewer's two globe renderers plus the 2D map. Leaflet is a compare-pane
 * choice only: the registered viewer every tool binds to has to be a globe, and
 * the 2D Map tab is already the Leaflet view of it.
 */
export type PaneRenderer = Renderer | 'leaflet';

/** A saved pane renderer, or null when the app has no renderer by that name. */
export function asPaneRenderer(value: unknown): PaneRenderer | null {
  return value === 'leaflet' ? 'leaflet' : asRenderer(value);
}

/** What one pane draws: its own renderer, its own basemap, and what it leaves out. */
export interface Pane {
  renderer: PaneRenderer;
  basemap: Basemap;
  /**
   * Agent layers this pane does not draw, so two panes showing the same
   * document can each draw one branch of it. Absent is the same as none.
   */
  hiddenLayerIds?: string[];
}

/**
 * Panes in reading order across the layout. The viewer is pane 0: it is the app's active
 * renderer, so every tool that acts on the registered viewer keeps working, and
 * its renderer and basemap live in the app store. The rest are created only
 * while the split is on.
 */
export const VIEWER_PANE = 0;

/** The first pane beside the viewer, and the only one a swipe compare uses. */
export const COMPARE_PANE = 1;

/** How the panes are tiled. */
export type SplitLayout = 'twoAcross' | 'grid';

/** Panes each layout draws, the viewer counted. */
export const TWO_ACROSS_PANE_COUNT = 2;
export const GRID_PANE_COUNT = 4;

const LAYOUT_PANE_COUNT: Record<SplitLayout, number> = {
  twoAcross: TWO_ACROSS_PANE_COUNT,
  grid: GRID_PANE_COUNT,
};

/** The layout a pane list draws as. Nothing stores it, the pane count is it. */
export function paneLayout(paneCount: number): SplitLayout {
  return paneCount > TWO_ACROSS_PANE_COUNT ? 'grid' : 'twoAcross';
}

function defaultPane(): Pane {
  return { renderer: 'maplibre', basemap: DEFAULT_BASEMAP };
}

const DEFAULT_COMPARE_PANES: Pane[] = [defaultPane()];

/** Grow or shrink the compare panes to a count, keeping the ones already there. */
function resizeComparePanes(panes: Pane[], count: number): Pane[] {
  if (panes.length === count) return panes;
  if (panes.length > count) return panes.slice(0, count);
  return [...panes, ...Array.from({ length: count - panes.length }, defaultPane)];
}

/**
 * Only one pane may draw with Cesium, so say whether some other pane already
 * holds it. Two panes running the Cesium globe at once is more WebGL than a
 * machine can be asked for, and the second one starves the first.
 */
export function cesiumHeldElsewhere(panes: Pane[], index: number): boolean {
  return panes.some((pane, i) => i !== index && pane.renderer === 'cesium');
}

/**
 * What one pane may switch to, in menu order: the 2D renderer beside the viewer
 * only, and Cesium wherever it is free. The labels are the caller's, so the
 * panel and the map-corner control can name the same renderer differently.
 */
export function paneRendererChoices(
  panes: Pane[],
  index: number,
): { value: PaneRenderer; disabled: boolean }[] {
  const cesiumTaken = cesiumHeldElsewhere(panes, index);
  const choices: PaneRenderer[] =
    index === VIEWER_PANE ? ['cesium', 'maplibre'] : ['cesium', 'maplibre', 'leaflet'];
  return choices.map((value) => ({ value, disabled: value === 'cesium' && cesiumTaken }));
}

/** An active pane the layout no longer has falls back to the viewer. */
function clampActivePane(activePane: number, comparePanes: Pane[]): number {
  return activePane <= comparePanes.length ? activePane : VIEWER_PANE;
}

interface SplitViewState {
  active: boolean;
  /** The panes after the viewer, so pane index n is comparePanes[n - 1]. */
  comparePanes: Pane[];
  /**
   * The pane the map-corner basemap and renderer pickers style, picked by
   * clicking in it. Tools, agent commands and the viewer registry ignore it:
   * they act on pane 0 whichever pane is active.
   */
  activePane: number;
  /**
   * Percentage across the viewer where a swipe compare cuts. Set, the second
   * pane overlays the first at full width and is clipped from here rightward,
   * so both panes draw the same ground and the cut moves without either
   * renderer resizing. Null is the plain half-and-half split.
   */
  swipeAt: number | null;
  /**
   * What the viewer pane leaves out. The viewer's renderer and basemap live in
   * the app store, so its hidden ids have nowhere on `Pane` to sit either.
   */
  viewerHiddenLayerIds: string[];
  setActive: (v: boolean) => void;
  setComparePanes: (panes: Pane[]) => void;
  setLayout: (layout: SplitLayout) => void;
  setActivePane: (index: number) => void;
  setPaneRenderer: (index: number, r: PaneRenderer) => void;
  setPaneBasemap: (index: number, b: Basemap) => void;
  setSwipeAt: (v: number | null) => void;
  hideLayerInPane: (index: number, layerId: string) => void;
  showLayerInPane: (index: number, layerId: string) => void;
}

/** Rewrite one compare pane, addressed by its pane index. */
function withPane(panes: Pane[], index: number, change: Partial<Pane>): Pane[] {
  return panes.map((pane, i) => (i === index - 1 ? { ...pane, ...change } : pane));
}

/** One shared empty list, so a pane that hides nothing keeps a stable selector value. */
const NO_HIDDEN_LAYERS: string[] = [];

function paneHiddenLayerIds(state: SplitViewState, index: number): string[] {
  if (index === VIEWER_PANE) return state.viewerHiddenLayerIds;
  return state.comparePanes[index - 1]?.hiddenLayerIds ?? NO_HIDDEN_LAYERS;
}

function writeHiddenLayerIds(
  state: SplitViewState,
  index: number,
  hiddenLayerIds: string[],
): Partial<SplitViewState> {
  if (index === VIEWER_PANE) return { viewerHiddenLayerIds: hiddenLayerIds };
  return { comparePanes: withPane(state.comparePanes, index, { hiddenLayerIds }) };
}

export const useSplitViewStore = create<SplitViewState>((set) => ({
  active: false,
  comparePanes: DEFAULT_COMPARE_PANES,
  activePane: VIEWER_PANE,
  swipeAt: null,
  viewerHiddenLayerIds: NO_HIDDEN_LAYERS,
  // closing the split leaves one pane, so the styling controls go back to it
  setActive: (active) => set((s) => ({ active, activePane: active ? s.activePane : VIEWER_PANE })),
  setComparePanes: (comparePanes) =>
    set((s) => ({ comparePanes, activePane: clampActivePane(s.activePane, comparePanes) })),
  setLayout: (layout) =>
    set((s) => {
      const comparePanes = resizeComparePanes(s.comparePanes, LAYOUT_PANE_COUNT[layout] - 1);
      return { comparePanes, activePane: clampActivePane(s.activePane, comparePanes) };
    }),
  setActivePane: (activePane) => set({ activePane }),
  setPaneRenderer: (index, renderer) => {
    if (index === VIEWER_PANE) {
      // the viewer is a globe: paneRendererChoices never offers it the 2D one
      if (renderer !== 'leaflet') useAppStore.getState().setRenderer(renderer);
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
  hideLayerInPane: (index, layerId) =>
    set((s) => {
      const hidden = paneHiddenLayerIds(s, index);
      if (hidden.includes(layerId)) return {};
      return writeHiddenLayerIds(s, index, [...hidden, layerId]);
    }),
  showLayerInPane: (index, layerId) =>
    set((s) => {
      const hidden = paneHiddenLayerIds(s, index);
      if (!hidden.includes(layerId)) return {};
      return writeHiddenLayerIds(
        s,
        index,
        hidden.filter((id) => id !== layerId),
      );
    }),
}));

/** The layer ids one pane leaves out, whether it is the viewer or a compare pane. */
export function usePaneHiddenLayerIds(index: number): string[] {
  return useSplitViewStore((s) => paneHiddenLayerIds(s, index));
}

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
