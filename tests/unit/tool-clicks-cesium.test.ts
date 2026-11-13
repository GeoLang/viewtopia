import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEffect, type MutableRefObject } from 'react';
import type { Viewer } from 'cesium';

interface FakeCartesian {
  lon: number;
  lat: number;
  height?: number;
}

type ClickAction = (click: { position: { x: number; y: number } }) => void;

interface FakeHandler {
  canvas: unknown;
  actions: Map<number, ClickAction>;
  destroyed: boolean;
}

const createdHandlers = vi.hoisted((): FakeHandler[] => []);

vi.mock('cesium', () => ({
  Cartesian2: class {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  Cartographic: {
    fromCartesian: (position: FakeCartesian) => ({
      longitude: (position.lon * Math.PI) / 180,
      latitude: (position.lat * Math.PI) / 180,
      height: position.height ?? 0,
    }),
  },
  Math: { toDegrees: (radians: number) => (radians * 180) / Math.PI },
  ScreenSpaceEventHandler: class {
    canvas: unknown;
    actions = new Map<number, ClickAction>();
    destroyed = false;
    constructor(canvas: unknown) {
      this.canvas = canvas;
      createdHandlers.push(this);
    }
    setInputAction(action: ClickAction, type: number) {
      this.actions.set(type, action);
    }
    destroy() {
      this.destroyed = true;
    }
  },
  ScreenSpaceEventType: { LEFT_CLICK: 2, LEFT_DOUBLE_CLICK: 3 },
}));

import { ScreenSpaceEventType } from 'cesium';
import { useToolClicksCesium } from '../../src/hooks/useToolClicksCesium';
import { locateMeasurePoint } from '../../src/viewer/modelSnap';
import { useAppStore } from '../../src/store/app';
import { drawToolClicks, useDrawStore } from '../../src/store/draw';
import { measureToolClicks, useMeasureStore } from '../../src/store/measure';

function fakeViewer(firstPick: FakeCartesian | undefined) {
  const picks = { next: firstPick };
  return {
    picks,
    scene: { canvas: { style: { cursor: '' } } },
    camera: { pickEllipsoid: vi.fn(() => picks.next) },
    isDestroyed: () => false,
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

function asViewer(viewer: FakeViewer) {
  return viewer as unknown as Viewer;
}

function armedHandler() {
  const handler = createdHandlers.filter((created) => !created.destroyed).at(-1);
  if (!handler) throw new Error('no input handler armed');
  return handler;
}

function leftClickAction(handler: FakeHandler) {
  const action = handler.actions.get(ScreenSpaceEventType.LEFT_CLICK);
  if (!action) throw new Error('no left click action set');
  return action;
}

function clickCanvas() {
  const action = leftClickAction(armedHandler());
  act(() => {
    action({ position: { x: 10, y: 20 } });
  });
}

function renderBothTools(viewerRef: MutableRefObject<Viewer | null>) {
  return renderHook(() => {
    useToolClicksCesium(viewerRef, useDrawStore, drawToolClicks);
    useToolClicksCesium(viewerRef, useMeasureStore, measureToolClicks);
  });
}

function resetStores() {
  useDrawStore.setState({ mode: null, pending: [], features: [], vertexEdit: null });
  useMeasureStore.setState({ mode: null, pending: [], liveDistance: 0, results: [] });
}

describe('useToolClicksCesium', () => {
  beforeEach(() => {
    resetStores();
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
    createdHandlers.length = 0;
  });

  afterEach(() => {
    resetStores();
  });

  it('adds a draw point at the picked position in point mode', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    renderBothTools({ current: asViewer(viewer) });

    act(() => useDrawStore.getState().setMode('point'));
    expect(viewer.scene.canvas.style.cursor).toBe('crosshair');
    clickCanvas();

    expect(viewer.camera.pickEllipsoid).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }));
    const { features } = useDrawStore.getState();
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'Point',
      coords: [[expect.closeTo(7), expect.closeTo(43)]],
    });
    expect(useMeasureStore.getState().pending).toEqual([]);
  });

  it('finishes a draw line on double click', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    renderBothTools({ current: asViewer(viewer) });

    act(() => useDrawStore.getState().setMode('line'));
    clickCanvas();
    viewer.picks.next = { lon: 8, lat: 44 };
    clickCanvas();
    const doubleClick = armedHandler().actions.get(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    if (!doubleClick) throw new Error('no double click action set');
    act(() => {
      doubleClick({ position: { x: 10, y: 20 } });
    });

    const { features } = useDrawStore.getState();
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'LineString',
      coords: [
        [expect.closeTo(7), expect.closeTo(43)],
        [expect.closeTo(8), expect.closeTo(44)],
      ],
    });
  });

  it('adds a measure point in measure mode and destroys the handler when the mode clears', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    renderBothTools({ current: asViewer(viewer) });

    act(() => useMeasureStore.getState().setMode('distance'));
    const handler = armedHandler();
    expect(handler.canvas).toBe(viewer.scene.canvas);
    clickCanvas();
    expect(useMeasureStore.getState().pending).toEqual([[expect.closeTo(7), expect.closeTo(43)]]);
    expect(useDrawStore.getState()).toMatchObject({ pending: [], features: [] });

    act(() => useMeasureStore.getState().setMode(null));
    expect(handler.destroyed).toBe(true);
    expect(viewer.scene.canvas.style.cursor).toBe('');
  });

  it('arms no input handler while no tool is active', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    renderBothTools({ current: asViewer(viewer) });

    expect(createdHandlers).toHaveLength(0);
    expect(viewer.scene.canvas.style.cursor).toBe('');
  });

  it('converts the position but changes no store when a click lands after the mode clears', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    renderBothTools({ current: asViewer(viewer) });

    act(() => useMeasureStore.getState().setMode('distance'));
    const staleClick = leftClickAction(armedHandler());
    act(() => useMeasureStore.getState().setMode(null));
    act(() => {
      staleClick({ position: { x: 10, y: 20 } });
    });

    expect(viewer.camera.pickEllipsoid).toHaveBeenCalledTimes(1);
    expect(useMeasureStore.getState().pending).toEqual([]);
    expect(useDrawStore.getState()).toMatchObject({ pending: [], features: [] });
  });

  it('adds nothing when the click picks no position', () => {
    const viewer = fakeViewer(undefined);
    renderBothTools({ current: asViewer(viewer) });

    act(() => useMeasureStore.getState().setMode('distance'));
    clickCanvas();
    act(() => useMeasureStore.getState().setMode(null));
    act(() => useDrawStore.getState().setMode('point'));
    clickCanvas();

    expect(viewer.camera.pickEllipsoid).toHaveBeenCalledTimes(2);
    expect(useMeasureStore.getState().pending).toEqual([]);
    expect(useDrawStore.getState()).toMatchObject({ pending: [], features: [] });
  });

  it('destroys the handler on unmount and arms no new one on later mode changes', () => {
    const viewer = fakeViewer({ lon: 7, lat: 43 });
    const viewerRef = { current: asViewer(viewer) };
    const { unmount } = renderHook(() => useToolClicksCesium(viewerRef, useMeasureStore, measureToolClicks));

    act(() => useMeasureStore.getState().setMode('distance'));
    const handler = armedHandler();
    unmount();
    expect(handler.destroyed).toBe(true);

    act(() => useMeasureStore.getState().setMode('area'));
    expect(createdHandlers).toEqual([handler]);
  });

  it('moves the handler to the rebuilt viewer across a renderer switch', () => {
    const firstViewer = fakeViewer({ lon: 7, lat: 43 });
    const secondViewer = fakeViewer({ lon: 8, lat: 44 });
    const unbuiltViewers = [firstViewer, secondViewer];
    const viewerRef: MutableRefObject<Viewer | null> = { current: null };
    useMeasureStore.getState().setMode('distance');

    renderHook(() => {
      const renderer = useAppStore((s) => s.renderer);
      // useCesium swaps viewerRef in an effect body that runs ahead of the tool hooks
      useEffect(() => {
        const next = renderer === 'cesium' ? unbuiltViewers.shift() : undefined;
        viewerRef.current = next ? asViewer(next) : null;
      }, [renderer]);
      useToolClicksCesium(viewerRef, useMeasureStore, measureToolClicks);
    });
    expect(createdHandlers).toHaveLength(1);
    expect(createdHandlers[0].canvas).toBe(firstViewer.scene.canvas);

    act(() => useAppStore.setState({ renderer: 'maplibre' }));
    expect(createdHandlers[0].destroyed).toBe(true);

    act(() => useAppStore.setState({ renderer: 'cesium' }));
    expect(armedHandler().canvas).toBe(secondViewer.scene.canvas);
    clickCanvas();
    expect(useMeasureStore.getState().pending).toEqual([[expect.closeTo(8), expect.closeTo(44)]]);
  });
});

describe('locateMeasurePoint', () => {
  function viewerWith(options: {
    snap?: FakeCartesian & { edge: boolean };
    surface?: FakeCartesian;
    ground?: FakeCartesian;
  }) {
    return {
      scene: {
        canvas: { style: { cursor: '' } },
        snap: vi.fn(() => (
          options.snap
            ? { position: options.snap, isEdge: options.snap.edge }
            : undefined
        )),
        pickPositionSupported: true,
        pickPosition: vi.fn(() => options.surface),
        globe: { ellipsoid: {} },
      },
      camera: { pickEllipsoid: vi.fn(() => options.ground) },
      entities: { getById: () => undefined },
      isDestroyed: () => false,
    };
  }

  it('snaps a measurement to the model edge and keeps its height', () => {
    const viewer = viewerWith({
      snap: { lon: 7.25, lat: 46.75, height: 12.5, edge: true },
      surface: { lon: 1, lat: 2, height: 30 },
      ground: { lon: 9, lat: 8 },
    });

    const point = locateMeasurePoint(viewer as unknown as Viewer, 10, 20);

    expect(point).toEqual([expect.closeTo(7.25), expect.closeTo(46.75), 12.5]);
    expect(viewer.scene.pickPosition).not.toHaveBeenCalled();
    expect(viewer.camera.pickEllipsoid).not.toHaveBeenCalled();
  });

  it('uses the surface under the pointer when the snap region misses', () => {
    const viewer = viewerWith({
      surface: { lon: 7, lat: 43, height: 4 },
      ground: { lon: 9, lat: 8 },
    });

    const point = locateMeasurePoint(viewer as unknown as Viewer, 10, 20);

    expect(point).toEqual([expect.closeTo(7), expect.closeTo(43), 4]);
    expect(viewer.camera.pickEllipsoid).not.toHaveBeenCalled();
  });

  it('drops the height when the click misses the model and hits the ground', () => {
    const viewer = viewerWith({ ground: { lon: 8, lat: 44, height: 0 } });

    const point = locateMeasurePoint(viewer as unknown as Viewer, 10, 20);

    expect(point).toEqual([expect.closeTo(8), expect.closeTo(44)]);
  });
});
