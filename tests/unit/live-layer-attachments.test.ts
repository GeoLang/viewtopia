import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { captureStateForNewDocument, startDocumentBridge } from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, MAXIMUM_INLINE_SOURCE_BYTES, type LiveLayerEntry } from '../../src/live/types';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

function oversizedGeojson(note: string): GeoJSON.FeatureCollection {
  const count = Math.ceil(MAXIMUM_INLINE_SOURCE_BYTES / note.length) + 1;
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, index) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [index / 10, 2] },
      properties: { index, note },
    })),
  };
}

function censusLayer(note = 'x'.repeat(256)): AgentLayer {
  return { id: 'census', name: 'census', color: '#ff0000', geojson: oversizedGeojson(note) };
}

function censusEntry(): LiveLayerEntry | undefined {
  return useLiveStore.getState().document.layers.census;
}

let server: FakeAgoraServer;
let stopBridge: () => void;
let shown: ReturnType<typeof vi.spyOn>;

function goLive(options: { guest?: boolean } = {}): void {
  useLiveStore
    .getState()
    .connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit', guest: options.guest });
  server.accept();
}

describe('a live layer too large to inline', () => {
  beforeEach(() => {
    useAppStore.setState({ layers: [] });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [] });
    server = new FakeAgoraServer();
    server.document = emptyLiveDocument('shared map');
    server.install();
    vi.stubGlobal('fetch', server.handleRequest);
    shown = vi.spyOn(notifications, 'show').mockImplementation(() => '');
    stopBridge = startDocumentBridge();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    stopBridge();
    server.restore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('goes up as a geojson attachment and travels as its url', async () => {
    goLive();
    const layer = censusLayer();
    useAgentLayerStore.getState().addLayer(layer, false);
    await vi.waitFor(() => expect(censusEntry()).toBeDefined());

    expect(server.attachmentUploads).toHaveLength(1);
    const [upload] = server.attachmentUploads;
    expect(upload.contentType).toBe('application/geo+json');
    expect(JSON.parse(new TextDecoder().decode(upload.bytes))).toEqual(layer.geojson);
    expect(censusEntry()?.source).toEqual({ kind: 'url', url: '/agora/attachments/attachment-1', format: 'geojson' });
  });

  it('goes up again when its features change', async () => {
    goLive();
    useAgentLayerStore.getState().addLayer(censusLayer(), false);
    await vi.waitFor(() => expect(censusEntry()).toBeDefined());

    useAgentLayerStore.getState().addLayer(censusLayer('y'.repeat(256)), false);
    await vi.waitFor(() =>
      expect(censusEntry()?.source).toEqual({ kind: 'url', url: '/agora/attachments/attachment-2', format: 'geojson' }),
    );
    expect(server.attachmentUploads).toHaveLength(2);
  });

  it('leaves the document when it is removed locally', async () => {
    goLive();
    useAgentLayerStore.getState().addLayer(censusLayer(), false);
    await vi.waitFor(() => expect(censusEntry()).toBeDefined());

    useAgentLayerStore.getState().removeLayer('census');

    expect(censusEntry()).toBeUndefined();
  });

  it('seeds a document created here', async () => {
    useAgentLayerStore.getState().addLayer(censusLayer(), false);
    captureStateForNewDocument();
    goLive();

    await vi.waitFor(() => expect(server.document.layers.census?.source?.kind).toBe('url'));
  });

  it('stays local for a share link guest, with one notice and no upload', async () => {
    goLive({ guest: true });
    useAgentLayerStore.getState().addLayer(censusLayer(), false);
    useAgentLayerStore.getState().setLayerOpacity('census', 0.5);

    expect(server.attachmentUploads).toHaveLength(0);
    expect(censusEntry()).toBeUndefined();
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('stays local with a notice when agora refuses the upload', async () => {
    server.attachmentStatus = 413;
    goLive();
    useAgentLayerStore.getState().addLayer(censusLayer(), false);

    await vi.waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
    expect(censusEntry()).toBeUndefined();
  });
});
