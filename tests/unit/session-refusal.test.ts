/**
 * A session that dies while the tab is open. The viewer signs the user out and
 * says so once, rather than letting whichever service refuses first surface its
 * own wording as a broken feature.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAuthToken, useAuthStore } from '../../src/features/auth/store';
import { listLiveDocuments, markNotificationsRead } from '../../src/live/api';

const notify = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show: notify } }));

const KEY = 'viewtopia_auth';
const HOUR_SECONDS = 3600;
const API_KEY = 'tk_live_plain_api_key';
const USER = { email: 'a@b.c' };

const base64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A token of the shape ptolemy mints. The signature is never checked here. */
function token(claims: Record<string, unknown>): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.signature`;
}

const secondsFromNow = (offset: number) => Math.floor(Date.now() / 1000) + offset;
const liveToken = () => token({ sub: 'u1', exp: secondsFromNow(HOUR_SECONDS) });
const deadToken = () => token({ sub: 'u1', exp: secondsFromNow(-HOUR_SECONDS) });

function signIn(held: string): void {
  localStorage.setItem(KEY, JSON.stringify({ user: USER, token: held }));
  useAuthStore.setState({ loggedIn: true, user: USER, token: held, error: null });
}

function refuseWith(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'invalid or expired token' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  notify.mockClear();
  useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a service refuses a call the viewer signed', () => {
  it('signs the user out and says so once, however many calls were refused', async () => {
    signIn(liveToken());
    refuseWith(401);

    await Promise.allSettled([listLiveDocuments(), markNotificationsRead(), listLiveDocuments()]);

    expect(useAuthStore.getState().loggedIn).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ title: 'Session expired' });
  });

  it('leaves an api key session alone, since a refused key is a different failure', async () => {
    signIn(API_KEY);
    refuseWith(401);

    await Promise.allSettled([listLiveDocuments()]);

    expect(useAuthStore.getState().loggedIn).toBe(true);
    expect(useAuthStore.getState().token).toBe(API_KEY);
    expect(notify).not.toHaveBeenCalled();
  });

  it('has nothing to end when the call went out anonymous', async () => {
    refuseWith(401);

    await Promise.allSettled([listLiveDocuments()]);

    expect(useAuthStore.getState().loggedIn).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps the session through a refusal that is not about the credential', async () => {
    const held = liveToken();
    signIn(held);
    refuseWith(403);

    await Promise.allSettled([listLiveDocuments()]);

    expect(useAuthStore.getState().token).toBe(held);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not leak the token into the refusal it reports', async () => {
    const held = liveToken();
    signIn(held);
    refuseWith(401);

    const failure = await listLiveDocuments().catch((e: Error) => e);

    expect((failure as Error).message).not.toContain(held);
  });
});

describe('reading the token for a request', () => {
  it('ends a session that expired while the tab was open, and never sends it', () => {
    signIn(deadToken());

    expect(getAuthToken()).toBeNull();
    expect(useAuthStore.getState().loggedIn).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('says so once however many requests read the token', () => {
    signIn(deadToken());

    getAuthToken();
    getAuthToken();

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('hands out a live session token and an api key untouched', () => {
    const held = liveToken();
    signIn(held);
    expect(getAuthToken()).toBe(held);

    signIn(API_KEY);
    expect(getAuthToken()).toBe(API_KEY);

    expect(notify).not.toHaveBeenCalled();
  });
});
