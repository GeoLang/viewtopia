import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/actions/project';
import { ActionError, runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { useProjectsStore } from '../../src/projects/projectsStore';
import type { Project } from '../../src/projects/types';

const api = vi.hoisted(() => ({ listProjects: vi.fn() }));
vi.mock('../../src/projects/api', () => ({
  listProjects: api.listProjects,
  listWorkspaceProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const mapSync = vi.hoisted(() => ({
  loadProjectMap: vi.fn(async () => {}),
  saveProjectMap: vi.fn(async () => {}),
  pushUnsavedMaps: vi.fn(async () => {}),
  watchMapForSaving: vi.fn(),
}));
vi.mock('../../src/projects/mapSync', () => mapSync);

function project(id: string, name: string): Project {
  return {
    id,
    workspaceId: 'w-1',
    name,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    createdBy: 'ada',
    role: 'owner',
  };
}

const HARBOUR = project('p-1', 'Harbour survey');
const HARBOUR_NORTH = project('p-2', 'Harbour north');
const CAMPUS = project('p-3', 'Campus twin');

describe('project actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ token: 'jwt-token' });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    api.listProjects.mockResolvedValue([HARBOUR, HARBOUR_NORTH, CAMPUS]);
  });

  it('asks the server the first time it lists', async () => {
    const result = await runAction('project.list', {});
    expect(api.listProjects).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Harbour survey');
    expect(result.text).toContain('Campus twin');
    expect(result.text).not.toContain('p-1');
  });

  it('opens the project a partial name names', async () => {
    useProjectsStore.setState({ items: [HARBOUR, HARBOUR_NORTH, CAMPUS], activeProjectId: 'p-1' });
    const result = await runAction('project.open', { project: 'campus' });

    expect(useProjectsStore.getState().activeProjectId).toBe('p-3');
    expect(mapSync.loadProjectMap).toHaveBeenCalledWith('p-3');
    expect(result.text).toBe('Opened Campus twin.');
  });

  it('refuses a name two projects carry', async () => {
    useProjectsStore.setState({ items: [HARBOUR, HARBOUR_NORTH, CAMPUS], activeProjectId: 'p-3' });
    await expect(runAction('project.open', { project: 'harbour' })).rejects.toThrow(ActionError);
    expect(useProjectsStore.getState().activeProjectId).toBe('p-3');
  });

  it('says so when the project is already open', async () => {
    useProjectsStore.setState({ items: [HARBOUR], activeProjectId: 'p-1' });
    const result = await runAction('project.open', { project: 'p-1' });
    expect(result.text).toBe('Harbour survey is already open.');
    expect(mapSync.loadProjectMap).not.toHaveBeenCalled();
  });
});
