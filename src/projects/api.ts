import { apiHeaders, noticeRefusal } from '../lib/apiAuth';
import type { Member, Project, Role, ShareInvite, Workspace } from './types';

const API_BASE = '/api/v1';

type TargetType = 'project' | 'workspace';
type InvitationRole = Exclude<Role, 'owner'>;

interface WorkspaceResponse {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  role: Role;
}

interface ProjectResponse extends WorkspaceResponse {
  workspace_id: string;
}

interface MemberResponse {
  user_id: string;
  role: Role;
  created_at: string;
}

interface InvitationResponse {
  id: string;
  workspace_id?: string;
  project_id?: string;
  role: Role;
  created_by: string;
  created_at: string;
  expires_at: string;
}

interface CreatedInvitationResponse {
  id: string;
  token: string;
}

export interface InvitationAcceptance {
  target: TargetType;
  id: string;
}

export class PtolemyRequestError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string, method: string, path: string) {
    super(`ptolemy ${method} ${path} failed with ${status}: ${responseText || 'no response body'}`);
    this.status = status;
    this.responseText = responseText;
  }
}

function resourcePath(targetType: TargetType, targetId: string): string {
  return `/${targetType}s/${encodeURIComponent(targetId)}`;
}

function toWorkspace(response: WorkspaceResponse): Workspace {
  return {
    id: response.id,
    name: response.name,
    description: response.description ?? undefined,
    createdBy: response.created_by,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    role: response.role,
  };
}

function toProject(response: ProjectResponse): Project {
  return {
    ...toWorkspace(response),
    workspaceId: response.workspace_id,
  };
}

function toMember(response: MemberResponse): Member {
  return {
    userId: response.user_id,
    role: response.role,
    createdAt: response.created_at,
  };
}

function toInvitation(targetType: TargetType, response: InvitationResponse): ShareInvite {
  const targetId = targetType === 'workspace' ? response.workspace_id : response.project_id;
  if (!targetId) throw new Error(`ptolemy returned an invitation without a ${targetType} id`);
  return {
    id: response.id,
    targetType,
    targetId,
    role: response.role,
    createdBy: response.created_by,
    createdAt: response.created_at,
    expiresAt: response.expires_at,
  };
}

async function ptolemyFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: apiHeaders(init?.headers),
    });
  } catch (failure) {
    const responseText = failure instanceof Error ? failure.message : 'network request failed';
    throw new PtolemyRequestError(0, responseText, method, path);
  }
  if (response.ok) return response;
  noticeRefusal(response.status);
  throw new PtolemyRequestError(response.status, await response.text(), method, path);
}

async function ptolemyRequest<Result>(path: string, init?: RequestInit): Promise<Result> {
  const response = await ptolemyFetch(path, init);
  return (await response.json()) as Result;
}

function metadataBody(params: { name: string; description?: string }): string {
  return JSON.stringify({ name: params.name, description: params.description });
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return (await ptolemyRequest<WorkspaceResponse[]>('/workspaces')).map(toWorkspace);
}

export async function getWorkspace(id: string): Promise<Workspace> {
  return toWorkspace(await ptolemyRequest<WorkspaceResponse>(resourcePath('workspace', id)));
}

export async function createWorkspace(params: { name: string; description?: string }): Promise<Workspace> {
  return toWorkspace(await ptolemyRequest<WorkspaceResponse>('/workspaces', {
    method: 'POST',
    body: metadataBody(params),
  }));
}

export async function updateWorkspace(id: string, params: { name: string; description?: string }): Promise<Workspace> {
  return toWorkspace(await ptolemyRequest<WorkspaceResponse>(resourcePath('workspace', id), {
    method: 'PUT',
    body: metadataBody(params),
  }));
}

export function deleteWorkspace(id: string): Promise<Response> {
  return ptolemyFetch(resourcePath('workspace', id), { method: 'DELETE' });
}

export async function listProjects(): Promise<Project[]> {
  return (await ptolemyRequest<ProjectResponse[]>('/projects')).map(toProject);
}

export async function listWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  return (await ptolemyRequest<ProjectResponse[]>(`${resourcePath('workspace', workspaceId)}/projects`)).map(toProject);
}

export async function getProject(id: string): Promise<Project> {
  return toProject(await ptolemyRequest<ProjectResponse>(resourcePath('project', id)));
}

export async function createProject(
  workspaceId: string,
  params: { name: string; description?: string },
): Promise<Project> {
  return toProject(await ptolemyRequest<ProjectResponse>(`${resourcePath('workspace', workspaceId)}/projects`, {
    method: 'POST',
    body: metadataBody(params),
  }));
}

export async function updateProject(id: string, params: { name: string; description?: string }): Promise<Project> {
  return toProject(await ptolemyRequest<ProjectResponse>(resourcePath('project', id), {
    method: 'PUT',
    body: metadataBody(params),
  }));
}

export function deleteProject(id: string): Promise<Response> {
  return ptolemyFetch(resourcePath('project', id), { method: 'DELETE' });
}

export async function listMembers(targetType: TargetType, targetId: string): Promise<Member[]> {
  return (await ptolemyRequest<MemberResponse[]>(`${resourcePath(targetType, targetId)}/members`)).map(toMember);
}

export async function setMember(
  targetType: TargetType,
  targetId: string,
  userId: string,
  role: Role,
): Promise<Member> {
  return toMember(await ptolemyRequest<MemberResponse>(
    `${resourcePath(targetType, targetId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PUT', body: JSON.stringify({ role }) },
  ));
}

export function deleteMember(targetType: TargetType, targetId: string, userId: string): Promise<Response> {
  return ptolemyFetch(`${resourcePath(targetType, targetId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function listInvitations(targetType: TargetType, targetId: string): Promise<ShareInvite[]> {
  const invitations = await ptolemyRequest<InvitationResponse[]>(`${resourcePath(targetType, targetId)}/invitations`);
  return invitations.map((invitation) => toInvitation(targetType, invitation));
}

export async function createInvitation(
  targetType: TargetType,
  targetId: string,
  role: InvitationRole,
  expiresAt: string,
): Promise<CreatedInvitationResponse> {
  if (role !== 'editor' && role !== 'viewer') {
    throw new Error('Invite links can grant editor or viewer access only.');
  }
  return ptolemyRequest<CreatedInvitationResponse>(`${resourcePath(targetType, targetId)}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ role, expires_at: expiresAt }),
  });
}

export function deleteInvitation(targetType: TargetType, targetId: string, invitationId: string): Promise<Response> {
  return ptolemyFetch(`${resourcePath(targetType, targetId)}/invitations/${encodeURIComponent(invitationId)}`, {
    method: 'DELETE',
  });
}

export function acceptInvitation(token: string): Promise<InvitationAcceptance> {
  return ptolemyRequest<InvitationAcceptance>('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// ─── Project state ───────────────────────────────────────────────────

const NOT_FOUND = 404;

export interface ProjectStateEnvelope<Value> {
  value: Value;
  updatedAt: string;
  updatedBy: string;
}

interface ProjectStateResponse {
  value: unknown;
  updated_at: string;
  updated_by: string;
}

function statePath(projectId: string, key: string): string {
  return `${resourcePath('project', projectId)}/state/${encodeURIComponent(key)}`;
}

/** null when nobody has written the key yet, which is not a failure. */
export async function getProjectState<Value>(
  projectId: string,
  key: string,
): Promise<ProjectStateEnvelope<Value> | null> {
  try {
    const response = await ptolemyRequest<ProjectStateResponse>(statePath(projectId, key));
    return {
      value: response.value as Value,
      updatedAt: response.updated_at,
      updatedBy: response.updated_by,
    };
  } catch (failure) {
    if (failure instanceof PtolemyRequestError && failure.status === NOT_FOUND) return null;
    throw failure;
  }
}

export async function putProjectState(projectId: string, key: string, value: unknown): Promise<void> {
  await ptolemyFetch(statePath(projectId, key), { method: 'PUT', body: JSON.stringify(value) });
}

// ─── Project attachments ─────────────────────────────────────────────

interface AttachmentMetaResponse {
  id: string;
}

function attachmentsPath(projectId: string): string {
  return `${resourcePath('project', projectId)}/attachments`;
}

/** `data:image/png;base64,AAAA` split into what the upload body wants. */
function splitDataUrl(dataUrl: string): { contentType: string; base64: string } {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('image overlay is not a base64 data URL');
  return { contentType: match[1] || 'application/octet-stream', base64: match[2] };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('could not read the attachment'));
    reader.readAsDataURL(blob);
  });
}

/** The id ptolemy filed the bitmap under, which the map snapshot then names. */
export async function uploadProjectAttachment(
  projectId: string,
  name: string,
  dataUrl: string,
): Promise<string> {
  const { contentType, base64 } = splitDataUrl(dataUrl);
  const created = await ptolemyRequest<AttachmentMetaResponse>(attachmentsPath(projectId), {
    method: 'POST',
    body: JSON.stringify({
      name,
      content_type: contentType,
      data: base64,
      created_by: 'viewtopia',
    }),
  });
  return created.id;
}

export async function getProjectAttachmentDataUrl(
  projectId: string,
  attachmentId: string,
): Promise<string> {
  const response = await ptolemyFetch(
    `${attachmentsPath(projectId)}/${encodeURIComponent(attachmentId)}`,
  );
  return blobToDataUrl(await response.blob());
}
