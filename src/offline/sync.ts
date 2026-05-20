/**
 * Sync Engine — push local changes to server when online.
 *
 * Design:
 * - All mutations go to IndexedDB first (always fast, always works)
 * - Each mutation also creates a PendingOperation
 * - When online, the sync engine processes pending ops in FIFO order
 * - Failed ops are retried with exponential backoff
 * - Like git: work offline, sync when you choose
 */

import { pendingOps, type PendingOperation } from './db';
import { isOnline } from './network';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;

const listeners = new Set<SyncListener>();
let syncState: SyncState = {
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
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
  const count = await pendingOps.count();
  setState({ pendingCount: count });

  // Trigger sync if online
  if (isOnline()) {
    scheduleSyncSoon();
  }
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

  for (const op of ops) {
    try {
      await executeSync(op);
      await pendingOps.remove(op.id);
    } catch (err) {
      allSucceeded = false;
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
    status: allSucceeded ? 'idle' : 'error',
    pendingCount: remaining,
    lastSyncAt: allSucceeded ? Date.now() : syncState.lastSyncAt,
    lastError: allSucceeded ? null : syncState.lastError,
  });

  isSyncing = false;
}

/** Execute a single sync operation against the server */
async function executeSync(op: PendingOperation): Promise<void> {
  const baseUrl = getServerUrl();
  if (!baseUrl) {
    throw new Error('No server URL configured');
  }

  const resourcePath = getResourcePath(op.resource, op.resourceId);
  const url = `${baseUrl}${resourcePath}`;

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
    body: op.type !== 'delete' ? JSON.stringify(op.payload) : undefined,
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
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
  setState({ pendingCount: 0, status: 'idle', lastError: null });
}
