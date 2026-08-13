import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the provider plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  createWorldTerrainAsync: vi.fn(async () => ({ world: true })),
  CesiumTerrainProvider: {
    fromUrl: vi.fn(async (url: string) => ({ url })),
  },
  EllipsoidTerrainProvider: class {},
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { CesiumTerrainProvider } from 'cesium';
import { GlobalTerrainPanel } from '../../src/components/tools/GlobalTerrainPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';

// MantineProvider reads the color scheme through matchMedia, missing from jsdom
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
Element.prototype.scrollIntoView = vi.fn();

function fakeViewer() {
  return {
    scene: { verticalExaggeration: 1 },
    terrainProvider: null as unknown,
    isDestroyed: () => false,
  };
}

const useViewer = (v: ReturnType<typeof fakeViewer> | null) =>
  vi.mocked(getActiveCesiumViewer).mockReturnValue(v as never);

const bundleListResponse = (names: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => names }));

const renderPanel = () =>
  render(
    <MantineProvider>
      <GlobalTerrainPanel onClose={() => {}} />
    </MantineProvider>,
  );

const openProviderSelect = () =>
  fireEvent.click(screen.getByRole('textbox', { name: 'Provider' }));

async function selectBundle(name: string) {
  openProviderSelect();
  fireEvent.click(await screen.findByRole('option', { name }));
}

const enableTerrain = () =>
  fireEvent.click(screen.getByRole('button', { name: /enable terrain/i }));

beforeEach(() => {
  // vitest globals are off, so testing-library's auto cleanup doesn't run
  cleanup();
  vi.clearAllMocks();
  useViewer(fakeViewer());
  useAppStore.setState({ renderer: 'cesium' });
});

describe('GlobalTerrainPanel terrain bundles', () => {
  it('lists a bundle per name returned by the terrain service', async () => {
    const fetchMock = bundleListResponse(['alps', 'pyrenees']);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    openProviderSelect();

    expect(await screen.findByRole('option', { name: 'alps' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'pyrenees' })).toBeInTheDocument();
    expect(screen.getByText('Terrain bundles')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/terrain/bundles');
  });

  it('loads a chosen bundle from its own directory, trailing slash included', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', bundleListResponse(['alps']));
    renderPanel();

    await selectBundle('alps');
    enableTerrain();

    expect(await screen.findByTestId('terrain-status')).toHaveTextContent(
      'Terrain bundle alps enabled',
    );
    expect(CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith('/tiles/v1/terrain/bundles/alps/');
    expect(viewer.terrainProvider).toEqual({ url: '/tiles/v1/terrain/bundles/alps/' });
    expect(screen.getByText('/tiles/v1/terrain/bundles/alps/')).toBeInTheDocument();
  });

  it('reports a bundle that will not load and leaves the terrain alone', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', bundleListResponse(['alps']));
    vi.mocked(CesiumTerrainProvider.fromUrl).mockRejectedValueOnce(new Error('404 Not Found'));
    renderPanel();

    await selectBundle('alps');
    enableTerrain();

    expect(await screen.findByTestId('terrain-status')).toHaveTextContent(
      'Terrain failed: 404 Not Found',
    );
    expect(viewer.terrainProvider).toBeNull();
  });

  it('offers no bundle group when the service has no bundles', async () => {
    vi.stubGlobal('fetch', bundleListResponse([]));
    renderPanel();

    openProviderSelect();

    expect(await screen.findByRole('option', { name: 'Platform terrain' })).toBeInTheDocument();
    expect(screen.queryByText('Terrain bundles')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('offers no bundle group when no terrain service answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    renderPanel();

    openProviderSelect();

    expect(await screen.findByRole('option', { name: 'Platform terrain' })).toBeInTheDocument();
    expect(screen.queryByText('Terrain bundles')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('keeps the platform terrain provider working when the bundle fetch rejects', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPanel();

    enableTerrain();

    expect(await screen.findByTestId('terrain-status')).toHaveTextContent(
      'Platform terrain enabled',
    );
    expect(CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith('/tiles/v1/terrain/');
    expect(screen.queryByText('Terrain bundles')).toBeNull();
  });
});
