import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitation, getCapabilities } from '../../src/projects/api';
import { generateShareLink } from '../../src/projects/sharing';
import { useAuthStore } from '../../src/features/auth/store';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url: call[0], init: call[1] };
}

describe('invitation email', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'jwt-token' });
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
    vi.unstubAllGlobals();
  });

  it('reads the email capability off the server both ways', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ email_configured: true }));
    expect(await getCapabilities()).toEqual({ emailConfigured: true });
    expect(lastRequest().url).toBe('/api/v1/capabilities');

    fetchMock.mockResolvedValueOnce(jsonResponse({ email_configured: false }));
    expect(await getCapabilities()).toEqual({ emailConfigured: false });
  });

  it('leaves the recipient out when none was given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'invite-1', token: 'tok' }));
    await createInvitation('project', 'project-1', 'viewer', '2026-09-01T00:00:00Z');
    expect(JSON.parse(lastRequest().init.body as string)).toEqual({
      role: 'viewer',
      expires_at: '2026-09-01T00:00:00Z',
    });
  });

  it('sends the recipient and reports that the invite was emailed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'invite-2', token: 'tok-2', email: { status: 'sent' } }),
    );
    const created = await generateShareLink({
      targetType: 'project',
      targetId: 'project-1',
      role: 'editor',
      email: 'invitee@example.com',
    });

    const { url, init } = lastRequest();
    expect(url).toBe('/api/v1/projects/project-1/invitations');
    expect(JSON.parse(init.body as string)).toEqual({
      role: 'editor',
      expires_at: expect.any(String),
      email: 'invitee@example.com',
    });
    expect(created.email).toEqual({ status: 'sent' });
    expect(created.url).toContain('invite=tok-2');
  });

  it('reports a relay failure while still handing back the link', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'invite-3',
        token: 'tok-3',
        email: { status: 'failed', error: 'connection refused' },
      }),
    );
    const created = await generateShareLink({
      targetType: 'workspace',
      targetId: 'workspace-1',
      role: 'viewer',
      email: 'invitee@example.com',
    });

    expect(created.email).toEqual({ status: 'failed', error: 'connection refused' });
    expect(created.url).toContain('invite=tok-3');
  });
});
