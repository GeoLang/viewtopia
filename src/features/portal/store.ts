import { create } from 'zustand';
import type { PortalItem, PortalItemType, PortalSharing } from './types';
import { getAuthToken } from '../auth/store';

/**
 * Portal content catalog (ported from vanilla portal.js). Reads/writes items
 * via `/api/v1/portal/items` with the auth Bearer token, falling back to
 * localStorage (`viewtopia_portal_items`) for offline/demo use.
 */

const API = '/api/v1/portal';
const LOCAL_KEY = 'viewtopia_portal_items';
const SIGN_IN_SAVE = 'Sign in to save to the portal';

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function getLocalItems(): PortalItem[] {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    return stored ? (JSON.parse(stored) as PortalItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocalItems(items: PortalItem[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

interface PortalState {
  items: PortalItem[];
  loading: boolean;
  error: string | null;
  query: string;
  typeFilter: PortalItemType | '';
  sharingFilter: PortalSharing | '';
  setQuery: (q: string) => void;
  setTypeFilter: (t: PortalItemType | '') => void;
  setSharingFilter: (s: PortalSharing | '') => void;
  setError: (e: string | null) => void;
  refresh: () => Promise<void>;
  addItem: (item: PortalItem) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  filtered: () => PortalItem[];
}

// a thrown fetch or a 404 means the endpoint isn't there (standalone/demo mode),
// so we fall back to localStorage. a 401 means the backend IS there but the user
// isn't signed in, which we surface instead of silently writing to localStorage.
export const usePortalStore = create<PortalState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  query: '',
  typeFilter: '',
  sharingFilter: '',

  setQuery: (query) => set({ query }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setSharingFilter: (sharingFilter) => set({ sharingFilter }),
  setError: (error) => set({ error }),

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const resp = await fetch(`${API}/items`, { headers: authHeaders() });
      if (resp.ok) {
        set({ items: await resp.json(), loading: false, error: null });
        return;
      }
      if (resp.status === 401) {
        set({ items: getLocalItems(), loading: false, error: 'Sign in to load your portal items' });
        return;
      }
    } catch {
      /* fall through to local (standalone mode) */
    }
    set({ items: getLocalItems(), loading: false });
  },

  addItem: async (item) => {
    set({ error: null });
    try {
      const resp = await fetch(`${API}/items`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(item),
      });
      if (resp.ok) {
        const saved = (await resp.json()) as PortalItem;
        set((s) => ({ items: [...s.items, saved], error: null }));
        return;
      }
      if (resp.status === 401) {
        set({ error: SIGN_IN_SAVE });
        return;
      }
    } catch {
      /* fall through to local (standalone mode) */
    }
    set((s) => {
      const items = [...s.items, item];
      saveLocalItems(items);
      return { items };
    });
  },

  deleteItem: async (id) => {
    set({ error: null });
    try {
      const resp = await fetch(`${API}/items/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (resp.ok) {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        return;
      }
      if (resp.status === 401) {
        set({ error: SIGN_IN_SAVE });
        return;
      }
      if (resp.status === 403) {
        set({ error: 'You can only delete your own items' });
        return;
      }
    } catch {
      /* fall through to local (standalone mode) */
    }
    set((s) => {
      const items = s.items.filter((i) => i.id !== id);
      saveLocalItems(items);
      return { items };
    });
  },

  filtered: () => {
    const { items, query, typeFilter, sharingFilter } = get();
    const q = query.toLowerCase();
    return items.filter((item) => {
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description?.toLowerCase().includes(q) &&
        !item.tags?.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
      if (typeFilter && item.type !== typeFilter) return false;
      if (sharingFilter && item.sharing !== sharingFilter) return false;
      return true;
    });
  },
}));

/** Fire the legacy event so other modules can react to an opened item. */
export function openPortalItem(item: PortalItem): void {
  window.dispatchEvent(new CustomEvent('portal:open-item', { detail: item }));
}
