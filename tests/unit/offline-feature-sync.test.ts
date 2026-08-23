import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom has no indexeddb and fake-indexeddb is not a dependency, so the stores
// are the seam: the queue coalescing, the three-way merge and the request the
// sync engine sends all stay real
const db = vi.hoisted(() => ({
  ops: new Map<string, { id: string; createdAt: number; payload: unknown; attempts: number; type: string; resource: string; resourceId: string; lastError?: string }>(),
  features: new Map<string, { id: string; layerId: string; geometry: unknown; properties: Record<string, unknown>; updatedAt: number }>(),
}));

vi.mock('../../src/offline/db', () => ({
  hasIndexedDb: () => true,
  pendingOps: {
    getAll: async () => [...db.ops.values()],
    add: async (op: { id: string }) => {
      db.ops.set(op.id, op as never);
    },
    remove: async (id: string) => {
      db.ops.delete(id);
    },
    clear: async () => db.ops.clear(),
    count: async () => db.ops.size,
    updateAttempts: async (id: string, error: string) => {
      const op = db.ops.get(id);
      if (op) {
        op.attempts += 1;
        op.lastError = error;
      }
    },
  },
  features: {
    get: async (id: string) => db.features.get(id),
    put: async (feature: { id: string }) => {
      db.features.set(feature.id, feature as never);
    },
  },
}));

vi.mock('../../src/offline/network', () => ({
  isOnline: () => true,
}));

import {
  queueFeatureUpdate,
  applyConflictResolutions,
  syncNow,
  discardPending,
  getSyncState,
} from '../../src/offline/sync';
import { useDrawStore } from '../../src/store/draw';

const FEATURE_ID = 'feat-1';
const OP_ID = `feature-update-${FEATURE_ID}`;
const POINT = { type: 'Point', coordinates: [10, 50] };

function seedSyncedFeature(properties: Record<string, unknown>) {
  db.features.set(FEATURE_ID, {
    id: FEATURE_ID,
    layerId: 'viewtopia-drawn',
    geometry: POINT,
    properties,
    updatedAt: 1,
  });
}

/** What the server currently holds, and the PUT bodies it received. */
function serveFeature(serverProperties: Record<string, unknown>) {
  const puts: unknown[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return {
        ok: true,
        json: async () => ({
          id: FEATURE_ID,
          properties: serverProperties,
          geometry: POINT,
          updatedAt: 2,
        }),
      } as Response;
    }
    puts.push(JSON.parse(init.body as string));
    return { ok: true, status: 200, statusText: 'OK' } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { puts, fetchMock };
}

describe('feature edits queue as update ops', () => {
  beforeEach(async () => {
    db.ops.clear();
    db.features.clear();
    await discardPending();
    vi.unstubAllGlobals();
    useDrawStore.setState({ features: [], pending: [], mode: null });
  });

  it('routes a draw-store property edit into the pending queue', async () => {
    useDrawStore.setState({
      features: [
        { id: FEATURE_ID, type: 'Point', coords: [[10, 50]], color: '#fff', lineWidth: 2 },
      ],
    });

    useDrawStore.getState().setFeatureProperties(FEATURE_ID, { name: 'mine' });
    await vi.waitFor(() => expect(db.ops.size).toBe(1));

    const op = db.ops.get(OP_ID)!;
    expect(op.type).toBe('update');
    expect(op.resource).toBe('feature');
    expect(op.resourceId).toBe(FEATURE_ID);
    expect(op.payload).toMatchObject({
      layerId: 'viewtopia-drawn',
      properties: { name: 'mine' },
      geometry: POINT,
    });
  });

  it('collapses repeat edits into one op and keeps the last synced state as base', async () => {
    seedSyncedFeature({ name: 'synced' });

    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'first' },
      geometry: POINT,
      updatedAt: 10,
    });
    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'second' },
      geometry: POINT,
      updatedAt: 11,
    });

    expect(db.ops.size).toBe(1);
    const payload = db.ops.get(OP_ID)!.payload as {
      base: { properties: Record<string, unknown> };
      ours: { properties: Record<string, unknown> };
    };
    expect(payload.base.properties).toEqual({ name: 'synced' });
    expect(payload.ours.properties).toEqual({ name: 'second' });
  });

  it('merges a different-property change without asking the user', async () => {
    seedSyncedFeature({ name: 'synced', kind: 'hut' });
    const { puts } = serveFeature({ name: 'synced', kind: 'shed' });

    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'mine', kind: 'hut' },
      geometry: POINT,
      updatedAt: 10,
    });
    await syncNow();

    expect(getSyncState().conflicts).toEqual([]);
    expect(puts).toEqual([{ properties: { name: 'mine', kind: 'shed' }, geometry: POINT }]);
    expect(db.ops.size).toBe(0);
  });
});

describe('a both-sides edit of one property surfaces as a conflict', () => {
  beforeEach(async () => {
    db.ops.clear();
    db.features.clear();
    await discardPending();
    vi.unstubAllGlobals();
  });

  it('leaves the op queued, reports the conflict and does not send anything', async () => {
    seedSyncedFeature({ name: 'synced' });
    const { puts } = serveFeature({ name: 'theirs' });

    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'mine' },
      geometry: POINT,
      updatedAt: 10,
    });
    await syncNow();

    const state = getSyncState();
    expect(state.status).toBe('conflicts');
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0].featureId).toBe(FEATURE_ID);
    expect(state.conflicts[0].conflictingProperties).toEqual(['name']);
    expect(state.conflicts[0].ours?.properties).toEqual({ name: 'mine' });
    expect(state.conflicts[0].theirs?.properties).toEqual({ name: 'theirs' });
    expect(puts).toEqual([]);
    expect(db.ops.size).toBe(1);
    // a conflict is not a failed attempt
    expect(db.ops.get(OP_ID)!.attempts).toBe(0);
  });

  it('syncs the side the user picks and records it as the new base', async () => {
    seedSyncedFeature({ name: 'synced' });
    const { puts } = serveFeature({ name: 'theirs' });

    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'mine' },
      geometry: POINT,
      updatedAt: 10,
    });
    await syncNow();

    await applyConflictResolutions([
      { featureId: FEATURE_ID, properties: { name: 'theirs' }, geometry: POINT },
    ]);

    expect(puts).toEqual([{ properties: { name: 'theirs' }, geometry: POINT }]);
    expect(db.ops.size).toBe(0);
    expect(getSyncState().conflicts).toEqual([]);
    expect(getSyncState().status).toBe('idle');
    expect(db.features.get(FEATURE_ID)!.properties).toEqual({ name: 'theirs' });
  });

  it('keeping our side sends our value', async () => {
    seedSyncedFeature({ name: 'synced' });
    const { puts } = serveFeature({ name: 'theirs' });

    await queueFeatureUpdate('viewtopia-drawn', {
      id: FEATURE_ID,
      properties: { name: 'mine' },
      geometry: POINT,
      updatedAt: 10,
    });
    await syncNow();

    await applyConflictResolutions([
      { featureId: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT },
    ]);

    expect(puts).toEqual([{ properties: { name: 'mine' }, geometry: POINT }]);
    expect(db.features.get(FEATURE_ID)!.properties).toEqual({ name: 'mine' });
  });
});
