import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileToAgent } from '../../src/features/dataSources/uploadToAgent';
import { useAuthStore } from '../../src/features/auth/store';
import { useChatStore } from '../../src/store/chat';

const TOKEN = 'jwt-abc';
const BACKEND_ID = 'sibyl-session-7';

function signIn() {
  useAuthStore.setState({ loggedIn: true, token: TOKEN, user: null, error: null });
}

function openSession(backendId?: string) {
  useChatStore.setState({
    sessions: [
      { id: 'local-1', name: 'Session 1', messages: [], createdAt: 0, updatedAt: 0, backendId },
    ],
    activeSessionId: 'local-1',
  });
}

function sentBody(): FormData {
  const [, init] = vi.mocked(fetch).mock.calls[0];
  return init?.body as FormData;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  useAuthStore.setState({ loggedIn: false, token: null, user: null, error: null });
  useChatStore.setState({ sessions: [], activeSessionId: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uploadFileToAgent', () => {
  it('posts the file and the backend thread id with the bearer', async () => {
    signIn();
    openSession(BACKEND_ID);
    const file = new File(['{"type":"FeatureCollection","features":[]}'], 'sites.geojson');

    await uploadFileToAgent(file);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/agent/upload');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(sentBody().get('file')).toBe(file);
    expect(sentBody().get('thread_id')).toBe(BACKEND_ID);
  });

  it('sends no thread id when the session has never reached sibyl', async () => {
    signIn();
    openSession(undefined);

    await uploadFileToAgent(new File(['a,b\n1,2\n'], 'points.csv'));

    expect(sentBody().has('thread_id')).toBe(false);
  });

  it('sends nothing without a token', async () => {
    openSession(BACKEND_ID);

    await uploadFileToAgent(new File(['{}'], 'sites.geojson'));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends nothing for a format the upload route cannot read', async () => {
    signIn();
    openSession(BACKEND_ID);

    await uploadFileToAgent(new File(['<kml/>'], 'route.kml'));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when the route answers 500', async () => {
    signIn();
    openSession(BACKEND_ID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(uploadFileToAgent(new File(['{}'], 'sites.geojson'))).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('warns instead of throwing when the request never lands', async () => {
    signIn();
    openSession(BACKEND_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(uploadFileToAgent(new File(['{}'], 'sites.geojson'))).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sites.geojson'));
  });
});
