import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// MantineProvider reads the color scheme through matchMedia, and the popover
// and modal measure themselves, all missing from jsdom
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const db = vi.hoisted(() => ({
  ops: new Map<string, { id: string; payload: unknown; attempts: number; lastError?: string }>(),
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
    updateAttempts: async () => {},
  },
}));

vi.mock('../../src/offline/network', () => ({
  isOnline: () => true,
  useNetworkStore: (selector: (s: { online: boolean }) => unknown) => selector({ online: true }),
}));

vi.mock('../../src/features/auth/store', () => ({
  getAuthToken: () => 'test-token',
  endRefusedSession: () => {},
}));

import { OfflineIndicator } from '../../src/offline/OfflineIndicator';
import { queueFeatureUpdate, syncNow, discardPending, getSyncState } from '../../src/offline/sync';

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const FEATURE_ID = '22222222-2222-2222-2222-222222222222';
const POINT: GeoJSON.Geometry = { type: 'Point', coordinates: [1, 2] };
// what geojsonToWkbHex writes for POINT
const POINT_HEX = '0101000000000000000000f03f0000000000000040';

/** The property committed by each commit the branch received. */
function committedProperties(commits: unknown[]): unknown[] {
  return commits.map(
    (body) => (body as { operations: { properties: unknown }[] }).operations[0].properties,
  );
}

/** The branch holds `name: theirs`, we edited the same property to `name: mine`. */
async function conflictOnName(): Promise<{ commits: unknown[] }> {
  const commits: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            feature_id: FEATURE_ID,
            geometry_wkb_hex: POINT_HEX,
            properties: { name: 'theirs' },
          }),
        } as Response;
      }
      commits.push(JSON.parse(init.body as string));
      return { ok: true, status: 200, statusText: 'OK' } as Response;
    }),
  );

  await queueFeatureUpdate(
    BRANCH_ID,
    { id: FEATURE_ID, properties: { name: 'mine' }, geometry: POINT },
    { id: FEATURE_ID, properties: { name: 'synced' }, geometry: POINT },
  );
  await syncNow();
  return { commits };
}

function renderIndicator() {
  return render(
    <MantineProvider>
      <OfflineIndicator />
    </MantineProvider>,
  );
}

async function openResolver() {
  fireEvent.click(screen.getByLabelText('Sync status'));
  const open = await screen.findByRole('button', { name: /resolve conflicts/i });
  fireEvent.click(open);
  await screen.findByText(/modified both locally and on the server/);
}

describe('the sync indicator opens the conflict resolver', () => {
  beforeEach(async () => {
    db.ops.clear();
    await discardPending();
    vi.unstubAllGlobals();
  });

  it('says nothing about conflicts while there are none', () => {
    renderIndicator();
    fireEvent.click(screen.getByLabelText('Sync status'));
    expect(screen.queryByRole('button', { name: /resolve conflicts/i })).toBeNull();
  });

  it('offers the resolver once a sync finds a conflict', async () => {
    await conflictOnName();
    renderIndicator();

    expect(await screen.findByText('1 conflict')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Sync status'));
    expect(
      await screen.findByText('1 feature changed here and on the server'),
    ).toBeInTheDocument();
  });

  it('shows both versions of the conflicting property', async () => {
    await conflictOnName();
    renderIndicator();
    await openResolver();

    expect(screen.getByText(`Feature: ${FEATURE_ID}`)).toBeInTheDocument();
    expect(screen.getByText('both-modified')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('"mine"')).toBeInTheDocument();
    expect(screen.getByText('"theirs"')).toBeInTheDocument();
  });

  it('keeping the server side syncs that value and clears the conflict', async () => {
    const { commits } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /keep all server/i }));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(committedProperties(commits)).toEqual([{ name: 'theirs' }]);
    expect(getSyncState().conflicts).toEqual([]);
    expect(db.ops.size).toBe(0);
  });

  it('keeping our side syncs our value', async () => {
    const { commits } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /keep all mine/i }));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(committedProperties(commits)).toEqual([{ name: 'mine' }]);
    expect(db.ops.size).toBe(0);
  });

  it('cancelling drops the conflict and leaves the edit queued', async () => {
    const { commits } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /cancel sync/i }));

    await waitFor(() => expect(getSyncState().conflicts).toEqual([]));
    expect(commits).toEqual([]);
    expect(db.ops.size).toBe(1);
  });
});
