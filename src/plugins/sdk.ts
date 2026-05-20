/**
 * Viewtopia Plugin SDK
 *
 * Third-party plugins drop a folder into `src/plugins/<plugin-name>/` containing
 * an `index.ts` (or `index.tsx`) that default-exports a PluginDefinition.
 *
 * Example:
 *   src/plugins/my-plugin/index.tsx
 *
 * The plugin system auto-discovers all plugins at build time and registers them
 * in the toolbar and panel system.
 */

import type { ReactNode } from 'react';

// ─── Plugin Context (passed to every plugin panel) ──────────────────

export interface PluginMapContext {
  /** Fly the camera to a location */
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  /** Get current cursor coordinates */
  getCursorCoords: () => { lat: number; lng: number; elevation?: number } | null;
  /** Add a GeoJSON layer to the map */
  addGeoJsonLayer: (id: string, geojson: object, options?: LayerOptions) => void;
  /** Remove a layer by ID */
  removeLayer: (id: string) => void;
  /** Fit the map view to a bounding box [west, south, east, north] */
  fitBounds: (bounds: [number, number, number, number]) => void;
}

export interface PluginStoreContext {
  /** Get all layers */
  getLayers: () => Array<{ id: string; name: string; visible: boolean; opacity: number }>;
  /** Get current active panel name */
  getActivePanel: () => string | null;
  /** Get current basemap */
  getBasemap: () => string;
  /** Get current renderer */
  getRenderer: () => string;
  /** Access settings */
  getSettings: () => Record<string, unknown>;
}

export interface PluginApiContext {
  /** Make a fetch request through the platform proxy (handles auth, base URL) */
  fetch: (path: string, options?: RequestInit) => Promise<Response>;
  /** Base URL for the platform API */
  baseUrl: string;
}

export interface PluginContext {
  map: PluginMapContext;
  store: PluginStoreContext;
  api: PluginApiContext;
  /** Close this plugin's panel */
  close: () => void;
}

// ─── Layer Options ──────────────────────────────────────────────────

export interface LayerOptions {
  color?: string;
  opacity?: number;
  lineWidth?: number;
  filled?: boolean;
  stroked?: boolean;
  extruded?: boolean;
  /** Z-index for layer ordering */
  zIndex?: number;
}

// ─── Plugin Definition ──────────────────────────────────────────────

export interface PluginDefinition {
  /** Unique plugin ID (kebab-case, e.g. "my-cool-plugin") */
  id: string;
  /** Display name shown in the toolbar */
  name: string;
  /** Short description */
  description?: string;
  /** Plugin version (semver) */
  version: string;
  /** Author name or organization */
  author?: string;
  /** Icon component (from @tabler/icons-react or custom SVG) */
  icon?: ReactNode;
  /** Which toolbar menu to add this plugin to: 'analysis' | 'simulate' | 'tools' | 'data' | 'plugins' */
  category?: 'analysis' | 'simulate' | 'tools' | 'data' | 'plugins';
  /** The panel component — receives PluginContext as props */
  Panel: React.ComponentType<{ ctx: PluginContext }>;
  /** Optional: run on plugin load (e.g. register event listeners) */
  onLoad?: (ctx: PluginContext) => void | (() => void);
  /** Optional: keyboard shortcut (e.g. "ctrl+shift+p") */
  shortcut?: string;
}
