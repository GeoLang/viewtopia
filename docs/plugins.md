# ViewTopia Plugin System

## Overview

A plugin adds a panel to ViewTopia. Built-in plugins are discovered at build
time: a folder in `src/plugins/` with an `index.tsx` that default-exports a
`PluginDefinition` appears in the toolbar. Runtime plugins are installed from a
registry while the app runs, see [Runtime Plugins](#runtime-plugins).

## Quick Start

1. Create a folder: `src/plugins/my-plugin/`
2. Create `index.tsx`:

```tsx
import { Paper, Text, Button } from '@mantine/core'
import type { PluginDefinition, PluginContext } from '../sdk'

function MyPanel({ ctx }: { ctx: PluginContext }) {
  return (
    <Paper p="md" withBorder>
      <Text>Hello from my plugin</Text>
      <Button onClick={() => ctx.map.flyTo(-73.98, 40.75, 14)}>
        Go to NYC
      </Button>
      <Button onClick={ctx.close}>Close</Button>
    </Paper>
  )
}

const plugin: PluginDefinition = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  category: 'plugins',
  Panel: MyPanel,
}

export default plugin
```

3. Run `pnpm run dev`. The plugin appears under **Plugins** in the toolbar.

## Plugin Context API

Every plugin panel receives a `ctx: PluginContext` prop with four namespaces
and `close()`.

### `ctx.map`, map controls

| Method | Description |
|--------|-------------|
| `flyTo(lng, lat, zoom?)` | Fly camera to location |
| `getCursorCoords()` | Current cursor lat, lng and elevation |
| `onMapClick(cb)` | Subscribe to map clicks in geographic coords, returns an unsubscribe |
| `addGeoJsonLayer(id, geojson, options?)` | Add a GeoJSON layer |
| `removeLayer(id)` | Remove a layer |
| `fitBounds([west, south, east, north])` | Fit view to bounds |

### `ctx.store`, application state

| Method | Description |
|--------|-------------|
| `getLayers()` | Every map layer |
| `getActivePanel()` | Id of the open panel |
| `getBasemap()` | Current basemap: `osm`, `satellite`, `topo`, `dark`, `liberty`, `bright`, `positron`, `selfhosted`, `custom` or `local` |
| `setCustomBasemap({url, attr})` | Switch the viewers to custom raster tiles |
| `getRenderer()` | Current renderer: `cesium` or `maplibre` |
| `getSettings()` | All app settings |

### `ctx.api`, backend API

| Method | Description |
|--------|-------------|
| `fetch(path, options?)` | Proxied fetch that adds the base URL and auth headers |
| `baseUrl` | The platform API base URL |

### `ctx.settings`, per-plugin persistence

| Method | Description |
|--------|-------------|
| `get(key, defaultValue?)` | Read one setting |
| `set(key, value)` | Write one setting to localStorage |
| `getAll()` | Every setting for this plugin |

### `ctx.close()`

Closes the plugin panel.

## Plugin Definition

```typescript
interface PluginDefinition {
  id: string            // unique kebab-case id
  name: string          // display name
  description?: string
  version: string       // semver
  author?: string
  icon?: ReactNode      // an @tabler/icons-react icon
  category?: 'analysis' | 'simulate' | 'tools' | 'data' | 'plugins'
  Panel: React.ComponentType<{ ctx: PluginContext }>
  settings?: PluginSettingField[]   // rendered in the Settings panel
}
```

The type also carries `onLoad` and `shortcut`. Nothing reads either one, so
setting them does nothing.

Each settings field is `{ key, label, type, defaultValue?, description?,
options?, min?, max? }`, where `type` is `text`, `number`, `boolean`, `select`
or `color` and `options` is `{ value, label }` pairs for a `select`.

`PLUGIN_SDK_VERSION`, exported from the SDK, is bumped whenever the
`PluginContext` shape changes, so a downloaded bundle can check it.

## Layer Options

When adding GeoJSON layers:

```typescript
ctx.map.addGeoJsonLayer('my-layer', geojson, {
  name: 'My Layer',   // what the layer panel and the chat call it, the id by default
  color: '#ff6600',
  opacity: 0.8,
  lineWidth: 2,
  filled: true,
  stroked: true,
  extruded: false,
  zIndex: 10,
  fit: true,          // whether adding it moves the camera, true by default
})
```

## Category Placement

The toolbar ignores `category`. Every plugin, built-in or runtime, is listed
under Plugins in the toolbar menu and in the command palette, whatever its
category says.

## Events

The app dispatches these on `window`:

| Event | `detail` |
|-------|----------|
| `viewtopia:map:click` | `{ lat, lng }` of the clicked point. `ctx.map.onMapClick` wraps this one |
| `viewtopia:sql_result` | `{ sql, rowCount, columns, sample }` after a `sql_query` run |
| `viewtopia:sql_error` | `{ sql, error }` |

## Available Libraries

A built-in plugin can import any dependency in `package.json`, among them:

- `@mantine/core` and `@mantine/hooks`
- `@tabler/icons-react`
- `react` and `react-dom`

## Runtime Plugins

Plugins can also be installed while the app is running, from **More, Plugin
Manager**. Installs only ever come from a registry document, never from a URL a
user pastes.

### Registry document

JSON served over https. http is allowed on `localhost`, `127.0.0.1` and `[::1]`
for development.

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
`react/jsx-runtime` and the SDK, and resolve them to `window.__viewtopiaPluginHost`, which holds
`react`, `jsxRuntime` and `sdk`. Everything else, Mantine and icons included, has to be bundled
in, so a runtime plugin is best kept to plain elements and its own styles.

```js
// vite.config.js for a plugin
const hostModules = {
  react: 'react',
  'react/jsx-runtime': 'jsxRuntime',
  '@viewtopia/plugin-sdk': 'sdk',
}

const hostGlobals = {
  name: 'viewtopia-host-globals',
  resolveId: (id) => (id in hostModules ? `\0host:${id}` : null),
  load(id) {
    if (!id.startsWith('\0host:')) return null
    const key = hostModules[id.slice('\0host:'.length)]
    return `const m = window.__viewtopiaPluginHost.${key}
export default m
export const { ${key === 'jsxRuntime' ? 'jsx, jsxs, Fragment' : 'useState, useEffect, useMemo, useRef, useCallback, createElement'} } = m`
  },
}

export default {
  plugins: [hostGlobals],
  build: {
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: 'my-plugin' },
    rollupOptions: { external: Object.keys(hostModules) },
  },
}
```

The config maps the `@viewtopia/plugin-sdk` import to the host's SDK at load time.

The `id` the bundle exports must match the `id` the registry lists, or the load is refused.

A plugin that fails to load is left disabled with the reason shown in the Plugin Manager. It is not
retried until the next reload, and it never blocks the rest of the app.

## File Structure

```
src/plugins/
├── sdk.ts                    # type definitions (host code)
├── registry.ts               # build-time discovery (host code)
├── PluginHost.tsx            # panel renderer (host code)
├── PluginSettings.tsx        # settings-schema renderer (host code)
├── runtime/                  # registry client and bundle loader (host code)
├── example-plugin/
│   └── index.tsx             # working example
└── your-plugin/
    ├── index.tsx             # entry point (required)
    ├── components/           # optional sub-components
    └── utils.ts              # optional helpers
```

A plugin only adds its own folder. The host code is shared by every plugin.
