import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';
import {
  createLiveDocument,
  createShareLink,
  fetchLiveDocument,
  listLiveDocuments,
  resolveShareLink,
  shareLinkUrl,
} from '../../src/live/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

describe('agora http api', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'jwt-token' });
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
    vi.unstubAllGlobals();
  });

  it('creates a document with the platform bearer token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'doc-1', name: 'atlas' }));
    const created = await createLiveDocument('atlas');
    expect(created).toEqual({ id: 'doc-1', name: 'atlas' });
    const { url, init } = lastRequest();
    expect(url).toBe('/agora/documents');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'atlas' }));
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer jwt-token');
  });

  it('lists documents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'doc-1', name: 'atlas' }]));
    await expect(listLiveDocuments()).resolves.toEqual([{ id: 'doc-1', name: 'atlas' }]);
    expect(lastRequest().url).toBe('/agora/documents');
  });

  it('fetches one document by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'doc 1', name: 'atlas' }));
    await fetchLiveDocument('doc 1');
    expect(lastRequest().url).toBe('/agora/documents/doc%201');
  });

  it('creates a role scoped share link', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'link-token' }));
    await expect(createShareLink('doc-1', 'view')).resolves.toEqual({ token: 'link-token' });
    const { url, init } = lastRequest();
    expect(url).toBe('/agora/documents/doc-1/links');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ role: 'view' }));
  });

  it('resolves a share link into a document, role and session token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ doc: 'doc-1', role: 'edit', sessionToken: 'session-jwt' }),
    );
    await expect(resolveShareLink('link-token')).resolves.toEqual({
      doc: 'doc-1',
      role: 'edit',
      sessionToken: 'session-jwt',
    });
    expect(lastRequest().url).toBe('/agora/links/link-token');
  });

  it('throws with the status when the service refuses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'nope' }, 403));
    await expect(createShareLink('doc-1', 'edit')).rejects.toThrow('403');
  });

  it('builds a share url carrying the link token', () => {
    expect(shareLinkUrl('link token')).toBe(`${location.origin}/?live=link%20token`);
  });
});
