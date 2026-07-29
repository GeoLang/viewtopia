import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LayerManager } from '../../src/components/layers/LayerManager';
import { layerStyle, useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';

/**
 * The agent's layers live in the store the renderers draw from, so the panel has
 * to list them from there and act on that same store.
 */

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

const point = (lon: number, lat: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } }],
});

const layer = (id: string, path?: string): AgentLayer => ({
  id,
  name: id,
  color: '#3388ff',
  geojson: point(12.33, 45.44),
  path,
});

const renderPanel = () =>
  render(
    <MantineProvider>
      <LayerManager
        layers={[]}
        onToggle={vi.fn()}
        onOpacity={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onClose={vi.fn()}
      />
    </MantineProvider>,
  );

describe('LayerManager agent layers', () => {
  beforeEach(() => {
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
  });

  afterEach(cleanup);

  it('lists a layer the agent drew and offers it as a download', () => {
    useAgentLayerStore.getState().setLayers([layer('0-venice_env_risk.gpkg', 'outputs/venice_env_risk.gpkg')]);

    renderPanel();

    expect(screen.getByText('Layers (1)')).toBeInTheDocument();
    // the download hides behind the row, like the remove button
    expect(screen.queryByTestId('agent-layer-download')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-layer-row'));

    const download = screen.getByTestId('agent-layer-download');
    // /download/{filename} takes the basename only, via outputDownloadUrl
    expect(download).toHaveAttribute('href', '/agent/download/venice_env_risk.gpkg');
    expect(download).toHaveAttribute('download');
  });

  it('offers no download for a layer with no file behind it', () => {
    useAgentLayerStore.getState().setLayers([layer('drawn')]);

    renderPanel();
    fireEvent.click(screen.getByTestId('agent-layer-row'));

    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-layer-download')).not.toBeInTheDocument();
  });

  it('removing takes the layer out of the store the renderers draw', () => {
    useAgentLayerStore.getState().setLayers([layer('a', 'outputs/a.gpkg'), layer('b')]);

    renderPanel();
    fireEvent.click(screen.getAllByTestId('agent-layer-row')[0]);
    fireEvent.click(screen.getByText('Remove'));

    expect(useAgentLayerStore.getState().layers.map((l) => l.id)).toEqual(['b']);
    expect(screen.getAllByTestId('agent-layer-row')).toHaveLength(1);
  });

  it('the opacity control reaches the style every renderer reads', () => {
    useAgentLayerStore.getState().setLayers([layer('a', 'outputs/a.gpkg')]);
    const before = useAgentLayerStore.getState().generation;

    useAgentLayerStore.getState().setLayerOpacity('a', 0.8);

    const [updated] = useAgentLayerStore.getState().layers;
    expect(layerStyle(updated).opacity).toBe(0.8);
    // restyling must not reframe the view
    expect(useAgentLayerStore.getState().generation).toBe(before);
  });

  it('a plugin layer keeps its own row instead of appearing twice', () => {
    // the plugin host registers the same id in both stores
    useAgentLayerStore.getState().setLayers([layer('plugin-1')]);

    render(
      <MantineProvider>
        <LayerManager
          layers={[{ id: 'plugin-1', name: 'plugin-1', type: 'geojson', visible: true, opacity: 1 }]}
          onToggle={vi.fn()}
          onOpacity={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
          onClose={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getByText('Layers (1)')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-layer-row')).not.toBeInTheDocument();
  });
});
