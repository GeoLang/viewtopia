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
import { randomUuid } from '../../lib/randomUuid';
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

export interface FacePlane {
  id: string;
  normal: [number, number, number];
  offset: number;
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

function faceClippingPlane({ normal, offset }: FacePlane): { normal: Cartesian3; distance: number } {
  return { normal: Cartesian3.negate(Cartesian3.fromArray(normal), new Cartesian3()), distance: offset };
}

interface HeldSection {
  axis: TilesetSection | null;
  faces: FacePlane[];
  outlined: boolean;
}

const heldSections = new WeakMap<Cesium3DTileset, HeldSection>();
let armedTileset: Cesium3DTileset | null = null;

function heldOf(tileset: Cesium3DTileset): HeldSection {
  const existing = heldSections.get(tileset);
  if (existing) return existing;
  const created: HeldSection = { axis: null, faces: [], outlined: true };
  heldSections.set(tileset, created);
  return created;
}

function clippingPlanesOf(state: HeldSection): { normal: Cartesian3; distance: number }[] {
  const planes = [];
  if (state.axis?.enabled) planes.push(sectionPlane(state.axis));
  for (const face of state.faces) planes.push(faceClippingPlane(face));
  if (planes.length === 0 && state.axis) planes.push(sectionPlane(state.axis));
  return planes;
}

function collectionIsClipping(state: HeldSection): boolean {
  return Boolean(state.axis?.enabled) || state.faces.length > 0;
}

function writeClipping(tileset: Cesium3DTileset, state: HeldSection): void {
  const planes = clippingPlanesOf(state);
  if (planes.length === 0) {
    const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
    if (collection) collection.enabled = false;
    return;
  }
  const enabled = collectionIsClipping(state);
  const edgeWidth = state.outlined ? EDGE_WIDTH_PIXELS : 0;
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (collection && collection.length === planes.length) {
    planes.forEach((plane, index) => {
      const existing = collection.get(index);
      existing.normal = plane.normal;
      existing.distance = plane.distance;
    });
    collection.enabled = enabled;
    collection.edgeWidth = edgeWidth;
    collection.edgeColor = Color.RED;
    return;
  }
  tileset.clippingPlanes = new ClippingPlaneCollection({
    planes: planes.map((plane) => new ClippingPlane(plane.normal, plane.distance)),
    enabled,
    edgeWidth,
    edgeColor: Color.RED,
    // cesium by default clips a fragment only when it lies outside every plane
    unionClippingRegions: true,
  });
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
  const state = heldOf(tileset);
  state.axis = section;
  writeClipping(tileset, state);
  sectionChanged(requestRender);
}

export function disableTilesetSection(tileset: Cesium3DTileset, requestRender: () => void): void {
  const state = heldSections.get(tileset);
  if (!state) {
    const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
    if (collection) collection.enabled = false;
    sectionChanged(requestRender);
    return;
  }
  if (state.axis) state.axis = { ...state.axis, enabled: false };
  writeClipping(tileset, state);
  sectionChanged(requestRender);
}

export function readFacePlanes(tileset: Cesium3DTileset): readonly FacePlane[] {
  return heldSections.get(tileset)?.faces ?? [];
}

export function addFacePlane(
  tileset: Cesium3DTileset,
  plane: FacePlane,
  requestRender: () => void,
): void {
  const state = heldOf(tileset);
  state.faces = [...state.faces, plane];
  writeClipping(tileset, state);
  sectionChanged(requestRender);
}

export function removeFacePlane(tileset: Cesium3DTileset, id: string, requestRender: () => void): void {
  const state = heldOf(tileset);
  state.faces = state.faces.filter((plane) => plane.id !== id);
  writeClipping(tileset, state);
  sectionChanged(requestRender);
}

export function replaceFacePlanes(
  tileset: Cesium3DTileset,
  faces: FacePlane[],
  requestRender: () => void,
): void {
  const state = heldOf(tileset);
  state.faces = faces;
  writeClipping(tileset, state);
  sectionChanged(requestRender);
}

export function faceClipArmed(tileset: Cesium3DTileset): boolean {
  return armedTileset === tileset;
}

export function armedFaceClipTileset(): Cesium3DTileset | null {
  return armedTileset;
}

export function armFaceClip(tileset: Cesium3DTileset | null, requestRender: () => void): void {
  armedTileset = tileset;
  sectionChanged(requestRender);
}

export function facePlaneFromWorld(
  tileset: Cesium3DTileset,
  point: Cartesian3,
  normal: Cartesian3,
): FacePlane | null {
  const toSection = Matrix4.inverse(sectionFrame(tileset), new Matrix4());
  const localPoint = Matrix4.multiplyByPoint(toSection, point, new Cartesian3());
  const localNormal = Matrix4.multiplyByPointAsVector(toSection, normal, new Cartesian3());
  if (Cartesian3.magnitudeSquared(localNormal) === 0) return null;
  Cartesian3.normalize(localNormal, localNormal);
  return {
    id: randomUuid(),
    normal: [localNormal.x, localNormal.y, localNormal.z],
    offset: Cartesian3.dot(localNormal, localPoint),
  };
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
  const state = heldSections.get(tileset);
  if (state) state.outlined = visible;
  const collection: ClippingPlaneCollection = tileset.clippingPlanes;
  // ModelClippingPlanesStageFS paints a fragment edgeColor when it lies within edgeWidth pixels of the plane
  collection.edgeWidth = visible ? EDGE_WIDTH_PIXELS : 0;
  sectionChanged(requestRender);
}

export function readTilesetSection(tileset: Cesium3DTileset): TilesetSection | null {
  const held = heldSections.get(tileset);
  if (held) return held.axis;
  const collection: ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (!collection || collection.length !== PLANES_PER_SECTION) return null;
  const { normal, distance } = collection.get(0);
  const axes: ClipAxis[] = ['x', 'y', 'z'];
  const axis = axes.find((candidate) => normal[candidate] !== 0);
  if (!axis) return null;
  const flip = normal[axis] > 0;
  return { axis, flip, position: flip ? -distance : distance, enabled: collection.enabled };
}
