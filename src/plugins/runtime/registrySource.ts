/**
 * The plugin registry document: where it comes from and what counts as a valid
 * one. Installs only ever pull from this list, never from a user typed URL.
 */

import { isValidIntegrity } from './integrity';

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** URL of the ESM bundle */
  url: string;
  /** mandatory `sha256-<base64>` over the bundle bytes */
  integrity: string;
}

/** a bad or hostile document should not be able to make the UI enumerate forever */
const MAX_REGISTRY_ENTRIES = 500;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Resolve a registry or bundle URL and refuse anything that is not https, or
 * http on a development host. Relative values resolve against the page, which
 * is how a self-hoster points at a registry on their own origin.
 */
export function resolvePluginUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const base = typeof location !== 'undefined' ? location.href : undefined;
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url.href;
  if (url.protocol === 'http:' && DEVELOPMENT_HOSTS.has(url.hostname)) return url.href;
  return null;
}

/**
 * The registry the user setting names, else the one this build was configured
 * with. Null when neither is set or the value is not an allowed URL.
 */
export function resolveRegistryUrl(settingValue: string | undefined): string | null {
  const configured = import.meta.env.VITE_PLUGIN_REGISTRY_URL;
  return resolvePluginUrl(settingValue) ?? resolvePluginUrl(configured);
}

function requireString(value: unknown, field: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`registry entry is missing "${field}"`);
  }
  const trimmed = value.trim();
  if (pattern && !pattern.test(trimmed)) {
    throw new Error(`registry entry has an invalid "${field}"`);
  }
  return trimmed;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`registry entry has a non-string "${field}"`);
  return value.trim() || undefined;
}

/**
 * Validate a parsed registry document. Throws on anything malformed rather
 * than dropping bad entries, so a half-broken registry is visibly broken.
 */
export function parseRegistryDocument(raw: unknown): RegistryEntry[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('registry document is not an object');
  }
  const { plugins } = raw as { plugins?: unknown };
  if (!Array.isArray(plugins)) throw new Error('registry document has no "plugins" array');
  if (plugins.length > MAX_REGISTRY_ENTRIES) {
    throw new Error(`registry document lists more than ${MAX_REGISTRY_ENTRIES} plugins`);
  }

  const seen = new Set<string>();
  return plugins.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('registry entry is not an object');
    }
    const entry = item as Record<string, unknown>;
    const id = requireString(entry.id, 'id', PLUGIN_ID_PATTERN);
    if (seen.has(id)) throw new Error(`registry lists "${id}" twice`);
    seen.add(id);

    const url = resolvePluginUrl(entry.url);
    if (!url) throw new Error(`plugin "${id}" has a url that is not https (or http on localhost)`);
    if (!isValidIntegrity(entry.integrity)) {
      throw new Error(`plugin "${id}" has no valid sha256 integrity value`);
    }

    return {
      id,
      name: requireString(entry.name, 'name'),
      version: requireString(entry.version, 'version', VERSION_PATTERN),
      description: optionalString(entry.description, 'description'),
      author: optionalString(entry.author, 'author'),
      url,
      integrity: entry.integrity,
    };
  });
}

export async function fetchRegistry(url: string): Promise<RegistryEntry[]> {
  const resolved = resolvePluginUrl(url);
  if (!resolved) throw new Error('registry URL must be https, or http on localhost');
  const response = await fetch(resolved, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error(`registry request failed with ${response.status}`);
  return parseRegistryDocument(await response.json());
}
