/**
 * Projects store — manages the active project and CRUD operations.
 */
import { create } from 'zustand';
import { projectMaps } from '../offline/db';
import {
  applyProject,
  serializeProject,
  storeOverlayImages,
} from '../features/project/projectFile';
import { useAuthStore } from '../features/auth/store';
import { createProject, deleteProject, listProjects, listWorkspaceProjects, updateProject } from './api';
import type { Project } from './types';

function currentSession(token: string | null): boolean {
  return token !== null && useAuthStore.getState().token === token;
}

export interface ProjectsState {
  /** All projects visible to the authenticated user */
  items: Project[];
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Loading state */
  loading: boolean;
}

export interface ProjectsActions {
  /** Load all accessible projects */
  load: () => Promise<void>;
  /** Load projects for a specific workspace */
  loadByWorkspace: (workspaceId: string) => Promise<void>;
  /** Set the active project, leaving the map alone */
  setActive: (projectId: string | null) => void;
  /** Put the map the project was left showing back on screen. */
  switchTo: (projectId: string) => Promise<void>;
  /** Create a new project */
  create: (params: {
    workspaceId: string;
    name: string;
    description?: string;
  }) => Promise<Project>;
  /** Update an existing project */
  update: (id: string, changes: { name: string; description?: string }) => Promise<void>;
  /** Delete a project */
  remove: (id: string) => Promise<void>;
  /** Get the active project */
  getActive: () => Project | null;
}

export const useProjectsStore = create<ProjectsState & ProjectsActions>((set, get) => ({
  items: [],
  activeProjectId: null,
  loading: false,

  async load() {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ items: [], activeProjectId: null, loading: false });
      return;
    }
    set({ loading: true });
    try {
      const items = await listProjects();
      if (!currentSession(token)) return;
      const savedId = localStorage.getItem('viewtopia-active-project');
      set({
        items,
        activeProjectId: savedId && items.some((project) => project.id === savedId) ? savedId : items[0]?.id ?? null,
      });
    } finally {
      if (currentSession(token)) set({ loading: false });
    }
  },

  async loadByWorkspace(workspaceId: string) {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ items: [], activeProjectId: null, loading: false });
      return;
    }
    set({ loading: true });
    try {
      const items = await listWorkspaceProjects(workspaceId);
      if (!currentSession(token)) return;
      set({ items });
    } finally {
      if (currentSession(token)) set({ loading: false });
    }
  },

  setActive(projectId: string | null) {
    set({ activeProjectId: projectId });
    if (projectId) {
      localStorage.setItem('viewtopia-active-project', projectId);
    } else {
      localStorage.removeItem('viewtopia-active-project');
    }
  },

  async switchTo(projectId: string) {
    const { activeProjectId, items } = get();
    if (activeProjectId === projectId) return;

    const leaving = items.find((project) => project.id === activeProjectId);
    if (leaving) {
      await storeOverlayImages();
      await projectMaps.put({ id: leaving.id, map: serializeProject(leaving.name) });
    }

    get().setActive(projectId);
    // a project nobody has left a map in keeps what is on screen, so switching
    // into a fresh one never throws work away
    const stored = await projectMaps.get(projectId);
    if (stored) applyProject(stored.map);
  },

  async create(params) {
    const token = useAuthStore.getState().token;
    const project = await createProject(params.workspaceId, params);
    if (currentSession(token)) set((s) => ({ items: [...s.items, project] }));
    return project;
  },

  async update(id, changes) {
    const token = useAuthStore.getState().token;
    const updated = await updateProject(id, changes);
    if (currentSession(token)) {
      set((s) => ({ items: s.items.map((p) => (p.id === id ? updated : p)) }));
    }
  },

  async remove(id) {
    const token = useAuthStore.getState().token;
    await deleteProject(id);
    await projectMaps.remove(id);
    if (!currentSession(token)) return;
    set((s) => ({
      items: s.items.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }));
  },

  getActive() {
    const { items, activeProjectId } = get();
    return items.find((p) => p.id === activeProjectId) ?? null;
  },
}));
