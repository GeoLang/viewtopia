/**
 * Sharing module — invite users to projects/workspaces, generate share links.
 *
 * These invites stay client side, for the local projects in IndexedDB. A live
 * map document shares through agora instead, see src/live.
 */
import { shareInvites as invitesDb } from '../offline/db';
import type { ShareInvite, Role, Member } from './types';
import { useProjectsStore } from './projectsStore';
import { useWorkspacesStore } from './workspacesStore';

export const PROJECT_INVITE_PARAM = 'invite';

export function projectInviteUrl(token: string): string {
  return `${location.origin}/?${PROJECT_INVITE_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * Invite a user by email to a project or workspace.
 */
export async function inviteByEmail(params: {
  targetType: 'project' | 'workspace';
  targetId: string;
  email: string;
  role: Role;
}): Promise<ShareInvite> {
  const invite: ShareInvite = {
    id: crypto.randomUUID(),
    targetType: params.targetType,
    targetId: params.targetId,
    invitedEmail: params.email,
    role: params.role,
    createdAt: Date.now(),
  };

  await invitesDb.put(invite);
  return invite;
}

/**
 * Generate a share link for a project or workspace.
 * Returns a token-based URL that recipients can use to join.
 */
export async function generateShareLink(params: {
  targetType: 'project' | 'workspace';
  targetId: string;
  role: Role;
}): Promise<{ invite: ShareInvite; url: string }> {
  const token = crypto.randomUUID();
  const invite: ShareInvite = {
    id: crypto.randomUUID(),
    targetType: params.targetType,
    targetId: params.targetId,
    invitedEmail: '', // link-based, no specific email
    role: params.role,
    createdAt: Date.now(),
    token,
  };

  await invitesDb.put(invite);

  return { invite, url: projectInviteUrl(token) };
}

/**
 * Accept an invite — adds the current user as a member.
 */
export async function acceptInvite(inviteId: string, userId: string, email: string): Promise<void> {
  const invite = await invitesDb.get(inviteId);
  if (!invite) throw new Error('Invite not found');
  if (invite.acceptedAt) throw new Error('Invite already accepted');

  const member: Member = {
    userId,
    email,
    role: invite.role,
    joinedAt: Date.now(),
  };

  // Add member to the target
  if (invite.targetType === 'project') {
    const store = useProjectsStore.getState();
    const project = store.items.find((p) => p.id === invite.targetId);
    if (project) {
      await store.update(invite.targetId, {
        members: [...project.members, member],
      });
    }
  } else {
    const store = useWorkspacesStore.getState();
    const workspace = store.items.find((w) => w.id === invite.targetId);
    if (workspace) {
      await store.update(invite.targetId, {
        members: [...workspace.members, member],
      });
    }
  }

  const updated: ShareInvite = { ...invite, acceptedAt: Date.now() };
  await invitesDb.put(updated);
}

export async function joinProjectFromToken(token: string): Promise<ShareInvite> {
  const invite = await invitesDb.getByToken(token);
  if (!invite) throw new Error('Invite not found');
  await useProjectsStore.getState().load();
  await useWorkspacesStore.getState().load();
  await acceptInvite(invite.id, 'local-user', '');
  if (invite.targetType === 'project') {
    await useProjectsStore.getState().switchTo(invite.targetId);
  } else {
    useWorkspacesStore.getState().setActive(invite.targetId);
  }
  return invite;
}

/**
 * Revoke/delete a share invite.
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  await invitesDb.remove(inviteId);
}

/**
 * Remove a member from a project or workspace.
 */
export async function removeMember(params: {
  targetType: 'project' | 'workspace';
  targetId: string;
  userId: string;
}): Promise<void> {
  if (params.targetType === 'project') {
    const store = useProjectsStore.getState();
    const project = store.items.find((p) => p.id === params.targetId);
    if (project) {
      await store.update(params.targetId, {
        members: project.members.filter((m) => m.userId !== params.userId),
      });
    }
  } else {
    const store = useWorkspacesStore.getState();
    const workspace = store.items.find((w) => w.id === params.targetId);
    if (workspace) {
      await store.update(params.targetId, {
        members: workspace.members.filter((m) => m.userId !== params.userId),
      });
    }
  }
}

/**
 * Update a member's role.
 */
export async function updateMemberRole(params: {
  targetType: 'project' | 'workspace';
  targetId: string;
  userId: string;
  newRole: Role;
}): Promise<void> {
  if (params.targetType === 'project') {
    const store = useProjectsStore.getState();
    const project = store.items.find((p) => p.id === params.targetId);
    if (project) {
      await store.update(params.targetId, {
        members: project.members.map((m) =>
          m.userId === params.userId ? { ...m, role: params.newRole } : m
        ),
      });
    }
  } else {
    const store = useWorkspacesStore.getState();
    const workspace = store.items.find((w) => w.id === params.targetId);
    if (workspace) {
      await store.update(params.targetId, {
        members: workspace.members.map((m) =>
          m.userId === params.userId ? { ...m, role: params.newRole } : m
        ),
      });
    }
  }
}

/**
 * Get all pending invites for a target.
 */
export async function getPendingInvites(
  targetType: 'project' | 'workspace',
  targetId: string
): Promise<ShareInvite[]> {
  const invites = await invitesDb.getByTarget(targetType, targetId);
  return invites.filter((i) => !i.acceptedAt);
}
