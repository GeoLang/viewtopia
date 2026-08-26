/**
 * Cutting the globe open along one axis. The Clipping panel and the chat both
 * drive the single plane the globe's clipping collection holds.
 */

import { Cartesian3, ClippingPlane, ClippingPlaneCollection, Ellipsoid } from 'cesium';

export const CLIP_AXES = ['x', 'y', 'z'] as const;
export type ClipAxis = (typeof CLIP_AXES)[number];

export const DEFAULT_CLIP_AXIS: ClipAxis = 'z';
export const MIN_CLIP_POSITION = 0;
export const MAX_CLIP_POSITION = 100;
/** The position that cuts through the earth's centre. */
export const CENTRE_CLIP_POSITION = 50;

const EDGE_WIDTH_PIXELS = 1;
/** The collection this module builds, so an existing one is recognised. */
const PLANES_PER_COLLECTION = 1;

/** Globe clipping planes live in the earth-fixed frame, so the axes are ECEF. */
function axisNormal(axis: ClipAxis): Cartesian3 {
  const normals: Record<ClipAxis, Cartesian3> = {
    x: Cartesian3.UNIT_X,
    y: Cartesian3.UNIT_Y,
    z: Cartesian3.UNIT_Z,
  };
  return normals[axis];
}

/** The ends push the cut past the surface, so the whole globe is on one side. */
export function planeDistance(position: number): number {
  return (
    ((CENTRE_CLIP_POSITION - position) / CENTRE_CLIP_POSITION) * Ellipsoid.WGS84.maximumRadius
  );
}

export interface ClipSettings {
  axis: ClipAxis;
  position: number;
  enabled: boolean;
}

/** As much of a Cesium viewer as the globe's clipping planes are set on. */
export interface ClippingViewer {
  scene: {
    globe: { clippingPlanes: ClippingPlaneCollection | undefined };
    requestRender: () => void;
  };
}

export function applyGlobeClipping(viewer: ClippingViewer, settings: ClipSettings): void {
  const globe = viewer.scene.globe;
  const normal = axisNormal(settings.axis);
  const distance = planeDistance(settings.position);
  const collection = globe.clippingPlanes;
  if (collection && collection.length === PLANES_PER_COLLECTION) {
    const plane = collection.get(0);
    plane.normal = normal;
    plane.distance = distance;
    collection.enabled = settings.enabled;
  } else {
    globe.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(normal, distance)],
      enabled: settings.enabled,
      edgeWidth: EDGE_WIDTH_PIXELS,
    });
  }
  viewer.scene.requestRender();
}

export function disableGlobeClipping(viewer: ClippingViewer): void {
  const collection = viewer.scene.globe.clippingPlanes;
  if (collection) collection.enabled = false;
}
