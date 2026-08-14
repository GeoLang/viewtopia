/**
 * Turns verified bundle bytes into a registered plugin.
 *
 * A downloaded bundle must render with the host's React: a second copy of React
 * in the page breaks hooks. The bundle therefore imports nothing itself and
 * reads React, the jsx runtime and the SDK off the host global set up here.
 */

import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as sdk from '../sdk';
import { registerRuntimePlugin } from '../registry';
import type { PluginDefinition } from '../sdk';

export interface PluginHostGlobal {
  react: typeof React;
  jsxRuntime: typeof jsxRuntime;
  sdk: typeof sdk;
}

declare global {
  interface Window {
    __viewtopiaPluginHost?: PluginHostGlobal;
  }
}

function installHostGlobal(): void {
  if (!window.__viewtopiaPluginHost) {
    window.__viewtopiaPluginHost = { react: React, jsxRuntime, sdk };
  }
}

/**
 * Import already-verified bytes and register what they export. `expectedId`
 * is the id the bundle was installed under: a bundle that names a different
 * one is refused rather than quietly taking over another plugin's panel.
 */
export async function loadPluginBundle(
  expectedId: string,
  code: Uint8Array,
): Promise<PluginDefinition> {
  installHostGlobal();
  // copy so the blob sees a plain ArrayBuffer, a shared one is not a BlobPart
  const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(code)], { type: 'text/javascript' }));
  let module: { default?: PluginDefinition };
  try {
    module = (await import(/* @vite-ignore */ objectUrl)) as { default?: PluginDefinition };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const plugin = module?.default;
  if (!plugin?.id || !plugin.Panel) {
    throw new Error('bundle has no default export with an id and a Panel');
  }
  if (plugin.id !== expectedId) {
    throw new Error(`bundle declares id "${plugin.id}" but was installed as "${expectedId}"`);
  }
  registerRuntimePlugin(plugin);
  return plugin;
}
