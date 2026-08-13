import { describe, it, expect, beforeEach, vi } from 'vitest';

interface FakeCartesian {
  lon: number;
  lat: number;
  h: number;
}

const splineBuilds: { kind: string; times: number[]; points: FakeCartesian[] }[] = [];

// a straight lerp between control points is enough to exercise the camera math
function lerpEvaluate(times: number[], points: FakeCartesian[]) {
  return (t: number): FakeCartesian => {
    let i = 0;
    while (i < times.length - 2 && t > times[i + 1]) i += 1;
    const span = times[i + 1] - times[i];
    const u = span === 0 ? 0 : (t - times[i]) / span;
    const a = points[i];
    const b = points[i + 1];
    return {
      lon: a.lon + (b.lon - a.lon) * u,
      lat: a.lat + (b.lat - a.lat) * u,
      h: a.h + (b.h - a.h) * u,
    };
  };
}

function fakeSpline(kind: string) {
  return function (this: Record<string, unknown>, options: { times: number[]; points: FakeCartesian[] }) {
    splineBuilds.push({ kind, times: options.times, points: options.points });
    this.times = options.times;
    this.points = options.points;
    this.evaluate = lerpEvaluate(options.times, options.points);
  };
}

vi.mock('cesium', () => ({
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, h: number): FakeCartesian => ({ lon, lat, h }),
  },
  Cartographic: {
    fromCartesian: (c: FakeCartesian) => ({
      longitude: (c.lon * Math.PI) / 180,
      latitude: (c.lat * Math.PI) / 180,
      height: c.h,
    }),
  },
  CatmullRomSpline: vi.fn(fakeSpline('catmull')),
  LinearSpline: vi.fn(fakeSpline('linear')),
  Math: {
    toRadians: (d: number) => (d * Math.PI) / 180,
    toDegrees: (r: number) => (r * 180) / Math.PI,
  },
}));

import {
  createCameraPath,
  flightDuration,
  pathFromRouteGeometry,
  pathLength,
} from '../../src/lib/cameraPath';
import type { Viewer } from 'cesium';

const frames: FrameRequestCallback[] = [];
let cancelled: number[] = [];

function fakeViewer() {
  return {
    scene: { screenSpaceCameraController: { enableInputs: true } },
    camera: { setView: vi.fn() },
    isDestroyed: vi.fn(() => false),
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

const build = (viewer: FakeViewer, options: Parameters<typeof createCameraPath>[1]) =>
  createCameraPath(viewer as unknown as Viewer, options);

const AT = { longitude: 10, latitude: 45, height: 500 };
const NEAR = { longitude: 10.01, latitude: 45, height: 500 };
const FAR = { longitude: 10.02, latitude: 45.01, height: 900 };

beforeEach(() => {
  vi.clearAllMocks();
  splineBuilds.length = 0;
  frames.length = 0;
  cancelled = [];
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  globalThis.cancelAnimationFrame = vi.fn((id: number) => {
    cancelled.push(id);
  });
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

describe('pathLength', () => {
  it('measures ground distance plus climb', () => {
    // a hundredth of a degree of longitude at 45N is about 787 m
    expect(pathLength([AT, NEAR])).toBeGreaterThan(700);
    expect(pathLength([AT, NEAR])).toBeLessThan(900);
    expect(pathLength([AT])).toBe(0);

    const climb = pathLength([AT, { ...NEAR, height: 500 + 787 }]);
    expect(climb).toBeCloseTo(Math.hypot(pathLength([AT, NEAR]), 787), 0);
  });

  it('turns speed into a duration of at least a second', () => {
    expect(flightDuration({ waypoints: [AT, NEAR], speed: 100 })).toBeCloseTo(
      (pathLength([AT, NEAR]) / 100) * 1000,
      3,
    );
    expect(flightDuration({ waypoints: [AT, NEAR], speed: 100000 })).toBe(1000);
  });
});

describe('pathFromRouteGeometry', () => {
  const geometry: [number, number][] = [
    [10, 45],
    [10.01, 45.005],
  ];

  it('reads the route in lng, lat order and flies it at one height', () => {
    expect(pathFromRouteGeometry(geometry, 300)).toEqual([
      { longitude: 10, latitude: 45, height: 300 },
      { longitude: 10.01, latitude: 45.005, height: 300 },
    ]);
    expect(pathFromRouteGeometry([], 300)).toEqual([]);
  });

  it('clears the terrain under each point when the ground is known', () => {
    const ground = (longitude: number) => (longitude === 10 ? 120 : undefined);

    expect(pathFromRouteGeometry(geometry, 300, ground).map((p) => p.height)).toEqual([420, 300]);
  });
});

describe('createCameraPath', () => {
  it('refuses paths the camera cannot fly', () => {
    const viewer = fakeViewer();
    expect(build(viewer, { waypoints: [AT], speed: 10, durationMs: 1000 })).toBeNull();
    // a double-click leaves two waypoints on the same spot
    expect(
      build(viewer, { waypoints: [AT, { ...AT }], speed: 10, durationMs: 1000 }),
    ).toBeNull();
    expect(splineBuilds).toHaveLength(0);
  });

  it('parametrises the spline by arc length', () => {
    build(fakeViewer(), { waypoints: [AT, NEAR, FAR], speed: 10, durationMs: 1000 });

    const spline = splineBuilds[0];
    expect(spline.kind).toBe('catmull');
    expect(spline.points).toEqual([
      { lon: 10, lat: 45, h: 500 },
      { lon: 10.01, lat: 45, h: 500 },
      { lon: 10.02, lat: 45.01, h: 900 },
    ]);
    expect(spline.times[0]).toBe(0);
    expect(spline.times[2]).toBe(1);
    const first = pathLength([AT, NEAR]) / pathLength([AT, NEAR, FAR]);
    expect(spline.times[1]).toBeCloseTo(first, 6);
  });

  it('uses a linear spline when smoothing is off', () => {
    build(fakeViewer(), { waypoints: [AT, FAR], speed: 10, durationMs: 1000, smooth: false });

    expect(splineBuilds[0].kind).toBe('linear');
  });

  it('takes the camera over while flying and reports progress', () => {
    const viewer = fakeViewer();
    const onProgress = vi.fn();
    const path = build(viewer, { waypoints: [AT, FAR], speed: 10, durationMs: 1000, onProgress });
    if (!path) throw new Error('no path built');

    path.play();
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
    expect(frames).toHaveLength(1);

    frames.at(-1)?.(250);

    expect(onProgress).toHaveBeenCalledWith(0.25);
    const view = viewer.camera.setView.mock.calls[0][0] as {
      destination: FakeCartesian;
      orientation: { heading: number; pitch: number; roll: number };
    };
    expect(view.destination.lon).toBeCloseTo(10.005, 6);
    expect(view.destination.h).toBeCloseTo(600, 6);
    // north east along the leg, climbing, so heading is in the first quadrant
    expect(view.orientation.heading).toBeGreaterThan(0);
    expect(view.orientation.heading).toBeLessThan(Math.PI / 2);
    expect(view.orientation.pitch).toBeGreaterThan(0);
    expect(view.orientation.roll).toBe(0);
    expect(frames).toHaveLength(2);
  });

  it('gives the camera back and finishes at the end of the path', () => {
    const viewer = fakeViewer();
    const onDone = vi.fn();
    const onProgress = vi.fn();
    const path = build(viewer, {
      waypoints: [AT, FAR],
      speed: 10,
      durationMs: 1000,
      onDone,
      onProgress,
    });
    path?.play();

    frames.at(-1)?.(4000);

    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);
    expect(frames).toHaveLength(1);
    const view = viewer.camera.setView.mock.calls.at(-1)?.[0] as { destination: FakeCartesian };
    expect(view.destination.lon).toBeCloseTo(10.02, 6);
  });

  it('resumes from where pause left off', () => {
    const viewer = fakeViewer();
    const onProgress = vi.fn();
    const path = build(viewer, { waypoints: [AT, FAR], speed: 10, durationMs: 1000, onProgress });
    path?.play();
    frames.at(-1)?.(400);

    vi.spyOn(performance, 'now').mockReturnValue(400);
    path?.pause();

    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);
    expect(cancelled).toHaveLength(1);

    vi.spyOn(performance, 'now').mockReturnValue(9000);
    path?.play();
    frames.at(-1)?.(9100);

    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
  });

  it('rewinds and releases the camera on stop', () => {
    const viewer = fakeViewer();
    const onProgress = vi.fn();
    const path = build(viewer, { waypoints: [AT, FAR], speed: 10, durationMs: 1000, onProgress });
    path?.play();
    frames.at(-1)?.(600);
    path?.stop();

    expect(onProgress).toHaveBeenLastCalledWith(0);
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);

    vi.spyOn(performance, 'now').mockReturnValue(0);
    path?.play();
    frames.at(-1)?.(100);

    expect(onProgress).toHaveBeenLastCalledWith(0.1);
  });

  it('stops driving a destroyed viewer', () => {
    const viewer = fakeViewer();
    const path = build(viewer, { waypoints: [AT, FAR], speed: 10, durationMs: 1000 });
    path?.play();
    viewer.isDestroyed.mockReturnValue(true);

    frames.at(-1)?.(100);

    expect(viewer.camera.setView).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
  });
});
