/**
 * Renderer registry — exposes the live Cesium viewer to non-React code
 * (e.g. the agent viewer-command dispatcher), mirroring the vanilla
 * getCesiumViewer() accessor. React renderer hooks register their instance
 * on creation and clear it on teardown.
 */
import type { Viewer } from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Deck } from '@deck.gl/core';

declare global {
  interface Window {
    // exposed for e2e/debug so tests can assert live viewer state
    __viewtopiaViewer?: Viewer | null;
    __viewtopiaMap?: MapLibreMap | null;
    __viewtopiaDeck?: Deck | null;
  }
}

let cesiumViewer: Viewer | null = null;
let maplibreMap: MapLibreMap | null = null;
let deckInstance: Deck | null = null;

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

export function setActiveDeck(d: Deck | null): void {
  deckInstance = d;
  window.__viewtopiaDeck = d;
}

export function getActiveDeck(): Deck | null {
  return deckInstance;
}
