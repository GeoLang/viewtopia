import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// the WebGL bundle stays out, so the view bbox comes from the shared camera
vi.mock('cesium', () => ({ Math: { toDegrees: (radians: number) => radians } }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

// duckdb is mocked at its own boundary, the actions and the stores are real
const { queryMock, queryAsGeoJsonMock, attachCsvMock, attachParquetMock, importVectorMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    queryAsGeoJsonMock: vi.fn(),
    attachCsvMock: vi.fn(),
    attachParquetMock: vi.fn(),
    importVectorMock: vi.fn(),
  }));
vi.mock('../../src/duckdb', () => ({
  query: queryMock,
  queryAsGeoJson: queryAsGeoJsonMock,
  NoGeometryError: class extends Error {},
}));
vi.mock('../../src/duckdb/loaders', () => ({
  attachCsvUrl: attachCsvMock,
  attachParquetUrl: attachParquetMock,
}));
vi.mock('../../src/duckdb/importVector', () => ({ importVectorFiles: importVectorMock }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import type { Cesium3DTileset, Viewer } from 'cesium';
import '../../src/actions/data';
import { runViewerAction } from '../../src/actions/dispatch';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useChatStore } from '../../src/store/chat';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { useStacStore } from '../../src/features/stac/store';
import { getActiveCesiumViewer } from '../../src/viewer/registry';

const POINTS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [7.5, 46.5] }, properties: { id: 1 } },
  ],
};

const CATALOG = 'https://example.org/stac/v1';
const COLLECTIONS = `${CATALOG}/collections`;
const ITEMS = `${COLLECTIONS}/sentinel-2-l2a/items`;
const SEARCH = `${CATALOG}/search`;

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
      links: [{ rel: 'items', href: ITEMS }],
    },
    { id: 'landsat-c2-l2', title: 'Landsat Collection 2', links: [] },
  ],
};

const ITEM_DOC = {
  id: 'S2A_TILE_20240601',
  geometry: null,
  properties: { datetime: '2024-06-01T10:20:30Z' },
  assets: {
    visual: { href: `${CATALOG}/data/visual.tif`, type: 'image/tiff' },
    outline: { href: `${CATALOG}/data/outline.geojson`, type: 'application/geo+json' },
    metadata: { href: `${CATALOG}/data/metadata.xml`, type: 'application/xml' },
  },
};

const ITEMS_DOC = { type: 'FeatureCollection', features: [ITEM_DOC], links: [] };

const WFS_URL = 'https://example.org/geoserver/wfs';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Every URL the STAC and service actions reach for, plus the imported file. */
function serve(url: string): Response {
  if (url === CATALOG) return jsonResponse(ROOT_DOC);
  if (url === COLLECTIONS) return jsonResponse(COLLECTIONS_DOC);
  if (url.startsWith(ITEMS) || url.startsWith(SEARCH)) return jsonResponse(ITEMS_DOC);
  if (url.endsWith('outline.geojson')) return jsonResponse(POINTS);
  if (url.startsWith(WFS_URL)) return jsonResponse(POINTS);
  if (url.endsWith('roads.geojson')) return jsonResponse(POINTS);
  if (url.endsWith('download?id=7')) return jsonResponse(POINTS);
  return jsonResponse({ message: 'not here' }, 404);
}

let fetchMock: ReturnType<typeof vi.fn>;

/** The URLs the action asked for, in order. */
const requested = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));

const layerNames = (): string[] => useAgentLayerStore.getState().layers.map((layer) => layer.name);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fetchMock = vi.fn(async (url: string) => serve(String(url)));
  vi.stubGlobal('fetch', fetchMock);
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  useOgcLayerStore.setState({ layers: [] });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  useStacStore.setState({ favorites: [], rasterAnalysisUrl: '' });
  useChatStore.setState({ sessions: [], activeSessionId: null, followUp: null, followUpCount: 0 });
});

describe('data.import_url', () => {
  it('fetches the file and draws it as a layer', async () => {
    const result = await runAction('data.import_url', {
      url: 'https://example.org/data/roads.geojson',
    });

    expect(requested()).toEqual(['https://example.org/data/roads.geojson']);
    expect(layerNames()).toEqual(['roads.geojson']);
    expect(useAgentLayerStore.getState().layers[0].geojson.features).toHaveLength(1);
    expect(result.text).toBe('roads.geojson: 1 features');
  });

  it('names the file from the given name and format when the URL carries neither', async () => {
    await runAction('data.import_url', {
      url: 'https://example.org/data/download?id=7',
      name: 'roads',
      format: '.geojson',
    });

    expect(layerNames()).toEqual(['roads.geojson']);
  });

  it('refuses a format the importer does not read', async () => {
    await expect(
      runAction('data.import_url', { url: 'https://example.org/x.geojson', format: '.docx' }),
    ).rejects.toThrow('format must be one of');
  });

  it('reports a URL that will not answer, and draws nothing', async () => {
    await expect(
      runAction('data.import_url', { url: 'https://example.org/missing.geojson' }),
    ).rejects.toThrow('answered HTTP 404');
    expect(layerNames()).toEqual([]);
  });
});

describe('data.add_service', () => {
  it('adds a tile service without asking it anything', async () => {
    const result = await runAction('data.add_service', {
      type: 'wms',
      url: 'https://example.org/wms',
      name: 'Imagery',
    });

    const layers = useOgcLayerStore.getState().layers;
    expect(layers.map((layer) => [layer.name, layer.type])).toEqual([['Imagery', 'wms']]);
    expect(result.text).toBe('Added Imagery');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads a WFS service into the layers and counts its features', async () => {
    const result = await runAction('data.add_service', {
      type: 'wfs',
      url: WFS_URL,
      name: 'Parcels',
    });

    expect(requested()[0]).toContain('request=GetFeature');
    expect(layerNames()).toEqual(['Parcels']);
    expect(result.text).toBe('Parcels: 1 features');
  });

  it('takes a WFS service back off when the request fails', async () => {
    await expect(
      runAction('data.add_service', {
        type: 'wfs',
        url: 'https://example.org/absent',
        name: 'Nothing',
      }),
    ).rejects.toThrow('WFS returned 404');

    expect(useOgcLayerStore.getState().layers).toEqual([]);
    expect(layerNames()).toEqual([]);
  });

  it('refuses a service kind nobody can add by URL', async () => {
    await expect(
      runAction('data.add_service', { type: 'tileset', url: WFS_URL, name: 'Built' }),
    ).rejects.toThrow('type must be one of');
  });
});

describe('data.add_tileset', () => {
  const TILESET_URL = 'https://example.org/tiles/quarry/tileset.json';
  const DRAWN = { root: 'loaded' } as unknown as Cesium3DTileset;
  /** past the wait in loadedTileset, which is what a tileset that never loads costs */
  const PAST_THE_LOAD_WAIT_MS = 61_000;

  function fakeGlobe() {
    return {
      flownTo: [] as unknown[],
      async flyTo(tileset: unknown) {
        this.flownTo.push(tileset);
      },
    };
  }

  function onTheGlobe(): ReturnType<typeof fakeGlobe> {
    const globe = fakeGlobe();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(globe as unknown as Viewer);
    return globe;
  }

  afterEach(() => {
    vi.mocked(getActiveCesiumViewer).mockReturnValue(null);
  });

  it('puts the tileset in the layers and flies the camera to it', async () => {
    const globe = onTheGlobe();

    const running = runAction('data.add_tileset', { url: TILESET_URL, name: 'Quarry' });
    const layer = useTiles3dLayerStore.getState().layers[0];
    useTiles3dLayerStore.getState().setLoaded(layer.id, DRAWN);
    const result = await running;

    expect([layer.name, layer.url, layer.visible]).toEqual(['Quarry', TILESET_URL, true]);
    expect(globe.flownTo).toEqual([DRAWN]);
    expect(result.text).toBe('Quarry is on the globe and the camera is looking at it.');
  });

  it('names the layer Tileset when the call does not name it', async () => {
    onTheGlobe();

    const running = runAction('data.add_tileset', { url: TILESET_URL });
    const layer = useTiles3dLayerStore.getState().layers[0];
    useTiles3dLayerStore.getState().setLoaded(layer.id, DRAWN);

    expect((await running).text).toContain('Tileset is on the globe');
    expect(layer.name).toBe('Tileset');
  });

  it('leaves the layer row behind and says so when the tiles never load', async () => {
    onTheGlobe();
    vi.useFakeTimers();

    const running = runAction('data.add_tileset', { url: TILESET_URL, name: 'Quarry' });
    const refused = expect(running).rejects.toThrow('Quarry did not load, see its layer row');
    await vi.advanceTimersByTimeAsync(PAST_THE_LOAD_WAIT_MS);
    await refused;

    expect(useTiles3dLayerStore.getState().layers.map((layer) => layer.name)).toEqual(['Quarry']);
    vi.useRealTimers();
  });

  it('refuses to add a tileset when no globe is on screen', async () => {
    await expect(runAction('data.add_tileset', { url: TILESET_URL })).rejects.toThrow(
      'there is no Cesium globe on screen',
    );
    expect(useTiles3dLayerStore.getState().layers).toEqual([]);
  });

  it('refuses a call with no URL', async () => {
    onTheGlobe();
    await expect(runAction('data.add_tileset', { name: 'Quarry' })).rejects.toThrow('url is required');
    expect(useTiles3dLayerStore.getState().layers).toEqual([]);
  });
});

describe('data.export', () => {
  it('writes the named layer out as a download', async () => {
    useAgentLayerStore.setState({
      layers: [{ id: 'layer-1', name: 'Roads', geojson: POINTS }],
    });
    URL.createObjectURL = vi.fn().mockReturnValue('blob:export');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await runAction('data.export', { layer: 'Roads', format: 'geojson' });

    expect(click).toHaveBeenCalled();
    expect(result.text).toMatch(/^Downloaded Roads as roads\.geojson, \d+ bytes\.$/);
    click.mockRestore();
  });

  it('names the layers when none of them matches', async () => {
    useAgentLayerStore.setState({ layers: [{ id: 'layer-1', name: 'Roads', geojson: POINTS }] });

    await expect(runAction('data.export', { layer: 'Rivers' })).rejects.toThrow(
      'no layer matches "Rivers". Known layers: Roads',
    );
  });
});

describe('stac.search', () => {
  it('lists the items and what each asset can become', async () => {
    const result = await runAction('stac.search', {
      catalog: CATALOG,
      collection: 'sentinel-2-l2a',
      bbox: '7,46,8,47',
      limit: 5,
    });

    expect(requested()).toEqual([CATALOG, COLLECTIONS, `${ITEMS}?limit=5&bbox=7%2C46%2C8%2C47`]);
    expect(result.text).toBe(
      '1 items in Sentinel-2 L2A.\nS2A_TILE_20240601, 2024-06-01, visual (raster), outline (geojson)',
    );
  });

  it('searches the current view when no box is given', async () => {
    await runAction('stac.search', { catalog: CATALOG, collection: 'Sentinel' });

    expect(requested()[2]).toMatch(/limit=20&bbox=-?\d/);
  });

  it('refuses a bbox that is not four numbers', async () => {
    await expect(
      runAction('stac.search', { catalog: CATALOG, collection: 'Sentinel', bbox: '7,46' }),
    ).rejects.toThrow(ActionError);
  });

  it('names the collections when none of them matches', async () => {
    await expect(
      runAction('stac.search', { catalog: CATALOG, collection: 'modis' }),
    ).rejects.toThrow('no collection matches "modis"');
  });
});

describe('stac.add_asset', () => {
  it('adds a geojson asset as a layer', async () => {
    const result = await runAction('stac.add_asset', {
      catalog: CATALOG,
      item: 'S2A_TILE_20240601',
      asset: 'outline',
    });

    expect(layerNames()).toEqual(['S2A_TILE_20240601 outline']);
    expect(result.text).toBe('S2A_TILE_20240601 outline: 1 features');
  });

  it('hands a raster asset to the raster analysis panel', async () => {
    const result = await runAction('stac.add_asset', {
      catalog: CATALOG,
      item: 'S2A_TILE_20240601',
      asset: 'visual',
    });

    expect(useStacStore.getState().rasterAnalysisUrl).toBe(`${CATALOG}/data/visual.tif`);
    expect(result.text).toContain('raster analysis');
  });

  it('refuses an asset the viewer cannot draw', async () => {
    await expect(
      runAction('stac.add_asset', {
        catalog: CATALOG,
        item: 'S2A_TILE_20240601',
        asset: 'metadata',
      }),
    ).rejects.toThrow('cannot draw this asset');
  });

  it('lists the keys when the item carries no such asset', async () => {
    await expect(
      runAction('stac.add_asset', { catalog: CATALOG, item: 'S2A_TILE_20240601', asset: 'nir' }),
    ).rejects.toThrow('It carries: visual, outline, metadata');
  });
});

describe('sql.query', () => {
  it('reports the rows as a table', async () => {
    queryMock.mockResolvedValue({
      rows: [
        { city: 'Lisbon', people: 545000 },
        { city: 'Porto', people: null },
      ],
      columns: ['city', 'people'],
      rowCount: 2,
      table: null,
    });

    const result = await runAction('sql.query', { sql: 'SELECT * FROM cities' });

    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM cities');
    expect(result.text).toBe('2 rows.\ncity | people\nLisbon | 545000\nPorto | ');
  });

  it('caps a long result and says how many rows there were', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ id: index }));
    queryMock.mockResolvedValue({ rows, columns: ['id'], rowCount: rows.length, table: null });

    const result = await runAction('sql.query', { sql: 'SELECT * FROM big' });

    expect(result.text.split('\n')).toHaveLength(52);
    expect(result.text).toContain('120 rows, the first 50.');
  });

  it('says so when the query answers nothing', async () => {
    queryMock.mockResolvedValue({ rows: [], columns: ['id'], rowCount: 0, table: null });

    await expect(runAction('sql.query', { sql: 'SELECT 1 WHERE false' })).resolves.toEqual({
      text: 'The query returned no rows.',
    });
  });
});

describe('sql.to_layer', () => {
  it('draws the query result under the name it was given', async () => {
    queryAsGeoJsonMock.mockResolvedValue(POINTS);

    const result = await runAction('sql.to_layer', {
      sql: 'SELECT geom FROM places',
      name: 'Places',
    });

    expect(queryAsGeoJsonMock).toHaveBeenCalledWith('SELECT geom FROM places');
    expect(layerNames()).toEqual(['Places']);
    expect(result.text).toBe('Places is on the map, 1 features.');
  });

  it('falls back to the query itself as the layer name', async () => {
    queryAsGeoJsonMock.mockResolvedValue(POINTS);

    await runAction('sql.to_layer', { sql: 'SELECT geom FROM places' });

    expect(layerNames()).toEqual(['SELECT geom FROM places']);
  });
});

describe('sql.attach_url', () => {
  it('attaches a parquet URL under a name read from the file', async () => {
    const url = 'https://example.com/data/trip data.parquet?token=abc';

    const result = await runAction('sql.attach_url', { url });

    expect(attachParquetMock).toHaveBeenCalledWith('trip_data', url);
    expect(result.text).toBe('Attached, query it as trip_data.');
  });

  it('takes the format and the name from the arguments', async () => {
    await runAction('sql.attach_url', {
      url: 'https://example.com/export',
      name: 'Trips 2026',
      format: 'csv',
    });

    expect(attachCsvMock).toHaveBeenCalledWith('trips_2026', 'https://example.com/export');
  });

  it('refuses a URL that names neither format', async () => {
    await expect(
      runAction('sql.attach_url', { url: 'https://example.com/data.json' }),
    ).rejects.toThrow('.parquet or .csv');
    expect(attachCsvMock).not.toHaveBeenCalled();
    expect(attachParquetMock).not.toHaveBeenCalled();
  });
});

describe('the chat running these actions', () => {
  const notices = (): string[] =>
    useChatStore
      .getState()
      .activeMessages()
      .map((message) => message.content);

  it('posts what an import did', async () => {
    await runViewerAction({
      name: 'data.import_url',
      args: { url: 'https://example.org/data/roads.geojson' },
    });

    expect(layerNames()).toEqual(['roads.geojson']);
    expect(notices()).toEqual(['roads.geojson: 1 features']);
  });

  it('sends a query result back to the model as the next turn', async () => {
    queryMock.mockResolvedValue({
      rows: [{ city: 'Lisbon' }],
      columns: ['city'],
      rowCount: 1,
      table: null,
    });

    await runViewerAction({ name: 'sql.query', args: { sql: 'SELECT city FROM cities' } });

    expect(useChatStore.getState().followUp).toBe(
      'Result of sql.query: 1 rows.\ncity\nLisbon',
    );
  });
});
