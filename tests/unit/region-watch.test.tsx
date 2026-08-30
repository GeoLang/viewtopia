import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useAuthStore } from '../../src/features/auth/store';
import { RegionWatchPanel } from '../../src/components/tools/RegionWatchPanel';
import {
  createWatch,
  deleteWatch,
  listWatchReadings,
  listWatches,
} from '../../src/live/api';
import { useLiveStore } from '../../src/live/liveStore';
import { MAX_READINGS_KEPT, latestReading, useWatchStateStore } from '../../src/live/watchState';
import type { RegionWatch } from '../../src/live/types';
import { useDrawStore } from '../../src/store/draw';

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

const REGION: RegionWatch['region'] = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

function watchNamed(id: string, name: string): RegionWatch {
  return {
    id,
    name,
    layer: 'ndvi',
    region: REGION,
    reducer: 'mean',
    intervalSeconds: 3600,
    thresholdOp: 'lt',
    thresholdValue: 0.4,
    createdBy: 'user-1',
    createdAt: '2026-08-30T09:00:00Z',
    lastRunAt: null,
    lastError: 'geoplumb did not answer',
  };
}

function reading(at: string, value: number, tripped = false) {
  return { type: 'watchReading' as const, watch: 'watch-1', at, value, count: 4096, tripped };
}

describe('the watch store', () => {
  beforeEach(() => {
    useWatchStateStore.getState().clear();
  });

  it('takes its watches from the snapshot frame', () => {
    useWatchStateStore.getState().receive({
      type: 'watches',
      watches: [watchNamed('watch-1', 'reservoir'), watchNamed('watch-2', 'basin')],
    });
    expect(Object.keys(useWatchStateStore.getState().watches)).toEqual(['watch-1', 'watch-2']);
    expect(useWatchStateStore.getState().watches['watch-1'].name).toBe('reservoir');
  });

  it('moves the run time on with each reading and drops the error it answered past', () => {
    const store = useWatchStateStore.getState();
    store.receive({ type: 'watches', watches: [watchNamed('watch-1', 'reservoir')] });
    store.receive(reading('2026-08-30T12:00:00Z', 0.31));

    const watch = useWatchStateStore.getState().watches['watch-1'];
    expect(watch.lastRunAt).toBe('2026-08-30T12:00:00Z');
    expect(watch.lastError).toBeNull();
    expect(latestReading(useWatchStateStore.getState().readings, 'watch-1')).toEqual({
      at: '2026-08-30T12:00:00Z',
      value: 0.31,
      count: 4096,
      tripped: false,
    });
  });

  it('keeps the newest readings and no more than the cap', () => {
    const store = useWatchStateStore.getState();
    store.receive({ type: 'watches', watches: [watchNamed('watch-1', 'reservoir')] });
    for (let index = 0; index < MAX_READINGS_KEPT + 5; index += 1) {
      store.receive(reading(`2026-08-30T12:00:${String(index).padStart(2, '0')}Z`, index));
    }
    const kept = useWatchStateStore.getState().readings['watch-1'];
    expect(kept).toHaveLength(MAX_READINGS_KEPT);
    expect(kept[0].value).toBe(MAX_READINGS_KEPT + 4);
    expect(kept.at(-1)?.value).toBe(5);
  });

  it('carries the trip flag of the run that crossed the threshold', () => {
    const store = useWatchStateStore.getState();
    store.receive({ type: 'watches', watches: [watchNamed('watch-1', 'reservoir')] });
    store.receive(reading('2026-08-30T12:00:00Z', 0.5));
    expect(latestReading(useWatchStateStore.getState().readings, 'watch-1')?.tripped).toBe(false);
    store.receive(reading('2026-08-30T13:00:00Z', 0.31, true));
    expect(latestReading(useWatchStateStore.getState().readings, 'watch-1')?.tripped).toBe(true);
  });

  it('clears everything when the session leaves the document', () => {
    const store = useWatchStateStore.getState();
    store.receive({ type: 'watches', watches: [watchNamed('watch-1', 'reservoir')] });
    store.receive(reading('2026-08-30T12:00:00Z', 0.31));
    store.clear();
    expect(useWatchStateStore.getState().watches).toEqual({});
    expect(useWatchStateStore.getState().readings).toEqual({});
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('the watches api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function lastRequest(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init };
  }

  beforeEach(() => {
    useAuthStore.setState({ token: 'jwt-token' });
    fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
    vi.unstubAllGlobals();
  });

  it('lists the document watches under the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([watchNamed('watch-1', 'reservoir')]));
    const listed = await listWatches('doc-1');
    expect(listed[0].name).toBe('reservoir');
    const { url, init } = lastRequest();
    expect(url).toBe('/agora/documents/doc-1/watches');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('posts a new watch with the fields agora names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(watchNamed('watch-1', 'reservoir'), 201));
    await createWatch('doc-1', {
      name: 'reservoir',
      layer: 'ndvi',
      region: REGION,
      reducer: 'mean',
      intervalSeconds: 3600,
      thresholdOp: 'lt',
      thresholdValue: 0.4,
      webhookUrl: 'https://hooks.example.test/basin',
      webhookSecret: 'shhh',
    });
    const { url, init } = lastRequest();
    expect(url).toBe('/agora/documents/doc-1/watches');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        name: 'reservoir',
        layer: 'ndvi',
        region: REGION,
        reducer: 'mean',
        intervalSeconds: 3600,
        thresholdOp: 'lt',
        thresholdValue: 0.4,
        webhookUrl: 'https://hooks.example.test/basin',
        webhookSecret: 'shhh',
      }),
    );
  });

  it('deletes one watch of the document', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteWatch('doc-1', 'watch-1');
    const { url, init } = lastRequest();
    expect(url).toBe('/agora/documents/doc-1/watches/watch-1');
    expect(init.method).toBe('DELETE');
  });

  it('asks for the readings after a moment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ at: '2026-08-30T12:00:00Z', value: 0.31, count: 4096 }]),
    );
    const entries = await listWatchReadings('doc-1', 'watch-1', '2026-08-29T12:00:00Z');
    expect(entries).toHaveLength(1);
    expect(lastRequest().url).toBe(
      '/agora/documents/doc-1/watches/watch-1/readings?since=2026-08-29T12%3A00%3A00Z',
    );
  });
});

const LAYERS = [
  { name: 'ndvi', source: 'stac', collection: 'sentinel-2', default_datetime: null },
  { name: 'hillshade', source: 'cog', collection: null, default_datetime: null },
];

function renderPanel() {
  render(
    <MantineProvider>
      <RegionWatchPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

/** Mantine selects are comboboxes: open the input, then click the option. */
function pick(select: string, option: string) {
  fireEvent.click(screen.getByRole('textbox', { name: select }));
  fireEvent.click(within(screen.getByRole('listbox', { name: select })).getByText(option));
}

function drawPolygon() {
  useDrawStore.setState({
    features: [
      {
        id: 'drawn-1',
        type: 'Polygon',
        coords: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        color: '#a78bfa',
        lineWidth: 2,
      },
    ],
  });
}

describe('the region watch panel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let created: unknown;

  beforeEach(() => {
    useAuthStore.setState({ token: 'jwt-token' });
    useWatchStateStore.getState().clear();
    useDrawStore.setState({ features: [] });
    useLiveStore.setState({ documentId: null, role: 'edit', guest: false });
    created = null;
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/plumb/layers') return jsonResponse(LAYERS);
      if (url === '/agora/documents/doc-1/watches' && init?.method === 'POST') {
        created = JSON.parse(String(init.body));
        return jsonResponse(watchNamed('watch-1', 'reservoir'), 201);
      }
      if (url === '/agora/documents/doc-1/watches') {
        return jsonResponse(created ? [watchNamed('watch-1', 'reservoir')] : []);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ token: null });
    useLiveStore.setState({ documentId: null, role: 'edit', guest: false });
    vi.unstubAllGlobals();
  });

  it('says there is no live map and offers no form', async () => {
    await act(async () => {
      renderPanel();
    });
    expect(screen.getByTestId('watch-empty')).toHaveTextContent(
      'No live map, so nothing is being watched.',
    );
    expect(screen.getByTestId('watch-blocked')).toHaveTextContent(
      'Start or join a live map before adding a watch.',
    );
    expect(screen.queryByTestId('watch-form')).toBeNull();
  });

  it('asks for a polygon when the live map has none drawn', async () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'edit', guest: false });
    await act(async () => {
      renderPanel();
    });
    expect(screen.getByTestId('watch-empty')).toHaveTextContent('No watches on this map yet.');
    expect(screen.getByTestId('watch-blocked')).toHaveTextContent(
      'Draw a polygon with the Draw tool to give the watch a region.',
    );
  });

  it('tells a view-role member that only an editor adds a watch', async () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'view', guest: false });
    drawPolygon();
    await act(async () => {
      renderPanel();
    });
    expect(screen.getByTestId('watch-blocked')).toHaveTextContent(
      'Only an editor of this map can add a watch.',
    );
  });

  it('creates a watch over the drawn polygon and lists what came back', async () => {
    useLiveStore.setState({ documentId: 'doc-1', role: 'edit', guest: false });
    drawPolygon();
    await act(async () => {
      renderPanel();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'reservoir' },
    });
    pick('Layer', 'ndvi');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Watch this region' }));
    });

    expect(created).toEqual({
      name: 'reservoir',
      layer: 'ndvi',
      region: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      reducer: 'mean',
      intervalSeconds: 3600,
    });
    expect(screen.getByTestId('watch-row-watch-1')).toHaveTextContent('reservoir');
    expect(screen.getByTestId('watch-last-error-watch-1')).toHaveTextContent(
      'geoplumb did not answer',
    );
  });
});
