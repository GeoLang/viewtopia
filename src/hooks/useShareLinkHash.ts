import { useEffect } from 'react';
import { useAppStore, asRenderer, type Renderer } from '../store/app';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { getActiveCesiumViewer, getActiveMapLibre } from '../viewer/registry';
import { captureCameraState, flyToCameraState } from '../store/cameraViews';

/**
 * The five hash numbers (lng, lat, height, heading, pitch) read off the renderer
 * that is on screen. Cesium pitch convention: 0 = horizon, -90 = straight down.
 */
function activeCamera(renderer: Renderer): number[] {
  if (renderer === 'cesium') {
    const viewer = getActiveCesiumViewer();
    const cam = viewer ? captureCameraState(viewer) : null;
    if (cam) return [cam.lng, cam.lat, cam.height, cam.heading, cam.pitch];
  }
  if (renderer === 'maplibre') {
    const map = getActiveMapLibre();
    if (map) {
      const c = map.getCenter();
      return [
        c.lng,
        c.lat,
        4e7 / 2 ** map.getZoom(),
        map.getBearing(),
        map.getPitch() - 90,
      ];
    }
  }
  const shared = getSharedCamera();
  return [
    shared.longitude,
    shared.latitude,
    4e7 / 2 ** shared.zoom,
    shared.bearing,
    shared.pitch - 90,
  ];
}

/**
 * The hash fragment a share url carries so its recipient lands at the current
 * view, in the format the boot hook below reads back.
 */
export function cameraHashFragment(renderer: Renderer): string {
  const params = new URLSearchParams();
  params.set('cam', activeCamera(renderer).map((n) => n.toFixed(5)).join(','));
  params.set('renderer', renderer);
  return params.toString();
}

/**
 * On first mount, apply camera + renderer encoded in the URL hash
 * (#cam=lng,lat,height,heading,pitch&renderer=...). Set by ShareLinkPanel.
 * Runs once: it seeds the shared camera before viewers mount, then flies the
 * live Cesium viewer once it exists.
 */
export function useShareLinkHash() {
  const setRenderer = useAppStore((s) => s.setRenderer);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const camRaw = params.get('cam');
    if (!camRaw) return;

    const [lng, lat, height, heading, pitch] = camRaw.split(',').map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const shared = asRenderer(params.get('renderer'));
    if (shared) setRenderer(shared);

    // seed shared camera so a freshly-mounted viewer starts here
    setSharedCamera({
      longitude: lng,
      latitude: lat,
      zoom: Math.max(0, Math.log2(4e7 / Math.max(height || 1, 1))),
      bearing: heading || 0,
      pitch: (pitch || 0) + 90,
    });

    // fly the live Cesium viewer once it is ready
    let tries = 0;
    const timer = setInterval(() => {
      const viewer = getActiveCesiumViewer();
      if (viewer) {
        flyToCameraState(viewer, {
          lng,
          lat,
          height: height || 1e6,
          heading: heading || 0,
          pitch: pitch || -30,
          roll: 0,
        }, { reduceMotion: true });
        clearInterval(timer);
      } else if (++tries > 40) {
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
