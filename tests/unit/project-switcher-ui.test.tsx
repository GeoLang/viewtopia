import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { useAuthStore } from '../../src/features/auth/store';

const api = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  createProject: vi.fn(),
  createWorkspace: vi.fn(),
  deleteInvitation: vi.fn(),
  deleteMember: vi.fn(),
  deleteProject: vi.fn(),
  deleteWorkspace: vi.fn(),
  listInvitations: vi.fn(),
  listMembers: vi.fn(),
  listProjects: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  listWorkspaces: vi.fn(),
  setMember: vi.fn(),
  updateProject: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

vi.mock('../../src/offline/db', () => ({
  projectMaps: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

import { ProjectSwitcher } from '../../src/projects/ProjectSwitcher';
import { useProjectsStore } from '../../src/projects/projectsStore';
import { useWorkspacesStore } from '../../src/projects/workspacesStore';
import type { Role } from '../../src/projects/types';

function draw(): void {
  render(
    <MantineProvider>
      <ModalsProvider>
        <ProjectSwitcher />
      </ModalsProvider>
    </MantineProvider>,
  );
}

function setRole(role: Role): void {
  const workspace = {
    id: 'workspace-1',
    name: 'Workspace',
    createdBy: 'owner',
    createdAt: '2026-08-22T12:00:00Z',
    updatedAt: '2026-08-22T12:00:00Z',
    role,
  };
  const project = {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: 'Project',
    createdBy: 'owner',
    createdAt: '2026-08-22T12:00:00Z',
    updatedAt: '2026-08-22T12:00:00Z',
    role,
  };
  api.listWorkspaces.mockResolvedValue([workspace]);
  api.listProjects.mockResolvedValue([project]);
  useWorkspacesStore.setState({ items: [workspace], activeWorkspaceId: workspace.id, loading: false });
  useProjectsStore.setState({ items: [project], activeProjectId: project.id, loading: false });
}

describe('ProjectSwitcher roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'jwt-abc', error: null });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hides every project control while signed out', () => {
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
    draw();
    expect(screen.queryByRole('button', { name: 'Workspace' })).not.toBeInTheDocument();
  });

  it('clears loaded metadata when the signed-in account changes', async () => {
    setRole('owner');
    draw();
    expect(await screen.findByRole('button', { name: 'Workspace' })).toBeInTheDocument();

    api.listWorkspaces.mockResolvedValue([]);
    api.listProjects.mockResolvedValue([]);
    act(() => {
      useAuthStore.setState({ loggedIn: true, user: { email: 'other@example.com' }, token: 'account-b', error: null });
    });

    await waitFor(() => {
      expect(useWorkspacesStore.getState().items).toEqual([]);
      expect(useProjectsStore.getState().items).toEqual([]);
      expect(useWorkspacesStore.getState().activeWorkspaceId).toBeNull();
      expect(useProjectsStore.getState().activeProjectId).toBeNull();
    });
  });

  it('shows member management, invitations, and deletion only to owners', async () => {
    setRole('owner');
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));

    expect(await screen.findByText('Manage Sharing')).toBeInTheDocument();
    expect(screen.getByText('Delete Project')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Edit Project')).toBeInTheDocument();
  });

  it('allows editors to create and edit without owner controls', async () => {
    setRole('editor');
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));

    expect(await screen.findByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Edit Project')).toBeInTheDocument();
    expect(screen.queryByText('Manage Sharing')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
  });

  it('limits viewers to switching projects', async () => {
    setRole('viewer');
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));

    expect(await screen.findByText('Project')).toBeInTheDocument();
    expect(screen.queryByText('New Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Sharing')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
  });

  it('shows direct project access outside the selected workspace', async () => {
    setRole('owner');
    const directProject = {
      id: 'direct-project',
      workspaceId: 'unlisted-workspace',
      name: 'Shared directly',
      createdBy: 'other-owner',
      createdAt: '2026-08-22T12:00:00Z',
      updatedAt: '2026-08-22T12:00:00Z',
      role: 'viewer' as const,
    };
    api.listProjects.mockResolvedValue([
      ...useProjectsStore.getState().items,
      directProject,
    ]);
    useProjectsStore.setState({
      items: [...useProjectsStore.getState().items, directProject],
    });

    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));

    expect(await screen.findByText('Project-only access')).toBeInTheDocument();
    expect(screen.getByText('Shared directly')).toBeInTheDocument();
  });

  it('selects a project from the workspace being opened', async () => {
    setRole('owner');
    const secondWorkspace = {
      ...useWorkspacesStore.getState().items[0],
      id: 'workspace-2',
      name: 'Second workspace',
    };
    const secondProject = {
      ...useProjectsStore.getState().items[0],
      id: 'project-2',
      workspaceId: secondWorkspace.id,
      name: 'Second project',
    };
    api.listWorkspaces.mockResolvedValue([
      ...useWorkspacesStore.getState().items,
      secondWorkspace,
    ]);
    api.listProjects.mockResolvedValue([
      ...useProjectsStore.getState().items,
      secondProject,
    ]);
    useWorkspacesStore.setState({
      items: [...useWorkspacesStore.getState().items, secondWorkspace],
    });
    useProjectsStore.setState({
      items: [...useProjectsStore.getState().items, secondProject],
    });

    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    fireEvent.click(await screen.findByText('Second workspace'));

    await waitFor(() => {
      expect(useProjectsStore.getState().activeProjectId).toBe('project-2');
    });
  });
});
