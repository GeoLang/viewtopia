import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../src/store/app';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

// cesium is a heavy WebGL bundle and only its degree conversion is used here
vi.mock('cesium', () => ({
  Math: { toDegrees: (r: number) => (r * 180) / Math.PI },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
}));

const { getActiveCesiumViewer, getActiveMapLibre } = await import(
  '../../src/viewer/registry'
);
const { getViewBounds } = await import('../../src/lib/viewBounds');

const rad = (d: number) => (d * Math.PI) / 180;

/** A Cesium viewer whose camera reports a degree rectangle. */
function cesiumViewer(w: number, s: number, e: number, n: number) {
  return {
    camera: {
      computeViewRectangle: () => ({ west: rad(w), south: rad(s), east: rad(e), north: rad(n) }),
    },
  };
}

function maplibreMap(w: number, s: number, e: number, n: number) {
  return {
    getBounds: () => ({ getWest: () => w, getSouth: () => s, getEast: () => e, getNorth: () => n }),
  };
}

describe('getViewBounds', () => {
  beforeEach(() => {
    vi.mocked(getActiveCesiumViewer).mockReturnValue(null);
    vi.mocked(getActiveMapLibre).mockReturnValue(null);
    useAppStore.setState({ renderer: 'cesium' });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2, pitch: 0, bearing: 0 });
  });

  it('reads the displayed renderer, not a leftover Cesium viewer', () => {
    // both live: MapLibre is on screen, so its bounds are the ones that count
    vi.mocked(getActiveCesiumViewer).mockReturnValue(cesiumViewer(-10, -10, 10, 10) as never);
    vi.mocked(getActiveMapLibre).mockReturnValue(maplibreMap(7.4, 43.7, 7.5, 43.8) as never);
    useAppStore.setState({ renderer: 'maplibre' });

    expect(getViewBounds()).toEqual({
      west: 7.4,
      south: 43.7,
      east: 7.5,
      north: 43.8,
      centerLng: 7.45,
      centerLat: 43.75,
    });
  });

  it('converts the Cesium rectangle to degrees', () => {
    vi.mocked(getActiveCesiumViewer).mockReturnValue(cesiumViewer(-10, -20, 10, 20) as never);

    const b = getViewBounds();
    expect(b.west).toBeCloseTo(-10);
    expect(b.north).toBeCloseTo(20);
    expect(b.centerLat).toBeCloseTo(0);
  });

  it('falls through to another live renderer when the displayed one has no rectangle', () => {
    // a Cesium camera looking at space returns no view rectangle
    vi.mocked(getActiveCesiumViewer).mockReturnValue({
      camera: { computeViewRectangle: () => undefined },
    } as never);
    vi.mocked(getActiveMapLibre).mockReturnValue(maplibreMap(1, 2, 3, 4) as never);

    const b = getViewBounds();
    expect([b.west, b.south, b.east, b.north]).toEqual([1, 2, 3, 4]);
  });

  it('falls back to a shared-camera box when no renderer is live', () => {
    setSharedCamera({ longitude: 5, latitude: 45, zoom: 3 });

    expect(getViewBounds()).toEqual({
      west: 5 - 22.5,
      south: 45 - 22.5,
      east: 5 + 22.5,
      north: 45 + 22.5,
      centerLng: 5,
      centerLat: 45,
    });
  });
});
