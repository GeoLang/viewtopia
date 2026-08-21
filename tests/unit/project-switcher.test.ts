import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Switching projects carries the map with it: the project being left keeps what
 * is on screen, the one being opened puts back what it was left showing.
 */

const db = vi.hoisted(() => ({
  projects: [] as unknown[],
  maps: new Map<string, unknown>(),
}));

vi.mock('../../src/offline/db', () => ({
  projects: {
    getAll: vi.fn(async () => db.projects),
    getByWorkspace: vi.fn(async () => db.projects),
    put: vi.fn(async (project: unknown) => {
      db.projects.push(project);
    }),
    remove: vi.fn(async (id: string) => {
      db.projects = db.projects.filter((p) => (p as { id: string }).id !== id);
    }),
  },
  projectMaps: {
    get: vi.fn(async (id: string) => db.maps.get(id)),
    put: vi.fn(async (entry: { id: string }) => {
      db.maps.set(entry.id, entry);
    }),
    remove: vi.fn(async (id: string) => {
      db.maps.delete(id);
    }),
  },
  overlayImages: { put: vi.fn(async () => undefined), get: vi.fn(async () => undefined) },
}));

import { useProjectsStore } from '../../src/projects/projectsStore';
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
  const project = await useProjectsStore
    .getState()
    .create({ workspaceId: 'workspace-1', name });
  return project.id;
}

beforeEach(() => {
  vi.useFakeTimers();
  db.projects = [];
  db.maps.clear();
  useProjectsStore.setState({ items: [], activeProjectId: null });
  useAppStore.setState({ renderer: 'maplibre', basemap: 'liberty', layers: [] });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  setSharedCamera({ longitude: 12, latitude: 45, zoom: 10, bearing: 0, pitch: 0 });
});

afterEach(() => {
  // applyProject polls for a Cesium viewer that never arrives in jsdom
  vi.advanceTimersByTime(4200);
  vi.useRealTimers();
});

describe('project switching', () => {
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

  it('keeps what is on screen when the project has no map of its own', async () => {
    const first = await makeProject('First');
    const second = await makeProject('Second');

    await useProjectsStore.getState().switchTo(first);
    useAgentLayerStore.getState().addLayer(canals);

    await useProjectsStore.getState().switchTo(second);
    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
  });

  it('drops the stored map when the project is deleted', async () => {
    const first = await makeProject('First');
    const second = await makeProject('Second');

    await useProjectsStore.getState().switchTo(first);
    useAgentLayerStore.getState().addLayer(canals);
    await useProjectsStore.getState().switchTo(second);
    expect(db.maps.has(first)).toBe(true);

    await useProjectsStore.getState().remove(first);
    expect(db.maps.has(first)).toBe(false);
  });
});
