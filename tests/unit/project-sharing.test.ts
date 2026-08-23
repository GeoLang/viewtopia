import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  createInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  deleteMember: vi.fn(),
  listInvitations: vi.fn(),
  listMembers: vi.fn(),
  listProjects: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  listWorkspaces: vi.fn(),
  setMember: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

vi.mock('../../src/offline/db', () => ({
  projectMaps: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../src/offline/sync', () => ({
  queueOperation: vi.fn(),
}));

import { useProjectsStore } from '../../src/projects/projectsStore';
import { useAuthStore } from '../../src/features/auth/store';
import {
  generateShareLink,
  PROJECT_INVITE_PARAM,
  projectInviteUrl,
  SHARE_LINK_EXPIRY_DAYS,
  joinProjectFromToken,
} from '../../src/projects/sharing';
import { useWorkspacesStore } from '../../src/projects/workspacesStore';

describe('project sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'account-a', error: null });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
  });

  it('creates a server invite link that expires after seven days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    api.createInvitation.mockResolvedValue({ id: 'invite-1', token: 'link-token' });

    const { url, invite } = await generateShareLink({
      targetType: 'project',
      targetId: 'proj-1',
      role: 'viewer',
    });

    const expectedExpiry = '2026-08-29T12:00:00.000Z';
    expect(api.createInvitation).toHaveBeenCalledWith('project', 'proj-1', 'viewer', expectedExpiry);
    expect(invite.expiresAt).toBe(expectedExpiry);
    expect(url).toBe(projectInviteUrl('link-token'));
    expect(url).toContain(`?${PROJECT_INVITE_PARAM}=`);
    expect(url).not.toContain('/join');
    expect(SHARE_LINK_EXPIRY_DAYS).toBe(7);
    vi.useRealTimers();
  });

  it('accepts the server invite after authentication and activates its workspace', async () => {
    api.acceptInvitation.mockResolvedValue({ target: 'workspace', id: 'workspace-1' });
    api.listWorkspaces.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Survey',
        createdBy: 'owner',
        createdAt: '2026-08-22T12:00:00Z',
        updatedAt: '2026-08-22T12:00:00Z',
        role: 'viewer',
      },
    ]);
    api.listProjects.mockResolvedValue([]);

    await joinProjectFromToken('link-token');

    expect(api.acceptInvitation).toHaveBeenCalledWith('link-token');
    expect(api.listWorkspaces).toHaveBeenCalledOnce();
    expect(api.listProjects).toHaveBeenCalledOnce();
    expect(useWorkspacesStore.getState().activeWorkspaceId).toBe('workspace-1');
  });

  it('discards an invitation response that arrives after an account switch', async () => {
    let release: (accepted: { target: 'workspace'; id: string }) => void = () => undefined;
    api.acceptInvitation.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const joining = joinProjectFromToken('link-token');
    useAuthStore.setState({ loggedIn: true, user: { email: 'other@example.com' }, token: 'account-b', error: null });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
    release({ target: 'workspace', id: 'account-a-workspace' });
    await joining;

    expect(useWorkspacesStore.getState().activeWorkspaceId).toBeNull();
    expect(api.listProjects).not.toHaveBeenCalled();
    expect(api.listWorkspaces).not.toHaveBeenCalled();
  });

  it('discards a project response that arrives after logout', async () => {
    let release: (projects: Array<Record<string, unknown>>) => void = () => undefined;
    api.listProjects.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const loading = useProjectsStore.getState().load();
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    release([{
      id: 'private-project',
      workspaceId: 'private-workspace',
      name: 'Private project',
      createdBy: 'account-a',
      createdAt: '2026-08-22T12:00:00Z',
      updatedAt: '2026-08-22T12:00:00Z',
      role: 'owner',
    }]);
    await loading;

    expect(useProjectsStore.getState().items).toEqual([]);
  });

  it('discards a workspace response that arrives after an account switch', async () => {
    let release: (workspaces: Array<Record<string, unknown>>) => void = () => undefined;
    api.listWorkspaces.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const loading = useWorkspacesStore.getState().load();
    useAuthStore.setState({ loggedIn: true, user: { email: 'other@example.com' }, token: 'account-b', error: null });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
    release([{
      id: 'private-workspace',
      name: 'Private workspace',
      createdBy: 'account-a',
      createdAt: '2026-08-22T12:00:00Z',
      updatedAt: '2026-08-22T12:00:00Z',
      role: 'owner',
    }]);
    await loading;

    expect(useWorkspacesStore.getState().items).toEqual([]);
  });
});
