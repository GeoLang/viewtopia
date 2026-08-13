/**
 * SRI-style integrity checking for downloaded plugin bundles.
 *
 * Only sha256 is accepted, in the `sha256-<standard base64>` form the
 * HTML integrity attribute uses.
 */

/** a sha-256 digest is 32 bytes, which is always 43 base64 chars plus one pad */
const SHA256_INTEGRITY_PATTERN = /^sha256-[A-Za-z0-9+/]{43}=$/;

export function isValidIntegrity(value: unknown): value is string {
  return typeof value === 'string' && SHA256_INTEGRITY_PATTERN.test(value);
}

/** Digest the exact bytes and return them in `sha256-<base64>` form. */
export async function computeIntegrity(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto is unavailable, so plugin bundles cannot be verified. Serve ViewTopia over https or from localhost.',
    );
  }
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await subtle.digest('SHA-256', source));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

/**
 * True only when `expected` is a well formed sha256 integrity value AND the
 * bytes hash to it. Anything else, including a missing or malformed value,
 * is a refusal.
 */
export async function verifyIntegrity(bytes: Uint8Array, expected: unknown): Promise<boolean> {
  if (!isValidIntegrity(expected)) return false;
  return (await computeIntegrity(bytes)) === expected;
}
