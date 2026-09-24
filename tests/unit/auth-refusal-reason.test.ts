import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';

const FULL_REASON = 'signups are closed: this server is full at 500 accounts';
const LOCKED_REASON = 'too many failed logins, try again in 15 minutes';

function refuseWith(status: number, reason: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: reason }), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ error: null });
});

describe('auth refusals', () => {
  it('shows the reason tiletopia gives for a refused signup', async () => {
    refuseWith(403, FULL_REASON);
    const signedUp = await useAuthStore.getState().register('Ada', 'ada@example.com', 'secret-pass');
    expect(signedUp).toBe(false);
    expect(useAuthStore.getState().error).toBe(FULL_REASON);
  });

  it('shows the reason tiletopia gives for a locked login', async () => {
    refuseWith(429, LOCKED_REASON);
    const loggedIn = await useAuthStore.getState().login('ada@example.com', 'secret-pass');
    expect(loggedIn).toBe(false);
    expect(useAuthStore.getState().error).toBe(LOCKED_REASON);
  });
});
