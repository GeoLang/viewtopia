import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  maps: new Map<string, unknown>(),
}));

const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

vi.mock('../../src/offline/db', () => ({
  projectMaps: {
    get: vi.fn(async (id: string) => state.maps.get(id)),
    put: vi.fn(async (entry: { id: string }) => {
      state.maps.set(entry.id, entry);
    }),
    remove: vi.fn(async (id: string) => {
      state.maps.delete(id);
    }),
  },
  overlayImages: { put: vi.fn(async () => undefined), get: vi.fn(async () => undefined) },
}));

import { useProjectsStore } from '../../src/projects/projectsStore';
import { useAuthStore } from '../../src/features/auth/store';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { setSharedCamera } from '../../src/hooks/sharedCamera';

const canals: AgentLayer = {
  id: 'canals',
  name: 'Venice canals',
  color: '#38bdf8',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [12.33, 45.44] },
      },
    ],
  },
};

async function makeProject(name: string): Promise<string> {
  const id = `project-${state.projects.length + 1}`;
  api.createProject.mockResolvedValueOnce({
    id,
    workspaceId: 'workspace-1',
    name,
    createdBy: 'owner',
    createdAt: '2026-08-22T12:00:00Z',
    updatedAt: '2026-08-22T12:00:00Z',
    role: 'owner',
  });
  const project = await useProjectsStore.getState().create({ workspaceId: 'workspace-1', name });
  state.projects.push(project);
  return project.id;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.projects = [];
  state.maps.clear();
  api.listProjects.mockResolvedValue(state.projects);
  useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'account-a', error: null });
  useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
  useAppStore.setState({ renderer: 'maplibre', basemap: 'liberty', layers: [] });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  setSharedCamera({ longitude: 12, latitude: 45, zoom: 10, bearing: 0, pitch: 0 });
});

afterEach(() => {
  vi.advanceTimersByTime(4200);
  vi.useRealTimers();
});

describe('server-backed project switching', () => {
  it('loads project metadata from the API', async () => {
    api.listProjects.mockResolvedValueOnce([
      {
        id: 'project-1',
        workspaceId: 'workspace-1',
        name: 'First',
        createdBy: 'owner',
        createdAt: '2026-08-22T12:00:00Z',
        updatedAt: '2026-08-22T12:00:00Z',
        role: 'viewer',
      },
    ]);

    await useProjectsStore.getState().load();

    expect(api.listProjects).toHaveBeenCalledOnce();
    expect(useProjectsStore.getState().items).toHaveLength(1);
    expect(useProjectsStore.getState().items[0].role).toBe('viewer');
  });

  it('puts back the map the project was left showing', async () => {
    const first = await makeProject('First');
    const second = await makeProject('Second');

    await useProjectsStore.getState().switchTo(first);
    useAgentLayerStore.getState().addLayer(canals);

    await useProjectsStore.getState().switchTo(second);
    useAgentLayerStore.getState().setLayers([]);
    expect(useAgentLayerStore.getState().layers).toHaveLength(0);

    await useProjectsStore.getState().switchTo(first);
    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
  });

  it('drops the local map snapshot after the server deletes a project', async () => {
    api.deleteProject.mockResolvedValue(new Response(null, { status: 204 }));
    const first = await makeProject('First');
    const second = await makeProject('Second');

    await useProjectsStore.getState().switchTo(first);
    useAgentLayerStore.getState().addLayer(canals);
    await useProjectsStore.getState().switchTo(second);
    expect(state.maps.has(first)).toBe(true);

    await useProjectsStore.getState().remove(first);

    expect(api.deleteProject).toHaveBeenCalledWith(first);
    expect(state.maps.has(first)).toBe(false);
  });
});
