import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveLayerEntry, type LiveRole } from '../../src/live/types';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const DOCUMENT_ID = 'doc-1';
const TOKEN = 'jwt-token';

function layerEntry(overrides: Partial<LiveLayerEntry> = {}): LiveLayerEntry {
  return {
    layerId: 'layer-a',
    name: 'Terrain',
    type: 'raster',
    visible: true,
    opacity: 1,
    order: 'V',
    ...overrides,
  };
}

let server: FakeAgoraServer;

function connectAndAccept(role: LiveRole = 'edit') {
  useLiveStore.getState().connect({ documentId: DOCUMENT_ID, token: TOKEN, role });
  return server.accept();
}

describe('live store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    server = new FakeAgoraServer();
    server.install();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    vi.useRealTimers();
  });

  it('connects with the document and resume point on the url, the token as a subprotocol', () => {
    connectAndAccept();
    expect(server.connection.documentParameter).toBe(DOCUMENT_ID);
    expect(server.connection.sinceParameter).toBe(0);
    expect(server.connection.url).not.toContain(TOKEN);
    expect(server.connection.offeredToken).toBe(TOKEN);
    expect(useLiveStore.getState().connection).toBe('open');
  });

  it('applies the join snapshot', () => {
    server.document = {
      ...emptyLiveDocument('atlas'),
      layers: { 'layer-a': layerEntry() },
    };
    server.seq = 7;
    connectAndAccept();
    const state = useLiveStore.getState();
    expect(state.document.meta.name).toBe('atlas');
    expect(state.document.layers['layer-a'].name).toBe('Terrain');
    expect(state.seq).toBe(7);
  });

  it('applies a peer edit that arrives after the snapshot', () => {
    connectAndAccept();
    server.applyFromPeer('ada', 'layers/layer-a', layerEntry({ opacity: 0.25 }));
    const state = useLiveStore.getState();
    expect(state.document.layers['layer-a'].opacity).toBe(0.25);
    expect(state.seq).toBe(1);
  });

  it('deletes a key when a peer sends a null value', () => {
    server.document = { ...emptyLiveDocument(), layers: { 'layer-a': layerEntry() } };
    connectAndAccept();
    server.applyFromPeer('ada', 'layers/layer-a', null);
    expect(useLiveStore.getState().document.layers['layer-a']).toBeUndefined();
  });

  it('applies a local operation at once and drops the pending entry on ack', () => {
    server.autoAck = false;
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    let state = useLiveStore.getState();
    expect(state.document.layers['layer-a'].name).toBe('Terrain');
    expect(Object.keys(state.pending)).toEqual(['1']);
    expect(server.connection.operationsSent).toEqual([
      { type: 'op', clientSeq: 1, key: 'layers/layer-a', value: layerEntry() },
    ]);

    server.ackPending(server.connection, 1);
    state = useLiveStore.getState();
    expect(state.pending).toEqual({});
    expect(state.document.layers['layer-a'].name).toBe('Terrain');
    expect(state.seq).toBe(1);
  });

  it('lets a peer edit overwrite a pending local edit until the ack restates it', () => {
    server.autoAck = false;
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry({ opacity: 1 }));
    server.applyFromPeer('ada', 'layers/layer-a', layerEntry({ opacity: 0.4 }));
    expect(useLiveStore.getState().document.layers['layer-a'].opacity).toBe(0.4);

    server.ackPending(server.connection, 1);
    expect(useLiveStore.getState().document.layers['layer-a'].opacity).toBe(1);
    expect(useLiveStore.getState().pending).toEqual({});
  });

  it('keeps the last writer by arrival order for two peer edits on one key', () => {
    connectAndAccept();
    server.applyFromPeer('ada', 'layers/layer-a', layerEntry({ opacity: 0.2 }));
    server.applyFromPeer('grace', 'layers/layer-a', layerEntry({ opacity: 0.8 }));
    expect(useLiveStore.getState().document.layers['layer-a'].opacity).toBe(0.8);
    expect(useLiveStore.getState().seq).toBe(2);
  });

  it('resumes from the last applied sequence and applies the replay', () => {
    connectAndAccept();
    server.applyFromPeer('ada', 'layers/layer-a', layerEntry());
    expect(useLiveStore.getState().seq).toBe(1);

    server.connection.dropConnection();
    expect(useLiveStore.getState().connection).toBe('reconnecting');
    vi.advanceTimersByTime(500);
    expect(server.connections).toHaveLength(2);
    expect(server.connection.sinceParameter).toBe(1);

    server.applyFromPeer('ada', 'bookmarks/home', {
      id: 'home',
      name: 'Home',
      lat: 1,
      lng: 2,
      zoom: 4,
      createdAt: 0,
    });
    server.accept({ replay: true });
    const state = useLiveStore.getState();
    expect(state.connection).toBe('open');
    expect(state.document.layers['layer-a'].name).toBe('Terrain');
    expect(state.document.bookmarks.home.name).toBe('Home');
    expect(state.seq).toBe(2);
  });

  it('falls back to the snapshot when the server cannot replay', () => {
    connectAndAccept();
    server.connection.dropConnection();
    server.document = {
      ...emptyLiveDocument('rebuilt'),
      annotations: {
        'note-1': { id: 'note-1', label: 'here', color: '#fff', lat: 1, lng: 2, createdAt: 3 },
      },
    };
    server.seq = 42;
    vi.advanceTimersByTime(500);
    server.accept();
    const state = useLiveStore.getState();
    expect(state.document.meta.name).toBe('rebuilt');
    expect(state.document.annotations['note-1'].label).toBe('here');
    expect(state.seq).toBe(42);
  });

  it('resends unacked operations after a reconnect', () => {
    server.autoAck = false;
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    server.connection.dropConnection();
    vi.advanceTimersByTime(500);
    server.accept({ replay: true });
    expect(server.connections[1].operationsSent).toEqual([
      { type: 'op', clientSeq: 1, key: 'layers/layer-a', value: layerEntry() },
    ]);
  });

  it('throttles presence to one trailing message per interval', () => {
    connectAndAccept();
    const { sendPresence } = useLiveStore.getState();
    sendPresence({ cursor: [1, 1], selection: [], viewport: null });
    sendPresence({ cursor: [2, 2], selection: [], viewport: null });
    sendPresence({ cursor: [3, 3], selection: ['layers/layer-a'], viewport: null });
    expect(server.connection.presenceSent).toHaveLength(0);

    vi.advanceTimersByTime(100);
    expect(server.connection.presenceSent).toEqual([
      { type: 'presence', cursor: [3, 3], selection: ['layers/layer-a'], viewport: null },
    ]);

    sendPresence({ cursor: [4, 4], selection: [], viewport: null });
    vi.advanceTimersByTime(99);
    expect(server.connection.presenceSent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(server.connection.presenceSent).toHaveLength(2);
  });

  it('drops presence queued before a reconnect instead of buffering it', () => {
    connectAndAccept();
    useLiveStore.getState().sendPresence({ cursor: [5, 5], selection: [], viewport: null });
    server.connection.dropConnection();
    vi.advanceTimersByTime(500);
    server.accept({ replay: true });
    vi.advanceTimersByTime(200);
    expect(server.connections[0].presenceSent).toHaveLength(0);
    expect(server.connections[1].presenceSent).toHaveLength(0);
  });

  it('sends nothing with the view role', () => {
    connectAndAccept('view');
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    expect(server.connection.operationsSent).toHaveLength(0);
    expect(useLiveStore.getState().document.layers['layer-a']).toBeUndefined();
  });

  it('tracks peers and prunes presence for peers that left', () => {
    connectAndAccept();
    server.sendPeers([
      { actor: 'ada', name: 'Ada', role: 'edit' },
      { actor: 'grace', name: 'Grace', role: 'view' },
    ]);
    server.connection.deliver({
      type: 'presence',
      actor: 'ada',
      cursor: [10, 20],
      selection: [],
      viewport: null,
    });
    server.connection.deliver({
      type: 'presence',
      actor: 'grace',
      cursor: [30, 40],
      selection: [],
      viewport: null,
    });
    expect(Object.keys(useLiveStore.getState().presence).sort()).toEqual(['ada', 'grace']);

    server.sendPeers([{ actor: 'ada', name: 'Ada', role: 'edit' }]);
    const state = useLiveStore.getState();
    expect(state.peers).toEqual([{ actor: 'ada', name: 'Ada', role: 'edit' }]);
    expect(Object.keys(state.presence)).toEqual(['ada']);
    expect(state.presence.ada.cursor).toEqual([10, 20]);
  });

  it('records a server error reason', () => {
    connectAndAccept();
    server.connection.deliver({ type: 'error', reason: 'read only link' });
    expect(useLiveStore.getState().error).toBe('read only link');
  });

  it('clears the document on disconnect', () => {
    connectAndAccept();
    server.applyFromPeer('ada', 'layers/layer-a', layerEntry());
    useLiveStore.getState().disconnect();
    const state = useLiveStore.getState();
    expect(state.documentId).toBeNull();
    expect(state.document).toEqual(emptyLiveDocument());
    expect(state.connection).toBe('idle');
  });
});
