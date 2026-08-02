import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DragDropImport } from '../../src/components/tools/DragDropImport';

// only the duckdb side is mocked, the text-format path stays the real one
const importVectorFiles = vi.hoisted(() => vi.fn());
vi.mock('../../src/duckdb/importVector', () => ({ importVectorFiles }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: notify } }));

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const point: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { a: 1 } },
  ],
};

function drop(files: File[]) {
  const zone = screen.getByText(/Drop files here/).parentElement;
  if (!zone) throw new Error('no drop zone');
  fireEvent.drop(zone, { dataTransfer: { files } });
}

function setup() {
  const onImport = vi.fn();
  render(
    <MantineProvider>
      <DragDropImport onImport={onImport} onClose={() => {}} />
    </MantineProvider>,
  );
  return onImport;
}

beforeEach(() => {
  importVectorFiles.mockReset();
  notify.mockReset();
});
afterEach(cleanup);

describe('DragDropImport routing', () => {
  it('sends a shapefile and its sidecars through as one batch', async () => {
    importVectorFiles.mockResolvedValue({
      layers: [{ name: 'roads.shp', geojson: point, tableName: 'roads_shp' }],
      problems: [],
    });
    const onImport = setup();
    drop([
      new File(['x'], 'roads.shp'),
      new File(['x'], 'roads.dbf'),
      new File(['x'], 'roads.shx'),
    ]);

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('roads.shp', point));
    expect(importVectorFiles).toHaveBeenCalledTimes(1);
    expect(importVectorFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual([
      'roads.shp',
      'roads.dbf',
      'roads.shx',
    ]);
  });

  it('imports one layer per GeoPackage layer', async () => {
    importVectorFiles.mockResolvedValue({
      layers: [
        { name: 'places', geojson: point, tableName: 'places' },
        { name: 'zones', geojson: point, tableName: 'zones' },
      ],
      problems: [],
    });
    const onImport = setup();
    drop([new File(['x'], 'city.gpkg')]);

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport.mock.calls.map((c) => c[0])).toEqual(['places', 'zones']);
  });

  it('shows problems in the colour that matches their level', async () => {
    importVectorFiles.mockResolvedValue({
      layers: [{ name: 'roads.shp', geojson: point, tableName: 'roads_shp' }],
      problems: [
        { file: 'roads.shp', message: 'no .dbf alongside it', level: 'warning' },
        { file: 'broken.fgb', message: 'could not be read', level: 'error' },
      ],
    });
    setup();
    drop([new File(['x'], 'roads.shp'), new File(['x'], 'broken.fgb')]);

    await waitFor(() => expect(notify).toHaveBeenCalledTimes(3));
    const colors = notify.mock.calls.map((c) => c[0].color);
    expect(colors).toEqual(['green', 'yellow', 'red']);
  });

  it('keeps text formats on the parser path', async () => {
    const onImport = setup();
    drop([new File([JSON.stringify(point)], 'shapes.geojson')]);

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0]).toBe('shapes.geojson');
    expect(onImport.mock.calls[0][1].features).toHaveLength(1);
    expect(importVectorFiles).not.toHaveBeenCalled();
  });

  it('rejects a format neither path handles', async () => {
    setup();
    drop([new File(['x'], 'notes.txt')]);

    await waitFor(() => expect(screen.getByTestId('import-status')).toHaveTextContent('unsupported'));
    expect(importVectorFiles).not.toHaveBeenCalled();
  });
});
