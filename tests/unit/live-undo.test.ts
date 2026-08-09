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
  return server.accept({ role });
}

function layers(): Record<string, LiveLayerEntry> {
  return useLiveStore.getState().document.layers;
}

describe('live undo', () => {
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

  it('takes back a write, restoring the value the key held before', () => {
    server.document = { ...emptyLiveDocument(), layers: { 'layer-a': layerEntry({ opacity: 1 }) } };
    connectAndAccept();

    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry({ opacity: 0.2 }));
    expect(layers()['layer-a'].opacity).toBe(0.2);

    useLiveStore.getState().undo();
    expect(layers()['layer-a'].opacity).toBe(1);
    expect(useLiveStore.getState().undoSteps).toHaveLength(0);
  });

  it('takes back an added key by deleting it again', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    expect(layers()['layer-a']).toBeDefined();

    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeUndefined();
    expect(server.connection.operationsSent.at(-1)).toEqual({
      type: 'op',
      clientSeq: 2,
      key: 'layers/layer-a',
      value: null,
    });
  });

  it('takes a whole batch back as one step and one frame', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperations([
      { key: 'layers/layer-a', value: layerEntry() },
      { key: 'layers/layer-b', value: layerEntry({ layerId: 'layer-b', order: 'W' }) },
    ]);
    expect(useLiveStore.getState().undoSteps).toHaveLength(1);

    useLiveStore.getState().undo();
    expect(Object.keys(layers())).toHaveLength(0);
    expect(server.connection.batchesSent.at(-1)).toEqual({
      type: 'batch',
      clientSeq: 2,
      ops: [
        { key: 'layers/layer-a', value: null },
        { key: 'layers/layer-b', value: null },
      ],
    });
  });

  it('keeps the value from before the frame when one frame writes a key twice', () => {
    server.document = { ...emptyLiveDocument(), layers: { 'layer-a': layerEntry({ opacity: 1 }) } };
    connectAndAccept();
    useLiveStore.getState().sendOperations([
      { key: 'layers/layer-a', value: layerEntry({ opacity: 0.5 }) },
      { key: 'layers/layer-a', value: layerEntry({ opacity: 0.25 }) },
    ]);
    expect(layers()['layer-a'].opacity).toBe(0.25);

    useLiveStore.getState().undo();
    expect(layers()['layer-a'].opacity).toBe(1);
  });

  it('skips a key a peer has written since and takes the rest of the step back', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperations([
      { key: 'layers/layer-a', value: layerEntry() },
      { key: 'layers/layer-b', value: layerEntry({ layerId: 'layer-b', order: 'W' }) },
    ]);
    server.applyFromPeer('ada', 'layers/layer-b', layerEntry({ layerId: 'layer-b', order: 'Z' }));

    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeUndefined();
    expect(layers()['layer-b'].order).toBe('Z');
    expect(server.connection.operationsSent.at(-1)).toEqual({
      type: 'op',
      clientSeq: 2,
      key: 'layers/layer-a',
      value: null,
    });
  });

  it('consumes a step a peer overwrote whole and takes the one before it', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    useLiveStore.getState().sendOperation('layers/layer-b', layerEntry({ layerId: 'layer-b' }));
    server.applyFromPeer('ada', 'layers/layer-b', layerEntry({ layerId: 'layer-b', order: 'Z' }));

    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeUndefined();
    expect(layers()['layer-b'].order).toBe('Z');
    expect(useLiveStore.getState().undoSteps).toHaveLength(0);
  });

  it('does nothing while an operation of ours is unacked', () => {
    server.autoAck = false;
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());

    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeDefined();
    expect(server.connection.operationsSent).toHaveLength(1);

    server.ackPending(server.connection, 1);
    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeUndefined();
  });

  it('redoes what it undid, and a new edit of ours clears the redo stack', () => {
    server.document = { ...emptyLiveDocument(), layers: { 'layer-a': layerEntry({ opacity: 1 }) } };
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry({ opacity: 0.2 }));

    useLiveStore.getState().undo();
    expect(layers()['layer-a'].opacity).toBe(1);
    expect(useLiveStore.getState().redoSteps).toHaveLength(1);

    useLiveStore.getState().redo();
    expect(layers()['layer-a'].opacity).toBe(0.2);
    expect(useLiveStore.getState().redoSteps).toHaveLength(0);
    expect(useLiveStore.getState().undoSteps).toHaveLength(1);

    useLiveStore.getState().undo();
    useLiveStore.getState().sendOperation('layers/layer-b', layerEntry({ layerId: 'layer-b' }));
    expect(useLiveStore.getState().redoSteps).toHaveLength(0);
  });

  it('reads a value the server sorted as still our own write', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    // agora stores an op value as sorted json, so its echo is key ordered
    const sorted = Object.fromEntries(
      Object.entries(layerEntry()).sort(([left], [right]) => (left < right ? -1 : 1)),
    );
    server.applyFromPeer('self', 'layers/layer-a', sorted);

    useLiveStore.getState().undo();
    expect(layers()['layer-a']).toBeUndefined();
  });

  it('records nothing with the view role', () => {
    connectAndAccept('view');
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    expect(useLiveStore.getState().undoSteps).toHaveLength(0);
  });

  it('drops the stacks when the session ends', () => {
    connectAndAccept();
    useLiveStore.getState().sendOperation('layers/layer-a', layerEntry());
    useLiveStore.getState().undo();
    expect(useLiveStore.getState().redoSteps).toHaveLength(1);

    useLiveStore.getState().disconnect();
    expect(useLiveStore.getState().undoSteps).toHaveLength(0);
    expect(useLiveStore.getState().redoSteps).toHaveLength(0);
  });
});
