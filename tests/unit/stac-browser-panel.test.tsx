import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the catalog plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Math: { toDegrees: (radians: number) => radians },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { StacBrowserPanel } from '../../src/features/stac/StacBrowserPanel';
import { useStacStore } from '../../src/features/stac/store';
import { useAppStore } from '../../src/store/app';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
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

const CATALOG = 'https://example.org/stac/v1';
const COLLECTIONS = `${CATALOG}/collections`;
const ITEMS = `${COLLECTIONS}/sentinel-2-l2a/items`;

const ROOT_DOC = {
  id: 'example-stac',
  title: 'Example STAC',
  links: [{ rel: 'data', href: COLLECTIONS }],
};

const COLLECTIONS_DOC = {
  collections: [
    {
      id: 'sentinel-2-l2a',
      title: 'Sentinel-2 L2A',
      description: 'surface reflectance',
      links: [{ rel: 'items', href: ITEMS }],
    },
    { id: 'landsat-c2-l2', title: 'Landsat Collection 2', links: [] },
  ],
};

const ITEMS_DOC = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'S2A_TILE_20240601',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7, 46],
            [8, 46],
            [8, 47],
            [7, 47],
            [7, 46],
          ],
        ],
      },
      properties: { datetime: '2024-06-01T10:20:30Z' },
      assets: {
        visual: {
          href: `${CATALOG}/data/visual.tif`,
          title: 'True colour',
          type: 'image/tiff; application=geotiff; profile=cloud-optimized',
        },
        outline: { href: `${CATALOG}/data/outline.geojson`, type: 'application/geo+json' },
        tiles: { href: `${CATALOG}/tiles/{z}/{x}/{y}.png`, type: 'image/png' },
        archive: { href: `${CATALOG}/data/tiles.pmtiles` },
        metadata: { href: `${CATALOG}/data/metadata.xml`, type: 'application/xml' },
      },
    },
  ],
  links: [{ rel: 'next', href: `${ITEMS}?page=2` }],
};

const OUTLINE_DOC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [7.5, 46.5] }, properties: {} },
  ],
};

const fetchMock = vi.fn();

function jsonOk(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function respond(handler: (url: string, init?: RequestInit) => unknown) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => handler(url, init));
}

/** the catalog answers root, its collection list, and one page of items */
function respondWithCatalog() {
  respond((url) => {
    if (url === CATALOG) return jsonOk(ROOT_DOC);
    if (url === COLLECTIONS) return jsonOk(COLLECTIONS_DOC);
    if (url.startsWith(ITEMS)) return jsonOk(ITEMS_DOC);
    if (url.endsWith('outline.geojson')) return jsonOk(OUTLINE_DOC);
    return jsonOk({}, 404);
  });
}

const renderPanel = async () => {
  const utils = render(
    <MantineProvider>
      <StacBrowserPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return utils;
};

async function openCatalog(url = CATALOG) {
  fireEvent.change(screen.getByLabelText('Catalog URL'), { target: { value: url } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  });
}

async function openCollection() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Browse sentinel-2-l2a' }));
  });
}

async function openAssets() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '5 assets' }));
  });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  globalThis.fetch = fetchMock as never;
  useStacStore.setState({ favorites: [], rasterAnalysisUrl: '' });
  useAppStore.setState({ activePanel: 'stacBrowser', renderer: 'maplibre' });
  useAgentLayerStore.setState({ layers: [] });
  useOgcLayerStore.setState({ layers: [] });
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  respondWithCatalog();
});

describe('StacBrowserPanel', () => {
  it('reads the catalog root and lists the collections it points at', async () => {
    await renderPanel();
    await openCatalog();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([CATALOG, COLLECTIONS]);
    expect(screen.getByTestId('stac-collection-sentinel-2-l2a')).toHaveTextContent(
      'Sentinel-2 L2A',
    );
    expect(screen.getByTestId('stac-collection-landsat-c2-l2')).toBeInTheDocument();
  });

  it('filters the collection list', async () => {
    await renderPanel();
    await openCatalog();

    fireEvent.change(screen.getByLabelText('Filter collections'), {
      target: { value: 'landsat' },
    });

    expect(screen.queryByTestId('stac-collection-sentinel-2-l2a')).toBeNull();
    expect(screen.getByTestId('stac-collection-landsat-c2-l2')).toBeInTheDocument();
  });

  it('opens a collection and lists its items and their assets', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();

    expect(fetchMock).toHaveBeenLastCalledWith(`${ITEMS}?limit=20`, expect.anything());
    const row = screen.getByTestId('stac-item-S2A_TILE_20240601');
    expect(row).toHaveTextContent('2024-06-01');

    await openAssets();
    expect(within(row).getByText('True colour')).toBeInTheDocument();
    // the xml metadata is listed without an action, the other four have one
    expect(within(row).getAllByText('not drawable')[0]).toBeInTheDocument();
    expect(within(row).getAllByRole('button', { name: 'Add layer' })).toHaveLength(3);
  });

  it('loads a geojson asset as a map layer', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();
    await openAssets();

    const row = screen.getByTestId('stac-item-S2A_TILE_20240601');
    const buttons = within(row).getAllByRole('button', { name: 'Add layer' });
    await act(async () => {
      fireEvent.click(buttons[0]);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${CATALOG}/data/outline.geojson`,
      expect.anything(),
    );
    const layers = useAgentLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('S2A_TILE_20240601 outline');
    expect(layers[0].geojson.features).toHaveLength(1);
  });

  it('adds a tile-template asset as an XYZ layer', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();
    await openAssets();

    const row = screen.getByTestId('stac-item-S2A_TILE_20240601');
    const buttons = within(row).getAllByRole('button', { name: 'Add layer' });
    await act(async () => {
      fireEvent.click(buttons[1]);
    });

    const layers = useOgcLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe('xyz');
    expect(layers[0].url).toBe(`${CATALOG}/tiles/{z}/{x}/{y}.png`);
  });

  it('drops a PMTiles asset again when its header cannot be read', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();
    await openAssets();

    const row = screen.getByTestId('stac-item-S2A_TILE_20240601');
    const buttons = within(row).getAllByRole('button', { name: 'Add layer' });
    await act(async () => {
      fireEvent.click(buttons[2]);
    });

    // the stub answers json, not an archive, so nothing drawable was added
    expect(useOgcLayerStore.getState().layers).toEqual([]);
    expect(screen.getByTestId('stac-status')).toHaveTextContent('S2A_TILE_20240601 archive:');
  });

  it('hands a COG asset to the raster analysis panel', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();
    await openAssets();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Raster analysis' }));
    });

    expect(useStacStore.getState().rasterAnalysisUrl).toBe(`${CATALOG}/data/visual.tif`);
    expect(useAppStore.getState().activePanel).toBe('rasterViewer');
  });

  it('adds the listed item footprints as one layer', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add footprints/ }));
    });

    const layers = useAgentLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('sentinel-2-l2a footprints');
    expect(layers[0].geojson.features[0].properties).toEqual({
      id: 'S2A_TILE_20240601',
      datetime: '2024-06-01T10:20:30Z',
    });
    expect(screen.getByTestId('stac-status')).toHaveTextContent('Added 1 footprints');
  });

  it('asks for items in the current view once the box is ticked', async () => {
    await renderPanel();
    await openCatalog();
    await openCollection();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Only items in the current view'));
    });

    // no live renderer, so the bounds come from the shared camera fallback
    const [requested] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(String(requested)).toMatch(/bbox=-?\d/);
  });

  it('saves a collection to the favourites and reopens it from there', async () => {
    await renderPanel();
    await openCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Save sentinel-2-l2a' }));
    expect(useStacStore.getState().favorites).toEqual([
      {
        catalogUrl: CATALOG,
        collectionId: 'sentinel-2-l2a',
        title: 'Example STAC / Sentinel-2 L2A',
      },
    ]);
    expect(localStorage.getItem('viewtopia-stac')).toContain('sentinel-2-l2a');

    fetchMock.mockClear();
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId('stac-favorites')).getByRole('button', {
          name: 'Example STAC / Sentinel-2 L2A',
        }),
      );
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      CATALOG,
      COLLECTIONS,
      `${ITEMS}?limit=20`,
    ]);
    expect(screen.getByTestId('stac-item-S2A_TILE_20240601')).toBeInTheDocument();
  });

  it('keeps the platform bearer off a third-party catalog and sends it to our own', async () => {
    await renderPanel();
    await openCatalog();

    const [, remoteInit] = fetchMock.mock.calls[0];
    expect((remoteInit as RequestInit).headers).toEqual({ Accept: 'application/json' });

    respond((url) => (url === '/stac/v1' ? jsonOk({ ...ROOT_DOC, links: [] }) : jsonOk({})));
    fetchMock.mockClear();
    await openCatalog('/stac/v1');

    const [, localInit] = fetchMock.mock.calls[0];
    const headers = (localInit as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token');
  });

  it('reports a catalog that will not answer', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await renderPanel();
    await openCatalog();

    expect(screen.getByTestId('stac-error')).toHaveTextContent('The catalog is unreachable.');
  });
});
