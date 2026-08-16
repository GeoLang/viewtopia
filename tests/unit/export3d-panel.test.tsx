import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { Export3DPanel } from '../../src/components/tools/Export3DPanel';
import { useAuthStore } from '../../src/features/auth/store';

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

const POLL_MS = 3000;
const JOB_ID = 'job-7f3a';

const READY_ASSET = {
  id: 'a1b2',
  name: 'quarry.las',
  asset_type: 'pointcloud',
  status: 'ready',
  size_bytes: 5_400_000,
};

const TILING_ASSET = { ...READY_ASSET, id: 'c3d4', name: 'busy.las', status: 'tiling' };

const FORMATS = {
  formats: [
    { id: 'geojson', name: 'GeoJSON', extension: '.geojson' },
    { id: 'obj', name: 'OBJ Mesh', extension: '.obj' },
  ],
};

const fetchMock = vi.fn();

function jsonOk(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** answer each url in turn, newest registration wins */
function respond(handler: (url: string, init?: RequestInit) => unknown) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => handler(url, init));
}

/** the load pair the panel fires on mount, plus whatever the case adds */
function respondDefault(extra: (url: string, init?: RequestInit) => unknown = () => null) {
  respond((url, init) => {
    if (url === '/tiles/v1/assets') return jsonOk([READY_ASSET, TILING_ASSET]);
    if (url === '/tiles/v1/exports/formats') return jsonOk(FORMATS);
    return extra(url, init) ?? jsonOk(null, 404);
  });
}

const renderPanel = async () => {
  const utils = render(
    <MantineProvider>
      <Export3DPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  return utils;
};

async function startExport() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start export' }));
  });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  globalThis.fetch = fetchMock as never;
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  respondDefault();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Export3DPanel', () => {
  it('asks for a sign-in and never calls the api when signed out', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });
    await renderPanel();

    expect(screen.getByTestId('export3d-signin')).toHaveTextContent('Sign in to export an asset.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start export' })).toBeNull();
  });

  it('offers the tiled assets and the formats the server advertises', async () => {
    await renderPanel();

    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/assets', {
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/exports/formats', {
      headers: { Authorization: 'Bearer jwt-token' },
    });

    // the ready asset is preselected and the one still tiling is not offered
    const assetInput = screen.getByRole('textbox', { name: 'Asset' });
    expect(assetInput).toHaveValue('quarry.las');
    await act(async () => {
      fireEvent.click(assetInput);
    });
    expect(screen.getByRole('option', { name: 'quarry.las' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'busy.las' })).toBeNull();

    const formatInput = screen.getByRole('textbox', { name: 'Format' });
    expect(formatInput).toHaveValue('GeoJSON');
    await act(async () => {
      fireEvent.click(formatInput);
    });
    expect(screen.getByRole('option', { name: 'OBJ Mesh' })).toBeInTheDocument();
  });

  it('posts the export and polls the job until it is ready', async () => {
    respondDefault((url, init) =>
      url === '/tiles/v1/exports' && init?.method === 'POST'
        ? jsonOk({ id: JOB_ID, status: 'Queued' }, 202)
        : null,
    );
    await renderPanel();
    await startExport();

    expect(fetchMock).toHaveBeenCalledWith('/tiles/v1/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-token' },
      body: JSON.stringify({ asset_id: 'a1b2', format: 'geojson' }),
    });
    expect(screen.getByTestId(`export3d-job-${JOB_ID}`)).toHaveTextContent('queued');

    respondDefault((url) =>
      url === `/tiles/v1/exports/${JOB_ID}` ? jsonOk({ id: JOB_ID, status: 'Processing' }) : null,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith(`/tiles/v1/exports/${JOB_ID}`, {
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(screen.getByTestId(`export3d-job-${JOB_ID}`)).toHaveTextContent('encoding');

    respondDefault((url) =>
      url === `/tiles/v1/exports/${JOB_ID}` ? jsonOk({ id: JOB_ID, status: 'Ready' }) : null,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId(`export3d-job-${JOB_ID}`)).toHaveTextContent('ready');

    // a settled job stops the poll
    const afterDone = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(afterDone);
  });

  it('links a finished export to its download route', async () => {
    respondDefault((url, init) =>
      url === '/tiles/v1/exports' && init?.method === 'POST'
        ? jsonOk({ id: JOB_ID, status: 'Ready' }, 202)
        : null,
    );
    await renderPanel();
    await startExport();

    const link = screen.getByRole('link', { name: /Download/ });
    expect(link).toHaveAttribute('href', `/tiles/v1/exports/download/${JOB_ID}`);
  });

  it('surfaces a failed job with the server reason', async () => {
    respondDefault((url, init) =>
      url === '/tiles/v1/exports' && init?.method === 'POST'
        ? jsonOk({ id: JOB_ID, status: { Failed: 'no input point cloud on disk' } }, 202)
        : null,
    );
    await renderPanel();
    await startExport();

    expect(screen.getByTestId(`export3d-job-${JOB_ID}`)).toHaveTextContent(
      'no input point cloud on disk',
    );
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
  });

  it('explains a refusal from an account without edit access', async () => {
    respondDefault((url, init) =>
      url === '/tiles/v1/exports' && init?.method === 'POST' ? jsonOk(null, 403) : null,
    );
    await renderPanel();
    await startExport();

    expect(screen.getByTestId('export3d-error')).toHaveTextContent(
      'Your account cannot start exports. Ask for edit access.',
    );
  });

  it('reports an unreachable export service', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await renderPanel();

    expect(screen.getByTestId('export3d-error')).toHaveTextContent(
      'The export service is unreachable.',
    );
  });
});
