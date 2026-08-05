import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// viewBounds pulls in the cesium bundle for its degree conversion only
vi.mock('cesium', () => ({
  Math: { toDegrees: (r: number) => (r * 180) / Math.PI },
}));

const VIEW = { west: 10, south: 50, east: 10.05, north: 50.05 };

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => ({
    getBounds: () => ({
      getWest: () => VIEW.west,
      getSouth: () => VIEW.south,
      getEast: () => VIEW.east,
      getNorth: () => VIEW.north,
    }),
  })),
  getActiveDeck: vi.fn(() => null),
}));

// no indexeddb in jsdom and fake-indexeddb is not a dependency, so the store
// itself is the seam: the tile fetching and key math under test stay real
const db = vi.hoisted(() => ({
  regions: [] as unknown[],
  tiles: new Map<string, unknown>(),
}));

vi.mock('../../src/offline/db', () => ({
  tileCache: {
    put: vi.fn(async (tile: { key: string }) => {
      db.tiles.set(tile.key, tile);
    }),
    remove: vi.fn(async (key: string) => {
      db.tiles.delete(key);
    }),
  },
  cachedRegions: {
    getAll: vi.fn(async () => db.regions),
    put: vi.fn(async (region: unknown) => {
      db.regions.push(region);
    }),
    remove: vi.fn(async (id: string) => {
      db.regions = db.regions.filter((r) => (r as { id: string }).id !== id);
    }),
  },
}));

import { OfflinePanel } from '../../src/components/tools/OfflinePanel';
import { cachedRegions, tileCache, type CachedRegion } from '../../src/offline/db';
import { useAppStore } from '../../src/store/app';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

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

const region = (over: Partial<CachedRegion> = {}): CachedRegion => ({
  id: 'r1',
  name: 'Alps',
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  bounds: VIEW,
  minZoom: 10,
  maxZoom: 11,
  tiles: 12,
  bytes: 3 * 1024 * 1024,
  createdAt: 1,
  ...over,
});

const renderPanel = () =>
  render(
    <MantineProvider>
      <OfflinePanel onClose={() => {}} />
    </MantineProvider>,
  );

const tileResponse = () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(1024),
  headers: { get: () => 'image/png' },
});

describe('OfflinePanel', () => {
  beforeEach(() => {
    // vitest globals are off, so testing-library's auto cleanup doesn't run
    cleanup();
    vi.clearAllMocks();
    db.regions = [];
    db.tiles.clear();
    useAppStore.setState({ renderer: 'maplibre', basemap: 'osm', customBasemap: null });
    setSharedCamera({ zoom: 10 });
  });

  it('renders the cached regions held in the offline store', async () => {
    db.regions = [
      region(),
      region({ id: 'r2', name: 'Rhone', tiles: 4, bytes: 512 * 1024, createdAt: 2 }),
    ];
    renderPanel();

    expect(await screen.findByText('Alps')).toBeInTheDocument();
    expect(screen.getByText('12 tiles')).toBeInTheDocument();
    expect(screen.getByText('3.0MB')).toBeInTheDocument();
    expect(screen.getByText('0.5MB')).toBeInTheDocument();
    expect(screen.queryByText('No cached regions')).toBeNull();

    const names = screen.getAllByText(/Alps|Rhone/).map((el) => el.textContent);
    expect(names).toEqual(['Rhone', 'Alps']);
  });

  it('downloads the basemap tiles over the current view and records the region', async () => {
    const fetchMock = vi.fn(async () => tileResponse());
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    await screen.findByText('No cached regions');

    fireEvent.change(screen.getByPlaceholderText('Region name'), {
      target: { value: 'Test area' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cache current view/i }));

    await waitFor(() => expect(cachedRegions.put).toHaveBeenCalled());

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [url] of fetchMock.mock.calls as unknown as [string][]) {
      expect(url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/1[012]\/\d+\/\d+\.png$/);
    }
    expect(tileCache.put).toHaveBeenCalledTimes(fetchMock.mock.calls.length);

    const saved = vi.mocked(cachedRegions.put).mock.calls[0][0];
    expect(saved.bounds).toEqual(VIEW);
    expect(saved).toMatchObject({
      name: 'Test area',
      minZoom: 10,
      maxZoom: 12,
      tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tiles: fetchMock.mock.calls.length,
      bytes: fetchMock.mock.calls.length * 1024,
    });

    expect(await screen.findByText('Test area')).toBeInTheDocument();
  });

  it('refuses a view that needs more tiles than the cap', async () => {
    const fetchMock = vi.fn(async () => tileResponse());
    vi.stubGlobal('fetch', fetchMock);
    setSharedCamera({ zoom: 19 });
    renderPanel();
    await screen.findByText('No cached regions');

    fireEvent.click(screen.getByRole('button', { name: /cache current view/i }));

    expect(await screen.findByTestId('offline-error')).toHaveTextContent(/over the 2000 limit/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cachedRegions.put).not.toHaveBeenCalled();
  });

  it('evicts the tiles of a region it deletes', async () => {
    db.regions = [region({ minZoom: 10, maxZoom: 10 })];
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alps' }));

    await waitFor(() => expect(cachedRegions.remove).toHaveBeenCalledWith('r1'));
    expect(tileCache.remove).toHaveBeenCalled();
    for (const [key] of vi.mocked(tileCache.remove).mock.calls) {
      expect(key).toMatch(/^10\/\d+\/\d+@https:\/\/tile\.openstreetmap\.org/);
    }
    expect(await screen.findByText('No cached regions')).toBeInTheDocument();
  });
});
