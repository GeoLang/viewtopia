import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../src/features/auth/store';
import { useSpaceTimeStore } from '../../src/features/spacetime/store';
import { setSharedCamera } from '../../src/hooks/sharedCamera';
import { LiveComments } from '../../src/live/LiveComments';
import { LiveCommentsPanel } from '../../src/live/LiveCommentsPanel';
import { useLiveStore } from '../../src/live/liveStore';
import { emptyLiveDocument, type LiveComment, type LiveRole } from '../../src/live/types';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

const OWN_ACTOR = 'ada';

function comment(overrides: Partial<LiveComment> = {}): LiveComment {
  return {
    id: 'root-1',
    actor: OWN_ACTOR,
    authorName: 'Ada Lovelace',
    text: 'is this the right coastline',
    createdAt: 10,
    resolved: false,
    ...overrides,
  };
}

function draw(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

let server: FakeAgoraServer;

/** a live session with these comments already in the document */
function joinWith(comments: LiveComment[], role: LiveRole = 'edit') {
  server.document = {
    ...emptyLiveDocument('coastline'),
    comments: Object.fromEntries(comments.map((entry) => [entry.id, entry])),
  };
  useLiveStore.getState().connect({ documentId: 'doc-1', token: 'jwt-token', role });
  const connection = server.connection;
  connection.acceptHandshake();
  connection.deliver({
    type: 'snapshot',
    seq: 0,
    state: server.document,
    actor: OWN_ACTOR,
    role,
  });
  server.sendPeers([{ actor: OWN_ACTOR, name: 'Ada Lovelace', role }]);
  return connection;
}

describe('live comments panel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    server = new FakeAgoraServer();
    server.install();
    useAuthStore.setState({ user: null, token: 'jwt-token' });
    setSharedCamera({ longitude: 0, latitude: 20, zoom: 2 });
    useSpaceTimeStore.setState({ flyToTarget: null });
  });

  afterEach(() => {
    cleanup();
    useLiveStore.getState().disconnect();
    useAuthStore.setState({ user: null, token: null });
    server.restore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders each thread with its replies under it', () => {
    joinWith([
      comment(),
      comment({ id: 'reply-1', parentId: 'root-1', authorName: 'Grace Hopper', text: 'yes it is' }),
      comment({ id: 'root-2', createdAt: 50, text: 'move this label' }),
    ]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    expect(screen.getAllByTestId('comment-thread')).toHaveLength(2);
    expect(screen.getByTestId('comment-count')).toHaveTextContent('2');
    expect(screen.getByText('is this the right coastline')).toBeInTheDocument();
    expect(screen.getByText('yes it is')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('hides a resolved thread until the filter is switched on', () => {
    joinWith([comment(), comment({ id: 'root-2', createdAt: 50, resolved: true })]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    expect(screen.getAllByTestId('comment-thread')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Show 1 resolved'));
    expect(screen.getAllByTestId('comment-thread')).toHaveLength(2);
  });

  it('says so when there is nothing to read', () => {
    joinWith([]);
    draw(<LiveCommentsPanel onClose={() => {}} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('posts what the compose box holds and clears it', () => {
    const connection = joinWith([]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    const box = screen.getByLabelText('Leave a comment');
    fireEvent.change(box, { target: { value: 'check this coastline' } });
    fireEvent.click(screen.getByTestId('comment-submit'));

    const [sent] = connection.operationsSent;
    expect(sent.key).toMatch(/^comments\//);
    expect(sent.value).toMatchObject({
      actor: OWN_ACTOR,
      authorName: 'Ada Lovelace',
      text: 'check this coastline',
      resolved: false,
    });
    expect(box).toHaveValue('');
    expect(screen.getByText('check this coastline')).toBeInTheDocument();
  });

  it('attaches the map view when the compose button asks for it', () => {
    const connection = joinWith([]);
    setSharedCamera({ longitude: 12.5, latitude: -3.25, zoom: 8 });
    draw(<LiveCommentsPanel onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('comment-anchor-toggle'));
    fireEvent.change(screen.getByLabelText('Leave a comment'), { target: { value: 'look here' } });
    fireEvent.click(screen.getByTestId('comment-submit'));

    expect(connection.operationsSent[0].value).toMatchObject({
      anchor: { lng: 12.5, lat: -3.25, zoom: 8 },
    });
    expect(screen.getByTestId('comment-anchor-toggle')).toHaveTextContent('Attach view');
  });

  it('flies the map to an anchored comment', () => {
    joinWith([comment({ anchor: { lng: 4, lat: 5, zoom: 9 } })]);
    draw(<LiveCommentsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Fly to this spot'));
    expect(useSpaceTimeStore.getState().flyToTarget).toEqual({ lng: 4, lat: 5, zoom: 9 });
  });

  it('offers no fly to on a comment with no anchor', () => {
    joinWith([comment()]);
    draw(<LiveCommentsPanel onClose={() => {}} />);
    expect(screen.queryByLabelText('Fly to this spot')).not.toBeInTheDocument();
  });

  it('replies into the thread it was opened from', () => {
    const connection = joinWith([comment()]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Reply to Ada Lovelace'), {
      target: { value: 'checked, it is' },
    });
    fireEvent.click(screen.getByTestId('comment-reply-submit'));

    expect(connection.operationsSent[0].value).toMatchObject({
      parentId: 'root-1',
      text: 'checked, it is',
    });
    expect(screen.queryByLabelText('Reply to Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText('checked, it is')).toBeInTheDocument();
  });

  it('resolves and reopens a thread from its own button', () => {
    const connection = joinWith([comment()]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('comment-resolve'));
    expect(connection.operationsSent[0]).toMatchObject({
      key: 'comments/root-1',
      value: { resolved: true },
    });

    fireEvent.click(screen.getByLabelText('Show 1 resolved'));
    fireEvent.click(screen.getByTestId('comment-resolve'));
    expect(connection.operationsSent[1]).toMatchObject({
      key: 'comments/root-1',
      value: { resolved: false },
    });
  });

  it('deletes a whole thread, replies by other people included', () => {
    const connection = joinWith([
      comment(),
      comment({
        id: 'reply-1',
        parentId: 'root-1',
        actor: 'grace',
        authorName: 'Grace Hopper',
        text: 'yes it is',
      }),
    ]);
    draw(<LiveCommentsPanel onClose={() => {}} />);

    fireEvent.click(screen.getByLabelText('Delete comment by Ada Lovelace'));
    expect(connection.batchesSent[0].ops).toEqual([
      { key: 'comments/root-1', value: null },
      { key: 'comments/reply-1', value: null },
    ]);
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
  });

  it('offers delete only on comments this actor wrote', () => {
    joinWith([comment({ actor: 'grace', authorName: 'Grace Hopper' })]);
    draw(<LiveCommentsPanel onClose={() => {}} />);
    expect(screen.queryByLabelText('Delete comment by Grace Hopper')).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-resolve')).toBeInTheDocument();
  });

  it('reads only with the view role', () => {
    const connection = joinWith([comment()], 'view');
    draw(<LiveCommentsPanel onClose={() => {}} />);

    expect(screen.getByTestId('comments-read-only')).toBeInTheDocument();
    expect(screen.queryByLabelText('Leave a comment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comment-resolve')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete comment by Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText('is this the right coastline')).toBeInTheDocument();
    expect(connection.editsSent).toHaveLength(0);
  });

  it('closes on request', () => {
    joinWith([]);
    const onClose = vi.fn();
    draw(<LiveCommentsPanel onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close comments'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('live comments toggle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    server = new FakeAgoraServer();
    server.install();
  });

  afterEach(() => {
    cleanup();
    useLiveStore.getState().disconnect();
    server.restore();
    vi.unstubAllGlobals();
  });

  it('counts the open threads and opens the panel on click', () => {
    joinWith([comment(), comment({ id: 'root-2', createdAt: 50, resolved: true })]);
    draw(<LiveComments />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByTestId('live-comments-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Comments on this live map'));
    expect(screen.getByTestId('live-comments-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Comments on this live map'));
    expect(screen.queryByTestId('live-comments-panel')).not.toBeInTheDocument();
  });
});
