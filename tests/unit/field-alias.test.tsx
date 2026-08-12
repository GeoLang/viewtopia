import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../src/lib/entityLayers', () => ({
  useEntityLayers: () => LAYER_REFS,
  getEntityLayer: () => ({ entities: { values: entities } }),
  entityAttributes: (entity: { attrs: Record<string, unknown> }) => entity.attrs,
  flyToEntity: vi.fn(),
}));

import { parseDatasetFields, fieldLabel } from '../../src/lib/datasetSchema';
import { useDatasetSchemaStore } from '../../src/store/datasetSchemas';
import { DataTablePanel } from '../../src/components/tools/DataTablePanel';
import { FeaturePickerPanel } from '../../src/components/tools/FeaturePickerPanel';
import { StatsSection } from '../../src/features/attributes/AttributeTools';
import { useFeaturePickerStore, propsToRows } from '../../src/store/featurePicker';
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

const DATASET_ID = '0198a0f1-2a3b-7c4d-8e5f-6a7b8c9d0e1f';

/**
 * A ptolemy GET /datasets/{id}/schema body. `constructionmaterial` has an alias
 * and `plain` has none, and ptolemy omits the key rather than sending null.
 */
const SCHEMA_BODY = {
  dataset_id: DATASET_ID,
  fields: [
    {
      name: 'constructionmaterial',
      field_type: 'string',
      required: false,
      alias: 'Construction Material',
      allowed_values: [],
      min: null,
      max: null,
    },
    {
      name: 'plain',
      field_type: 'string',
      required: false,
      allowed_values: [],
      min: null,
      max: null,
    },
  ],
  geometry_rules: { allowed_types: [], bounds: null, max_vertices: null },
};

const ROWS = [
  { constructionmaterial: 'brick', plain: 'x' },
  { constructionmaterial: 'wood', plain: 'y' },
  { constructionmaterial: 'brick', plain: 'z' },
];

const entities = ROWS.map((attrs, i) => ({ id: `e${i}`, name: attrs.plain, attrs }));
const LAYER_REFS = [{ index: 0, name: 'agent-layer-plots', count: 3 }];

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: ROWS.map((properties, i) => ({
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [7 + i, 45] },
  })),
};

function loadSchema() {
  useDatasetSchemaStore
    .getState()
    .setDatasetFields(DATASET_ID, parseDatasetFields(SCHEMA_BODY));
}

function renderTable() {
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

const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);

beforeEach(() => {
  useDatasetSchemaStore.setState({ fieldsByDataset: {} });
  useFeaturePickerStore.setState({ enabled: true, selected: null, hovering: false });
});

describe('the ptolemy field shape', () => {
  it('reads an alias, and leaves a field without one alone', () => {
    const fields = parseDatasetFields(SCHEMA_BODY);
    expect(fields.map((f) => f.name)).toEqual(['constructionmaterial', 'plain']);
    expect(fields[0].alias).toBe('Construction Material');
    expect(fields[1].alias).toBeNull();
    expect(fields.map(fieldLabel)).toEqual(['Construction Material', 'plain']);
  });

  it('drops a field the shape does not name, rather than half-reading it', () => {
    expect(parseDatasetFields({ fields: [{ name: 'nope' }] })).toEqual([]);
    expect(parseDatasetFields(null)).toEqual([]);
  });
});

describe('the attribute table header', () => {
  it('shows the alias, and the column name where there is none', () => {
    loadSchema();
    renderTable();
    expect(headers()).toEqual(['Construction Material', 'plain']);
  });

  it('falls back to the column name when no schema is loaded', () => {
    renderTable();
    expect(headers()).toEqual(['constructionmaterial', 'plain']);
  });

  it('still sorts by the column name behind the alias', () => {
    loadSchema();
    renderTable();
    fireEvent.click(screen.getAllByRole('columnheader')[0]);
    const firstCells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent);
    expect(firstCells).toEqual(['brick', 'brick', 'wood']);
  });
});

describe('the feature info panel', () => {
  function renderPicker() {
    useFeaturePickerStore.setState({ selected: propsToRows(ROWS[0]) });
    render(
      <MantineProvider>
        <FeaturePickerPanel onClose={() => {}} />
      </MantineProvider>,
    );
    return screen.getAllByRole('row').map((row) => within(row).getAllByRole('cell')[0].textContent);
  }

  it('labels a picked property with its alias', () => {
    loadSchema();
    expect(renderPicker()).toEqual(['Construction Material', 'plain']);
  });

  it('falls back to the property name when no schema is loaded', () => {
    expect(renderPicker()).toEqual(['constructionmaterial', 'plain']);
  });
});

describe('a field picker', () => {
  function renderStats() {
    render(
      <MantineProvider>
        <StatsSection columns={['constructionmaterial', 'plain']} rows={ROWS} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('textbox', { name: 'Column' }));
    return within(screen.getByRole('listbox', { name: 'Column' }));
  }

  it('offers the alias, and the column name where there is none', () => {
    loadSchema();
    const options = renderStats();
    expect(options.getByText('Construction Material')).toBeInTheDocument();
    expect(options.getByText('plain')).toBeInTheDocument();
  });

  it('picks the column name behind the alias, not the alias itself', () => {
    loadSchema();
    fireEvent.click(renderStats().getByText('Construction Material'));
    expect(screen.getByTestId('attr-stats')).toHaveTextContent('count 3 · distinct 2');
  });

  it('falls back to the column name when no schema is loaded', () => {
    expect(renderStats().getByText('constructionmaterial')).toBeInTheDocument();
  });
});
