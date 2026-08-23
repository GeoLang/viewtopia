/**
 * Project & Workspace types.
 */

/** Role within a workspace or project */
export type Role = 'owner' | 'editor' | 'viewer';

export interface Member {
  userId: string;
  role: Role;
  createdAt: string;
}

export interface ShareInvite {
  id: string;
  targetType: 'project' | 'workspace';
  targetId: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  role: Role;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  role: Role;
}
