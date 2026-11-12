import {
  Cartographic,
  Math as CesiumMath,
  type Cartesian2,
  type Viewer,
} from 'cesium';

export function readAnnotationPoint(
  viewer: Viewer,
  windowPosition: Cartesian2,
): { lng: number; lat: number; height: number } | null {
  const { scene } = viewer;
  const cartesian = scene.pickPositionSupported
    ? (scene.pickPosition(windowPosition) ??
      viewer.camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid))
    : viewer.camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid);
  if (!cartesian) return null;
  const cartographic = Cartographic.fromCartesian(cartesian);
  if (!Number.isFinite(cartographic.height)) return null;
  return {
    lng: CesiumMath.toDegrees(cartographic.longitude),
    lat: CesiumMath.toDegrees(cartographic.latitude),
    height: cartographic.height,
  };
}
