import { describe, it, expect, beforeEach, vi } from 'vitest';
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

function fakeViewer() {
  return {
    scene: {
      canvas: document.createElement('canvas'),
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

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  splineBuilds.length = 0;
  frames.length = 0;
  mockViewer(null);
  useAppStore.setState({ renderer: 'cesium' });
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  globalThis.cancelAnimationFrame = vi.fn();
  vi.spyOn(performance, 'now').mockReturnValue(0);
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
