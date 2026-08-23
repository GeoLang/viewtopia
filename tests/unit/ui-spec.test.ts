import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifications } from '@mantine/notifications';
import type { CachedResponse } from '../../src/offline/db';
import { useNetworkStore } from '../../src/offline/network';
import { renderUISpec } from '../../src/viewer/uiSpec';
import { useAgentLayerStore } from '../../src/store/agentLayers';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

// jsdom has no indexedDB, so back the api cache with a map
const cachedResponses = new Map<string, CachedResponse>();
vi.mock('../../src/offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/offline/db')>()),
  apiCache: {
    get: async (url: string) => cachedResponses.get(url),
    put: async (entry: CachedResponse) => {
      cachedResponses.set(entry.url, entry);
    },
  },
}));

// No live Cesium viewer is registered in jsdom, so renderUISpec should no-op
// gracefully (it bails when getActiveCesiumViewer() is null) without throwing.
describe('renderUISpec', () => {
  it('ignores non-map specs', async () => {
    await expect(renderUISpec({ type: 'table' })).resolves.toBeUndefined();
  });

  it('handles a map spec with no active viewer without throwing', async () => {
    await expect(
      renderUISpec({
        type: 'map',
        layers: [{ name: 'London 5 km buffer', file: 'outputs/london_5km_buffer.gpkg' }],
        center: [-0.1187, 51.5019],
        zoom: 11,
      }),
    ).resolves.toBeUndefined();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(notifications.show).mockClear();
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
    useNetworkStore.setState({ online: true });
    cachedResponses.clear();
  });

  it('replays a cached layer offline without touching the network', async () => {
    useNetworkStore.setState({ online: false });
    cachedResponses.set('/agent/geojson/venice_env_risk.gpkg', {
      url: '/agent/geojson/venice_env_risk.gpkg',
      method: 'GET',
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [12.33, 45.44] } },
        ],
      }),
      cachedAt: Date.now(),
      ttl: 0,
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Flood risk', file: 'outputs/venice_env_risk.gpkg' }],
    });

    expect(fetch).not.toHaveBeenCalled();
    const [layer] = useAgentLayerStore.getState().layers;
    expect(layer.name).toBe('Flood risk');
    expect(layer.geojson.features).toHaveLength(1);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('says sign-in is needed when replay gets 401s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('unauthorized', { status: 401 }))),
    );

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Flood risk', file: 'outputs/venice_env_risk.gpkg' }],
    });

    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required' }),
    );
  });

  it('names the workspace when replay gets 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('File not found', { status: 404 }))),
    );

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Flood risk', file: 'outputs/venice_env_risk.gpkg' }],
    });

    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
    const [notice] = vi.mocked(notifications.show).mock.calls[0];
    expect(notice.title).toBe('Layers are not in this workspace');
    expect(notice.message).toContain('belong to the account that ran them');
  });

  it('keeps the source path on the layer it puts in the store', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [12.33, 45.44] } },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Flood risk', file: 'outputs/venice_env_risk.gpkg' }],
    });

    const [layer] = useAgentLayerStore.getState().layers;
    // the endpoint takes the basename, the layer keeps the relative path so the
    // layer panel can offer a download
    expect(fetch).toHaveBeenCalledWith('/agent/geojson/venice_env_risk.gpkg', {
      headers: expect.anything(),
    });
    expect(layer.path).toBe('outputs/venice_env_risk.gpkg');
    expect(layer.name).toBe('Flood risk');
  });
});

describe('a ui_spec layer that names a column to shade by', () => {
  const cell = (gap_score: number, lon: number): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { gap_score, cell_id: `c${lon}` },
    geometry: {
      type: 'Polygon',
      coordinates: [[[lon, 45], [lon + 1, 45], [lon + 1, 46], [lon, 46], [lon, 45]]],
    },
  });

  const serveCells = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              type: 'FeatureCollection',
              features: [cell(0, 10), cell(1, 11), cell(2, 12)],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
  });

  it('shades the layer by that column without the user picking it', async () => {
    serveCells();

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Service gaps', file: 'outputs/gaps.gpkg', shade_by: 'gap_score' }],
    });

    const [layer] = useAgentLayerStore.getState().layers;
    expect(layer.symbology).toMatchObject({ kind: 'graduated', field: 'gap_score' });
    const fills = layer.geojson.features.map((f) => f.properties?.fill);
    expect(new Set(fills).size).toBe(3);
  });

  it('leaves the layer unshaded when the file has no such column', async () => {
    serveCells();

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Service gaps', file: 'outputs/gaps.gpkg', shade_by: 'overall_risk' }],
    });

    const [layer] = useAgentLayerStore.getState().layers;
    expect(layer.symbology).toBeUndefined();
    expect(layer.geojson.features).toHaveLength(3);
    expect(layer.geojson.features[0].properties?.fill).toBeUndefined();
  });

  it('lets the user drop the suggestion again', async () => {
    serveCells();

    await renderUISpec({
      type: 'map',
      layers: [{ name: 'Service gaps', file: 'outputs/gaps.gpkg', shade_by: 'gap_score' }],
    });

    const [shaded] = useAgentLayerStore.getState().layers;
    useAgentLayerStore.getState().setSymbology(shaded.id, null);

    const [plain] = useAgentLayerStore.getState().layers;
    expect(plain.symbology).toBeUndefined();
    expect(plain.geojson.features.map((f) => f.properties?.fill)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('agentLayersBounds', () => {
  it('pads a single-point layer to a visible extent instead of max zoom', async () => {
    const { agentLayersBounds } = await import('../../src/hooks/agentLayerBounds');
    const bounds = agentLayersBounds([
      {
        id: 'p',
        name: 'point',
        color: '#3388ff',
        geojson: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [2.32, 48.86] } },
          ],
        },
      },
    ]);
    expect(bounds).not.toBeNull();
    const [w, s, e, n] = bounds!;
    expect(e - w).toBeCloseTo(0.01, 5);
    expect(n - s).toBeCloseTo(0.01, 5);
    expect((w + e) / 2).toBeCloseTo(2.32);
    expect((s + n) / 2).toBeCloseTo(48.86);
  });
});
