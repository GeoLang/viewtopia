import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureStateForNewDocument,
  startDocumentBridge,
} from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveLayerEntry } from '../../src/live/types';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { setLayerOpacity, setLayerVisible } from '../../src/store/layerControls';
import { useOgcLayerStore, type OGCLayer } from '../../src/store/ogcLayers';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const ARCHIVE_INFO = { kind: 'vector' as const, vectorLayers: ['parcels'], minZoom: 0, maxZoom: 12 };

// reading a pmtiles header is a range request over the network
vi.mock('../../src/features/pmtiles/source', () => ({
  addRemotePmtiles: vi.fn(async () => ARCHIVE_INFO),
  addLocalPmtiles: vi.fn(),
  registerPmtilesProtocol: vi.fn(),
}));

const { addRemotePmtiles } = await import('../../src/features/pmtiles/source');

const WMS_URL = 'https://maps.example/wms';
const ARCHIVE_URL = 'https://archives.example/parcels.pmtiles';

/** The entry a peer would have written for a service of their own. */
function peerEntry(overrides: Partial<LiveLayerEntry> = {}): LiveLayerEntry {
  return {
    layerId: 'theirs',
    name: 'Their basemap',
    type: 'raster',
    visible: true,
    opacity: 1,
    order: 'V',
    source: { kind: 'service', service: 'wms', url: 'https://theirs.example/wms' },
    ...overrides,
  };
}

function entryFor(id: string): LiveLayerEntry | undefined {
  return useLiveStore.getState().document.layers[id];
}

function ogcLayer(id: string): OGCLayer | undefined {
  return useOgcLayerStore.getState().layers.find((layer) => layer.id === id);
}

/** Add a layer locally the way the OGC panel does, and answer with its id. */
function addLocally(name: string, url: string, type: OGCLayer['type']): string {
  return useOgcLayerStore.getState().addLayer(name, url, type).id;
}

let server: FakeAgoraServer;
let stopBridge: () => void;

function goLive(): void {
  useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit' });
  server.accept();
}

describe('live OGC layers', () => {
  beforeEach(() => {
    useAppStore.setState({ layers: [] });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [] });
    useOgcLayerStore.setState({ layers: [] });
    server = new FakeAgoraServer();
    server.document = emptyLiveDocument('shared map');
    server.install();
    stopBridge = startDocumentBridge();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    stopBridge();
    server.restore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('publishes a raster service as the handle alone', () => {
    goLive();
    const id = addLocally('Roads', WMS_URL, 'wms');

    expect(entryFor(id)).toMatchObject({
      layerId: id,
      name: 'Roads',
      type: 'raster',
      visible: true,
      opacity: 1,
      source: { kind: 'service', service: 'wms', url: WMS_URL },
    });
    expect(entryFor(id)?.order.length).toBeGreaterThan(0);
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual([id]);
  });

  it('publishes a remote archive under the kind it holds', () => {
    goLive();
    const id = addLocally('Parcels', ARCHIVE_URL, 'pmtiles');
    useOgcLayerStore.getState().setPmtilesInfo(id, ARCHIVE_INFO);

    expect(entryFor(id)).toMatchObject({
      type: 'vector',
      source: { kind: 'service', service: 'pmtiles', url: ARCHIVE_URL },
    });
  });

  it('keeps a WFS layer and a dropped archive out of the document', () => {
    goLive();
    const wfs = addLocally('Buildings', 'https://maps.example/wfs', 'wfs');
    const dropped = addLocally('Dropped', 'pmtiles://parcels.pmtiles', 'pmtiles');
    useOgcLayerStore.getState().setPmtilesInfo(dropped, { ...ARCHIVE_INFO, local: true });

    expect(entryFor(wfs)).toBeUndefined();
    expect(entryFor(dropped)).toBeUndefined();
  });

  it('deletes nothing a peer published when a local layer cannot travel', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/rivers', {
      layerId: 'rivers',
      name: 'Rivers',
      type: 'geojson',
      visible: true,
      opacity: 1,
      order: 'V',
      source: { kind: 'geojson', geojson: { type: 'FeatureCollection', features: [] } },
    });
    server.applyFromPeer('ada', 'layers/theirs', peerEntry());

    addLocally('Buildings', 'https://maps.example/wfs', 'wfs');

    expect(entryFor('rivers')).toBeDefined();
    expect(entryFor('theirs')).toBeDefined();
  });

  it('deletes the entry when the layer is removed locally', () => {
    goLive();
    const id = addLocally('Roads', WMS_URL, 'wms');
    expect(entryFor(id)).toBeDefined();

    useOgcLayerStore.getState().removeLayer(id);
    expect(entryFor(id)).toBeUndefined();
    expect(useAppStore.getState().layers).toEqual([]);
  });

  it('draws a peer service under the id the document gave it', () => {
    goLive();
    const sent = server.connection.editsSent.length;
    server.applyFromPeer('ada', 'layers/theirs', peerEntry({ opacity: 0.4, visible: false }));

    expect(ogcLayer('theirs')).toEqual({
      id: 'theirs',
      name: 'Their basemap',
      type: 'wms',
      url: 'https://theirs.example/wms',
      visible: false,
      opacity: 0.4,
    });
    // the row the layer manager gives it
    expect(useAppStore.getState().layers).toEqual([
      { id: 'theirs', name: 'Their basemap', type: 'raster', visible: false, opacity: 0.4 },
    ]);
    expect(server.connection.editsSent).toHaveLength(sent);
  });

  it('reads the header of a peer archive so it can be drawn', async () => {
    const archiveEntry = (overrides: Partial<LiveLayerEntry> = {}) =>
      peerEntry({
        type: 'vector',
        source: { kind: 'service', service: 'pmtiles', url: ARCHIVE_URL },
        ...overrides,
      });
    goLive();
    server.applyFromPeer('ada', 'layers/theirs', archiveEntry());

    await vi.waitFor(() => expect(ogcLayer('theirs')?.pmtiles).toEqual(ARCHIVE_INFO));
    expect(addRemotePmtiles).toHaveBeenCalledTimes(1);
    expect(addRemotePmtiles).toHaveBeenCalledWith(ARCHIVE_URL);

    // the archive is read once, not again on every document change
    server.applyFromPeer('ada', 'layers/theirs', archiveEntry({ opacity: 0.5 }));
    expect(addRemotePmtiles).toHaveBeenCalledTimes(1);
    expect(ogcLayer('theirs')?.pmtiles).toEqual(ARCHIVE_INFO);
  });

  it('removes the layer when the peer deletes the entry', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/theirs', peerEntry());
    expect(ogcLayer('theirs')).toBeDefined();

    server.applyFromPeer('ada', 'layers/theirs', null);
    expect(ogcLayer('theirs')).toBeUndefined();
  });

  it('carries a switch and a slider both ways', () => {
    goLive();
    const id = addLocally('Roads', WMS_URL, 'wms');

    setLayerVisible(id, false);
    setLayerOpacity(id, 0.25);
    expect(entryFor(id)).toMatchObject({ visible: false, opacity: 0.25 });
    expect(ogcLayer(id)).toMatchObject({ visible: false, opacity: 0.25 });

    server.applyFromPeer('ada', 'layers/theirs', peerEntry());
    server.applyFromPeer('ada', 'layers/theirs', peerEntry({ visible: false, opacity: 0.6 }));
    expect(ogcLayer('theirs')).toMatchObject({ visible: false, opacity: 0.6 });
  });

  it('seeds a document created here with the services already on screen', () => {
    const wms = addLocally('Roads', WMS_URL, 'wms');
    const wfs = addLocally('Buildings', 'https://maps.example/wfs', 'wfs');

    captureStateForNewDocument();
    goLive();

    expect(Object.keys(server.document.layers)).toEqual([wms]);
    expect(entryFor(wfs)).toBeUndefined();
  });
});
