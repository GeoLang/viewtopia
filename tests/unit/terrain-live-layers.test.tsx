import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// the panel imports cesium through the shared analysis lib, and nothing here
// draws, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Rectangle: { fromDegrees: () => ({}) },
  SingleTileImageryProvider: { fromUrl: async () => ({}) },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { TerrainAnalysisPanel } from '../../src/components/tools/TerrainAnalysisPanel';
import { DEFAULT_SUN, liveLayerName, liveTileTemplate } from '../../src/lib/terrainAnalysis';
import { useOgcLayerStore, rasterTileTemplate } from '../../src/store/ogcLayers';

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

describe('live analysis tile templates', () => {
  it('keeps the xyz placeholders literal and bakes in the sun for hillshade', () => {
    expect(liveTileTemplate('hillshade', { azimuth: 120, altitude: 30 })).toBe(
      '/tiles/v1/analysis/xyz/hillshade/{z}/{x}/{y}.png?azimuth=120&altitude=30',
    );
  });

  it('asks for no parameters on slope', () => {
    expect(liveTileTemplate('slope', DEFAULT_SUN)).toBe(
      '/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png',
    );
  });

  it('names a layer after its op and sun', () => {
    expect(liveLayerName('hillshade', DEFAULT_SUN)).toBe('hillshade 315/45 (live)');
    expect(liveLayerName('slope', DEFAULT_SUN)).toBe('slope (live)');
  });

  it('asks for no parameters on ndvi, the sun means nothing to vegetation', () => {
    expect(liveTileTemplate('ndvi', { azimuth: 120, altitude: 30 })).toBe(
      '/tiles/v1/analysis/xyz/ndvi/{z}/{x}/{y}.png',
    );
    expect(liveLayerName('ndvi', DEFAULT_SUN)).toBe('ndvi (live)');
  });
});

describe('addXyzLayer', () => {
  beforeEach(() => {
    useOgcLayerStore.setState({ layers: [] });
  });

  it('adds an xyz layer the renderers can draw', () => {
    const layer = useOgcLayerStore.getState().addXyzLayer('slope (live)', liveTileTemplate('slope', DEFAULT_SUN));

    expect(layer.type).toBe('xyz');
    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
    expect(rasterTileTemplate(layer)).toBe(
      `${window.location.origin}/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png`,
    );
  });

  it('returns the layer already drawing the same tiles instead of a second one', () => {
    const url = liveTileTemplate('hillshade', DEFAULT_SUN);
    const first = useOgcLayerStore.getState().addXyzLayer('hillshade 315/45 (live)', url);
    const again = useOgcLayerStore.getState().addXyzLayer('hillshade 315/45 (live)', url);

    expect(again.id).toBe(first.id);
    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
  });

  it('adds a second layer for different parameters', () => {
    useOgcLayerStore
      .getState()
      .addXyzLayer('hillshade 315/45 (live)', liveTileTemplate('hillshade', DEFAULT_SUN));
    useOgcLayerStore
      .getState()
      .addXyzLayer('hillshade 90/20 (live)', liveTileTemplate('hillshade', { azimuth: 90, altitude: 20 }));

    expect(useOgcLayerStore.getState().layers).toHaveLength(2);
  });
});

describe('TerrainAnalysisPanel live layer action', () => {
  beforeEach(() => {
    cleanup();
    useOgcLayerStore.setState({ layers: [] });
  });

  const renderPanel = () => {
    render(
      <MantineProvider>
        <TerrainAnalysisPanel onClose={() => {}} />
      </MantineProvider>,
    );
    return screen.getByRole('button', { name: /add live layer/i });
  };

  it('adds the layer for the selected op without a session token', () => {
    const button = renderPanel();
    // slope is the panel's default op
    fireEvent.click(button);

    const [layer] = useOgcLayerStore.getState().layers;
    expect(layer).toMatchObject({
      name: 'slope (live)',
      type: 'xyz',
      url: '/tiles/v1/analysis/xyz/slope/{z}/{x}/{y}.png',
    });
    expect(screen.getByTestId('terrain-live-status')).toHaveTextContent('slope (live)');
  });

  it('does not stack a duplicate when clicked twice', () => {
    const button = renderPanel();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(useOgcLayerStore.getState().layers).toHaveLength(1);
  });

  it('adds the ndvi layer regardless of the selected op', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /add live ndvi layer/i }));

    const [layer] = useOgcLayerStore.getState().layers;
    expect(layer).toMatchObject({
      name: 'ndvi (live)',
      type: 'xyz',
      url: '/tiles/v1/analysis/xyz/ndvi/{z}/{x}/{y}.png',
    });
    expect(screen.getByTestId('terrain-live-status')).toHaveTextContent('ndvi (live)');
  });
});
