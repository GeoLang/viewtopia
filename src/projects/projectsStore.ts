/**
 * Projects store — manages the active project and CRUD operations.
 */
import { create } from 'zustand';
import { projects as projectsDb, projectMaps } from '../offline/db';
import { queueOperation } from '../offline/sync';
import {
  applyProject,
  serializeProject,
  storeOverlayImages,
} from '../features/project/projectFile';
import type { Project, ProjectSettings } from './types';

export interface ProjectsState {
  /** All projects loaded from IndexedDB */
  items: Project[];
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Loading state */
  loading: boolean;
}

export interface ProjectsActions {
  /** Load all projects from IndexedDB */
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
    settings?: Partial<ProjectSettings>;
  }) => Promise<Project>;
  /** Update an existing project */
  update: (id: string, changes: Partial<Omit<Project, 'id' | 'createdAt' | 'createdBy'>>) => Promise<void>;
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
    set({ loading: true });
    const items = await projectsDb.getAll();
    set({ items, loading: false });
  },

  async loadByWorkspace(workspaceId: string) {
    set({ loading: true });
    const items = await projectsDb.getByWorkspace(workspaceId);
    set({ items, loading: false });
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
    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      name: params.name,
      description: params.description,
      settings: {
        ...params.settings,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'local-user',
      offlineEnabled: false,
      members: [{ userId: 'local-user', email: '', role: 'owner', joinedAt: now }],
    };

    await projectsDb.put(project);
    await queueOperation('create', 'session', project.id, project);
    set((s) => ({ items: [...s.items, project] }));
    return project;
  },

  async update(id, changes) {
    const existing = get().items.find((p) => p.id === id);
    if (!existing) return;

    const updated: Project = { ...existing, ...changes, updatedAt: Date.now() };
    await projectsDb.put(updated);
    await queueOperation('update', 'session', id, updated);
    set((s) => ({ items: s.items.map((p) => (p.id === id ? updated : p)) }));
  },

  async remove(id) {
    await projectsDb.remove(id);
    await projectMaps.remove(id);
    await queueOperation('delete', 'session', id, { id });
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
