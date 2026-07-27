/**
 * ProjectSwitcher — header dropdown for workspace/project switching & management.
 */
import { useEffect, useState } from 'react';
import {
  Menu,
  Button,
  Text,
  Group,
  Stack,
  Badge,
  ActionIcon,
  Modal,
  TextInput,
  Textarea,
  Select,
  Divider,
  CopyButton,
  Tooltip,
} from '@mantine/core';
import {
  IconFolder,
  IconFolderPlus,
  IconChevronDown,
  IconShare,
  IconTrash,
  IconCopy,
  IconCheck,
  IconUsers,
} from '@tabler/icons-react';
import { useProjectsStore } from './projectsStore';
import { useWorkspacesStore } from './workspacesStore';
import { inviteByEmail, generateShareLink } from './sharing';
import type { Role } from './types';

export function ProjectSwitcher() {
  const { items: projects, activeProjectId, setActive, load: loadProjects, create: createProject, remove: removeProject } = useProjectsStore();
  const { items: workspaces, activeWorkspaceId, load: loadWorkspaces, setActive: setActiveWorkspace, create: createWorkspace } = useWorkspacesStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createType, setCreateType] = useState<'project' | 'workspace'>('project');
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<Role>('viewer');
  const [shareLink, setShareLink] = useState('');

  useEffect(() => {
    loadWorkspaces().then(() => loadProjects());
  }, [loadWorkspaces, loadProjects]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceProjects = projects.filter((p) => p.workspaceId === activeWorkspaceId);

  async function handleCreate() {
    if (!newName.trim()) return;
    if (createType === 'workspace') {
      const ws = await createWorkspace({ name: newName, description: newDesc || undefined });
      setActiveWorkspace(ws.id);
    } else {
      if (!activeWorkspaceId) return;
      const proj = await createProject({ workspaceId: activeWorkspaceId, name: newName, description: newDesc || undefined });
      setActive(proj.id);
    }
    setNewName('');
    setNewDesc('');
    setCreateModalOpen(false);
  }

  async function handleInvite() {
    if (!shareEmail.trim() || !activeProjectId) return;
    await inviteByEmail({
      targetType: 'project',
      targetId: activeProjectId,
      email: shareEmail,
      role: shareRole,
    });
    setShareEmail('');
  }

  async function handleGenerateLink() {
    if (!activeProjectId) return;
    const { url } = await generateShareLink({
      targetType: 'project',
      targetId: activeProjectId,
      role: shareRole,
    });
    setShareLink(url);
  }

  return (
    <>
      <Group gap="xs">
        {/* Workspace selector */}
        {workspaces.length > 1 && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Button variant="subtle" size="xs" rightSection={<IconChevronDown size={14} />}>
                {activeWorkspace?.name ?? 'Workspace'}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Workspaces</Menu.Label>
              {workspaces.map((ws) => (
                <Menu.Item
                  key={ws.id}
                  onClick={() => setActiveWorkspace(ws.id)}
                  rightSection={ws.id === activeWorkspaceId ? <IconCheck size={14} /> : null}
                >
                  {ws.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconFolderPlus size={14} />}
                onClick={() => { setCreateType('workspace'); setCreateModalOpen(true); }}
              >
                New Workspace
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Project selector */}
        <Menu shadow="md" width={240}>
          <Menu.Target>
            <Button variant="light" size="xs" leftSection={<IconFolder size={14} />} rightSection={<IconChevronDown size={14} />}>
              {activeProject?.name ?? 'Select Project'}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Projects{activeWorkspace ? ` — ${activeWorkspace.name}` : ''}</Menu.Label>
            {workspaceProjects.length === 0 && (
              <Menu.Item disabled>No projects yet</Menu.Item>
            )}
            {workspaceProjects.map((proj) => (
              <Menu.Item
                key={proj.id}
                onClick={() => setActive(proj.id)}
                rightSection={
                  <Group gap={4}>
                    {proj.offlineEnabled && <Badge size="xs" variant="dot" color="green">offline</Badge>}
                    {proj.id === activeProjectId && <IconCheck size={14} />}
                  </Group>
                }
              >
                <Text size="sm">{proj.name}</Text>
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconFolderPlus size={14} />}
              onClick={() => { setCreateType('project'); setCreateModalOpen(true); }}
            >
              New Project
            </Menu.Item>
            {activeProject && (
              <>
                <Menu.Item
                  leftSection={<IconShare size={14} />}
                  onClick={() => setShareModalOpen(true)}
                >
                  Share
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconUsers size={14} />}
                  disabled
                >
                  {activeProject.members.length} member{activeProject.members.length !== 1 ? 's' : ''}
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => { if (confirm(`Delete "${activeProject.name}"?`)) removeProject(activeProject.id); }}
                >
                  Delete Project
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Create Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={`New ${createType === 'workspace' ? 'Workspace' : 'Project'}`}
        size="sm"
      >
        <Stack>
          <TextInput
            label="Name"
            placeholder={createType === 'workspace' ? 'My Workspace' : 'My Project'}
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            autoFocus
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            value={newDesc}
            onChange={(e) => setNewDesc(e.currentTarget.value)}
          />
          <Button onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </Button>
        </Stack>
      </Modal>

      {/* Share Modal */}
      <Modal
        opened={shareModalOpen}
        onClose={() => { setShareModalOpen(false); setShareLink(''); }}
        title={`Share "${activeProject?.name ?? ''}"`}
        size="md"
      >
        <Stack>
          <Text size="sm" c="dimmed">Invite someone by email or generate a share link.</Text>

          <Group align="end">
            <TextInput
              label="Email"
              placeholder="user@example.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              label="Role"
              data={[
                { value: 'viewer', label: 'Viewer' },
                { value: 'editor', label: 'Editor' },
              ]}
              value={shareRole}
              onChange={(v) => setShareRole((v as Role) ?? 'viewer')}
              w={110}
            />
            <Button onClick={handleInvite} disabled={!shareEmail.trim()}>
              Invite
            </Button>
          </Group>

          <Divider label="or" labelPosition="center" />

          <Group>
            <Button variant="light" onClick={handleGenerateLink}>
              Generate Link
            </Button>
            {shareLink && (
              <Group gap={4}>
                <Text size="xs" style={{ wordBreak: 'break-all' }}>{shareLink}</Text>
                <CopyButton value={shareLink}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'}>
                      <ActionIcon size="sm" variant="subtle" onClick={copy}>
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            )}
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
