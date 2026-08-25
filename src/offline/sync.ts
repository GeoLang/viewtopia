/**
 * Sync Engine — push queued feature edits to ptolemy when online.
 *
 * An edit lands in IndexedDB first and queues a PendingOperation. When online,
 * queued ops go out in FIFO order: read the branch head, three-way merge it
 * against the edit's base, then commit. A property both sides changed stops the
 * op and asks the user which side wins.
 */

import { notifications } from '@mantine/notifications';
import { hasIndexedDb, pendingOps, type PendingOperation } from './db';
import { isUnreachableStatus } from './backends';
import { isOnline } from './network';
import { commitFeatureUpdate, fetchBranchFeature } from '../lib/branchFeatures';
import { PtolemyRequestError } from '../projects/api';
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

async function announceQueued(): Promise<void> {
  setState({ pendingCount: await pendingOps.count() });
  if (isOnline()) {
    scheduleSyncSoon();
  }
}

/** Payload of a queued feature update, shaped for the three-way merge on sync. */
interface FeatureUpdatePayload {
  /** The ptolemy branch the edit commits to */
  branchId: string;
  /** What the branch held when the feature was opened, the merge's ancestor */
  base: FeatureVersion | null;
  /** State this browser edited to */
  ours: FeatureVersion;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
}

function featureUpdateOpId(featureId: string): string {
  return `feature-update-${featureId}`;
}

/** The payload of a syncable op, or null for one this build cannot send. */
function featureUpdate(op: PendingOperation): FeatureUpdatePayload | null {
  if (op.type !== 'update' || op.resource !== 'feature') return null;
  if (typeof op.payload !== 'object' || op.payload === null) return null;
  const payload = op.payload as Partial<FeatureUpdatePayload>;
  if (!payload.ours || !payload.branchId) return null;
  return payload as FeatureUpdatePayload;
}

/**
 * Queue a feature edit for sync. `base` is what the branch held when the editor
 * opened the feature, the merge's common ancestor. Repeat edits to one feature
 * share an op id and collapse into a single update keeping the first base.
 */
export async function queueFeatureUpdate(
  branchId: string,
  ours: FeatureVersion,
  base: FeatureVersion | null,
): Promise<void> {
  if (!hasIndexedDb()) return;

  const id = featureUpdateOpId(ours.id);
  const queued = (await pendingOps.getAll()).find((op) => op.id === id);
  const payload: FeatureUpdatePayload = {
    branchId,
    base: queued ? (queued.payload as FeatureUpdatePayload).base : base,
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
  let refusal: string | null = null;
  const conflicts: MergeConflict[] = [];

  for (const op of ops) {
    try {
      await executeSync(op);
      await pendingOps.remove(op.id);
    } catch (err) {
      if (err instanceof UnsendableError) {
        console.warn(`[sync] discarding ${op.id}: ${err.message}`);
        await pendingOps.remove(op.id);
        continue;
      }
      const refusedWith = refusalMessage(err);
      if (refusedWith) {
        // the server will refuse it again, so drop it instead of counting an attempt
        await pendingOps.remove(op.id);
        notifications.show({ title: 'Edit refused', message: refusedWith, color: 'red' });
        refusal = refusedWith;
        setState({ lastError: refusedWith });
        continue;
      }
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
    lastError: allSucceeded ? refusal : syncState.lastError,
    conflicts,
  });

  isSyncing = false;
}

function statusAfterSync(conflictCount: number, allSucceeded: boolean): SyncStatus {
  if (conflictCount > 0) return 'conflicts';
  return allSucceeded ? 'idle' : 'error';
}

/**
 * Merge one queued edit against the branch head and commit it. A feature the
 * branch does not hold has no "theirs", so the edit goes as it stands.
 */
async function executeSync(op: PendingOperation): Promise<void> {
  const update = featureUpdate(op);
  if (!update) {
    throw new UnsendableError(`op ${op.id} carries no branch to sync to`);
  }

  const head = await fetchBranchFeature(update.branchId, op.resourceId);
  if (head) {
    const theirs: FeatureVersion = {
      id: head.id,
      properties: head.properties,
      geometry: head.geometry ?? undefined,
    };
    const mergeResult = threeWayMerge(update.base, update.ours, theirs);
    if (mergeResult.conflicts.length > 0) {
      throw new ConflictError(mergeResult.conflicts);
    }
    if (mergeResult.resolved.length > 0) {
      const merged = mergeResult.resolved[0];
      update.properties = merged.mergedProperties;
      if (merged.mergedGeometry) {
        update.geometry = merged.mergedGeometry;
      }
    }
  }

  await commitFeatureUpdate(update.branchId, op.resourceId, update.properties, update.geometry);
}

/** Error thrown when conflicts are detected */
export class ConflictError extends Error {
  conflicts: MergeConflict[];
  constructor(conflicts: MergeConflict[]) {
    super(`${conflicts.length} conflict(s) detected`);
    this.conflicts = conflicts;
  }
}

/** A queue entry an older build wrote that this one has no way to send. */
class UnsendableError extends Error {}

function isTransientError(err: unknown): boolean {
  return err instanceof PtolemyRequestError && isUnreachableStatus(err.status);
}

const REFUSAL_STATUSES = new Set([401, 403]);
const NO_WRITE_ACCESS = 'you do not have write access to this branch';

/** Why the server refused the commit outright, or null when it did not. */
function refusalMessage(err: unknown): string | null {
  if (!(err instanceof PtolemyRequestError)) return null;
  if (!REFUSAL_STATUSES.has(err.status)) return null;
  return err.responseText.trim() || NO_WRITE_ACCESS;
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
