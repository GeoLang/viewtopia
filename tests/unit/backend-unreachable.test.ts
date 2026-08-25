import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BACKENDS, isUnreachableStatus, unreachableMessage } from '../../src/offline/backends';
import { useAuthStore } from '../../src/features/auth/store';
import { PtolemyRequestError, listWorkspaces } from '../../src/projects/api';
import { listTilesets, uploadTileset } from '../../src/features/tilesets/api';
import { AgoraRequestError, agoraErrorText, listLiveDocuments } from '../../src/live/api';
import { useSSE } from '../../src/hooks/useSSE';
import { useChatStore } from '../../src/store/chat';

// the run's viewer side is not what these tests are about
vi.mock('../../src/viewer/commands', () => ({ executeViewerCommand: vi.fn() }));
vi.mock('../../src/viewer/uiSpec', () => ({ renderUISpec: vi.fn(() => Promise.resolve()) }));

const GATEWAY_DOWN = 503;

describe('backend reachability helper', () => {
  it('counts a missing reply and the gateway refusals as unreachable', () => {
    for (const status of [0, 502, 503, 504]) {
      expect(isUnreachableStatus(status)).toBe(true);
    }
  });

  it('leaves every other status to the caller', () => {
    for (const status of [200, 400, 401, 403, 404, 409, 500]) {
      expect(isUnreachableStatus(status)).toBe(false);
    }
  });

  it('names the service, and the status when there was one', () => {
    expect(unreachableMessage('ptolemy', 0)).toBe('ptolemy (data) is unreachable');
    expect(unreachableMessage('tiletopia', GATEWAY_DOWN)).toBe(
      'tiletopia (tiles) is unreachable (503)',
    );
    expect(unreachableMessage('agora', 504)).toBe('agora (live) is unreachable (504)');
    expect(unreachableMessage('geolang', 502)).toBe('geolang (agent) is unreachable (502)');
  });

  it('gives every service a label and a health path', () => {
    for (const backend of Object.values(BACKENDS)) {
      expect(backend.label).not.toBe('');
      expect(backend.healthPath.startsWith('/')).toBe(true);
    }
  });
});

describe('ptolemy client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ loggedIn: true, user: null, token: 'jwt-abc', error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
  });

  it('names ptolemy when the request never got a reply', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const failure = await listWorkspaces().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PtolemyRequestError);
    expect((failure as PtolemyRequestError).status).toBe(0);
    expect((failure as Error).message).toBe('ptolemy (data) is unreachable');
  });

  it('names ptolemy when the gateway has nothing to route to', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: GATEWAY_DOWN }));
    const failure = await listWorkspaces().catch((error: unknown) => error);
    expect((failure as Error).message).toBe('ptolemy (data) is unreachable (503)');
  });

  it('keeps the server text for a status that is not a reachability failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no such workspace', { status: 404 }));
    const failure = await listWorkspaces().catch((error: unknown) => error);
    expect((failure as Error).message).toContain('no such workspace');
  });
});

/** Enough XMLHttpRequest for uploadTileset: one scripted reply, or a failure. */
class FakeUpload {
  static reply: { status: number; text: string } | 'network-error' = { status: 202, text: '' };
  status = 0;
  responseText = '';
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  send() {
    if (FakeUpload.reply === 'network-error') {
      this.onerror?.();
      return;
    }
    this.status = FakeUpload.reply.status;
    this.responseText = FakeUpload.reply.text;
    this.onload?.();
  }
}

describe('tiletopia client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', FakeUpload);
    useAuthStore.setState({ loggedIn: true, user: null, token: 'jwt-abc', error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
  });

  it('names tiletopia when the gateway has nothing to route to', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: GATEWAY_DOWN }));
    await expect(listTilesets()).rejects.toThrow('tiletopia (tiles) is unreachable (503)');
  });

  it('keeps the server text for a refusal', async () => {
    fetchMock.mockResolvedValueOnce(new Response('you may not list these', { status: 403 }));
    await expect(listTilesets()).rejects.toThrow('you may not list these');
  });

  it('names tiletopia when the upload never reached the server', async () => {
    FakeUpload.reply = 'network-error';
    const upload = uploadTileset(new File(['{}'], 'a.geojson'), () => {});
    await expect(upload).rejects.toThrow('tiletopia (tiles) is unreachable');
  });

  it('names tiletopia when the upload is answered by an empty gateway', async () => {
    FakeUpload.reply = { status: GATEWAY_DOWN, text: 'bad gateway' };
    const upload = uploadTileset(new File(['{}'], 'a.geojson'), () => {});
    await expect(upload).rejects.toThrow('tiletopia (tiles) is unreachable (503)');
  });
});

describe('agora client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ loggedIn: true, user: null, token: 'jwt-abc', error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
  });

  it('names agora when the request never got a reply', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const failure = await listLiveDocuments().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AgoraRequestError);
    expect((failure as AgoraRequestError).status).toBe(0);
    expect((failure as Error).message).toBe('agora (live) is unreachable');
    expect(agoraErrorText(failure, 'could not list sessions')).toBe('agora (live) is unreachable');
  });

  it('names agora when the gateway has nothing to route to', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: GATEWAY_DOWN }));
    const failure = await listLiveDocuments().catch((error: unknown) => error);
    expect((failure as Error).message).toBe('agora (live) is unreachable (503)');
    expect(agoraErrorText(failure, 'could not list sessions')).toBe(
      'agora (live) is unreachable (503)',
    );
  });

  it("keeps agora's own wording for a refusal", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'you are not a member' }), { status: 403 }),
    );
    const failure = await listLiveDocuments().catch((error: unknown) => error);
    expect(agoraErrorText(failure, 'could not list sessions')).toBe(
      'could not list sessions: you are not a member',
    );
  });
});

describe('geolang chat run', () => {
  beforeEach(() => {
    useChatStore.setState({ sessions: [], activeSessionId: null });
    useChatStore.getState().createSession('reachability');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** What the run left on the assistant message it was streaming into. */
  async function runError(answer: () => Promise<Response>): Promise<string | undefined> {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer);
    const { result } = renderHook(() => useSSE());
    await act(async () => {
      await result.current.send('where am I');
    });
    const messages = useChatStore.getState().activeSession()?.messages ?? [];
    return messages[messages.length - 1]?.error;
  }

  it('names geolang when the run never got a reply', async () => {
    const error = await runError(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(error).toBe('geolang (agent) is unreachable');
  });

  it('names geolang when the gateway has nothing to route to', async () => {
    const error = await runError(async () => new Response('bad gateway', { status: GATEWAY_DOWN }));
    expect(error).toBe('geolang (agent) is unreachable (503)');
  });

  it('keeps the agent text for a failure that is not a reachability one', async () => {
    const error = await runError(async () => new Response('model refused', { status: 400 }));
    expect(error).toContain('model refused');
  });
});
