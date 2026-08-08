import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useAuthStore } from '../../src/features/auth/store';
import type { LiveNotification } from '../../src/live/api';
import { useLiveStore } from '../../src/live/liveStore';
import { NotificationsBell } from '../../src/live/NotificationsBell';
import { FakeAgoraServer } from './stubs/fakeAgoraServer';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notification(overrides: Partial<LiveNotification> = {}): LiveNotification {
  return {
    id: 'n1',
    docId: 'doc-9',
    docName: 'Coastline',
    commentId: 'c1',
    authorName: 'Ada',
    excerpt: 'check @you this bay',
    createdAt: '2026-08-08T10:00:00Z',
    readAt: null,
    ...overrides,
  };
}

let server: FakeAgoraServer;
let fetchMock: ReturnType<typeof vi.fn>;

describe('notifications bell', () => {
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
    fetchMock = vi.fn(async (url: string) =>
      url === '/agora/notifications'
        ? jsonResponse([notification(), notification({ id: 'n2', readAt: '2026-08-08T09:00:00Z' })])
        : new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ token: 'jwt-token' });
  });

  afterEach(() => {
    cleanup();
    useLiveStore.getState().disconnect();
    server.restore();
    useAuthStore.setState({ token: null });
    vi.unstubAllGlobals();
  });

  function draw() {
    return render(
      <MantineProvider>
        <NotificationsBell />
      </MantineProvider>,
    );
  }

  it('renders nothing and asks for nothing when signed out', () => {
    useAuthStore.setState({ token: null });
    draw();
    expect(screen.queryByTestId('notifications-bell')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('badges the unread count from the poll', async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('opens the document and marks the entry read when clicked', async () => {
    draw();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('notifications-bell'));
    const entries = await screen.findAllByTestId('notification-entry');
    expect(entries).toHaveLength(2);

    fireEvent.click(entries[0]);
    expect(useLiveStore.getState().documentId).toBe('doc-9');
    expect(useLiveStore.getState().commentsOpen).toBe(true);
    const readCall = fetchMock.mock.calls.find(([url]) => url === '/agora/notifications/read');
    expect(readCall).toBeDefined();
    expect((readCall as [string, RequestInit])[1].body).toBe(JSON.stringify({ ids: ['n1'] }));
  });

  it('marks everything read at once', async () => {
    draw();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('notifications-bell'));
    fireEvent.click(await screen.findByText('Mark all read'));

    const readCall = fetchMock.mock.calls.find(([url]) => url === '/agora/notifications/read');
    expect((readCall as [string, RequestInit])[1].body).toBe(JSON.stringify({}));
    await waitFor(() => expect(screen.queryByText('Mark all read')).not.toBeInTheDocument());
  });
});
