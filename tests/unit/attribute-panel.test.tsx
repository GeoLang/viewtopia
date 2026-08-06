import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

/**
 * The panel drives the table itself; the SQL behind the fields and the join is
 * covered against the real engine by attribute-expressions.test.ts, so only
 * those two calls are stubbed here.
 */
vi.mock('../../src/lib/entityLayers', () => ({
  // one array for every render, the way the real hook's state behaves
  useEntityLayers: () => LAYER_REFS,
  getEntityLayer: () => ({ entities: { values: entities } }),
  entityAttributes: (entity: { attrs: Record<string, unknown> }) => entity.attrs,
  flyToEntity: vi.fn(),
}));

vi.mock('../../src/features/attributes/expressions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/attributes/expressions')>()),
  evaluateFields: vi.fn(),
  joinLayers: vi.fn(),
}));

import { DataTablePanel } from '../../src/components/tools/DataTablePanel';
import { evaluateFields, joinLayers } from '../../src/features/attributes/expressions';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useVirtualFieldStore } from '../../src/features/attributes/virtualFields';

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
Element.prototype.scrollIntoView = vi.fn();

const PARCELS = [
  { parcel: 'A-100', pop: 1200 },
  { parcel: 'B-200', pop: 400 },
  { parcel: 'C-300', pop: 900 },
];

const entities = PARCELS.map((attrs, i) => ({ id: `e${i}`, name: attrs.parcel, attrs }));

const LAYER_REFS = [{ index: 0, name: 'agent-layer-plots', count: 3 }];

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: PARCELS.map((properties, i) => ({
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [7 + i, 45] },
  })),
};

function renderPanel() {
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [] });
  useVirtualFieldStore.setState({ fields: {} });
  useAgentLayerStore
    .getState()
    .addLayer({ id: 'plots', name: 'parcels.geojson', color: '#fff', geojson: FC }, false);
  render(
    <MantineProvider>
      <DataTablePanel onClose={() => {}} />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByPlaceholderText('Select layer…'));
  fireEvent.click(screen.getByText('agent-layer-plots (3)'));
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

const bodyColumn = (index: number) =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index].textContent);

async function addField(name: string, expression: string, button: string) {
  fireEvent.change(screen.getByLabelText('Field name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Expression (SQL)'), { target: { value: expression } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: button }));
  });
}

beforeEach(() => {
  vi.mocked(evaluateFields).mockReset();
  vi.mocked(joinLayers).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('the attribute table', () => {
  it('lists the layer, and sorting a column cycles asc, desc and back off', () => {
    renderPanel();
    expect(bodyColumn(0)).toEqual(['A-100', 'B-200', 'C-300']);

    const popHeader = screen.getAllByRole('columnheader')[1];
    fireEvent.click(popHeader);
    expect(bodyColumn(1)).toEqual(['400', '900', '1200']);

    fireEvent.click(popHeader);
    expect(bodyColumn(1)).toEqual(['1200', '900', '400']);

    fireEvent.click(popHeader);
    expect(bodyColumn(1)).toEqual(['1200', '400', '900']);
  });

  it('sorts the filtered rows, so the filter and the order hold together', () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: '00' } });
    fireEvent.click(screen.getAllByRole('columnheader')[1]);
    expect(bodyColumn(0)).toEqual(['B-200', 'C-300', 'A-100']);
  });

  it('shows a virtual field as a column of its own without touching the layer', async () => {
    vi.mocked(evaluateFields).mockResolvedValue({ density: [12, 4, 9] });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Fields' }));
    await addField('density', 'pop / 100', 'Add virtual field');

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'parcel',
      'pop',
      'density',
    ]);
    expect(bodyColumn(2)).toEqual(['12', '4', '9']);
    // the values are read for display only: the layer's features keep their own
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.geojson.features[0].properties).toEqual({ parcel: 'A-100', pop: 1200 });

    // and the stats read the virtual column like any other
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    pick('Column', 'density');
    expect(screen.getByTestId('attr-stats')).toHaveTextContent(
      'count 3 · distinct 3 · min 4 · max 12 · mean 8.33333 · median 9',
    );
  });

  it('reports the expression the engine rejected instead of a blank column', async () => {
    vi.mocked(evaluateFields).mockRejectedValue(new Error('Binder Error: no such column'));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Fields' }));
    await addField('bad', 'nope + 1', 'Add virtual field');

    expect(await screen.findByTestId('attr-field-error')).toHaveTextContent('no such column');
  });

  it('writes a calculated field into the layer, replacing it in place', async () => {
    vi.mocked(evaluateFields).mockResolvedValue({ density: [12, 4, 9] });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Fields' }));
    await addField('density', 'pop / 100', 'Add to layer');

    const layers = useAgentLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('plots');
    expect(layers[0].geojson.features.map((f) => f.properties?.density)).toEqual([12, 4, 9]);
    expect(screen.getByTestId('attr-field-status')).toHaveTextContent(
      'density added to parcels.geojson (3 features)',
    );
  });

  it('lands a join as a new layer and leaves the table layer alone', async () => {
    const joined: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: FC.features.map((f) => ({
        ...f,
        properties: { ...f.properties, residents: 5 },
      })),
    };
    vi.mocked(joinLayers).mockResolvedValue(joined);
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [] });
    renderPanel();
    useAgentLayerStore.getState().addLayer(
      {
        id: 'census',
        name: 'census.geojson',
        color: '#0f0',
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { parcel: 'A-100', residents: 5 },
              geometry: { type: 'Point', coordinates: [7, 45] },
            },
          ],
        },
      },
      false,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    pick('Join layer', 'census.geojson');
    pick('Table field', 'parcel');
    pick('Join field', 'parcel');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join layers' }));
    });

    expect(vi.mocked(joinLayers).mock.calls[0][0]).toMatchObject({
      leftKey: 'parcel',
      rightKey: 'parcel',
      prefix: 'census_',
    });
    const layers = useAgentLayerStore.getState().layers;
    expect(layers).toHaveLength(3);
    expect(layers[2].name).toBe('parcels.geojson + census.geojson');
    expect(layers[2].geojson.features).toHaveLength(3);
    // the table's own layer is untouched by the join
    expect(layers[0].geojson.features[0].properties).toEqual({ parcel: 'A-100', pop: 1200 });
    expect(screen.getByTestId('attr-join-status')).toHaveTextContent(
      'parcels.geojson + census.geojson: 3 features',
    );
  });
});
