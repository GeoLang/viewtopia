import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';
import { useOgcLayerStore } from '../../src/store/ogcLayers';
import { useTilesetStore } from '../../src/features/tilesets/store';
import {
  BROWSER_IMPORT_LIMIT_BYTES,
  isMartinUrl,
  martinRequest,
  pollUntilBuilt,
  tilesetFormat,
  readTileset,
  tooLargeForBrowser,
  uploadTileset,
  type Tileset,
} from '../../src/features/tilesets/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function record(overrides: Partial<Tileset> = {}): Tileset {
  return {
    id: 'ts-1',
    name: 'counties.geojson',
    status: 'building',
    source_id: 'ts-1',
    object_key: 'ts-1.pmtiles',
    original_filename: 'counties.geojson',
    layer_name: 'counties',
    argv: ['tippecanoe'],
    size_bytes: 0,
    created_at: '2026-08-23T10:00:00Z',
    built_at: null,
    error: null,
    ...overrides,
  };
}

function fileOfSize(name: string, bytes: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

/** Enough of XMLHttpRequest for the upload: one progress event and one reply. */
class FakeUpload {
  static last: FakeUpload;
  /** What send() answers with, scripted before the call under test. */
  static reply = { status: 202, text: '' };
  status = 0;
  responseText = '';
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;

  constructor() {
    FakeUpload.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    this.status = FakeUpload.reply.status;
    this.responseText = FakeUpload.reply.text;
    this.onload?.();
  }
}

const noWait = () => Promise.resolve();

describe('tileset eligibility', () => {
  it('recognises the formats tippecanoe reads, longest extension first', () => {
    expect(tilesetFormat('counties.geojson.gz')).toBe('.geojson.gz');
    expect(tilesetFormat('COUNTIES.GeoJSON')).toBe('.geojson');
    expect(tilesetFormat('roads.fgb')).toBe('.fgb');
    expect(tilesetFormat('points.csv')).toBe('.csv');
    expect(tilesetFormat('scan.shp')).toBeNull();
  });

  it('sends a file past the browser limit to the server and keeps smaller ones', () => {
    expect(tooLargeForBrowser(fileOfSize('a.geojson', BROWSER_IMPORT_LIMIT_BYTES + 1))).toBe(true);
    expect(tooLargeForBrowser(fileOfSize('a.geojson', BROWSER_IMPORT_LIMIT_BYTES))).toBe(false);
  });

  it('marks only the martin routes as needing the bearer', () => {
    expect(isMartinUrl('/martin/ts-1/3/4/5')).toBe(true);
    expect(isMartinUrl('https://viewer.example/martin/ts-1')).toBe(true);
    expect(isMartinUrl('/tiles/v1/terrain/rgb/3/4/5.png')).toBe(false);
  });

  it('gives a martin tile request an absolute url and the bearer, others neither', () => {
    useAuthStore.setState({
      loggedIn: true,
      user: { email: 'owner@example.com' },
      token: 'jwt-abc',
      error: null,
    });

    // a request carrying headers is issued as fetch(new Request(url)) from a
    // worker, which throws on a root-relative url
    expect(martinRequest('/martin/ts-1/3/4/5')).toEqual({
      url: `${window.location.origin}/martin/ts-1/3/4/5`,
      headers: { Authorization: 'Bearer jwt-abc' },
    });
    expect(martinRequest('https://tiles.example/basemap/3/4/5.png')).toEqual({
      url: 'https://tiles.example/basemap/3/4/5.png',
    });
  });
});

describe('tileset upload and poll', () => {
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
    useTilesetStore.setState({
      offered: null,
      browserFallback: null,
      uploadFraction: null,
      building: null,
      buildError: null,
      tilesets: [],
      listing: false,
      listError: null,
    });
  });

  it('uploads with the bearer, reports progress, and returns the queued row', async () => {
    const queued = record();
    FakeUpload.reply = { status: 202, text: JSON.stringify({ job_id: queued.id, tileset: queued }) };

    const seen: number[] = [];
    await expect(
      uploadTileset(fileOfSize('counties.geojson', 10), (fraction) => seen.push(fraction)),
    ).resolves.toEqual(queued);

    expect(seen).toEqual([0.5]);
    expect(FakeUpload.last.method).toBe('POST');
    expect(FakeUpload.last.url).toBe('/tiles/v1/tilesets');
    expect(FakeUpload.last.headers.Authorization).toBe('Bearer jwt-abc');
    expect(FakeUpload.last.body?.get('name')).toBe('counties.geojson');
  });

  it('rejects an upload the server refused, with what it said', async () => {
    FakeUpload.reply = { status: 400, text: 'notes.txt: a tileset is built from .geojson' };
    await expect(uploadTileset(fileOfSize('notes.txt', 10), () => {})).rejects.toThrow(
      'a tileset is built from .geojson',
    );
  });

  it('polls until the build leaves building and reports every step', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(record()))
      .mockResolvedValueOnce(jsonResponse(record()))
      .mockResolvedValueOnce(
        jsonResponse(record({ status: 'ready', built_at: '2026-08-23T10:05:00Z', size_bytes: 42 })),
      );

    const steps: string[] = [];
    const built = await pollUntilBuilt('ts-1', (t) => steps.push(t.status), noWait);

    expect(steps).toEqual(['building', 'building', 'ready']);
    expect(built.built_at).toBe('2026-08-23T10:05:00Z');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/tiles/v1/tilesets/ts-1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('stops on a failed build and keeps the stderr tail', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(record({ status: 'failed', error: 'tippecanoe: unexpected end of input' })),
    );
    const built = await pollUntilBuilt('ts-1', () => {}, noWait);
    expect(built.status).toBe('failed');
    expect(built.error).toContain('unexpected end of input');
  });

  it('takes the tile url, the layer names and the zoom bounds from the TileJSON', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        tiles: ['/martin/ts-1/{z}/{x}/{y}'],
        vector_layers: [{ id: 'counties' }, { id: 'labels' }],
        minzoom: 0,
        maxzoom: 9,
      }),
    );
    await expect(readTileset(record({ status: 'ready' }))).resolves.toEqual({
      url: '/martin/ts-1/{z}/{x}/{y}',
      source: { id: 'ts-1', layers: ['counties', 'labels'], minZoom: 0, maxZoom: 9 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/martin/ts-1');
  });

  it('falls back to the archive layer name when the TileJSON names none', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tiles: ['/martin/ts-1/{z}/{x}/{y}'] }));
    await expect(readTileset(record({ status: 'ready' }))).resolves.toMatchObject({
      source: { layers: ['counties'] },
    });
  });

  it('refuses a TileJSON that names no tile url', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tiles: [] }));
    await expect(readTileset(record({ status: 'ready' }))).rejects.toThrow('serves no tile url');
  });
});

describe('tileset store', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({
      loggedIn: true,
      user: { email: 'owner@example.com' },
      token: 'jwt-abc',
      error: null,
    });
    useOgcLayerStore.setState({ layers: [] });
    useTilesetStore.setState({
      offered: null,
      browserFallback: null,
      uploadFraction: null,
      building: null,
      buildError: null,
      tilesets: [],
      listing: false,
      listError: null,
    });
  });

  it('adds a ready archive as a vector tile layer pointing at its martin source', async () => {
    const ready = record({ status: 'ready', built_at: '2026-08-23T10:05:00Z', size_bytes: 42 });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        tiles: ['/martin/ts-1/{z}/{x}/{y}'],
        vector_layers: [{ id: 'counties' }],
        maxzoom: 9,
      }),
    );

    await useTilesetStore.getState().addLayer(ready);

    const layers = useOgcLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({
      type: 'tileset',
      url: '/martin/ts-1/{z}/{x}/{y}',
      tileset: { id: 'ts-1', layers: ['counties'], maxZoom: 9 },
    });
  });

  it('refuses to draw an archive that is still building', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(record()));
    await expect(useTilesetStore.getState().addLayer(record())).rejects.toThrow('is building');
    expect(useOgcLayerStore.getState().layers).toHaveLength(0);
  });

  it('takes the layer off the map when the archive is deleted', async () => {
    const ready = record({ status: 'ready', built_at: '2026-08-23T10:05:00Z' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tiles: ['/martin/ts-1/{z}/{x}/{y}'], vector_layers: [{ id: 'counties' }] }),
    );
    await useTilesetStore.getState().addLayer(ready);
    useTilesetStore.setState({ tilesets: [ready] });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await useTilesetStore.getState().remove('ts-1');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/tiles/v1/tilesets/ts-1');
    expect(init.method).toBe('DELETE');
    expect(useOgcLayerStore.getState().layers).toHaveLength(0);
    expect(useTilesetStore.getState().tilesets).toHaveLength(0);
  });

  it('lists the archives the server holds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([record({ status: 'ready' })]));
    await useTilesetStore.getState().refresh();
    expect(useTilesetStore.getState().tilesets).toHaveLength(1);
    expect(useTilesetStore.getState().listError).toBeNull();
  });

  it('keeps the reason a listing failed', async () => {
    fetchMock.mockResolvedValueOnce(new Response('tiletopia is down', { status: 502 }));
    await useTilesetStore.getState().refresh();
    expect(useTilesetStore.getState().listError).toBe('tiletopia is down');
  });

  it('uploads, waits out the build, and draws what came back', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeUpload);
    const queued = record();
    const ready = record({ status: 'ready', built_at: '2026-08-23T10:05:00Z', size_bytes: 42 });
    FakeUpload.reply = { status: 202, text: JSON.stringify({ job_id: queued.id, tileset: queued }) };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ready))
      .mockResolvedValueOnce(jsonResponse([ready]))
      .mockResolvedValueOnce(
        jsonResponse({ tiles: ['/martin/ts-1/{z}/{x}/{y}'], vector_layers: [{ id: 'counties' }] }),
      );

    useTilesetStore.getState().offer(fileOfSize('counties.geojson', 60 * 1024 * 1024));
    await useTilesetStore.getState().build();

    expect(useTilesetStore.getState().offered).toBeNull();
    expect(useTilesetStore.getState().buildError).toBeNull();
    expect(useTilesetStore.getState().tilesets).toHaveLength(1);
    expect(useOgcLayerStore.getState().layers[0]).toMatchObject({ type: 'tileset' });
  });

  it('shows the stderr tail and draws nothing when the build failed', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeUpload);
    const queued = record();
    const failed = record({ status: 'failed', error: 'tippecanoe: unexpected end of input' });
    FakeUpload.reply = { status: 202, text: JSON.stringify({ job_id: queued.id, tileset: queued }) };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(failed))
      .mockResolvedValueOnce(jsonResponse([failed]));

    useTilesetStore.getState().offer(fileOfSize('counties.geojson', 60 * 1024 * 1024));
    await useTilesetStore.getState().build();

    expect(useTilesetStore.getState().buildError).toContain('unexpected end of input');
    expect(useOgcLayerStore.getState().layers).toHaveLength(0);
  });
});
