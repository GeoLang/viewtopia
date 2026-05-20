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

3. Run `npm run dev` — your plugin appears in the **Plugins** toolbar menu.

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
