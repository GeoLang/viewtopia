import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import type { ReactNode } from 'react';
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

vi.mock('../../src/lib/branchFeatures', () => ({ fetchDatasets: vi.fn(async () => []) }));

vi.mock('../../src/offline/db', () => ({
  projectMaps: { getAll: vi.fn(async () => []), get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

import { LiveSessionControl } from '../../src/live/LiveSessionControl';
import { useLiveStore } from '../../src/live/liveStore';
import { useEntryPointStore } from '../../src/onboarding/entryPoints';
import { ProjectSwitcher } from '../../src/projects/ProjectSwitcher';
import { useProjectsStore } from '../../src/projects/projectsStore';
import { useWorkspacesStore } from '../../src/projects/workspacesStore';
import type { Role } from '../../src/projects/types';

function draw(ui: ReactNode): void {
  render(
    <MantineProvider>
      <ModalsProvider>{ui}</ModalsProvider>
    </MantineProvider>,
  );
}

function stubBrowser(): void {
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
  // the modal mounts a Mantine ScrollArea, which observes its own size
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

function workspaceWithRole(role: Role) {
  return {
    id: 'workspace-1',
    name: 'Workspace',
    createdBy: 'owner',
    createdAt: '2026-08-22T12:00:00Z',
    updatedAt: '2026-08-22T12:00:00Z',
    role,
  };
}

describe('project entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowser();
    localStorage.removeItem('viewtopia-active-workspace');
    useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'jwt-abc', error: null });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    useEntryPointStore.setState({ requested: null });
    api.listProjects.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useEntryPointStore.setState({ requested: null });
  });

  it('opens the new project modal for a request pending at mount', async () => {
    api.listWorkspaces.mockResolvedValue([workspaceWithRole('owner')]);
    useEntryPointStore.getState().request('create-project');

    draw(<ProjectSwitcher />);

    expect(await screen.findByText('New Project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(useEntryPointStore.getState().requested).toBeNull();
  });

  it('opens the project menu when the workspace allows no creation', async () => {
    api.listWorkspaces.mockResolvedValue([workspaceWithRole('viewer')]);
    useEntryPointStore.getState().request('create-project');

    draw(<ProjectSwitcher />);

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(useEntryPointStore.getState().requested).toBeNull();
  });
});

describe('live session entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowser();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })),
    );
    useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'jwt-abc', error: null });
    useLiveStore.setState({ documentId: null });
    useEntryPointStore.setState({ requested: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useLiveStore.setState({ documentId: null });
    useEntryPointStore.setState({ requested: null });
  });

  it('opens the live map picker for a request pending at mount', async () => {
    useEntryPointStore.getState().request('live-session');

    draw(<LiveSessionControl />);

    expect(await screen.findByPlaceholderText('New live map name…')).toBeInTheDocument();
    await waitFor(() => expect(useEntryPointStore.getState().requested).toBeNull());
  });

  it('takes the request but opens nothing while a live map is already open', async () => {
    useLiveStore.setState({ documentId: 'doc-1' });
    useEntryPointStore.getState().request('live-session');

    draw(<LiveSessionControl />);

    await waitFor(() => expect(useEntryPointStore.getState().requested).toBeNull());
    expect(screen.queryByPlaceholderText('New live map name…')).not.toBeInTheDocument();
  });
});
