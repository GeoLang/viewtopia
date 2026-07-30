import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
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

/** A layer whose features carry a score worth shading by. */
const scored = (values: number[]): AgentLayer => ({
  id: 'risk',
  name: 'Flood risk',
  color: '#3388ff',
  geojson: {
    type: 'FeatureCollection',
    features: values.map((risk) => ({
      type: 'Feature',
      properties: { risk },
      geometry: { type: 'Point', coordinates: [12.33, 45.44] },
    })),
  },
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

  it('lists a layer the agent drew and offers it as a download without expanding', () => {
    useAgentLayerStore.getState().setLayers([layer('0-venice_env_risk.gpkg', 'outputs/venice_env_risk.gpkg')]);

    renderPanel();

    expect(screen.getByText('Layers (1)')).toBeInTheDocument();
    // a control nobody can see is a control nobody uses, so this one is on the
    // collapsed header rather than behind the expand
    const download = screen.getByTestId('agent-layer-download');
    // /download/{filename} takes the basename only, via outputDownloadUrl
    expect(download).toHaveAttribute('href', '/agent/download/venice_env_risk.gpkg');
    expect(download).toHaveAttribute('download');
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('downloading does not toggle the row', () => {
    useAgentLayerStore.getState().setLayers([layer('a', 'outputs/a.gpkg')]);

    renderPanel();
    fireEvent.click(screen.getByTestId('agent-layer-download'));

    expect(screen.getByTestId('agent-layer-chevron')).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('the chevron shows whether the row is open', () => {
    useAgentLayerStore.getState().setLayers([layer('a', 'outputs/a.gpkg')]);

    renderPanel();
    expect(screen.getByTestId('agent-layer-chevron')).toHaveAttribute('data-expanded', 'false');

    fireEvent.click(screen.getByTestId('agent-layer-row'));
    expect(screen.getByTestId('agent-layer-chevron')).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(screen.getByTestId('agent-layer-row'));
    expect(screen.getByTestId('agent-layer-chevron')).toHaveAttribute('data-expanded', 'false');
  });

  it('offers no download for a layer with no file behind it', () => {
    useAgentLayerStore.getState().setLayers([layer('drawn')]);

    renderPanel();
    expect(screen.queryByTestId('agent-layer-download')).not.toBeInTheDocument();

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

  it('offers the fields worth shading by, and a legend once one is picked', () => {
    useAgentLayerStore.getState().setLayers([scored([0, 50, 100])]);

    renderPanel();
    fireEvent.click(screen.getByTestId('agent-layer-row'));

    expect(screen.getByTestId('agent-layer-field')).toHaveAttribute('placeholder', 'Shade by field');
    expect(screen.queryByTestId('agent-layer-legend')).not.toBeInTheDocument();

    act(() => {
      useAgentLayerStore.getState().classify('risk', 'risk');
    });

    const swatches = screen.getAllByTestId('agent-layer-legend-class');
    expect(swatches).toHaveLength(5);
    // the ranges are the tooltip, not five more rows in a 300px panel
    expect(swatches[0]).toHaveAttribute('title', 'risk: 0 to 20');
    expect(swatches[4]).toHaveAttribute('title', 'risk: 80+');
    expect(screen.getByTestId('agent-layer-field')).toHaveValue('risk');

    act(() => {
      useAgentLayerStore.getState().classify('risk', null);
    });
    expect(screen.queryByTestId('agent-layer-legend')).not.toBeInTheDocument();
  });

  it('says why a single-feature layer has nothing to shade instead of offering a dead picker', () => {
    // the environmental risk tool writes one polygon carrying every score
    useAgentLayerStore.getState().setLayers([scored([42])]);

    renderPanel();
    fireEvent.click(screen.getByTestId('agent-layer-row'));

    expect(screen.queryByTestId('agent-layer-field')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-layer-no-shading')).toHaveTextContent(
      'no numeric field varies across these features',
    );
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
