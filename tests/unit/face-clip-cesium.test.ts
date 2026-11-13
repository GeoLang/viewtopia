import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BoundingSphere, Cartesian2, Cartesian3, Matrix4, Transforms, type Cesium3DTileset, type Viewer } from 'cesium';

type ClickAction = (click: { position: Cartesian2 }) => void;

interface FakeHandler {
  actions: Map<number, ClickAction>;
  destroyed: boolean;
}

const createdHandlers = vi.hoisted((): FakeHandler[] => []);

vi.mock('cesium', async (importOriginal) => {
  const cesium = await importOriginal<typeof import('cesium')>();
  return {
    ...cesium,
    ScreenSpaceEventHandler: class {
      actions = new Map<number, ClickAction>();
      destroyed = false;
      constructor() {
        createdHandlers.push(this);
      }
      setInputAction(action: ClickAction, type: number) {
        this.actions.set(type, action);
      }
      destroy() {
        this.destroyed = true;
      }
    },
  };
});

import { ScreenSpaceEventType } from 'cesium';
import { useFaceClipCesium } from '../../src/features/scene/useFaceClipCesium';
import { armedFaceClipTileset, armFaceClip, readFacePlanes } from '../../src/features/scene/tilesetSection';

const PLACEMENT = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));
const FACE_HEIGHT = 3;

function placedTileset(): Cesium3DTileset {
  const sphere = new BoundingSphere(Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(), new Cartesian3()), 20);
  return {
    root: { computedTransform: PLACEMENT, boundingSphere: sphere },
    boundingSphere: sphere,
    clippingPlanes: undefined,
  } as unknown as Cesium3DTileset;
}

function fakeViewer(picked: unknown) {
  return {
    isDestroyed: () => false,
    camera: { positionWC: Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(0, 0, 100), new Cartesian3()) },
    scene: {
      canvas: { style: { cursor: '' } },
      requestRender: vi.fn(),
      pickPositionSupported: true,
      pick: vi.fn(() => picked),
      pickPosition: (position: Cartesian2) =>
        Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(position.x, position.y, FACE_HEIGHT), new Cartesian3()),
    },
  };
}

function clickCanvas() {
  const handler = createdHandlers.filter((created) => !created.destroyed).at(-1);
  const action = handler?.actions.get(ScreenSpaceEventType.LEFT_CLICK);
  if (!action) throw new Error('no face click handler is armed');
  act(() => action({ position: new Cartesian2(10, 20) }));
}

describe('useFaceClipCesium', () => {
  afterEach(() => {
    armFaceClip(null, () => {});
    createdHandlers.length = 0;
  });

  it('adds a plane from a clicked face and stops waiting for clicks', () => {
    const tileset = placedTileset();
    const viewer = fakeViewer({ primitive: tileset });
    renderHook(() => useFaceClipCesium({ current: viewer as unknown as Viewer }));

    act(() => armFaceClip(tileset, () => {}));
    expect(viewer.scene.canvas.style.cursor).toBe('crosshair');
    clickCanvas();

    const [plane] = readFacePlanes(tileset);
    expect(plane?.normal[2]).toBeCloseTo(1, 5);
    expect(plane?.offset).toBeCloseTo(FACE_HEIGHT, 5);
    expect(armedFaceClipTileset()).toBeNull();
    expect(viewer.scene.canvas.style.cursor).toBe('');
  });

  it('stops waiting for clicks when a click misses the model', () => {
    const tileset = placedTileset();
    const viewer = fakeViewer(undefined);
    renderHook(() => useFaceClipCesium({ current: viewer as unknown as Viewer }));

    act(() => armFaceClip(tileset, () => {}));
    clickCanvas();

    expect(readFacePlanes(tileset)).toEqual([]);
    expect(armedFaceClipTileset()).toBeNull();
    expect(viewer.scene.canvas.style.cursor).toBe('');
    expect(createdHandlers.every((handler) => handler.destroyed)).toBe(true);
  });
});
