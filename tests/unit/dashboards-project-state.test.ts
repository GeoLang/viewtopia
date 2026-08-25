import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProjectState: vi.fn(),
  putProjectState: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

import {
  DASHBOARD_SAVE_DEBOUNCE_MS,
  useDashboardsStore,
} from '../../src/features/dashboards/store';
import { useProjectsStore } from '../../src/projects/projectsStore';
import type { Dashboard } from '../../src/features/dashboards/types';

const PROJECT = 'project-1';
const STATE_KEY = 'dashboards';
const LEGACY_LOCAL_KEY = 'viewtopia_dashboards';

function dashboard(id: string, title: string): Dashboard {
  return {
    id,
    title,
    description: '',
    widgets: [],
    theme: { background: '#1a1a2e', accent: '#0f3460' },
    created: '2026-08-01T00:00:00.000Z',
    modified: '2026-08-01T00:00:00.000Z',
  };
}

function activate(projectId: string | null): void {
  useProjectsStore.setState({
    items: projectId
      ? [
          {
            id: projectId,
            workspaceId: 'workspace-1',
            name: 'Venice',
            createdBy: 'owner',
            createdAt: '2026-08-22T12:00:00Z',
            updatedAt: '2026-08-22T12:00:00Z',
            role: 'owner',
          },
        ]
      : [],
    activeProjectId: projectId,
    loading: false,
  });
}

/** The store's refresh is fire-and-forget, so a test waits for its round trip. */
function settled(): Promise<void> {
  return vi.advanceTimersByTimeAsync(0);
}

/** Wait out the debounce and let the write that follows it go. */
function saved(): Promise<void> {
  return vi.advanceTimersByTimeAsync(DASHBOARD_SAVE_DEBOUNCE_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  api.getProjectState.mockResolvedValue(null);
  api.putProjectState.mockResolvedValue(undefined);
  useDashboardsStore.setState({ dashboards: [], activeId: null, projectId: null });
  activate(PROJECT);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('dashboards belong to the active project', () => {
  it('reads them from the project state key', async () => {
    api.getProjectState.mockResolvedValue({
      value: [dashboard('d-1', 'Fleet')],
      updatedAt: '2026-08-23T10:00:00Z',
      updatedBy: 'other-member',
    });

    useDashboardsStore.getState().refresh();
    await settled();

    expect(api.getProjectState).toHaveBeenCalledWith(PROJECT, STATE_KEY);
    expect(useDashboardsStore.getState().dashboards.map((d) => d.title)).toEqual(['Fleet']);
  });

  it('writes a new dashboard back to the project', async () => {
    useDashboardsStore.getState().refresh();
    await settled();

    useDashboardsStore.getState().create();
    await saved();

    expect(api.putProjectState).toHaveBeenCalledWith(PROJECT, STATE_KEY, expect.any(Array));
    const [, , written] = api.putProjectState.mock.calls.at(-1) as [string, string, Dashboard[]];
    expect(written).toHaveLength(1);
    expect(written[0].title).toBe('Untitled Dashboard');
  });

  it('holds nothing and writes nothing while no project is active', async () => {
    activate(null);

    useDashboardsStore.getState().refresh();
    await settled();

    expect(api.getProjectState).not.toHaveBeenCalled();
    useDashboardsStore.getState().create();
    await saved();
    expect(api.putProjectState).not.toHaveBeenCalled();
    expect(useDashboardsStore.getState().dashboards).toEqual([]);
  });

  it('keeps what is on the server when it cannot be read', async () => {
    api.getProjectState.mockRejectedValue(new Error('offline'));

    useDashboardsStore.getState().refresh();
    await settled();

    expect(useDashboardsStore.getState().dashboards).toEqual([]);
  });
});

describe('edits wait for the editing to stop', () => {
  it('send one write however many edits land inside the wait', async () => {
    useDashboardsStore.getState().refresh();
    await settled();

    useDashboardsStore.getState().create();
    useDashboardsStore.getState().renameActive('Fleet');
    useDashboardsStore.getState().addWidget('gauge');
    expect(api.putProjectState).not.toHaveBeenCalled();

    await saved();

    expect(api.putProjectState).toHaveBeenCalledOnce();
    const [, , written] = api.putProjectState.mock.calls[0] as [string, string, Dashboard[]];
    expect(written).toHaveLength(1);
    expect(written[0].title).toBe('Fleet');
    expect(written[0].widgets.map((widget) => widget.type)).toEqual(['gauge']);
  });

  it('restart the wait, so an edit stream writes only after it stops', async () => {
    useDashboardsStore.getState().refresh();
    await settled();

    useDashboardsStore.getState().create();
    await vi.advanceTimersByTimeAsync(DASHBOARD_SAVE_DEBOUNCE_MS - 1);
    useDashboardsStore.getState().renameActive('Fleet');
    await vi.advanceTimersByTimeAsync(DASHBOARD_SAVE_DEBOUNCE_MS - 1);

    expect(api.putProjectState).not.toHaveBeenCalled();
  });

  it('go up before another project loads', async () => {
    useDashboardsStore.getState().refresh();
    await settled();
    useDashboardsStore.getState().create();

    activate('project-2');
    useDashboardsStore.getState().refresh();

    expect(api.putProjectState).toHaveBeenCalledWith(PROJECT, STATE_KEY, expect.any(Array));
    await settled();
    expect(api.getProjectState).toHaveBeenLastCalledWith('project-2', STATE_KEY);
  });

  it('are dropped when the project closes', async () => {
    useDashboardsStore.getState().refresh();
    await settled();
    useDashboardsStore.getState().create();

    activate(null);
    useDashboardsStore.getState().refresh();
    await saved();

    expect(api.putProjectState).not.toHaveBeenCalled();
  });
});

describe('dashboards this browser saved before projects owned them', () => {
  it('move into the project once and leave the localStorage key behind', async () => {
    localStorage.setItem(LEGACY_LOCAL_KEY, JSON.stringify([dashboard('old-1', 'Legacy')]));

    useDashboardsStore.getState().refresh();
    await settled();

    expect(useDashboardsStore.getState().dashboards.map((d) => d.title)).toEqual(['Legacy']);
    expect(api.putProjectState).toHaveBeenCalledWith(PROJECT, STATE_KEY, [
      expect.objectContaining({ id: 'old-1' }),
    ]);
    expect(localStorage.getItem(LEGACY_LOCAL_KEY)).toBeNull();

    // a second project opening later gets only what the server holds
    api.putProjectState.mockClear();
    useDashboardsStore.getState().refresh();
    await settled();
    expect(api.putProjectState).not.toHaveBeenCalled();
  });

  it('join what the project already holds without duplicating an id', async () => {
    localStorage.setItem(
      LEGACY_LOCAL_KEY,
      JSON.stringify([dashboard('d-1', 'Same one'), dashboard('old-2', 'Only here')]),
    );
    api.getProjectState.mockResolvedValue({
      value: [dashboard('d-1', 'Fleet')],
      updatedAt: '2026-08-23T10:00:00Z',
      updatedBy: 'other-member',
    });

    useDashboardsStore.getState().refresh();
    await settled();

    expect(useDashboardsStore.getState().dashboards.map((d) => d.id)).toEqual(['d-1', 'old-2']);
    expect(useDashboardsStore.getState().dashboards[0].title).toBe('Fleet');
  });

  it('ignore a localStorage value that is not a list of dashboards', async () => {
    localStorage.setItem(LEGACY_LOCAL_KEY, '{"not":"a list"}');

    useDashboardsStore.getState().refresh();
    await settled();

    expect(useDashboardsStore.getState().dashboards).toEqual([]);
    expect(api.putProjectState).not.toHaveBeenCalled();
  });
});
