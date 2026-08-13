/**
 * Renderer registry — exposes the live Cesium viewer to non-React code
 * (e.g. the agent viewer-command dispatcher), mirroring the vanilla
 * getCesiumViewer() accessor. React renderer hooks register their instance
 * on creation and clear it on teardown.
 */
import type { Viewer } from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Deck } from '@deck.gl/core';
import { COMPARE_PANE } from '../store/splitView';

declare global {
  interface Window {
    // exposed for e2e/debug so tests can assert live viewer state
    __viewtopiaViewer?: Viewer | null;
    __viewtopiaMap?: MapLibreMap | null;
    __viewtopiaDeck?: Deck | null;
    // the pane beside the viewer, which no tool acts on
    __viewtopiaPaneViewer?: Viewer | null;
    __viewtopiaPaneMap?: MapLibreMap | null;
    // every split pane, keyed by its pane index
    __viewtopiaPaneViewers?: Record<number, Viewer>;
    __viewtopiaPaneMaps?: Record<number, MapLibreMap>;
  }
}

let cesiumViewer: Viewer | null = null;
let maplibreMap: MapLibreMap | null = null;
let deckInstance: Deck | null = null;

const paneViewers = new Map<number, Viewer>();
const paneMaps = new Map<number, MapLibreMap>();

export function setActiveCesiumViewer(v: Viewer | null): void {
  cesiumViewer = v;
  window.__viewtopiaViewer = v;
}

export function getActiveCesiumViewer(): Viewer | null {
  if (cesiumViewer && !cesiumViewer.isDestroyed()) return cesiumViewer;
  return null;
}

export function setActiveMapLibre(m: MapLibreMap | null): void {
  maplibreMap = m;
  window.__viewtopiaMap = m;
}

export function getActiveMapLibre(): MapLibreMap | null {
  return maplibreMap;
}

/**
 * The split view's panes, by pane index. Kept apart from the active slots on
 * purpose: tools and agent commands drive one viewer, and that stays pane 0.
 */
export function setPaneCesiumViewer(index: number, v: Viewer | null): void {
  if (v) paneViewers.set(index, v);
  else paneViewers.delete(index);
  window.__viewtopiaPaneViewers = Object.fromEntries(paneViewers);
  window.__viewtopiaPaneViewer = paneViewers.get(COMPARE_PANE) ?? null;
}

export function setPaneMapLibre(index: number, m: MapLibreMap | null): void {
  if (m) paneMaps.set(index, m);
  else paneMaps.delete(index);
  window.__viewtopiaPaneMaps = Object.fromEntries(paneMaps);
  window.__viewtopiaPaneMap = paneMaps.get(COMPARE_PANE) ?? null;
}

/**
 * The map of the pane beside the viewer, for the one tool that compares two of
 * them: timelapse draws its B step here, which is what its swipe and
 * side-by-side modes compare.
 */
export function getPaneMapLibre(): MapLibreMap | null {
  return paneMaps.get(COMPARE_PANE) ?? null;
}

/**
 * The Deck the MapLibre map's interleaved overlay owns. Registered by
 * useDeckOverlay so the feature picker can pick deck layers, which
 * queryRenderedFeatures never returns.
 */
export function setActiveDeck(d: Deck | null): void {
  deckInstance = d;
  window.__viewtopiaDeck = d;
}

export function getActiveDeck(): Deck | null {
  return deckInstance;
}
