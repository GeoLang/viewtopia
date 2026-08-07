import { apiHeaders } from '../lib/apiAuth';
import type { LiveDocument, LiveDocumentSummary, LiveLinkResolution, LiveRole } from './types';

const AGORA_BASE = '/agora';

export interface LiveDocumentDetail extends LiveDocumentSummary {
  state?: LiveDocument;
}

async function agoraRequest<Result>(path: string, init?: RequestInit): Promise<Result> {
  const response = await fetch(`${AGORA_BASE}${path}`, {
    ...init,
    headers: apiHeaders(init?.headers),
  });
  if (!response.ok) {
    throw new Error(`agora ${init?.method ?? 'GET'} ${path} failed with ${response.status}`);
  }
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
