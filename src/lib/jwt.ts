// Reading a platform JWT's own claims: who the viewer is signed in as, and
// whether the session is still live. Nothing here verifies the signature. The
// services do that, and a browser holds no secret it could check with, so this
// only ever decides what to show, never what to allow.

export function jwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Whether a token says it has already expired. An API key is not a JWT and never has. */
export function jwtExpired(token: string): boolean {
  const exp = jwtClaims(token)?.exp;
  return typeof exp === 'number' && exp * 1000 <= Date.now();
}
