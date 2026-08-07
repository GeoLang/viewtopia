import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureStateForNewDocument,
  startDocumentBridge,
} from '../../src/live/documentBridge';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveLayerEntry } from '../../src/live/types';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAnnotationStore, type Annotation } from '../../src/store/annotations';
import { useAppStore, type Bookmark, type LayerItem } from '../../src/store/app';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const ANNOTATION_STORAGE_KEY = 'viewtopia-annotations';

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
      style: { opacity: 0.8 },
    });
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
});
