/**
 * Workspaces store — manages workspace CRUD and active workspace.
 */
import { create } from 'zustand';
import { useAuthStore } from '../features/auth/store';
import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from './api';
import type { Workspace } from './types';

function currentSession(token: string | null): boolean {
  return token !== null && useAuthStore.getState().token === token;
}

export interface WorkspacesState {
  items: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
}

export interface WorkspacesActions {
  load: () => Promise<void>;
  setActive: (workspaceId: string | null) => void;
  create: (params: { name: string; description?: string }) => Promise<Workspace>;
  update: (id: string, changes: { name: string; description?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getActive: () => Workspace | null;
}

export const useWorkspacesStore = create<WorkspacesState & WorkspacesActions>((set, get) => ({
  items: [],
  activeWorkspaceId: null,
  loading: false,

  async load() {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ items: [], activeWorkspaceId: null, loading: false });
      return;
    }
    set({ loading: true });
    try {
      const items = await listWorkspaces();
      if (!currentSession(token)) return;
      const savedId = localStorage.getItem('viewtopia-active-workspace');
      set({
        items,
        activeWorkspaceId: savedId && items.some((workspace) => workspace.id === savedId)
          ? savedId
          : items[0]?.id ?? null,
      });
    } finally {
      if (currentSession(token)) set({ loading: false });
    }
  },

  setActive(workspaceId: string | null) {
    set({ activeWorkspaceId: workspaceId });
    if (workspaceId) {
      localStorage.setItem('viewtopia-active-workspace', workspaceId);
    } else {
      localStorage.removeItem('viewtopia-active-workspace');
    }
  },

  async create(params) {
    const token = useAuthStore.getState().token;
    const workspace = await createWorkspace(params);
    if (currentSession(token)) set((s) => ({ items: [...s.items, workspace] }));
    return workspace;
  },

  async update(id, changes) {
    const token = useAuthStore.getState().token;
    const updated = await updateWorkspace(id, changes);
    if (currentSession(token)) {
      set((s) => ({ items: s.items.map((w) => (w.id === id ? updated : w)) }));
    }
  },

  async remove(id) {
    const token = useAuthStore.getState().token;
    await deleteWorkspace(id);
    if (!currentSession(token)) return;
    set((s) => ({
      items: s.items.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }));
  },

  getActive() {
    const { items, activeWorkspaceId } = get();
    return items.find((w) => w.id === activeWorkspaceId) ?? null;
  },
}));
