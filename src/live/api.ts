import { apiHeaders } from '../lib/apiAuth';
import type { LiveDocument, LiveDocumentSummary, LiveLinkResolution, LiveRole } from './types';

const AGORA_BASE = '/agora';

export interface LiveMember {
  userId: string;
  role: LiveRole;
}

export interface LiveDocumentDetail extends LiveDocumentSummary {
  members: LiveMember[];
  state?: LiveDocument;
}

/**
 * A refusal agora explained. `reason` is its own wording, safe to show a user,
 * and empty when the response carried no explanation.
 */
export class AgoraRequestError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function refusalReason(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return '';
  const { error } = body as { error?: unknown };
  return typeof error === 'string' ? error : '';
}

async function agoraFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${AGORA_BASE}${path}`, {
    ...init,
    headers: apiHeaders(init?.headers),
  });
  if (response.ok) return response;
  const failure = `agora ${init?.method ?? 'GET'} ${path} failed with ${response.status}`;
  const reason = await refusalReason(response);
  throw new AgoraRequestError(
    response.status,
    reason,
    reason ? `${failure}: ${reason}` : failure,
  );
}

async function agoraRequest<Result>(path: string, init?: RequestInit): Promise<Result> {
  const response = await agoraFetch(path, init);
  return (await response.json()) as Result;
}

export function createLiveDocument(name: string): Promise<LiveDocumentSummary> {
  return agoraRequest('/documents', { method: 'POST', body: JSON.stringify({ name }) });
}

export function listLiveDocuments(): Promise<LiveDocumentSummary[]> {
  return agoraRequest('/documents');
}

export function fetchLiveDocument(documentId: string): Promise<LiveDocumentDetail> {
  return agoraRequest(`/documents/${encodeURIComponent(documentId)}`);
}

function memberPath(documentId: string, userId: string): string {
  return `/documents/${encodeURIComponent(documentId)}/members/${encodeURIComponent(userId)}`;
}

/** Adds the member or changes their role, whichever the row needs. */
export async function setLiveMember(
  documentId: string,
  userId: string,
  role: LiveRole,
): Promise<void> {
  await agoraFetch(memberPath(documentId, userId), {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function removeLiveMember(documentId: string, userId: string): Promise<void> {
  await agoraFetch(memberPath(documentId, userId), { method: 'DELETE' });
}

export function createShareLink(documentId: string, role: LiveRole): Promise<{ token: string }> {
  return agoraRequest(`/documents/${encodeURIComponent(documentId)}/links`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function resolveShareLink(token: string): Promise<LiveLinkResolution> {
  return agoraRequest(`/links/${encodeURIComponent(token)}`);
}

export const SHARE_LINK_PARAM = 'live';

export function shareLinkUrl(token: string): string {
  return `${location.origin}/?${SHARE_LINK_PARAM}=${encodeURIComponent(token)}`;
}
