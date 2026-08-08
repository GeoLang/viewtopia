import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import {
  COMMENT_TEXT_LIMIT,
  commentTextSegments,
  commentThreads,
  currentCommentAuthor,
  currentMapAnchor,
  deleteComment,
  deleteCommentThread,
  flyToComment,
  postComment,
  setCommentResolved,
} from '../../src/live/comments';
import { useLiveStore } from '../../src/live/liveStore';
import type { LiveComment, LiveRole } from '../../src/live/types';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const DOCUMENT_ID = 'doc-1';
const TOKEN = 'jwt-token';
const OWN_ACTOR = 'ada';

function comment(overrides: Partial<LiveComment> = {}): LiveComment {
  return {
    id: 'c1',
    actor: OWN_ACTOR,
    authorName: 'Ada Lovelace',
    text: 'is this the right coastline',
    createdAt: 10,
    resolved: false,
    ...overrides,
  };
}

function byId(comments: LiveComment[]): Record<string, LiveComment> {
  return Object.fromEntries(comments.map((entry) => [entry.id, entry]));
}

let server: FakeAgoraServer;

/** join as ada, whose display name the peer list carries */
function joinAs(role: LiveRole = 'edit', actor: string | undefined = OWN_ACTOR) {
  useLiveStore.getState().connect({ documentId: DOCUMENT_ID, token: TOKEN, role });
  const connection = server.connection;
  connection.acceptHandshake();
  connection.deliver({ type: 'snapshot', seq: server.seq, state: server.document, actor, role });
  server.sendPeers([{ actor: OWN_ACTOR, name: 'Ada Lovelace', role }]);
  return connection;
}

describe('live comment threads', () => {
  it('groups replies under their top level comment, oldest first', () => {
    const threads = commentThreads(
      byId([
        comment({ id: 'root-late', createdAt: 200 }),
        comment({ id: 'root-early', createdAt: 100 }),
        comment({ id: 'reply-b', parentId: 'root-early', createdAt: 150 }),
        comment({ id: 'reply-a', parentId: 'root-early', createdAt: 120 }),
        comment({ id: 'reply-c', parentId: 'root-late', createdAt: 210 }),
      ]),
    );

    expect(threads.map((thread) => thread.root.id)).toEqual(['root-early', 'root-late']);
    expect(threads[0].replies.map((reply) => reply.id)).toEqual(['reply-a', 'reply-b']);
    expect(threads[1].replies.map((reply) => reply.id)).toEqual(['reply-c']);
  });

  it('breaks a createdAt tie on the id so the order never flickers', () => {
    const threads = commentThreads(
      byId([comment({ id: 'b', createdAt: 5 }), comment({ id: 'a', createdAt: 5 })]),
    );
    expect(threads.map((thread) => thread.root.id)).toEqual(['a', 'b']);
  });

  it('drops a reply whose top level comment is gone', () => {
    const threads = commentThreads(
      byId([comment({ id: 'root' }), comment({ id: 'orphan', parentId: 'deleted' })]),
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe('root');
    expect(threads[0].replies).toEqual([]);
  });

  it('reads an empty document as no threads', () => {
    expect(commentThreads({})).toEqual([]);
  });
});

describe('live comment writes', () => {
  beforeEach(() => {
    server = new FakeAgoraServer();
    server.install();
    useAuthStore.setState({ user: null, token: TOKEN });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
    useSpaceTimeStore.setState({ flyToTarget: null });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-3333-4444-555555555555');
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    useAuthStore.setState({ user: null, token: null });
    vi.restoreAllMocks();
  });

  it('learns its own actor from the snapshot frame', () => {
    expect(useLiveStore.getState().actor).toBeNull();
    joinAs();
    expect(useLiveStore.getState().actor).toBe(OWN_ACTOR);
    expect(currentCommentAuthor()).toEqual({ actor: OWN_ACTOR, name: 'Ada Lovelace' });
  });

  it('writes a top level comment attributed to the session actor and its peer name', () => {
    const connection = joinAs();
    const written = postComment({ text: '  needs a check  ' });

    expect(written).toEqual({
      id: '11111111-2222-3333-4444-555555555555',
      actor: OWN_ACTOR,
      authorName: 'Ada Lovelace',
      text: 'needs a check',
      createdAt: 1000,
      resolved: false,
    });
    expect(connection.operationsSent).toEqual([
      {
        type: 'op',
        clientSeq: 1,
        key: 'comments/11111111-2222-3333-4444-555555555555',
        value: written,
      },
    ]);
    expect(
      useLiveStore.getState().document.comments['11111111-2222-3333-4444-555555555555'].text,
    ).toBe('needs a check');
  });

  it('keeps the display name the account has when the peer list has no entry yet', () => {
    useAuthStore.setState({ user: { name: 'Grace Hopper' } });
    useLiveStore.getState().connect({ documentId: DOCUMENT_ID, token: TOKEN });
    server.connection.acceptHandshake();
    server.connection.deliver({
      type: 'snapshot',
      seq: 0,
      state: server.document,
      actor: 'grace',
    });
    expect(postComment({ text: 'mine' })?.authorName).toBe('Grace Hopper');
  });

  it('writes a reply carrying its parent id and no resolved flag', () => {
    joinAs();
    const reply = postComment({ text: 'checked, it is', parentId: 'root-1' });
    expect(reply?.parentId).toBe('root-1');
    expect(reply).not.toHaveProperty('resolved');
  });

  it('attaches the current map view when asked and flies back to it', () => {
    joinAs();
    setSharedCamera({ longitude: 12.5, latitude: -3.25, zoom: 8 });
    const anchored = postComment({ text: 'look here', anchor: currentMapAnchor() });
    expect(anchored?.anchor).toEqual({ lng: 12.5, lat: -3.25, zoom: 8 });

    flyToComment(anchored as LiveComment);
    expect(useSpaceTimeStore.getState().flyToTarget).toEqual({ lng: 12.5, lat: -3.25, zoom: 8 });
  });

  it('leaves the map alone for a comment with no anchor', () => {
    joinAs();
    flyToComment(comment());
    expect(useSpaceTimeStore.getState().flyToTarget).toBeNull();
  });

  it('refuses empty text and text past the ui cap', () => {
    const connection = joinAs();
    expect(postComment({ text: '   ' })).toBeNull();
    expect(postComment({ text: 'x'.repeat(COMMENT_TEXT_LIMIT + 1) })).toBeNull();
    expect(connection.editsSent).toHaveLength(0);
    expect(postComment({ text: 'x'.repeat(COMMENT_TEXT_LIMIT) })).not.toBeNull();
  });

  it('refuses to write before the session says who we are', () => {
    useLiveStore.getState().connect({ documentId: DOCUMENT_ID, token: TOKEN });
    server.connection.acceptHandshake();
    expect(currentCommentAuthor()).toBeNull();
    expect(postComment({ text: 'who am i' })).toBeNull();
    expect(server.connection.editsSent).toHaveLength(0);
  });

  it('resolves a thread as one last writer wins edit of its own value', () => {
    const connection = joinAs();
    const root = comment({ id: 'root-1' });
    setCommentResolved(root, true);
    expect(connection.operationsSent).toEqual([
      { type: 'op', clientSeq: 1, key: 'comments/root-1', value: { ...root, resolved: true } },
    ]);
    expect(useLiveStore.getState().document.comments['root-1'].resolved).toBe(true);

    setCommentResolved({ ...root, resolved: true }, false);
    expect(useLiveStore.getState().document.comments['root-1'].resolved).toBe(false);
  });

  it('deletes a thread and its replies as one frame', () => {
    const connection = joinAs();
    const root = comment({ id: 'root-1' });
    const replies = [
      comment({ id: 'reply-1', parentId: 'root-1' }),
      comment({ id: 'reply-2', parentId: 'root-1' }),
    ];
    server.applyBatchFromPeer(
      'grace',
      [root, ...replies].map((entry) => ({ key: `comments/${entry.id}`, value: entry })),
    );
    expect(Object.keys(useLiveStore.getState().document.comments)).toHaveLength(3);

    deleteCommentThread(commentThreads(useLiveStore.getState().document.comments)[0]);
    expect(connection.batchesSent).toEqual([
      {
        type: 'batch',
        clientSeq: 1,
        ops: [
          { key: 'comments/root-1', value: null },
          { key: 'comments/reply-1', value: null },
          { key: 'comments/reply-2', value: null },
        ],
      },
    ]);
    expect(useLiveStore.getState().document.comments).toEqual({});
  });

  it('deletes one reply on its own', () => {
    const connection = joinAs();
    deleteComment(comment({ id: 'reply-1', parentId: 'root-1' }));
    expect(connection.operationsSent).toEqual([
      { type: 'op', clientSeq: 1, key: 'comments/reply-1', value: null },
    ]);
  });

  it('applies a comment a peer wrote', () => {
    joinAs();
    server.applyFromPeer('grace', 'comments/root-1', comment({ id: 'root-1', actor: 'grace' }));
    expect(useLiveStore.getState().document.comments['root-1'].actor).toBe('grace');
  });

  it('writes nothing at all with the view role', () => {
    const connection = joinAs('view');
    postComment({ text: 'let me in' });
    setCommentResolved(comment({ id: 'root-1' }), true);
    deleteComment(comment({ id: 'root-1' }));
    deleteCommentThread({ root: comment({ id: 'root-1' }), replies: [comment({ id: 'r' })] });
    expect(connection.editsSent).toHaveLength(0);
    expect(useLiveStore.getState().document.comments).toEqual({});
  });

  it('forgets its actor when the session ends', () => {
    joinAs();
    useLiveStore.getState().disconnect();
    expect(useLiveStore.getState().actor).toBeNull();
    expect(currentCommentAuthor()).toBeNull();
  });
});

describe('comment mentions', () => {
  beforeEach(() => {
    server = new FakeAgoraServer();
    server.install();
    useAuthStore.setState({ user: null, token: TOKEN });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-3333-4444-555555555555');
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    useLiveStore.getState().disconnect();
    server.restore();
    useAuthStore.setState({ user: null, token: null });
    vi.restoreAllMocks();
  });

  it('keeps only picked mentions the text still names, deduped', () => {
    joinAs();
    const grace = { userId: 'grace', name: 'Grace' };
    const erased = { userId: 'gone', name: 'Gone' };
    const written = postComment({
      text: 'ask @Grace about this',
      mentions: [grace, grace, erased],
    });
    expect(written?.mentions).toEqual([grace]);
  });

  it('omits the field when nothing was picked', () => {
    joinAs();
    expect(postComment({ text: 'no pings here' })).not.toHaveProperty('mentions');
  });

  it('splits text into segments where the longer of two overlapping names wins', () => {
    const segments = commentTextSegments(
      comment({
        text: 'ping @Ada Lovelace and @Ada now',
        mentions: [
          { userId: 'short', name: 'Ada' },
          { userId: 'long', name: 'Ada Lovelace' },
        ],
      }),
    );
    expect(segments).toEqual([
      { text: 'ping ' },
      { text: '@Ada Lovelace', mention: true },
      { text: ' and ' },
      { text: '@Ada', mention: true },
      { text: ' now' },
    ]);
  });

  it('reads unmentioned text as one plain segment', () => {
    expect(commentTextSegments(comment())).toEqual([{ text: 'is this the right coastline' }]);
  });
});
