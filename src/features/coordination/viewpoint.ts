import { Cartesian3, Math as CesiumMath, Matrix4 } from 'cesium';
import type { Camera, Cesium3DTileset, Viewer } from 'cesium';
import { resolveElementIds, type ResolvedElements, type TiletopiaElementService } from '../elements/elementService';
import { useElementStore } from '../elements/store';
import type { ClipAxis } from '../scene/clipping';
import {
  applyTilesetSection,
  disableTilesetSection,
  readFacePlanes,
  readTilesetSection,
  replaceFacePlanes,
  sectionFrame,
  type FacePlane,
  type TilesetSection,
} from '../scene/tilesetSection';
import type {
  BcfCamera,
  BcfClippingPlane,
  BcfComponent,
  BcfVector,
  BcfViewpoint,
  BcfVisibility,
} from './api';
import { randomUuid } from '../../lib/randomUuid';

// a unit direction within this of an axis counts as along it
const AXIS_TOLERANCE = 1e-6;
const SECTION_AXES: ClipAxis[] = ['x', 'y', 'z'];

export interface RestoredViewpoint {
  selected: number;
  hidden: number;
  isolated: number | null;
  notInModel: string[];
  withoutMesh: string[];
  notApplied: string[];
}

function vectorOf(values: BcfVector): Cartesian3 {
  return Cartesian3.fromArray(values);
}

function ifcGuidsOf(components: BcfComponent[]): string[] {
  return components.flatMap((component) => (component.ifcGuid === null ? [] : [component.ifcGuid]));
}

function planeInSection(
  tileset: Cesium3DTileset,
  plane: BcfClippingPlane,
): { location: Cartesian3; direction: Cartesian3 } | null {
  // tiletopia's bcf coordinates are in the frame of tileset.root.computedTransform
  const toSection = Matrix4.multiply(
    Matrix4.inverse(sectionFrame(tileset), new Matrix4()),
    tileset.root.computedTransform,
    new Matrix4(),
  );
  const location = Matrix4.multiplyByPoint(toSection, vectorOf(plane.location), new Cartesian3());
  const raw = Matrix4.multiplyByPointAsVector(toSection, vectorOf(plane.direction), new Cartesian3());
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y) || !Number.isFinite(raw.z)) return null;
  if (Cartesian3.magnitudeSquared(raw) === 0) return null;
  return { location, direction: Cartesian3.normalize(raw, new Cartesian3()) };
}

function sectionFromPlane(tileset: Cesium3DTileset, plane: BcfClippingPlane): TilesetSection | null {
  // tiletopia's bcf coordinates are in the frame of tileset.root.computedTransform
  const placed = planeInSection(tileset, plane);
  if (!placed) return null;
  const { location, direction } = placed;
  const axis = SECTION_AXES.find((candidate) => Math.abs(Math.abs(direction[candidate]) - 1) < AXIS_TOLERANCE);
  if (!axis) return null;
  // bcf direction points at the clipped side, and an unflipped tileset section clips above its position
  return { axis, position: location[axis], flip: direction[axis] < 0, enabled: true };
}

function faceFromPlane(tileset: Cesium3DTileset, plane: BcfClippingPlane, id: string): FacePlane | null {
  const placed = planeInSection(tileset, plane);
  if (!placed) return null;
  const { location, direction } = placed;
  return {
    id,
    normal: [direction.x, direction.y, direction.z],
    offset: Cartesian3.dot(direction, location),
  };
}

function setCamera(viewer: Viewer, tileset: Cesium3DTileset, camera: BcfCamera): void {
  const frame = tileset.root.computedTransform;
  const destination = Matrix4.multiplyByPoint(frame, vectorOf(camera.cameraViewPoint), new Cartesian3());
  const direction = Cartesian3.normalize(
    Matrix4.multiplyByPointAsVector(frame, vectorOf(camera.cameraDirection), new Cartesian3()),
    new Cartesian3(),
  );
  const givenUp = Matrix4.multiplyByPointAsVector(frame, vectorOf(camera.cameraUpVector), new Cartesian3());
  // bcf allows an up vector at an angle to the direction, and cesium's roll assumes a square one
  const right = Cartesian3.normalize(Cartesian3.cross(direction, givenUp, new Cartesian3()), new Cartesian3());
  const up = Cartesian3.cross(right, direction, new Cartesian3());
  // camera.setView keeps the orbit point BIM mode put in camera.transform unless endTransform is passed
  viewer.camera.setView({ destination, orientation: { direction, up }, endTransform: Matrix4.IDENTITY });
}

function unappliedParts(viewpoint: BcfViewpoint): string[] {
  const parts: string[] = [];
  const { camera, visibility } = viewpoint;
  if (camera?.kind === 'orthogonal') parts.push('the orthogonal projection, shown in perspective');
  if (camera?.kind === 'perspective') parts.push(`the ${camera.fieldOfView} degree field of view`);
  const components = [...viewpoint.selection, ...(visibility?.exceptions ?? [])];
  const withoutIfcGuid = components.length - ifcGuidsOf(components).length;
  if (withoutIfcGuid > 0) parts.push(`${withoutIfcGuid} components named with no IFC GlobalId`);
  if (viewpoint.coloring.length > 0) parts.push(`${viewpoint.coloring.length} colour groups`);
  if (viewpoint.lines.length > 0) parts.push(`${viewpoint.lines.length} lines`);
  const hintsDiffer =
    visibility !== null &&
    [visibility.spacesVisible, visibility.spaceBoundariesVisible, visibility.openingsVisible].some(
      (shown) => shown !== visibility.defaultVisibility,
    );
  if (hintsDiffer) parts.push('the separate visibility of spaces, space boundaries and openings');
  return parts;
}

export async function restoreViewpoint({
  viewer,
  tileset,
  service,
  viewpoint,
}: {
  viewer: Viewer;
  tileset: Cesium3DTileset;
  service: TiletopiaElementService;
  viewpoint: BcfViewpoint;
}): Promise<RestoredViewpoint> {
  const { camera, visibility, clippingPlanes } = viewpoint;
  if (!camera) throw new Error('This viewpoint has only a snapshot and no camera, so it cannot be restored.');

  const selection = await resolveElementIds(service, ifcGuidsOf(viewpoint.selection));
  const exceptions: ResolvedElements | null = visibility
    ? await resolveElementIds(service, ifcGuidsOf(visibility.exceptions))
    : null;
  const notApplied = unappliedParts(viewpoint);
  const axisPlanes = clippingPlanes.flatMap((plane) => {
    const section = sectionFromPlane(tileset, plane);
    return section ? [section] : [];
  });
  const section = axisPlanes.length === 1 && clippingPlanes.length === 1 ? axisPlanes[0] : null;
  const faces =
    section === null
      ? clippingPlanes.flatMap((plane, index) => {
          const face = faceFromPlane(tileset, plane, `bcf-${index}`);
          return face ? [face] : [];
        })
      : [];

  setCamera(viewer, tileset, camera);

  const store = useElementStore.getState();
  const selectedIds = selection.located.map((row) => row.id);
  if (selectedIds.length > 0) store.selectElements(selectedIds);
  else store.clearSelection();
  store.showHidden();
  store.endIsolation();
  const exceptionIds = exceptions?.located.map((row) => row.id) ?? [];
  const isolating = visibility?.defaultVisibility === false;
  if (isolating) store.isolateElements(exceptionIds);
  else store.hideElements(exceptionIds);

  const requestRender = () => viewer.scene.requestRender();
  if (section) applyTilesetSection(tileset, section, requestRender);
  else disableTilesetSection(tileset, requestRender);
  replaceFacePlanes(tileset, faces, requestRender);

  return {
    selected: selectedIds.length,
    hidden: isolating ? 0 : exceptionIds.length,
    isolated: isolating ? exceptionIds.length : null,
    notInModel: [...new Set([...selection.notFound, ...(exceptions?.notFound ?? [])])],
    withoutMesh: [...new Set([...selection.withoutMesh, ...(exceptions?.withoutMesh ?? [])])],
    notApplied,
  };
}

function bcfVector({ x, y, z }: Cartesian3): BcfVector {
  return [x, y, z];
}

function bcfDirection(toModel: Matrix4, direction: Cartesian3): BcfVector {
  const inModel = Matrix4.multiplyByPointAsVector(toModel, direction, new Cartesian3());
  return bcfVector(Cartesian3.normalize(inModel, inModel));
}

function componentsOf(ids: Iterable<string>): BcfComponent[] {
  return [...ids].map((ifcGuid) => ({ ifcGuid, originatingSystem: null, authoringToolId: null }));
}

function cameraOf(camera: Camera, toModel: Matrix4): BcfCamera {
  const { frustum } = camera;
  // of cesium's frustums only PerspectiveFrustum has fovy
  if (!('fovy' in frustum) || frustum.fovy === undefined || frustum.aspectRatio === undefined) {
    throw new Error('Only a perspective camera can be saved as a viewpoint.');
  }
  return {
    kind: 'perspective',
    cameraViewPoint: bcfVector(Matrix4.multiplyByPoint(toModel, camera.positionWC, new Cartesian3())),
    cameraDirection: bcfDirection(toModel, camera.directionWC),
    cameraUpVector: bcfDirection(toModel, camera.upWC),
    // bcf 3.0 FieldOfView is the vertical angle in degrees
    fieldOfView: CesiumMath.toDegrees(frustum.fovy),
    aspectRatio: frustum.aspectRatio,
  };
}

function visibilityOf(hidden: ReadonlySet<string>, isolated: ReadonlySet<string> | null): BcfVisibility {
  const shownByDefault = isolated === null;
  const exceptions = isolated === null ? [...hidden] : [...isolated].filter((id) => !hidden.has(id));
  return {
    defaultVisibility: shownByDefault,
    spacesVisible: shownByDefault,
    spaceBoundariesVisible: shownByDefault,
    openingsVisible: shownByDefault,
    exceptions: componentsOf(exceptions),
  };
}

function planeFromSection(tileset: Cesium3DTileset, { axis, position, flip }: TilesetSection): BcfClippingPlane {
  const toModel = Matrix4.multiply(
    Matrix4.inverse(tileset.root.computedTransform, new Matrix4()),
    sectionFrame(tileset),
    new Matrix4(),
  );
  const location = new Cartesian3();
  location[axis] = position;
  const direction = new Cartesian3();
  direction[axis] = flip ? -1 : 1;
  return {
    location: bcfVector(Matrix4.multiplyByPoint(toModel, location, new Cartesian3())),
    direction: bcfDirection(toModel, direction),
  };
}

export function captureViewpoint({
  viewer,
  tileset,
}: {
  viewer: Viewer;
  tileset: Cesium3DTileset;
}): BcfViewpoint {
  // tiletopia's bcf coordinates are in the frame of tileset.root.computedTransform
  const toModel = Matrix4.inverse(tileset.root.computedTransform, new Matrix4());
  const { selected, hidden, isolated } = useElementStore.getState();
  const section = readTilesetSection(tileset);
  const faces = readFacePlanes(tileset).map((face) => planeFromFace(tileset, face));
  return {
    guid: randomUuid(),
    index: null,
    snapshotFormat: null,
    camera: cameraOf(viewer.camera, toModel),
    selection: componentsOf(selected),
    visibility: visibilityOf(hidden, isolated),
    coloring: [],
    lines: [],
    clippingPlanes: [...(section?.enabled ? [planeFromSection(tileset, section)] : []), ...faces],
  };
}

function planeFromFace(tileset: Cesium3DTileset, face: FacePlane): BcfClippingPlane {
  const toModel = Matrix4.multiply(
    Matrix4.inverse(tileset.root.computedTransform, new Matrix4()),
    sectionFrame(tileset),
    new Matrix4(),
  );
  const location = Cartesian3.multiplyByScalar(Cartesian3.fromArray(face.normal), face.offset, new Cartesian3());
  return {
    location: bcfVector(Matrix4.multiplyByPoint(toModel, location, new Cartesian3())),
    direction: bcfDirection(toModel, Cartesian3.fromArray(face.normal)),
  };
}
