import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// the run itself is not under test here, only the session plumbing that has to
// happen before it, so keep cesium/deck.gl out of the way
vi.mock('../../src/viewer/commands', () => ({ executeViewerCommand: vi.fn() }));
vi.mock('../../src/viewer/uiSpec', () => ({ renderUISpec: vi.fn(() => Promise.resolve()) }));

import { useSSE } from '../../src/hooks/useSSE';
import { useChatStore } from '../../src/store/chat';
import { deleteBackendSession, resetBackendSessionTracking } from '../../src/lib/agentSessions';

/** Requests the mocked fetch saw, in order. */
interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let calls: Call[];
let newIds: string[];
let failNew = false;

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });

    if (url === '/agent/sessions/new') {
      if (failNew) return Promise.resolve({ ok: false, status: 503 } as Response);
      const id = newIds.shift() ?? 'sibyl-x';
      return Promise.resolve(
        new Response(JSON.stringify({ id, name: 'Session 1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.startsWith('/agent/sessions')) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    // the run: bail immediately, this test only cares what came before it
    return Promise.resolve({ ok: false, status: 500, statusText: 'err' } as Response);
  });
}

const sessionCalls = () => calls.filter((c) => c.url.startsWith('/agent/sessions'));

const send = async (prompt = 'hello') => {
  const { result } = renderHook(() => useSSE());
  await act(async () => {
    await result.current.send(prompt);
  });
};

describe('backend session attach before a run', () => {
  beforeEach(() => {
    calls = [];
    newIds = ['sibyl-1', 'sibyl-2'];
    failNew = false;
    resetBackendSessionTracking();
    useChatStore.setState({ sessions: [], activeSessionId: null });
    mockFetch();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates one backend session on the first send and keeps it for later ones', async () => {
    const id = useChatStore.getState().createSession('First');

    await send();
    expect(sessionCalls()).toEqual([{ url: '/agent/sessions/new', method: 'POST', body: null }]);
    expect(useChatStore.getState().sessions[0].backendId).toBe('sibyl-1');

    // the second send is on the same session: nothing to create, nothing to switch
    calls = [];
    await send('again');
    expect(sessionCalls()).toEqual([]);
    expect(useChatStore.getState().sessions.find((s) => s.id === id)?.backendId).toBe('sibyl-1');
  });

  it('switches only when the viewer moved to another session', async () => {
    const first = useChatStore.getState().createSession('First');
    await send();
    const second = useChatStore.getState().createSession('Second');
    await send();

    calls = [];
    useChatStore.getState().setActiveSession(first);
    await send();
    expect(sessionCalls()).toEqual([
      { url: '/agent/sessions/switch', method: 'POST', body: { session_id: 'sibyl-1' } },
    ]);

    // still on it, so the next send leaves the backend alone
    calls = [];
    await send();
    expect(sessionCalls()).toEqual([]);

    // and back the other way it switches again
    useChatStore.getState().setActiveSession(second);
    await send();
    expect(sessionCalls()).toEqual([
      { url: '/agent/sessions/switch', method: 'POST', body: { session_id: 'sibyl-2' } },
    ]);
  });

  it('attaches to a session persisted before backend ids existed', async () => {
    useChatStore.setState({
      sessions: [{ id: 'old', name: 'Old', messages: [], createdAt: 1, updatedAt: 1 }],
      activeSessionId: 'old',
    });

    await send();
    expect(sessionCalls().map((c) => c.url)).toEqual(['/agent/sessions/new']);
    expect(useChatStore.getState().sessions[0].backendId).toBe('sibyl-1');
  });

  it('still runs when the backend refuses to make a session', async () => {
    failNew = true;
    useChatStore.getState().createSession('First');

    await send();
    expect(useChatStore.getState().sessions[0].backendId).toBeUndefined();
    expect(calls.some((c) => c.url.includes('/agent/chat/agui'))).toBe(true);

    // a later send tries again rather than giving up on the session
    failNew = false;
    await send('again');
    expect(useChatStore.getState().sessions[0].backendId).toBe('sibyl-1');
  });
});

describe('deleting a backend session', () => {
  beforeEach(() => {
    calls = [];
    newIds = ['sibyl-1', 'sibyl-2'];
    failNew = false;
    resetBackendSessionTracking();
    useChatStore.setState({ sessions: [], activeSessionId: null });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves the backend off the active session, then deletes it', async () => {
    // 400 is what sibyl answers while the session is the active one
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      const firstDelete = url === '/agent/sessions/sibyl-1' && calls.length === 1;
      return Promise.resolve(new Response(null, { status: firstDelete ? 400 : 204 }));
    });

    await deleteBackendSession('sibyl-1', 'sibyl-2');

    expect(calls).toEqual([
      { url: '/agent/sessions/sibyl-1', method: 'DELETE', body: null },
      { url: '/agent/sessions/switch', method: 'POST', body: { session_id: 'sibyl-2' } },
      { url: '/agent/sessions/sibyl-1', method: 'DELETE', body: null },
    ]);
  });

  it('leaves it alone when the viewer has no other backend session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      return Promise.resolve(new Response(null, { status: 400 }));
    });

    await deleteBackendSession('sibyl-1');
    expect(calls.map((c) => c.url)).toEqual(['/agent/sessions/sibyl-1']);
  });

  it('fires the delete through the store, without blocking the viewer on it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const id = useChatStore.getState().createSession('Doomed');
    useChatStore.getState().setBackendId(id, 'sibyl-1');

    useChatStore.getState().deleteSession(id);
    expect(useChatStore.getState().sessions).toEqual([]);
  });
});
