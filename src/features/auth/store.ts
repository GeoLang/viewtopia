import { create } from 'zustand';

/**
 * Authentication state (ported from vanilla auth.js). JWT login against the
 * TileTopia backend (`/api/v1/auth/*`), plus an API-key path. The session is
 * persisted to localStorage under `viewtopia_auth` and restored on load.
 */

export interface AuthUser {
  name?: string;
  email?: string;
}

interface AuthState {
  loggedIn: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  loginWithApiKey: (key: string) => void;
  logout: () => void;
  setError: (error: string | null) => void;
}

const KEY = 'viewtopia_auth';

function persist(user: AuthUser | null, token: string | null): void {
  if (user && token) {
    localStorage.setItem(KEY, JSON.stringify({ user, token }));
  } else {
    localStorage.removeItem(KEY);
  }
}

function restore(): { user: AuthUser | null; token: string | null } {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const d = JSON.parse(saved);
      if (d.token && d.user) return { user: d.user, token: d.token };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { user: null, token: null };
}

const init = restore();

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: !!init.token,
  user: init.user,
  token: init.token,
  error: null,

  login: async (email, password) => {
    if (!email || !password) {
      set({ error: 'Please enter email and password' });
      return false;
    }
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        const user: AuthUser = data.user || { email };
        persist(user, data.token);
        set({ loggedIn: true, user, token: data.token, error: null });
        return true;
      }
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      set({ error: err.message || 'Invalid credentials' });
      return false;
    } catch (e) {
      set({ error: `Connection error: ${(e as Error).message}` });
      return false;
    }
  },

  register: async (name, email, password) => {
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        set({ error: null });
        return true;
      }
      const err = await res.json().catch(() => ({ message: 'Registration failed' }));
      set({ error: err.message || 'Registration failed' });
      return false;
    } catch (e) {
      set({ error: `Connection error: ${(e as Error).message}` });
      return false;
    }
  },

  loginWithApiKey: (key) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const user: AuthUser = { name: 'API Key User' };
    persist(user, trimmed);
    set({ loggedIn: true, user, token: trimmed, error: null });
  },

  logout: () => {
    persist(null, null);
    set({ loggedIn: false, user: null, token: null, error: null });
  },

  setError: (error) => set({ error }),
}));

/** Current auth token for API requests (mirrors vanilla getAuthToken). */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

/** Whether a user is authenticated (mirrors vanilla isAuthenticated). */
export function isAuthenticated(): boolean {
  return useAuthStore.getState().loggedIn;
}
