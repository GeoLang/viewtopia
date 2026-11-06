import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, renderHook } from '@testing-library/react';

interface FakeHandler {
  actions: Map<number, (event: unknown) => void>;
  destroyed: boolean;
}

const createdHandlers = vi.hoisted(() => [] as FakeHandler[]);

// the canvas event source and the WebGL tile feature stay out, and the rest of cesium is real
vi.mock('cesium', async (importOriginal) => {
  const real = await importOriginal<typeof import('cesium')>();
  class Cesium3DTileFeature {
    constructor(
      readonly primitive: unknown,
      readonly properties: Record<string, unknown>,
    ) {}
    getProperty(name: string) {
      return this.properties[name];
    }
  }
  class ScreenSpaceEventHandler implements FakeHandler {
    actions = new Map<number, (event: unknown) => void>();
    destroyed = false;
    constructor() {
      createdHandlers.push(this);
    }
    setInputAction(action: (event: unknown) => void, type: number, modifier?: number) {
      if (modifier === undefined) this.actions.set(type, action);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { ...real, ScreenSpaceEventHandler, Cesium3DTileFeature };
});

import {
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  EdgeDisplayMode,
  Matrix4,
  Ray,
  SceneMode,
  ScreenSpaceEventType,
  Transforms,
  type Cartesian2,
} from 'cesium';
import { enterBimMode, leaveBimMode, setBimNavigation } from '../../src/features/bim/bimMode';
import { setEdgesShown } from '../../src/features/bim/edges';
import { BIM_MODE_OFF, useBimModeStore, type BimNavigation } from '../../src/features/bim/store';
import { useBimNavigationCesium } from '../../src/features/bim/useBimNavigationCesium';
import { useElementStore } from '../../src/features/elements/store';
import { useElementStyleCesium } from '../../src/features/elements/useElementStyleCesium';
import { useFeaturePickerCesium } from '../../src/hooks/useFeaturePickerCesium';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import {
  asTileset,
  asViewer,
  fakeBimTileset,
  fakeBimViewer,
  isReleasedFromOrbit,
  viewerSettings,
  type FakeBimViewer,
} from './stubs/fakeBimViewer';
import { fakeTileFeature } from './stubs/fakeElementServer';

const LAYER = { id: 'a1b2', name: 'tower.ifc', url: '/tiles/v1/assets/a1b2/tileset.json', visible: true };
const CLICK = { x: 40, y: 60 };
const FLOOR_POINT = Cartesian3.fromDegrees(-71.001, 42.001, 30);
const FLOOR_HEIGHT = 30;
const EYE_HEIGHT = 1.6;
const WALK_METRES_PER_SECOND = 2;
const BODY_RADIUS = 0.3;
const WALK_TICK_MILLISECONDS = 50;
const WALK_TICK_METRES = (WALK_METRES_PER_SECOND * WALK_TICK_MILLISECONDS) / 1000;
const FLOOR_FRAME = Transforms.eastNorthUpToFixedFrame(FLOOR_POINT);
const FROM_FLOOR_FRAME = Matrix4.inverseTransformation(FLOOR_FRAME, new Matrix4());
// cesium ray picks draw through an orthographic frustum whose near plane is 0.1 m from the ray origin
const RAY_PICK_NEAR_METRES = 0.1;

interface Slab {
  id: string;
  min: [number, number, number];
  max: [number, number, number];
  ifcClass?: string;
  // set for an object that is not part of the model, like a measurement label
  primitive?: unknown;
}

const FLOOR: Slab = { id: 'floor', min: [-50, -50, -0.3], max: [50, 50, 0] };
const WALL_NORTH = 1.05;
const WALL: Slab = { id: 'wall', min: [-10, WALL_NORTH, 0], max: [10, WALL_NORTH + 0.2, 3] };

let viewer: FakeBimViewer;
let tileset: ReturnType<typeof fakeBimTileset>;
let now: MockInstance<() => number>;
let lastTickTime: number;

function enter(navigation: BimNavigation = 'orbit') {
  act(() => {
    enterBimMode({
      viewer: asViewer(viewer),
      tileset: asTileset(tileset),
      model: useElementStore.getState().openModel(LAYER),
      navigation,
    });
  });
}

function inputAction(type: ScreenSpaceEventType) {
  const handler = createdHandlers.filter((created) => !created.destroyed).find((created) => created.actions.has(type));
  if (!handler) throw new Error(`nothing is bound to ${type}`);
  return handler.actions.get(type) as (event: unknown) => void;
}

function inFloorFrame(local: Cartesian3): Cartesian3 {
  return Matrix4.multiplyByPoint(FLOOR_FRAME, local, new Cartesian3());
}

function clickSurface({ at, perPixelRight, perPixelDown }: Record<'at' | 'perPixelRight' | 'perPixelDown', Cartesian3>) {
  viewer.scene.pick.mockReturnValue({ primitive: tileset });
  viewer.scene.pickPosition.mockImplementation(({ x, y }: Cartesian2) => {
    const right = Cartesian3.multiplyByScalar(perPixelRight, x - CLICK.x, new Cartesian3());
    const down = Cartesian3.multiplyByScalar(perPixelDown, y - CLICK.y, new Cartesian3());
    return inFloorFrame(Cartesian3.add(at, Cartesian3.add(right, down, new Cartesian3()), new Cartesian3()));
  });
  act(() => inputAction(ScreenSpaceEventType.LEFT_CLICK)({ position: CLICK }));
}

function clickFloor() {
  clickSurface({
    at: new Cartesian3(0, 0, 0),
    perPixelRight: new Cartesian3(0.01, 0, 0),
    perPixelDown: new Cartesian3(0, -0.01, 0),
  });
}

function rendered({ id }: Slab): boolean {
  const show = asTileset(tileset).style?.show;
  if (!show) return true;
  return Boolean(show.evaluate(fakeTileFeature({ asset_id: id }) as unknown as Cesium3DTileFeature));
}

function entryDistance(origin: Cartesian3, direction: Cartesian3, { min, max }: Slab): number | undefined {
  const start = [origin.x, origin.y, origin.z];
  const toward = [direction.x, direction.y, direction.z];
  let entry = -Infinity;
  let exit = Infinity;
  for (const axis of [0, 1, 2]) {
    const toMin = (min[axis] - start[axis]) / toward[axis];
    const toMax = (max[axis] - start[axis]) / toward[axis];
    entry = Math.max(entry, Math.min(toMin, toMax));
    exit = Math.min(exit, Math.max(toMin, toMax));
  }
  return entry <= exit && entry >= RAY_PICK_NEAR_METRES ? entry : undefined;
}

function pickedObject({ id, ifcClass = 'IfcSlab', primitive }: Slab) {
  if (primitive) return { primitive };
  const FeatureClass = Cesium3DTileFeature as unknown as new (
    primitive: unknown,
    properties: Record<string, unknown>,
  ) => Cesium3DTileFeature;
  return new FeatureClass(tileset, { asset_id: id, class: ifcClass });
}

function renderSlabs(...slabs: Slab[]) {
  viewer.scene.drillPickFromRay.mockImplementation((ray: Ray, limit = Number.MAX_VALUE) => {
    const origin = Matrix4.multiplyByPoint(FROM_FLOOR_FRAME, ray.origin, new Cartesian3());
    const direction = Matrix4.multiplyByPointAsVector(FROM_FLOOR_FRAME, ray.direction, new Cartesian3());
    return slabs
      .filter(rendered)
      .flatMap((slab) => {
        const distance = entryDistance(origin, direction, slab);
        return distance === undefined ? [] : [{ slab, distance }];
      })
      .sort((nearer, farther) => nearer.distance - farther.distance)
      .slice(0, limit)
      .map(({ slab, distance }) => ({ object: pickedObject(slab), position: Ray.getPoint(ray, distance) }));
  });
}

function pressKey(code: string, target: EventTarget = document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

function tickAt(milliseconds: number) {
  now.mockReturnValue(milliseconds);
  for (const listener of viewer.tickListeners) listener();
}

function walkTicks(count: number) {
  for (let tick = 0; tick < count; tick += 1) {
    lastTickTime += WALK_TICK_MILLISECONDS;
    tickAt(lastTickTime);
  }
}

function cameraHeight(): number {
  return Cartographic.fromCartesian(viewer.camera.positionWC).height;
}

function cameraInFloorFrame(): Cartesian3 {
  return Matrix4.multiplyByPoint(FROM_FLOOR_FRAME, viewer.camera.positionWC, new Cartesian3());
}

function floorHeight(): number | null {
  return useBimModeStore.getState().floorHeight;
}

beforeEach(() => {
  createdHandlers.length = 0;
  now = vi.spyOn(performance, 'now').mockReturnValue(1000);
  lastTickTime = 1000;
  viewer = fakeBimViewer();
  tileset = fakeBimTileset();
  useBimModeStore.setState(BIM_MODE_OFF);
  useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
  useTiles3dLayerStore.setState({ layers: [LAYER], loaded: { a1b2: asTileset(tileset) } });
  useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
});

afterEach(() => {
  act(() => leaveBimMode());
  now.mockRestore();
});

describe('viewer settings', () => {
  it('applies the interior settings on entering', () => {
    enter();

    const { camera, scene } = viewer;
    const controller = scene.screenSpaceCameraController;
    expect(camera.frustum.near).toBe(0.1);
    expect(scene.logarithmicDepthBuffer).toBe(true);
    expect(scene.globe.depthTestAgainstTerrain).toBe(false);
    expect(controller.enableCollisionDetection).toBe(false);
    expect(controller.minimumZoomDistance).toBe(0.1);
    expect(controller.inertiaSpin).toBe(0);
    expect(controller.inertiaZoom).toBe(0);
  });

  it('puts every setting back on leaving, from walk with edges on', () => {
    const before = viewerSettings(viewer, tileset);
    enter('walk');
    act(() => setEdgesShown({ shown: true }));
    expect(tileset.edgeDisplayMode).toBe(EdgeDisplayMode.SURFACES_AND_EDGES);
    expect(viewer.scene.screenSpaceCameraController.enableRotate).toBe(false);

    act(() => leaveBimMode());

    expect(viewerSettings(viewer, tileset)).toEqual(before);
    expect(isReleasedFromOrbit(viewer)).toBe(true);
    expect(useBimModeStore.getState().session).toBeNull();
  });

  it('puts back inputs that were already off rather than turning them on', () => {
    viewer.scene.screenSpaceCameraController.enableTilt = false;

    enter('orbit');
    expect(viewer.scene.screenSpaceCameraController.enableTilt).toBe(false);
    act(() => setBimNavigation('walk'));
    act(() => setBimNavigation('orbit'));
    expect(viewer.scene.screenSpaceCameraController.enableTilt).toBe(false);
    expect(viewer.scene.screenSpaceCameraController.enableRotate).toBe(true);
  });

  it('refuses a scene that is not the 3D view, changing nothing', () => {
    viewer.scene.mode = SceneMode.SCENE2D;
    const before = viewerSettings(viewer, tileset);

    expect(() => enter()).toThrow('BIM mode needs the 3D view of the globe.');

    expect(viewerSettings(viewer, tileset)).toEqual(before);
    expect(useBimModeStore.getState().session).toBeNull();
  });

  it('keeps the first settings when entered twice, so leaving restores the originals', () => {
    const before = viewerSettings(viewer, tileset);
    enter();
    enter('walk');

    expect(useBimModeStore.getState().navigation).toBe('walk');
    act(() => leaveBimMode());

    expect(viewerSettings(viewer, tileset)).toEqual(before);
  });
});

describe('the mode ends with what it depends on', () => {
  it('ends when the viewer is destroyed, leaving the dead scene alone', () => {
    renderHook(() => useBimNavigationCesium());
    enter();
    const { near } = viewer.camera.frustum;

    viewer.destroy();
    act(() => useAppStore.setState({ renderer: 'maplibre' }));

    expect(useBimModeStore.getState().session).toBeNull();
    expect(viewer.camera.frustum.near).toBe(near);
  });

  it('ends and restores when its model leaves the globe', () => {
    renderHook(() => useBimNavigationCesium());
    const before = viewerSettings(viewer, tileset);
    enter();

    act(() => useTiles3dLayerStore.getState().removeLayer(LAYER.id));

    expect(useBimModeStore.getState().session).toBeNull();
    expect(viewerSettings(viewer, tileset)).toEqual(before);
  });

  it('ends when the element panel opens another model', () => {
    renderHook(() => useBimNavigationCesium());
    enter();

    act(() => {
      useElementStore.getState().openModel({ ...LAYER, id: 'c3d4', name: 'other.ifc' });
    });

    expect(useBimModeStore.getState().session).toBeNull();
  });
});

describe('orbit', () => {
  it('turns about the double-clicked point on the model, keeping the distance to it', () => {
    renderHook(() => useBimNavigationCesium());
    enter('orbit');
    viewer.scene.pick.mockReturnValue({ primitive: tileset });
    viewer.scene.pickPosition.mockReturnValue(FLOOR_POINT);

    act(() => inputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: CLICK }));

    const [frame, offset] = viewer.camera.lookAtTransform.mock.lastCall as [
      Matrix4,
      { heading: number; pitch: number; range: number },
    ];
    const origin = Matrix4.getTranslation(frame, new Cartesian3());
    expect(Cartesian3.distance(origin, FLOOR_POINT)).toBeLessThan(1e-6);
    expect(offset.range).toBeCloseTo(Cartesian3.distance(viewer.camera.positionWC, FLOOR_POINT), 5);
    expect(offset.pitch).toBe(viewer.camera.pitch);
    expect(viewer.camera.constrainedAxis).toEqual(Cartesian3.UNIT_Z);
  });

  it('backs off to two metres from a point closer than that', () => {
    renderHook(() => useBimNavigationCesium());
    enter('orbit');
    viewer.camera.positionWC = Cartesian3.fromDegrees(-71.001, 42.001, 30.5);
    viewer.scene.pick.mockReturnValue({ primitive: tileset });
    viewer.scene.pickPosition.mockReturnValue(FLOOR_POINT);

    act(() => inputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: CLICK }));

    const [, offset] = viewer.camera.lookAtTransform.mock.lastCall as [Matrix4, { range: number }];
    expect(offset.range).toBe(2);
  });

  it('refuses a click off the model, and says so', () => {
    renderHook(() => useBimNavigationCesium());
    enter('orbit');
    viewer.scene.pick.mockReturnValue({ primitive: { name: 'another tileset' } });
    viewer.scene.pickPosition.mockReturnValue(FLOOR_POINT);

    act(() => inputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: CLICK }));

    expect(viewer.camera.lookAtTransform).not.toHaveBeenCalled();
    expect(useBimModeStore.getState().notice).toBe('That click did not land on tower.ifc.');
  });

  it('refuses a browser with no depth picking, and a pixel with no depth', () => {
    renderHook(() => useBimNavigationCesium());
    enter('orbit');
    viewer.scene.pick.mockReturnValue({ primitive: tileset });
    viewer.scene.pickPosition.mockReturnValue(undefined);

    act(() => inputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: CLICK }));
    expect(useBimModeStore.getState().notice).toBe('That click found no depth on tower.ifc.');

    viewer.scene.pickPositionSupported = false;
    act(() => inputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: CLICK }));
    expect(useBimModeStore.getState().notice).toContain('cannot read positions from the depth buffer');
    expect(viewer.camera.lookAtTransform).not.toHaveBeenCalled();
  });
});

describe('walk', () => {
  beforeEach(() => {
    renderHook(() => useBimNavigationCesium());
    enter('walk');
    renderSlabs(FLOOR);
  });

  it('turns off the controller inputs and releases an orbit point', () => {
    const controller = viewer.scene.screenSpaceCameraController;
    expect(controller.enableRotate).toBe(false);
    expect(controller.enableZoom).toBe(false);
    expect(controller.enableTilt).toBe(false);
    expect(controller.enableLook).toBe(false);

    act(() => setBimNavigation('orbit'));
    act(() => setBimNavigation('walk'));
    expect(isReleasedFromOrbit(viewer)).toBe(true);
  });

  it('stands at eye height above the clicked floor, level', () => {
    clickFloor();

    expect(useBimModeStore.getState().floorHeight).toBeCloseTo(FLOOR_HEIGHT, 5);
    expect(cameraHeight()).toBeCloseTo(FLOOR_HEIGHT + EYE_HEIGHT, 5);
    expect(viewer.camera.pitch).toBe(0);
  });

  it('does not move before a floor is chosen, because the height is unknown', () => {
    const start = viewer.camera.positionWC;
    pressKey('KeyW');

    tickAt(1050);

    expect(viewer.camera.positionWC).toBe(start);
  });

  it('keeps the old floor when a click misses the model', () => {
    clickFloor();
    viewer.scene.pick.mockReturnValue(undefined);

    act(() => inputAction(ScreenSpaceEventType.LEFT_CLICK)({ position: CLICK }));

    expect(useBimModeStore.getState().floorHeight).toBeCloseTo(FLOOR_HEIGHT, 5);
    expect(useBimModeStore.getState().notice).toBe('That click did not land on tower.ifc.');
  });

  it('walks north at heading zero at the set speed and stays at eye height with a pitched view', () => {
    clickFloor();
    viewer.camera.pitch = -0.5;
    const start = viewer.camera.positionWC;
    pressKey('KeyW');

    tickAt(1050);

    const startLatitude = Cartographic.fromCartesian(start).latitude;
    const moved = Cartographic.fromCartesian(viewer.camera.positionWC);
    expect(moved.latitude).toBeGreaterThan(startLatitude);
    expect(moved.height).toBeCloseTo(FLOOR_HEIGHT + EYE_HEIGHT, 5);
    expect(Cartesian3.distance(start, viewer.camera.positionWC)).toBeCloseTo(WALK_METRES_PER_SECOND * 0.05, 3);
    expect(viewer.camera.pitch).toBe(-0.5);
  });

  it('walks east on the right key at heading zero, and stops when the key is up', () => {
    clickFloor();
    const start = viewer.camera.positionWC;
    pressKey('ArrowRight');
    tickAt(1050);
    const moved = viewer.camera.positionWC;
    expect(Cartographic.fromCartesian(moved).longitude).toBeGreaterThan(Cartographic.fromCartesian(start).longitude);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    tickAt(1100);

    expect(viewer.camera.positionWC).toBe(moved);
  });

  it('limits one step after a stalled frame', () => {
    clickFloor();
    const start = viewer.camera.positionWC;
    pressKey('KeyW');

    tickAt(61_000);

    expect(Cartesian3.distance(start, viewer.camera.positionWC)).toBeCloseTo(WALK_METRES_PER_SECOND * 0.1, 3);
  });

  it('forgets held keys when the window loses focus', () => {
    clickFloor();
    const start = viewer.camera.positionWC;
    pressKey('KeyW');

    window.dispatchEvent(new Event('blur'));
    tickAt(1050);

    expect(viewer.camera.positionWC).toBe(start);
  });

  it('takes no walk keys from a text field', () => {
    clickFloor();
    const start = viewer.camera.positionWC;
    const field = document.createElement('textarea');
    document.body.appendChild(field);

    pressKey('KeyW', field);
    tickAt(1050);
    field.remove();

    expect(viewer.camera.positionWC).toBe(start);
  });

  it('keeps a walk key from the bare-key shortcuts on window, and leaves other keys alone', () => {
    const shortcut = vi.fn();
    window.addEventListener('keydown', shortcut);

    pressKey('KeyA');
    expect(shortcut).not.toHaveBeenCalled();

    pressKey('KeyT');
    expect(shortcut).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', shortcut);
  });

  it('turns the view only while dragging, and stops short of straight up', () => {
    const move = inputAction(ScreenSpaceEventType.MOUSE_MOVE);
    const startHeading = viewer.camera.heading;
    const drag = (x: number, y: number) => ({ startPosition: { x: 0, y: 0 }, endPosition: { x, y } });

    act(() => move(drag(100, 0)));
    expect(viewer.camera.heading).toBe(startHeading);

    act(() => inputAction(ScreenSpaceEventType.LEFT_DOWN)({ position: CLICK }));
    act(() => move(drag(100, 0)));
    expect(viewer.camera.heading).toBeGreaterThan(startHeading);

    act(() => move(drag(0, -100_000)));
    expect(viewer.camera.pitch).toBe(1.5);

    act(() => inputAction(ScreenSpaceEventType.LEFT_UP)({ position: CLICK }));
    const headingAfterDrag = viewer.camera.heading;
    act(() => move(drag(100, 0)));
    expect(viewer.camera.heading).toBe(headingAfterDrag);
  });

  it('unbinds its keys and frame listener on leaving', () => {
    clickFloor();

    act(() => leaveBimMode());

    expect(viewer.tickListeners.size).toBe(0);
    expect(createdHandlers.every((created) => created.destroyed)).toBe(true);
  });

  it('keeps left clicks from selecting elements while walking', () => {
    useFeaturePickerStore.setState({ enabled: true, selected: null });
    renderHook(() => useFeaturePickerCesium({ current: asViewer(viewer) }));
    const pickerClick = createdHandlers.at(-1)?.actions.get(ScreenSpaceEventType.LEFT_CLICK);
    viewer.scene.pick.mockClear();

    act(() => pickerClick?.({ position: CLICK }));

    expect(viewer.scene.pick).not.toHaveBeenCalled();
  });

  it('takes a floor only from a surface that faces up, so a click on a wall keeps the old floor', () => {
    clickFloor();

    clickSurface({
      at: new Cartesian3(0, WALL_NORTH, 1.2),
      perPixelRight: new Cartesian3(0.01, 0, 0),
      perPixelDown: new Cartesian3(0, 0, -0.01),
    });

    expect(floorHeight()).toBeCloseTo(FLOOR_HEIGHT, 5);
    expect(cameraHeight()).toBeCloseTo(FLOOR_HEIGHT + EYE_HEIGHT, 5);
    expect(useBimModeStore.getState().notice).toBe(
      'That surface does not face up, so it is not a floor. Click a floor to stand on it.',
    );
  });

  it('stops a body radius short of a wall straight ahead', () => {
    renderSlabs(FLOOR, WALL);
    clickFloor();
    pressKey('KeyW');

    walkTicks(20);

    const clearance = WALL_NORTH - cameraInFloorFrame().y;
    expect(clearance).toBeGreaterThanOrEqual(BODY_RADIUS);
    expect(clearance).toBeLessThan(BODY_RADIUS + WALK_TICK_METRES);
  });

  it('slides along a wall met at an angle instead of stopping', () => {
    renderSlabs(FLOOR, WALL);
    clickFloor();
    viewer.camera.heading = Math.PI / 4;
    pressKey('KeyW');

    let closest = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 30; tick += 1) {
      walkTicks(1);
      closest = Math.min(closest, WALL_NORTH - cameraInFloorFrame().y);
    }

    expect(closest).toBeGreaterThan(BODY_RADIUS - WALK_TICK_METRES);
    expect(cameraInFloorFrame().x).toBeGreaterThan(1.5);
    expect(viewer.camera.heading).toBe(Math.PI / 4);
  });

  it('climbs a stair one tread at a time', () => {
    renderSlabs(
      FLOOR,
      { id: 'tread-1', min: [-10, 0.55, 0], max: [10, 50, 0.18] },
      { id: 'tread-2', min: [-10, 0.85, 0.18], max: [10, 50, 0.36] },
    );
    clickFloor();
    pressKey('KeyW');

    walkTicks(12);

    expect(cameraInFloorFrame().y).toBeCloseTo(1.2, 3);
    expect(floorHeight()).toBeCloseTo(FLOOR_HEIGHT + 0.36, 5);
    expect(cameraHeight()).toBeCloseTo(FLOOR_HEIGHT + 0.36 + EYE_HEIGHT, 5);
  });

  it('refuses a step higher than 30 cm, staying on the floor', () => {
    renderSlabs(FLOOR, { id: 'plinth', min: [-10, 0.55, 0], max: [10, 50, 0.45] });
    clickFloor();
    pressKey('KeyW');

    walkTicks(10);

    expect(cameraInFloorFrame().y).toBeLessThan(0.55);
    expect(floorHeight()).toBeCloseTo(FLOOR_HEIGHT, 5);
    expect(cameraHeight()).toBeCloseTo(FLOOR_HEIGHT + EYE_HEIGHT, 5);
  });

  it('drops to a lower floor past an edge, and not up onto a ceiling above the head', () => {
    renderSlabs(
      { id: 'landing', min: [-50, -50, -0.3], max: [50, 0.55, 0] },
      { id: 'lower-floor', min: [-50, 0.55, -3.3], max: [50, 50, -3] },
      { id: 'ceiling', min: [-50, 0.55, 2.5], max: [50, 50, 2.8] },
    );
    clickFloor();
    pressKey('KeyW');

    walkTicks(10);

    expect(cameraInFloorFrame().y).toBeCloseTo(1, 3);
    expect(floorHeight()).toBeCloseTo(FLOOR_HEIGHT - 3, 5);
    expect(cameraHeight()).toBeCloseTo(FLOOR_HEIGHT - 3 + EYE_HEIGHT, 5);
  });

  it('refuses a step off the model where nothing is below', () => {
    renderSlabs({ id: 'landing', min: [-50, -50, -0.3], max: [50, 0.55, 0] });
    clickFloor();
    pressKey('KeyW');

    walkTicks(10);

    expect(cameraInFloorFrame().y).toBeLessThan(0.55);
    expect(floorHeight()).toBeCloseTo(FLOOR_HEIGHT, 5);
  });

  it.each(['IfcDoor', 'IfcDoorStandardCase'])(
    'walks through a closed %s leaf and stops a body radius short of the wall behind it',
    (ifcClass) => {
      const doorNorth = 0.5;
      renderSlabs(FLOOR, WALL, { id: 'door', ifcClass, min: [-0.45, doorNorth, 0], max: [0.45, doorNorth + 0.05, 2.1] });
      clickFloor();
      pressKey('KeyW');

      walkTicks(20);

      expect(cameraInFloorFrame().y).toBeGreaterThan(doorNorth + 0.05);
      const clearance = WALL_NORTH - cameraInFloorFrame().y;
      expect(clearance).toBeGreaterThanOrEqual(BODY_RADIUS);
      expect(clearance).toBeLessThan(BODY_RADIUS + WALK_TICK_METRES);
    },
  );

  it('stops at a wall behind a measurement label that covers both wall casts', () => {
    renderSlabs(FLOOR, WALL, {
      id: 'label',
      primitive: { name: 'measurement label' },
      min: [-0.5, 0.6, 0.4],
      max: [0.5, 0.65, 1.4],
    });
    clickFloor();
    pressKey('KeyW');

    walkTicks(20);

    const clearance = WALL_NORTH - cameraInFloorFrame().y;
    expect(clearance).toBeGreaterThanOrEqual(BODY_RADIUS);
    expect(clearance).toBeLessThan(BODY_RADIUS + WALK_TICK_METRES);
  });

  it('walks through a wall once it is hidden, since cesium leaves hidden features out of ray picks', () => {
    renderHook(() => useElementStyleCesium());
    renderSlabs(FLOOR, WALL);
    clickFloor();
    pressKey('KeyW');
    walkTicks(10);
    expect(cameraInFloorFrame().y).toBeLessThan(WALL_NORTH - BODY_RADIUS + WALK_TICK_METRES);

    act(() => useElementStore.getState().hideElements([WALL.id]));
    walkTicks(10);

    expect(cameraInFloorFrame().y).toBeGreaterThan(WALL.max[1]);
  });
});
