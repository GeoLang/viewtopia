import {
  acceptInvitation,
  createInvitation,
  deleteInvitation,
  deleteMember,
  type InvitationEmailDelivery,
  listInvitations,
  listMembers,
  setMember,
} from './api';
import { useAuthStore } from '../features/auth/store';
import { useProjectsStore } from './projectsStore';
import type { Member, Role, ShareInvite } from './types';
import { useWorkspacesStore } from './workspacesStore';

export const PROJECT_INVITE_PARAM = 'invite';
export const SHARE_LINK_EXPIRY_DAYS = 7;
const SHARE_LINK_EXPIRY_MS = SHARE_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

type TargetType = 'project' | 'workspace';
type InvitationRole = Exclude<Role, 'owner'>;

export function projectInviteUrl(token: string): string {
  return `${location.origin}/?${PROJECT_INVITE_PARAM}=${encodeURIComponent(token)}`;
}

function invitationExpiry(): string {
  return new Date(Date.now() + SHARE_LINK_EXPIRY_MS).toISOString();
}

function invitationRole(role: Role): InvitationRole {
  if (role === 'owner') throw new Error('Invite links can grant editor or viewer access only.');
  return role;
}

export async function generateShareLink(params: {
  targetType: TargetType;
  targetId: string;
  role: Role;
  // ptolemy mails the link, and only when a relay is configured there
  email?: string;
}): Promise<{ invite: ShareInvite; url: string; email?: InvitationEmailDelivery }> {
  const expiresAt = invitationExpiry();
  const created = await createInvitation(
    params.targetType,
    params.targetId,
    invitationRole(params.role),
    expiresAt,
    params.email,
  );
  const invite: ShareInvite = {
    id: created.id,
    targetType: params.targetType,
    targetId: params.targetId,
    role: params.role,
    createdBy: '',
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  return { invite, url: projectInviteUrl(created.token), email: created.email };
}

export async function joinProjectFromToken(token: string): Promise<void> {
  const authToken = useAuthStore.getState().token;
  if (!authToken) return;

  const accepted = await acceptInvitation(token);
  if (useAuthStore.getState().token !== authToken) return;

  await Promise.all([
    useProjectsStore.getState().load(),
    useWorkspacesStore.getState().load(),
  ]);
  if (useAuthStore.getState().token !== authToken) return;

  if (accepted.target === 'project') {
    const project = useProjectsStore.getState().items.find((item) => item.id === accepted.id);
    const canReadWorkspace = useWorkspacesStore.getState().items.some(
      (workspace) => workspace.id === project?.workspaceId,
    );
    useWorkspacesStore.getState().setActive(canReadWorkspace ? project?.workspaceId ?? null : null);
    await useProjectsStore.getState().switchTo(accepted.id);
  } else {
    useWorkspacesStore.getState().setActive(accepted.id);
    const firstProject = useProjectsStore.getState().items.find(
      (project) => project.workspaceId === accepted.id,
    );
    if (firstProject) {
      await useProjectsStore.getState().switchTo(firstProject.id);
    } else {
      useProjectsStore.getState().setActive(null);
    }
  }
  const url = new URL(location.href);
  url.searchParams.delete(PROJECT_INVITE_PARAM);
  history.replaceState(history.state, '', url);
}

export function addMember(params: {
  targetType: TargetType;
  targetId: string;
  userId: string;
  role: Role;
}): Promise<Member> {
  return setMember(params.targetType, params.targetId, params.userId, params.role);
}

export function removeMember(params: {
  targetType: TargetType;
  targetId: string;
  userId: string;
}): Promise<void> {
  return deleteMember(params.targetType, params.targetId, params.userId).then(() => undefined);
}

export function updateMemberRole(params: {
  targetType: TargetType;
  targetId: string;
  userId: string;
  newRole: Role;
}): Promise<Member> {
  return setMember(params.targetType, params.targetId, params.userId, params.newRole);
}

export function getPendingInvites(targetType: TargetType, targetId: string): Promise<ShareInvite[]> {
  return listInvitations(targetType, targetId);
}

export function revokeInvite(params: {
  targetType: TargetType;
  targetId: string;
  invitationId: string;
}): Promise<void> {
  return deleteInvitation(params.targetType, params.targetId, params.invitationId).then(() => undefined);
}

export function getMembers(targetType: TargetType, targetId: string): Promise<Member[]> {
  return listMembers(targetType, targetId);
}
