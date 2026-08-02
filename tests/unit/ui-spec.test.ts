import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderUISpec } from '../../src/viewer/uiSpec';
import { useAgentLayerStore } from '../../src/store/agentLayers';

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
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
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
