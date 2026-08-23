import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom has no indexeddb and fake-indexeddb is not a dependency, so the stores
// are the seam: the queue coalescing, the three-way merge and the requests the
// sync engine sends all stay real
const db = vi.hoisted(() => ({
  ops: new Map<string, { id: string; createdAt: number; payload: unknown; attempts: number; type: string; resource: string; resourceId: string; lastError?: string }>(),
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
}));

vi.mock('../../src/offline/network', () => ({
  isOnline: () => true,
}));

vi.mock('../../src/features/auth/store', () => ({
  getAuthToken: () => 'test-token',
  endRefusedSession: () => {},
}));

import {
  queueFeatureUpdate,
  applyConflictResolutions,
  syncNow,
  discardPending,
  getSyncState,
} from '../../src/offline/sync';

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const FEATURE_ID = '22222222-2222-2222-2222-222222222222';
const OP_ID = `feature-update-${FEATURE_ID}`;
const POINT: GeoJSON.Geometry = { type: 'Point', coordinates: [1, 2] };
// what geojsonToWkbHex writes for POINT
const POINT_HEX = '0101000000000000000000f03f0000000000000040';

/** What the branch held when the feature was opened. */
function opened(properties: Record<string, unknown>) {
  return { id: FEATURE_ID, properties, geometry: POINT };
}

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

/** ptolemy holding `head` at the branch head, and every call it received. */
function serveBranch(head: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      authorization: headers.get('Authorization'),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    if (!init?.method || init.method === 'GET') {
      if (!head) return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          feature_id: FEATURE_ID,
          geometry_wkb_hex: POINT_HEX,
          properties: head,
        }),
      } as Response;
    }
    return { ok: true, status: 200, statusText: 'OK' } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

const commits = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

beforeEach(async () => {
  db.ops.clear();
  await discardPending();
  vi.unstubAllGlobals();
});

describe('a queued edit commits to its ptolemy branch', () => {
  it('reads the branch head and commits one update operation, both authenticated', async () => {
    const base = opened({ name: 'synced' });
    const { calls } = serveBranch({ name: 'synced' });

    await queueFeatureUpdate(BRANCH_ID, {
      id: FEATURE_ID,
      properties: { name: 'mine' },
      geometry: POINT,
    }, base);
    await syncNow();

    expect(calls[0].url).toBe(`/api/v1/branches/${BRANCH_ID}/features/${FEATURE_ID}`);
    expect(calls[0].method).toBe('GET');
    expect(calls[1].url).toBe(`/api/v1/branches/${BRANCH_ID}/commit`);
    expect(calls[1].body).toMatchObject({
      author: 'viewtopia',
      operations: [
        {
          type: 'update',
          feature_id: FEATURE_ID,
          properties: { name: 'mine' },
          geometry_wkb_hex: POINT_HEX,
        },
      ],
    });
    for (const call of calls) expect(call.authorization).toBe('Bearer test-token');
    expect(db.ops.size).toBe(0);
  });

  it('carries the branch id in the queued op', async () => {
    serveBranch(null);
    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' } }, null);

    const op = db.ops.get(OP_ID)!;
    expect(op.type).toBe('update');
    expect(op.resource).toBe('feature');
    expect(op.resourceId).toBe(FEATURE_ID);
    expect(op.payload).toMatchObject({ branchId: BRANCH_ID, properties: { name: 'mine' } });
  });

  it('collapses repeat edits into one op and keeps the last synced state as base', async () => {
    const base = opened({ name: 'synced' });

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'first' }, geometry: POINT }, base);
    await queueFeatureUpdate(
      BRANCH_ID,
      { id: FEATURE_ID, properties: { name: 'second' }, geometry: POINT },
      opened({ name: 'first' }),
    );

    expect(db.ops.size).toBe(1);
    const payload = db.ops.get(OP_ID)!.payload as {
      base: { properties: Record<string, unknown> };
      ours: { properties: Record<string, unknown> };
    };
    expect(payload.base.properties).toEqual({ name: 'synced' });
    expect(payload.ours.properties).toEqual({ name: 'second' });
  });

  it('merges a different-property change without asking the user', async () => {
    const base = opened({ name: 'synced', kind: 'hut' });
    const { calls } = serveBranch({ name: 'synced', kind: 'shed' });

    await queueFeatureUpdate(BRANCH_ID, {
      id: FEATURE_ID,
      properties: { name: 'mine', kind: 'hut' },
      geometry: POINT,
    }, base);
    await syncNow();

    expect(getSyncState().conflicts).toEqual([]);
    expect(commits(calls)[0].body).toMatchObject({
      operations: [{ properties: { name: 'mine', kind: 'shed' } }],
    });
    expect(db.ops.size).toBe(0);
  });

  it('commits an edit to a feature the branch does not hold yet', async () => {
    const { calls } = serveBranch(null);

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' } }, null);
    await syncNow();

    expect(commits(calls)).toHaveLength(1);
    expect(getSyncState().conflicts).toEqual([]);
    expect(db.ops.size).toBe(0);
  });

  it('sends properties alone when the edit has no geometry', async () => {
    const { calls } = serveBranch(null);

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' } }, null);
    await syncNow();

    const operation = (commits(calls)[0].body as { operations: Record<string, unknown>[] })
      .operations[0];
    expect(operation).not.toHaveProperty('geometry_wkb_hex');
  });

  it('discards an op queued before branch ids, which can never be sent', async () => {
    db.ops.set(OP_ID, {
      id: OP_ID,
      createdAt: 1,
      type: 'update',
      resource: 'feature',
      resourceId: FEATURE_ID,
      payload: { layerId: 'viewtopia-drawn', base: null, ours: { id: FEATURE_ID, properties: {} }, properties: {} },
      attempts: 0,
    });
    const { calls } = serveBranch(null);

    await syncNow();

    expect(calls).toEqual([]);
    expect(db.ops.size).toBe(0);
  });

  it('keeps the op queued when the commit fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        (!init?.method
          ? { ok: false, status: 404, statusText: 'Not Found' }
          : { ok: false, status: 500, statusText: 'Internal Server Error' }) as Response,
      ),
    );

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' } }, null);
    await syncNow();

    expect(db.ops.size).toBe(1);
    expect(db.ops.get(OP_ID)!.attempts).toBe(1);
    expect(getSyncState().status).toBe('error');
  });
});

describe('a both-sides edit of one property surfaces as a conflict', () => {
  it('leaves the op queued, reports the conflict and commits nothing', async () => {
    const base = opened({ name: 'synced' });
    const { calls } = serveBranch({ name: 'theirs' });

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT }, base);
    await syncNow();

    const state = getSyncState();
    expect(state.status).toBe('conflicts');
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0].featureId).toBe(FEATURE_ID);
    expect(state.conflicts[0].conflictingProperties).toEqual(['name']);
    expect(state.conflicts[0].ours?.properties).toEqual({ name: 'mine' });
    expect(state.conflicts[0].theirs?.properties).toEqual({ name: 'theirs' });
    expect(commits(calls)).toEqual([]);
    expect(db.ops.size).toBe(1);
    // a conflict is not a failed attempt
    expect(db.ops.get(OP_ID)!.attempts).toBe(0);
  });

  it('commits the side the user picks and records it as the new base', async () => {
    const base = opened({ name: 'synced' });
    const { calls } = serveBranch({ name: 'theirs' });

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT }, base);
    await syncNow();

    await applyConflictResolutions([
      { featureId: FEATURE_ID, properties: { name: 'theirs' }, geometry: POINT },
    ]);

    expect(commits(calls)).toHaveLength(1);
    expect(commits(calls)[0].body).toMatchObject({
      operations: [{ properties: { name: 'theirs' } }],
    });
    expect(db.ops.size).toBe(0);
    expect(getSyncState().conflicts).toEqual([]);
    expect(getSyncState().status).toBe('idle');
  });

  it('keeping our side commits our value', async () => {
    const base = opened({ name: 'synced' });
    const { calls } = serveBranch({ name: 'theirs' });

    await queueFeatureUpdate(BRANCH_ID, { id: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT }, base);
    await syncNow();

    await applyConflictResolutions([
      { featureId: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT },
    ]);

    expect(commits(calls)[0].body).toMatchObject({
      operations: [{ properties: { name: 'mine' } }],
    });
    expect(db.ops.size).toBe(0);
  });
});
