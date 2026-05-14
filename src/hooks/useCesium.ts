import { useEffect, useRef } from 'react';
import {
  Ion,
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  UrlTemplateImageryProvider,
  OpenStreetMapImageryProvider,
} from 'cesium';
import { useAppStore } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { BASEMAP_TILES } from './basemapTiles';

interface UseCesiumOptions {
  containerId?: string;
  ionToken?: string;
}

function cesiumImageryProvider(basemap: string) {
  const tile = BASEMAP_TILES[basemap];
  if (!tile) {
    return new OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
  }
  if (basemap === 'osm') {
    return new OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
  }
  return new UrlTemplateImageryProvider({
    url: tile.url,
    maximumLevel: basemap === 'topo' ? 17 : 19,
    credit: tile.attr,
  });
}

export function useCesium(opts: UseCesiumOptions = {}) {
  const viewerRef = useRef<Viewer | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  const isActive = activeTab === 'globe' && renderer === 'cesium';

  // Create/destroy viewer based on active state
  useEffect(() => {
    if (!isActive) {
      // Destroy when not active
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
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
    viewer.imageryLayers.addImageryProvider(
      cesiumImageryProvider(basemap),
    );

    // Restore shared camera
    // cam.pitch is map-style (0=top-down, 45=tilted, 90=horizon)
    // Cesium pitch: -90=straight down, -45=tilted, 0=horizon
    const cam = getSharedCamera();
    const height = 4e7 / Math.pow(2, cam.zoom);
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(cam.longitude, cam.latitude, height),
      orientation: {
        heading: CesiumMath.toRadians(cam.bearing),
        pitch: CesiumMath.toRadians(cam.pitch - 90),
        roll: 0,
      },
    });

    // Write back to shared camera on move
    const syncShared = () => {
      if (viewer.isDestroyed()) return;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      setSharedCamera({
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        zoom: Math.max(0, Math.log2(4e7 / Math.max(carto.height, 1))),
        pitch: 90 + CesiumMath.toDegrees(viewer.camera.pitch),
        bearing: CesiumMath.toDegrees(viewer.camera.heading) || 0,
      });
    };
    viewer.camera.changed.addEventListener(syncShared);
    viewer.camera.moveEnd.addEventListener(syncShared);

    // Resize after layout
    viewer.resize();
    setTimeout(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    }, 300);

    viewerRef.current = viewer;
  }, [isActive, opts.containerId, opts.ionToken, basemap]);

  // Swap basemap imagery when already active
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isActive) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(cesiumImageryProvider(basemap));
  }, [basemap, isActive]);

  return viewerRef;
}
