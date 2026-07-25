import { describe, it, expect, beforeEach } from 'vitest';
import { apiHeaders } from '../../src/lib/apiAuth';
import { useAuthStore } from '../../src/features/auth/store';

describe('apiHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ loggedIn: false, user: null, token: null, error: null });
  });

  it('omits Authorization when nobody is signed in', () => {
    const headers = apiHeaders();
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('attaches the session token as a bearer', () => {
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: { email: 'a@b.c' } });
    expect(apiHeaders().get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('keeps caller headers and does not override an explicit content type', () => {
    useAuthStore.setState({ loggedIn: true, token: 'jwt-abc', user: null });
    const headers = apiHeaders({ 'Content-Type': 'text/csv', 'X-Trace': '1' });
    expect(headers.get('Content-Type')).toBe('text/csv');
    expect(headers.get('X-Trace')).toBe('1');
    expect(headers.get('Authorization')).toBe('Bearer jwt-abc');
  });
});
