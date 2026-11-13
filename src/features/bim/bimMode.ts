import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  Ellipsoid,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  Ray,
  SceneMode,
  Transforms,
} from 'cesium';
import type { Camera, Cesium3DTileset, Viewer } from 'cesium';
import { useElementStore, type ElementModel } from '../elements/store';
import { leavePlanView, planViewIsOn } from './planView';
import {
  BIM_MODE_OFF,
  requireBimSession,
  storeyViewShowing,
  useBimModeStore,
  type BimNavigation,
  type BimSession,
} from './store';

interface RayPick {
  object: { primitive: unknown } | undefined;
  position: Cartesian3 | undefined;
}

declare module 'cesium' {
  interface Scene {
    // Scene.drillPickFromRay is marked @private in cesium 1.147 and missing from its typings
    drillPickFromRay(ray: Ray, limit?: number, objectsToExclude?: object[], width?: number): RayPick[];
  }
}

const INTERIOR_NEAR_METRES = 0.1;
const INTERIOR_MINIMUM_ZOOM_METRES = 0.1;
const NO_INERTIA = 0;
// rotate3D turns at the distance from the orbit point minus one metre, so a closer orbit hardly moves
const SHORTEST_ORBIT_RANGE_METRES = 2;
const EYE_HEIGHT_METRES = 1.6;
const WALK_METRES_PER_SECOND = 2;
const LOOK_RADIANS_PER_PIXEL = 0.003;
const STEEPEST_LOOK_RADIANS = 1.5;
const BODY_RADIUS_METRES = 0.3;

export const WALK_KEYS: Record<string, { forward: number; right: number }> = {
  KeyW: { forward: 1, right: 0 },
  ArrowUp: { forward: 1, right: 0 },
  KeyS: { forward: -1, right: 0 },
  ArrowDown: { forward: -1, right: 0 },
  KeyD: { forward: 0, right: 1 },
  ArrowRight: { forward: 0, right: 1 },
  KeyA: { forward: 0, right: -1 },
  ArrowLeft: { forward: 0, right: -1 },
};

function releaseOrbitPoint({ viewer, settingsBefore }: BimSession): void {
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.constrainedAxis = settingsBefore.constrainedAxis;
}

function applyNavigationInputs({ viewer, settingsBefore }: BimSession, navigation: BimNavigation): void {
  const controller = viewer.scene.screenSpaceCameraController;
  const orbiting = navigation === 'orbit';
  // camera flights turn enableInputs back on, so walking turns off each input instead
  controller.enableRotate = orbiting && settingsBefore.enableRotate;
  controller.enableZoom = orbiting && settingsBefore.enableZoom;
  controller.enableTilt = orbiting && settingsBefore.enableTilt;
  controller.enableLook = orbiting && settingsBefore.enableLook;
}

export function setBimNavigation(navigation: BimNavigation): void {
  const session = requireBimSession();
  if (planViewIsOn(session.viewer)) leavePlanView(session.viewer);
  releaseOrbitPoint(session);
  applyNavigationInputs(session, navigation);
  useBimModeStore.setState({ navigation, floorHeight: null, notice: null });
}

export function enterBimMode({
  viewer,
  tileset,
  model,
  navigation,
}: {
  viewer: Viewer;
  tileset: Cesium3DTileset;
  model: ElementModel;
  navigation: BimNavigation;
}): void {
  const running = useBimModeStore.getState().session;
  if (running?.viewer === viewer && running.tileset === tileset) {
    setBimNavigation(navigation);
    return;
  }
  const { scene, camera } = viewer;
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new Error('BIM mode needs the 3D view of the globe.');
  }
  leaveBimMode();
  const controller = scene.screenSpaceCameraController;
  const session: BimSession = {
    viewer,
    tileset,
    model,
    storeyContents: new Map(),
    settingsBefore: {
      near: camera.frustum.near,
      logarithmicDepthBuffer: scene.logarithmicDepthBuffer,
      depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
      enableCollisionDetection: controller.enableCollisionDetection,
      minimumZoomDistance: controller.minimumZoomDistance,
      inertiaSpin: controller.inertiaSpin,
      inertiaZoom: controller.inertiaZoom,
      enableRotate: controller.enableRotate,
      enableZoom: controller.enableZoom,
      enableTilt: controller.enableTilt,
      enableLook: controller.enableLook,
      constrainedAxis: camera.constrainedAxis,
      edgeDisplayMode: tileset.edgeDisplayMode,
    },
  };
  // cesium never draws closer than frustum.near, whose default of one metre cuts a wall beside the camera
  camera.frustum.near = INTERIOR_NEAR_METRES;
  // cesium's linear depth buffer splits the scene into frustums at a far to near ratio of 1000, where logarithmic depth allows 1e9
  scene.logarithmicDepthBuffer = true;
  // cesium clears terrain depth before drawing tiles while this is false, so terrain does not hide a floor below its surface
  scene.globe.depthTestAgainstTerrain = false;
  // adjustHeightForTerrain lifts the camera to the terrain surface while this is true, which pushes it out of a basement
  controller.enableCollisionDetection = false;
  controller.minimumZoomDistance = INTERIOR_MINIMUM_ZOOM_METRES;
  // cesium inertia keeps the camera moving after the mouse is released, through the wall of a small room
  controller.inertiaSpin = NO_INERTIA;
  controller.inertiaZoom = NO_INERTIA;
  applyNavigationInputs(session, navigation);
  useBimModeStore.setState({ ...BIM_MODE_OFF, session, navigation });
}

export function endStoreyView(): void {
  const { storeyView } = useBimModeStore.getState();
  const elements = useElementStore.getState();
  const showing = storeyViewShowing(storeyView, elements.isolated);
  useBimModeStore.setState({ storeyView: null });
  if (!showing) return;
  if (showing.isolatedBefore) elements.isolateElements(showing.isolatedBefore);
  else elements.endIsolation();
}

export function leaveBimMode(): void {
  const { session } = useBimModeStore.getState();
  if (!session) return;
  endStoreyView();
  const { viewer, tileset, settingsBefore } = session;
  if (!tileset.isDestroyed()) tileset.edgeDisplayMode = settingsBefore.edgeDisplayMode;
  // destroyed viewers take these settings with them, and the replacement starts on cesium's defaults
  if (!viewer.isDestroyed()) {
    const { scene, camera } = viewer;
    const controller = scene.screenSpaceCameraController;
    if (planViewIsOn(viewer)) leavePlanView(viewer);
    releaseOrbitPoint(session);
    camera.frustum.near = settingsBefore.near;
    scene.logarithmicDepthBuffer = settingsBefore.logarithmicDepthBuffer;
    scene.globe.depthTestAgainstTerrain = settingsBefore.depthTestAgainstTerrain;
    controller.enableCollisionDetection = settingsBefore.enableCollisionDetection;
    controller.minimumZoomDistance = settingsBefore.minimumZoomDistance;
    controller.inertiaSpin = settingsBefore.inertiaSpin;
    controller.inertiaZoom = settingsBefore.inertiaZoom;
    controller.enableRotate = settingsBefore.enableRotate;
    controller.enableZoom = settingsBefore.enableZoom;
    controller.enableTilt = settingsBefore.enableTilt;
    controller.enableLook = settingsBefore.enableLook;
  }
  useBimModeStore.setState(BIM_MODE_OFF);
}

function pickedPointOnModel(
  { viewer, tileset, model }: BimSession,
  windowPosition: Cartesian2,
): Cartesian3 | null {
  const { scene } = viewer;
  const refuse = (notice: string) => {
    useBimModeStore.setState({ notice });
    return null;
  };
  if (!scene.pickPositionSupported) {
    return refuse('This browser cannot read positions from the depth buffer, so a click cannot choose a point.');
  }
  if (scene.pick(windowPosition)?.primitive !== tileset) {
    return refuse(`That click did not land on ${model.name}.`);
  }
  return scene.pickPosition(windowPosition) ?? refuse(`That click found no depth on ${model.name}.`);
}

export function orbitAroundPick(windowPosition: Cartesian2): void {
  const session = requireBimSession();
  const point = pickedPointOnModel(session, windowPosition);
  if (!point) return;
  const { camera } = session.viewer;
  const range = Math.max(Cartesian3.distance(camera.positionWC, point), SHORTEST_ORBIT_RANGE_METRES);
  const offset = new HeadingPitchRange(camera.heading, camera.pitch, range);
  // camera.rotateRight turns about the camera's own up with no constrained axis, which rolls the horizon
  camera.constrainedAxis = Cartesian3.UNIT_Z;
  // spin3D turns about the origin of camera.transform whenever that is not the identity
  camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(point), offset);
  useBimModeStore.setState({ notice: null });
}

const FLOOR_SLOPE_SAMPLE_PIXELS = 2;

function surfaceTiltFromUp(
  { viewer }: BimSession,
  windowPosition: Cartesian2,
  point: Cartesian3,
): number | undefined {
  const { scene, camera } = viewer;
  const besideRight = scene.pickPosition(
    new Cartesian2(windowPosition.x + FLOOR_SLOPE_SAMPLE_PIXELS, windowPosition.y),
  );
  const besideBelow = scene.pickPosition(
    new Cartesian2(windowPosition.x, windowPosition.y + FLOOR_SLOPE_SAMPLE_PIXELS),
  );
  if (!besideRight || !besideBelow) return undefined;
  const normal = Cartesian3.cross(
    Cartesian3.subtract(besideRight, point, new Cartesian3()),
    Cartesian3.subtract(besideBelow, point, new Cartesian3()),
    new Cartesian3(),
  );
  if (Cartesian3.equals(normal, Cartesian3.ZERO)) return undefined;
  const towardCamera = Cartesian3.subtract(camera.positionWC, point, new Cartesian3());
  if (Cartesian3.dot(normal, towardCamera) < 0) Cartesian3.negate(normal, normal);
  return Cartesian3.angleBetween(normal, Ellipsoid.default.geodeticSurfaceNormal(point, new Cartesian3()));
}

const STEEPEST_FLOOR_RADIANS = (20 * Math.PI) / 180;

export function standOnPick(windowPosition: Cartesian2): void {
  const session = requireBimSession();
  const point = pickedPointOnModel(session, windowPosition);
  if (!point) return;
  const tilt = surfaceTiltFromUp(session, windowPosition, point);
  if (tilt === undefined) {
    useBimModeStore.setState({
      notice: `That click is too near an edge of ${session.model.name} to tell which way the surface faces.`,
    });
    return;
  }
  if (tilt > STEEPEST_FLOOR_RADIANS) {
    useBimModeStore.setState({
      notice: 'That surface does not face up, so it is not a floor. Click a floor to stand on it.',
    });
    return;
  }
  const { camera } = session.viewer;
  const { longitude, latitude, height: floorHeight } = Cartographic.fromCartesian(point);
  camera.setView({
    destination: Cartesian3.fromRadians(longitude, latitude, floorHeight + EYE_HEIGHT_METRES),
    orientation: { heading: camera.heading, pitch: 0, roll: 0 },
  });
  useBimModeStore.setState({ floorHeight, notice: null });
}

interface FeetFrame {
  session: BimSession;
  toWorld: Matrix4;
  toLocal: Matrix4;
}

// cesium's drillPickFromRay draws the scene once per hit, up to fifteen draws for the five casts of one walk step
const HITS_PER_CAST = 3;
// tiletopia writes the IFC entity name of each element into this tile feature property
const IFC_CLASS_PROPERTY = 'class';
// tiletopia tiles IFC doors as closed leaves
const WALK_THROUGH_CLASSES = new Set(['IfcDoor', 'IfcDoorStandardCase']);

function blocksWalking(hit: RayPick, tileset: Cesium3DTileset): boolean {
  if (hit.object?.primitive !== tileset) return false;
  const isWalkThrough =
    hit.object instanceof Cesium3DTileFeature &&
    WALK_THROUGH_CLASSES.has(String(hit.object.getProperty(IFC_CLASS_PROPERTY)));
  return !isWalkThrough;
}

function castFromFeet(
  { session, toWorld, toLocal }: FeetFrame,
  origin: Cartesian3,
  direction: Cartesian3,
): Cartesian3 | undefined {
  const ray = new Ray(
    Matrix4.multiplyByPoint(toWorld, origin, new Cartesian3()),
    Matrix4.multiplyByPointAsVector(toWorld, direction, new Cartesian3()),
  );
  // cesium orders the hits nearest first
  const hits = session.viewer.scene.drillPickFromRay(ray, HITS_PER_CAST);
  const position = hits.find((hit) => blocksWalking(hit, session.tileset))?.position;
  if (!position) return undefined;
  return Matrix4.multiplyByPoint(toLocal, position, new Cartesian3());
}

function blocks(hit: Cartesian3, metres: number): boolean {
  return Math.hypot(hit.x, hit.y) - metres < BODY_RADIUS_METRES;
}

const KNEE_HEIGHT_METRES = 0.5;
const CHEST_HEIGHT_METRES = 1.3;

function nearestWall(feet: FeetFrame, direction: Cartesian3): Cartesian3 | undefined {
  let nearest: Cartesian3 | undefined;
  for (const height of [KNEE_HEIGHT_METRES, CHEST_HEIGHT_METRES]) {
    const hit = castFromFeet(feet, new Cartesian3(0, 0, height), direction);
    if (hit && (!nearest || Math.hypot(hit.x, hit.y) < Math.hypot(nearest.x, nearest.y))) nearest = hit;
  }
  return nearest;
}

const WALL_PROBE_RADIANS = (20 * Math.PI) / 180;
const SHORTEST_SLIDE_METRES = 0.001;

function slideAlongWall(feet: FeetFrame, step: Cartesian3, wall: Cartesian3): Cartesian3 | undefined {
  const wallHeight = new Cartesian3(0, 0, wall.z);
  // cesium ray picks return the hit position and no surface normal
  const probeAngle = Math.atan2(step.y, step.x) + WALL_PROBE_RADIANS;
  const probe = castFromFeet(feet, wallHeight, new Cartesian3(Math.cos(probeAngle), Math.sin(probeAngle), 0));
  if (!probe) return undefined;
  const alongWall = new Cartesian3(probe.x - wall.x, probe.y - wall.y, 0);
  if (Cartesian3.magnitude(alongWall) < SHORTEST_SLIDE_METRES) return undefined;
  Cartesian3.normalize(alongWall, alongWall);
  const awayFromWall = new Cartesian3(-alongWall.y, alongWall.x, 0);
  let clearance = -Cartesian3.dot(wall, awayFromWall);
  if (clearance < 0) {
    Cartesian3.negate(awayFromWall, awayFromWall);
    clearance = -clearance;
  }
  const pushOut = Math.min(Math.max(BODY_RADIUS_METRES - clearance, 0), Cartesian3.magnitude(step));
  const slide = Cartesian3.add(
    Cartesian3.multiplyByScalar(alongWall, Cartesian3.dot(step, alongWall), new Cartesian3()),
    Cartesian3.multiplyByScalar(awayFromWall, pushOut, new Cartesian3()),
    new Cartesian3(),
  );
  const slideMetres = Cartesian3.magnitude(slide);
  if (slideMetres < SHORTEST_SLIDE_METRES) return undefined;
  const ahead = castFromFeet(feet, wallHeight, Cartesian3.normalize(slide, new Cartesian3()));
  return ahead && blocks(ahead, slideMetres) ? undefined : slide;
}

const STEP_HEIGHT_METRES = 0.3;
const FLOOR_CAST_HEIGHT_METRES = 1.8;

export function stepWalk(
  session: BimSession,
  pressedKeys: ReadonlySet<string>,
  seconds: number,
  floorHeight: number,
): number {
  let forward = 0;
  let right = 0;
  for (const key of pressedKeys) {
    forward += WALK_KEYS[key].forward;
    right += WALK_KEYS[key].right;
  }
  const length = Math.hypot(forward, right);
  if (length === 0 || seconds === 0) return floorHeight;
  const metres = (WALK_METRES_PER_SECOND * seconds) / length;
  const { camera } = session.viewer;
  const { heading, pitch } = camera;
  const step = new Cartesian3(
    metres * (forward * Math.sin(heading) + right * Math.cos(heading)),
    metres * (forward * Math.cos(heading) - right * Math.sin(heading)),
    0,
  );
  const { longitude, latitude } = Cartographic.fromCartesian(camera.positionWC);
  const toWorld = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromRadians(longitude, latitude, floorHeight));
  const feet = { session, toWorld, toLocal: Matrix4.inverseTransformation(toWorld, new Matrix4()) };
  const wall = nearestWall(feet, Cartesian3.normalize(step, new Cartesian3()));
  const move = wall && blocks(wall, Cartesian3.magnitude(step)) ? slideAlongWall(feet, step, wall) : step;
  if (!move) return floorHeight;
  const floor = castFromFeet(
    feet,
    new Cartesian3(move.x, move.y, FLOOR_CAST_HEIGHT_METRES),
    new Cartesian3(0, 0, -1),
  );
  if (!floor || floor.z > STEP_HEIGHT_METRES) return floorHeight;
  const movedFeet = Cartographic.fromCartesian(Matrix4.multiplyByPoint(toWorld, move, new Cartesian3()));
  const movedFloorHeight = floorHeight + floor.z;
  const eyeHeight = movedFloorHeight + EYE_HEIGHT_METRES;
  camera.setView({
    destination: Cartesian3.fromRadians(movedFeet.longitude, movedFeet.latitude, eyeHeight),
    orientation: { heading, pitch, roll: 0 },
  });
  return movedFloorHeight;
}

export function lookBy(camera: Camera, rightPixels: number, downPixels: number): void {
  camera.setView({
    orientation: {
      heading: camera.heading + rightPixels * LOOK_RADIANS_PER_PIXEL,
      pitch: CesiumMath.clamp(
        camera.pitch - downPixels * LOOK_RADIANS_PER_PIXEL,
        -STEEPEST_LOOK_RADIANS,
        STEEPEST_LOOK_RADIANS,
      ),
      roll: 0,
    },
  });
}
