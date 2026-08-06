import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

/**
 * The panel drives convertLayer and nothing else, so only that writer is
 * stubbed: the formats themselves are covered by convert-formats.test.ts
 * against the real duckdb engine.
 */
vi.mock('../../src/features/convert/formats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/convert/formats')>()),
  convertLayer: vi.fn(),
}));

import { ConvertPanel } from '../../src/features/convert/ConvertPanel';
import { convertLayer } from '../../src/features/convert/formats';
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

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'plot' },
      geometry: { type: 'Point', coordinates: [7, 45] },
    },
    {
      type: 'Feature',
      properties: { kind: 'plot' },
      geometry: { type: 'Point', coordinates: [8, 46] },
    },
  ],
};

function renderPanel() {
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [] });
  useAgentLayerStore
    .getState()
    .addLayer({ id: 'plots', name: 'parcels.geojson', color: '#fff', geojson: FC }, false);
  render(
    <MantineProvider>
      <ConvertPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

async function convert() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Convert and download' }));
  });
}

beforeEach(() => {
  vi.mocked(convertLayer).mockReset();
  downloads.length = 0;
  blobs.clear();
});

afterEach(() => {
  cleanup();
});

describe('the convert panel', () => {
  it('offers every format and counts the features of the picked layer', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('textbox', { name: 'Format' }));
    const listbox = within(screen.getByRole('listbox', { name: 'Format' }));
    for (const label of ['GeoParquet', 'FlatGeobuf', 'PMTiles', 'GeoJSON']) {
      expect(listbox.getByText(label)).toBeInTheDocument();
    }

    expect(screen.queryByText('2 features')).toBeNull();
    pick('Layer', 'parcels.geojson');
    expect(screen.getByText('2 features')).toBeInTheDocument();
  });

  it('writes the picked layer in the picked format and downloads the bytes', async () => {
    vi.mocked(convertLayer).mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]));
    renderPanel();

    pick('Layer', 'parcels.geojson');
    pick('Format', 'FlatGeobuf');
    await convert();

    expect(convertLayer).toHaveBeenCalledTimes(1);
    const [geojson, name, format] = vi.mocked(convertLayer).mock.calls[0];
    expect(geojson.features).toEqual(FC.features);
    expect(name).toBe('parcels.geojson');
    expect(format).toBe('flatgeobuf');

    expect(downloads).toEqual([{ name: 'parcels.fgb', size: 5 }]);
    expect(screen.getByTestId('convert-result')).toHaveTextContent('parcels.fgb: 5 bytes');
  });

  it('defaults to GeoParquet', async () => {
    vi.mocked(convertLayer).mockResolvedValue(new Uint8Array([1]));
    renderPanel();

    pick('Layer', 'parcels.geojson');
    await convert();

    expect(vi.mocked(convertLayer).mock.calls[0][2]).toBe('geoparquet');
    expect(downloads[0].name).toBe('parcels.parquet');
  });

  it('reports the failure instead of downloading', async () => {
    vi.mocked(convertLayer).mockRejectedValue(new Error('the layer has no features to convert'));
    renderPanel();

    pick('Layer', 'parcels.geojson');
    await convert();

    expect(await screen.findByText('the layer has no features to convert')).toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(screen.queryByTestId('convert-result')).toBeNull();
  });

  it('will not convert until a layer is picked', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Convert and download' })).toBeDisabled();
    expect(convertLayer).not.toHaveBeenCalled();
  });
});
