/**
 * Projects store — manages the active project and CRUD operations.
 */
import { create } from 'zustand';
import { projectMaps } from '../offline/db';
import { useAuthStore } from '../features/auth/store';
import { createProject, deleteProject, listProjects, listWorkspaceProjects, updateProject } from './api';
import { loadProjectMap, pushUnsavedMaps, saveProjectMap, watchMapForSaving } from './mapSync';
import type { Project } from './types';

function currentSession(token: string | null): boolean {
  return token !== null && useAuthStore.getState().token === token;
}

let watchingMap = false;

/** One watcher for the session, whatever signs in and out under it. */
function startMapSaving(): void {
  if (watchingMap) return;
  watchingMap = true;
  watchMapForSaving(() => {
    const project = useProjectsStore.getState().getActive();
    return project ? { id: project.id, name: project.name } : null;
  });
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
  /** Save the outgoing project's map, then put the incoming project's on screen. */
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
      const activeProjectId =
        savedId && items.some((project) => project.id === savedId) ? savedId : items[0]?.id ?? null;
      set({ items, activeProjectId });
      startMapSaving();
      if (activeProjectId) await loadProjectMap(activeProjectId);
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
    if (leaving) await saveProjectMap(leaving.id, leaving.name);
    await pushUnsavedMaps();

    get().setActive(projectId);
    await loadProjectMap(projectId);
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
