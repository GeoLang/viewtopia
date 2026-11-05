import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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
  getActiveDeckOverlay: vi.fn(() => null),
}));

import { CesiumTerrainProvider } from 'cesium';
import { GlobalTerrainPanel } from '../../src/components/tools/GlobalTerrainPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';
import { useAuthStore } from '../../src/features/auth/store';

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

const serveTerrain = (names: string[], layerJson: Response) =>
  vi.fn(async (url: string) =>
    url.endsWith('/layer.json') ? layerJson : new Response(JSON.stringify(names)),
  );

const renderPanel = () =>
  render(
    <MantineProvider env="test">
      <GlobalTerrainPanel onClose={() => {}} />
    </MantineProvider>,
  );

const openProviderSelect = () =>
  fireEvent.click(screen.getByRole('textbox', { name: 'Provider' }));

async function selectProvider(name: string) {
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
  useAuthStore.setState({ token: null, loggedIn: false });
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
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/terrain/bundles', { headers: {} });
  });

  it('asks for the bundle list with the bearer, which is what adds the user\'s own DEM uploads', async () => {
    useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
    const fetchMock = bundleListResponse(['alps']);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    openProviderSelect();

    expect(await screen.findByRole('option', { name: 'alps' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/terrain/bundles', {
      headers: { Authorization: 'Bearer jwt-token' },
    });
  });

  it('ends the session when the bundle list refuses its token', async () => {
    useAuthStore.setState({
      token: `header.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`,
      loggedIn: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );
    renderPanel();

    await waitFor(() => expect(useAuthStore.getState().token).toBeNull());
  });

  it('loads a chosen bundle from its own directory, trailing slash included', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', bundleListResponse(['alps']));
    renderPanel();

    await selectProvider('alps');
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
    vi.stubGlobal('fetch', serveTerrain(['alps'], new Response(null, { status: 404 })));
    renderPanel();

    await selectProvider('alps');
    enableTerrain();

    await waitFor(() =>
      expect(screen.getByTestId('terrain-status')).toHaveTextContent(
        'Terrain failed: /tiles/v1/terrain/bundles/alps/layer.json answered HTTP 404',
      ),
    );
    expect(CesiumTerrainProvider.fromUrl).not.toHaveBeenCalled();
    expect(viewer.terrainProvider).toBeNull();
  });

  it('offers no bundle group when the service has no bundles', async () => {
    vi.stubGlobal('fetch', bundleListResponse([]));
    renderPanel();

    openProviderSelect();

    expect(await screen.findByRole('option', { name: 'Platform terrain' })).toBeInTheDocument();
    expect(screen.queryByText('Terrain bundles')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(4);
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
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('keeps the platform terrain provider working when the bundle fetch rejects', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/layer.json')) return new Response('{}');
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

describe('GlobalTerrainPanel platform terrain', () => {
  it('names the status under no source when the service answers 404', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', serveTerrain([], new Response(null, { status: 404 })));
    renderPanel();

    enableTerrain();

    await waitFor(() =>
      expect(screen.getByTestId('terrain-error')).toHaveTextContent(
        '/tiles/v1/terrain/layer.json answered HTTP 404',
      ),
    );
    expect(screen.getByTestId('terrain-status')).toHaveTextContent(/^No terrain source/);
    expect(CesiumTerrainProvider.fromUrl).not.toHaveBeenCalled();
    expect(viewer.terrainProvider).toBeNull();
  });
});

describe('GlobalTerrainPanel global terrain', () => {
  it('loads the global terrain route and says which levels have relief', async () => {
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', bundleListResponse([]));
    renderPanel();

    await selectProvider('Global terrain');
    enableTerrain();

    expect(await screen.findByTestId('terrain-status')).toHaveTextContent('Global terrain enabled');
    expect(CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith('/tiles/v1/terrain/global/');
    expect(viewer.terrainProvider).toEqual({ url: '/tiles/v1/terrain/global/' });
    expect(screen.getByText('/tiles/v1/terrain/global/')).toBeInTheDocument();
    expect(screen.getByText(/Levels 0 to 6 are the geoid surface/)).toBeInTheDocument();
  });

  it('shows the variables the 503 of an unconfigured stack names, and leaves the terrain alone', async () => {
    const missing =
      'global terrain is not configured, set TILETOPIA_GLOBAL_TERRAIN_DEM_URL, TILETOPIA_GLOBAL_TERRAIN_GEOID_URL, TILETOPIA_GLOBAL_TERRAIN_CACHE_DIR';
    const viewer = fakeViewer();
    useViewer(viewer);
    vi.stubGlobal('fetch', serveTerrain([], new Response(missing, { status: 503 })));
    renderPanel();

    await selectProvider('Global terrain');
    enableTerrain();

    await waitFor(() =>
      expect(screen.getByTestId('terrain-status')).toHaveTextContent(`Terrain failed: ${missing}`),
    );
    expect(CesiumTerrainProvider.fromUrl).not.toHaveBeenCalled();
    expect(viewer.terrainProvider).toBeNull();
  });
});
