/**
 * Renderer registry — exposes the live Cesium viewer to non-React code
 * (e.g. the agent viewer-command dispatcher), mirroring the vanilla
 * getCesiumViewer() accessor. React renderer hooks register their instance
 * on creation and clear it on teardown.
 */
import type { Viewer } from 'cesium';

declare global {
  interface Window {
    // exposed for e2e/debug so tests can assert live viewer state
    __viewtopiaViewer?: Viewer | null;
  }
}

let cesiumViewer: Viewer | null = null;

export function setActiveCesiumViewer(v: Viewer | null): void {
  cesiumViewer = v;
  window.__viewtopiaViewer = v;
}

export function getActiveCesiumViewer(): Viewer | null {
  if (cesiumViewer && !cesiumViewer.isDestroyed()) return cesiumViewer;
  return null;
}
