import { Cartesian2, Cartographic, Math as CesiumMath } from 'cesium';
import { getActiveCesiumViewer, getActiveMapLibre } from '../viewer/registry';

/**
 * The clicked map coordinates, or null when the click was not on the map.
 * Window-level by design: callers listen on window and stay correct across
 * renderer switches without per-renderer wiring. Leaflet draws no canvas,
 * so its clicks are not picked up here.
 */
export function clickCoordinates(event: MouseEvent): { lng: number; lat: number } | null {
  const target = event.target;
  if (!(target instanceof HTMLCanvasElement)) return null;

  const map = getActiveMapLibre();
  if (map && map.getCanvas() === target) {
    const rect = target.getBoundingClientRect();
    const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    return { lng: point.lng, lat: point.lat };
  }

  const viewer = getActiveCesiumViewer();
  if (viewer && viewer.scene.canvas === target) {
    const rect = target.getBoundingClientRect();
    const position = new Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
    const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
    if (!cartesian) return null;
    const cartographic = Cartographic.fromCartesian(cartesian);
    return {
      lng: CesiumMath.toDegrees(cartographic.longitude),
      lat: CesiumMath.toDegrees(cartographic.latitude),
    };
  }
  return null;
}
