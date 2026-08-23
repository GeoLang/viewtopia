import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  CopyButton,
  Divider,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconShare,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../features/auth/store';
import { useProjectsStore } from './projectsStore';
import {
  addMember,
  generateShareLink,
  getMembers,
  getPendingInvites,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from './sharing';
import type { Member, Role, ShareInvite } from './types';
import { useWorkspacesStore } from './workspacesStore';

type MetadataModal = 'create-project' | 'create-workspace' | 'edit-project' | 'edit-workspace' | null;
type InvitationRole = Exclude<Role, 'owner'>;

const INVITATION_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
];
const MEMBER_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

function canEdit(role: Role | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

function reportFailure(title: string, failure: unknown): void {
  notifications.show({
    title,
    message: failure instanceof Error ? failure.message : 'The request failed.',
    color: 'red',
  });
}

function currentSession(token: string | null): boolean {
  return token !== null && useAuthStore.getState().token === token;
}

export function ProjectSwitcher() {
  const signedIn = useAuthStore((state) => state.loggedIn);
  const authToken = useAuthStore((state) => state.token);
  const {
    items: projects,
    activeProjectId,
    switchTo,
    load: loadProjects,
    setActive: setActiveProject,
    create: createProject,
    update: updateProject,
    remove: removeProject,
  } = useProjectsStore();
  const {
    items: workspaces,
    activeWorkspaceId,
    load: loadWorkspaces,
    setActive: setActiveWorkspace,
    create: createWorkspace,
    update: updateWorkspace,
    remove: removeWorkspace,
  } = useWorkspacesStore();

  const [metadataModal, setMetadataModal] = useState<MetadataModal>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<Role>('viewer');
  const [shareRole, setShareRole] = useState<InvitationRole>('viewer');
  const [shareLink, setShareLink] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<ShareInvite[]>([]);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
    useWorkspacesStore.setState({ items: [], activeWorkspaceId: null, loading: false });
    setMembers([]);
    setInvitations([]);
    setShareLink('');
    setShareLoading(false);
    setShareModalOpen(false);
    setMetadataModal(null);
    if (!authToken) return;

    Promise.all([loadWorkspaces(), loadProjects()]).catch((failure: unknown) => {
      reportFailure('Could not load projects', failure);
    });
  }, [authToken, loadProjects, loadWorkspaces]);

  if (!signedIn) return null;

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const accessibleWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  let workspaceProjects = projects;
  if (activeWorkspaceId) {
    workspaceProjects = projects.filter((project) => project.workspaceId === activeWorkspaceId);
  } else if (workspaces.length > 0) {
    workspaceProjects = [];
  }
  const directProjects = workspaces.length > 0
    ? projects.filter((project) => !accessibleWorkspaceIds.has(project.workspaceId))
    : [];
  const canCreateProject = canEdit(activeWorkspace?.role);
  const canEditProject = canEdit(activeProject?.role);
  const ownsProject = activeProject?.role === 'owner';
  const canEditWorkspace = canEdit(activeWorkspace?.role);
  const ownsWorkspace = activeWorkspace?.role === 'owner';

  function openMetadata(kind: MetadataModal): void {
    const current = kind === 'edit-project' ? activeProject : kind === 'edit-workspace' ? activeWorkspace : null;
    setName(current?.name ?? '');
    setDescription(current?.description ?? '');
    setMetadataModal(kind);
  }

  async function handleWorkspaceSwitch(workspaceId: string): Promise<void> {
    setActiveWorkspace(workspaceId);
    const firstProject = projects.find((project) => project.workspaceId === workspaceId);
    if (firstProject) {
      await switchTo(firstProject.id);
    } else {
      setActiveProject(null);
    }
  }

  async function handleProjectSwitch(projectId: string): Promise<void> {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project && accessibleWorkspaceIds.has(project.workspaceId)) {
      setActiveWorkspace(project.workspaceId);
    } else {
      setActiveWorkspace(null);
    }
    await switchTo(projectId);
  }

  async function handleMetadata(): Promise<void> {
    if (!metadataModal || !name.trim()) return;
    try {
      if (metadataModal === 'create-workspace') {
        const workspace = await createWorkspace({ name: name.trim(), description: description || undefined });
        setActiveWorkspace(workspace.id);
        setActiveProject(null);
      } else if (metadataModal === 'create-project') {
        if (!activeWorkspaceId) return;
        const project = await createProject({
          workspaceId: activeWorkspaceId,
          name: name.trim(),
          description: description || undefined,
        });
        await switchTo(project.id);
      } else if (metadataModal === 'edit-project' && activeProject) {
        await updateProject(activeProject.id, { name: name.trim(), description: description || undefined });
      } else if (metadataModal === 'edit-workspace' && activeWorkspace) {
        await updateWorkspace(activeWorkspace.id, { name: name.trim(), description: description || undefined });
      }
      setMetadataModal(null);
    } catch (failure) {
      reportFailure('Could not save metadata', failure);
    }
  }

  async function refreshSharing(): Promise<void> {
    if (activeProject?.role !== 'owner') return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    setShareLoading(true);
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        getMembers('project', activeProject.id),
        getPendingInvites('project', activeProject.id),
      ]);
      if (!currentSession(token)) return;
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (failure) {
      reportFailure('Could not load project sharing', failure);
    } finally {
      if (currentSession(token)) setShareLoading(false);
    }
  }

  function openSharing(): void {
    setMemberUserId('');
    setShareLink('');
    setShareModalOpen(true);
    void refreshSharing();
  }

  async function handleAddMember(): Promise<void> {
    if (!activeProject || !memberUserId.trim()) return;
    try {
      await addMember({
        targetType: 'project',
        targetId: activeProject.id,
        userId: memberUserId.trim(),
        role: memberRole,
      });
      setMemberUserId('');
      await refreshSharing();
    } catch (failure) {
      reportFailure('Could not add member', failure);
    }
  }

  async function handleGenerateLink(): Promise<void> {
    if (!activeProject) return;
    const token = useAuthStore.getState().token;
    try {
      const { url } = await generateShareLink({
        targetType: 'project',
        targetId: activeProject.id,
        role: shareRole,
      });
      if (!currentSession(token)) return;
      setShareLink(url);
      await refreshSharing();
    } catch (failure) {
      reportFailure('Could not create invite link', failure);
    }
  }

  async function handleMemberRole(member: Member, role: Role): Promise<void> {
    if (!activeProject) return;
    try {
      await updateMemberRole({
        targetType: 'project',
        targetId: activeProject.id,
        userId: member.userId,
        newRole: role,
      });
      await refreshSharing();
    } catch (failure) {
      reportFailure('Could not update member', failure);
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    if (!activeProject) return;
    try {
      await removeMember({ targetType: 'project', targetId: activeProject.id, userId });
      await refreshSharing();
    } catch (failure) {
      reportFailure('Could not remove member', failure);
    }
  }

  async function handleRevokeInvite(invitationId: string): Promise<void> {
    if (!activeProject) return;
    try {
      await revokeInvite({ targetType: 'project', targetId: activeProject.id, invitationId });
      await refreshSharing();
    } catch (failure) {
      reportFailure('Could not revoke invite', failure);
    }
  }

  async function handleRemoveProject(): Promise<void> {
    if (!activeProject) return;
    try {
      await removeProject(activeProject.id);
    } catch (failure) {
      reportFailure('Could not delete project', failure);
    }
  }

  async function handleRemoveWorkspace(): Promise<void> {
    if (!activeWorkspace) return;
    try {
      await removeWorkspace(activeWorkspace.id);
      await Promise.all([loadWorkspaces(), loadProjects()]);
    } catch (failure) {
      reportFailure('Could not delete workspace', failure);
    }
  }

  const modalTitle = metadataModal?.includes('workspace') ? 'Workspace' : 'Project';
  const editingMetadata = metadataModal?.startsWith('edit');

  return (
    <>
      <Group gap="xs">
        <Menu shadow="md" width={220}>
          <Menu.Target>
            <Button variant="subtle" size="xs" rightSection={<IconChevronDown size={14} />}>
              {activeWorkspace?.name ?? 'Workspace'}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Workspaces</Menu.Label>
            {workspaces.map((workspace) => (
              <Menu.Item
                key={workspace.id}
                onClick={() => void handleWorkspaceSwitch(workspace.id)}
                rightSection={workspace.id === activeWorkspaceId ? <IconCheck size={14} /> : null}
              >
                {workspace.name}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={() => openMetadata('create-workspace')}>
              New Workspace
            </Menu.Item>
            {activeWorkspace && canEditWorkspace && (
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openMetadata('edit-workspace')}>
                Edit Workspace
              </Menu.Item>
            )}
            {activeWorkspace && ownsWorkspace && (
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => modals.openConfirmModal({
                  title: `Delete "${activeWorkspace.name}"?`,
                  labels: { confirm: 'Delete', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => void handleRemoveWorkspace(),
                })}
              >
                Delete Workspace
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={240}>
          <Menu.Target>
            <Button variant="light" size="xs" leftSection={<IconFolder size={14} />} rightSection={<IconChevronDown size={14} />}>
              {activeProject?.name ?? 'Select Project'}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Projects{activeWorkspace ? ` in ${activeWorkspace.name}` : ''}</Menu.Label>
            {workspaceProjects.length === 0 && <Menu.Item disabled>No projects yet</Menu.Item>}
            {workspaceProjects.map((project) => (
              <Menu.Item
                key={project.id}
                onClick={() => void handleProjectSwitch(project.id)}
                rightSection={project.id === activeProjectId ? <IconCheck size={14} /> : null}
              >
                <Text size="sm">{project.name}</Text>
              </Menu.Item>
            ))}
            {directProjects.length > 0 && (
              <>
                <Menu.Divider />
                <Menu.Label>Project-only access</Menu.Label>
                {directProjects.map((project) => (
                  <Menu.Item
                    key={project.id}
                    onClick={() => void handleProjectSwitch(project.id)}
                    rightSection={project.id === activeProjectId ? <IconCheck size={14} /> : null}
                  >
                    <Text size="sm">{project.name}</Text>
                  </Menu.Item>
                ))}
              </>
            )}
            {canCreateProject && (
              <>
                <Menu.Divider />
                <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={() => openMetadata('create-project')}>
                  New Project
                </Menu.Item>
              </>
            )}
            {activeProject && canEditProject && (
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openMetadata('edit-project')}>
                Edit Project
              </Menu.Item>
            )}
            {activeProject && ownsProject && (
              <>
                <Menu.Item leftSection={<IconShare size={14} />} onClick={openSharing}>
                  Manage Sharing
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => modals.openConfirmModal({
                    title: `Delete "${activeProject.name}"?`,
                    labels: { confirm: 'Delete', cancel: 'Cancel' },
                    confirmProps: { color: 'red' },
                    onConfirm: () => void handleRemoveProject(),
                  })}
                >
                  Delete Project
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Modal opened={metadataModal !== null} onClose={() => setMetadataModal(null)} title={`${editingMetadata ? 'Edit' : 'New'} ${modalTitle}`} size="sm">
        <Stack>
          <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} autoFocus />
          <Textarea label="Description" placeholder="Optional description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
          <Button onClick={() => void handleMetadata()} disabled={!name.trim()}>
            {editingMetadata ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={`Manage sharing for "${activeProject?.name ?? ''}"`}
        size="md"
      >
        <Stack>
          <Text size="sm" c="dimmed">Add a member by authenticated user ID, or create an invite link. No email is sent.</Text>
          <Group align="end">
            <TextInput
              label="User ID"
              placeholder="user-id"
              value={memberUserId}
              onChange={(event) => setMemberUserId(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select label="Role" data={MEMBER_ROLE_OPTIONS} value={memberRole} onChange={(value) => setMemberRole((value as Role) ?? 'viewer')} w={110} />
            <Button onClick={() => void handleAddMember()} disabled={!memberUserId.trim() || shareLoading}>
              Add member
            </Button>
          </Group>
          <Divider label="invite link" labelPosition="center" />
          <Text size="xs" c="dimmed">Invite links expire after seven days.</Text>
          <Group>
            <Select aria-label="Invite link role" data={INVITATION_ROLE_OPTIONS} value={shareRole} onChange={(value) => setShareRole((value as InvitationRole) ?? 'viewer')} w={110} />
            <Button variant="light" onClick={() => void handleGenerateLink()} disabled={shareLoading}>Generate Link</Button>
            {shareLink && (
              <Group gap={4}>
                <Text size="xs" style={{ wordBreak: 'break-all' }}>{shareLink}</Text>
                <CopyButton value={shareLink}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'}>
                      <ActionIcon aria-label="Copy share link" size="sm" variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            )}
          </Group>
          <Divider label="members" labelPosition="center" />
          {members.map((member) => (
            <Group key={member.userId} justify="space-between" wrap="nowrap">
              <Text size="sm">{member.userId}</Text>
              <Group gap="xs" wrap="nowrap">
                <Select
                  aria-label={`Role for ${member.userId}`}
                  data={MEMBER_ROLE_OPTIONS}
                  value={member.role}
                  onChange={(value) => void handleMemberRole(member, (value as Role) ?? 'viewer')}
                  disabled={shareLoading}
                  w={110}
                />
                <ActionIcon aria-label={`Remove ${member.userId}`} color="red" variant="subtle" disabled={shareLoading} onClick={() => void handleRemoveMember(member.userId)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
          <Divider label="pending invite links" labelPosition="center" />
          {invitations.map((invitation) => (
            <Group key={invitation.id} justify="space-between" wrap="nowrap">
              <Text size="sm">{invitation.role} until {new Date(invitation.expiresAt).toLocaleString()}</Text>
              <ActionIcon aria-label={`Revoke invite ${invitation.id}`} color="red" variant="subtle" disabled={shareLoading} onClick={() => void handleRevokeInvite(invitation.id)}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          {!shareLoading && members.length === 0 && invitations.length === 0 && <Text size="sm" c="dimmed"><IconUsers size={14} /> No members or pending invites.</Text>}
        </Stack>
      </Modal>
    </>
  );
}
