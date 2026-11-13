import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BoundingSphere,
  Cartesian3,
  ClippingPlane,
  ClippingPlaneCollection,
  Math as CesiumMath,
  Matrix4,
  Transforms,
  type Cesium3DTileset,
  type Viewer,
} from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import type { BcfViewpoint } from '../../src/features/coordination/api';
import { captureViewpoint, restoreViewpoint } from '../../src/features/coordination/viewpoint';
import { TiletopiaElementService } from '../../src/features/elements/elementService';
import { useElementStore } from '../../src/features/elements/store';
import {
  addFacePlane,
  applyTilesetSection,
  disableTilesetSection,
  readFacePlanes,
  readTilesetSection,
  replaceFacePlanes,
} from '../../src/features/scene/tilesetSection';
import { FakeElementServer } from './stubs/fakeElementServer';

const ASSET = 'a1b2';
const LOCATION = { center: { longitude: -71.061, latitude: 42.357, height: 12.5 }, radius: 4.2 };
const MESHED = ['wall', 'door', 'duct'];
const PLACEMENT = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));
const VIEW_POINT: [number, number, number] = [1.5, -2.25, 3.75];

function component(ifcGuid: string | null) {
  return { ifcGuid, originatingSystem: null, authoringToolId: ifcGuid === null ? 'tool-7' : null };
}

function viewpoint(overrides: Partial<BcfViewpoint> = {}): BcfViewpoint {
  return {
    guid: '6b1f1d6f-2c2c-4b3b-9b66-1a4b8dae2f02',
    index: 1,
    snapshotFormat: null,
    camera: {
      kind: 'perspective',
      cameraViewPoint: VIEW_POINT,
      cameraDirection: [0, 1, 0],
      cameraUpVector: [0, 0.2, 1],
      fieldOfView: 60,
      aspectRatio: 1.5,
    },
    selection: [component('wall'), component('ghost')],
    visibility: {
      defaultVisibility: true,
      spacesVisible: true,
      spaceBoundariesVisible: true,
      openingsVisible: true,
      exceptions: [component('door')],
    },
    coloring: [],
    lines: [],
    clippingPlanes: [{ location: [0.5, 0.5, 1.5], direction: [0, 0, 1] }],
    ...overrides,
  };
}

function modelTileset(): Cesium3DTileset {
  const sphere = new BoundingSphere(Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(5, 2, 10), new Cartesian3()), 20);
  return {
    root: { computedTransform: PLACEMENT, boundingSphere: sphere },
    boundingSphere: sphere,
    clippingPlanes: undefined,
  } as unknown as Cesium3DTileset;
}

let server: FakeElementServer;
const setView = vi.fn();
const requestRender = vi.fn();
const viewer = { camera: { setView }, scene: { requestRender } } as unknown as Viewer;
const service = new TiletopiaElementService(ASSET);

beforeEach(() => {
  server = new FakeElementServer();
  server.answer = ({ url, path }) => {
    if (path !== `/v1/assets/${ASSET}/elements`) return { status: 404, body: { code: 'ResourceNotFound', message: path } };
    const wanted: string[] = JSON.parse(url.searchParams.get('filter') ?? '{}')['@id'].$in;
    const items = wanted
      .filter((id) => MESHED.includes(id))
      .map((id) => ({ id, label: id, ifcClass: 'IfcWall', storey: 'Level 1', location: LOCATION }));
    return { body: { items, total: items.length } };
  };
  server.install();
  setView.mockClear();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useElementStore.setState({ selected: new Set(['old']), hidden: new Set(['old']), isolated: null, focused: null });
});

afterEach(() => {
  server.restore();
});

describe('restoreViewpoint', () => {
  it('places the camera through the root transform and restores selection, hidden elements and section', async () => {
    const tileset = modelTileset();

    const restored = await restoreViewpoint({ viewer, tileset, service, viewpoint: viewpoint() });

    const [{ destination, orientation, endTransform }] = setView.mock.lastCall ?? [];
    const expected = Matrix4.multiplyByPoint(PLACEMENT, Cartesian3.fromArray(VIEW_POINT), new Cartesian3());
    expect(Cartesian3.distance(destination, expected)).toBeLessThan(1e-6);
    const north = Matrix4.multiplyByPointAsVector(PLACEMENT, Cartesian3.UNIT_Y, new Cartesian3());
    expect(Cartesian3.dot(orientation.direction, Cartesian3.normalize(north, north))).toBeCloseTo(1, 9);
    expect(Cartesian3.dot(orientation.direction, orientation.up)).toBeCloseTo(0, 9);
    expect(endTransform).toBe(Matrix4.IDENTITY);

    const elements = useElementStore.getState();
    expect([...elements.selected]).toEqual(['wall']);
    expect([...elements.hidden]).toEqual(['door']);
    expect(elements.isolated).toBeNull();

    const section = readTilesetSection(tileset);
    expect(section).toMatchObject({ axis: 'z', flip: false, enabled: true });
    expect(section?.position).toBeCloseTo(1.5, 9);

    expect(restored).toMatchObject({ selected: 1, hidden: 1, isolated: null, notInModel: ['ghost'] });
    expect(restored.notApplied).toContain('the 60 degree field of view');
  });

  it('shows only the exceptions when the default is hidden, and keeps the side a downward plane leaves', async () => {
    const tileset = modelTileset();

    const restored = await restoreViewpoint({
      viewer,
      tileset,
      service,
      viewpoint: viewpoint({
        selection: [],
        visibility: {
          defaultVisibility: false,
          spacesVisible: false,
          spaceBoundariesVisible: false,
          openingsVisible: false,
          exceptions: [component('wall'), component('duct'), component(null)],
        },
        clippingPlanes: [{ location: [0, 0, 2], direction: [0, 0, -1] }],
      }),
    });

    const elements = useElementStore.getState();
    expect(elements.selected.size).toBe(0);
    expect(elements.hidden.size).toBe(0);
    expect([...(elements.isolated ?? [])].sort()).toEqual(['duct', 'wall']);
    expect(readTilesetSection(tileset)).toMatchObject({ axis: 'z', flip: true, enabled: true });
    expect(restored.isolated).toBe(2);
    expect(restored.notApplied).toContain('1 components named with no IFC GlobalId');
  });

  it('keeps a slanted clipping plane on the model', async () => {
    const tileset = modelTileset();
    tileset.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 4)],
      enabled: true,
    });

    const restored = await restoreViewpoint({
      viewer,
      tileset,
      service,
      viewpoint: viewpoint({ clippingPlanes: [{ location: [0, 0, 0], direction: [1, 1, 0] }] }),
    });

    expect(tileset.clippingPlanes.enabled).toBe(true);
    expect(tileset.clippingPlanes.length).toBe(1);
    expect(restored.notApplied).not.toContain('a clipping plane that is not square to an axis of the model');
  });

  it('keeps several axis-aligned planes, and drops a plane with no direction', async () => {
    const tileset = modelTileset();
    await restoreViewpoint({
      viewer,
      tileset,
      service,
      viewpoint: viewpoint({
        clippingPlanes: [
          { location: [0, 0, 2], direction: [0, 0, 1] },
          { location: [3, 0, 0], direction: [1, 0, 0] },
          { location: [0, 0, 0], direction: [0, 0, 0] },
        ],
      }),
    });

    expect(readTilesetSection(tileset)?.enabled).not.toBe(true);
    const faces = readFacePlanes(tileset);
    expect(faces[0].offset).toBeCloseTo(2, 5);
    expect(faces[1].offset).toBeCloseTo(3, 5);
    expect(faces[0].normal[2]).toBeCloseTo(1);
    expect(faces[1].normal[0]).toBeCloseTo(1);
    expect(tileset.clippingPlanes.length).toBe(2);
    expect(tileset.clippingPlanes.enabled).toBe(true);
  });

  it('refuses a snapshot-only viewpoint and leaves the scene alone', async () => {
    const restoring = restoreViewpoint({
      viewer,
      tileset: modelTileset(),
      service,
      viewpoint: viewpoint({ camera: null }),
    });

    await expect(restoring).rejects.toThrow('only a snapshot');
    expect(setView).not.toHaveBeenCalled();
    expect([...useElementStore.getState().selected]).toEqual(['old']);
  });
});

describe('captureViewpoint', () => {
  const position = Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(4, -3, 1.6), new Cartesian3());
  const north = Matrix4.multiplyByPointAsVector(PLACEMENT, Cartesian3.UNIT_Y, new Cartesian3());
  const up = Matrix4.multiplyByPointAsVector(PLACEMENT, Cartesian3.UNIT_Z, new Cartesian3());

  function cameraViewer(frustum: object): Viewer {
    return {
      camera: { setView, positionWC: position, directionWC: north, upWC: up, frustum },
      scene: { requestRender },
    } as unknown as Viewer;
  }

  it('gives back the same camera, selection, hidden elements and section when restored', async () => {
    const tileset = modelTileset();
    applyTilesetSection(tileset, { axis: 'z', position: 2.5, flip: true, enabled: true }, requestRender);
    useElementStore.setState({ selected: new Set(['wall']), hidden: new Set(['door']), isolated: null });
    const viewer = cameraViewer({ fovy: 0.8, aspectRatio: 1.5 });

    const captured = captureViewpoint({ viewer, tileset });

    expect(captured.camera).toMatchObject({ kind: 'perspective', aspectRatio: 1.5 });
    const [x, y, z] = captured.camera?.cameraViewPoint ?? [];
    expect([x, y, z].map((value) => Math.round(value * 1e6) / 1e6)).toEqual([4, -3, 1.6]);
    useElementStore.setState({ selected: new Set(), hidden: new Set(), isolated: null });
    tileset.clippingPlanes.enabled = false;

    const restored = await restoreViewpoint({ viewer, tileset, service, viewpoint: captured });

    const [{ destination, orientation }] = setView.mock.lastCall ?? [];
    expect(Cartesian3.distance(destination, position)).toBeLessThan(1e-6);
    expect(Cartesian3.dot(orientation.direction, Cartesian3.normalize(north, new Cartesian3()))).toBeCloseTo(1, 9);
    expect([...useElementStore.getState().selected]).toEqual(['wall']);
    expect([...useElementStore.getState().hidden]).toEqual(['door']);
    const section = readTilesetSection(tileset);
    expect(section).toMatchObject({ axis: 'z', flip: true, enabled: true });
    expect(section?.position).toBeCloseTo(2.5, 9);
    expect(restored.notApplied).toEqual([`the ${CesiumMath.toDegrees(0.8)} degree field of view`]);
    expect(readFacePlanes(tileset)).toEqual([]);
  });

  it('brings a slanted face plane back, and stores one square face as the axis section', async () => {
    const tileset = modelTileset();
    const viewer = cameraViewer({ fovy: 0.8, aspectRatio: 1.5 });
    addFacePlane(tileset, { id: 'slope', normal: [0, 0.6, 0.8], offset: 4 }, requestRender);

    const captured = captureViewpoint({ viewer, tileset });
    expect(captured.clippingPlanes).toHaveLength(1);
    replaceFacePlanes(tileset, [], requestRender);
    await restoreViewpoint({ viewer, tileset, service, viewpoint: captured });

    const [face] = readFacePlanes(tileset);
    expect(face.normal[1]).toBeCloseTo(0.6, 5);
    expect(face.normal[2]).toBeCloseTo(0.8, 5);
    expect(face.offset).toBeCloseTo(4, 5);
    expect(readTilesetSection(tileset)?.enabled).not.toBe(true);

    replaceFacePlanes(tileset, [], requestRender);
    addFacePlane(tileset, { id: 'floor', normal: [0, 0, 1], offset: 2 }, requestRender);
    const square = captureViewpoint({ viewer, tileset });
    replaceFacePlanes(tileset, [], requestRender);
    disableTilesetSection(tileset, requestRender);
    await restoreViewpoint({ viewer, tileset, service, viewpoint: square });

    expect(readFacePlanes(tileset)).toEqual([]);
    expect(readTilesetSection(tileset)).toMatchObject({ axis: 'z', position: 2, flip: false, enabled: true });
  });

  it('saves an isolation as hidden by default with the shown elements as exceptions', () => {
    useElementStore.setState({ selected: new Set(), hidden: new Set(['duct']), isolated: new Set(['wall', 'duct']) });

    const captured = captureViewpoint({ viewer: cameraViewer({ fovy: 0.8, aspectRatio: 1.5 }), tileset: modelTileset() });

    expect(captured.visibility).toEqual({
      defaultVisibility: false,
      spacesVisible: false,
      spaceBoundariesVisible: false,
      openingsVisible: false,
      exceptions: [{ ifcGuid: 'wall', originatingSystem: null, authoringToolId: null }],
    });
    expect(captured.clippingPlanes).toEqual([]);
  });

  it('refuses a camera with no perspective field of view', () => {
    const orthographic = cameraViewer({ width: 50, aspectRatio: 1.5 });

    expect(() => captureViewpoint({ viewer: orthographic, tileset: modelTileset() })).toThrow(
      'Only a perspective camera can be saved as a viewpoint.',
    );
  });
});
