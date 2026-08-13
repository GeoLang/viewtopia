import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LegendPanel } from '../../src/features/symbology/LegendPanel';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import {
  applySymbology,
  buildExpression,
  buildGraduated,
} from '../../src/features/symbology/symbology';

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

const renderPanel = () =>
  render(
    <MantineProvider>
      <LegendPanel onClose={vi.fn()} />
    </MantineProvider>,
  );

describe('LegendPanel', () => {
  beforeEach(() => {
    useAgentLayerStore.setState({ layers: [], markers: [], generation: 0 });
  });

  afterEach(cleanup);

  it('says when there is nothing to describe', () => {
    renderPanel();
    expect(screen.getByText('No layers loaded')).toBeInTheDocument();
  });

  it('lists each class of a styled layer and names the field', () => {
    const layer = scored([0, 50, 100]);
    const sym = buildGraduated(layer, 'risk');
    if (!sym) throw new Error('expected graduated symbology');
    useAgentLayerStore.getState().setLayers([applySymbology(layer, sym)]);

    renderPanel();

    expect(screen.getByText('Flood risk')).toBeInTheDocument();
    expect(screen.getByText('by risk')).toBeInTheDocument();
    expect(screen.getAllByTestId('legend-entry')).toHaveLength(5);
    expect(screen.getByText('0 to 20')).toBeInTheDocument();
    expect(screen.getByText('80+')).toBeInTheDocument();
  });

  it('names an expression layer by its expression and sizes the swatches', () => {
    const layer = scored([0, 50, 100]);
    const sym = buildExpression(layer, 'risk * 2', 'viridis', [4, 12]);
    if (!sym) throw new Error('expected expression symbology');
    useAgentLayerStore.getState().setLayers([applySymbology(layer, sym)]);

    renderPanel();

    expect(screen.getByText('by risk * 2')).toBeInTheDocument();
    expect(screen.getAllByTestId('legend-entry')).toHaveLength(5);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    const swatches = screen.getAllByTestId('legend-swatch');
    expect(swatches[0]).toHaveStyle({ width: '8px' });
    expect(swatches[4]).toHaveStyle({ width: '24px' });
  });

  it('shows an unstyled layer as its single colour', () => {
    useAgentLayerStore.getState().setLayers([scored([1])]);

    renderPanel();

    expect(screen.getAllByTestId('legend-entry')).toHaveLength(1);
    expect(screen.getByText('single colour')).toBeInTheDocument();
  });
});
