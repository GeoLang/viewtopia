import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// only the asset API plumbing is under test, so the WebGL bundle stays out
vi.mock('cesium', () => ({
  Cesium3DTileset: { fromUrl: vi.fn(async (url: string) => ({ tileset: url })) },
}));

vi.mock('../../src/viewer/registry', () => ({
  getActiveCesiumViewer: vi.fn(() => null),
  getActiveMapLibre: vi.fn(() => null),
  getActiveDeck: vi.fn(() => null),
}));

import { AssetsPanel } from '../../src/components/tools/AssetsPanel';
import { getActiveCesiumViewer } from '../../src/viewer/registry';
import { useAppStore } from '../../src/store/app';
import { useAuthStore } from '../../src/features/auth/store';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';

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

const POLL_MS = 3000;

interface ServerAsset {
  id: string;
  name: string;
  asset_type: string;
  status: string;
  size_bytes: number;
}

const READY: ServerAsset = {
  id: 'a1b2',
  name: 'quarry.las',
  asset_type: 'pointcloud',
  status: 'ready',
  size_bytes: 5_400_000,
};

class FakeXHR {
  static last: FakeXHR | null = null;
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 201;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: FormData) {
    this.body = body;
    FakeXHR.last = this;
  }
}

const fetchMock = vi.fn();

function jsonOk(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** answer each url pattern in turn, newest registration wins */
function respond(handler: (url: string, init?: RequestInit) => unknown) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => handler(url, init));
}

function fakeViewer() {
  return {
    scene: { primitives: { add: vi.fn() } },
    flyTo: vi.fn(async () => {}),
    isDestroyed: () => false,
  };
}

const renderPanel = async () => {
  const utils = render(
    <MantineProvider>
      <AssetsPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return utils;
};

/** Mantine puts the progressbar role on a section inside the bar, not its root. */
function tilingPercent() {
  const bar = within(screen.getByTestId('assets-tiling-a1b2')).getByRole('progressbar');
  return bar.getAttribute('aria-valuenow');
}

function selectFile(name: string) {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input rendered');
  fireEvent.change(input, { target: { files: [new File(['point-bytes'], name)] } });
  return input;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  FakeXHR.last = null;
  globalThis.XMLHttpRequest = FakeXHR as never;
  globalThis.fetch = fetchMock as never;
  vi.mocked(getActiveCesiumViewer).mockReturnValue(null as never);
  useAppStore.setState({ renderer: 'cesium' });
  useTiles3dLayerStore.setState({ layers: [], loaded: {} });
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  respond(() => jsonOk([]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AssetsPanel', () => {
  it('asks for a sign-in and never calls the api when signed out', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });
    await renderPanel();

    expect(screen.getByTestId('assets-signin')).toHaveTextContent(
      'Sign in to browse and upload assets.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('lists assets from the api with the bearer token', async () => {
    respond(() => jsonOk([READY]));
    await renderPanel();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/tiles/v1/assets');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer jwt-token' });

    const row = screen.getByTestId('assets-row-a1b2');
    expect(row).toHaveTextContent('quarry.las');
    expect(row).toHaveTextContent('pointcloud');
    expect(row).toHaveTextContent('ready');
    expect(row).toHaveTextContent('5.4 MB');
  });

  it('posts the upload as multipart and polls the new asset until it is ready', async () => {
    await renderPanel();
    selectFile('cloud.las');

    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/tiles/v1/assets');
    expect(xhr.headers.Authorization).toBe('Bearer jwt-token');
    expect(xhr.body?.get('name')).toBe('cloud.las');
    expect(xhr.body?.get('file')).toBeInstanceOf(File);

    act(() => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    });
    expect(screen.getByTestId('assets-upload-progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    const tiling = { ...READY, name: 'cloud.las', status: 'tiling' };
    respond((url) => (url === '/tiles/v1/assets/a1b2' ? jsonOk(tiling) : jsonOk([])));
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify(tiling);
      xhr.onload?.();
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('tiling');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/assets/a1b2', {
      headers: { Authorization: 'Bearer jwt-token' },
    });

    respond(() => jsonOk({ ...READY, name: 'cloud.las' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('ready');

    // terminal status stops the poll
    const afterDone = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(afterDone);
  });

  it('shows tiling progress from the job the upload named, and stops when it is ready', async () => {
    await renderPanel();
    selectFile('cloud.las');
    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');

    const tiling = { ...READY, name: 'cloud.las', status: 'tiling' };
    respond((url) => {
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/jobs/job-7') return jsonOk({ status: 'running', progress: 0.42 });
      return jsonOk([]);
    });
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify({ ...tiling, job_id: 'job-7' });
      xhr.onload?.();
    });
    // nothing to show before the first poll: the upload response has no progress
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/jobs/job-7', {
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(tilingPercent()).toBe('42');

    // the asset endpoint knows nothing of the job, so its next answer must not
    // wipe the progress already read
    respond((url) => {
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/jobs/job-7') return jsonOk({ status: 'running', progress: 0.8 });
      return jsonOk([]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(tilingPercent()).toBe('80');

    respond(() => jsonOk({ ...READY, name: 'cloud.las' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId('assets-row-a1b2')).toHaveTextContent('ready');
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();

    const afterDone = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(afterDone);
  });

  it('finds the job of an asset it only listed, and shows its progress', async () => {
    const tiling = { ...READY, status: 'tiling' };
    respond((url) => {
      if (url === '/tiles/v1/assets') return jsonOk([tiling]);
      if (url === '/tiles/v1/assets/a1b2') return jsonOk(tiling);
      if (url === '/tiles/v1/assets/a1b2/jobs') return jsonOk([{ id: 'job-9', progress: 0.25 }]);
      if (url === '/tiles/v1/jobs/job-9') return jsonOk({ status: 'running', progress: 0.25 });
      return jsonOk([]);
    });
    await renderPanel();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(tilingPercent()).toBe('25');

    // the job is looked up once, not on every tick
    const lookups = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/tiles/v1/assets/a1b2/jobs').length;
    expect(lookups()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(lookups()).toBe(1);
  });

  it('polls an upload with no tiling job for status alone', async () => {
    await renderPanel();
    selectFile('city.glb');
    const xhr = FakeXHR.last;
    if (!xhr) throw new Error('no upload started');

    const tiling = { ...READY, name: 'city.glb', status: 'tiling' };
    respond((url) => (url === '/tiles/v1/assets/a1b2' ? jsonOk(tiling) : jsonOk([])));
    await act(async () => {
      xhr.status = 201;
      xhr.responseText = JSON.stringify(tiling);
      xhr.onload?.();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.queryByTestId('assets-tiling-a1b2')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain('/tiles/v1/jobs/null');
  });

  it('adds a tiled asset as a layer, and flies to it once it is drawn', async () => {
    const viewer = fakeViewer();
    vi.mocked(getActiveCesiumViewer).mockReturnValue(viewer as never);
    respond(() => jsonOk([READY]));
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add quarry.las to globe' }));
    });

    expect(useTiles3dLayerStore.getState().layers).toEqual([
      {
        id: 'a1b2',
        name: 'quarry.las',
        url: '/tiles/v1/assets/a1b2/tileset.json',
        visible: true,
      },
    ]);
    // the button says the layer is there, whether or not the tiles have loaded
    expect(screen.getByRole('button', { name: 'Add quarry.las to globe' })).toBeDisabled();
    expect(viewer.flyTo).not.toHaveBeenCalled();

    const tileset = { boundingSphere: 'sphere' };
    await act(async () => {
      useTiles3dLayerStore.getState().setLoaded('a1b2', tileset as never);
    });
    expect(viewer.flyTo).toHaveBeenCalledWith(tileset);
  });

  it('deletes only after the confirmation step', async () => {
    respond(() => jsonOk([READY]));
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete quarry.las' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respond(() => jsonOk(null, 204));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/tiles/v1/assets/a1b2', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(screen.queryByTestId('assets-row-a1b2')).toBeNull();
  });

  it('reports an unreachable asset service', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await renderPanel();

    expect(screen.getByTestId('assets-error')).toHaveTextContent(
      'The asset service is unreachable.',
    );
  });
});
