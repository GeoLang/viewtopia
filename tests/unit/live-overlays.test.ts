import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { startDocumentBridge } from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveLayerEntry } from '../../src/live/types';
import type { Corners } from '../../src/overlay/georeference';
import { useAgentLayerStore, type AgentRasterLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

/** A one pixel png, so the bytes the upload carries are a real image. */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CORNERS: Corners = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
];

const MOVED_CORNERS: Corners = [
  [0, 2],
  [1, 1],
  [1, 0],
  [0, 0],
];

function overlay(overrides: Partial<AgentRasterLayer> = {}): AgentRasterLayer {
  return {
    id: 'plan',
    name: 'Site plan',
    url: PNG_DATA_URL,
    corners: CORNERS,
    opacity: 1,
    visible: true,
    ...overrides,
  };
}

/** The entry a peer would have written for the same overlay. */
function peerEntry(overrides: Partial<LiveLayerEntry> = {}): LiveLayerEntry {
  return {
    layerId: 'plan',
    name: 'Site plan',
    type: 'raster',
    visible: true,
    opacity: 1,
    order: 'V',
    source: { kind: 'image', url: '/attachments/theirs', corners: CORNERS },
    ...overrides,
  };
}

function overlayEntry(): LiveLayerEntry | undefined {
  return useLiveStore.getState().document.layers.plan;
}

function overlayOnScreen(): AgentRasterLayer | undefined {
  return useAgentLayerStore.getState().rasterLayers.find((layer) => layer.id === 'plan');
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

/** Wait for the upload the store change kicked off to have written its op. */
function waitForEntry(): Promise<void> {
  return vi.waitFor(() => expect(overlayEntry()).toBeDefined());
}

describe('live image overlays', () => {
  beforeEach(() => {
    useAppStore.setState({ layers: [] });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [], editingRasterId: null });
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

  it('uploads the bitmap and writes the overlay into the document', async () => {
    goLive();
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await waitForEntry();

    expect(server.attachmentUploads).toHaveLength(1);
    const [upload] = server.attachmentUploads;
    expect(upload.documentId).toBe('doc-1');
    expect(upload.contentType).toBe('image/png');
    expect(upload.bytes.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    expect(overlayEntry()).toMatchObject({
      layerId: 'plan',
      name: 'Site plan',
      type: 'raster',
      visible: true,
      opacity: 1,
      source: { kind: 'image', url: '/attachments/attachment-1', corners: CORNERS },
    });
  });

  it('sends a corner drag and an opacity change without uploading again', async () => {
    goLive();
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await waitForEntry();

    useAgentLayerStore.getState().setRasterCorners('plan', MOVED_CORNERS);
    useAgentLayerStore.getState().setRasterOpacity('plan', 0.4);

    expect(overlayEntry()?.source).toEqual({
      kind: 'image',
      url: '/attachments/attachment-1',
      corners: MOVED_CORNERS,
    });
    expect(overlayEntry()?.opacity).toBe(0.4);
    expect(server.attachmentUploads).toHaveLength(1);
  });

  it('takes the overlay out of the document when it is removed', async () => {
    goLive();
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await waitForEntry();

    useAgentLayerStore.getState().removeRasterLayer('plan');
    expect(overlayEntry()).toBeUndefined();
  });

  it('draws a peer overlay from the attachment url', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/plan', peerEntry());

    expect(overlayOnScreen()).toEqual({
      id: 'plan',
      name: 'Site plan',
      url: '/agora/attachments/theirs',
      corners: CORNERS,
      opacity: 1,
      visible: true,
    });
    expect(server.attachmentUploads).toHaveLength(0);
  });

  it('moves and fades a peer overlay already on screen', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/plan', peerEntry());
    server.applyFromPeer(
      'ada',
      'layers/plan',
      peerEntry({
        opacity: 0.3,
        visible: false,
        source: { kind: 'image', url: '/attachments/theirs', corners: MOVED_CORNERS },
      }),
    );

    expect(useAgentLayerStore.getState().rasterLayers).toHaveLength(1);
    expect(overlayOnScreen()).toMatchObject({
      opacity: 0.3,
      visible: false,
      corners: MOVED_CORNERS,
    });
  });

  it('removes a peer overlay the peer deleted', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/plan', peerEntry());
    expect(overlayOnScreen()).toBeDefined();

    server.applyFromPeer('ada', 'layers/plan', null);
    expect(overlayOnScreen()).toBeUndefined();
  });

  it('keeps a share link guest overlay local, with one notice and no upload', async () => {
    goLive({ guest: true });
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await vi.waitFor(() => expect(shown).toHaveBeenCalledTimes(1));

    useAgentLayerStore.getState().setRasterCorners('plan', MOVED_CORNERS);
    expect(server.attachmentUploads).toHaveLength(0);
    expect(overlayEntry()).toBeUndefined();
    expect(overlayOnScreen()?.corners).toEqual(MOVED_CORNERS);
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('keeps the overlay local when agora refuses the upload', async () => {
    server.attachmentStatus = 403;
    goLive();
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await vi.waitFor(() => expect(shown).toHaveBeenCalledTimes(1));

    expect(overlayEntry()).toBeUndefined();
    expect(overlayOnScreen()).toBeDefined();
    expect(shown.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining('refused') });
  });

  it('lets undo take the overlay back out', async () => {
    goLive();
    useAgentLayerStore.getState().addRasterLayer(overlay());
    await waitForEntry();

    useLiveStore.getState().undo();
    expect(overlayEntry()).toBeUndefined();
    expect(overlayOnScreen()).toBeUndefined();
  });
});
