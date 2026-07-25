// Mint a platform JWT for scripts and E2E runs.
//
// The stack signs one HS256 secret across ptolemy, tiletopia and collecta
// (PLATFORM_JWT_SECRET, generated into .env.platform by scripts/platform-up.sh).
// Claims are {sub, exp, role}, the shape all three services decode.
//
// Returns null when no secret is configured, so callers degrade to
// unauthenticated requests against a stack running with *_AUTH_DISABLED.

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(REPO, '.env.platform');
const VAR = 'PLATFORM_JWT_SECRET';

let cached;

/** The shared platform secret, or null if the stack is running without auth. */
export function platformSecret() {
  if (cached !== undefined) return cached;
  cached = process.env[VAR] || readFromEnvFile() || null;
  return cached;
}

function readFromEnvFile() {
  let text;
  try {
    text = readFileSync(ENV_FILE, 'utf8');
  } catch {
    return null; // no .env.platform: stack was not brought up by platform-up.sh
  }
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?PLATFORM_JWT_SECRET\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/** HS256 JWT with the platform claims, or null when there is no secret. */
export function mintToken({ role = 'editor', sub = 'platform-scripts', ttlSec = 3600 } = {}) {
  const secret = platformSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const signing = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ sub, exp, role }),
  )}`;
  const sig = createHmac('sha256', secret).update(signing).digest('base64url');
  return `${signing}.${sig}`;
}

/** `{ Authorization: 'Bearer …' }`, or `{}` when the stack has auth off. */
export function platformAuthHeaders(opts) {
  const token = mintToken(opts);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
