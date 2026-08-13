import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  fetchRegistry,
  parseRegistryDocument,
  resolvePluginUrl,
  resolveRegistryUrl,
} from '../../src/plugins/runtime/registrySource';

const INTEGRITY = `sha256-${createHash('sha256').update('x').digest('base64')}`;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo-plugin',
    name: 'Demo Plugin',
    version: '1.0.0',
    description: 'A demo',
    author: 'Someone',
    url: 'https://plugins.example.com/demo.js',
    integrity: INTEGRITY,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('plugin URL scheme validation', () => {
  it('accepts https', () => {
    expect(resolvePluginUrl('https://plugins.example.com/registry.json')).toBe(
      'https://plugins.example.com/registry.json',
    );
  });

  it('accepts http only on development hosts', () => {
    expect(resolvePluginUrl('http://localhost:5173/registry.json')).toBeTruthy();
    expect(resolvePluginUrl('http://127.0.0.1:5173/registry.json')).toBeTruthy();
    expect(resolvePluginUrl('http://plugins.example.com/registry.json')).toBeNull();
    expect(resolvePluginUrl('http://localhost.evil.example/registry.json')).toBeNull();
  });

  it('refuses schemes that could smuggle code past the fetch', () => {
    const refused = [
      'javascript:alert(1)',
      'data:text/javascript,alert(1)',
      'blob:https://plugins.example.com/abc',
      'file:///etc/passwd',
      'ftp://plugins.example.com/demo.js',
      '',
      '   ',
      undefined,
      null,
      42,
    ];
    for (const value of refused) expect(resolvePluginUrl(value)).toBeNull();
  });

  it('resolves a relative registry against the page origin', () => {
    // jsdom serves the tests over http://localhost, a development host
    expect(resolvePluginUrl('/plugins/registry.json')).toBe(
      new URL('/plugins/registry.json', location.href).href,
    );
  });
});

describe('registry URL resolution', () => {
  it('prefers the user setting over the build value', () => {
    vi.stubEnv('VITE_PLUGIN_REGISTRY_URL', 'https://build.example.com/registry.json');
    expect(resolveRegistryUrl('https://user.example.com/registry.json')).toBe(
      'https://user.example.com/registry.json',
    );
  });

  it('falls back to the build value when the setting is empty', () => {
    vi.stubEnv('VITE_PLUGIN_REGISTRY_URL', 'https://build.example.com/registry.json');
    expect(resolveRegistryUrl('')).toBe('https://build.example.com/registry.json');
  });

  it('is null when neither is set, so the UI can say no registry is configured', () => {
    vi.stubEnv('VITE_PLUGIN_REGISTRY_URL', '');
    expect(resolveRegistryUrl(undefined)).toBeNull();
  });

  it('is null when the configured value is not an allowed scheme', () => {
    vi.stubEnv('VITE_PLUGIN_REGISTRY_URL', 'http://plugins.example.com/registry.json');
    expect(resolveRegistryUrl('')).toBeNull();
  });
});

describe('registry document validation', () => {
  it('accepts a well formed document', () => {
    const parsed = parseRegistryDocument({ plugins: [entry()] });
    expect(parsed).toEqual([
      {
        id: 'demo-plugin',
        name: 'Demo Plugin',
        version: '1.0.0',
        description: 'A demo',
        author: 'Someone',
        url: 'https://plugins.example.com/demo.js',
        integrity: INTEGRITY,
      },
    ]);
  });

  it('rejects a document that is not the expected shape', () => {
    const malformed = [null, 'nope', 42, [], {}, { plugins: {} }, { plugins: 'demo' }];
    for (const document of malformed) {
      expect(() => parseRegistryDocument(document)).toThrow();
    }
  });

  it('rejects an entry with no integrity value', () => {
    expect(() => parseRegistryDocument({ plugins: [entry({ integrity: undefined })] })).toThrow(
      /integrity/,
    );
  });

  it('rejects an entry whose bundle URL is not https', () => {
    expect(() =>
      parseRegistryDocument({ plugins: [entry({ url: 'http://plugins.example.com/demo.js' })] }),
    ).toThrow(/https/);
    expect(() =>
      parseRegistryDocument({ plugins: [entry({ url: 'data:text/javascript,alert(1)' })] }),
    ).toThrow(/https/);
  });

  it('rejects ids that are not plain kebab-case', () => {
    for (const id of ['../escape', 'Has Spaces', 'UPPER', '', '-leading']) {
      expect(() => parseRegistryDocument({ plugins: [entry({ id })] })).toThrow();
    }
  });

  it('rejects duplicate ids', () => {
    expect(() => parseRegistryDocument({ plugins: [entry(), entry()] })).toThrow(/twice/);
  });
});

describe('fetchRegistry', () => {
  it('rejects a malformed response without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ plugins: 'nope' }) })),
    );
    await expect(fetchRegistry('https://plugins.example.com/registry.json')).rejects.toThrow(
      /plugins/,
    );
  });

  it('rejects a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(fetchRegistry('https://plugins.example.com/registry.json')).rejects.toThrow(/404/);
  });

  it('never fetches a registry URL with a refused scheme', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRegistry('data:application/json,{}')).rejects.toThrow(/https/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
