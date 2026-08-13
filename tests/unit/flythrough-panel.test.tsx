import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

interface FakeCartesian {
  lon: number;
  lat: number;
  h: number;
}

const splineBuilds: { kind: string; points: FakeCartesian[] }[] = [];

function fakeSpline(kind: string) {
  return function (this: Record<string, unknown>, options: { times: number[]; points: FakeCartesian[] }) {
    splineBuilds.push({ kind, points: options.points });
    this.evaluate = (t: number) => {
      const a = options.points[0];
      const b = options.points[options.points.length - 1];
      return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t, h: a.h };
    };
  };
}

// the flight plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Cartesian3: { fromDegrees: (lon: number, lat: number, h: number) => ({ lon, lat, h }) },
  Cartographic: {
    fromCartesian: (c: FakeCartesian) => ({
      longitude: (c.lon * Math.PI) / 180,
      latitude: (c.lat * Math.PI) / 180,
      height: c.h,
    }),
    fromDegrees: (lon: number, lat: number) => ({ lon, lat }),
  },
  CatmullRomSpline: vi.fn(fakeSpline('catmull')),
  LinearSpline: vi.fn(fakeSpline('linear')),
  Math: {
    toRadians: (d: number) => (d * Math.PI) / 180,
    toDegrees: (r: number) => (r * 180) / Math.PI,
  },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { FlythroughPanel } from '../../src/components/tools/FlythroughPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';
import { useFlythroughStore } from '../../src/store/flythrough';

// MantineProvider reads the color scheme through matchMedia, and Slider
// measures its track, both missing from jsdom
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const toRad = (d: number) => (d * Math.PI) / 180;
const frames: FrameRequestCallback[] = [];
const downloads: string[] = [];
const GROUND_HEIGHT = 100;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(mimeType: string) {
    return mimeType === 'video/mp4;codecs=avc1.42E01E';
  }

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, public options: { mimeType: string }) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
    this.ondataavailable?.({ data: new Blob(['frames']) });
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

function recordingCanvas() {
  const canvas = document.createElement('canvas');
  (canvas as unknown as { captureStream: unknown }).captureStream = vi.fn(() => ({
    getTracks: () => [{ stop: vi.fn() }],
  }));
  return canvas;
}

function fakeViewer() {
  return {
    scene: {
      canvas: recordingCanvas(),
      globe: { getHeight: vi.fn(() => GROUND_HEIGHT) },
      requestRenderMode: false,
      screenSpaceCameraController: { enableInputs: true },
    },
    camera: {
      positionCartographic: { longitude: toRad(10), latitude: toRad(45), height: 500 },
      setView: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

const mockViewer = (v: FakeViewer | null) =>
  vi.mocked(getActiveCesiumViewer).mockReturnValue(v as never);

const renderPanel = () =>
  render(
    <MantineProvider>
      <FlythroughPanel onClose={() => {}} />
    </MantineProvider>,
  );

const moveCamera = (viewer: FakeViewer, lon: number, lat: number, height: number) => {
  viewer.camera.positionCartographic = { longitude: toRad(lon), latitude: toRad(lat), height };
};

const addWaypoint = () => fireEvent.click(screen.getByRole('button', { name: 'Add Waypoint Here' }));

// cesium drives the flight outside react, so the progress render needs act
const nextFrame = (now: number) => {
  const frame = frames.at(-1);
  if (!frame) throw new Error('no animation frame requested');
  act(() => frame(now));
};

function twoWaypoints() {
  const viewer = fakeViewer();
  mockViewer(viewer);
  renderPanel();
  addWaypoint();
  moveCamera(viewer, 10.02, 45.01, 900);
  addWaypoint();
  return viewer;
}

const armRecording = () => fireEvent.click(screen.getByLabelText('Record Video'));

// the recorder resolves its video in a promise, and the download follows it
const flushDownload = () => act(async () => {});

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  splineBuilds.length = 0;
  frames.length = 0;
  downloads.length = 0;
  FakeMediaRecorder.instances.length = 0;
  mockViewer(null);
  useAppStore.setState({ renderer: 'cesium' });
  useFlythroughStore.setState({ routeGeometry: null });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  URL.createObjectURL = vi.fn(() => 'blob:flythrough');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  globalThis.cancelAnimationFrame = vi.fn();
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FlythroughPanel', () => {
  it('shows the renderer notice when there is no cesium viewer', () => {
    mockViewer(null);
    renderPanel();

    expect(screen.getByTestId('flythrough-no-cesium')).toHaveTextContent(
      'Flythrough needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
    expect(screen.queryByRole('button', { name: 'Add Waypoint Here' })).toBeNull();
  });

  it('captures the camera position as a waypoint', () => {
    const viewer = fakeViewer();
    mockViewer(viewer);
    renderPanel();

    expect(screen.queryAllByTestId('flythrough-waypoint')).toHaveLength(0);

    addWaypoint();

    expect(screen.getAllByTestId('flythrough-waypoint')).toHaveLength(1);
    expect(screen.getByTestId('flythrough-waypoint')).toHaveTextContent('1. 500 m');
    expect(screen.getByTestId('flythrough-summary')).toHaveTextContent('1 waypoint, 0 m');
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('measures the path once a second waypoint is captured', () => {
    twoWaypoints();

    expect(screen.getAllByTestId('flythrough-waypoint')).toHaveLength(2);
    expect(screen.getByTestId('flythrough-summary')).toHaveTextContent(/^2 waypoints, \d{4} m$/);
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.queryByTestId('flythrough-hint')).toBeNull();
  });

  it('drops a removed waypoint', () => {
    twoWaypoints();

    fireEvent.click(screen.getByRole('button', { name: 'Remove waypoint 1' }));

    expect(screen.getAllByTestId('flythrough-waypoint')).toHaveLength(1);
    expect(screen.getByTestId('flythrough-waypoint')).toHaveTextContent('1. 900 m');
  });

  it('flies the camera along the captured waypoints', () => {
    const viewer = twoWaypoints();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(splineBuilds).toHaveLength(1);
    expect(splineBuilds[0].kind).toBe('catmull');
    expect(splineBuilds[0].points).toEqual([
      { lon: 10, lat: 45, h: 500 },
      { lon: 10.02, lat: 45.01, h: 900 },
    ]);
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    nextFrame(2000);

    expect(viewer.camera.setView).toHaveBeenCalled();
  });

  it('uses a linear spline when smoothing is off', () => {
    twoWaypoints();

    fireEvent.click(screen.getByLabelText('Smooth Camera'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(splineBuilds[0].kind).toBe('linear');
  });

  it('hands the camera back on pause and on stop', () => {
    const viewer = twoWaypoints();
    const controller = viewer.scene.screenSpaceCameraController;

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    nextFrame(2000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(controller.enableInputs).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(controller.enableInputs).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(controller.enableInputs).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('stops the flight on escape', () => {
    const viewer = twoWaypoints();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('releases the camera when the panel closes mid-flight', () => {
    const viewer = twoWaypoints();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    cleanup();

    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(true);
  });
});

describe('FlythroughPanel recording', () => {
  it('leaves the canvas alone unless recording is armed', () => {
    twoWaypoints();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(screen.queryByTestId('flythrough-recording')).toBeNull();
  });

  it('records the flight and downloads it when the path runs out', async () => {
    const viewer = twoWaypoints();

    armRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(viewer.scene.canvas.captureStream).toHaveBeenCalledWith(30);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].options.mimeType).toBe('video/mp4;codecs=avc1.42E01E');
    expect(FakeMediaRecorder.instances[0].state).toBe('recording');
    expect(screen.getByTestId('flythrough-recording')).toBeInTheDocument();

    nextFrame(60_000);
    await flushDownload();

    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    expect(downloads).toEqual([expect.stringMatching(/^flythrough-\d+\.mp4$/)]);
    expect(screen.queryByTestId('flythrough-recording')).toBeNull();
  });

  it('downloads what it has when the flight is stopped early', async () => {
    twoWaypoints();

    armRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    nextFrame(100);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flushDownload();

    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    expect(downloads).toHaveLength(1);
  });

  it('names the file after the container the browser could write', async () => {
    vi.spyOn(FakeMediaRecorder, 'isTypeSupported').mockImplementation(
      (mimeType: string) => mimeType === 'video/webm;codecs=vp9',
    );
    twoWaypoints();

    armRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flushDownload();

    expect(downloads[0]).toMatch(/\.webm$/);
  });

  it('draws every frame while recording an on-demand scene', async () => {
    const viewer = twoWaypoints();
    viewer.scene.requestRenderMode = true;

    armRecording();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(viewer.scene.requestRenderMode).toBe(false);

    nextFrame(60_000);
    await flushDownload();

    expect(viewer.scene.requestRenderMode).toBe(true);
  });
});

describe('FlythroughPanel route handoff', () => {
  const routeGeometry: [number, number][] = [
    [10, 45],
    [10.01, 45.005],
    [10.02, 45.01],
  ];

  const showRoute = () => {
    const viewer = fakeViewer();
    mockViewer(viewer);
    useFlythroughStore.setState({ routeGeometry });
    renderPanel();
    return viewer;
  };

  it('flies a route handed over by the routing panel', () => {
    showRoute();

    expect(screen.getAllByTestId('flythrough-waypoint')).toHaveLength(3);
    // the default altitude, over the terrain the globe reports
    expect(screen.getAllByTestId('flythrough-waypoint')[0]).toHaveTextContent('1. 400 m');
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(splineBuilds[0].points).toEqual([
      { lon: 10, lat: 45, h: 400 },
      { lon: 10.01, lat: 45.005, h: 400 },
      { lon: 10.02, lat: 45.01, h: 400 },
    ]);
  });

  it('re-flies the route at the altitude the panel is set to', () => {
    showRoute();
    const altitude = screen.getByRole('slider', { name: 'Route altitude' });

    fireEvent.keyDown(altitude, { key: 'ArrowRight' });

    expect(screen.getAllByTestId('flythrough-waypoint')[0]).toHaveTextContent('1. 450 m');
  });

  it('keeps the route out of the way once waypoints are edited by hand', () => {
    showRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Remove waypoint 2' }));

    expect(useFlythroughStore.getState().routeGeometry).toBeNull();
    expect(screen.getAllByTestId('flythrough-waypoint')).toHaveLength(2);
    expect(screen.queryByRole('slider', { name: 'Route altitude' })).toBeNull();
  });
});
