import {
  Cartesian3,
  Cartographic,
  ClippingPlane,
  ClippingPlaneCollection,
  Color,
  Matrix4,
  Transforms,
} from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import type { ClipAxis } from './clipping';

// Cesium3DTileset only takes an east-north-up frame for a root centre above this height
const LOWEST_SURFACE_HEIGHT_METRES = -100_000;
const EDGE_WIDTH_PIXELS = 1;
const PLANES_PER_SECTION = 1;

export interface TilesetSection {
  axis: ClipAxis;
  position: number;
  flip: boolean;
  enabled: boolean;
}

export interface TilesetSectionRange {
  min: number;
  max: number;
}

function axisNormal(axis: ClipAxis): Cartesian3 {
  const normals: Record<ClipAxis, Cartesian3> = {
    x: Cartesian3.UNIT_X,
    y: Cartesian3.UNIT_Y,
    z: Cartesian3.UNIT_Z,
  };
  return normals[axis];
}

function untransformedRootCentre(tileset: Cesium3DTileset): Cartesian3 {
  const root = tileset.root;
  return Matrix4.multiplyByPoint(
    Matrix4.inverse(root.computedTransform, new Matrix4()),
    root.boundingSphere.center,
    new Cartesian3(),
  );
}

export function sectionFrameIsRootFrame(tileset: Cesium3DTileset): boolean {
  const cartographic: Cartographic | undefined = Cartographic.fromCartesian(
    untransformedRootCentre(tileset),
  );
  return !cartographic || cartographic.height <= LOWEST_SURFACE_HEIGHT_METRES;
}

export function sectionFrame(tileset: Cesium3DTileset): Matrix4 {
  const root = tileset.root;
  if (sectionFrameIsRootFrame(tileset)) return root.computedTransform;
  const untransformedCentre = untransformedRootCentre(tileset);
  return Matrix4.multiply(
    root.computedTransform,
    Transforms.eastNorthUpToFixedFrame(untransformedCentre),
    new Matrix4(),
  );
}

export function tilesetSectionRange(tileset: Cesium3DTileset, axis: ClipAxis): TilesetSectionRange {
  const centre = Matrix4.multiplyByPoint(
    Matrix4.inverse(sectionFrame(tileset), new Matrix4()),
    tileset.boundingSphere.center,
    new Cartesian3(),
  );
  const { radius } = tileset.boundingSphere;
  return { min: centre[axis] - radius, max: centre[axis] + radius };
}

function sectionPlane({ axis, position, flip }: TilesetSection): {
  normal: Cartesian3;
  distance: number;
} {
  const towardsAxis = axisNormal(axis);
  // Cesium keeps the side where dot(normal, point) + distance is above zero
  return flip
    ? { normal: towardsAxis, distance: -position }
    : { normal: Cartesian3.negate(towardsAxis, new Cartesian3()), distance: position };
}

const sectionListeners = new Set<() => void>();
let sectionChangeCount = 0;

export function subscribeTilesetSections(listener: () => void): () => void {
  sectionListeners.add(listener);
  return () => {
    sectionListeners.delete(listener);
  };
}

export function tilesetSectionChangeCount(): number {
  return sectionChangeCount;
}

function sectionChanged(requestRender: () => void): void {
  sectionChangeCount += 1;
  requestRender();
  for (const listener of sectionListeners) listener();
}

export function applyTilesetSection(
  tileset: Cesium3DTileset,
  section: TilesetSection,
  requestRender: () => void,
): void {
  const { normal, distance } = sectionPlane(section);
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (collection && collection.length === PLANES_PER_SECTION) {
    const plane = collection.get(0);
    plane.normal = normal;
    plane.distance = distance;
    collection.enabled = section.enabled;
  } else {
    tileset.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(normal, distance)],
      enabled: section.enabled,
      edgeWidth: EDGE_WIDTH_PIXELS,
      edgeColor: Color.RED,
    });
  }
  sectionChanged(requestRender);
}

export function disableTilesetSection(tileset: Cesium3DTileset, requestRender: () => void): void {
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (collection) collection.enabled = false;
  sectionChanged(requestRender);
}

export function tilesetSectionOutlined(tileset: Cesium3DTileset): boolean {
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  return collection === undefined || collection.edgeWidth > 0;
}

export function setTilesetSectionOutline(
  tileset: Cesium3DTileset,
  { visible }: { visible: boolean },
  requestRender: () => void,
): void {
  const collection: ClippingPlaneCollection = tileset.clippingPlanes;
  // ModelClippingPlanesStageFS paints a fragment edgeColor when it lies within edgeWidth pixels of the plane
  collection.edgeWidth = visible ? EDGE_WIDTH_PIXELS : 0;
  sectionChanged(requestRender);
}

export function readTilesetSection(tileset: Cesium3DTileset): TilesetSection | null {
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (!collection || collection.length !== PLANES_PER_SECTION) return null;
  const { normal, distance } = collection.get(0);
  const axes: ClipAxis[] = ['x', 'y', 'z'];
  const axis = axes.find((candidate) => normal[candidate] !== 0);
  if (!axis) return null;
  const flip = normal[axis] > 0;
  return { axis, flip, position: flip ? -distance : distance, enabled: collection.enabled };
}
