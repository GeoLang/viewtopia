import { Cartesian3, Math as CesiumMath } from 'cesium';
import type { Viewer } from 'cesium';

/**
 * Shared camera-state type for saved views (bookmarks, stories, share links).
 * Angles are degrees; height is metres above the ellipsoid.
 */
export interface CameraState {
  lng: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export function captureCameraState(viewer: Viewer): CameraState | null {
  const carto = viewer.camera.positionCartographic;
  if (!carto) return null;
  return {
    lng: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    height: carto.height,
    heading: CesiumMath.toDegrees(viewer.camera.heading),
    pitch: CesiumMath.toDegrees(viewer.camera.pitch),
    roll: CesiumMath.toDegrees(viewer.camera.roll),
  };
}

export function flyToCameraState(
  viewer: Viewer,
  cam: CameraState,
  opts: { reduceMotion?: boolean } = {},
): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(cam.lng, cam.lat, cam.height),
    orientation: {
      heading: CesiumMath.toRadians(cam.heading),
      pitch: CesiumMath.toRadians(cam.pitch),
      roll: CesiumMath.toRadians(cam.roll),
    },
    duration: opts.reduceMotion ? 0 : 1.5,
  });
}
