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
  features: new Map<string, { id: string; properties: Record<string, unknown> }>(),
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
  features: {
    get: async (id: string) => db.features.get(id),
    put: async (feature: { id: string }) => {
      db.features.set(feature.id, feature as never);
    },
  },
}));

vi.mock('../../src/offline/network', () => ({
  isOnline: () => true,
  useNetworkStore: (selector: (s: { online: boolean }) => unknown) => selector({ online: true }),
}));

import { OfflineIndicator } from '../../src/offline/OfflineIndicator';
import { queueFeatureUpdate, syncNow, discardPending, getSyncState } from '../../src/offline/sync';

const FEATURE_ID = 'feat-1';
const POINT = { type: 'Point', coordinates: [10, 50] };

/** Server holds `name: theirs`, we edited the same property to `name: mine`. */
async function conflictOnName(): Promise<{ puts: unknown[] }> {
  db.features.set(FEATURE_ID, {
    id: FEATURE_ID,
    properties: { name: 'synced' },
  } as never);

  const puts: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return {
          ok: true,
          json: async () => ({
            id: FEATURE_ID,
            properties: { name: 'theirs' },
            geometry: POINT,
            updatedAt: 2,
          }),
        } as Response;
      }
      puts.push(JSON.parse(init.body as string));
      return { ok: true, status: 200, statusText: 'OK' } as Response;
    }),
  );

  await queueFeatureUpdate('viewtopia-drawn', {
    id: FEATURE_ID,
    properties: { name: 'mine' },
    geometry: POINT,
    updatedAt: 10,
  });
  await syncNow();
  return { puts };
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
    db.features.clear();
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
    const { puts } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /keep all server/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ properties: { name: 'theirs' }, geometry: POINT });
    expect(getSyncState().conflicts).toEqual([]);
    expect(db.ops.size).toBe(0);
  });

  it('keeping our side syncs our value', async () => {
    const { puts } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /keep all mine/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ properties: { name: 'mine' }, geometry: POINT });
    expect(db.ops.size).toBe(0);
  });

  it('cancelling drops the conflict and leaves the edit queued', async () => {
    const { puts } = await conflictOnName();
    renderIndicator();
    await openResolver();

    fireEvent.click(screen.getByRole('button', { name: /cancel sync/i }));

    await waitFor(() => expect(getSyncState().conflicts).toEqual([]));
    expect(puts).toEqual([]);
    expect(db.ops.size).toBe(1);
  });
});
