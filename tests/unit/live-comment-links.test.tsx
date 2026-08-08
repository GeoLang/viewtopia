import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '../../src/features/auth/store';
import { commentLinkUrl } from '../../src/live/api';
import { useJoinLiveFromLink } from '../../src/live/joinFromLink';
import { useLiveStore } from '../../src/live/liveStore';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

let server: FakeAgoraServer;

function setUrl(pathAndQuery: string) {
  history.replaceState(null, '', pathAndQuery);
}

describe('comment link urls', () => {
  afterEach(() => setUrl('/'));

  it('links by document id for a member session', () => {
    setUrl('/');
    expect(commentLinkUrl('doc-9', 'c1')).toBe(`${location.origin}/?doc=doc-9&comment=c1`);
  });

  it('keeps the share token when the session came from one', () => {
    setUrl('/?live=link-token');
    expect(commentLinkUrl('doc-9', 'c1')).toBe(
      `${location.origin}/?live=link-token&comment=c1`,
    );
  });
});

describe('joining from a deep link', () => {
  beforeEach(() => {
    server = new FakeAgoraServer();
    server.install();
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    useAuthStore.setState({ user: null, token: null });
    setUrl('/');
    vi.unstubAllGlobals();
  });

  it('joins by document id and queues the comment focus when signed in', () => {
    useAuthStore.setState({ token: 'jwt-token' });
    setUrl('/?doc=doc-9&comment=c1');
    renderHook(() => useJoinLiveFromLink());

    const state = useLiveStore.getState();
    expect(state.documentId).toBe('doc-9');
    expect(state.focusedCommentId).toBe('c1');
    expect(state.commentsOpen).toBe(true);
  });

  it('does nothing but warn when a doc link arrives signed out', () => {
    setUrl('/?doc=doc-9&comment=c1');
    renderHook(() => useJoinLiveFromLink());
    expect(useLiveStore.getState().documentId).toBeNull();
    expect(useLiveStore.getState().focusedCommentId).toBeNull();
  });

  it('resolves a share link, then focuses the comment it names', async () => {
    setUrl('/?live=link-token&comment=c1');
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ doc: 'doc-9', role: 'view', sessionToken: 'session-jwt' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useJoinLiveFromLink());

    await waitFor(() => expect(useLiveStore.getState().focusedCommentId).toBe('c1'));
    expect(useLiveStore.getState().documentId).toBe('doc-9');
    expect(useLiveStore.getState().role).toBe('view');
    expect(fetchMock).toHaveBeenCalledWith('/agora/links/link-token', expect.anything());
  });

  it('adopts the member role the snapshot carries', () => {
    useAuthStore.setState({ token: 'jwt-token' });
    setUrl('/?doc=doc-9');
    renderHook(() => useJoinLiveFromLink());
    expect(useLiveStore.getState().role).toBe('edit');

    server.connection.acceptHandshake();
    server.connection.deliver({
      type: 'snapshot',
      seq: 0,
      state: server.document,
      actor: 'ada',
      role: 'view',
    });
    expect(useLiveStore.getState().role).toBe('view');
  });
});
