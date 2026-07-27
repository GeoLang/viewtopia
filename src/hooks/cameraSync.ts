import { useEffect, useRef } from 'react';
import { Cartesian3, Math as CesiumMath, type Viewer } from 'cesium';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getSharedCamera, subscribeSharedCamera, type SharedCamera } from './sharedCamera';

/**
 * The one place the renderer camera conversions live: shared camera state is
 * map-style (lon/lat, zoom, pitch 0 = top-down, bearing), Cesium is a position
 * plus heading/pitch in radians with -90 pointing down.
 */

export const cameraHeight = (zoom: number) => 4e7 / 2 ** zoom;

export const cameraZoom = (height: number) =>
  Math.max(0, Math.log2(4e7 / Math.max(height, 1)));

export function readCesiumCamera(viewer: Viewer): SharedCamera | null {
  const carto = viewer.camera.positionCartographic;
  if (!carto) return null;
  return {
    longitude: CesiumMath.toDegrees(carto.longitude),
    latitude: CesiumMath.toDegrees(carto.latitude),
    zoom: cameraZoom(carto.height),
    pitch: 90 + CesiumMath.toDegrees(viewer.camera.pitch),
    bearing: CesiumMath.toDegrees(viewer.camera.heading) || 0,
  };
}

export function applyCesiumCamera(viewer: Viewer, c: SharedCamera) {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(c.longitude, c.latitude, cameraHeight(c.zoom)),
    orientation: {
      heading: CesiumMath.toRadians(c.bearing),
      pitch: CesiumMath.toRadians(c.pitch - 90),
      roll: 0,
    },
  });
}

export function readMapLibreCamera(map: MapLibreMap): SharedCamera {
  const c = map.getCenter();
  return {
    longitude: c.lng,
    latitude: c.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}

export function applyMapLibreCamera(map: MapLibreMap, c: SharedCamera) {
  map.jumpTo({
    center: [c.longitude, c.latitude],
    zoom: c.zoom,
    pitch: c.pitch,
    bearing: c.bearing,
  });
}

/**
 * Close enough that applying `b` to a camera already at `a` would only add
 * float noise. This is what stops two synced panes from trading corrections:
 * a pane ignores an update it is already showing, including the readback of
 * its own move.
 */
export function sameCamera(a: SharedCamera, b: SharedCamera): boolean {
  return (
    Math.abs(a.longitude - b.longitude) < 1e-6 &&
    Math.abs(a.latitude - b.latitude) < 1e-6 &&
    Math.abs(a.zoom - b.zoom) < 1e-4 &&
    Math.abs(a.pitch - b.pitch) < 1e-3 &&
    Math.abs(a.bearing - b.bearing) < 1e-3
  );
}

/**
 * Follow camera moves published by the other split-view pane. `read` returning
 * null means the renderer has no camera yet, so there is nothing to compare and
 * nothing to move.
 */
export function useFollowSharedCamera(
  enabled: boolean,
  read: () => SharedCamera | null,
  apply: (c: SharedCamera) => void,
) {
  const readRef = useRef(read);
  const applyRef = useRef(apply);
  readRef.current = read;
  applyRef.current = apply;

  useEffect(() => {
    if (!enabled) return;
    const follow = (cam: SharedCamera) => {
      const mine = readRef.current();
      if (!mine || sameCamera(mine, cam)) return;
      applyRef.current(cam);
    };
    const unsubscribe = subscribeSharedCamera(follow);
    // a move published before this subscription attached would otherwise be
    // lost until the next one, leaving a fresh pane at its default view
    follow(getSharedCamera());
    return unsubscribe;
  }, [enabled]);
}
