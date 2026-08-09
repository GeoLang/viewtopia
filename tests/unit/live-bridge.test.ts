import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureStateForNewDocument,
  startDocumentBridge,
} from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import {
  emptyLiveDocument,
  MAXIMUM_INLINE_SOURCE_BYTES,
  type LiveLayerEntry,
  type LiveLayerSource,
} from '../../src/live/types';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAnnotationStore, type Annotation } from '../../src/store/annotations';
import { useAppStore, type Bookmark, type LayerItem } from '../../src/store/app';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const ANNOTATION_STORAGE_KEY = 'viewtopia-annotations';
const APP_STORAGE_KEY = 'viewtopia-app';

function storedBookmarkIds(): string[] {
  const stored = JSON.parse(localStorage.getItem(APP_STORAGE_KEY) ?? '{}');
  const bookmarks: Bookmark[] = stored.state?.bookmarks ?? [];
  return bookmarks.map((entry) => entry.id);
}

function appLayer(id: string, overrides: Partial<LayerItem> = {}): LayerItem {
  return { id, name: id.toUpperCase(), type: 'vector', visible: true, opacity: 1, ...overrides };
}

function agentLayer(id: string): AgentLayer {
  return {
    id,
    name: id,
    color: '#ff0000',
    geojson: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { x: 1 } },
      ],
    },
  };
}

function featureCollection(count: number, note = ''): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, index) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [index / 10, 2] },
      properties: { x: index, note },
    })),
  };
}

function oversizedAgentLayer(id: string): AgentLayer {
  const note = 'x'.repeat(256);
  const features = Math.ceil(MAXIMUM_INLINE_SOURCE_BYTES / note.length) + 1;
  return { id, name: id, color: '#ff0000', geojson: featureCollection(features, note) };
}

function sourceEntry(
  id: string,
  source: LiveLayerSource,
  overrides: Partial<LiveLayerEntry> = {},
): LiveLayerEntry {
  return {
    layerId: id,
    name: id,
    type: 'geojson',
    visible: true,
    opacity: 1,
    order: 'V',
    source,
    ...overrides,
  };
}

function annotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return { id, label: id, color: '#fff', lat: 1, lng: 2, createdAt: 1, ...overrides };
}

function bookmark(id: string): Bookmark {
  return { id, name: id, lat: 1, lng: 2, zoom: 5, createdAt: 1 };
}

function documentLayers(): Record<string, LiveLayerEntry> {
  return useLiveStore.getState().document.layers;
}

function orderedLayerIds(): string[] {
  return Object.values(documentLayers())
    .sort((left, right) => (left.order < right.order ? -1 : 1))
    .map((entry) => entry.layerId);
}

let server: FakeAgoraServer;
let stopBridge: () => void;

function goLive(): void {
  useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role: 'edit' });
  server.accept();
}

describe('live document bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useAppStore.setState({ layers: [], bookmarks: [] });
    useAnnotationStore.setState({ annotations: [] });
    useAgentLayerStore.setState({ layers: [], rasterLayers: [] });
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends nothing while no document is live', () => {
    useAppStore.getState().addLayer(appLayer('roads'));
    useAnnotationStore.getState().addAnnotation(annotation('note'));
    expect(server.connections).toHaveLength(0);
  });

  it('writes a locally added layer to the document with a fractional order', () => {
    goLive();
    useAppStore.getState().addLayer(appLayer('roads'));
    const entry = server.document.layers.roads;
    expect(entry).toMatchObject({ layerId: 'roads', name: 'ROADS', visible: true, opacity: 1 });
    expect(entry.order.length).toBeGreaterThan(0);
  });

  it('keeps locally added layers in list order', () => {
    goLive();
    for (const id of ['a', 'b', 'c']) useAppStore.getState().addLayer(appLayer(id));
    expect(orderedLayerIds()).toEqual(['a', 'b', 'c']);
  });

  it('sends one order change when a layer moves', () => {
    goLive();
    for (const id of ['a', 'b', 'c']) useAppStore.getState().addLayer(appLayer(id));
    const before = server.connection.operationsSent.length;
    useAppStore.getState().reorderLayers(2, 0);
    const sent = server.connection.operationsSent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].key).toBe('layers/c');
    expect(orderedLayerIds()).toEqual(['c', 'a', 'b']);
  });

  it('sends one batch when a single store change touches several layers', () => {
    goLive();
    useAppStore.setState({ layers: ['a', 'b', 'c'].map((id) => appLayer(id)) });

    expect(server.connection.operationsSent).toHaveLength(0);
    expect(server.connection.batchesSent).toHaveLength(1);
    expect(server.connection.batchesSent[0].ops.map((operation) => operation.key)).toEqual([
      'layers/a',
      'layers/b',
      'layers/c',
    ]);
    expect(orderedLayerIds()).toEqual(['a', 'b', 'c']);

    // a removal and the reorder it forces also travel together
    const before = server.connection.batchesSent.length;
    useAppStore.setState({ layers: ['c', 'a'].map((id) => appLayer(id)) });
    const sent = server.connection.batchesSent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].ops.map((operation) => operation.key)).toEqual(['layers/b', 'layers/a']);
    expect(orderedLayerIds()).toEqual(['c', 'a']);
  });

  it('writes visibility and opacity changes to the document', () => {
    goLive();
    useAppStore.getState().addLayer(appLayer('roads'));
    useAppStore.getState().toggleLayerVisibility('roads');
    useAppStore.getState().setLayerOpacity('roads', 0.35);
    expect(server.document.layers.roads).toMatchObject({ visible: false, opacity: 0.35 });
  });

  it('deletes the layer key when a layer is removed locally', () => {
    goLive();
    useAppStore.getState().addLayer(appLayer('roads'));
    useAppStore.getState().removeLayer('roads');
    expect(server.document.layers.roads).toBeUndefined();
    expect(server.connection.operationsSent.at(-1)).toMatchObject({
      key: 'layers/roads',
      value: null,
    });
  });

  it('applies peer layer edits into the layer list in document order', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/second', {
      layerId: 'second',
      name: 'Second',
      type: 'raster',
      visible: true,
      opacity: 0.5,
      order: 'W',
    });
    server.applyFromPeer('ada', 'layers/first', {
      layerId: 'first',
      name: 'First',
      type: 'vector',
      visible: false,
      opacity: 1,
      order: 'V',
    });
    expect(useAppStore.getState().layers).toEqual([
      { id: 'first', name: 'First', type: 'vector', visible: false, opacity: 1 },
      { id: 'second', name: 'Second', type: 'raster', visible: true, opacity: 0.5 },
    ]);
  });

  it('removes a layer the peer deleted', () => {
    goLive();
    server.applyFromPeer('ada', 'layers/roads', {
      layerId: 'roads',
      name: 'Roads',
      type: 'vector',
      visible: true,
      opacity: 1,
      order: 'V',
    });
    expect(useAppStore.getState().layers).toHaveLength(1);
    server.applyFromPeer('ada', 'layers/roads', null);
    expect(useAppStore.getState().layers).toEqual([]);
  });

  it('carries agent layer style overrides on the referenced layer entry', () => {
    goLive();
    useAppStore.getState().addLayer(appLayer('plugin-layer'));
    useAgentLayerStore.getState().addLayer(agentLayer('plugin-layer'), false);
    useAgentLayerStore.getState().setLayerOpacity('plugin-layer', 0.8);
    expect(server.document.layers['plugin-layer'].styleOverrides).toEqual({
      color: '#ff0000',
      style: { opacity: 0.8 },
    });
  });

  it('carries the colour of a published agent layer on its entry', () => {
    goLive();
    useAgentLayerStore.getState().addLayer(agentLayer('parks'), false);
    expect(server.document.layers.parks.styleOverrides).toEqual({ color: '#ff0000' });
  });

  it('draws a peer layer in the colour the publisher gave it', () => {
    goLive();
    server.applyFromPeer(
      'ada',
      'layers/rivers',
      sourceEntry(
        'rivers',
        { kind: 'geojson', geojson: featureCollection(1) },
        { styleOverrides: { color: '#00ff00' } },
      ),
    );
    expect(useAgentLayerStore.getState().layers[0].color).toBe('#00ff00');
  });

  it('recolours an existing layer when a peer changes its colour, without echoing back', () => {
    goLive();
    useAgentLayerStore.getState().addLayer(agentLayer('parks'), false);
    const sent = server.connection.editsSent.length;
    const entry = server.document.layers.parks;
    server.applyFromPeer('ada', 'layers/parks', {
      ...entry,
      styleOverrides: { ...entry.styleOverrides, color: '#123456' },
    });

    expect(useAgentLayerStore.getState().layers[0].color).toBe('#123456');
    expect(server.connection.editsSent).toHaveLength(sent);
  });

  it('applies a peer style override to the agent layer', () => {
    goLive();
    useAgentLayerStore.getState().addLayer(agentLayer('plugin-layer'), false);
    server.applyFromPeer('ada', 'layers/plugin-layer', {
      layerId: 'plugin-layer',
      name: 'Plugin',
      type: 'vector',
      visible: true,
      opacity: 1,
      order: 'V',
      styleOverrides: {
        style: { opacity: 0.2 },
        symbology: {
          kind: 'rules',
          rules: [{ field: 'x', op: '==', value: '1', color: '#00ff00' }],
        },
      },
    });
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.style?.opacity).toBe(0.2);
    expect(layer.symbology?.kind).toBe('rules');
  });

  it('writes annotations to the document and takes peer annotations back', () => {
    goLive();
    useAnnotationStore.getState().addAnnotation(annotation('note-1'));
    expect(server.document.annotations['note-1']).toMatchObject({ id: 'note-1', label: 'note-1' });

    server.applyFromPeer('ada', 'annotations/note-2', annotation('note-2', { createdAt: 2 }));
    expect(useAnnotationStore.getState().annotations.map((entry) => entry.id)).toEqual([
      'note-1',
      'note-2',
    ]);

    server.applyFromPeer('ada', 'annotations/note-1', null);
    expect(useAnnotationStore.getState().annotations.map((entry) => entry.id)).toEqual(['note-2']);
  });

  it('writes camera bookmarks to the document and takes peer bookmarks back', () => {
    goLive();
    useAppStore.getState().addBookmark(bookmark('home'));
    expect(server.document.bookmarks.home).toMatchObject({ id: 'home', zoom: 5 });

    server.applyFromPeer('ada', 'bookmarks/site', { ...bookmark('site'), createdAt: 2 });
    expect(useAppStore.getState().bookmarks.map((entry) => entry.id)).toEqual(['home', 'site']);
  });

  it('seeds a document created here with what is already on screen', () => {
    useAppStore.getState().addLayer(appLayer('roads'));
    useAnnotationStore.getState().addAnnotation(annotation('note-1'));
    useAppStore.getState().addBookmark(bookmark('home'));

    captureStateForNewDocument();
    goLive();

    expect(Object.keys(server.document.layers)).toEqual(['roads']);
    expect(Object.keys(server.document.annotations)).toEqual(['note-1']);
    expect(Object.keys(server.document.bookmarks)).toEqual(['home']);
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual(['roads']);
  });

  it('does not push local state into a document that already has content', () => {
    useAppStore.getState().addLayer(appLayer('roads'));
    server.document = {
      ...emptyLiveDocument('theirs'),
      layers: {
        theirs: {
          layerId: 'theirs',
          name: 'Theirs',
          type: 'vector',
          visible: true,
          opacity: 1,
          order: 'V',
        },
      },
    };
    captureStateForNewDocument();
    goLive();
    expect(Object.keys(server.document.layers)).toEqual(['theirs']);
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual(['theirs']);
  });

  it('publishes the features of a local agent layer', () => {
    goLive();
    useAgentLayerStore.getState().addLayer(agentLayer('parks'), false);

    const entry = server.document.layers.parks;
    expect(entry.source).toEqual({ kind: 'geojson', geojson: agentLayer('parks').geojson });
    expect(entry.order.length).toBeGreaterThan(0);
    expect(useAppStore.getState().layers.map((layer) => layer.id)).toEqual(['parks']);
  });

  it('deletes the entry when a published agent layer is removed locally', () => {
    goLive();
    useAgentLayerStore.getState().addLayer(agentLayer('parks'), false);
    useAgentLayerStore.getState().removeLayer('parks');
    expect(server.document.layers.parks).toBeUndefined();
  });

  it('draws a peer layer that carries its features, without echoing it back', () => {
    goLive();
    const sent = server.connection.editsSent.length;
    server.applyFromPeer(
      'ada',
      'layers/rivers',
      sourceEntry('rivers', { kind: 'geojson', geojson: featureCollection(2) }),
    );

    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.id).toBe('rivers');
    expect(layer.geojson.features).toHaveLength(2);
    expect(useAppStore.getState().layers.map((item) => item.id)).toEqual(['rivers']);
    expect(server.connection.editsSent).toHaveLength(sent);
  });

  it('replaces the layer when the peer rewrites the same entry', () => {
    goLive();
    const geojson = featureCollection(1);
    server.applyFromPeer('ada', 'layers/rivers', sourceEntry('rivers', { kind: 'geojson', geojson }));
    server.applyFromPeer(
      'ada',
      'layers/rivers',
      sourceEntry('rivers', { kind: 'geojson', geojson: featureCollection(3) }),
    );

    const layers = useAgentLayerStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].geojson.features).toHaveLength(3);
  });

  it('removes the layer when the peer deletes the entry', () => {
    goLive();
    server.applyFromPeer(
      'ada',
      'layers/rivers',
      sourceEntry('rivers', { kind: 'geojson', geojson: featureCollection(1) }),
    );
    expect(useAgentLayerStore.getState().layers).toHaveLength(1);

    server.applyFromPeer('ada', 'layers/rivers', null);
    expect(useAgentLayerStore.getState().layers).toEqual([]);
  });

  it('fetches a url source and applies the style overrides that came with it', async () => {
    const geojson = featureCollection(2);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => geojson }),
    );
    goLive();
    server.applyFromPeer(
      'ada',
      'layers/hosted',
      sourceEntry(
        'hosted',
        { kind: 'url', url: 'https://share.example/hosted.geojson', format: 'geojson' },
        { styleOverrides: { style: { opacity: 0.4 } } },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledWith('https://share.example/hosted.geojson');
    const layer = useAgentLayerStore.getState().layers[0];
    expect(layer.id).toBe('hosted');
    expect(layer.geojson.features).toHaveLength(2);
    expect(layer.style?.opacity).toBe(0.4);
  });

  it('leaves the layer absent and warns once when the source url fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    goLive();
    server.applyFromPeer(
      'ada',
      'layers/hosted',
      sourceEntry('hosted', {
        kind: 'url',
        url: 'https://share.example/hosted.geojson',
        format: 'geojson',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(useAgentLayerStore.getState().layers).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps a layer too large to inline local and writes nothing for it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    goLive();
    const sent = server.connection.editsSent.length;
    useAgentLayerStore.getState().addLayer(oversizedAgentLayer('census'), false);

    expect(server.document.layers.census).toBeUndefined();
    expect(server.connection.editsSent).toHaveLength(sent);
    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['census']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('seeds a new document with the agent layers that fit inline', () => {
    useAgentLayerStore.getState().addLayer(agentLayer('parks'), false);
    useAgentLayerStore.getState().addLayer(oversizedAgentLayer('census'), false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    captureStateForNewDocument();
    goLive();

    expect(Object.keys(server.document.layers)).toEqual(['parks']);
    expect(server.document.layers.parks.source).toMatchObject({ kind: 'geojson' });
  });

  it('restores the stored annotations when the session ends', () => {
    localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify([annotation('mine')]));
    useAnnotationStore.setState({ annotations: [annotation('mine')] });
    goLive();
    server.applyFromPeer('ada', 'annotations/theirs', annotation('theirs'));
    expect(useAnnotationStore.getState().annotations.map((entry) => entry.id)).toContain('theirs');

    useLiveStore.getState().disconnect();
    expect(useAnnotationStore.getState().annotations.map((entry) => entry.id)).toEqual(['mine']);
    expect(JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('restores the local bookmarks when the session ends', () => {
    useAppStore.setState({ bookmarks: [bookmark('mine')] });
    goLive();
    server.applyFromPeer('ada', 'bookmarks/theirs', bookmark('theirs'));
    expect(useAppStore.getState().bookmarks.map((entry) => entry.id)).toEqual(['theirs']);
    expect(storedBookmarkIds()).toEqual(['mine']);

    useLiveStore.getState().disconnect();
    expect(useAppStore.getState().bookmarks.map((entry) => entry.id)).toEqual(['mine']);
    expect(storedBookmarkIds()).toEqual(['mine']);
  });

  it('takes a layer back out of the local stores when its frame is undone', () => {
    goLive();
    useAppStore.getState().addLayer(appLayer('roads'));
    expect(server.document.layers.roads).toBeDefined();

    useLiveStore.getState().undo();
    expect(server.document.layers.roads).toBeUndefined();
    expect(useAppStore.getState().layers).toHaveLength(0);
  });

  it('keeps a bookmark added during a session out of local storage', () => {
    useAppStore.setState({ bookmarks: [bookmark('mine')] });
    goLive();
    useAppStore.getState().addBookmark(bookmark('shared'));
    expect(server.document.bookmarks.shared).toMatchObject({ id: 'shared' });
    expect(storedBookmarkIds()).toEqual(['mine']);
  });
});
