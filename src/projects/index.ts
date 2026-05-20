/**
 * Projects module — barrel export.
 */

export type { Project, Workspace, Member, ShareInvite, Role, ProjectSettings, WorkspaceSettings } from './types';
export { useProjectsStore } from './projectsStore';
export { useWorkspacesStore } from './workspacesStore';
export { inviteByEmail, generateShareLink, acceptInvite, revokeInvite, removeMember, updateMemberRole, getPendingInvites } from './sharing';
export { ProjectSwitcher } from './ProjectSwitcher';
