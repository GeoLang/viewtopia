import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useOgcLayerStore,
  wmsLayerNames,
  wfsTypeNames,
  wfsFeatureUrl,
  wfsAgentLayerId,
  wmtsTileTemplate,
  loadWfsLayer,
  rasterTileTemplate,
} from '../../src/store/ogcLayers';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { parseImport } from '../../src/lib/importGeoJson';
import { gridSummary, collectPoints } from '../../src/lib/pointData';
import { exportPixelSize } from '../../src/features/printLayout/imageExport';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';

/**
 * Logic the panel defect fixes moved into stores and libs: OGC layer sourcing,
 * file imports, the spatial-stats grid reduction, the export size and the
 * space-time import summary.
 */

describe('ogc layer store', () => {
  beforeEach(() => {
    useOgcLayerStore.setState({ layers: [] });
  });

  it('adds and removes layers, handing back what it added', () => {
    const { addLayer } = useOgcLayerStore.getState();
    const wms = addLayer('osm wms', 'https://ows.example.org/service', 'wms');
    addLayer('tiles', 'https://tiles.example.org/{z}/{x}/{y}.png', 'xyz');

    const { layers, removeLayer } = useOgcLayerStore.getState();
    expect(layers.map((l) => l.name)).toEqual(['osm wms', 'tiles']);
    expect(layers[0]).toEqual(wms);
    expect(wms.type).toBe('wms');

    removeLayer(wms.id);
    expect(useOgcLayerStore.getState().layers.map((l) => l.name)).toEqual(['tiles']);
  });
});

describe('wmsLayerNames', () => {
  const layer = (url: string, name = 'my layer') => ({ id: 'a', name, url, type: 'wms' as const });

  it('takes the layers the url already asks for, whatever its case', () => {
    expect(wmsLayerNames(layer('https://x/service?LAYERS=OSM-WMS'))).toBe('OSM-WMS');
    expect(wmsLayerNames(layer('https://x/service?layers=roads,rail'))).toBe('roads,rail');
  });

  it('falls back to the layer name for a bare service url', () => {
    expect(wmsLayerNames(layer('https://x/service', 'topo'))).toBe('topo');
  });
});

describe('rasterTileTemplate', () => {
  it('passes an xyz template through', () => {
    const url = 'https://tiles.example.org/{z}/{x}/{y}.png';
    expect(rasterTileTemplate({ id: 'a', name: 'x', url, type: 'xyz' })).toBe(url);
  });

  it('resolves a root-relative url against the origin', () => {
    const template = rasterTileTemplate({
      id: 'a',
      name: 'x',
      url: '/tiles/{z}/{x}/{y}.png',
      type: 'xyz',
    });
    expect(template).toBe(`${window.location.origin}/tiles/{z}/{x}/{y}.png`);
  });

  it('builds a GetMap template that keeps the url extras and the bbox placeholder', () => {
    const template = rasterTileTemplate({
      id: 'a',
      name: 'topo',
      url: 'https://x/service?map=/data/topo.map&LAYERS=relief',
      type: 'wms',
    });
    // the braces must stay literal for MapLibre to substitute them
    expect(template.endsWith('&bbox={bbox-epsg-3857}')).toBe(true);
    const params = new URLSearchParams(template.split('?')[1].replace('&bbox={bbox-epsg-3857}', ''));
    expect(params.get('map')).toBe('/data/topo.map');
    expect(params.get('request')).toBe('GetMap');
    expect(params.get('layers')).toBe('relief');
    expect(params.get('srs')).toBe('EPSG:3857');
    // the url's own LAYERS is replaced, not duplicated
    expect(params.getAll('layers')).toHaveLength(1);
    expect(template).not.toContain('LAYERS');
  });
});

describe('wmtsTileTemplate', () => {
  const wmts = (url: string, name = 'demo_parcels') => ({
    id: 'a',
    name,
    url,
    type: 'wmts' as const,
  });

  it('rewrites the RESTful placeholders into the xyz form', () => {
    // TileRow is the y axis and TileCol the x axis, so the order is z/y/x
    expect(
      wmtsTileTemplate(
        wmts('https://ogc.example.org/wmts/demo/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png'),
      ),
    ).toBe('https://ogc.example.org/wmts/demo/WebMercatorQuad/{z}/{y}/{x}.png');
  });

  it('takes the matrix set from the url when it names one', () => {
    expect(
      wmtsTileTemplate(
        wmts('https://x/wmts/demo/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png?tileMatrixSet=GoogleMapsCompatible'),
      ),
    ).toContain('/GoogleMapsCompatible/{z}/{y}/{x}.png');
  });

  it('leaves a template that is already concrete alone, whatever the case', () => {
    expect(wmtsTileTemplate(wmts('https://x/wmts/demo/WebMercatorQuad/{z}/{y}/{x}.png'))).toBe(
      'https://x/wmts/demo/WebMercatorQuad/{z}/{y}/{x}.png',
    );
    expect(
      wmtsTileTemplate(wmts('https://x/{tilematrixset}/{tilematrix}/{tilerow}/{tilecol}')),
    ).toBe('https://x/WebMercatorQuad/{z}/{y}/{x}');
  });

  it('resolves a root-relative template against the origin', () => {
    expect(wmtsTileTemplate(wmts('/wmts/demo/{TileMatrix}/{TileRow}/{TileCol}.png'))).toBe(
      `${window.location.origin}/wmts/demo/{z}/{y}/{x}.png`,
    );
  });

  it('is the template rasterTileTemplate hands the renderers', () => {
    const layer = wmts('https://x/wmts/demo/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png');
    expect(rasterTileTemplate(layer)).toBe(wmtsTileTemplate(layer));
  });
});

describe('wfs requests', () => {
  const wfs = (url: string, name = 'demo_parcels') => ({
    id: 'a',
    name,
    url,
    type: 'wfs' as const,
  });

  it('takes the feature types from the url, else the layer name', () => {
    expect(wfsTypeNames(wfs('https://x/wfs?typeNames=roads'))).toBe('roads');
    expect(wfsTypeNames(wfs('https://x/wfs?TYPENAME=rail'))).toBe('rail');
    expect(wfsTypeNames(wfs('https://x/wfs'))).toBe('demo_parcels');
  });

  it('builds a GetFeature url asking for GeoJSON and keeps the url extras', () => {
    const url = new URL(wfsFeatureUrl(wfs('https://x/wfs?srsName=EPSG:4326&count=5')));
    expect(url.pathname).toBe('/wfs');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      srsName: 'EPSG:4326',
      count: '5',
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typenames: 'demo_parcels',
      outputformat: 'application/json',
    });
  });
});

describe('loadWfsLayer', () => {
  const layer = { id: 'wfs-1', name: 'demo_parcels', url: 'https://x/wfs', type: 'wfs' as const };
  const fetchMock = vi.fn();

  beforeEach(() => {
    useAgentLayerStore.setState({ layers: [], markers: [] });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the returned features into the agent layers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 4] }, properties: {} },
        ],
      }),
    });

    expect(await loadWfsLayer(layer)).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe(wfsFeatureUrl(layer));
    const added = useAgentLayerStore.getState().layers;
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe(wfsAgentLayerId(layer));
    expect(added[0].name).toBe('demo_parcels');
    expect(added[0].geojson.features).toHaveLength(2);
  });

  it('throws the status when the service refuses, adding nothing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(loadWfsLayer(layer)).rejects.toThrow('WFS returned 502');
    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
  });

  it('throws when the service answers with nothing to draw', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
    await expect(loadWfsLayer(layer)).rejects.toThrow('no features');
    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
  });

  it('is taken off the agent layers again when the ogc entry is removed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
        ],
      }),
    });
    useOgcLayerStore.setState({ layers: [] });
    const added = useOgcLayerStore.getState().addLayer('demo_parcels', 'https://x/wfs', 'wfs');
    await loadWfsLayer(added);
    expect(useAgentLayerStore.getState().layers).toHaveLength(1);

    useOgcLayerStore.getState().removeLayer(added.id);
    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
    expect(useOgcLayerStore.getState().layers).toHaveLength(0);
  });
});

describe('parseImport', () => {
  it('parses GeoJSON and wraps a bare feature', () => {
    const fc = parseImport(
      'a.geojson',
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
        ],
      }),
    );
    expect(fc.features).toHaveLength(1);

    const wrapped = parseImport(
      'a.json',
      JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }),
    );
    expect(wrapped.type).toBe('FeatureCollection');
    expect(wrapped.features).toHaveLength(1);
  });

  it('parses GPX and KML into geometry', () => {
    const gpx = parseImport(
      'walk.gpx',
      `<?xml version="1.0"?><gpx><trk><trkseg>
       <trkpt lat="51.5" lon="-0.1"></trkpt><trkpt lat="51.6" lon="-0.2"></trkpt>
       </trkseg></trk></gpx>`,
    );
    expect(gpx.features[0].geometry.type).toBe('LineString');

    const kml = parseImport(
      'area.kml',
      `<?xml version="1.0"?><kml><Document><Placemark><Point>
       <coordinates>-0.1,51.5</coordinates></Point></Placemark></Document></kml>`,
    );
    expect(kml.features[0].geometry).toEqual({ type: 'Point', coordinates: [-0.1, 51.5] });
  });

  it('parses CSV rows into points that keep their other columns', () => {
    const fc = parseImport('cities.csv', 'name,lat,lon\nLondon,51.5,-0.1\nParis,48.85,2.35');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [-0.1, 51.5] });
    expect(fc.features[0].properties).toEqual({ name: 'London' });
  });

  it('throws a reason the panel can show', () => {
    expect(() => parseImport('a.geojson', '{oops')).toThrow(/not valid JSON/);
    expect(() => parseImport('a.geojson', '{"type":"Nonsense"}')).toThrow(/not GeoJSON/);
    expect(() => parseImport('a.csv', 'name,value\nLondon,3')).toThrow(/latitude/);
    expect(() =>
      parseImport('a.geojson', '{"type":"FeatureCollection","features":[]}'),
    ).toThrow(/no features/);
    expect(() => parseImport('a.shp', 'x')).toThrow(/unsupported format/);
  });
});

describe('gridSummary', () => {
  // two cells, three points in one and two in the other
  const points = collectPoints({
    type: 'FeatureCollection',
    features: [
      ...[3, 5, 13].map((value) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-0.1, 51.5] },
        properties: { value },
      })),
      ...[7, 11].map((value) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [10, 45] },
        properties: { value },
      })),
    ],
  });

  it('counts per cell when the method is count', () => {
    expect(gridSummary(points, 500, 'count', null)).toEqual({
      total: 5,
      cells: 2,
      min: 2,
      max: 3,
    });
  });

  it('sums and averages the chosen property, so the methods disagree', () => {
    const count = gridSummary(points, 500, 'count', 'value');
    const sum = gridSummary(points, 500, 'sum', 'value');
    const mean = gridSummary(points, 500, 'mean', 'value');

    expect(sum).toEqual({ total: 5, cells: 2, min: 18, max: 21 });
    expect(mean.min).toBeCloseTo(7, 5);
    expect(mean.max).toBeCloseTo(9, 5);
    expect(count.min).toBe(2);
    expect(sum).not.toEqual(count);
    expect(mean).not.toEqual(count);
    expect(mean).not.toEqual(sum);
  });

  it('weighs a missing or non-numeric property as zero', () => {
    expect(gridSummary(points, 500, 'sum', 'missing')).toEqual({
      total: 5,
      cells: 2,
      min: 0,
      max: 0,
    });
  });

  it('reports nothing for no points', () => {
    expect(gridSummary([], 500, 'mean', 'value')).toEqual({ total: 0, cells: 0, min: 0, max: 0 });
  });
});

describe('exportPixelSize', () => {
  it('is the requested size at the CSS reference of 96 dpi', () => {
    expect(exportPixelSize(640, 480, 96)).toEqual({ width: 640, height: 480 });
  });

  it('scales the output by the requested dpi', () => {
    expect(exportPixelSize(640, 480, 300)).toEqual({ width: 2000, height: 1500 });
    expect(exportPixelSize(1920, 1080, 150)).toEqual({ width: 3000, height: 1688 });
  });

  it('clamps to an encodable size without changing the aspect ratio', () => {
    const size = exportPixelSize(8000, 4000, 600);
    expect(size.width).toBe(8192);
    expect(size.width / size.height).toBeCloseTo(2, 2);
  });
});

describe('space-time import status', () => {
  it('persists until the next import or a panel close', () => {
    const store = useSpaceTimeStore.getState();
    store.setImportStatus('Imported 3 entities, 15 positions');
    expect(useSpaceTimeStore.getState().importStatus).toBe('Imported 3 entities, 15 positions');

    store.setImportStatus('Imported 1 entities, 2 positions');
    expect(useSpaceTimeStore.getState().importStatus).toBe('Imported 1 entities, 2 positions');

    useSpaceTimeStore.getState().closePanel();
    expect(useSpaceTimeStore.getState().importStatus).toBeNull();
  });

  it('clears on the toggle that closes the panel, not the one that opens it', () => {
    useSpaceTimeStore.setState({ panelOpen: false, importStatus: null });
    const { togglePanel, setImportStatus } = useSpaceTimeStore.getState();

    togglePanel();
    setImportStatus('Imported 2 entities, 4 positions');
    expect(useSpaceTimeStore.getState().panelOpen).toBe(true);
    expect(useSpaceTimeStore.getState().importStatus).toBe('Imported 2 entities, 4 positions');

    togglePanel();
    expect(useSpaceTimeStore.getState().panelOpen).toBe(false);
    expect(useSpaceTimeStore.getState().importStatus).toBeNull();
  });
});
