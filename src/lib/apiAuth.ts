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
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}
