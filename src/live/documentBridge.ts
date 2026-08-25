import { notifications } from '@mantine/notifications';
import {
  toFeatureCollection,
  useAgentLayerStore,
  type AgentLayer,
  type AgentRasterLayer,
} from '../store/agentLayers';
import { loadStoredAnnotations, useAnnotationStore, type Annotation } from '../store/annotations';
import {
  holdLocalBookmarks,
  restoreLocalBookmarks,
  useAppStore,
  type Bookmark,
  type LayerItem,
} from '../store/app';
import {
  loadPmtilesLayer,
  ogcLayerOpacity,
  ogcLayerVisible,
  useOgcLayerStore,
  type OGCLayer,
} from '../store/ogcLayers';
import { useTiles3dLayerStore, type Tiles3dLayer } from '../store/tiles3dLayers';
import { agoraErrorText, attachmentSourceUrl, uploadAttachment } from './api';
import { decodeDataUrl, MAXIMUM_ATTACHMENT_BYTES } from './attachments';
import { compareFractionalIndex, generateIndexBetween } from './fractionalIndex';
import { isLiveDocumentActive, useLiveStore } from './liveStore';
import {
  documentKey,
  MAXIMUM_INLINE_SOURCE_BYTES,
  type LiveAnnotation,
  type LiveBookmark,
  type LiveDocument,
  type LiveLayerEntry,
  type LiveLayerImageSource,
  type LiveLayerServiceSource,
  type LiveLayerSource,
  type LiveLayerStyleOverrides,
  type LiveLayerTiles3dSource,
  type LiveLayerUrlSource,
  type LiveOperation,
} from './types';

interface LocalState {
  layers: LayerItem[];
  agentLayers: AgentLayer[];
  overlays: AgentRasterLayer[];
  ogcLayers: OGCLayer[];
  tiles3dLayers: Tiles3dLayer[];
  annotations: Annotation[];
  bookmarks: Bookmark[];
}

const MATERIALIZED_LAYER_TYPE: LayerItem['type'] = 'geojson';
const OVERLAY_LAYER_TYPE: LayerItem['type'] = 'raster';
/** what a service draws as, until a PMTiles archive says it is vector */
const SERVICE_LAYER_TYPE: LayerItem['type'] = 'raster';
const TILES_3D_LAYER_TYPE: LayerItem['type'] = 'tiles3d';

/**
 * How far an overlay's bitmap has got towards the document. `unavailable` is
 * where a session that may not upload ends up, and it stays there, so a member
 * who cannot publish an overlay is told once rather than on every corner drag.
 */
type OverlayBitmap = { url: string } | 'uploading' | 'unavailable';

let applyingFromDocument = false;
let stateForNewDocument: LocalState | null = null;
/** the source each layer id carries in the document, as far as this bridge knows */
const documentSources = new Map<string, LiveLayerSource>();
const oversizedLayerIds = new Set<string>();
const overlayBitmaps = new Map<string, OverlayBitmap>();

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

/**
 * One store change travels as one frame, so a reorder or a multi feature edit
 * cannot land on a peer half applied.
 */
function sendOperations(operations: LiveOperation[]): void {
  useLiveStore.getState().sendOperations(operations);
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
    sameJson(left.styleOverrides, right.styleOverrides) &&
    sameJson(left.source, right.source)
  );
}

function syncLayersToDocument(layers: LayerItem[]): void {
  const entries = useLiveStore.getState().document.layers;
  const listed = new Set(layers.map((layer) => layer.id));
  const operations: LiveOperation[] = [];
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) operations.push({ key: documentKey('layers', id), value: null });
  }

  const orders = ordersForList(layers, entries);
  layers.forEach((layer, index) => {
    const current = entries[layer.id];
    const entry: LiveLayerEntry = {
      layerId: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible,
      opacity: layer.opacity,
      order: orders[index],
      ...(current?.styleOverrides ? { styleOverrides: current.styleOverrides } : {}),
      ...(current?.source ? { source: current.source } : {}),
    };
    if (!current || !sameLayerEntry(current, entry)) {
      operations.push({ key: documentKey('layers', layer.id), value: entry });
    }
  });
  sendOperations(operations);
}

function overridesFor(layer: AgentLayer): LiveLayerStyleOverrides | undefined {
  const overrides: LiveLayerStyleOverrides = {};
  if (layer.color) overrides.color = layer.color;
  if (layer.style) overrides.style = layer.style;
  if (layer.symbology) overrides.symbology = layer.symbology;
  if (layer.zoomRange) overrides.zoomRange = layer.zoomRange;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** Style and symbology for layers the document already references. */
function syncStyleOverridesToDocument(): void {
  const entries = useLiveStore.getState().document.layers;
  const operations: LiveOperation[] = [];
  for (const layer of useAgentLayerStore.getState().layers) {
    const entry = entries[layer.id];
    if (!entry) continue;
    const next = overridesFor(layer);
    if (sameJson(entry.styleOverrides, next)) continue;
    operations.push({
      key: documentKey('layers', layer.id),
      value: { ...entry, styleOverrides: next },
    });
  }
  sendOperations(operations);
}

function withinInlineLimit(entry: LiveLayerEntry): boolean {
  return new TextEncoder().encode(JSON.stringify(entry)).length < MAXIMUM_INLINE_SOURCE_BYTES;
}

function lastOrder(entries: Record<string, LiveLayerEntry>): string | null {
  const orders = Object.values(entries)
    .map((entry) => entry.order)
    .sort(compareFractionalIndex);
  return orders.at(-1) ?? null;
}

// symbology bakes colours into the features and travels as an override, so the
// features before styling are what peers should read
function inlineSourceOf(layer: AgentLayer): LiveLayerSource {
  return { kind: 'geojson', geojson: layer.sourceGeojson ?? layer.geojson };
}

function agentLayerEntry(
  layer: AgentLayer,
  current: LiveLayerEntry | undefined,
  order: string,
  source: LiveLayerSource,
): LiveLayerEntry {
  const overrides = overridesFor(layer);
  return {
    layerId: layer.id,
    name: current?.name ?? layer.name,
    type: current?.type ?? MATERIALIZED_LAYER_TYPE,
    visible: current?.visible ?? layer.visible ?? true,
    opacity: current?.opacity ?? 1,
    order,
    ...(overrides ? { styleOverrides: overrides } : {}),
    source,
  };
}

function warnOversized(layer: AgentLayer): void {
  if (oversizedLayerIds.has(layer.id)) return;
  oversizedLayerIds.add(layer.id);
  console.warn(
    `live layer "${layer.name}" is over ${MAXIMUM_INLINE_SOURCE_BYTES} bytes and stays local`,
  );
}

/**
 * Agent layers hold their own features, so they travel as inline sources. A
 * layer too large to inline is left out whole rather than sent as metadata
 * peers could not draw.
 */
function syncAgentLayerSourcesToDocument(layers: AgentLayer[]): void {
  const entries = useLiveStore.getState().document.layers;
  const present = new Set(layers.map((layer) => layer.id));
  const operations: LiveOperation[] = [];

  for (const [id, entry] of Object.entries(entries)) {
    // a url source we could not fetch is missing locally too, so only an
    // inline source disappearing means the member deleted the layer
    if (entry.source?.kind !== 'geojson') continue;
    if (present.has(id) || !documentSources.has(id)) continue;
    documentSources.delete(id);
    operations.push({ key: documentKey('layers', id), value: null });
  }

  let previousOrder = lastOrder(entries);
  for (const layer of layers) {
    const known = documentSources.get(layer.id);
    if (known?.kind === 'url') continue;
    const source = inlineSourceOf(layer);
    if (sameJson(known, source)) continue;
    const current = entries[layer.id];
    const order = current?.order ?? generateIndexBetween(previousOrder, null);
    const entry = agentLayerEntry(layer, current, order, source);
    if (!withinInlineLimit(entry)) {
      warnOversized(layer);
      continue;
    }
    if (!current) previousOrder = order;
    documentSources.set(layer.id, source);
    operations.push({ key: documentKey('layers', layer.id), value: entry });
  }

  sendOperations(operations);
}

function overlayStaysLocal(overlay: AgentRasterLayer, message: string): void {
  overlayBitmaps.set(overlay.id, 'unavailable');
  notifications.show({
    title: `"${overlay.name}" stays on your screen`,
    message,
    color: 'gray',
  });
}

/**
 * Put an overlay's bitmap where peers can read it. A share link session may not
 * upload, which agora decides and the guest flag says in advance, so that
 * session keeps the overlay to itself instead of retrying a refusal.
 */
async function publishOverlayBitmap(overlay: AgentRasterLayer): Promise<void> {
  const { documentId, guest } = useLiveStore.getState();
  if (documentId === null) return;
  if (guest) {
    overlayStaysLocal(overlay, 'Joining by share link cannot upload images.');
    return;
  }
  overlayBitmaps.set(overlay.id, 'uploading');
  try {
    const decoded = decodeDataUrl(overlay.url);
    if (!decoded) throw new Error('the overlay carries no bitmap to upload');
    if (decoded.bytes.length > MAXIMUM_ATTACHMENT_BYTES) {
      overlayStaysLocal(overlay, 'The image is too large to share.');
      return;
    }
    const stored = await uploadAttachment(documentId, decoded.contentType, decoded.bytes);
    // the session may have moved on while the bytes were in flight
    if (useLiveStore.getState().documentId !== documentId) return;
    overlayBitmaps.set(overlay.id, { url: stored.url });
    syncOverlaysToDocument(useAgentLayerStore.getState().rasterLayers);
  } catch (failure) {
    overlayStaysLocal(overlay, agoraErrorText(failure, 'The image could not be shared.'));
  }
}

function overlayEntry(
  overlay: AgentRasterLayer,
  order: string,
  source: LiveLayerImageSource,
): LiveLayerEntry {
  return {
    layerId: overlay.id,
    name: overlay.name,
    type: OVERLAY_LAYER_TYPE,
    visible: overlay.visible,
    opacity: overlay.opacity,
    order,
    source,
  };
}

/**
 * Overlays travel as their attachment url and their four corners. The bitmap
 * goes up once and never again: an attachment cannot change, so a different
 * image is a different overlay.
 */
function syncOverlaysToDocument(overlays: AgentRasterLayer[]): void {
  const entries = useLiveStore.getState().document.layers;
  const present = new Set(overlays.map((overlay) => overlay.id));
  const operations: LiveOperation[] = [];

  for (const [id, entry] of Object.entries(entries)) {
    if (entry.source?.kind !== 'image') continue;
    if (present.has(id) || !documentSources.has(id)) continue;
    documentSources.delete(id);
    overlayBitmaps.delete(id);
    operations.push({ key: documentKey('layers', id), value: null });
  }

  let previousOrder = lastOrder(entries);
  for (const overlay of overlays) {
    const bitmap = overlayBitmaps.get(overlay.id);
    if (bitmap === undefined) {
      void publishOverlayBitmap(overlay);
      continue;
    }
    if (bitmap === 'uploading' || bitmap === 'unavailable') continue;
    const source: LiveLayerImageSource = {
      kind: 'image',
      url: bitmap.url,
      corners: overlay.corners,
    };
    const current = entries[overlay.id];
    const order = current?.order ?? generateIndexBetween(previousOrder, null);
    const entry = overlayEntry(overlay, order, source);
    if (current && sameLayerEntry(current, entry)) continue;
    if (!current) previousOrder = order;
    documentSources.set(overlay.id, source);
    operations.push({ key: documentKey('layers', overlay.id), value: entry });
  }

  sendOperations(operations);
}

/**
 * The handle a peer can request for themselves, or null for a layer that cannot
 * travel: a WFS layer's features are already published from the agent layers,
 * and a dropped archive is a browser File nobody else can read.
 */
function serviceSourceOf(layer: OGCLayer): LiveLayerServiceSource | null {
  if (layer.type === 'wfs' || layer.pmtiles?.local) return null;
  return { kind: 'service', service: layer.type, url: layer.url };
}

function ogcLayerEntry(
  layer: OGCLayer,
  order: string,
  source: LiveLayerServiceSource,
): LiveLayerEntry {
  return {
    layerId: layer.id,
    name: layer.name,
    type: layer.pmtiles?.kind ?? SERVICE_LAYER_TYPE,
    visible: ogcLayerVisible(layer),
    opacity: ogcLayerOpacity(layer),
    order,
    source,
  };
}

/**
 * OGC layers travel as the service handle alone, so every member fetches the
 * same tiles for themselves. Only what this browser published is ever deleted,
 * so a layer that has to stay local leaves a peer's entries alone.
 */
function syncOgcLayersToDocument(layers: OGCLayer[]): void {
  const entries = useLiveStore.getState().document.layers;
  const present = new Set(layers.map((layer) => layer.id));
  const operations: LiveOperation[] = [];

  for (const [id, entry] of Object.entries(entries)) {
    if (entry.source?.kind !== 'service') continue;
    if (present.has(id) || !documentSources.has(id)) continue;
    documentSources.delete(id);
    operations.push({ key: documentKey('layers', id), value: null });
  }

  let previousOrder = lastOrder(entries);
  for (const layer of layers) {
    const source = serviceSourceOf(layer);
    if (!source) {
      // a dropped archive is listed before it says it is one, so it can already
      // have gone, and the peers cannot read it
      if (documentSources.delete(layer.id)) {
        operations.push({ key: documentKey('layers', layer.id), value: null });
      }
      continue;
    }
    const current = entries[layer.id];
    const order = current?.order ?? generateIndexBetween(previousOrder, null);
    const entry = ogcLayerEntry(layer, order, source);
    if (current && sameLayerEntry(current, entry)) continue;
    if (!current) previousOrder = order;
    documentSources.set(layer.id, source);
    operations.push({ key: documentKey('layers', layer.id), value: entry });
  }

  sendOperations(operations);
}

function tiles3dLayerEntry(
  layer: Tiles3dLayer,
  order: string,
  source: LiveLayerTiles3dSource,
): LiveLayerEntry {
  return {
    layerId: layer.id,
    name: layer.name,
    type: TILES_3D_LAYER_TYPE,
    visible: layer.visible,
    opacity: 1,
    order,
    source,
  };
}

/**
 * A 3D tileset travels as its tileset.json url, so every member loads the same
 * tiles for themselves and the model is a layer of the map rather than a
 * primitive one browser put in its own scene.
 */
function syncTiles3dLayersToDocument(layers: Tiles3dLayer[]): void {
  const entries = useLiveStore.getState().document.layers;
  const present = new Set(layers.map((layer) => layer.id));
  const operations: LiveOperation[] = [];

  for (const [id, entry] of Object.entries(entries)) {
    if (entry.source?.kind !== 'tiles3d') continue;
    if (present.has(id) || !documentSources.has(id)) continue;
    documentSources.delete(id);
    operations.push({ key: documentKey('layers', id), value: null });
  }

  let previousOrder = lastOrder(entries);
  for (const layer of layers) {
    const source: LiveLayerTiles3dSource = { kind: 'tiles3d', url: layer.url };
    const current = entries[layer.id];
    const order = current?.order ?? generateIndexBetween(previousOrder, null);
    const entry = tiles3dLayerEntry(layer, order, source);
    if (current && sameLayerEntry(current, entry)) continue;
    if (!current) previousOrder = order;
    documentSources.set(layer.id, source);
    operations.push({ key: documentKey('layers', layer.id), value: entry });
  }

  sendOperations(operations);
}

function syncAnnotationsToDocument(annotations: Annotation[]): void {
  const entries = useLiveStore.getState().document.annotations;
  const listed = new Set(annotations.map((annotation) => annotation.id));
  const operations: LiveOperation[] = [];
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) operations.push({ key: documentKey('annotations', id), value: null });
  }
  for (const annotation of annotations) {
    if (sameJson(entries[annotation.id], annotation)) continue;
    operations.push({ key: documentKey('annotations', annotation.id), value: annotation });
  }
  sendOperations(operations);
}

function syncBookmarksToDocument(bookmarks: Bookmark[]): void {
  const entries = useLiveStore.getState().document.bookmarks;
  const listed = new Set(bookmarks.map((bookmark) => bookmark.id));
  const operations: LiveOperation[] = [];
  for (const id of Object.keys(entries)) {
    if (!listed.has(id)) operations.push({ key: documentKey('bookmarks', id), value: null });
  }
  for (const bookmark of bookmarks) {
    if (sameJson(entries[bookmark.id], bookmark)) continue;
    operations.push({ key: documentKey('bookmarks', bookmark.id), value: bookmark });
  }
  sendOperations(operations);
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

function applyEntryStyleOverrides(entry: LiveLayerEntry): void {
  const overrides = entry.styleOverrides;
  if (!overrides) return;
  const { layers, setLayerColor, setLayerOpacity, setSymbology, setZoomRange } =
    useAgentLayerStore.getState();
  const layer = layers.find((candidate) => candidate.id === entry.layerId);
  if (!layer) return;
  const color = overrides.color;
  if (color !== undefined && color !== layer.color) {
    applyFromDocument(() => setLayerColor(layer.id, color));
  }
  const opacity = overrides.style?.opacity;
  if (opacity !== undefined && opacity !== layer.style?.opacity) {
    applyFromDocument(() => setLayerOpacity(layer.id, opacity));
  }
  if (!sameJson(overrides.symbology, layer.symbology)) {
    applyFromDocument(() => setSymbology(layer.id, overrides.symbology ?? null));
  }
  if (!sameJson(overrides.zoomRange, layer.zoomRange)) {
    applyFromDocument(() => setZoomRange(layer.id, overrides.zoomRange ?? null));
  }
}

function applyStyleOverridesFromDocument(document: LiveDocument): void {
  for (const entry of Object.values(document.layers)) applyEntryStyleOverrides(entry);
}

function materializeLayer(entry: LiveLayerEntry, geojson: GeoJSON.FeatureCollection): void {
  const known = useAgentLayerStore
    .getState()
    .layers.find((candidate) => candidate.id === entry.layerId);
  applyFromDocument(() =>
    useAgentLayerStore.getState().addLayer(
      {
        id: entry.layerId,
        name: entry.name,
        color: entry.styleOverrides?.color ?? known?.color,
        geojson,
        visible: entry.visible,
      },
      false,
    ),
  );
}

/** Whether the overlay on screen already says what the entry says. */
function overlayMatchesEntry(entry: LiveLayerEntry, source: LiveLayerImageSource): boolean {
  const overlay = useAgentLayerStore
    .getState()
    .rasterLayers.find((candidate) => candidate.id === entry.layerId);
  return (
    overlay !== undefined &&
    overlay.name === entry.name &&
    overlay.visible === entry.visible &&
    overlay.opacity === entry.opacity &&
    overlay.url === attachmentSourceUrl(source.url) &&
    sameJson(overlay.corners, source.corners)
  );
}

/**
 * A peer's overlay, drawn from the attachment rather than a bitmap of our own.
 * Adding under the document's id replaces the overlay, so a corner drag moves
 * the one that is there.
 */
function materializeOverlay(entry: LiveLayerEntry, source: LiveLayerImageSource): void {
  applyFromDocument(() =>
    useAgentLayerStore.getState().addRasterLayer({
      id: entry.layerId,
      name: entry.name,
      url: attachmentSourceUrl(source.url),
      corners: source.corners,
      opacity: entry.opacity,
      visible: entry.visible,
    }),
  );
}

/** Whether the OGC layer on screen already says what the entry says. */
function ogcLayerMatchesEntry(entry: LiveLayerEntry, source: LiveLayerServiceSource): boolean {
  const layer = useOgcLayerStore
    .getState()
    .layers.find((candidate) => candidate.id === entry.layerId);
  return (
    layer !== undefined &&
    layer.name === entry.name &&
    layer.type === source.service &&
    layer.url === source.url &&
    ogcLayerVisible(layer) === entry.visible &&
    ogcLayerOpacity(layer) === entry.opacity
  );
}

/**
 * A peer's service, kept under the document's id so a later write to the same
 * key replaces it. A PMTiles archive draws only once its header has been read,
 * which is a request of our own.
 */
function materializeOgcLayer(entry: LiveLayerEntry, source: LiveLayerServiceSource): void {
  const known = useOgcLayerStore
    .getState()
    .layers.find((candidate) => candidate.id === entry.layerId);
  const layer: OGCLayer = {
    id: entry.layerId,
    name: entry.name,
    type: source.service,
    url: source.url,
    visible: entry.visible,
    opacity: entry.opacity,
    ...(known?.pmtiles ? { pmtiles: known.pmtiles } : {}),
  };
  applyFromDocument(() => useOgcLayerStore.getState().putLayer(layer));
  if (layer.type !== 'pmtiles' || layer.pmtiles) return;
  void loadPmtilesLayer(layer).catch((failure) => {
    console.warn(`live layer "${layer.name}" could not read its pmtiles archive`, failure);
  });
}

/** Whether the tileset on the globe already says what the entry says. */
function tiles3dLayerMatchesEntry(entry: LiveLayerEntry, source: LiveLayerTiles3dSource): boolean {
  const layer = useTiles3dLayerStore
    .getState()
    .layers.find((candidate) => candidate.id === entry.layerId);
  return (
    layer !== undefined &&
    layer.name === entry.name &&
    layer.url === source.url &&
    layer.visible === entry.visible
  );
}

/** A peer's model, kept under the document's id so a later write replaces it. */
function materializeTiles3dLayer(entry: LiveLayerEntry, source: LiveLayerTiles3dSource): void {
  applyFromDocument(() =>
    useTiles3dLayerStore.getState().putLayer({
      id: entry.layerId,
      name: entry.name,
      url: source.url,
      visible: entry.visible,
    }),
  );
}

async function fetchFeatureCollection(url: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const collection = toFeatureCollection(await response.json());
    if (!collection) throw new Error('not geojson');
    return collection;
  } catch (error) {
    console.warn(`live layer source ${url} could not be read`, error);
    return null;
  }
}

async function materializeUrlLayer(
  entry: LiveLayerEntry,
  source: LiveLayerUrlSource,
): Promise<void> {
  const geojson = await fetchFeatureCollection(source.url);
  if (!geojson) return;
  const current = useLiveStore.getState().document.layers[entry.layerId];
  if (!current || !sameJson(current.source, source)) return;
  materializeLayer(current, geojson);
  applyEntryStyleOverrides(current);
}

/**
 * Entries that carry data become agent layers under the document's own layer
 * id, so a later write to the same key replaces the layer rather than adding
 * a second one.
 */
function applySourcesFromDocument(document: LiveDocument): void {
  for (const [id, known] of [...documentSources.entries()]) {
    const entry = document.layers[id];
    if (entry?.source) continue;
    documentSources.delete(id);
    if (entry) continue;
    const store = useAgentLayerStore.getState();
    overlayBitmaps.delete(id);
    applyFromDocument(() => {
      if (known.kind === 'image') store.removeRasterLayer(id);
      else if (known.kind === 'service') useOgcLayerStore.getState().removeLayer(id);
      else if (known.kind === 'tiles3d') useTiles3dLayerStore.getState().removeLayer(id);
      else store.removeLayer(id);
    });
  }

  for (const entry of Object.values(document.layers)) {
    const source = entry.source;
    if (!source) continue;
    if (source.kind === 'image') {
      documentSources.set(entry.layerId, source);
      // our own overlay is already on screen, from the bitmap we still hold
      if (overlayBitmaps.has(entry.layerId)) continue;
      if (!overlayMatchesEntry(entry, source)) materializeOverlay(entry, source);
      continue;
    }
    if (source.kind === 'service') {
      documentSources.set(entry.layerId, source);
      if (!ogcLayerMatchesEntry(entry, source)) materializeOgcLayer(entry, source);
      continue;
    }
    if (source.kind === 'tiles3d') {
      documentSources.set(entry.layerId, source);
      if (!tiles3dLayerMatchesEntry(entry, source)) materializeTiles3dLayer(entry, source);
      continue;
    }
    if (sameJson(documentSources.get(entry.layerId), source)) continue;
    documentSources.set(entry.layerId, source);
    if (source.kind === 'url') {
      void materializeUrlLayer(entry, source);
      continue;
    }
    const geojson = toFeatureCollection(source.geojson);
    if (geojson) materializeLayer(entry, geojson);
  }
}

/**
 * Materializing does not always reach a layer already on screen: our own
 * overlay keeps the bitmap we hold, and a vector layer waits for a new source.
 */
function applyVisibilityFromDocument(document: LiveDocument): void {
  const { layers, rasterLayers, setLayerVisible } = useAgentLayerStore.getState();
  for (const entry of Object.values(document.layers)) {
    const drawn =
      layers.find((layer) => layer.id === entry.layerId) ??
      rasterLayers.find((overlay) => overlay.id === entry.layerId);
    if (!drawn || (drawn.visible ?? true) === entry.visible) continue;
    applyFromDocument(() => setLayerVisible(entry.layerId, entry.visible));
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
  applySourcesFromDocument(document);
  applyVisibilityFromDocument(document);
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
  syncAgentLayerSourcesToDocument(local.agentLayers);
  syncOverlaysToDocument(local.overlays);
  syncOgcLayersToDocument(local.ogcLayers);
  syncTiles3dLayersToDocument(local.tiles3dLayers);
  syncStyleOverridesToDocument();
  syncAnnotationsToDocument(local.annotations);
  syncBookmarksToDocument(local.bookmarks);
}

/**
 * Hold what this browser has on screen so the first snapshot of a document we
 * just created starts from it instead of wiping it.
 *
 * TODO: a stored project in IndexedDB, and any layer too large to inline, stay
 * behind. Only what the running session holds and what fits travels.
 */
export function captureStateForNewDocument(): void {
  const { layers, bookmarks } = useAppStore.getState();
  const agent = useAgentLayerStore.getState();
  stateForNewDocument = {
    layers,
    bookmarks,
    agentLayers: agent.layers,
    overlays: agent.rasterLayers,
    ogcLayers: useOgcLayerStore.getState().layers,
    tiles3dLayers: useTiles3dLayerStore.getState().layers,
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
    if (state.rasterLayers !== previous.rasterLayers) {
      outbound(() => syncOverlaysToDocument(state.rasterLayers));
    }
    if (state.layers === previous.layers) return;
    outbound(() => {
      syncAgentLayerSourcesToDocument(state.layers);
      syncStyleOverridesToDocument();
    });
  });

  const unsubscribeOgcLayers = useOgcLayerStore.subscribe((state, previous) => {
    if (state.layers === previous.layers) return;
    outbound(() => syncOgcLayersToDocument(state.layers));
  });

  const unsubscribeTiles3dLayers = useTiles3dLayerStore.subscribe((state, previous) => {
    if (state.layers === previous.layers) return;
    outbound(() => syncTiles3dLayersToDocument(state.layers));
  });

  const unsubscribeLive = useLiveStore.subscribe((state, previous) => {
    if (state.documentId === null) {
      if (previous.documentId !== null) {
        stateForNewDocument = null;
        documentSources.clear();
        oversizedLayerIds.clear();
        overlayBitmaps.clear();
        applyFromDocument(() => {
          useAnnotationStore.getState().setAnnotations(loadStoredAnnotations());
          restoreLocalBookmarks();
        });
      }
      return;
    }
    if (previous.documentId === null) holdLocalBookmarks();
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
    unsubscribeOgcLayers();
    unsubscribeTiles3dLayers();
    unsubscribeLive();
  };
}
