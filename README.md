# ViewTopia

Unified geospatial viewer combining [TileTopia](https://github.com/TileTopia-HQ/tiletopia)'s 3D globe with [GeoLang](https://github.com/TileTopia-HQ/geolang)'s AI-powered 2D analysis.

## Features

- **3D Globe** — CesiumJS with deck.gl and MapLibre renderer support
- **2D Map** — Leaflet with GeoJSON layers, marker clusters, and drawing tools
- **AI Chat** — GeoLang agent integration with SSE streaming
- **Session Management** — Create, switch, rename, and delete sessions
- **Chat Persistence** — Click any old response to replay its map view
- **Data Upload** — GeoPackage, GeoJSON, Shapefile, CSV, LAS/LAZ, GeoTIFF
- **Basemap Switching** — OSM, Satellite, Topo, Dark
- **Map Search** — Fly to any place via Nominatim geocoding
- **Click-to-Query** — Click the map to ask the agent about a location
- **Resizable/Collapsible Chat** — Drag to resize, Ctrl+B to toggle
- **2D→3D Layer Sync** — Layers auto-sync when switching views
- **Classification Visualization** — ASPRS point cloud classification styling
- **Export** — PNG screenshot export

## Quick Start

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:5174 with proxies to:
- **TileTopia** (port 3000) — 3D tiles, terrain, point clouds
- **GeoLang** (port 8080) — AI agent, geospatial analysis

Both backends are optional — the viewer adapts to whichever are available.

## Architecture

```
src/
├── main.js              # Entry point, Cesium init
├── backends.js          # Backend discovery & health polling
├── chat.js              # Chat panel with SSE streaming & persistence
├── sessions.js          # Session/upload/basemap/resize wiring
├── renderers.js         # Multi-renderer engine (Cesium/deck.gl/MapLibre)
├── leaflet-view.js      # Leaflet 2D map, draw tools, click-to-query
├── tabs.js              # View switching with 2D→3D sync
├── ui-spec-renderer.js  # Agent UI spec rendering (map/image/table)
├── viewer-commands.js   # Unified command protocol
├── classification-viz.js # Point cloud classification styling
└── style.css            # Dark theme
```

## License

AGPL-3.0
