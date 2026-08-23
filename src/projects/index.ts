/**
 * Projects module — barrel export.
 */

export type { Project, Workspace, Member, ShareInvite, Role } from './types';
export { useProjectsStore } from './projectsStore';
export { useWorkspacesStore } from './workspacesStore';
export { addMember, generateShareLink, getMembers, getPendingInvites, revokeInvite, removeMember, updateMemberRole } from './sharing';
export { ProjectSwitcher } from './ProjectSwitcher';
