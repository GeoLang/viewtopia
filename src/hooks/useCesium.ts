import { useEffect, useRef } from 'react';
import { Ion, Viewer, Cartesian3, Math as CesiumMath } from 'cesium';

interface UseCesiumOptions {
  containerId?: string;
  ionToken?: string;
}

export function useCesium(opts: UseCesiumOptions = {}) {
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const container = document.getElementById(
      opts.containerId ?? 'cesium-container',
    );
    if (!container || viewerRef.current) return;

    if (opts.ionToken) {
      Ion.defaultAccessToken = opts.ionToken;
    }

    const viewer = new Viewer(container, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      creditContainer: document.createElement('div'),
    });

    // Set initial camera
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 20_000_000),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });

    viewerRef.current = viewer;

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [opts.containerId, opts.ionToken]);

  return viewerRef;
}
