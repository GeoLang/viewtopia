import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { GeoTIFFImage } from 'geotiff';

/**
 * The panel picks the band and hands it to the worker, so the loader and the
 * engine are stubbed: the arguments the writer gets are covered by
 * raster-cog.test.ts.
 */
vi.mock('../../src/raster/loader', () => ({
  loadCogFromUrl: vi.fn(),
  loadCogFromBuffer: vi.fn(),
}));

vi.mock('../../src/raster/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/raster/engine')>()),
  writeCog: vi.fn(),
  writeCogBands: vi.fn(),
}));

import { RasterPanel } from '../../src/raster/RasterPanel';
import { loadCogFromUrl } from '../../src/raster/loader';
import { writeCog, writeCogBands } from '../../src/raster/engine';
import type { LoadedRaster } from '../../src/raster/loader';
import type { SampleFormat } from '../../src/raster/types';

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

const downloads: { name: string; size: number }[] = [];
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
  this: HTMLAnchorElement,
) {
  downloads.push({ name: this.download, size: blobs.get(this.href) ?? 0 });
});
const blobs = new Map<string, number>();
URL.createObjectURL = vi.fn((blob: Blob) => {
  const href = `blob:${blobs.size}`;
  blobs.set(href, blob.size);
  return href;
});
URL.revokeObjectURL = vi.fn();

function loadedRaster(sampleFormats: SampleFormat[], noData: number | null): LoadedRaster {
  return {
    metadata: {
      width: 2,
      height: 2,
      bands: sampleFormats.length,
      bbox: [10, 40, 12, 44],
      crs: 'EPSG:4326',
      noData,
      resolution: [1, 2],
      bandLabels: sampleFormats.map((_, i) => `Band ${i + 1}`),
      sampleFormats,
    },
    bands: sampleFormats.map((_, i) => new Float32Array([1, 2, 3, 4].map((v) => v + i * 10))),
    image: {} as GeoTIFFImage,
  };
}

async function renderWithRaster(raster: LoadedRaster) {
  vi.mocked(loadCogFromUrl).mockResolvedValue(raster);
  render(
    <MantineProvider>
      <RasterPanel onClose={() => {}} />
    </MantineProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText('https://example.com/dem.tif'), {
    target: { value: 'https://example.com/scene.tif' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  });
}

async function pickCogInput(option: string) {
  await act(async () => {
    fireEvent.click(screen.getByLabelText('COG input'));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('option', { name: option }));
  });
}

async function convert() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Convert to COG' }));
  });
}

beforeEach(() => {
  vi.mocked(writeCog).mockReset();
  vi.mocked(writeCogBands).mockReset();
  vi.mocked(loadCogFromUrl).mockReset();
  downloads.length = 0;
  blobs.clear();
});

afterEach(() => {
  cleanup();
});

describe('converting the loaded raster to a COG', () => {
  it('writes an 8-bit band at its own sample width and downloads it', async () => {
    vi.mocked(writeCog).mockResolvedValue(new Uint8Array([73, 73, 42, 0, 8]));
    await renderWithRaster(loadedRaster(['u8'], null));

    expect(screen.getByText('Writes u8 samples, tiled with overviews.')).toBeInTheDocument();
    await convert();

    expect(writeCog).toHaveBeenCalledTimes(1);
    const [data, width, height, bbox, crs, sampleFormat, noData] = vi.mocked(writeCog).mock
      .calls[0];
    expect(Array.from(data)).toEqual([1, 2, 3, 4]);
    expect([width, height]).toEqual([2, 2]);
    expect(bbox).toEqual([10, 40, 12, 44]);
    expect(crs).toBe('EPSG:4326');
    expect(sampleFormat).toBe('u8');
    expect(noData).toBeNull();

    expect(downloads).toEqual([{ name: 'scene-band-1.tif', size: 5 }]);
    expect(screen.getByTestId('cog-result')).toHaveTextContent('scene-band-1.tif: 5 bytes');
  });

  it('writes a float band as f32 and carries the source nodata over', async () => {
    vi.mocked(writeCog).mockResolvedValue(new Uint8Array([73, 73]));
    await renderWithRaster(loadedRaster(['f32'], -9999));

    expect(screen.getByText('Writes f32 samples, tiled with overviews.')).toBeInTheDocument();
    await convert();

    const [, , , , , sampleFormat, noData] = vi.mocked(writeCog).mock.calls[0];
    expect(sampleFormat).toBe('f32');
    expect(noData).toBe(-9999);
    expect(downloads).toEqual([{ name: 'scene-band-1.tif', size: 2 }]);
  });

  it('reports a failed conversion instead of downloading', async () => {
    vi.mocked(writeCog).mockRejectedValue(new Error('unknown sample format q8'));
    await renderWithRaster(loadedRaster(['u8'], null));

    await convert();

    expect(await screen.findByText('unknown sample format q8')).toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(screen.queryByTestId('cog-result')).toBeNull();
  });

  it('writes every band of a multi-band raster into one file', async () => {
    vi.mocked(writeCogBands).mockResolvedValue(new Uint8Array([73, 73, 42, 0, 8, 0, 0]));
    await renderWithRaster(loadedRaster(['u8', 'u8', 'u8'], null));

    await pickCogInput('All bands');
    expect(
      screen.getByText('Writes 3 bands of u8 samples, tiled with overviews.'),
    ).toBeInTheDocument();
    await convert();

    expect(writeCog).not.toHaveBeenCalled();
    const [bands, width, height, bbox, crs, sampleFormat] = vi.mocked(writeCogBands).mock.calls[0];
    expect(bands.map((b) => Array.from(b))).toEqual([
      [1, 2, 3, 4],
      [11, 12, 13, 14],
      [21, 22, 23, 24],
    ]);
    expect([width, height]).toEqual([2, 2]);
    expect(bbox).toEqual([10, 40, 12, 44]);
    expect(crs).toBe('EPSG:4326');
    expect(sampleFormat).toBe('u8');

    expect(downloads).toEqual([{ name: 'scene-bands.tif', size: 7 }]);
  });

  it('widens mixed band types to the one format that holds them all', async () => {
    vi.mocked(writeCogBands).mockResolvedValue(new Uint8Array([73, 73]));
    await renderWithRaster(loadedRaster(['u8', 'i16'], null));

    await pickCogInput('All bands');
    await convert();

    const [, , , , , sampleFormat] = vi.mocked(writeCogBands).mock.calls[0];
    expect(sampleFormat).toBe('f64');
  });

  it('offers no all-bands option on a single-band raster', async () => {
    await renderWithRaster(loadedRaster(['u8'], null));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('COG input'));
    });

    expect(screen.queryByRole('option', { name: 'All bands' })).toBeNull();
  });

  it('offers nothing to convert until a raster is loaded', () => {
    render(
      <MantineProvider>
        <RasterPanel onClose={() => {}} />
      </MantineProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Convert to COG' })).toBeNull();
    expect(writeCog).not.toHaveBeenCalled();
  });
});
