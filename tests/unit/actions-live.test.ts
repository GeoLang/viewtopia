import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/live';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument } from '../../src/live/types';
import { useAgentLayerStore } from '../../src/store/agentLayers';
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
    expect(result.text).toBe('3 live documents: Coastline, Coastline north, Campus twin.');
  });

  it('shows an id only when two documents share a name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([...DOCUMENTS, { id: 'doc-4', name: 'Coastline' }]),
    );
    const result = await runAction('live.list', {});
    expect(result.text).toBe(
      '4 live documents: Coastline (doc-1), Coastline north, Campus twin, Coastline (doc-4).',
    );
  });

  it('joins the document a partial name names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    const result = await runAction('live.join', { document: 'campus' });

    expect(useLiveStore.getState().documentId).toBe('doc-3');
    expect(server.connection.documentParameter).toBe('doc-3');
    expect(result.text).toBe('Joined Campus twin.');
  });

  it('refuses a name two documents carry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await expect(runAction('live.join', { document: 'coastline' })).rejects.toThrow(ActionError);
    expect(useLiveStore.getState().documentId).toBeNull();
  });

  it('says a session with no sign in cannot join', async () => {
    useAuthStore.setState({ token: null });
    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await expect(runAction('live.join', { document: 'doc-3' })).rejects.toThrow('has no sign in');
  });

  it('leaves the document it is in, and says so when it is in none', async () => {
    await expect(runAction('live.leave', {})).rejects.toThrow('not joined to a live document');

    fetchMock.mockResolvedValueOnce(jsonResponse(DOCUMENTS));
    await runAction('live.join', { document: 'doc-1' });
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
    ).rejects.toThrow('not joined to a live document');
  });
});
