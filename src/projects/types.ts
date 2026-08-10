/**
 * Project & Workspace types.
 */

/** Role within a workspace or project */
export type Role = 'owner' | 'editor' | 'viewer';

/** A member (user) with a role */
export interface Member {
  userId: string;
  email: string;
  displayName?: string;
  role: Role;
  joinedAt: number;
}

/** A share invite (pending or accepted) */
export interface ShareInvite {
  id: string;
  targetType: 'project' | 'workspace';
  targetId: string;
  invitedEmail: string;
  role: Role;
  createdAt: number;
  acceptedAt?: number;
  /** Share link token (for link-based sharing) */
  token?: string;
}

/** Project settings — plugin configs, renderer prefs, etc. */
export interface ProjectSettings {
  basemap?: string;
  center?: [number, number];
  zoom?: number;
  plugins?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/** A Project — self-contained working context */
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  /** Whether this project is available offline */
  offlineEnabled: boolean;
  /** Members with access */
  members: Member[];
}

/** Workspace-level settings */
export interface WorkspaceSettings {
  defaultBasemap?: string;
  branding?: {
    name?: string;
    logo?: string;
    primaryColor?: string;
  };
  [key: string]: unknown;
}

/** A Workspace — collection of projects */
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  /** Members with access to the whole workspace */
  members: Member[];
}
