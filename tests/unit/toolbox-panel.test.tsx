import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

/**
 * The panel drives runTool and nothing else, so the worker is the only thing
 * stubbed here: the wasm side is covered by toolbox-topoi.test.ts.
 */
vi.mock('cesium', () => ({ Math: { toDegrees: (r: number) => (r * 180) / Math.PI } }));
vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
}));
vi.mock('../../src/toolbox/engine', () => ({ runTool: vi.fn() }));

import { ToolboxPanel } from '../../src/toolbox/ToolboxPanel';
import { runTool } from '../../src/toolbox/engine';
import { useAgentLayerStore } from '../../src/store/agentLayers';

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
// Mantine's Combobox scrolls the active option into view
Element.prototype.scrollIntoView = vi.fn();

function square(west: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'plot' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, 45],
              [west + 0.01, 45],
              [west + 0.01, 45.01],
              [west, 45.01],
              [west, 45],
            ],
          ],
        },
      },
    ],
  };
}

const features = (fc: GeoJSON.FeatureCollection) => ({ kind: 'features' as const, geojson: fc });

function renderPanel() {
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [] });
  useAgentLayerStore.getState().addLayer(
    { id: 'plots', name: 'Plots', color: '#fff', geojson: square(7) },
    false,
  );
  render(
    <MantineProvider>
      <ToolboxPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

beforeEach(() => {
  vi.mocked(runTool).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('the toolbox panel renders from the catalogue', () => {
  it('shows the inputs and parameters the picked tool declares', () => {
    renderPanel();

    expect(screen.getByRole('textbox', { name: 'Input layer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Distance (m)')).toBeInTheDocument();
    expect(screen.getByLabelText('Segments')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Predicate' })).toBeNull();

    pick('Tool', 'Spatial join');
    expect(screen.getByRole('textbox', { name: 'Source layer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Predicate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Property prefix')).toBeInTheDocument();
    expect(screen.queryByLabelText('Distance (m)')).toBeNull();

    // a grid reads no layer at all, and its extent falls back to the view
    pick('Tool', 'Square grid');
    expect(screen.queryByRole('textbox', { name: 'Input layer' })).toBeNull();
    expect(screen.getByLabelText('Cell size (m)')).toBeInTheDocument();
    expect(screen.getByLabelText('Extent (w,s,e,n)')).toBeInTheDocument();
  });
});

describe('running a tool', () => {
  it('passes the picked layer and metric parameters, and adds the result as a layer', async () => {
    vi.mocked(runTool).mockResolvedValue(features(square(8)));
    renderPanel();

    pick('Input layer', 'Plots');
    fireEvent.change(screen.getByLabelText('Distance (m)'), { target: { value: '250' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    });

    expect(runTool).toHaveBeenCalledTimes(1);
    const [tool, inputs, params] = vi.mocked(runTool).mock.calls[0];
    expect(tool).toBe('buffer');
    expect(inputs.a?.features).toEqual(square(7).features);
    expect(inputs.b).toBeNull();
    expect(params.distance).toBe(250);
    expect(params.extent).toBeNull();

    expect(screen.getByText('Buffer: 1 features')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add as layer' }));
    const added = useAgentLayerStore.getState().layers.find((l) => l.name === 'Buffer');
    expect(added?.geojson.features).toEqual(square(8).features);
  });

  it('reports the failure instead of a layer', async () => {
    vi.mocked(runTool).mockRejectedValue(new Error('the layers do not overlap'));
    renderPanel();

    pick('Input layer', 'Plots');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    });

    expect(await screen.findByText('the layers do not overlap')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add as layer' })).toBeNull();
  });
});

describe('the batch runner', () => {
  it('feeds each step the one before it and stops at the first error', async () => {
    renderPanel();
    pick('Input layer', 'Plots');
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    pick('Tool', 'Simplify');
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    vi.mocked(runTool)
      .mockResolvedValueOnce(features(square(8)))
      .mockRejectedValueOnce(new Error('nothing left'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run batch' }));
    });

    await waitFor(() =>
      expect(screen.getByText('step 2 (Simplify) failed: nothing left')).toBeInTheDocument(),
    );
    // step 2 read step 1's output rather than the layer it started from
    expect(vi.mocked(runTool).mock.calls[1][1].a?.features).toEqual(square(8).features);
    expect(screen.getByText('1 features')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add step 1 as layer' }));
    expect(useAgentLayerStore.getState().layers.some((l) => l.name === 'Buffer')).toBe(true);
  });
});

describe('the validity report', () => {
  it('lists the issue per feature and hands the same input to make valid', async () => {
    vi.mocked(runTool).mockResolvedValue({
      kind: 'report',
      report: {
        valid: false,
        invalid: [{ feature: 0, issues: [{ kind: 'self_intersection', message: 'ring crosses itself' }] }],
      },
    });
    renderPanel();

    pick('Tool', 'Check validity');
    pick('Input layer', 'Plots');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run tool' }));
    });

    expect(screen.getByText('1 invalid features')).toBeInTheDocument();
    expect(screen.getByText('Feature 1: ring crosses itself')).toBeInTheDocument();

    vi.mocked(runTool).mockResolvedValue(features(square(7)));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make valid' }));
    });

    const [tool, inputs] = vi.mocked(runTool).mock.calls[1];
    expect(tool).toBe('make-valid');
    expect(inputs.a?.features).toEqual(square(7).features);
    expect(screen.getByText('Make valid: 1 features')).toBeInTheDocument();
  });
});
