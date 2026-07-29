import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PluginPanel } from '../../src/plugins/PluginHost';
import { pluginRegistry } from '../../src/plugins/registry';
import type { PluginContext } from '../../src/plugins/sdk';
import { useAgentLayerStore, layerStyle } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';

/**
 * A plugin's addGeoJsonLayer has to reach the renderers, which draw from the
 * agent layer store, while still listing the layer in the LayerManager.
 */

let captured: PluginContext | null = null;

pluginRegistry.set('layer-test', {
  id: 'layer-test',
  name: 'Layer test',
  version: '0.0.0',
  Panel: ({ ctx }) => {
    captured = ctx;
    return null;
  },
});

const square = (lon: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lon, 50],
            [lon + 1, 50],
            [lon + 1, 51],
            [lon, 51],
            [lon, 50],
          ],
        ],
      },
    },
  ],
});

function pluginCtx(): PluginContext {
  render(<PluginPanel pluginId="layer-test" onClose={vi.fn()} />);
  if (!captured) throw new Error('plugin panel did not render');
  return captured;
}

describe('plugin geojson layers', () => {
  beforeEach(() => {
    cleanup();
    captured = null;
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
    useAppStore.setState({ layers: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('puts the geojson in the agent layer store with the mapped style', () => {
    const ctx = pluginCtx();

    ctx.map.addGeoJsonLayer('parcels', square(10), {
      color: '#ff0000',
      opacity: 0.5,
      lineWidth: 4,
      filled: true,
      stroked: false,
    });

    const [layer] = useAgentLayerStore.getState().layers;
    expect(layer.id).toBe('parcels');
    expect(layer.name).toBe('parcels');
    expect(layer.color).toBe('#ff0000');
    expect(layer.geojson.features).toHaveLength(1);
    expect(layerStyle(layer)).toEqual({
      opacity: 0.5,
      lineWidth: 4,
      filled: true,
      stroked: false,
    });

    expect(useAppStore.getState().layers).toEqual([
      { id: 'parcels', name: 'parcels', type: 'geojson', visible: true, opacity: 0.5 },
    ]);
  });

  it('falls back to the default color and renderer styling without options', () => {
    const ctx = pluginCtx();

    ctx.map.addGeoJsonLayer('parcels', square(10));

    const [layer] = useAgentLayerStore.getState().layers;
    expect(layer.color).toBe('#3388ff');
    expect(layerStyle(layer)).toEqual({
      opacity: 0.3,
      lineWidth: 2,
      filled: true,
      stroked: true,
    });
  });

  it('wraps a bare geometry and skips anything that is not geojson', () => {
    const ctx = pluginCtx();

    ctx.map.addGeoJsonLayer('point', { type: 'Point', coordinates: [10, 50] });
    expect(useAgentLayerStore.getState().layers[0].geojson.features).toHaveLength(1);

    ctx.map.addGeoJsonLayer('junk', { nope: true });
    expect(useAgentLayerStore.getState().layers).toHaveLength(1);
    expect(useAppStore.getState().layers).toHaveLength(1);
  });

  it('replaces a layer re-added under the same id instead of duplicating it', () => {
    const ctx = pluginCtx();

    ctx.map.addGeoJsonLayer('parcels', square(10), { color: '#ff0000' });
    ctx.map.addGeoJsonLayer('parcels', square(20), { color: '#00ff00', opacity: 0.8 });

    const agentLayers = useAgentLayerStore.getState().layers;
    expect(agentLayers).toHaveLength(1);
    expect(agentLayers[0].color).toBe('#00ff00');
    expect(
      (agentLayers[0].geojson.features[0].geometry as GeoJSON.Polygon).coordinates[0][0],
    ).toEqual([20, 50]);

    const appLayers = useAppStore.getState().layers;
    expect(appLayers).toHaveLength(1);
    expect(appLayers[0].opacity).toBe(0.8);
  });

  it('removeLayer drops the layer from both stores', () => {
    const ctx = pluginCtx();

    ctx.map.addGeoJsonLayer('parcels', square(10));
    ctx.map.removeLayer('parcels');

    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
    expect(useAppStore.getState().layers).toHaveLength(0);
  });
});
