import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from '../../src/lib/randomUuid';

const VERSION_4_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUuid', () => {
  it('makes a version 4 uuid on an origin without crypto.randomUUID', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', { getRandomValues });

    const first = randomUuid();
    const second = randomUuid();

    expect(first).toMatch(VERSION_4_UUID);
    expect(second).toMatch(VERSION_4_UUID);
    expect(first).not.toBe(second);
  });

  it('sets the version and variant bits over any random bytes', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });

    expect(randomUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
