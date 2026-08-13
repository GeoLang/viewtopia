import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { installMemoryIndexedDb } from './stubs/memoryIndexedDb';
import {
  getPluginLoadErrors,
  installPlugin,
  loadInstalledPlugins,
  removePlugin,
} from '../../src/plugins/runtime/manager';
import {
  listInstalledPlugins,
  putInstalledPlugin,
} from '../../src/plugins/runtime/storage';
import { getPlugin } from '../../src/plugins/registry';
import type { RegistryEntry } from '../../src/plugins/runtime/registrySource';

// jsdom's TextEncoder returns a Uint8Array from node's realm; re-wrap it so the
// bytes look like the ones a browser fetch would produce
const BUNDLE = new Uint8Array(
  new TextEncoder().encode('export default { id: "demo-plugin", Panel: () => null };'),
);

function integrityOf(bytes: Uint8Array): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

function registryEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'demo-plugin',
    name: 'Demo Plugin',
    version: '1.0.0',
    url: 'https://plugins.example.com/demo.js',
    integrity: integrityOf(BUNDLE),
    ...overrides,
  };
}

function stubBundleResponse(bytes: Uint8Array) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => body })),
  );
}

let resetIndexedDb: () => void;

beforeEach(() => {
  resetIndexedDb = installMemoryIndexedDb();
});

afterEach(() => {
  resetIndexedDb();
  vi.unstubAllGlobals();
});

describe('installing a plugin', () => {
  it('persists the bundle when the bytes match the registry integrity value', async () => {
    stubBundleResponse(BUNDLE);
    // the import of the blob URL cannot run under node, so the install ends in a
    // load failure; what matters here is what reached storage before that
    await expect(installPlugin(registryEntry())).rejects.toThrow();

    const installed = await listInstalledPlugins();
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({
      id: 'demo-plugin',
      version: '1.0.0',
      url: 'https://plugins.example.com/demo.js',
      integrity: integrityOf(BUNDLE),
    });
    expect(new Uint8Array(installed[0].code)).toEqual(BUNDLE);
  });

  it('refuses bytes that do not match, and stores nothing', async () => {
    const tampered = new Uint8Array(BUNDLE);
    tampered[5] ^= 0xff;
    stubBundleResponse(tampered);

    await expect(installPlugin(registryEntry())).rejects.toThrow(/integrity/);
    expect(await listInstalledPlugins()).toHaveLength(0);
  });

  it('refuses an entry without a valid integrity value', async () => {
    stubBundleResponse(BUNDLE);
    await expect(installPlugin(registryEntry({ integrity: '' }))).rejects.toThrow(/integrity/);
    expect(await listInstalledPlugins()).toHaveLength(0);
  });

  it('refuses a bundle URL that is not https', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      installPlugin(registryEntry({ url: 'http://plugins.example.com/demo.js' })),
    ).rejects.toThrow(/https/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await listInstalledPlugins()).toHaveLength(0);
  });

  it('refuses to install over a built-in plugin id', async () => {
    const builtIn = 'export-map';
    expect(getPlugin(builtIn)).toBeDefined();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(installPlugin(registryEntry({ id: builtIn }))).rejects.toThrow(/built-in/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('removing a plugin', () => {
  it('drops the record from storage', async () => {
    stubBundleResponse(BUNDLE);
    await expect(installPlugin(registryEntry())).rejects.toThrow();
    expect(await listInstalledPlugins()).toHaveLength(1);

    await removePlugin('demo-plugin');
    expect(await listInstalledPlugins()).toHaveLength(0);
  });
});

describe('loading installed plugins at boot', () => {
  it('refuses a stored bundle whose bytes were edited after install', async () => {
    const edited = new Uint8Array(BUNDLE);
    edited[1] ^= 0x20;
    await putInstalledPlugin({
      id: 'tampered-plugin',
      name: 'Tampered',
      version: '1.0.0',
      url: 'https://plugins.example.com/demo.js',
      // the integrity value of the bundle that was actually installed
      integrity: integrityOf(BUNDLE),
      code: edited,
      installedAt: Date.now(),
    });

    await loadInstalledPlugins();

    expect(getPluginLoadErrors().get('tampered-plugin')).toMatch(/integrity/);
    expect(getPlugin('tampered-plugin')).toBeUndefined();
  });

  it('gets past re-verification for untouched bytes', async () => {
    await putInstalledPlugin({
      id: 'intact-plugin',
      name: 'Intact',
      version: '1.0.0',
      url: 'https://plugins.example.com/demo.js',
      integrity: integrityOf(BUNDLE),
      code: BUNDLE,
      installedAt: Date.now(),
    });

    await loadInstalledPlugins();

    // node cannot import a blob URL, so it fails at the import instead: the
    // point is that neither storage check refused it first
    expect(getPluginLoadErrors().get('intact-plugin')).toBeDefined();
    expect(getPluginLoadErrors().get('intact-plugin')).not.toMatch(/integrity|bundle bytes/);
  });

  it('records a failure per plugin instead of throwing out of boot', async () => {
    await putInstalledPlugin({
      id: 'broken-plugin',
      name: 'Broken',
      version: '1.0.0',
      url: 'https://plugins.example.com/demo.js',
      integrity: integrityOf(BUNDLE),
      code: 'not bytes at all' as unknown as Uint8Array,
      installedAt: Date.now(),
    });

    await expect(loadInstalledPlugins()).resolves.toBeUndefined();
    expect(getPluginLoadErrors().get('broken-plugin')).toBeDefined();
  });

  it('loads nothing and does not throw where IndexedDB is unavailable', async () => {
    resetIndexedDb();
    await expect(loadInstalledPlugins()).resolves.toBeUndefined();
    resetIndexedDb = installMemoryIndexedDb();
  });
});
