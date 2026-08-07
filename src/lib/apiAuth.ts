// Request headers for the platform backends: JSON content type plus the
// session bearer token. That token comes from tiletopia's /api/v1/auth/login
// and validates at ptolemy too, because the services share one HS256 secret
// and the same {sub, exp, role} claims.
//
// Reads stay anonymous, so a missing token is not an error here; the write
// endpoints answer 401 and the caller surfaces that.

import { getAuthToken } from '../features/auth/store';

export function apiHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(authHeaders())) headers.set(name, value);
  return headers;
}

/**
 * The bearer on its own, for clients that build their own request headers. The
 * AG-UI HttpAgent takes a plain record and sets its own content type, so it
 * cannot use `apiHeaders`.
 */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * A browser cannot set Authorization on a WebSocket, so the platform sockets
 * take the bearer as the second offered subprotocol behind this marker:
 * `new WebSocket(url, [BEARER_SUBPROTOCOL, jwt])`. The 101 echoes only the
 * marker, never the token.
 */
export const BEARER_SUBPROTOCOL = 'bearer';
