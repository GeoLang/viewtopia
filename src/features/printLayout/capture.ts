import { Rectangle, type Viewer } from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { applyCesiumCamera, readCesiumCamera, readMapLibreCamera } from '../../hooks/cameraSync';
import { getSharedCamera, type SharedCamera } from '../../hooks/sharedCamera';
import type { Bbox } from '../../lib/terrainAnalysis';
import { useAppStore } from '../../store/app';
import { getActiveCesiumViewer, getActiveMapLibre } from '../../viewer/registry';

/** Cap on waiting for tiles after a camera move, so one slow page cannot hang a series. */
const TILE_SETTLE_TIMEOUT_MS = 5000;
const CESIUM_SETTLE_POLL_MS = 100;

export const CAPTURE_REFUSAL =
  'Leaflet draws its tiles as images, which the page cannot read back. Switch to MapLibre or Cesium.';

export interface MapCapture {
  /** draw a fresh frame, so the canvas holds what is on screen right now */
  renderFrame(): void;
  canvas(): HTMLCanvasElement;
  camera(): SharedCamera;
  /** snapshot the camera, handing back the call that puts it where it was */
  saveView(): () => Promise<void>;
  showBounds(bounds: Bbox): Promise<void>;
}

export function activeMapCapture(): MapCapture | null {
  const { activeTab, renderer } = useAppStore.getState();
  if (activeTab === 'map') return null;
  if (renderer === 'maplibre') {
    const map = getActiveMapLibre();
    return map ? maplibreCapture(map) : null;
  }
  const viewer = getActiveCesiumViewer();
  return viewer ? cesiumCapture(viewer) : null;
}

function maplibreSettled(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      map.off('idle', done);
      resolve();
    };
    const timer = setTimeout(done, TILE_SETTLE_TIMEOUT_MS);
    map.once('idle', done);
  });
}

function maplibreCapture(map: MapLibreMap): MapCapture {
  return {
    renderFrame() {
      map.redraw();
    },
    canvas() {
      return map.getCanvas();
    },
    camera() {
      return readMapLibreCamera(map);
    },
    saveView() {
      const view = readMapLibreCamera(map);
      return async () => {
        map.jumpTo({
          center: [view.longitude, view.latitude],
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
        });
        await maplibreSettled(map);
      };
    },
    async showBounds(bounds) {
      map.fitBounds(bounds, { padding: 0, duration: 0 });
      await maplibreSettled(map);
    },
  };
}

function cesiumSettled(viewer: Viewer): Promise<void> {
  const deadline = Date.now() + TILE_SETTLE_TIMEOUT_MS;
  return new Promise((resolve) => {
    const poll = () => {
      if (viewer.isDestroyed()) return resolve();
      viewer.render();
      if (viewer.scene.globe.tilesLoaded || Date.now() > deadline) resolve();
      else setTimeout(poll, CESIUM_SETTLE_POLL_MS);
    };
    poll();
  });
}

function cesiumCapture(viewer: Viewer): MapCapture {
  return {
    renderFrame() {
      viewer.render();
    },
    canvas() {
      return viewer.canvas;
    },
    camera() {
      return readCesiumCamera(viewer) ?? getSharedCamera();
    },
    saveView() {
      const view = readCesiumCamera(viewer) ?? getSharedCamera();
      return async () => {
        applyCesiumCamera(viewer, view);
        await cesiumSettled(viewer);
      };
    },
    async showBounds([west, south, east, north]) {
      viewer.camera.setView({ destination: Rectangle.fromDegrees(west, south, east, north) });
      await cesiumSettled(viewer);
    },
  };
}
