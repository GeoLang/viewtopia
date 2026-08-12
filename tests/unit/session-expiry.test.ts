/**
 * A stored session outlives the tab. Restoring a dead token showed the user as
 * signed in and let every gated call fail with whichever service refused first,
 * so the viewer now reads `exp` and forgets the session instead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jwtClaims, jwtExpired } from '../../src/lib/jwt';

const KEY = 'viewtopia_auth';
const HOUR_SECONDS = 3600;
const USER = { email: 'a@b.c' };

const base64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A token of the shape ptolemy mints. The signature is never checked here. */
function token(claims: Record<string, unknown>): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.signature`;
}

const secondsFromNow = (offset: number) => Math.floor(Date.now() / 1000) + offset;

async function storeAfterReload() {
  vi.resetModules();
  return (await import('../../src/features/auth/store')).useAuthStore;
}

beforeEach(() => {
  localStorage.clear();
});

describe('reading a token the viewer holds', () => {
  it('calls a past exp expired and a future one live', () => {
    expect(jwtExpired(token({ sub: 'u1', exp: secondsFromNow(-HOUR_SECONDS) }))).toBe(true);
    expect(jwtExpired(token({ sub: 'u1', exp: secondsFromNow(HOUR_SECONDS) }))).toBe(false);
  });

  it('never calls an api key expired, since it is not a jwt', () => {
    expect(jwtExpired('tk_live_plain_api_key')).toBe(false);
    expect(jwtExpired('')).toBe(false);
  });

  it('leaves a token carrying no exp alone', () => {
    expect(jwtExpired(token({ sub: 'u1' }))).toBe(false);
  });

  it('reads claims out, and answers null for anything that is not a jwt', () => {
    expect(jwtClaims(token({ sub: 'u1' }))?.sub).toBe('u1');
    expect(jwtClaims('not-a-jwt')).toBeNull();
    expect(jwtClaims('a.!!!not-base64!!!.c')).toBeNull();
  });
});

describe('restoring a session on load', () => {
  it('signs the user back in while the token is live', async () => {
    const live = token({ sub: 'u1', exp: secondsFromNow(HOUR_SECONDS) });
    localStorage.setItem(KEY, JSON.stringify({ user: USER, token: live }));

    const store = await storeAfterReload();

    expect(store.getState().loggedIn).toBe(true);
    expect(store.getState().token).toBe(live);
  });

  it('stays signed out and forgets a token that expired overnight', async () => {
    const dead = token({ sub: 'u1', exp: secondsFromNow(-HOUR_SECONDS) });
    localStorage.setItem(KEY, JSON.stringify({ user: USER, token: dead }));

    const store = await storeAfterReload();

    expect(store.getState().loggedIn).toBe(false);
    expect(store.getState().token).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps an api key session, which carries no expiry', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ user: { name: 'API Key User' }, token: 'tk_live_plain_api_key' }),
    );

    const store = await storeAfterReload();

    expect(store.getState().loggedIn).toBe(true);
    expect(store.getState().token).toBe('tk_live_plain_api_key');
  });
});
