import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/live';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument } from '../../src/live/types';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useDrawStore } from '../../src/store/draw';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const DOCUMENTS = [
  { id: 'doc-1', name: 'Coastline' },
  { id: 'doc-2', name: 'Coastline north' },
  { id: 'doc-3', name: 'Campus twin' },
];

const FEEDS = [
  { id: 'f-1', name: 'pumps', intervalSeconds: 10, createdBy: 'ada', createdAt: '2026-08-01' },
  { id: 'f-2', name: 'gates', intervalSeconds: 30, createdBy: 'ada', createdAt: '2026-08-01' },
];

/** What agora answers a create with, which is what the action reads its text from. */
const CREATED_WATCH = {
  id: 'w-1',
  name: 'ndvi drop',
  layer: 'ndvi_2026',
  reducer: 'mean',
  intervalSeconds: 900,
  thresholdOp: 'lt',
  thresholdValue: 0.3,
  region: { type: 'Polygon', coordinates: [] },
  createdBy: 'ada',
  createdAt: '2026-08-31',
  lastRunAt: null,
  lastError: null,
};

/** A square drawn with the Draw tool, its ring left open the way the tool leaves it. */
const DRAWN_SQUARE = {
  id: 'draw-1',
  type: 'Polygon' as const,
  coords: [
    [20, 10],
    [21, 10],
    [21, 11],
    [20, 11],
  ] as [number, number][],
  color: '#ffffff',
  lineWidth: 2,
};

function watchBody(): unknown {
  const [init] = requestsTo('/agora/documents/doc-1/watches');
  return JSON.parse(String(init.body));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let server: FakeAgoraServer;

function requestsTo(url: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => init as RequestInit);
}

/** the session is in doc-1 as an editor, which is what the writes below need */
function joined(): void {
  useLiveStore.setState({ documentId: 'doc-1', role: 'edit', document: emptyLiveDocument() });
}

describe('live actions', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'jwt-token' });
    useLiveStore.setState({ documentId: null, role: 'edit', document: emptyLiveDocument() });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
    useTiles3dLayerStore.setState({ layers: [], loaded: {} });
    useDrawStore.setState({ features: [] });
    server = new FakeAgoraServer();
    server.install();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    vi.unstubAllGlobals();
  });

  it('lists the documents agora offers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    const result = await runAction('live.list', {});
    expect(result.text).toBe('3 live maps: Coastline, Coastline north, Campus twin.');
  });

  it('shows an id only when two documents share a name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([...DOCUMENTS, { id: 'doc-4', name: 'Coastline' }]),
    );
    const result = await runAction('live.list', {});
    expect(result.text).toBe(
      '4 live maps: Coastline (doc-1), Coastline north, Campus twin, Coastline (doc-4).',
    );
  });

  it('joins the document a partial name names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    const result = await runAction('live.join', { map: 'campus' });

    expect(useLiveStore.getState().documentId).toBe('doc-3');
    expect(server.connection.documentParameter).toBe('doc-3');
    expect(result.text).toBe('Joined Campus twin.');
  });

  it('refuses a name two documents carry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await expect(runAction('live.join', { map: 'coastline' })).rejects.toThrow(ActionError);
    expect(useLiveStore.getState().documentId).toBeNull();
  });

  it('says a session with no sign in cannot join', async () => {
    useAuthStore.setState({ token: null });
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await expect(runAction('live.join', { map: 'doc-3' })).rejects.toThrow('has no sign in');
  });

  it('leaves the document it is in, and says so when it is in none', async () => {
    await expect(runAction('live.leave', {})).rejects.toThrow('not joined to a live map');

    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await runAction('live.join', { map: 'doc-1' });
    await runAction('live.leave', {});
    expect(useLiveStore.getState().documentId).toBeNull();
  });

  it('creates a feed and hands back the token agora shows once', async () => {
    joined();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'f-3', name: 'pumps', intervalSeconds: 15, token: 'feed-token' }),
    );

    const result = await runAction('live.create_feed', { name: 'pumps', interval_seconds: 15 });

    const [init] = requestsTo('/agora/documents/doc-1/feeds');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'pumps', intervalSeconds: 15 }));
    expect(result.text).toContain('feed-token');
  });

  it('refuses a feed with no name', async () => {
    joined();
    await expect(runAction('live.create_feed', { name: '  ', interval_seconds: 15 })).rejects.toThrow(
      'a feed needs a name',
    );
  });

  it('deletes the feed a name names', async () => {
    joined();
    fetchMock.mockResolvedValueOnce(jsonResponse(FEEDS));
    const result = await runAction('live.remove_feed', { feed: 'gates' });

    expect(requestsTo('/agora/documents/doc-1/feeds/f-2')[0].method).toBe('DELETE');
    expect(result.text).toBe('Feed gates is gone.');
  });

  it('writes the asset rule into the document', async () => {
    joined();
    useAgentLayerStore.setState({
      layers: [{ id: 'agent-sensors', name: 'Sensors', geojson: { type: 'FeatureCollection', features: [] } }],
    });

    const result = await runAction('live.set_asset_rule', {
      layer: 'sensors',
      kind: 'temperature',
      breakpoints: '0:#2ecc71, 25:#f1c40f, 30:#e74c3c',
    });

    expect(useLiveStore.getState().document.assets.rule).toEqual({
      layerId: 'agent-sensors',
      kind: 'temperature',
      breakpoints: [
        { value: 0, color: '#2ecc71' },
        { value: 25, color: '#f1c40f' },
        { value: 30, color: '#e74c3c' },
      ],
      defaultColor: '#95a5a6',
      offlineColor: '#7f8c8d',
    });
    expect(result.text).toContain('3 breakpoints');
  });

  it('refuses breakpoints it can read no pair from', async () => {
    joined();
    useAgentLayerStore.setState({
      layers: [{ id: 'agent-sensors', name: 'Sensors', geojson: { type: 'FeatureCollection', features: [] } }],
    });
    await expect(
      runAction('live.set_asset_rule', { layer: 'sensors', kind: 'temperature', breakpoints: 'warm' }),
    ).rejects.toThrow('no value and colour pair');
  });

  it('refuses an asset rule when this session is not in a document', async () => {
    await expect(
      runAction('live.set_asset_rule', { layer: 'x', kind: 'temperature', breakpoints: '0:#fff' }),
    ).rejects.toThrow('not joined to a live map');
  });

  it('registers the watch a bbox and a threshold ask for', async () => {
    joined();
    // a polygon is on the map too, and the bbox given is the one that counts
    useDrawStore.setState({ features: [DRAWN_SQUARE] });
    fetchMock.mockResolvedValueOnce(jsonResponse(CREATED_WATCH));

    const result = await runAction('live.watch_region', {
      layer: 'ndvi_2026',
      reducer: 'mean',
      interval_seconds: 900,
      name: 'ndvi drop',
      bbox: [10, 40, 11, 41],
      threshold_op: 'lt',
      threshold_value: 0.3,
    });

    const [init] = requestsTo('/agora/documents/doc-1/watches');
    expect(init.method).toBe('POST');
    expect(watchBody()).toEqual({
      name: 'ndvi drop',
      layer: 'ndvi_2026',
      region: {
        type: 'Polygon',
        coordinates: [
          [
            [10, 40],
            [11, 40],
            [11, 41],
            [10, 41],
            [10, 40],
          ],
        ],
      },
      reducer: 'mean',
      intervalSeconds: 900,
      thresholdOp: 'lt',
      thresholdValue: 0.3,
    });
    expect(result.text).toBe(
      'ndvi drop reads the mean of ndvi_2026 every 900s, alerting below 0.3.',
    );
  });

  it('watches the polygon on the map when no bbox is given', async () => {
    joined();
    useDrawStore.setState({ features: [DRAWN_SQUARE] });
    fetchMock.mockResolvedValueOnce(jsonResponse(CREATED_WATCH));

    await runAction('live.watch_region', { layer: 'ndvi_2026', reducer: 'max' });

    expect(watchBody()).toEqual({
      name: 'max of ndvi_2026',
      layer: 'ndvi_2026',
      region: {
        type: 'Polygon',
        coordinates: [
          [
            [20, 10],
            [21, 10],
            [21, 11],
            [20, 11],
            [20, 10],
          ],
        ],
      },
      reducer: 'max',
      intervalSeconds: 3600,
    });
  });

  it('watches the view when nothing is drawn and no bbox is given', async () => {
    joined();
    setSharedCamera({ longitude: 0, latitude: 51, zoom: 8 });
    fetchMock.mockResolvedValueOnce(jsonResponse(CREATED_WATCH));

    await runAction('live.watch_region', { layer: 'ndvi_2026', reducer: 'mean' });

    // the shared camera's box: 180 / 2 ** 8 degrees either side of it
    const span = 180 / 2 ** 8;
    expect(watchBody()).toMatchObject({
      region: {
        type: 'Polygon',
        coordinates: [
          [
            [-span, 51 - span],
            [span, 51 - span],
            [span, 51 + span],
            [-span, 51 + span],
            [-span, 51 - span],
          ],
        ],
      },
    });
  });

  it('refuses a watch when this session is not in a document', async () => {
    await expect(
      runAction('live.watch_region', { layer: 'ndvi_2026', reducer: 'mean' }),
    ).rejects.toThrow('not joined to a live map');
    expect(requestsTo('/agora/documents/doc-1/watches')).toEqual([]);
  });

  it('refuses a threshold given only half', async () => {
    joined();
    await expect(
      runAction('live.watch_region', {
        layer: 'ndvi_2026',
        reducer: 'mean',
        threshold_op: 'lt',
      }),
    ).rejects.toThrow('both threshold_op and threshold_value');
    expect(requestsTo('/agora/documents/doc-1/watches')).toEqual([]);
  });

  it('refuses a watch that would read more often than agora allows', async () => {
    joined();
    await expect(
      runAction('live.watch_region', { layer: 'ndvi_2026', reducer: 'mean', interval_seconds: 30 }),
    ).rejects.toThrow('every 60 seconds');
    expect(requestsTo('/agora/documents/doc-1/watches')).toEqual([]);
  });
});
