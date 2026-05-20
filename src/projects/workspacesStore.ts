/**
 * Workspaces store — manages workspace CRUD and active workspace.
 */
import { create } from 'zustand';
import { workspaces as workspacesDb } from '../offline/db';
import { queueOperation } from '../offline/sync';
import type { Workspace, WorkspaceSettings } from './types';

export interface WorkspacesState {
  items: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
}

export interface WorkspacesActions {
  load: () => Promise<void>;
  setActive: (workspaceId: string | null) => void;
  create: (params: { name: string; description?: string; settings?: Partial<WorkspaceSettings> }) => Promise<Workspace>;
  update: (id: string, changes: Partial<Omit<Workspace, 'id' | 'createdAt' | 'createdBy'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getActive: () => Workspace | null;
}

export const useWorkspacesStore = create<WorkspacesState & WorkspacesActions>((set, get) => ({
  items: [],
  activeWorkspaceId: null,
  loading: false,

  async load() {
    set({ loading: true });
    const items = await workspacesDb.getAll();
    set({ items, loading: false });

    // Restore last active workspace
    const savedId = localStorage.getItem('viewtopia-active-workspace');
    if (savedId && items.some((w) => w.id === savedId)) {
      set({ activeWorkspaceId: savedId });
    } else if (items.length > 0) {
      set({ activeWorkspaceId: items[0].id });
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
    const now = Date.now();
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      settings: { ...params.settings },
      createdAt: now,
      updatedAt: now,
      createdBy: 'local-user',
      members: [{ userId: 'local-user', email: '', role: 'owner', joinedAt: now }],
    };

    await workspacesDb.put(workspace);
    await queueOperation('create', 'session', workspace.id, workspace);
    set((s) => ({ items: [...s.items, workspace] }));
    return workspace;
  },

  async update(id, changes) {
    const existing = get().items.find((w) => w.id === id);
    if (!existing) return;

    const updated: Workspace = { ...existing, ...changes, updatedAt: Date.now() };
    await workspacesDb.put(updated);
    await queueOperation('update', 'session', id, updated);
    set((s) => ({ items: s.items.map((w) => (w.id === id ? updated : w)) }));
  },

  async remove(id) {
    await workspacesDb.remove(id);
    await queueOperation('delete', 'session', id, { id });
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
