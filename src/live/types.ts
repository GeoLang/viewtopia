import type { Corners } from '../overlay/georeference';
import type { Symbology } from '../features/symbology/symbology';
import type { AgentLayerStyle, ZoomRange } from '../store/agentLayers';
import type { LayerItem } from '../store/app';
import type { OGCType } from '../store/ogcLayers';
import type { CameraState } from '../store/cameraViews';

export type LiveRole = 'view' | 'edit';

export interface LiveLayerStyleOverrides {
  /** the publisher's colour for the layer, as CSS */
  color?: string;
  style?: AgentLayerStyle;
  symbology?: Symbology | null;
  /** the zoom levels the publisher limited the layer to */
  zoomRange?: ZoomRange | null;
}

/**
 * Features carried in the document itself. Agora never reads an op value, so
 * the size cap below is the only thing keeping an inline source postable.
 */
export interface LiveLayerInlineSource {
  kind: 'geojson';
  geojson: GeoJSON.FeatureCollection;
}

/** Features hosted elsewhere, which every member fetches for themselves. */
export interface LiveLayerUrlSource {
  kind: 'url';
  url: string;
  format: 'geojson';
}

/**
 * An image draped over four corners. The bitmap is an agora attachment, which
 * never changes, so the url stands for one bitmap for good and a replacement
 * image is a new attachment.
 */
export interface LiveLayerImageSource {
  kind: 'image';
  /** the attachment path, under the agora base every client already talks to */
  url: string;
  corners: Corners;
}

/**
 * A tile or map service each member requests for themselves, so the handle
 * travels and the tiles never do. WFS is left out: its features are already in
 * the agent layers, and travel from there as an inline source.
 */
export interface LiveLayerServiceSource {
  kind: 'service';
  service: Exclude<OGCType, 'wfs'>;
  url: string;
}

/**
 * A 3D Tiles tileset on the globe, as the tileset.json url every member loads
 * for themselves. The tiles carry each element's `asset_id`, so the asset rule
 * colours them the way it colours a 2D feature.
 */
export interface LiveLayerTiles3dSource {
  kind: 'tiles3d';
  url: string;
}

export type LiveLayerSource =
  | LiveLayerInlineSource
  | LiveLayerUrlSource
  | LiveLayerImageSource
  | LiveLayerServiceSource
  | LiveLayerTiles3dSource;

/**
 * Headroom under agora's 64KiB per-operation cap, measured over the whole
 * serialized entry rather than the features alone.
 */
export const MAXIMUM_INLINE_SOURCE_BYTES = 48 * 1024;

/**
 * A layer in the document. Without `source` it is a reference to a layer the
 * member already has, with one it also carries the data to draw.
 */
export interface LiveLayerEntry {
  layerId: string;
  name: string;
  type: LayerItem['type'];
  visible: boolean;
  opacity: number;
  order: string;
  styleOverrides?: LiveLayerStyleOverrides;
  source?: LiveLayerSource;
}

export interface LiveAnnotation {
  id: string;
  label: string;
  color: string;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface LiveBookmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  heading?: number;
  pitch?: number;
  camera?: CameraState;
  createdAt: number;
}

/** Where a comment points on the map, captured when it was written. */
export interface LiveCommentAnchor {
  lng: number;
  lat: number;
  zoom: number;
  /** the author pinned this point, so it draws on the map instead of only flying to */
  placed?: boolean;
}

/**
 * A member this comment names. `name` is the display name at pick time, which
 * is what the text carries as `@name`, so rendering can find the token later.
 * Agora reads `userId` to notify the member.
 */
export interface LiveCommentMention {
  userId: string;
  name: string;
}

/**
 * One comment. A reply carries the id of the top level comment it answers, so a
 * thread is a group rather than a nested value, and `resolved` only ever sits on
 * a top level comment.
 *
 * `authorName` is the display name at write time. A share link guest has no
 * platform identity to look the name up from later.
 */
export interface LiveComment {
  id: string;
  actor: string;
  authorName: string;
  text: string;
  createdAt: number;
  parentId?: string | null;
  anchor?: LiveCommentAnchor | null;
  resolved?: boolean;
  mentions?: LiveCommentMention[];
}

/** One colour, and the reading value at or above which it applies. */
export interface AssetBreakpoint {
  value: number;
  color: string;
}

/**
 * How the map colours the assets on one layer. The colour for a reading is the
 * last breakpoint in ascending order whose value is at or below it, and
 * `defaultColor` covers a reading below every breakpoint or no reading at all.
 */
export interface AssetRule {
  layerId: string;
  kind: string;
  breakpoints: AssetBreakpoint[];
  defaultColor: string;
  offlineColor: string;
}

/** The document holds one rule, under this id. */
export const ASSET_RULE_ID = 'rule';

/**
 * The property carrying the asset id, never a feature id: ptolemy writes it on
 * the feature and the mesh tiler writes it on the tile feature.
 */
export const ASSET_ID_PROPERTY = 'asset_id';

/** One value a feed sent for one asset. */
export interface AssetReading {
  asset: string;
  kind: string;
  value: number;
  at: string;
}

/** Everything agora holds for one asset right now. */
export interface AssetSnapshot {
  asset: string;
  feed: string;
  online: boolean;
  values: { kind: string; value: number; at: string }[];
}

/** What a watch reduces its region to, one of geoplumb's zonal row fields. */
export type WatchReducer = 'mean' | 'min' | 'max' | 'sum' | 'count';

/** Which side of its threshold a watch alerts on. */
export type WatchThresholdOp = 'gt' | 'lt';

export type WatchRegion = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/**
 * One region watch as everyone on the document sees it. The webhook halves are
 * there only for a caller who can edit, and the websocket frame carries neither.
 */
export interface RegionWatch {
  id: string;
  name: string;
  layer: string;
  region: WatchRegion;
  reducer: WatchReducer;
  intervalSeconds: number;
  thresholdOp: WatchThresholdOp | null;
  thresholdValue: number | null;
  createdBy: string;
  createdAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  webhookUrl?: string;
  webhookSecret?: string;
}

/** One stored reading, as the readings route answers for it. */
export interface WatchReadingEntry {
  at: string;
  value: number;
  count: number;
}

/** One run of a watch, as the socket relays it while the run happens. */
export interface WatchReading extends WatchReadingEntry {
  /** set on the run that crossed the watch's threshold */
  tripped: boolean;
}

export interface LiveDocumentMeta {
  name: string;
}

export interface LiveDocument {
  meta: LiveDocumentMeta;
  layers: Record<string, LiveLayerEntry>;
  annotations: Record<string, LiveAnnotation>;
  bookmarks: Record<string, LiveBookmark>;
  comments: Record<string, LiveComment>;
  assets: Record<string, AssetRule>;
}

export const DOCUMENT_NAMESPACES = [
  'meta',
  'layers',
  'annotations',
  'bookmarks',
  'comments',
  'assets',
] as const;

export type DocumentNamespace = (typeof DOCUMENT_NAMESPACES)[number];

export interface DocumentKey {
  namespace: DocumentNamespace;
  id: string;
}

export interface LiveViewport {
  center: [number, number];
  zoom: number;
}

export interface LivePresence {
  cursor: [number, number] | null;
  selection: string[];
  viewport: LiveViewport | null;
}

export interface LivePeer {
  actor: string;
  name: string;
  role: LiveRole;
}

/** One key and the value to write there, `null` being a delete. */
export interface LiveOperation {
  key: string;
  value: unknown;
}

export interface ClientOperationMessage extends LiveOperation {
  type: 'op';
  clientSeq: number;
}

/**
 * Operations the server applies all or nothing, so peers never render a torn
 * intermediate state. One clientSeq covers the frame and one ack answers it.
 */
export interface ClientBatchMessage {
  type: 'batch';
  clientSeq: number;
  ops: LiveOperation[];
}

export interface ClientPresenceMessage extends LivePresence {
  type: 'presence';
}

export type ClientMessage = ClientOperationMessage | ClientBatchMessage | ClientPresenceMessage;

export interface ServerSnapshotMessage {
  type: 'snapshot';
  seq: number;
  state: LiveDocument;
  /** who the server says we are, which is how our own writes get attributed */
  actor?: string;
  role?: LiveRole;
}

export interface ServerOperationMessage {
  type: 'op';
  seq: number;
  actor: string;
  key: string;
  value: unknown;
}

/** An operation the server ordered, carrying the seq it gave it. */
export interface AppliedOperation extends LiveOperation {
  seq: number;
}

/**
 * A batch as the server relays it, live or replayed from a reconnect's `since`.
 * Each op carries its own seq, so a batch only groups them.
 */
export interface ServerBatchMessage {
  type: 'batch';
  actor: string;
  ops: AppliedOperation[];
}

export interface ServerAckMessage {
  type: 'ack';
  clientSeq: number;
  seq: number;
}

export interface ServerPeersMessage {
  type: 'peers';
  peers: LivePeer[];
}

export interface ServerErrorMessage {
  type: 'error';
  reason: string;
}

/**
 * The pinned server frames carry no presence relay, yet cursors have to reach
 * peers somehow, so we read the symmetric echo of the client frame plus actor.
 */
export interface ServerPresenceMessage extends LivePresence {
  type: 'presence';
  actor: string;
}

/** Readings a feed just sent, fanned out to everyone holding the document. */
export interface ServerReadingsMessage {
  type: 'readings';
  feed: string;
  readings: AssetReading[];
}

/** Every asset's current state, sent once per join after the snapshot. */
export interface ServerAssetsMessage {
  type: 'assets';
  assets: AssetSnapshot[];
}

/** An asset went quiet for three feed intervals, or started answering again. */
export interface ServerLivenessMessage {
  type: 'liveness';
  asset: string;
  online: boolean;
  at: string;
}

/** Every region watch on the document, sent once per join after `assets`. */
export interface ServerWatchesMessage {
  type: 'watches';
  watches: RegionWatch[];
}

/** What a watch just measured, relayed on every run that produced a number. */
export interface ServerWatchReadingMessage extends WatchReading {
  type: 'watchReading';
  watch: string;
}

export type ServerMessage =
  | ServerSnapshotMessage
  | ServerOperationMessage
  | ServerBatchMessage
  | ServerAckMessage
  | ServerPeersMessage
  | ServerErrorMessage
  | ServerPresenceMessage
  | ServerReadingsMessage
  | ServerAssetsMessage
  | ServerLivenessMessage
  | ServerWatchesMessage
  | ServerWatchReadingMessage;

export interface LiveDocumentSummary {
  id: string;
  name: string;
}

export interface LiveLinkResolution {
  doc: string;
  role: LiveRole;
  sessionToken: string;
}

export function emptyLiveDocument(name = ''): LiveDocument {
  return { meta: { name }, layers: {}, annotations: {}, bookmarks: {}, comments: {}, assets: {} };
}

export function documentKey(namespace: DocumentNamespace, id: string): string {
  return `${namespace}/${id}`;
}

export function parseDocumentKey(key: string): DocumentKey | null {
  const separator = key.indexOf('/');
  if (separator <= 0) return null;
  const namespace = key.slice(0, separator) as DocumentNamespace;
  const id = key.slice(separator + 1);
  if (id.length === 0) return null;
  if (!DOCUMENT_NAMESPACES.includes(namespace)) return null;
  return { namespace, id };
}

function withEntry<Entry>(
  entries: Record<string, Entry>,
  id: string,
  value: Entry | null,
): Record<string, Entry> {
  const next = { ...entries };
  if (value === null) delete next[id];
  else next[id] = value;
  return next;
}

/** What the document holds at one key, null when nothing is there. */
export function readDocumentKey(document: LiveDocument, key: string): unknown {
  const parsed = parseDocumentKey(key);
  if (!parsed) return null;
  switch (parsed.namespace) {
    case 'meta':
      return document.meta[parsed.id as keyof LiveDocumentMeta] ?? null;
    case 'layers':
      return document.layers[parsed.id] ?? null;
    case 'annotations':
      return document.annotations[parsed.id] ?? null;
    case 'bookmarks':
      return document.bookmarks[parsed.id] ?? null;
    case 'comments':
      return document.comments[parsed.id] ?? null;
    case 'assets':
      return document.assets[parsed.id] ?? null;
  }
}

/** Writes one key into a copy of the document, treating null as a delete. */
export function applyDocumentKey(
  document: LiveDocument,
  key: string,
  value: unknown,
): LiveDocument {
  const parsed = parseDocumentKey(key);
  if (!parsed) return document;
  switch (parsed.namespace) {
    case 'meta':
      return { ...document, meta: { ...document.meta, [parsed.id]: value as string } };
    case 'layers':
      return {
        ...document,
        layers: withEntry(document.layers, parsed.id, value as LiveLayerEntry | null),
      };
    case 'annotations':
      return {
        ...document,
        annotations: withEntry(document.annotations, parsed.id, value as LiveAnnotation | null),
      };
    case 'bookmarks':
      return {
        ...document,
        bookmarks: withEntry(document.bookmarks, parsed.id, value as LiveBookmark | null),
      };
    case 'comments':
      return {
        ...document,
        comments: withEntry(document.comments, parsed.id, value as LiveComment | null),
      };
    case 'assets':
      return {
        ...document,
        assets: withEntry(document.assets, parsed.id, value as AssetRule | null),
      };
  }
}
