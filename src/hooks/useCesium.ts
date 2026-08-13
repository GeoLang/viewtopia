import { useCallback, useEffect, useRef, useState } from 'react';
import { Ion, Viewer } from 'cesium';
import { useAppStore } from '../store/app';
import { useSplitViewStore, COMPARE_PANE, type Pane } from '../store/splitView';
import { getSharedCamera, setSharedCamera, type SharedCamera } from './sharedCamera';
import {
  applyCesiumCamera,
  readCesiumCamera,
  sameCamera,
  useFollowSharedCamera,
} from './cameraSync';
import { rasterTiles, type CustomBasemap } from './basemapTiles';
import { CachedImageryProvider } from '../offline/cachedImageryProvider';
import { setActiveCesiumViewer, setPaneCesiumViewer } from '../viewer/registry';

/** How often the live camera is read back for the shared camera state. */
const CAMERA_PUBLISH_INTERVAL_MS = 100;

interface UseCesiumOptions {
  containerId?: string;
  ionToken?: string;
  /**
   * Set for a split pane: the viewer follows that pane's own renderer and
   * basemap, stays out of the registry every tool reads, and is destroyed when
   * the pane unmounts. Unset, it is the viewer pane the app store drives.
   */
  pane?: Pane;
  /** Which pane this is, so the registry files the viewer under that index. */
  paneIndex?: number;
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
  // building the viewer only writes a ref, which nothing downstream can react
  // to, so this renders the caller again with the new instance in the ref
  const [, setLiveViewer] = useState<Viewer | null>(null);
  const viewerBasemap = useAppStore((s) => s.basemap);
  const customBasemap = useAppStore((s) => s.customBasemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const splitActive = useSplitViewStore((s) => s.active);

  const isPane = !!opts.pane;
  const basemap = opts.pane?.basemap ?? viewerBasemap;
  const paneIndex = opts.paneIndex ?? COMPARE_PANE;
  const register = useCallback(
    (viewer: Viewer | null) => {
      if (isPane) setPaneCesiumViewer(paneIndex, viewer);
      else setActiveCesiumViewer(viewer);
    },
    [isPane, paneIndex],
  );
  const isActive =
    activeTab === 'globe' &&
    (opts.pane ? splitActive && opts.pane.renderer === 'cesium' : renderer === 'cesium');

  // Create/destroy viewer based on active state
  useEffect(() => {
    if (!isActive) {
      // Destroy when not active
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      setLiveViewer(null);
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
    let published: SharedCamera | null = null;
    const syncShared = () => {
      if (viewer.isDestroyed()) return;
      const cam = readCesiumCamera(viewer);
      if (!cam || (published && sameCamera(published, cam))) return;
      published = cam;
      setSharedCamera(cam);
    };
    viewer.camera.changed.addEventListener(syncShared);
    viewer.camera.moveEnd.addEventListener(syncShared);
    // cesium raises those two only while drawing a frame, so a renderer that is
    // seconds behind holds a move back that long. The poll publishes it on time.
    const cameraPoll = window.setInterval(() => {
      if (viewer.isDestroyed()) window.clearInterval(cameraPoll);
      else syncShared();
    }, CAMERA_PUBLISH_INTERVAL_MS);

    // Resize after layout
    viewer.resize();
    setTimeout(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    }, 300);

    viewerRef.current = viewer;
    setLiveViewer(viewer);
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
      setLiveViewer(null);
      register(null);
    },
    [register],
  );

  return viewerRef;
}
