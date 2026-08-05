import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the sampling and cut/fill plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Cartographic: {
    fromDegrees: (longitude: number, latitude: number) => ({ longitude, latitude, height: 0 }),
  },
  EllipsoidTerrainProvider: class {},
  sampleTerrainMostDetailed: vi.fn(),
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { EllipsoidTerrainProvider, sampleTerrainMostDetailed } from 'cesium';
import { VolumePanel } from '../../src/components/tools/VolumePanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';
import { useDrawStore } from '../../src/store/draw';

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

// 0.01 deg square at the equator: 1113.2 m on a side
const SQUARE: [number, number][] = [
  [0, 0],
  [0.01, 0],
  [0.01, 0.01],
  [0, 0.01],
];
const SIDE_M = 0.01 * 111_320;
const SQUARE_AREA = SIDE_M * SIDE_M;

function fakeViewer(terrainProvider: unknown) {
  return { terrainProvider, isDestroyed: () => false };
}

const useViewer = (v: unknown) =>
  vi.mocked(getActiveCesiumViewer).mockReturnValue(v as never);

const renderPanel = () =>
  render(
    <MantineProvider>
      <VolumePanel onClose={() => {}} />
    </MantineProvider>,
  );

function drawSquare() {
  useDrawStore.setState({
    features: [
      { id: 'poly-1', type: 'Polygon', coords: SQUARE, color: '#a78bfa', lineWidth: 2 },
    ],
  });
}

const measure = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Measure' }));
  });
};

const numberOf = (testId: string) =>
  Number(screen.getByTestId(testId).textContent?.replace(/[^0-9.-]/g, ''));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useViewer(null);
  useAppStore.setState({ renderer: 'cesium' });
  useDrawStore.setState({ features: [], pending: [], mode: null });
});

describe('VolumePanel', () => {
  it('shows the renderer notice when there is no cesium viewer', () => {
    renderPanel();

    expect(screen.getByTestId('volume-no-cesium')).toHaveTextContent(
      'Volume measurement needs the Cesium globe. Switch to the CesiumJS renderer.',
    );
  });

  it('refuses to report volumes on the default ellipsoid terrain', async () => {
    useViewer(fakeViewer(new EllipsoidTerrainProvider()));
    drawSquare();
    renderPanel();

    await measure();

    expect(screen.getByTestId('volume-terrain-notice')).toHaveTextContent(
      'Enable a terrain source in the Global Terrain panel',
    );
    expect(sampleTerrainMostDetailed).not.toHaveBeenCalled();
    expect(screen.queryByTestId('volume-cut')).toBeNull();
  });

  it('computes cut and fill against the minimum sampled height', async () => {
    // half the cells at 20 m, half at 0 m, so a min base of 0 puts an average
    // of 10 m of material over the whole polygon
    vi.mocked(sampleTerrainMostDetailed).mockImplementation(async (_provider, positions) =>
      positions.map((_p, i) => ({ height: i % 2 === 0 ? 0 : 20 }) as never),
    );
    useViewer(fakeViewer({ kind: 'real-terrain' }));
    drawSquare();
    renderPanel();

    await measure();

    const sampled = vi.mocked(sampleTerrainMostDetailed).mock.calls[0][1];
    expect(sampled).toHaveLength(64 * 64);

    const cut = numberOf('volume-cut');
    expect(cut).toBeGreaterThan(SQUARE_AREA * 10 * 0.99);
    expect(cut).toBeLessThan(SQUARE_AREA * 10 * 1.01);
    expect(numberOf('volume-fill')).toBe(0);
    expect(numberOf('volume-net')).toBe(cut);
    expect(screen.getByTestId('volume-detail')).toHaveTextContent('4096 cells');
  });

  it('measures cut and fill against a user-entered base height', async () => {
    vi.mocked(sampleTerrainMostDetailed).mockImplementation(async (_provider, positions) =>
      positions.map(() => ({ height: 10 }) as never),
    );
    useViewer(fakeViewer({ kind: 'real-terrain' }));
    drawSquare();
    renderPanel();

    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Base height (m)'), { target: { value: '25' } });
    await measure();

    // constant 10 m terrain sits 15 m below the 25 m base, so it is all fill
    const fill = numberOf('volume-fill');
    expect(fill).toBeGreaterThan(SQUARE_AREA * 15 * 0.99);
    expect(fill).toBeLessThan(SQUARE_AREA * 15 * 1.01);
    expect(numberOf('volume-cut')).toBe(0);
    expect(numberOf('volume-net')).toBe(-fill);
  });

  it('surfaces a terrain sampling failure instead of a result', async () => {
    vi.mocked(sampleTerrainMostDetailed).mockRejectedValue(new Error('tile 404\nstack'));
    useViewer(fakeViewer({ kind: 'real-terrain' }));
    drawSquare();
    renderPanel();

    await measure();

    expect(screen.getByTestId('volume-error')).toHaveTextContent('Terrain sampling failed: tile 404');
    expect(screen.queryByTestId('volume-cut')).toBeNull();
  });
});
