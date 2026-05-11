/**
 * Plugin system — register custom tools, renderers, and commands.
 *
 * Plugins are plain JS objects with a register() method that receives the API.
 * They can be loaded from URLs or registered programmatically.
 *
 * Usage:
 *   ViewTopia.registerPlugin({
 *     name: 'my-plugin',
 *     version: '1.0.0',
 *     register(api) {
 *       api.addCommand('hello', () => alert('Hello!'));
 *       api.addToolbarButton({ id: 'hello-btn', label: '👋 Hello', onClick: () => api.runCommand('hello') });
 *     }
 *   });
 */
import { getCesiumViewer } from './renderers.js';

const plugins = new Map();

const pluginAPI = {
  /** Register a viewer command */
  addCommand(name, handler) {
    import('./viewer-commands.js').then(mod => {
      if (mod.registerCommand) mod.registerCommand(name, handler);
    });
  },

  /** Run a registered command */
  runCommand(name, args) {
    import('./viewer-commands.js').then(mod => {
      if (mod.executeCommand) mod.executeCommand(name, args);
    });
  },

  /** Add a button to the toolbar */
  addToolbarButton({ id, label, title, onClick }) {
    const toolbar = document.getElementById('toolbar-actions');
    if (!toolbar) return;
    const btn = document.createElement('button');
    btn.className = 'map-action-btn';
    btn.id = id;
    btn.title = title || label;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    toolbar.appendChild(btn);
    return btn;
  },

  /** Add a panel to the viz content area */
  addPanel({ id, html }) {
    const vizContent = document.getElementById('viz-content');
    if (!vizContent) return null;
    const panel = document.createElement('div');
    panel.id = id;
    panel.innerHTML = html;
    vizContent.appendChild(panel);
    return panel;
  },

  /** Get Cesium viewer instance */
  getCesiumViewer,

  /** Get Leaflet map instance */
  getLeafletMap() {
    return import('./leaflet-view.js').then(m => m.getLeafletMap());
  },

  /** Add a layer to the layer manager */
  addLayer(opts) {
    return import('./layer-manager.js').then(m => m.addLayer(opts));
  },

  /** Show a notification */
  notify(message, duration = 3000) {
    const el = document.createElement('div');
    el.className = 'plugin-notification';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  /** Access localStorage with plugin namespace */
  storage: {
    get(pluginName, key) {
      return localStorage.getItem(`vt-plugin-${pluginName}-${key}`);
    },
    set(pluginName, key, value) {
      localStorage.setItem(`vt-plugin-${pluginName}-${key}`, value);
    },
  },
};

/**
 * Register a plugin.
 */
export function registerPlugin(plugin) {
  if (!plugin.name) throw new Error('Plugin must have a name');
  if (plugins.has(plugin.name)) {
    console.warn(`Plugin "${plugin.name}" already registered`);
    return;
  }
  plugins.set(plugin.name, plugin);
  console.log(`Plugin registered: ${plugin.name} v${plugin.version || '?'}`);

  if (typeof plugin.register === 'function') {
    try {
      plugin.register(pluginAPI);
    } catch (e) {
      console.error(`Plugin "${plugin.name}" failed to register:`, e);
    }
  }
}

/**
 * Load a plugin from a URL (ES module with default export).
 */
export async function loadPlugin(url) {
  try {
    const mod = await import(/* @vite-ignore */ url);
    const plugin = mod.default || mod;
    registerPlugin(plugin);
  } catch (e) {
    console.error(`Failed to load plugin from ${url}:`, e);
  }
}

/**
 * Get list of registered plugins.
 */
export function getPlugins() {
  return Array.from(plugins.values()).map(p => ({ name: p.name, version: p.version }));
}

/**
 * Initialize plugin system — expose global API and load configured plugins.
 */
export function initPlugins() {
  // Expose global registration API
  window.ViewTopia = window.ViewTopia || {};
  window.ViewTopia.registerPlugin = registerPlugin;
  window.ViewTopia.loadPlugin = loadPlugin;
  window.ViewTopia.getPlugins = getPlugins;
  window.ViewTopia.api = pluginAPI;

  // Load plugins from config (data attribute on body or query param)
  const pluginUrls = document.body.dataset.plugins;
  if (pluginUrls) {
    for (const url of pluginUrls.split(',').map(u => u.trim()).filter(Boolean)) {
      loadPlugin(url);
    }
  }
}
