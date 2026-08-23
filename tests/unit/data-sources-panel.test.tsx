import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ToolPanels } from '../../src/components/ToolPanels';
import { DataSourcesPanel } from '../../src/features/dataSources/DataSourcesPanel';
import { ALL_TOOL_MENU_ITEMS } from '../../src/components/toolMenus';
import { useAppStore, type ToolPanel } from '../../src/store/app';
import { useOgcLayerStore } from '../../src/store/ogcLayers';

// duckdb is the only boundary the tabs reach, the panel and its bodies are real
vi.mock('../../src/duckdb', () => ({
  query: vi.fn(),
  queryAsGeoJson: vi.fn(),
  NoGeometryError: class extends Error {},
}));
vi.mock('../../src/duckdb/exportFile', () => ({ exportQuery: vi.fn() }));
vi.mock('../../src/duckdb/loaders', () => ({
  attachParquetUrl: vi.fn(),
  attachCsvUrl: vi.fn(),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function openPanel(panel: ToolPanel) {
  useAppStore.getState().setActivePanel(panel);
  return render(
    <MantineProvider>
      <ToolPanels />
    </MantineProvider>,
  );
}

function openTab(tab: 'services' | 'database' | 'files') {
  render(
    <MantineProvider>
      <DataSourcesPanel tab={tab} onClose={() => {}} />
    </MantineProvider>,
  );
}

// the tabs stay mounted so a half-written query survives a look at another one,
// so each body is found by what only it shows and checked for being on screen
const services = () => screen.getByPlaceholderText('Service URL');
const database = () => screen.getByTestId('sql-editor');
const files = () => screen.getByText(/Drop files here/);

beforeEach(() => {
  useOgcLayerStore.setState({ layers: [] });
  useAppStore.getState().setActivePanel(null);
});
afterEach(cleanup);

describe('DataSourcesPanel', () => {
  it('shows one tab body at a time and switches between them', () => {
    openTab('services');
    expect(services()).toBeVisible();
    expect(database()).not.toBeVisible();
    expect(files()).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Database' }));
    expect(database()).toBeVisible();
    expect(services()).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    expect(files()).toBeVisible();
    expect(database()).not.toBeVisible();
  });

  it('adds an OGC service from the services tab', () => {
    openTab('services');
    fireEvent.change(screen.getByPlaceholderText('Layer name'), { target: { value: 'roads' } });
    fireEvent.change(services(), { target: { value: 'https://maps.example/wms' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useOgcLayerStore.getState().layers.map((l) => l.name)).toEqual(['roads']);
    expect(screen.getByText('https://maps.example/wms')).toBeInTheDocument();
  });
});

describe('data source panel ids', () => {
  it('opens the merged panel on its services tab', () => {
    openPanel('dataSources');
    expect(screen.getByTestId('data-sources-panel')).toBeInTheDocument();
    expect(services()).toBeVisible();
  });

  it('opens the services tab for the old ogc id', () => {
    openPanel('ogc');
    expect(services()).toBeVisible();
    expect(database()).not.toBeVisible();
  });

  it('opens the database tab for the old sql id', () => {
    openPanel('sqlWorkspace');
    expect(database()).toBeVisible();
    expect(services()).not.toBeVisible();
  });

  it('opens the files tab for the old import id', () => {
    openPanel('import');
    expect(files()).toBeVisible();
    expect(database()).not.toBeVisible();
  });

  it('follows an id opened while the panel is already up', () => {
    openPanel('ogc');
    act(() => useAppStore.getState().setActivePanel('sqlWorkspace'));
    expect(database()).toBeVisible();
    expect(services()).not.toBeVisible();
  });
});

describe('tool menu registry', () => {
  it('lists the merged panel once and none of the panels it replaced', () => {
    const panels = ALL_TOOL_MENU_ITEMS.map((item) => item.panel);
    expect(panels.filter((panel) => panel === 'dataSources')).toHaveLength(1);
    for (const merged of ['ogc', 'sqlWorkspace', 'import']) {
      expect(panels).not.toContain(merged);
    }
  });

  // one test per entry: all of them in one body outruns the test timeout on a
  // loaded machine
  it.each(ALL_TOOL_MENU_ITEMS)('the $label entry opens a non-empty panel', (item) => {
    const { container } = openPanel(item.panel);
    expect(container, item.label).not.toBeEmptyDOMElement();
    cleanup();
  });
});
