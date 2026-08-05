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
const handlerActions: { action: ClickAction; type: number }[] = [];
let destroyed = 0;

type ClickAction = (click: { position: { x: number; y: number } }) => void;

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

// the drawing and flight plumbing is under test, so the WebGL bundle stays out
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
  Color: {
    fromCssColorString: (css: string) => ({ css, withAlpha: (a: number) => ({ css, a }) }),
    WHITE: 'white',
  },
  Math: {
    toRadians: (d: number) => (d * Math.PI) / 180,
    toDegrees: (r: number) => (r * 180) / Math.PI,
  },
  ScreenSpaceEventHandler: vi.fn(function (this: Record<string, unknown>) {
    this.setInputAction = vi.fn((action: unknown, type: number) => {
      handlerActions.push({ action: action as ClickAction, type });
    });
    this.destroy = vi.fn(() => {
      destroyed += 1;
    });
  }),
  ScreenSpaceEventType: { LEFT_CLICK: 2, LEFT_DOUBLE_CLICK: 3 },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { ScreenSpaceEventType } from 'cesium';
import { DronePanel } from '../../src/components/tools/DronePanel';
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

const frames: FrameRequestCallback[] = [];
// the picked ground moves with each click, and sits 40 m above the ellipsoid
let picked: FakeCartesian = { lon: 10, lat: 45, h: 40 };

function fakeViewer() {
  return {
    scene: {
      canvas: document.createElement('canvas'),
      pickPositionSupported: true,
      pickPosition: vi.fn(() => picked),
      globe: { ellipsoid: { name: 'WGS84' } },
      screenSpaceCameraController: { enableInputs: true },
    },
    camera: { pickEllipsoid: vi.fn(() => picked), setView: vi.fn() },
    entities: {
      add: vi.fn((options: object) => ({ options })),
      remove: vi.fn(() => true),
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
      <DronePanel onClose={() => {}} />
    </MantineProvider>,
  );

// cesium calls the handler outside react, so the collection render needs act
function clickMap(ground: FakeCartesian) {
  picked = ground;
  const armed = handlerActions.filter((a) => a.type === ScreenSpaceEventType.LEFT_CLICK).at(-1);
  if (!armed) throw new Error('no click handler armed');
  act(() => armed.action({ position: { x: 10, y: 20 } }));
}

function doubleClickMap() {
  const armed = handlerActions.filter((a) => a.type === 3).at(-1);
  if (!armed) throw new Error('no double click handler armed');
  act(() => armed.action({ position: { x: 10, y: 20 } }));
}

function drawTwoPoints() {
  const viewer = fakeViewer();
  mockViewer(viewer);
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Draw Flight Path' }));
  clickMap({ lon: 10, lat: 45, h: 40 });
  clickMap({ lon: 10.01, lat: 45.01, h: 60 });
  return viewer;
}

const addedPolylines = (viewer: FakeViewer) =>
  viewer.entities.add.mock.calls
    .map(([options]) => options as { polyline?: { positions: FakeCartesian[] } })
    .filter((o) => o.polyline);

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  splineBuilds.length = 0;
  handlerActions.length = 0;
  frames.length = 0;
  destroyed = 0;
  picked = { lon: 10, lat: 45, h: 40 };
  mockViewer(null);
  useAppStore.setState({ renderer: 'cesium' });
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  globalThis.cancelAnimationFrame = vi.fn();
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

describe('DronePanel', () => {
  it('shows the renderer notice when there is no cesium viewer', () => {
    mockViewer(null);
    renderPanel();

    expect(screen.getByTestId('drone-no-cesium')).toHaveTextContent(
      'The drone planner needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
    expect(screen.queryByRole('button', { name: 'Draw Flight Path' })).toBeNull();
  });

  it('arms map clicks only while drawing', () => {
    mockViewer(fakeViewer());
    renderPanel();

    expect(handlerActions).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Draw Flight Path' }));

    expect(handlerActions.map((a) => a.type)).toEqual([ScreenSpaceEventType.LEFT_CLICK, 3]);
    expect(screen.getByTestId('drone-hint')).toHaveTextContent(
      'Click the map to add waypoints, double-click to finish (0 so far)',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop Drawing' }));

    expect(destroyed).toBe(1);
  });

  it('collects picked ground positions and draws the track', () => {
    const viewer = drawTwoPoints();

    expect(viewer.scene.pickPosition).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('drone-hint')).toHaveTextContent('(2 so far)');

    const line = addedPolylines(viewer).at(-1);
    expect(line?.polyline?.positions).toEqual([
      { lon: 10, lat: 45, h: 40 },
      { lon: 10.01, lat: 45.01, h: 60 },
    ]);
  });

  it('ends drawing on a double click', () => {
    drawTwoPoints();

    doubleClickMap();

    expect(screen.getByRole('button', { name: 'Draw Flight Path' })).toBeInTheDocument();
    expect(destroyed).toBe(1);
    expect(screen.getByTestId('drone-hint')).toHaveTextContent(/^2 waypoints, \d+ m of track$/);
  });

  it('flies the track raised to the altitude above the picked ground', () => {
    const viewer = drawTwoPoints();
    doubleClickMap();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));

    expect(splineBuilds).toHaveLength(1);
    expect(splineBuilds[0].points).toEqual([
      { lon: 10, lat: 45, h: 140 },
      { lon: 10.01, lat: 45.01, h: 160 },
    ]);
    expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);

    const frame = frames.at(-1);
    if (!frame) throw new Error('no animation frame requested');
    act(() => frame(1000));

    expect(viewer.camera.setView).toHaveBeenCalled();
  });

  it('raises the track by a changed altitude', () => {
    drawTwoPoints();
    doubleClickMap();

    fireEvent.change(screen.getByLabelText('Altitude (m)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));

    expect(splineBuilds[0].points.map((p) => p.h)).toEqual([290, 310]);
  });

  it('cannot simulate a single waypoint', () => {
    const viewer = fakeViewer();
    mockViewer(viewer);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Draw Flight Path' }));
    clickMap({ lon: 10, lat: 45, h: 40 });

    expect(screen.getByRole('button', { name: 'Simulate' })).toBeDisabled();
  });

  it('clears the track and its entities', () => {
    const viewer = drawTwoPoints();
    doubleClickMap();
    const drawn = viewer.entities.add.mock.results.map((r) => r.value);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Path' }));

    expect(screen.getByTestId('drone-hint')).toHaveTextContent('0 waypoints, 0 m of track');
    expect(viewer.entities.remove).toHaveBeenCalledWith(drawn.at(-1));
    expect(screen.getByRole('button', { name: 'Simulate' })).toBeDisabled();
  });
});
