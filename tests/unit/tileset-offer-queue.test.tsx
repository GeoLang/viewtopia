import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the duckdb side is mocked, the text-format path stays the real one
vi.mock('../../src/duckdb/importVector', () => ({ importVectorFiles: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { importFiles } from '../../src/lib/importFiles';
import { useTilesetStore } from '../../src/features/tilesets/store';
import { TilesetOffer } from '../../src/features/tilesets/TilesetOffer';
import { useAuthStore } from '../../src/features/auth/store';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { BROWSER_IMPORT_LIMIT_BYTES, type Tileset } from '../../src/features/tilesets/api';

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

const collection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }],
};

function oversizeFile(name: string): File {
  const file = new File([JSON.stringify(collection)], name, { type: 'application/geo+json' });
  Object.defineProperty(file, 'size', { value: BROWSER_IMPORT_LIMIT_BYTES + 1 });
  return file;
}

function record(overrides: Partial<Tileset> = {}): Tileset {
  return {
    id: 'ts-1',
    name: 'a.geojson',
    status: 'building',
    source_id: 'ts-1',
    object_key: 'ts-1.pmtiles',
    original_filename: 'a.geojson',
    layer_name: 'a',
    argv: ['tippecanoe'],
    size_bytes: 0,
    created_at: '2026-08-25T10:00:00Z',
    built_at: null,
    error: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Enough of XMLHttpRequest for the upload: one progress event and one reply. */
class FakeUpload {
  static reply = { status: 202, text: '' };
  status = 0;
  responseText = '';
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    this.status = FakeUpload.reply.status;
    this.responseText = FakeUpload.reply.text;
    this.onload?.();
  }
}

function resetStore() {
  useTilesetStore.setState({
    queue: [],
    offered: null,
    browserFallback: null,
    uploadFraction: null,
    building: null,
    buildError: null,
    tilesets: [],
    listing: false,
    listError: null,
  });
}

function offeredNames(): string[] {
  return useTilesetStore.getState().queue.map((entry) => entry.file.name);
}

describe('an oversize multi-file drop', () => {
  beforeEach(resetStore);

  it('offers every file past the limit, in drop order', async () => {
    const onImport = vi.fn();
    const files = [oversizeFile('a.geojson'), oversizeFile('b.geojson'), oversizeFile('c.geojson')];

    await importFiles(files, onImport);

    expect(onImport).not.toHaveBeenCalled();
    expect(offeredNames()).toEqual(['a.geojson', 'b.geojson', 'c.geojson']);
    expect(useTilesetStore.getState().offered).toBe(files[0]);
  });

  it('gives every offer its own browser fallback', async () => {
    const onImport = vi.fn();
    await importFiles([oversizeFile('a.geojson'), oversizeFile('b.geojson')], vi.fn());

    const queue = useTilesetStore.getState().queue;
    expect(queue.map((entry) => typeof entry.browserFallback)).toEqual(['function', 'function']);

    useTilesetStore.setState({ queue: [], offered: null, browserFallback: null });
    await importFiles([oversizeFile('a.geojson.gz'), oversizeFile('b.geojson')], onImport);
    expect(useTilesetStore.getState().queue.map((entry) => entry.browserFallback === null)).toEqual([
      true,
      false,
    ]);
  });

  it('shows the next file when the head is cancelled', async () => {
    await importFiles(
      [oversizeFile('a.geojson'), oversizeFile('b.geojson'), oversizeFile('c.geojson')],
      vi.fn(),
    );

    useTilesetStore.getState().dismissOffer();
    expect(useTilesetStore.getState().offered?.name).toBe('b.geojson');
    expect(offeredNames()).toEqual(['b.geojson', 'c.geojson']);

    useTilesetStore.getState().dismissOffer();
    expect(useTilesetStore.getState().offered?.name).toBe('c.geojson');

    useTilesetStore.getState().dismissOffer();
    expect(useTilesetStore.getState().offered).toBeNull();
    expect(useTilesetStore.getState().browserFallback).toBeNull();
  });

  it('takes the browser fallback for the head alone and moves on', async () => {
    const onImport = vi.fn();
    await importFiles([oversizeFile('a.geojson'), oversizeFile('b.geojson')], onImport);

    const fallback = useTilesetStore.getState().browserFallback;
    useTilesetStore.getState().dismissOffer();
    fallback?.();

    await vi.waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0]).toBe('a.geojson');
    expect(useTilesetStore.getState().offered?.name).toBe('b.geojson');
  });
});

describe('building through the offer queue', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', FakeUpload);
    useAuthStore.setState({
      loggedIn: true,
      user: { email: 'owner@example.com' },
      token: 'jwt-abc',
      error: null,
    });
    useOgcLayerStore.setState({ layers: [] });
    resetStore();
  });

  it('shows the next file once the head is built', async () => {
    const ready = record({ status: 'ready', built_at: '2026-08-25T10:05:00Z', size_bytes: 42 });
    FakeUpload.reply = { status: 202, text: JSON.stringify({ job_id: ready.id, tileset: record() }) };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ready))
      .mockResolvedValueOnce(jsonResponse([ready]))
      .mockResolvedValueOnce(
        jsonResponse({ tiles: ['/martin/ts-1/{z}/{x}/{y}'], vector_layers: [{ id: 'a' }] }),
      );

    await importFiles([oversizeFile('a.geojson'), oversizeFile('b.geojson')], vi.fn());
    await useTilesetStore.getState().build();

    expect(useTilesetStore.getState().offered?.name).toBe('b.geojson');
    expect(offeredNames()).toEqual(['b.geojson']);
    expect(useTilesetStore.getState().uploadFraction).toBeNull();
    expect(useTilesetStore.getState().buildError).toBeNull();
    expect(useOgcLayerStore.getState().layers[0]).toMatchObject({ type: 'tileset' });
  });

  it('keeps the head with its error when the build failed', async () => {
    const failed = record({ status: 'failed', error: 'tippecanoe: unexpected end of input' });
    FakeUpload.reply = {
      status: 202,
      text: JSON.stringify({ job_id: failed.id, tileset: record() }),
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(failed))
      .mockResolvedValueOnce(jsonResponse([failed]));

    await importFiles([oversizeFile('a.geojson'), oversizeFile('b.geojson')], vi.fn());
    await useTilesetStore.getState().build();

    expect(useTilesetStore.getState().offered?.name).toBe('a.geojson');
    expect(offeredNames()).toEqual(['a.geojson', 'b.geojson']);
    expect(useTilesetStore.getState().buildError).toContain('unexpected end of input');
  });
});

describe('the offer modal', () => {
  beforeEach(resetStore);

  function renderOffer() {
    return render(
      <MantineProvider>
        <TilesetOffer />
      </MantineProvider>,
    );
  }

  it('counts the files still waiting, and stops counting at the last one', async () => {
    await importFiles(
      [oversizeFile('a.geojson'), oversizeFile('b.geojson'), oversizeFile('c.geojson')],
      vi.fn(),
    );

    renderOffer();
    expect(screen.getByTestId('tileset-offer-position')).toHaveTextContent('1 of 3');

    act(() => useTilesetStore.getState().dismissOffer());
    expect(screen.getByTestId('tileset-offer-position')).toHaveTextContent('1 of 2');
    expect(screen.getByText(/b\.geojson/)).toBeInTheDocument();

    act(() => useTilesetStore.getState().dismissOffer());
    expect(screen.queryByTestId('tileset-offer-position')).toBeNull();
    expect(screen.getByText(/c\.geojson/)).toBeInTheDocument();
  });

  it('draws nothing once every offer is answered', async () => {
    await importFiles([oversizeFile('a.geojson')], vi.fn());
    useTilesetStore.getState().dismissOffer();

    renderOffer();
    expect(screen.queryByTestId('tileset-offer')).toBeNull();
  });
});
