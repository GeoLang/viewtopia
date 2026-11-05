import { vi } from 'vitest';
import { Cartesian3, EdgeDisplayMode, Matrix4, SceneMode, type Cesium3DTileset, type Viewer } from 'cesium';

export const WITH_ELEMENT_IDS = {
  featuresLength: 2,
  trianglesLength: 12,
  hasProperty: () => true,
  url: 'https://tiles.example/0.glb',
};

export function fakeBimTileset(content: unknown = WITH_ELEMENT_IDS) {
  const listeners = new Set<() => void>();
  return {
    isDestroyed: () => false,
    style: undefined,
    edgeDisplayMode: EdgeDisplayMode.SURFACES_ONLY,
    root: { content, children: [] },
    tileLoadListeners: listeners,
    tileLoad: {
      addEventListener: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

export function asTileset(tileset: ReturnType<typeof fakeBimTileset>): Cesium3DTileset {
  return tileset as unknown as Cesium3DTileset;
}

export function fakeBimViewer() {
  const tickListeners = new Set<() => void>();
  const camera = {
    frustum: { near: 2 },
    positionWC: Cartesian3.fromDegrees(-71, 42, 100),
    heading: 0,
    pitch: -0.4,
    constrainedAxis: undefined as Cartesian3 | undefined,
    lookAtTransform: vi.fn(),
    setView: vi.fn(
      ({
        destination,
        orientation,
      }: {
        destination?: Cartesian3;
        orientation: { heading: number; pitch: number; roll: number };
      }) => {
        if (destination) camera.positionWC = destination;
        camera.heading = orientation.heading;
        camera.pitch = orientation.pitch;
      },
    ),
  };
  let destroyed = false;
  return {
    camera,
    tickListeners,
    destroy: () => {
      destroyed = true;
    },
    isDestroyed: () => destroyed,
    clock: {
      onTick: {
        addEventListener: (listener: () => void) => tickListeners.add(listener),
        removeEventListener: (listener: () => void) => tickListeners.delete(listener),
      },
    },
    scene: {
      mode: SceneMode.SCENE3D,
      canvas: document.createElement('canvas'),
      logarithmicDepthBuffer: false,
      globe: { depthTestAgainstTerrain: true },
      screenSpaceCameraController: {
        enableCollisionDetection: true,
        minimumZoomDistance: 5,
        inertiaSpin: 0.9,
        inertiaZoom: 0.8,
        enableRotate: true,
        enableZoom: true,
        enableTilt: true,
        enableLook: true,
      },
      pickPositionSupported: true,
      pick: vi.fn(),
      pickPosition: vi.fn(),
      drillPickFromRay: vi.fn(),
      requestRender: vi.fn(),
    },
  };
}

export type FakeBimViewer = ReturnType<typeof fakeBimViewer>;

export function asViewer(viewer: FakeBimViewer): Viewer {
  return viewer as unknown as Viewer;
}

export function viewerSettings(viewer: FakeBimViewer, tileset: ReturnType<typeof fakeBimTileset>) {
  const { camera, scene } = viewer;
  return {
    near: camera.frustum.near,
    constrainedAxis: camera.constrainedAxis,
    logarithmicDepthBuffer: scene.logarithmicDepthBuffer,
    depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
    controller: { ...scene.screenSpaceCameraController },
    edgeDisplayMode: tileset.edgeDisplayMode,
  };
}

export function isReleasedFromOrbit(viewer: FakeBimViewer): boolean {
  const [transform] = viewer.camera.lookAtTransform.mock.lastCall ?? [];
  return transform === Matrix4.IDENTITY;
}

export function glbWithJson(json: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const buffer = new ArrayBuffer(20 + bytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, bytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(bytes);
  return buffer;
}
