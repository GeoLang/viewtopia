import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePortalStore } from '../../src/features/portal/store';
import { useAuthStore } from '../../src/features/auth/store';
import type { PortalItem } from '../../src/features/portal/types';

const sample: PortalItem = {
  id: 'local-1',
  title: 'Test Map',
  type: 'map',
  owner: 'tester',
  sharing: 'private',
  created: '2026-07-15T00:00:00.000Z',
  modified: '2026-07-15T00:00:00.000Z',
};

function localItems(): PortalItem[] {
  const raw = localStorage.getItem('viewtopia_portal_items');
  return raw ? (JSON.parse(raw) as PortalItem[]) : [];
}

describe('portal store fallback logic', () => {
  beforeEach(() => {
    localStorage.clear();
    usePortalStore.setState({ items: [], error: null, needsSignIn: false });
    useAuthStore.setState({ loggedIn: false, user: null, token: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces a sign-in error on 401 instead of writing localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await usePortalStore.getState().addItem(sample);

    expect(usePortalStore.getState().error).toBe('Sign in to save to the portal');
    expect(usePortalStore.getState().items).toHaveLength(0);
    expect(localItems()).toHaveLength(0);
  });

  it('falls back to localStorage when the endpoint is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    await usePortalStore.getState().addItem(sample);

    expect(usePortalStore.getState().error).toBeNull();
    expect(usePortalStore.getState().items).toHaveLength(1);
    expect(localItems()).toHaveLength(1);
  });

  it('uses the API response when the backend accepts the item', async () => {
    const saved = { ...sample, id: 'server-1' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(saved), { status: 201 })),
    );
    await usePortalStore.getState().addItem(sample);

    expect(usePortalStore.getState().items).toEqual([saved]);
    expect(localItems()).toHaveLength(0);
  });

  it('reports a forbidden delete without dropping the item', async () => {
    // a 403 can only come back to a signed-in user
    useAuthStore.setState({ loggedIn: true, token: 'test-token' });
    usePortalStore.setState({ items: [sample] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await usePortalStore.getState().deleteItem(sample.id);

    expect(usePortalStore.getState().error).toBe('You can only delete your own items');
    expect(usePortalStore.getState().items).toHaveLength(1);
  });

  it('shows the signed-out state without requesting the catalog', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('viewtopia_portal_items', JSON.stringify([sample]));

    await usePortalStore.getState().refresh();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(usePortalStore.getState().needsSignIn).toBe(true);
    expect(usePortalStore.getState().error).toBeNull();
    // local items still browse offline
    expect(usePortalStore.getState().items).toHaveLength(1);
  });

  it('requests the catalog once a token exists', async () => {
    useAuthStore.setState({ loggedIn: true, token: 'test-token' });
    const served = [{ ...sample, id: 'server-1' }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(served), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await usePortalStore.getState().refresh();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usePortalStore.getState().needsSignIn).toBe(false);
    expect(usePortalStore.getState().items).toEqual(served);
  });
});
