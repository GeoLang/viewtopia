import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../src/features/auth/store';

const api = vi.hoisted(() => ({
  attachDataset: vi.fn(),
  createInvitation: vi.fn(),
  createProject: vi.fn(),
  createWorkspace: vi.fn(),
  deleteInvitation: vi.fn(),
  deleteMember: vi.fn(),
  deleteProject: vi.fn(),
  deleteWorkspace: vi.fn(),
  detachDataset: vi.fn(),
  getCapabilities: vi.fn(),
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

const branchFeatures = vi.hoisted(() => ({ fetchDatasets: vi.fn() }));

vi.mock('../../src/lib/branchFeatures', () => branchFeatures);

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
    expect(screen.getByText('Manage Datasets')).toBeInTheDocument();
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
    expect(screen.queryByText('Manage Datasets')).not.toBeInTheDocument();
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

describe('share dialog email field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // the modal mounts a Mantine ScrollArea, which observes its own size
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
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
    api.listMembers.mockResolvedValue([]);
    api.listInvitations.mockResolvedValue([]);
    setRole('owner');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openShareModal(): Promise<void> {
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));
    fireEvent.click(await screen.findByText('Manage Sharing'));
  }

  it('offers no email field when the server sends no email', async () => {
    api.getCapabilities.mockResolvedValue({ emailConfigured: false });
    await openShareModal();

    expect(await screen.findByText(/No email is sent/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email the link to')).not.toBeInTheDocument();
  });

  it('emails the link and says so when the server has a relay', async () => {
    api.getCapabilities.mockResolvedValue({ emailConfigured: true });
    api.createInvitation.mockResolvedValue({ id: 'invite-1', token: 'tok-1', email: { status: 'sent' } });
    await openShareModal();

    const field = await screen.findByLabelText('Email the link to');
    fireEvent.change(field, { target: { value: 'invitee@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }));

    expect(await screen.findByText('Invite emailed.')).toBeInTheDocument();
    expect(api.createInvitation).toHaveBeenCalledWith(
      'project',
      'project-1',
      'viewer',
      expect.any(String),
      'invitee@example.com',
    );
  });

  it('says the relay refused it and leaves the link to copy', async () => {
    api.getCapabilities.mockResolvedValue({ emailConfigured: true });
    api.createInvitation.mockResolvedValue({
      id: 'invite-2',
      token: 'tok-2',
      email: { status: 'failed', error: 'connection refused' },
    });
    await openShareModal();

    fireEvent.change(await screen.findByLabelText('Email the link to'), {
      target: { value: 'invitee@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }));

    expect(await screen.findByText(/Email failed: connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/invite=tok-2/)).toBeInTheDocument();
  });
});

describe('project datasets dialog', () => {
  const listedDatasets = [
    { id: 'dataset-free', name: 'Unattached lakes', project_id: null, visibility: 'public' },
    { id: 'dataset-here', name: 'Project parcels', project_id: 'project-1', visibility: 'private' },
    { id: 'dataset-elsewhere', name: 'Other roads', project_id: 'project-2', visibility: 'private' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // the modal mounts a Mantine ScrollArea, which observes its own size
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
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
    useAuthStore.setState({ loggedIn: true, user: { email: 'editor@example.com' }, token: 'jwt-abc', error: null });
    branchFeatures.fetchDatasets.mockResolvedValue(listedDatasets);
    setRole('editor');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openDatasetsModal(): Promise<void> {
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Project' }));
    fireEvent.click(await screen.findByText('Manage Datasets'));
  }

  it('offers attach, detach, or nothing according to where a dataset sits', async () => {
    await openDatasetsModal();

    expect(await screen.findByText('Unattached lakes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach' })).toBeInTheDocument();
    expect(screen.getByText('in another project')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Attach' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Detach' })).toHaveLength(1);
  });

  it('attaches the dataset to the open project and reloads the list', async () => {
    api.attachDataset.mockResolvedValue({ datasetId: 'dataset-free', projectId: 'project-1' });
    await openDatasetsModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Attach' }));

    await waitFor(() => {
      expect(api.attachDataset).toHaveBeenCalledWith('dataset-free', 'project-1');
    });
    await waitFor(() => {
      expect(branchFeatures.fetchDatasets).toHaveBeenCalledTimes(2);
    });
  });

  it('detaches the dataset the open project holds', async () => {
    api.detachDataset.mockResolvedValue({ datasetId: 'dataset-here', projectId: null });
    await openDatasetsModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Detach' }));

    await waitFor(() => {
      expect(api.detachDataset).toHaveBeenCalledWith('dataset-here');
    });
  });

  it('reports a refused attach and keeps the dialog open', async () => {
    const shown = vi.spyOn(notifications, 'show').mockImplementation(() => '');
    api.attachDataset.mockRejectedValue(new Error('project editor required'));
    await openDatasetsModal();

    fireEvent.click(await screen.findByRole('button', { name: 'Attach' }));

    await waitFor(() => {
      expect(shown).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'project editor required', color: 'red' }),
      );
    });
    expect(screen.getByText('Manage datasets for "Project"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach' })).toBeEnabled();
  });
});
