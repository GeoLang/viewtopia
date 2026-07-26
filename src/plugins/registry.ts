/**
 * Plugin Registry — auto-discovers and loads all plugins from src/plugins/
 *
 * Uses Vite's import.meta.glob to find all plugin index files at build time.
 * No manual registration needed — just drop a folder with an index.tsx.
 */

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

declare global {
  interface Window {
    // exposed for e2e/debug: import.meta.glob resolves at build time, so tests
    // can only enumerate the plugins from a loaded app
    __viewtopiaPlugins?: { id: string; name: string }[];
  }
}

window.__viewtopiaPlugins = Array.from(pluginRegistry.values(), (p) => ({
  id: p.id,
  name: p.name,
}));

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
