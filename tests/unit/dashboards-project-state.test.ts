import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProjectState: vi.fn(),
  putProjectState: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

import { useDashboardsStore } from '../../src/features/dashboards/store';
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
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.getProjectState.mockResolvedValue(null);
  api.putProjectState.mockResolvedValue(undefined);
  useDashboardsStore.setState({ dashboards: [], activeId: null, projectId: null });
  activate(PROJECT);
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
