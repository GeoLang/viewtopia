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
import {
  itemSearchBody,
  parseFreeTextSearch,
  type ItemFilters,
} from '../../src/features/stac/client';
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
const SEARCH = `${CATALOG}/search`;

const FREE_TEXT_CLASS = 'https://api.stacspec.org/v1.0.0/item-search#free-text';

const ROOT_DOC = {
  id: 'example-stac',
  title: 'Example STAC',
  conformsTo: ['https://api.stacspec.org/v1.0.0/item-search', FREE_TEXT_CLASS],
  links: [{ rel: 'data', href: COLLECTIONS }],
};

/** the same catalog with no conformance list at all, so no free text */
const PLAIN_ROOT_DOC = { id: 'example-stac', title: 'Example STAC', links: ROOT_DOC.links };

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

/** what the catalog's next link adds to the search body that produced the page */
const NEXT_TOKEN = { token: 'after:S2A_TILE_20240601' };

const SEARCH_DOC = {
  ...ITEMS_DOC,
  links: [{ rel: 'next', href: SEARCH, method: 'POST', merge: true, body: NEXT_TOKEN }],
};

const SEARCH_PAGE_TWO = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'S2A_TILE_20240602',
      geometry: null,
      properties: { datetime: '2024-06-02T10:20:30Z' },
      assets: {},
    },
  ],
  links: [],
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

/** the same catalog, with a search that pages through its POST next link */
function respondWithSearch(root: unknown = ROOT_DOC) {
  respond((url, init) => {
    if (url === CATALOG) return jsonOk(root);
    if (url === COLLECTIONS) return jsonOk(COLLECTIONS_DOC);
    if (url === SEARCH) {
      const sent = JSON.parse(String(init?.body ?? '{}'));
      return jsonOk(sent.token === NEXT_TOKEN.token ? SEARCH_PAGE_TWO : SEARCH_DOC);
    }
    if (url.startsWith(ITEMS)) return jsonOk(ITEMS_DOC);
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

  it('searches with the filters the plain item listing cannot express', async () => {
    respondWithSearch();
    await renderPanel();
    await openCatalog();
    await openCollection();

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'reflectance' } });
    fireEvent.change(screen.getByLabelText('Maximum cloud cover'), { target: { value: '20' } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Only items in the current view'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });

    const [requested, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(requested).toBe(SEARCH);
    const sent = init as RequestInit;
    expect(sent.method).toBe('POST');
    const body = JSON.parse(String(sent.body));
    expect(body).toMatchObject({
      collections: ['sentinel-2-l2a'],
      limit: 20,
      q: ['reflectance'],
      query: { 'eo:cloud_cover': { lte: 20 } },
    });
    expect(body.bbox).toHaveLength(4);
    expect(screen.getByTestId('stac-item-S2A_TILE_20240601')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('loads the next search page through the POST link the catalog gives', async () => {
    respondWithSearch();
    await renderPanel();
    await openCatalog();
    await openCollection();

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'reflectance' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    });

    const [requested, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(requested).toBe(SEARCH);
    const sent = init as RequestInit;
    expect(sent.method).toBe('POST');
    // merge:true, so the link's token rides along with the filters that searched
    expect(JSON.parse(String(sent.body))).toEqual({
      collections: ['sentinel-2-l2a'],
      limit: 20,
      q: ['reflectance'],
      token: NEXT_TOKEN.token,
    });
    expect(screen.getByTestId('stac-item-S2A_TILE_20240601')).toBeInTheDocument();
    expect(screen.getByTestId('stac-item-S2A_TILE_20240602')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('refuses text search on a catalog that does not conform to free text', async () => {
    respondWithSearch(PLAIN_ROOT_DOC);
    await renderPanel();
    await openCatalog();
    await openCollection();

    const input = screen.getByLabelText('Search items');
    expect(input).toBeDisabled();
    expect(screen.getByText('This catalog has no text search.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maximum cloud cover'), { target: { value: '20' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });

    const [requested, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(requested).toBe(SEARCH);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.q).toBeUndefined();
    expect(body.query).toEqual({ 'eo:cloud_cover': { lte: 20 } });
  });

  it('re-enables the text input when the next catalog conforms to free text', async () => {
    respondWithSearch(PLAIN_ROOT_DOC);
    await renderPanel();
    await openCatalog();
    await openCollection();
    expect(screen.getByLabelText('Search items')).toBeDisabled();

    respondWithSearch();
    await openCatalog();
    await openCollection();
    expect(screen.getByLabelText('Search items')).toBeEnabled();
    expect(screen.queryByText('This catalog has no text search.')).toBeNull();
  });

  it('returns to the plain item listing once the filters are cleared', async () => {
    respondWithSearch();
    await renderPanel();
    await openCatalog();
    await openCollection();

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'reflectance' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]).toBe(SEARCH);

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    });

    expect(fetchMock).toHaveBeenLastCalledWith(`${ITEMS}?limit=20`, expect.anything());
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

    const ownCatalog = `${window.location.origin}/stac/v1`;
    respond((url) => (url === ownCatalog ? jsonOk({ ...ROOT_DOC, links: [] }) : jsonOk({})));
    fetchMock.mockClear();
    await openCatalog(ownCatalog);

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

  it('refuses a typed catalog URL that is not a full http address', async () => {
    await renderPanel();
    await openCatalog('javascript:alert(1)');

    expect(screen.getByTestId('stac-error')).toHaveTextContent(
      'The viewer opens http and https catalogs, not javascript ones.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await openCatalog('/api/v1/projects');

    expect(screen.getByTestId('stac-error')).toHaveTextContent('Give the whole address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the open catalog alone when the next URL is refused', async () => {
    await renderPanel();
    await openCatalog();
    await openCatalog('file:///etc/passwd');

    expect(screen.getByTestId('stac-collection-sentinel-2-l2a')).toBeInTheDocument();
    expect(screen.getByTestId('stac-error')).toHaveTextContent('not file ones');
  });
});

describe('free-text conformance', () => {
  const FILTERS: ItemFilters = { text: 'reflectance', bbox: null, maxCloudCover: null };

  it('reads the class off a landing page whatever version it names', () => {
    expect(parseFreeTextSearch(ROOT_DOC)).toBe(true);
    expect(
      parseFreeTextSearch({ conformsTo: ['https://api.stacspec.org/v1.1.0/item-search#free-text'] }),
    ).toBe(true);
  });

  it('treats a landing page without the class as having no free text', () => {
    expect(parseFreeTextSearch(PLAIN_ROOT_DOC)).toBe(false);
    expect(parseFreeTextSearch({ conformsTo: [] })).toBe(false);
    expect(
      parseFreeTextSearch({ conformsTo: ['https://api.stacspec.org/v1.0.0/item-search'] }),
    ).toBe(false);
  });

  it('sends q as the array of terms the class takes, and only when it conforms', () => {
    expect(itemSearchBody('sentinel-2-l2a', FILTERS, true).q).toEqual(['reflectance']);
    expect(itemSearchBody('sentinel-2-l2a', FILTERS, false).q).toBeUndefined();
  });
});
