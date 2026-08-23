/**
 * Sync Engine — push local changes to server when online.
 *
 * Design:
 * - All mutations go to IndexedDB first (always fast, always works)
 * - Each mutation also creates a PendingOperation
 * - When online, the sync engine processes pending ops in FIFO order
 * - Failed ops are retried with exponential backoff
 * - Conflicts are detected via three-way merge (base vs local vs server)
 * - Like git: work offline, sync when you choose
 */

import { features, hasIndexedDb, pendingOps, type OfflineFeature, type PendingOperation } from './db';
import { isOnline } from './network';
import {
  threeWayMerge,
  type ConflictResolution,
  type MergeConflict,
  type FeatureVersion,
} from './conflicts';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflicts';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Unresolved conflicts from last sync attempt */
  conflicts: MergeConflict[];
}

type SyncListener = (state: SyncState) => void;

const listeners = new Set<SyncListener>();
let syncState: SyncState = {
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  conflicts: [],
};
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

function notify() {
  for (const fn of listeners) fn(syncState);
}

function setState(partial: Partial<SyncState>) {
  syncState = { ...syncState, ...partial };
  notify();
}

/** Subscribe to sync state changes */
export function onSyncStateChange(fn: SyncListener): () => void {
  listeners.add(fn);
  fn(syncState); // Immediately emit current state
  return () => listeners.delete(fn);
}

/** Get current sync state */
export function getSyncState(): SyncState {
  return syncState;
}

/** Queue a new operation for sync */
export async function queueOperation(
  type: PendingOperation['type'],
  resource: PendingOperation['resource'],
  resourceId: string,
  payload: unknown,
): Promise<void> {
  const op: PendingOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    type,
    resource,
    resourceId,
    payload,
    attempts: 0,
  };
  await pendingOps.add(op);
  await announceQueued();
}

async function announceQueued(): Promise<void> {
  setState({ pendingCount: await pendingOps.count() });
  if (isOnline()) {
    scheduleSyncSoon();
  }
}

/** Payload of a queued feature update, shaped for the three-way merge on sync. */
interface FeatureUpdatePayload {
  layerId: string;
  /** State at the last sync, the merge's common ancestor */
  base: FeatureVersion | null;
  /** State this browser edited to */
  ours: FeatureVersion;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
}

function featureUpdateOpId(featureId: string): string {
  return `feature-update-${featureId}`;
}

function isFeatureUpdate(op: PendingOperation): boolean {
  return (
    op.type === 'update' &&
    op.resource === 'feature' &&
    typeof op.payload === 'object' &&
    op.payload !== null &&
    'ours' in op.payload
  );
}

function toFeatureVersion(feature: OfflineFeature | undefined): FeatureVersion | null {
  if (!feature) return null;
  return {
    id: feature.id,
    properties: feature.properties,
    geometry: feature.geometry,
    updatedAt: feature.updatedAt,
  };
}

/**
 * Queue a feature edit for sync. Repeat edits to one feature share an op id so
 * they collapse into a single update whose base stays at the last synced state.
 */
export async function queueFeatureUpdate(layerId: string, ours: FeatureVersion): Promise<void> {
  if (!hasIndexedDb()) return;

  const id = featureUpdateOpId(ours.id);
  const queued = (await pendingOps.getAll()).find((op) => op.id === id);
  const payload: FeatureUpdatePayload = {
    layerId,
    base: queued
      ? (queued.payload as FeatureUpdatePayload).base
      : toFeatureVersion(await features.get(ours.id)),
    ours,
    properties: ours.properties,
    geometry: ours.geometry,
  };

  await pendingOps.add({
    id,
    createdAt: queued?.createdAt ?? Date.now(),
    type: 'update',
    resource: 'feature',
    resourceId: ours.id,
    payload,
    attempts: 0,
  });
  await announceQueued();
}

/**
 * Replace queued feature updates with the versions the user picked, then sync.
 * The server version becomes the new base so the retry merges cleanly.
 */
export async function applyConflictResolutions(
  resolutions: ConflictResolution[],
): Promise<void> {
  const queued = await pendingOps.getAll();

  for (const resolution of resolutions) {
    const op = queued.find((candidate) => candidate.id === featureUpdateOpId(resolution.featureId));
    if (!op) continue;

    const payload = op.payload as FeatureUpdatePayload;
    const conflict = syncState.conflicts.find((c) => c.featureId === resolution.featureId);
    await pendingOps.add({
      ...op,
      attempts: 0,
      lastError: undefined,
      payload: {
        ...payload,
        base: conflict?.theirs ?? payload.base,
        ours: {
          ...payload.ours,
          properties: resolution.properties,
          geometry: resolution.geometry,
          updatedAt: Date.now(),
        },
        properties: resolution.properties,
        geometry: resolution.geometry,
      } satisfies FeatureUpdatePayload,
    });
  }

  setState({ conflicts: [], status: 'idle' });
  await syncNow();
}

/** Schedule a sync attempt soon (debounced) */
function scheduleSyncSoon() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 1000);
}

/** Manually trigger sync (e.g. user clicks "Sync Now") */
export async function syncNow(): Promise<void> {
  if (isSyncing) return;
  if (!isOnline()) {
    setState({ status: 'idle', lastError: 'Offline — will sync when connected' });
    return;
  }

  isSyncing = true;
  setState({ status: 'syncing', lastError: null });

  const ops = await pendingOps.getAll();
  // Sort by creation time (FIFO)
  ops.sort((a, b) => a.createdAt - b.createdAt);

  let allSucceeded = true;
  const conflicts: MergeConflict[] = [];

  for (const op of ops) {
    try {
      await executeSync(op);
      await pendingOps.remove(op.id);
    } catch (err) {
      allSucceeded = false;
      if (err instanceof ConflictError) {
        // stays queued until the user picks a side, and is not a failed attempt
        conflicts.push(...err.conflicts);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await pendingOps.updateAttempts(op.id, message);

      // If too many attempts, skip and continue with others
      if (op.attempts >= 5) {
        console.warn(`[sync] Giving up on op ${op.id} after 5 attempts: ${message}`);
        continue;
      }
      // Stop on first transient error (server might be down)
      if (isTransientError(err)) {
        setState({ status: 'error', lastError: message });
        break;
      }
    }
  }

  const remaining = await pendingOps.count();
  setState({
    status: statusAfterSync(conflicts.length, allSucceeded),
    pendingCount: remaining,
    lastSyncAt: allSucceeded ? Date.now() : syncState.lastSyncAt,
    lastError: allSucceeded ? null : syncState.lastError,
    conflicts,
  });

  isSyncing = false;
}

function statusAfterSync(conflictCount: number, allSucceeded: boolean): SyncStatus {
  if (conflictCount > 0) return 'conflicts';
  return allSucceeded ? 'idle' : 'error';
}

/** Execute a single sync operation against the server */
async function executeSync(op: PendingOperation): Promise<void> {
  const baseUrl = getServerUrl();
  if (!baseUrl) {
    throw new Error('No server URL configured');
  }

  const resourcePath = getResourcePath(op.resource, op.resourceId);
  const url = `${baseUrl}${resourcePath}`;

  const featureUpdate = isFeatureUpdate(op) ? (op.payload as FeatureUpdatePayload) : null;

  if (featureUpdate) {
    const serverResp = await fetch(url);
    if (serverResp.ok) {
      const theirs: FeatureVersion = await serverResp.json();
      const mergeResult = threeWayMerge(featureUpdate.base, featureUpdate.ours, theirs);
      if (mergeResult.conflicts.length > 0) {
        throw new ConflictError(mergeResult.conflicts);
      }
      if (mergeResult.resolved.length > 0) {
        const merged = mergeResult.resolved[0];
        featureUpdate.properties = merged.mergedProperties;
        if (merged.mergedGeometry) {
          featureUpdate.geometry = merged.mergedGeometry;
        }
      }
    }
  }

  let method: string;
  switch (op.type) {
    case 'create':
      method = 'POST';
      break;
    case 'update':
      method = 'PUT';
      break;
    case 'delete':
      method = 'DELETE';
      break;
  }

  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: op.type !== 'delete' ? JSON.stringify(requestBody(op, featureUpdate)) : undefined,
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  if (featureUpdate) {
    await recordSyncedFeature(op.resourceId, featureUpdate);
  }
}

/** The merge bookkeeping stays local, the server sees the merged feature. */
function requestBody(op: PendingOperation, featureUpdate: FeatureUpdatePayload | null): unknown {
  if (!featureUpdate) return op.payload;
  return { properties: featureUpdate.properties, geometry: featureUpdate.geometry };
}

/** What was just sent becomes the base for the next edit's merge. */
async function recordSyncedFeature(
  featureId: string,
  featureUpdate: FeatureUpdatePayload,
): Promise<void> {
  const geometry = featureUpdate.geometry ?? featureUpdate.ours.geometry;
  if (!geometry) return;
  await features.put({
    id: featureId,
    layerId: featureUpdate.layerId,
    geometry,
    properties: featureUpdate.properties,
    updatedAt: Date.now(),
  });
}

/** Error thrown when conflicts are detected */
export class ConflictError extends Error {
  conflicts: MergeConflict[];
  constructor(conflicts: MergeConflict[]) {
    super(`${conflicts.length} conflict(s) detected`);
    this.conflicts = conflicts;
  }
}

function getResourcePath(resource: string, id: string): string {
  switch (resource) {
    case 'layer':
      return `/layers/${id}`;
    case 'feature':
      return `/features/${id}`;
    case 'annotation':
      return `/annotations/${id}`;
    case 'bookmark':
      return `/bookmarks/${id}`;
    case 'session':
      return `/sessions/${id}`;
    default:
      return `/${resource}/${id}`;
  }
}

function getServerUrl(): string | null {
  // Read from localStorage (set by app store settings)
  try {
    const stored = localStorage.getItem('viewtopia-app');
    if (stored) {
      const parsed = JSON.parse(stored);
      const url = parsed?.state?.settings?.tiletopiaUrl;
      if (url && !url.startsWith('/')) return url;
    }
  } catch { /* ignore */ }
  // Fallback: relative path (works when server is on same origin)
  return '/api/v1';
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('fetch') ||
      err.message.includes('network') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('503') ||
      err.message.includes('502') ||
      err.message.includes('504')
    );
  }
  return false;
}

// ─── Auto-sync on reconnect ─────────────────────────────────────────

let initialized = false;

/** Initialize the sync engine — call once at app startup */
export function initSync(): void {
  if (initialized) return;
  initialized = true;

  // Sync when coming back online
  window.addEventListener('online', () => {
    console.log('[sync] Back online — syncing pending changes…');
    scheduleSyncSoon();
  });

  // Update pending count on startup
  pendingOps.count().then((count) => {
    setState({ pendingCount: count });
    // Auto-sync on startup if there are pending ops
    if (count > 0 && isOnline()) {
      scheduleSyncSoon();
    }
  });
}

/** Discard all pending operations (e.g. user wants to reset) */
export async function discardPending(): Promise<void> {
  await pendingOps.clear();
  setState({ pendingCount: 0, status: 'idle', lastError: null, conflicts: [] });
}

/** Clear conflicts (after user resolves them) */
export function clearConflicts(): void {
  setState({ conflicts: [], status: 'idle' });
}
