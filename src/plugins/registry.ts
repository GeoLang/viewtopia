/**
 * Plugin Registry — auto-discovers and loads all plugins from src/plugins/
 *
 * Uses Vite's import.meta.glob to find all plugin index files at build time.
 * No manual registration needed — just drop a folder with an index.tsx.
 *
 * Plugins installed at runtime join the same map through registerRuntimePlugin,
 * and may never take over an id that ships with the build.
 */

import { useSyncExternalStore } from 'react';
import type { PluginDefinition } from './sdk';

// Auto-import all plugin index files (eager for fast startup)
const pluginModules = import.meta.glob<{ default: PluginDefinition }>(
  './**/index.{ts,tsx}',
  { eager: true }
);

/** All registered plugins, keyed by plugin ID */
export const pluginRegistry: Map<string, PluginDefinition> = new Map();

// Register each discovered plugin
for (const [path, module] of Object.entries(pluginModules)) {
  // Skip the sdk.ts and registry.ts files
  if (path.includes('/sdk') || path.includes('/registry')) continue;

  const plugin = module.default;
  if (plugin && plugin.id && plugin.Panel) {
    pluginRegistry.set(plugin.id, plugin);
  } else {
    console.warn(`[plugins] Invalid plugin at ${path}: missing id or Panel export`);
  }
}

/** ids that came with this build, fixed before any runtime plugin can load */
const builtInPluginIds = new Set(pluginRegistry.keys());

declare global {
  interface Window {
    // exposed for e2e/debug: import.meta.glob resolves at build time, so tests
    // can only enumerate the plugins from a loaded app
    __viewtopiaPlugins?: { id: string; name: string }[];
  }
}

let registryVersion = 0;
const registryListeners = new Set<() => void>();

function publishRegistryChange(): void {
  registryVersion += 1;
  window.__viewtopiaPlugins = Array.from(pluginRegistry.values(), (p) => ({
    id: p.id,
    name: p.name,
  }));
  for (const listener of registryListeners) listener();
}

publishRegistryChange();

export function isBuiltInPlugin(id: string): boolean {
  return builtInPluginIds.has(id);
}

/**
 * Add a plugin loaded from an installed bundle. Throws when the definition is
 * not usable or when it claims an id the build already owns, which would let a
 * downloaded bundle stand in for a built-in tool.
 */
export function registerRuntimePlugin(plugin: PluginDefinition): void {
  if (!plugin?.id || !plugin.Panel) {
    throw new Error('plugin bundle has no default export with an id and a Panel');
  }
  if (builtInPluginIds.has(plugin.id)) {
    throw new Error(`"${plugin.id}" is the id of a built-in plugin`);
  }
  pluginRegistry.set(plugin.id, plugin);
  publishRegistryChange();
}

/** Drop a runtime plugin. Built-ins are never removable. */
export function unregisterRuntimePlugin(id: string): boolean {
  if (builtInPluginIds.has(id)) return false;
  if (!pluginRegistry.delete(id)) return false;
  publishRegistryChange();
  return true;
}

export function subscribeToPluginRegistry(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

/** Re-renders the caller when a runtime plugin is registered or removed. */
export function usePluginRegistryVersion(): number {
  return useSyncExternalStore(
    subscribeToPluginRegistry,
    () => registryVersion,
    () => registryVersion,
  );
}

/** Get all plugins as an array, optionally filtered by category */
export function getPlugins(category?: string): PluginDefinition[] {
  const all = Array.from(pluginRegistry.values());
  if (!category) return all;
  return all.filter((p) => (p.category || 'plugins') === category);
}

/** Get a single plugin by ID */
export function getPlugin(id: string): PluginDefinition | undefined {
  return pluginRegistry.get(id);
}
