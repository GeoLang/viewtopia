import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  maps: new Map<string, { id: string; map: unknown }>(),
}));

const api = vi.hoisted(() => ({
  getProjectState: vi.fn(),
  putProjectState: vi.fn(),
  uploadProjectAttachment: vi.fn(),
  getProjectAttachmentDataUrl: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

vi.mock('../../src/offline/db', () => ({
  projectMaps: {
    get: vi.fn(async (id: string) => state.maps.get(id)),
    put: vi.fn(async (entry: { id: string; map: unknown }) => {
      state.maps.set(entry.id, entry);
    }),
    remove: vi.fn(async (id: string) => {
      state.maps.delete(id);
    }),
  },
  overlayImages: {
    get: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  },
}));

import {
  forgetUnsavedMaps,
  loadProjectMap,
  newerSnapshot,
  pushUnsavedMaps,
  saveProjectMap,
  scheduleMapSave,
  watchMapForSaving,
  MAP_STATE_KEY,
  SAVE_DEBOUNCE_MS,
} from '../../src/projects/mapSync';
import type { ViewtopiaProject } from '../../src/features/project/projectFile';
import { useAgentLayerStore, type AgentLayer } from '../../src/store/agentLayers';
import { useAppStore } from '../../src/store/app';
import { useOgcLayerStore } from '../../src/store/ogcLayers';

const PROJECT = 'project-1';

function snapshot(savedAt: string, layers: AgentLayer[] = []): ViewtopiaProject {
  return {
    app: 'viewtopia',
    schemaVersion: 1,
    name: 'Venice',
    savedAt,
    renderer: 'maplibre',
    basemap: 'liberty',
    camera: { lng: 12.33, lat: 45.44, height: 1e5, heading: 0, pitch: -30, roll: 0 },
    agentLayers: layers,
    markers: [],
    ogcLayers: [],
    imageOverlays: [],
  };
}

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

/** Every watcher a test started, stopped even when the test failed first. */
let stopWatching: (() => void) | null = null;

function watch(activeProject: () => { id: string; name: string } | null): void {
  stopWatching = watchMapForSaving(activeProject);
}

const activeProject = () => ({ id: PROJECT, name: 'Venice' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.maps.clear();
  forgetUnsavedMaps();
  api.getProjectState.mockResolvedValue(null);
  api.putProjectState.mockResolvedValue(undefined);
  useAppStore.setState({ renderer: 'maplibre', basemap: 'liberty', layers: [] });
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
  useOgcLayerStore.setState({ layers: [] });
});

afterEach(() => {
  stopWatching?.();
  stopWatching = null;
  forgetUnsavedMaps();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('newest savedAt wins', () => {
  it('takes the server snapshot when it was saved later', () => {
    const cached = snapshot('2026-08-23T10:00:00Z');
    const server = snapshot('2026-08-23T11:00:00Z');
    expect(newerSnapshot(cached, server)).toBe(server);
  });

  it('keeps the cached snapshot when the server is behind', () => {
    const cached = snapshot('2026-08-23T12:00:00Z');
    const server = snapshot('2026-08-23T11:00:00Z');
    expect(newerSnapshot(cached, server)).toBe(cached);
  });

  it('gives a tie to the server, so a round trip is not a conflict', () => {
    const cached = snapshot('2026-08-23T11:00:00Z');
    const server = snapshot('2026-08-23T11:00:00Z');
    expect(newerSnapshot(cached, server)).toBe(server);
  });

  it('falls back to whichever side has a snapshot at all', () => {
    const only = snapshot('2026-08-23T11:00:00Z');
    expect(newerSnapshot(undefined, only)).toBe(only);
    expect(newerSnapshot(only, undefined)).toBe(only);
    expect(newerSnapshot(undefined, undefined)).toBeUndefined();
  });

  it('treats an unreadable savedAt as older than a real one', () => {
    const broken = snapshot('not a date');
    const real = snapshot('2026-08-23T11:00:00Z');
    expect(newerSnapshot(broken, real)).toBe(real);
    expect(newerSnapshot(real, broken)).toBe(real);
  });
});

describe('loading a project map', () => {
  it('applies the server map and caches it when the server is ahead', async () => {
    state.maps.set(PROJECT, { id: PROJECT, map: snapshot('2026-08-23T10:00:00Z') });
    api.getProjectState.mockResolvedValue({
      value: snapshot('2026-08-23T11:00:00Z', [canals]),
      updatedAt: '2026-08-23T11:00:00Z',
      updatedBy: 'other-member',
    });

    await loadProjectMap(PROJECT);

    expect(api.getProjectState).toHaveBeenCalledWith(PROJECT, MAP_STATE_KEY);
    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
    const cached = state.maps.get(PROJECT)?.map as ViewtopiaProject;
    expect(cached.savedAt).toBe('2026-08-23T11:00:00Z');
  });

  it('keeps the cached map when this browser saved later, and sends it up', async () => {
    const mine = snapshot('2026-08-23T12:00:00Z', [canals]);
    state.maps.set(PROJECT, { id: PROJECT, map: mine });
    api.getProjectState.mockResolvedValue({
      value: snapshot('2026-08-23T11:00:00Z'),
      updatedAt: '2026-08-23T11:00:00Z',
      updatedBy: 'other-member',
    });

    await loadProjectMap(PROJECT);

    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
    expect(api.putProjectState).toHaveBeenCalledWith(PROJECT, MAP_STATE_KEY, mine);
  });

  it('sends up a cached map the server has never seen', async () => {
    const mine = snapshot('2026-08-23T12:00:00Z', [canals]);
    state.maps.set(PROJECT, { id: PROJECT, map: mine });

    await loadProjectMap(PROJECT);

    expect(api.putProjectState).toHaveBeenCalledWith(PROJECT, MAP_STATE_KEY, mine);
  });

  it('sends nothing up when the server already has the newer map', async () => {
    state.maps.set(PROJECT, { id: PROJECT, map: snapshot('2026-08-23T10:00:00Z') });
    api.getProjectState.mockResolvedValue({
      value: snapshot('2026-08-23T11:00:00Z', [canals]),
      updatedAt: '2026-08-23T11:00:00Z',
      updatedBy: 'other-member',
    });

    await loadProjectMap(PROJECT);

    expect(api.putProjectState).not.toHaveBeenCalled();
  });

  it('falls back to the cache when the server cannot be reached', async () => {
    state.maps.set(PROJECT, { id: PROJECT, map: snapshot('2026-08-23T10:00:00Z', [canals]) });
    api.getProjectState.mockRejectedValue(new Error('offline'));

    await loadProjectMap(PROJECT);

    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
  });

  it('leaves what is on screen alone when neither side has a map', async () => {
    useAgentLayerStore.getState().addLayer(canals);

    await loadProjectMap(PROJECT);

    expect(useAgentLayerStore.getState().layers.map((layer) => layer.id)).toEqual(['canals']);
  });
});

describe('saving on a debounce', () => {
  it('sends one save however many changes land inside the wait', async () => {
    watch(activeProject);

    useAgentLayerStore.getState().addLayer(canals);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    useAppStore.getState().setBasemap('dark');
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(api.putProjectState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    expect(api.putProjectState).toHaveBeenCalledOnce();
    const [projectId, key, saved] = api.putProjectState.mock.calls[0] as [
      string,
      string,
      ViewtopiaProject,
    ];
    expect(projectId).toBe(PROJECT);
    expect(key).toBe(MAP_STATE_KEY);
    expect(saved.agentLayers.map((layer) => layer.id)).toEqual(['canals']);
    expect(saved.basemap).toBe('dark');
  });

  it('writes nothing while no project is active', async () => {
    watch(() => null);

    useAgentLayerStore.getState().addLayer(canals);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(api.putProjectState).not.toHaveBeenCalled();
  });
});

describe('a save the server refused', () => {
  it('still writes the cache, so nothing on screen is lost', async () => {
    api.putProjectState.mockRejectedValue(new Error('offline'));

    await saveProjectMap(PROJECT, 'Venice');

    expect(state.maps.has(PROJECT)).toBe(true);
  });

  it('goes out again on the next change', async () => {
    api.putProjectState.mockRejectedValueOnce(new Error('offline'));
    await saveProjectMap(PROJECT, 'Venice');
    expect(api.putProjectState).toHaveBeenCalledOnce();

    watch(activeProject);
    useAgentLayerStore.getState().addLayer(canals);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    // the change's own save, then the one the server refused earlier
    expect(api.putProjectState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('goes out again when the browser says it is online', async () => {
    api.putProjectState.mockRejectedValueOnce(new Error('offline'));
    await saveProjectMap(PROJECT, 'Venice');

    watch(activeProject);
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();

    expect(api.putProjectState).toHaveBeenCalledTimes(2);
  });

  it('stops retrying once the server takes it', async () => {
    api.putProjectState.mockRejectedValueOnce(new Error('offline'));
    await saveProjectMap(PROJECT, 'Venice');

    await pushUnsavedMaps();
    expect(api.putProjectState).toHaveBeenCalledTimes(2);

    await pushUnsavedMaps();
    expect(api.putProjectState).toHaveBeenCalledTimes(2);
  });

  it('drops a queued project whose cached map is gone', async () => {
    api.putProjectState.mockRejectedValueOnce(new Error('offline'));
    await saveProjectMap(PROJECT, 'Venice');

    state.maps.delete(PROJECT);
    await pushUnsavedMaps();

    expect(api.putProjectState).toHaveBeenCalledOnce();
  });
});

describe('scheduleMapSave on its own', () => {
  it('waits the debounce before it writes anything', async () => {
    scheduleMapSave(activeProject);
    expect(api.putProjectState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(api.putProjectState).toHaveBeenCalledOnce();
  });
});
