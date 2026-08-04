import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// the panel imports cesium through the shared analysis lib, and nothing here
// draws, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Rectangle: { fromDegrees: () => ({}) },
  SingleTileImageryProvider: { fromUrl: async () => ({}) },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

vi.mock('../../src/lib/viewBounds', () => ({
  getViewBounds: () => ({ west: 7, south: 45, east: 7.02, north: 45.01 }),
}));

import { TerrainAnalysisPanel } from '../../src/components/tools/TerrainAnalysisPanel';
import {
  DEFAULT_SUN,
  exportUrl,
  liveLayerName,
  liveTileTemplate,
} from '../../src/lib/terrainAnalysis';
import { useOgcLayerStore, rasterTileTemplate } from '../../src/store/ogcLayers';
import { useAuthStore } from '../../src/features/auth/store';

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

describe('live analysis tile templates', () => {
  it('keeps the xyz placeholders literal and bakes in the sun for hillshade', () => {
    expect(liveTileTemplate('hillshade', { azimuth: 120, altitude: 30 })).toBe(
      '/tiles/v1/analysis/xyz/hillshade/{z}/{x}/{y}.png?azimuth=120&altitude=30',
    );
  });

  it('asks for no parameters on slope', () => {
    expect(liveTileTemplate('slope', DEFAULT_SUN)).toBe(
      '/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png',
    );
  });

  it('names a layer after its op and sun', () => {
    expect(liveLayerName('hillshade', DEFAULT_SUN)).toBe('hillshade 315/45 (live)');
    expect(liveLayerName('slope', DEFAULT_SUN)).toBe('slope (live)');
  });

  it('asks for no parameters on ndvi, the sun means nothing to vegetation', () => {
    expect(liveTileTemplate('ndvi', { azimuth: 120, altitude: 30 })).toBe(
      '/tiles/v1/analysis/xyz/ndvi/{z}/{x}/{y}.png',
    );
    expect(liveLayerName('ndvi', DEFAULT_SUN)).toBe('ndvi (live)');
  });
});

describe('addXyzLayer', () => {
  beforeEach(() => {
    useOgcLayerStore.setState({ layers: [] });
  });

  it('adds an xyz layer the renderers can draw', () => {
    const layer = useOgcLayerStore.getState().addXyzLayer('slope (live)', liveTileTemplate('slope', DEFAULT_SUN));

    expect(layer.type).toBe('xyz');
    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
    expect(rasterTileTemplate(layer)).toBe(
      `${window.location.origin}/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png`,
    );
  });

  it('returns the layer already drawing the same tiles instead of a second one', () => {
    const url = liveTileTemplate('hillshade', DEFAULT_SUN);
    const first = useOgcLayerStore.getState().addXyzLayer('hillshade 315/45 (live)', url);
    const again = useOgcLayerStore.getState().addXyzLayer('hillshade 315/45 (live)', url);

    expect(again.id).toBe(first.id);
    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
  });

  it('adds a second layer for different parameters', () => {
    useOgcLayerStore
      .getState()
      .addXyzLayer('hillshade 315/45 (live)', liveTileTemplate('hillshade', DEFAULT_SUN));
    useOgcLayerStore
      .getState()
      .addXyzLayer('hillshade 90/20 (live)', liveTileTemplate('hillshade', { azimuth: 90, altitude: 20 }));

    expect(useOgcLayerStore.getState().layers).toHaveLength(2);
  });
});

describe('TerrainAnalysisPanel live layer action', () => {
  beforeEach(() => {
    cleanup();
    useOgcLayerStore.setState({ layers: [] });
  });

  const renderPanel = () => {
    render(
      <MantineProvider>
        <TerrainAnalysisPanel onClose={() => {}} />
      </MantineProvider>,
    );
    return screen.getByRole('button', { name: /add live layer/i });
  };

  it('adds the layer for the selected op without a session token', () => {
    const button = renderPanel();
    // slope is the panel's default op
    fireEvent.click(button);

    const [layer] = useOgcLayerStore.getState().layers;
    expect(layer).toMatchObject({
      name: 'slope (live)',
      type: 'xyz',
      url: '/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png',
    });
    expect(screen.getByTestId('terrain-live-status')).toHaveTextContent('slope (live)');
  });

  it('does not stack a duplicate when clicked twice', () => {
    const button = renderPanel();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
  });

  it('adds the ndvi layer regardless of the selected op', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /add live ndvi layer/i }));

    const [layer] = useOgcLayerStore.getState().layers;
    expect(layer).toMatchObject({
      name: 'ndvi (live)',
      type: 'xyz',
      url: '/tiles/v1/analysis/xyz/ndvi/{z}/{x}/{y}.png',
    });
    expect(screen.getByTestId('terrain-live-status')).toHaveTextContent('ndvi (live)');
  });
});

describe('export urls', () => {
  it('carries bbox and resolution, and the sun only for hillshade', () => {
    expect(exportUrl('hillshade', [7, 45, 7.02, 45.01], 100, { azimuth: 90, altitude: 20 })).toBe(
      '/tiles/v1/analysis/export/hillshade?bbox=7%2C45%2C7.02%2C45.01&resolution=100&azimuth=90&altitude=20',
    );
    expect(exportUrl('ndvi', [7, 45, 8, 46], 30, DEFAULT_SUN)).toBe(
      '/tiles/v1/analysis/export/ndvi?bbox=7%2C45%2C8%2C46&resolution=30',
    );
    expect(exportUrl('slope', [7, 45, 8, 46], 30, DEFAULT_SUN)).toBe(
      '/tiles/v1/analysis/export/slope?bbox=7%2C45%2C8%2C46&resolution=30',
    );
  });
});

describe('TerrainAnalysisPanel export download', () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: { email: 'a@b.c' } });
    URL.createObjectURL = vi.fn(() => 'blob:cog');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ loggedIn: false, token: null, user: null });
  });

  const renderPanel = () => {
    render(
      <MantineProvider>
        <TerrainAnalysisPanel onClose={() => {}} />
      </MantineProvider>,
    );
  };

  it('fetches the gated export with the bearer and saves the blob', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['tif']),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Download NDVI GeoTIFF' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/tiles/v1/analysis/export/ndvi?bbox=7%2C45%2C7.02%2C45.01&resolution=100');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
    await waitFor(() =>
      expect(screen.getByTestId('terrain-live-status')).toHaveTextContent('Downloaded ndvi.tif'),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows the server refusal instead of a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => 'bbox covers no ground, expected west,south,east,north in degrees',
      })),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Download GeoTIFF' }));

    await waitFor(() => expect(screen.getByText(/covers no ground/)).toBeInTheDocument());
  });

  it('keeps the exports behind a session, like the analysis posts', () => {
    useAuthStore.setState({ loggedIn: false, token: null, user: null });
    renderPanel();

    expect(screen.getByRole('button', { name: 'Download GeoTIFF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download NDVI GeoTIFF' })).toBeDisabled();
  });
});
