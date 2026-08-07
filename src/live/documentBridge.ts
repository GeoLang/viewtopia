import { useAgentLayerStore } from '../store/agentLayers';
import { loadStoredAnnotations, useAnnotationStore, type Annotation } from '../store/annotations';
import { useAppStore, type Bookmark, type LayerItem } from '../store/app';
import { compareFractionalIndex, generateIndexBetween } from './fractionalIndex';
import { isLiveDocumentActive, useLiveStore } from './liveStore';
import {
  documentKey,
  type LiveAnnotation,
  type LiveBookmark,
  type LiveDocument,
  type LiveLayerEntry,
  type LiveLayerStyleOverrides,
} from './types';

interface LocalState {
  layers: LayerItem[];
  annotations: Annotation[];
  bookmarks: Bookmark[];
}

let applyingFromDocument = false;
let stateForNewDocument: LocalState | null = null;

function applyFromDocument(apply: () => void): void {
  applyingFromDocument = true;
  try {
    apply();
  } finally {
    applyingFromDocument = false;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function sendOperation(key: string, value: unknown): void {
  useLiveStore.getState().sendOperation(key, value);
}

function orderedLayerEntries(document: LiveDocument): LiveLayerEntry[] {
  return Object.values(document.layers).sort((left, right) =>
    compareFractionalIndex(left.order, right.order),
  );
}

/**
 * The longest stretch of the list whose stored orders already ascend. Keeping it
 * and regenerating the rest costs one operation for a single moved layer.
 */
function longestAscendingRun(
  layers: LayerItem[],
  entries: Record<string, LiveLayerEntry>,
): { start: number; end: number } {
  let best = { start: 0, end: 0 };
  let index = 0;
  while (index < layers.length) {
    let previous = entries[layers[index].id]?.order;
    if (!previous) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < layers.length) {
      const next = entries[layers[end].id]?.order;
      if (!next || next <= previous) break;
      previous = next;
      end += 1;
    }
    if (end - index > best.end - best.start) best = { start: index, end };
    index = end;
  }
  return best;
}

function ordersForList(layers: LayerItem[], entries: Record<string, LiveLayerEntry>): string[] {
  const run = longestAscendingRun(layers, entries);
  const orders: string[] = [];
  let previousOrder: string | null = null;
  for (let index = 0; index < layers.length; index += 1) {
    const kept =
      index >= run.start && index < run.end ? entries[layers[index].id].order : null;
    const order: string =
      kept ??
      generateIndexBetween(
        previousOrder,
        index < run.start ? entries[layers[run.start].id].order : null,
      );
    orders.push(order);
    previousOrder = order;
  }
  return orders;
}

function sameLayerEntry(left: LiveLayerEntry, right: LiveLayerEntry): boolean {
  return (
    left.name === right.name &&
    left.type === right.type &&
    left.visible === right.visible &&
    left.opacity === right.opacity &&
    left.order === right.order &&
    sameJson(left.styleOverrides, right.styleOverrides)
  );
}

function syncLayersToDocument(layers: LayerItem[]): void {
  const entries = useLiveStore.getState().document.layers;
  const listed = new Set(layers.map((layer) => layer.id));
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) sendOperation(documentKey('layers', id), null);
  }

  const orders = ordersForList(layers, entries);
  layers.forEach((layer, index) => {
    const current = useLiveStore.getState().document.layers[layer.id];
    const entry: LiveLayerEntry = {
      layerId: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      order: orders[index],
      ...(current?.styleOverrides ? { styleOverrides: current.styleOverrides } : {}),
    };
    if (!current || !sameLayerEntry(current, entry)) {
      sendOperation(documentKey('layers', layer.id), entry);
    }
  });
}

/**
 * Style and symbology for layers the document already references. Agent layers
 * carry their features in the browser, so only their overrides can travel.
 */
function syncStyleOverridesToDocument(): void {
  for (const layer of useAgentLayerStore.getState().layers) {
    const entry = useLiveStore.getState().document.layers[layer.id];
    if (!entry) continue;
    const overrides: LiveLayerStyleOverrides = {};
    if (layer.style) overrides.style = layer.style;
    if (layer.symbology) overrides.symbology = layer.symbology;
    const next = Object.keys(overrides).length > 0 ? overrides : undefined;
    if (sameJson(entry.styleOverrides, next)) continue;
    sendOperation(documentKey('layers', layer.id), { ...entry, styleOverrides: next });
  }
}

function syncAnnotationsToDocument(annotations: Annotation[]): void {
  const entries = useLiveStore.getState().document.annotations;
  const listed = new Set(annotations.map((annotation) => annotation.id));
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) sendOperation(documentKey('annotations', id), null);
  }
  for (const annotation of annotations) {
    if (sameJson(entries[annotation.id], annotation)) continue;
    sendOperation(documentKey('annotations', annotation.id), annotation);
  }
}

function syncBookmarksToDocument(bookmarks: Bookmark[]): void {
  const entries = useLiveStore.getState().document.bookmarks;
  const listed = new Set(bookmarks.map((bookmark) => bookmark.id));
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) sendOperation(documentKey('bookmarks', id), null);
  }
  for (const bookmark of bookmarks) {
    if (sameJson(entries[bookmark.id], bookmark)) continue;
    sendOperation(documentKey('bookmarks', bookmark.id), bookmark);
  }
}

function applyLayersFromDocument(document: LiveDocument): void {
  const layers: LayerItem[] = orderedLayerEntries(document).map((entry) => ({
    id: entry.layerId,
    name: entry.name,
    type: entry.type,
    visible: entry.visible,
    opacity: entry.opacity,
  }));
  if (sameJson(useAppStore.getState().layers, layers)) return;
  applyFromDocument(() => useAppStore.setState({ layers }));
}

function applyStyleOverridesFromDocument(document: LiveDocument): void {
  const { layers, setLayerOpacity, setSymbology } = useAgentLayerStore.getState();
  for (const entry of Object.values(document.layers)) {
    const overrides = entry.styleOverrides;
    if (!overrides) continue;
    const layer = layers.find((candidate) => candidate.id === entry.layerId);
    if (!layer) continue;
    const opacity = overrides.style?.opacity;
    if (opacity !== undefined && opacity !== layer.style?.opacity) {
      applyFromDocument(() => setLayerOpacity(layer.id, opacity));
    }
    if (!sameJson(overrides.symbology, layer.symbology)) {
      applyFromDocument(() => setSymbology(layer.id, overrides.symbology ?? null));
    }
  }
}

function byCreation<Entry extends { createdAt: number }>(entries: Record<string, Entry>): Entry[] {
  return Object.values(entries).sort((left, right) => left.createdAt - right.createdAt);
}

function applyAnnotationsFromDocument(document: LiveDocument): void {
  const annotations = byCreation<LiveAnnotation>(document.annotations);
  if (sameJson(useAnnotationStore.getState().annotations, annotations)) return;
  applyFromDocument(() => useAnnotationStore.getState().setAnnotations(annotations));
}

function applyBookmarksFromDocument(document: LiveDocument): void {
  const bookmarks = byCreation<LiveBookmark>(document.bookmarks);
  if (sameJson(useAppStore.getState().bookmarks, bookmarks)) return;
  applyFromDocument(() => useAppStore.setState({ bookmarks }));
}

function applyDocument(document: LiveDocument): void {
  applyLayersFromDocument(document);
  applyStyleOverridesFromDocument(document);
  applyAnnotationsFromDocument(document);
  applyBookmarksFromDocument(document);
}

function isEmptyDocument(document: LiveDocument): boolean {
  return (
    Object.keys(document.layers).length === 0 &&
    Object.keys(document.annotations).length === 0 &&
    Object.keys(document.bookmarks).length === 0
  );
}

function publishLocalState(local: LocalState): void {
  if (!isEmptyDocument(useLiveStore.getState().document)) return;
  syncLayersToDocument(local.layers);
  syncStyleOverridesToDocument();
  syncAnnotationsToDocument(local.annotations);
  syncBookmarksToDocument(local.bookmarks);
}

/**
 * Hold what this browser has on screen so the first snapshot of a document we
 * just created starts from it instead of wiping it.
 */
export function captureStateForNewDocument(): void {
  const { layers, bookmarks } = useAppStore.getState();
  stateForNewDocument = {
    layers,
    bookmarks,
    annotations: useAnnotationStore.getState().annotations,
  };
}

export function startDocumentBridge(): () => void {
  const outbound = (sync: () => void) => {
    if (applyingFromDocument || !isLiveDocumentActive()) return;
    sync();
  };

  const unsubscribeApp = useAppStore.subscribe((state, previous) => {
    if (state.layers !== previous.layers) outbound(() => syncLayersToDocument(state.layers));
    if (state.bookmarks !== previous.bookmarks) {
      outbound(() => syncBookmarksToDocument(state.bookmarks));
    }
  });

  const unsubscribeAnnotations = useAnnotationStore.subscribe((state, previous) => {
    if (state.annotations === previous.annotations) return;
    outbound(() => syncAnnotationsToDocument(state.annotations));
  });

  const unsubscribeAgentLayers = useAgentLayerStore.subscribe((state, previous) => {
    if (state.layers === previous.layers) return;
    outbound(syncStyleOverridesToDocument);
  });

  const unsubscribeLive = useLiveStore.subscribe((state, previous) => {
    if (state.documentId === null) {
      if (previous.documentId !== null) {
        stateForNewDocument = null;
        applyFromDocument(() =>
          useAnnotationStore.getState().setAnnotations(loadStoredAnnotations()),
        );
      }
      return;
    }
    // joining resets the document to an empty one, and local state stays put
    // until the server says what the document holds
    if (state.documentId !== previous.documentId) return;
    if (state.document === previous.document) return;
    applyDocument(state.document);
    if (stateForNewDocument) {
      const local = stateForNewDocument;
      stateForNewDocument = null;
      publishLocalState(local);
    }
  });

  return () => {
    unsubscribeApp();
    unsubscribeAnnotations();
    unsubscribeAgentLayers();
    unsubscribeLive();
  };
}
