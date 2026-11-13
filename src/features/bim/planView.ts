import {
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  OrthographicFrustum,
  PerspectiveFrustum,
  Transforms,
} from 'cesium';
import type { Viewer, Cesium3DTileset } from 'cesium';

export const ELEVATIONS = ['north', 'east', 'south', 'west'] as const;
export type Elevation = (typeof ELEVATIONS)[number];

const ELEVATION_HEADING: Record<Elevation, number> = {
  north: Math.PI,
  east: -Math.PI / 2,
  south: 0,
  west: Math.PI / 2,
};

const savedPerspective = new WeakMap<Viewer, Pick<PerspectiveFrustum, 'fov' | 'near'> | null>();
let planRevision = 0;
const planListeners = new Set<() => void>();

function bumpPlanView(): void {
  planRevision += 1;
  for (const listener of planListeners) listener();
}

export function subscribePlanView(listener: () => void): () => void {
  planListeners.add(listener);
  return () => planListeners.delete(listener);
}

export function planViewRevision(): number {
  return planRevision;
}

export function elevationHeading(elevation: Elevation): number {
  return ELEVATION_HEADING[elevation];
}

function rememberPerspective(viewer: Viewer): void {
  if (savedPerspective.has(viewer)) return;
  const { frustum } = viewer.camera;
  savedPerspective.set(viewer, frustum instanceof PerspectiveFrustum ? { fov: frustum.fov, near: frustum.near } : null);
}

export function showPlanView(
  viewer: Viewer,
  tileset: Cesium3DTileset,
  { heading, pitch }: { heading: number; pitch: number },
): void {
  rememberPerspective(viewer);
  const { center, radius } = tileset.boundingSphere;
  viewer.camera.switchToOrthographicFrustum();
  const { frustum } = viewer.camera;
  if (frustum instanceof OrthographicFrustum) frustum.width = Math.max(radius * 2.2, 1);
  viewer.camera.lookAtTransform(
    Transforms.eastNorthUpToFixedFrame(center),
    new HeadingPitchRange(heading, pitch, Math.max(radius * 2.5, 1)),
  );
  viewer.scene.requestRender();
  bumpPlanView();
}

export function showFloorPlan(viewer: Viewer, tileset: Cesium3DTileset): void {
  showPlanView(viewer, tileset, { heading: 0, pitch: CesiumMath.toRadians(-90) });
}

export function showElevation(viewer: Viewer, tileset: Cesium3DTileset, elevation: Elevation): void {
  showPlanView(viewer, tileset, { heading: elevationHeading(elevation), pitch: 0 });
}

export function planViewIsOn(viewer: Viewer): boolean {
  return savedPerspective.has(viewer);
}

export function leavePlanView(viewer: Viewer): void {
  const perspective = savedPerspective.get(viewer);
  savedPerspective.delete(viewer);
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.switchToPerspectiveFrustum();
  const { frustum } = viewer.camera;
  if (perspective && frustum instanceof PerspectiveFrustum) {
    frustum.fov = perspective.fov;
    frustum.near = perspective.near;
  }
  viewer.scene.requestRender();
  bumpPlanView();
}
