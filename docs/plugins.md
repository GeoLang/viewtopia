# Viewtopia Plugin System

## Overview

Viewtopia supports third-party plugins that add custom panels to the UI. Plugins are auto-discovered at build time — just drop a folder into `src/plugins/` and it appears in the toolbar.

## Quick Start

1. Create a folder: `src/plugins/my-plugin/`
2. Create `index.tsx`:

```tsx
import { Paper, Text, Button } from '@mantine/core';
import type { PluginDefinition, PluginContext } from '../sdk';

function MyPanel({ ctx }: { ctx: PluginContext }) {
  return (
    <Paper p="md" withBorder>
      <Text>Hello from my plugin!</Text>
      <Button onClick={() => ctx.map.flyTo(-73.98, 40.75, 14)}>
        Go to NYC
      </Button>
      <Button onClick={ctx.close}>Close</Button>
    </Paper>
  );
}

const plugin: PluginDefinition = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  category: 'plugins',
  Panel: MyPanel,
};

export default plugin;
```

3. Run `pnpm run dev` — your plugin appears in the **Plugins** toolbar menu.

## Plugin Context API

Every plugin panel receives a `ctx: PluginContext` prop with three namespaces:

### `ctx.map` — Map Controls

| Method | Description |
|--------|-------------|
| `flyTo(lng, lat, zoom?)` | Fly camera to location |
| `getCursorCoords()` | Get current cursor lat/lng/elevation |
| `addGeoJsonLayer(id, geojson, options?)` | Add a GeoJSON layer |
| `removeLayer(id)` | Remove a layer |
| `fitBounds([west, south, east, north])` | Fit view to bounds |

### `ctx.store` — Application State

| Method | Description |
|--------|-------------|
| `getLayers()` | Get all map layers |
| `getActivePanel()` | Current active panel name |
| `getBasemap()` | Current basemap (osm/satellite/topo/dark) |
| `getRenderer()` | Current renderer (cesium/deckgl/maplibre) |
| `getSettings()` | All app settings |

### `ctx.api` — Backend API

| Method | Description |
|--------|-------------|
| `fetch(path, options?)` | Proxied fetch (adds base URL + headers) |
| `baseUrl` | The platform API base URL |

### `ctx.close()` — Close the plugin panel

## Plugin Definition

```typescript
interface PluginDefinition {
  id: string;           // Unique kebab-case ID
  name: string;         // Display name
  description?: string;
  version: string;      // Semver
  author?: string;
  icon?: ReactNode;     // @tabler/icons-react icon
  category?: 'analysis' | 'simulate' | 'tools' | 'data' | 'plugins';
  Panel: React.ComponentType<{ ctx: PluginContext }>;
  onLoad?: (ctx: PluginContext) => void | (() => void);
  shortcut?: string;    // e.g. "ctrl+shift+p"
}
```

## Layer Options

When adding GeoJSON layers:

```typescript
ctx.map.addGeoJsonLayer('my-layer', geojson, {
  color: '#ff6600',
  opacity: 0.8,
  lineWidth: 2,
  filled: true,
  stroked: true,
  extruded: false,
  zIndex: 10,
});
```

## Category Placement

Set `category` to control where your plugin appears:
- `'analysis'` — Analysis menu
- `'simulate'` — Simulate menu
- `'tools'` — Tools menu
- `'data'` — Data menu
- `'plugins'` (default) — Plugins menu

## Events

Plugins can listen for platform events:

```typescript
window.addEventListener('viewtopia:layer:add', (e) => {
  console.log('Layer added:', e.detail);
});
```

## Available Libraries

Plugins can import from any dependency in `package.json`:
- `@mantine/core` — UI components
- `@mantine/hooks` — Utility hooks
- `@tabler/icons-react` — Icons
- `react` / `react-dom`
- Any npm package you add to the project

## Runtime Plugins

Plugins can also be installed while the app is running, from **More → Plugin Manager**. Installs
only ever come from a registry document, never from a URL a user pastes.

### Registry document

JSON served over https (http is allowed on `localhost` and `127.0.0.1` for development):

```json
{
  "plugins": [
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "version": "1.0.0",
      "description": "What it does",
      "author": "Someone",
      "url": "https://plugins.example.com/my-plugin-1.0.0.js",
      "integrity": "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }
  ]
}
```

`id` is kebab-case and may not be the id of a plugin that ships with the build. `url` points at an
ESM bundle. `integrity` is mandatory and is the sha-256 of the bundle bytes in SRI form:

```sh
echo "sha256-$(openssl dgst -binary -sha256 my-plugin-1.0.0.js | base64)"
```

The bundle is refused unless its bytes hash to exactly that value, at install and again at every
load from local storage. Ship a new file with a new hash for each version rather than replacing a
published one.

Point the app at a registry with `VITE_PLUGIN_REGISTRY_URL` at build time, or with the Plugin
Registry URL field in the Plugin Manager. With neither set, the panel says no registry is
configured.

### Building a bundle

A runtime plugin default-exports the same `PluginDefinition` as a built-in one, but it must render
with the host's React: a second copy of React in the page breaks hooks. Externalize `react`,
`react/jsx-runtime` and the SDK, and resolve them to `window.__viewtopiaPluginHost`. Everything
else, Mantine and icons included, has to be bundled in, so a runtime plugin is best kept to plain
elements and its own styles.

```js
// vite.config.js for a plugin
const hostModules = {
  react: 'react',
  'react/jsx-runtime': 'jsxRuntime',
  '@viewtopia/plugin-sdk': 'sdk',
};

const hostGlobals = {
  name: 'viewtopia-host-globals',
  resolveId: (id) => (id in hostModules ? `\0host:${id}` : null),
  load(id) {
    if (!id.startsWith('\0host:')) return null;
    const key = hostModules[id.slice('\0host:'.length)];
    return `const m = window.__viewtopiaPluginHost.${key};
export default m;
export const { ${key === 'jsxRuntime' ? 'jsx, jsxs, Fragment' : 'useState, useEffect, useMemo, useRef, useCallback, createElement'} } = m;`;
  },
};

export default {
  plugins: [hostGlobals],
  build: {
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: 'my-plugin' },
    rollupOptions: { external: Object.keys(hostModules) },
  },
};
```

The `id` the bundle exports must match the `id` the registry lists, or the load is refused.

A plugin that fails to load is left disabled with the reason shown in the Plugin Manager. It is not
retried until the next reload, and it never blocks the rest of the app.

## File Structure

```
src/plugins/
├── sdk.ts                    # Type definitions (DO NOT MODIFY)
├── registry.ts               # Auto-discovery (DO NOT MODIFY)
├── PluginHost.tsx            # Panel renderer (DO NOT MODIFY)
├── example-plugin/
│   └── index.tsx             # Working example
└── your-plugin/
    ├── index.tsx             # Entry point (required)
    ├── components/           # Optional sub-components
    └── utils.ts              # Optional helpers
```
