import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SqlWorkspacePanel } from '../../src/features/sql/SqlWorkspacePanel';
import { useAgentLayerStore } from '../../src/store/agentLayers';

// only the duckdb boundary is mocked, the panel itself is the real one
const { queryMock, geoJsonMock, NoGeometryError } = vi.hoisted(() => {
  class NoGeometryError extends Error {}
  return { queryMock: vi.fn(), geoJsonMock: vi.fn(), NoGeometryError };
});
vi.mock('../../src/duckdb', () => ({
  query: queryMock,
  queryAsGeoJson: geoJsonMock,
  NoGeometryError,
}));
const { exportMock, attachParquetMock, attachCsvMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  attachParquetMock: vi.fn(),
  attachCsvMock: vi.fn(),
}));
vi.mock('../../src/duckdb/exportFile', () => ({ exportQuery: exportMock }));
vi.mock('../../src/duckdb/loaders', () => ({
  attachParquetUrl: attachParquetMock,
  attachCsvUrl: attachCsvMock,
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: notify } }));

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

function result(rows: Record<string, unknown>[]) {
  return { rows, columns: Object.keys(rows[0] ?? {}), rowCount: rows.length, table: null };
}

function setup() {
  render(
    <MantineProvider>
      <SqlWorkspacePanel onClose={() => {}} />
    </MantineProvider>,
  );
}

function type(sql: string) {
  fireEvent.change(screen.getByTestId('sql-editor'), { target: { value: sql } });
}

const run = () => fireEvent.click(screen.getByTestId('sql-run'));

beforeEach(() => {
  localStorage.clear();
  queryMock.mockReset();
  geoJsonMock.mockReset();
  exportMock.mockReset();
  attachParquetMock.mockReset();
  attachCsvMock.mockReset();
  notify.mockReset();
  useAgentLayerStore.setState({ layers: [], markers: [] });
  // jsdom has no object URLs, and the download only needs the anchor to be built
  URL.createObjectURL = vi.fn().mockReturnValue('blob:sql');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe('SqlWorkspacePanel', () => {
  it('shows the rows a query returns', async () => {
    queryMock.mockResolvedValue(result([{ name: 'Lisbon', pop: 545000 }]));
    setup();
    type('SELECT * FROM cities');
    run();

    await waitFor(() => expect(screen.getByTestId('sql-results')).toBeInTheDocument());
    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM cities');
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
    expect(screen.getByText('545000')).toBeInTheDocument();
    expect(screen.queryByTestId('sql-cap')).not.toBeInTheDocument();
  });

  it('runs on Ctrl+Enter', async () => {
    queryMock.mockResolvedValue(result([{ x: 1 }]));
    setup();
    type('SELECT 1 AS x');
    fireEvent.keyDown(screen.getByTestId('sql-editor'), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(queryMock).toHaveBeenCalledWith('SELECT 1 AS x'));
  });

  it('caps the table and says how many rows there are', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ id: i }));
    queryMock.mockResolvedValue(result(rows));
    setup();
    type('SELECT * FROM big');
    run();

    await waitFor(() => expect(screen.getByTestId('sql-cap')).toHaveTextContent('Showing 500 of 600 rows'));
    expect(screen.getAllByRole('row')).toHaveLength(501); // header plus the cap
  });

  it('shows the error message on a failed query', async () => {
    queryMock.mockRejectedValue(new Error('Parser Error: syntax error at BADSQL'));
    setup();
    type('BADSQL');
    run();

    await waitFor(() =>
      expect(screen.getByTestId('sql-error')).toHaveTextContent('Parser Error: syntax error at BADSQL'),
    );
    expect(screen.queryByTestId('sql-results')).not.toBeInTheDocument();
  });

  it('keeps the last queries and restores one on click', async () => {
    queryMock.mockResolvedValue(result([{ x: 1 }]));
    setup();
    type('SELECT 1');
    run();
    await waitFor(() => expect(queryMock).toHaveBeenCalled());
    type('SELECT 2');
    run();
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));

    const stored = JSON.parse(localStorage.getItem('viewtopia-sql-history') ?? '[]');
    expect(stored).toEqual(['SELECT 2', 'SELECT 1']);

    fireEvent.click(screen.getAllByTestId('sql-history-item')[1]);
    expect(screen.getByTestId('sql-editor')).toHaveValue('SELECT 1');
  });

  it('reloads history from localStorage', () => {
    localStorage.setItem('viewtopia-sql-history', JSON.stringify(['SELECT 42']));
    setup();
    expect(screen.getAllByTestId('sql-history-item')[0]).toHaveTextContent('SELECT 42');
  });

  it('adds the query result to the map as a layer', async () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
      ],
    };
    geoJsonMock.mockResolvedValue(geojson);
    setup();
    type('SELECT geom FROM places');
    fireEvent.click(screen.getByTestId('sql-add-map'));

    await waitFor(() => expect(useAgentLayerStore.getState().layers).toHaveLength(1));
    expect(geoJsonMock).toHaveBeenCalledWith('SELECT geom FROM places');
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.name).toBe('SELECT geom FROM places');
    expect(layer.geojson).toEqual(geojson);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }));
  });

  it('says so when the result has no geometry, and draws nothing', async () => {
    geoJsonMock.mockRejectedValue(new NoGeometryError('No geometry detected.'));
    setup();
    type('SELECT 1');
    fireEvent.click(screen.getByTestId('sql-add-map'));

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'yellow' }));
    expect(useAgentLayerStore.getState().layers).toHaveLength(0);
  });

  it('downloads the current query as CSV', async () => {
    exportMock.mockResolvedValue(new TextEncoder().encode('id\n1\n'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setup();
    type('SELECT 1 AS id');
    fireEvent.click(screen.getByText('Export CSV'));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith('SELECT 1 AS id', 'csv'));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('attaches a remote parquet under a slugged view name', async () => {
    setup();
    fireEvent.change(screen.getByTestId('sql-url'), {
      target: { value: 'https://example.com/data/trip data.parquet?token=abc' },
    });
    fireEvent.click(screen.getByText('Attach'));

    await waitFor(() =>
      expect(attachParquetMock).toHaveBeenCalledWith(
        'trip_data',
        'https://example.com/data/trip data.parquet?token=abc',
      ),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'green', message: 'query it as trip_data' }),
    );
  });

  it('refuses a URL that is neither parquet nor csv', async () => {
    setup();
    fireEvent.change(screen.getByTestId('sql-url'), {
      target: { value: 'https://example.com/data.json' },
    });
    fireEvent.click(screen.getByText('Attach'));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
    expect(attachParquetMock).not.toHaveBeenCalled();
    expect(attachCsvMock).not.toHaveBeenCalled();
  });

  it('reports a failed add-to-map in red', async () => {
    geoJsonMock.mockRejectedValue(new Error('Catalog Error: no such table'));
    setup();
    type('SELECT * FROM nope');
    fireEvent.click(screen.getByTestId('sql-add-map'));

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', message: 'Catalog Error: no such table' }),
    );
  });
});
