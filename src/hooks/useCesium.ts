import { useEffect, useRef } from 'react';
import { Ion, Viewer } from 'cesium';
import { useAppStore } from '../store/app';
import { useSplitViewStore } from '../store/splitView';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import {
  applyCesiumCamera,
  readCesiumCamera,
  useFollowSharedCamera,
} from './cameraSync';
import { rasterTiles, type CustomBasemap } from './basemapTiles';
import { CachedImageryProvider } from '../offline/cachedImageryProvider';
import { setActiveCesiumViewer, setPaneCesiumViewer } from '../viewer/registry';

interface UseCesiumOptions {
  containerId?: string;
  ionToken?: string;
  /**
   * 'pane' is the split view's second viewer: it follows the split's own
   * renderer choice, stays out of the registry every tool reads, and is
   * destroyed when the pane unmounts.
   */
  slot?: 'active' | 'pane';
}

/**
 * Cesium is raster-only, so a vector basemap resolves to its raster fallback.
 * Null for a local .pmtiles archive, which Cesium cannot read at all: the globe
 * shows no imagery rather than some other basemap.
 */
export function cesiumImageryProvider(basemap: string, custom?: CustomBasemap | null) {
  const tile = rasterTiles(basemap, custom);
  if (!tile) return null;
  return new CachedImageryProvider({
    url: tile.url,
    maximumLevel: basemap === 'topo' ? 17 : 19,
    credit: tile.attr,
  });
}

export function useCesium(opts: UseCesiumOptions = {}) {
  const viewerRef = useRef<Viewer | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const customBasemap = useAppStore((s) => s.customBasemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const splitActive = useSplitViewStore((s) => s.active);
  const paneRenderer = useSplitViewStore((s) => s.paneRenderer);

  const isPane = opts.slot === 'pane';
  const register = isPane ? setPaneCesiumViewer : setActiveCesiumViewer;
  const isActive =
    activeTab === 'globe' &&
    (isPane ? splitActive && paneRenderer === 'cesium' : renderer === 'cesium');

  // Create/destroy viewer based on active state
  useEffect(() => {
    if (!isActive) {
      // Destroy when not active
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      register(null);
      return;
    }

    const container = document.getElementById(
      opts.containerId ?? 'cesium-container',
    );
    if (!container || viewerRef.current) return;

    // Clear leftover DOM from previous Cesium instances
    container.innerHTML = '';

    if (opts.ionToken) {
      Ion.defaultAccessToken = opts.ionToken;
    }

    const creditEl = document.createElement('div');
    creditEl.style.display = 'none';
    container.appendChild(creditEl);

    let viewer: Viewer;
    try {
      viewer = new Viewer(container, {
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        animation: false,
        timeline: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: creditEl,
        baseLayer: false,
        contextOptions: {
          webgl: { preserveDrawingBuffer: true },
        },
      });
    } catch (err) {
      console.error('[useCesium] Failed to create viewer:', err);
      return;
    }

    // Add basemap imagery
    const imagery = cesiumImageryProvider(basemap, customBasemap);
    if (imagery) viewer.imageryLayers.addImageryProvider(imagery);

    // Restore shared camera
    applyCesiumCamera(viewer, getSharedCamera());

    // Write back to shared camera on move
    const syncShared = () => {
      if (viewer.isDestroyed()) return;
      const cam = readCesiumCamera(viewer);
      if (cam) setSharedCamera(cam);
    };
    viewer.camera.changed.addEventListener(syncShared);
    viewer.camera.moveEnd.addEventListener(syncShared);

    // Resize after layout
    viewer.resize();
    setTimeout(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    }, 300);

    viewerRef.current = viewer;
    register(viewer);
  }, [isActive, opts.containerId, opts.ionToken, basemap, customBasemap, register]);

  // Swap basemap imagery when already active. The custom tiles are a dependency
  // too: another catalog entry keeps basemap === 'custom' and changes only them.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isActive) return;
    viewer.imageryLayers.removeAll();
    const imagery = cesiumImageryProvider(basemap, customBasemap);
    if (imagery) viewer.imageryLayers.addImageryProvider(imagery);
  }, [basemap, customBasemap, isActive]);

  // In split view both panes move together
  useFollowSharedCamera(
    splitActive,
    () => {
      const viewer = viewerRef.current;
      return viewer && !viewer.isDestroyed() ? readCesiumCamera(viewer) : null;
    },
    (cam) => {
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) applyCesiumCamera(viewer, cam);
    },
  );

  // Release the WebGL context when the owner unmounts (a closing split pane)
  useEffect(
    () => () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      register(null);
    },
    [register],
  );

  return viewerRef;
}
