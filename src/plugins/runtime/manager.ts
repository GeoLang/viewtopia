/**
 * Install, update, remove and boot-load runtime plugins.
 *
 * Bundle bytes are hashed against the registry's integrity value before they
 * are stored, and against the stored value again before every load, so an
 * edited IndexedDB record never reaches the module loader.
 */

import { useSyncExternalStore } from 'react';
import { isBuiltInPlugin, unregisterRuntimePlugin } from '../registry';
import { verifyIntegrity } from './integrity';
import { loadPluginBundle } from './loader';
import { resolvePluginUrl, type RegistryEntry } from './registrySource';
import {
  deleteInstalledPlugin,
  listInstalledPlugins,
  putInstalledPlugin,
  type InstalledPlugin,
} from './storage';

const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

const loadErrors = new Map<string, string>();
const runtimeListeners = new Set<() => void>();
let runtimeVersion = 0;

function publishRuntimeChange(): void {
  runtimeVersion += 1;
  for (const listener of runtimeListeners) listener();
}

function subscribeToPluginRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

/** Re-renders the caller when an install, removal or load failure happens. */
export function usePluginRuntimeVersion(): number {
  return useSyncExternalStore(
    subscribeToPluginRuntime,
    () => runtimeVersion,
    () => runtimeVersion,
  );
}

/** Why each disabled plugin did not load, keyed by plugin id. */
export function getPluginLoadErrors(): ReadonlyMap<string, string> {
  return loadErrors;
}

function setLoadError(id: string, error: unknown): void {
  loadErrors.set(id, error instanceof Error ? error.message : String(error));
  publishRuntimeChange();
}

function clearLoadError(id: string): void {
  if (loadErrors.delete(id)) publishRuntimeChange();
}

function asBundleBytes(code: unknown): Uint8Array {
  if (code instanceof Uint8Array) return code;
  if (code instanceof ArrayBuffer) return new Uint8Array(code);
  throw new Error('stored plugin record holds no bundle bytes');
}

async function fetchVerifiedBundle(url: string, integrity: string): Promise<Uint8Array> {
  const resolved = resolvePluginUrl(url);
  if (!resolved) throw new Error('plugin bundle URL must be https, or http on localhost');

  const response = await fetch(resolved, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error(`bundle request failed with ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error('plugin bundle is larger than the 8 MB limit');
  }
  if (!(await verifyIntegrity(bytes, integrity))) {
    throw new Error('bundle does not match the integrity value the registry lists');
  }
  return bytes;
}

/**
 * Download, verify, persist and load one registry entry. Also the update path:
 * a second install of the same id replaces the stored record.
 */
export async function installPlugin(entry: RegistryEntry): Promise<void> {
  if (isBuiltInPlugin(entry.id)) {
    throw new Error(`"${entry.id}" is the id of a built-in plugin`);
  }

  const code = await fetchVerifiedBundle(entry.url, entry.integrity);
  const record: InstalledPlugin = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    url: entry.url,
    integrity: entry.integrity,
    code,
    installedAt: Date.now(),
  };
  await putInstalledPlugin(record);
  clearLoadError(entry.id);

  // an update has the previous version registered; drop it so a bundle that
  // fails to import does not leave the old code answering for the new version
  unregisterRuntimePlugin(entry.id);
  try {
    await loadPluginBundle(entry.id, code);
  } catch (error) {
    setLoadError(entry.id, error);
    throw error;
  }
  publishRuntimeChange();
}

/**
 * Forget an installed plugin. Its panel disappears at once, but code it already
 * ran in this page stays until a reload.
 */
export async function removePlugin(id: string): Promise<void> {
  await deleteInstalledPlugin(id);
  unregisterRuntimePlugin(id);
  clearLoadError(id);
  publishRuntimeChange();
}

/**
 * Load every installed plugin from its stored bytes. Called once at boot, after
 * the built-in plugins have registered. One failing plugin is recorded and
 * skipped: it never retries and never stops the others or the app.
 */
export async function loadInstalledPlugins(): Promise<void> {
  let records: InstalledPlugin[];
  try {
    records = await listInstalledPlugins();
  } catch (error) {
    console.warn('[plugins] could not read installed plugins', error);
    return;
  }

  for (const record of records) {
    try {
      const code = asBundleBytes(record.code);
      if (!(await verifyIntegrity(code, record.integrity))) {
        throw new Error('stored bundle no longer matches its integrity value');
      }
      await loadPluginBundle(record.id, code);
      clearLoadError(record.id);
    } catch (error) {
      console.warn(`[plugins] "${record.id}" is disabled:`, error);
      setLoadError(record.id, error);
    }
  }
}
