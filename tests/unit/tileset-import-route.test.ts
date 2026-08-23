import { beforeEach, describe, expect, it, vi } from 'vitest';

// only the duckdb side is mocked, the text-format path stays the real one
vi.mock('../../src/duckdb/importVector', () => ({ importVectorFiles: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { importFiles } from '../../src/lib/importFiles';
import { useTilesetStore } from '../../src/features/tilesets/store';
import { BROWSER_IMPORT_LIMIT_BYTES } from '../../src/features/tilesets/api';

const collection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
  ],
};

function geojsonFile(name: string, size: number): File {
  const file = new File([JSON.stringify(collection)], name, { type: 'application/geo+json' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('import routing at the browser size limit', () => {
  beforeEach(() => {
    useTilesetStore.setState({ offered: null, browserFallback: null });
  });

  it('offers the server tileset instead of parsing a file past the limit', async () => {
    const onImport = vi.fn();
    const big = geojsonFile('counties.geojson', BROWSER_IMPORT_LIMIT_BYTES + 1);

    await importFiles([big], onImport);

    expect(onImport).not.toHaveBeenCalled();
    expect(useTilesetStore.getState().offered).toBe(big);
  });

  it('parses a file under the limit in the browser', async () => {
    const onImport = vi.fn();

    await importFiles([geojsonFile('counties.geojson', 1024)], onImport);

    expect(onImport).toHaveBeenCalledWith('counties.geojson', expect.objectContaining({
      type: 'FeatureCollection',
    }));
    expect(useTilesetStore.getState().offered).toBeNull();
  });

  it('imports the file in the browser after all when the offer is turned down', async () => {
    const onImport = vi.fn();
    await importFiles([geojsonFile('counties.geojson', BROWSER_IMPORT_LIMIT_BYTES + 1)], onImport);

    const fallback = useTilesetStore.getState().browserFallback;
    expect(fallback).toBeTypeOf('function');
    fallback?.();
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  });

  it('sends a gzipped GeoJSON to the builder at any size, with no browser path back', async () => {
    const onImport = vi.fn();
    const small = geojsonFile('counties.geojson.gz', 1024);

    await importFiles([small], onImport);

    expect(onImport).not.toHaveBeenCalled();
    expect(useTilesetStore.getState().offered).toBe(small);
    expect(useTilesetStore.getState().browserFallback).toBeNull();
  });

  it('leaves a file the builder cannot read on the browser path whatever its size', async () => {
    const onImport = vi.fn();
    const big = geojsonFile('scan.kml', BROWSER_IMPORT_LIMIT_BYTES + 1);

    await importFiles([big], onImport);

    expect(useTilesetStore.getState().offered).toBeNull();
  });
});
