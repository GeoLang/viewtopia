# ViewTopia

**The all-in-one geospatial viewer** — 3D globe, 2D maps, AI agent, and professional analysis tools in a single web app.

[![CI](https://github.com/GeoLang/viewtopia/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/viewtopia/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

---

## Features

### Viewers
| Feature | Description |
|---------|-------------|
| **CesiumJS 3D Globe** | Full 3D globe with terrain, 3D Tiles, and imagery |
| **MapLibre GL** | GPU-accelerated 2D vector maps |
| **deck.gl** | High-performance data visualization layers |
| **Leaflet** | 2D map with drawing and marker clustering |
| **Split View** | Side-by-side 3D + 2D with synced cameras |

### AI Agent
| Feature | Description |
|---------|-------------|
| **Natural language queries** | "Fly to London and classify the point cloud" |
| **30+ commands** | Measurement, routing, styling, analysis — all voice-driven |
| **Session persistence** | Chat history saved and replayable |
| **GeoLang integration** | AI-powered spatial reasoning via GeoLang backend |

### Analysis Tools
| Feature | Description |
|---------|-------------|
| **Measurement** | Distance, area, and elevation measurement |
| **Terrain Profile** | Cross-section elevation profiles |
| **Shadow Analysis** | Time-of-day shadow simulation |
| **Viewshed** | Line-of-sight visibility analysis |
| **Routing** | OSRM point-to-point directions |
| **Isochrone** | Travel-time zones from any point |
| **Charts** | Histogram, scatter, and time series |

### Space-Time Intelligence
| Feature | Description |
|---------|-------------|
| **Entity Management** | CRUD entities (person/vehicle/device), aliases, merge, search |
| **Track Visualization** | Animated 3D arcs with time scrubber, trails, and elevation |
| **Colocation Detection** | Find entities that were near each other at the same time |
| **Co-Travel Detection** | Identify entities moving together over multiple time steps |
| **Pattern-of-Life** | Detect frequent locations, daily routines, and anomalies |
| **Geo-Fencing** | Circle/polygon fences with enter/exit crossing detection |
| **Network Graph** | Force-directed entity relationship visualization |
| **Activity Histogram** | Timeline showing event density across all entities |
| **Entity Swimlanes** | Per-entity timeline with events, speed, and current-time cursor |
| **Network Metrics** | Degree, betweenness, closeness, PageRank centrality + community detection |
| **Behavioral Clustering** | K-means clustering on movement features (speed, spread, patterns) |
| **Predictive Location** | Multi-strategy future location prediction with confidence scores |
| **Data Quality** | GPS outlier, impossible speed, null island, altitude spike detection |
| **Alerting Rules** | Geofence entry, proximity, speed, inactivity triggers with callbacks |
| **CDR Import** | Telecom call-detail-record ingest with auto column mapping |
| **Multi-Format Ingest** | CSV, GPX, KML, GeoJSON, CDR — drag & drop or browse |
| **Export** | KML, CSV (tracks + links), video capture |
| **Audit Trail** | Timestamped action log with filtering, CSV export, and UI panel |
| **Manual Linking** | Dialog for analyst-created entity relationships with evidence |
| **Ontology Engine** | Typed entity/link schema with 8 entity types, 10 link types, validation, import/export |
| **Entity Resolution** | Fuzzy dedup via Levenshtein, token overlap, alias matching with scored candidates |
| **Document Attachments** | Link files/media to entities with IndexedDB blob storage, search, multi-entity linking |
| **Timeline Correlation** | Unified cross-entity temporal view — movements, links, alerts, fence crossings |
| **Classification / RBAC** | 6 security levels (U through TS/SCI), 8 compartments, role-based access control |
| **Case Management** | Investigation workflow — phases, notes, tags, entity/link/attachment assignment, export |
| **Multi-Source Data Fusion** | Provenance tracking with 10 source types, field conflict detection, resolution |
| **IndexedDB Persistence** | Auto-save/restore sessions with entities, tracks, and links |
| **Binary Columnar Store** | Apache Arrow-backed storage for 100k+ event datasets |
| **Web Worker Analysis** | Offload colocation, pattern, and geofence analysis to workers |
| **Viewport Tiling** | Only render events visible in current map extent |
| **Virtual Scroll** | Smooth scrolling for large entity lists |

### Plugin System
| Feature | Description |
|---------|-------------|
| **Auto-discovery** | Drop a folder in `src/plugins/` — automatically loaded |
| **Plugin SDK** | Full context: map control, store access, API proxy, settings |
| **Settings UI** | Each plugin declares settings schema, rendered in Settings panel |
| **23 built-in plugins** | Industry verticals + QGIS-equivalent tools (see below) |
| **Hot reload** | Vite HMR — edit a plugin, see changes instantly |

### Portal & Content Management
| Feature | Description |
|---------|-------------|
| **Item Catalog** | Searchable inventory of maps, layers, datasets, stories, and apps |
| **Sharing Model** | Private / organization / public sharing levels |
| **Portal API** | REST-backed item CRUD with offline localStorage fallback |
| **Dashboard Builder** | Configurable widget-based dashboards (map, chart, indicator, gauge, list, rich text) |
| **Dashboard Grid** | CSS grid layout with per-widget positioning |
| **Save/Load** | Persist dashboard configurations to localStorage or API |

### Industry Verticals (Plugins)
| Plugin | Description |
|--------|-------------|
| **Real Estate** | Parcel search (APN/address/owner), comparable sales, split/merge editing |
| **Logistics** | Fleet tracking via WebSocket, multi-stop delivery optimization |
| **Environmental** | Live IoT sensor monitoring with threshold alerts |
| **Construction** | Survey comparison, cut/fill volumes, milestone tracking |
| **Agriculture** | NDVI field health, soil moisture, crop status |
| **Telecom** | Tower inventory, RF coverage simulation (Hata model) |
| **Emergency** | Incident dispatch, evacuation routing, affected area analysis |

### QGIS Plugin Equivalents (Plugins)
Ported from the top 20 most-downloaded QGIS plugins (~30M combined downloads):

| Plugin | QGIS Equivalent | Downloads | Key Tech |
|--------|-----------------|-----------|----------|
| **Basemap Catalog** | QuickMapServices | 11.3M | 30+ tile providers, category filter |
| **OSM Downloader** | QuickOSM | 3.0M | Overpass API, 12 presets |
| **Raster Classification** | Semi-Auto Classification | 2.6M | K-means, ISODATA in-browser |
| **Coordinate Tools** | Lat Lon Tools | 1.7M | DD/DMS/UTM/Geohash/WKT/GeoJSON |
| **Geoprocessing** | mmqgis | 1.7M | Turf.js: buffer, dissolve, intersect, union, voronoi |
| **Terrain Profile** | Profile tool | 1.6M | Open-Elevation API, SVG chart |
| **Export Map** | qgis2web | 1.6M | PNG/JPEG/HTML + embed codes |
| **3D Viewer** | Qgis2threejs | 1.4M | deck.gl terrain + buildings |
| **Street View** | Street View | 901K | Google + Mapillary integration |
| **Data Catalog** | MetaSearch | 856K | STAC API (Earth Search, Planetary Computer) |
| **KML Tools** | KML Tools | 771K | Import KML/KMZ/GPX, export KML |
| **Shape Tools** | Shape Tools | 669K | Geodesic circles, ellipses, sectors, arcs |
| **Point Sampling** | Point Sampling Tool | 662K | Multi-layer sampling + CSV export |
| **Georeferencer** | Freehand Georeferencer | 664K | Control points + affine transform |
| **Advanced Sketching** | Sketching Tools | 669K | Split, merge, offset, smooth, densify, snap |

### Data & Layers
| Feature | Description |
|---------|-------------|
| **Asset Catalogue** | Browse TileTopia tilesets and load with one click |
| **Cesium Ion** | Connect your Ion account and load assets |
| **OGC Layers** | Import WMS, WMTS, WFS, and XYZ tile services |
| **Drag & Drop** | Drop GeoJSON, GPX, KML, CSV files to import |
| **GPX/KML Import** | Track and waypoint rendering |
| **Layer Manager** | Reorder, toggle visibility, opacity, remove |
| **GeoJSON Editor** | Edit feature properties and vertices |

### Visualization
| Feature | Description |
|---------|-------------|
| **Heatmaps** | deck.gl HeatmapLayer |
| **Hex Bins** | Hexagonal aggregation |
| **Arc Diagrams** | Origin-destination arcs |
| **Scatter Plots** | Point-based scatter |
| **Screen Grid** | Density grid overlay |
| **Style Editor** | Color by property/height/classification |
| **Annotations** | Click-to-annotate with pins |
| **Bookmarks** | Save & restore camera positions |

### UX
| Feature | Description |
|---------|-------------|
| **Keyboard Shortcuts** | 20+ shortcuts (`?` for help) |
| **Dark/Light Theme** | Toggle with persistence |
| **Geocoding** | Nominatim-powered place search |
| **Coordinate Readout** | Live lat/lon/height under cursor |
| **Right-Click Menu** | Context actions at any location |
| **Minimap** | Overview map with viewport rectangle |
| **Print/Export** | PNG screenshot with title, scale bar, north arrow |
| **Tour** | 12-step onboarding walkthrough |
| **Stories** | Guided fly-through presentations |
| **Collaboration** | Real-time view sync, cursors, chat, and voice/video |
| **Responsive** | Mobile-friendly layout with collapsible panels |
| **PWA** | Installable with offline support |

### Offline-First
| Feature | Description |
|---------|-------------|
| **Local-first storage** | All data in IndexedDB — works without network |
| **Operation queue** | Mutations queued locally, synced to server when online |
| **Auto-sync** | Reconnects and pushes pending changes automatically |
| **Tile caching** | Pre-download map tiles for offline viewing |
| **API response cache** | GET responses cached with TTL for offline fallback |
| **Service Worker** | Static assets cached, app loads even without internet |
| **Sync indicator** | Real-time UI showing pending/synced/offline status |
| **Three-way merge** | Conflict resolution: auto-merge when possible, UI for true conflicts |
| **Column-level resolution** | Different-property changes merge automatically (like git) |

### Projects & Workspaces
| Feature | Description |
|---------|-------------|
| **Workspaces** | Team-level containers with shared branding and settings |
| **Projects** | Self-contained contexts — layers, bookmarks, settings, offline scope |
| **Share by email** | Invite collaborators with role (owner/editor/viewer) |
| **Share by link** | Generate token-based join URLs |
| **Role-based access** | Owner, Editor, Viewer permissions per project/workspace |
| **Project switcher** | Header dropdown to create/switch/manage projects |
| **Offline scope** | Mark projects for offline availability — caches only that project's data |
| **Cross-device** | Projects sync via IndexedDB + server, available on any device |

### Raster Analysis
| Feature | Description |
|---------|-------------|
| **COG Loader** | Load Cloud Optimized GeoTIFFs from URL or file (with overviews) |
| **NDVI** | Normalized Difference Vegetation Index from multispectral imagery |
| **Hillshade** | Sun-angle illumination model (Horn's method) |
| **Slope** | Terrain slope in degrees or percent |
| **Aspect** | Terrain aspect (compass direction of steepest descent) |
| **Band Math** | Raster calculator — arbitrary expressions with band references |
| **Contours** | Marching squares contour line generation |
| **Reclassification** | Map value ranges to discrete classes |
| **Color Ramps** | 11 built-in ramps (viridis, magma, terrain, spectral, etc.) |
| **Legend** | Auto-generated color legends for any ramp |

### Notebooks
| Feature | Description |
|---------|-------------|
| **Browser-native cells** | JavaScript cells run instantly, no server needed |
| **Python cells** | Execute via connected Jupyter kernel (pandas, geopandas, ML) |
| **Map action cells** | Recorded map operations (flyTo, addLayer) — replayable |
| **Markdown cells** | Documentation and notes inline |
| **Run All / Run Up To** | Execute notebook sequentially or partially |
| **Replay** | Animated step-by-step workflow replay |
| **Outputs** | Text, JSON, images, errors displayed below cells |
| **Offline** | Notebooks stored in IndexedDB, work without internet |
| **Project-scoped** | Organize notebooks within projects |

### Collaboration
| Feature | Description |
|---------|-------------|
| **Room-based sessions** | Join a named room — all participants see each other |
| **View sync (Follow mode)** | Click the eye icon on a user to lock your camera to theirs in real-time |
| **Cursor sharing** | See where other users are pointing on the map |
| **Presence** | Online user list with coloured indicators |
| **Chat** | Real-time text messaging within the room |
| **Voice & Video** | LiveKit WebRTC — mic, camera, and screen share |
| **Backend** | Connects to Ptolemy's `/ws/rooms/{room_id}` ephemeral relay |

---

## Quick Start

```bash
# Clone
git clone https://github.com/GeoLang/viewtopia.git
cd viewtopia

# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5174
```

### Full platform (all services via Docker Compose)

```bash
docker compose -f docker-compose.platform.yml up --build
# → PostGIS :5432, Ptolemy :3000, Fenestra(WMS/WFS) :3003,
#   TileTopia :3100, Geokode :3001, Itinera :3002,
#   GeoLang AI :8080, ViewTopia :5174
```

### All-in-One single container

```bash
docker build -f Dockerfile.allinone -t geolang-allinone .
docker run -p 3000:3000 -p 3003:3003 -p 3100:3100 -p 5432:5432 geolang-allinone
# → Ptolemy :3000, Fenestra(WMS/WFS) :3003, TileTopia :3100, PostGIS :5432
```

### Admin dashboard

```bash
cd dashboard
npm install && npm run dev
# → http://localhost:4000 — health monitoring, service management, logs, metrics
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   ViewTopia                      │
│  Vite + React + Mantine  ·  CesiumJS  ·  deck.gl│
│  MapLibre  ·  Plugin System  ·  Offline-First    │
├─────────────────────────────────────────────────┤
│  Projects & Workspaces   │  Conflict Resolution  │
│  ┌──────────────────┐    │  ┌─────────────────┐ │
│  │ Workspace → Team │    │  │ Three-way merge │ │
│  │ Project → Context│    │  │ Auto-resolve    │ │
│  │ Share → Roles    │    │  │ Column merge    │ │
│  └──────────────────┘    │  │ UI for conflicts│ │
│                          │  └─────────────────┘ │
├─────────────────────────────────────────────────┤
│  IndexedDB (local)     │  Service Worker (cache) │
│  ┌──────────────────┐  │  ┌───────────────────┐ │
│  │ Layers/Features  │  │  │ Static assets     │ │
│  │ Annotations      │  │  │ Map tiles         │ │
│  │ Pending Ops ←────│──│──│→ Sync to server   │ │
│  │ Projects/WS      │  │  │ Offline fallback  │ │
│  │ API Cache        │  │  │                   │ │
│  └──────────────────┘  │  └───────────────────┘ │
├─────────────────────────────────────────────────┤
│   /api → GeoLang        /agent → GeoLang      │
│   Rust tile server        Python AI agent        │
│   3D Tiles · Terrain      NL → spatial commands  │
│   Point clouds · COGs     Letta memory           │
└─────────────────────────────────────────────────┘
```

### Source Modules (63 files)

```
src/
├── main.js              # Entry point
├── backends.js          # Backend discovery
├── renderers.js         # Cesium/deck.gl/MapLibre switching
├── chat.js              # Agent chat panel
├── sessions.js          # Session persistence
├── tabs.js              # View tab management
├── viewer-commands.js   # 30+ registered commands
├── asset-catalogue.js   # GeoLang asset browser
├── cesium-ion.js        # Cesium Ion integration
├── measurement.js       # Distance/area/elevation
├── annotations.js       # Click-to-pin annotations
├── feature-picker.js    # 3D Tiles property inspector
├── terrain-profile.js   # Elevation cross-sections
├── timeline.js          # Cesium clock widget
├── bookmarks.js         # Camera bookmark manager
├── data-table.js        # Sortable attribute table
├── geojson-editor.js    # Feature property editor
├── print-export.js      # PNG/print export
├── split-view.js        # Side-by-side viewers
├── minimap.js           # Overview map
├── stories.js           # Guided fly-throughs
├── collaboration.js     # Real-time presence
├── keyboard-shortcuts.js # Hotkey system
├── geocoding.js         # Nominatim search
├── routing.js           # OSRM + Valhalla
├── ogc-layers.js        # WMS/WMTS/WFS/XYZ
├── theme-toggle.js      # Dark/light mode
├── track-import.js      # GPX/KML parser
├── tour.js              # Onboarding walkthrough
├── drag-drop.js         # File drag-and-drop
├── coord-readout.js     # Cursor coordinate display
├── context-menu.js      # Right-click actions
├── layer-manager.js     # Layer visibility/opacity
├── charts.js            # Histogram/scatter/timeseries
├── shadows.js           # Shadow analysis
├── viewshed.js          # Viewshed analysis
├── spacetime/
│   ├── index.js         # Barrel re-exports
│   ├── models.js        # Entity, Event, Track, Link types
│   ├── layers.js        # deck.gl layer factories
│   ├── panel.js         # Main UI + analysis wiring
│   ├── entity-manager.js # CRUD, merge, search
│   ├── colocation.js    # Proximity + co-travel detection
│   ├── pattern-of-life.js # Frequent locations, daily patterns
│   ├── geofence.js      # Circle/polygon fences
│   ├── network-graph.js # Force-directed graph viz
│   ├── network-metrics.js # Centrality + community detection
│   ├── activity-histogram.js # Timeline histogram
│   ├── swimlanes.js     # Per-entity timelines
│   ├── clustering.js    # Behavioral k-means
│   ├── prediction.js    # Future location prediction
│   ├── alerting.js      # Rule-based notifications
│   ├── data-quality.js  # GPS outlier detection
│   ├── audit-trail.js   # Action logging
│   ├── export.js        # KML/CSV/video export
│   ├── ingest-formats.js # KML + GeoJSON parsers
│   ├── ingest-cdr.js    # CDR telecom import
│   ├── binary-store.js  # Apache Arrow store
│   ├── worker-pool.js   # Web Worker management
│   ├── analysis-worker.js # Worker entry point
│   ├── viewport-tiling.js # Spatial viewport query
│   ├── persistence.js   # IndexedDB save/restore
│   ├── virtual-scroll.js # Large list scrolling
│   ├── ontology.js      # Typed entity/link schema engine
│   ├── entity-resolution.js # Fuzzy dedup + merge
│   ├── attachments.js   # Document/media blob storage
│   ├── timeline-correlation.js # Cross-entity temporal view
│   ├── classification.js # Security markings + RBAC
│   ├── case-management.js # Investigation workflow
│   └── data-fusion.js   # Multi-source provenance
└── style.css            # All styles (~1900 lines)
```

---

## Collaboration Guide

ViewTopia supports real-time collaboration via Ptolemy's ephemeral room relay and
optional LiveKit WebRTC for voice/video.

### Setup

1. **Configure server URLs** in the Settings panel (⚙️):
   - **GeoLang / Ptolemy URL** — e.g. `https://ptolemy.example.com/api/v1`
   - **LiveKit URL** (optional) — e.g. `wss://livekit.example.com`

2. **Open the Collaboration panel** from the toolbar menu (👥 Collab).

### Joining a Room

1. Enter your **display name** and a **Room ID** (any string — share it with teammates).
2. Click **Join Room**.
3. All participants in the same room see each other in the user list.

### View Sync (Follow Mode)

Click the **eye icon** (👁) next to another user to follow their view. Your camera
will mirror theirs in real-time — zoom, pan, pitch, bearing — all synced. Click again
to stop following.

This is great for guided reviews, presentations, or "show me what you see" workflows.

### Chat

Type a message in the chat box at the bottom of the panel. Messages appear in real-time
for all participants. Your own messages are highlighted in purple.

### Voice & Video (LiveKit)

If a **LiveKit URL** is configured in Settings:

1. After joining a room, a **Voice & Video** section appears.
2. Paste a LiveKit access token (from your token broker) and click **Join Call**.
3. Use the toolbar buttons to toggle **mic** 🎤 and **camera** 📹.
4. Click the **phone icon** 📞 to leave the call (you stay in the collab room).

> **Token broker**: LiveKit requires server-signed JWT tokens. You can add a
> `/api/v1/livekit/token` endpoint to Ptolemy, or use LiveKit Cloud's token API,
> or a standalone service. See [LiveKit docs](https://docs.livekit.io/home/).

### Protocol

The collaboration relay is at `{ptolemyUrl}/../../ws/rooms/{room_id}` (WebSocket).
Messages are opaque JSON relayed to all other participants:

```jsonc
{ "type": "Join",   "user_id": "u1", "user_name": "Alice" }
{ "type": "Camera", "user_id": "u1", "latitude": 40.7, "longitude": -73.9, "zoom": 14, "bearing": 0, "pitch": 45 }
{ "type": "Cursor", "user_id": "u1", "latitude": 40.71, "longitude": -73.91 }
{ "type": "Chat",   "user_id": "u1", "user_name": "Alice", "message": "Look here" }
{ "type": "Leave",  "user_id": "u1" }
```

---

## Plugin Development

ViewTopia uses a file-based plugin system — drop a folder in `src/plugins/` and it's automatically discovered.

### Creating a Plugin

```bash
mkdir src/plugins/my-plugin
```

```tsx
// src/plugins/my-plugin/index.tsx
import type { PluginDefinition, PluginContext } from '../sdk';

function MyPanel({ ctx }: { ctx: PluginContext }) {
  return <div>
    <button onClick={() => ctx.map.flyTo(-73.9, 40.7, 14)}>Fly to NYC</button>
  </div>;
}

export default {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  icon: '🔌',
  category: 'plugins',
  Panel: MyPanel,
  settings: [
    { key: 'apiKey', label: 'API Key', type: 'text', defaultValue: '' },
  ],
} satisfies PluginDefinition;
```

### Plugin Context API

| Property | Description |
|----------|-------------|
| `ctx.map.flyTo(lng, lat, zoom)` | Fly the camera to coordinates |
| `ctx.map.addGeoJsonLayer(id, geojson)` | Add a temporary data layer |
| `ctx.map.removeLayer(id)` | Remove a layer |
| `ctx.map.fitBounds(bbox)` | Fit view to bounding box |
| `ctx.store.getLayers()` | Get current layer list |
| `ctx.store.getSettings()` | Get app settings |
| `ctx.api.fetch(path)` | Proxied fetch to backend |
| `ctx.settings.get(key)` | Read plugin setting |
| `ctx.settings.set(key, value)` | Write plugin setting (localStorage) |
| `ctx.close()` | Close the plugin panel |

See [docs/plugins.md](docs/plugins.md) for the full guide.

---

## Scripts

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm test           # Run unit tests (vitest)
npm run test:e2e   # Run E2E tests (Playwright)
npm run test:all   # Run all tests
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `M` | Measure |
| `A` | Annotate |
| `I` | Feature info |
| `D` | Draw |
| `B` | Bookmarks |
| `S` | Stories |
| `C` | Collaboration |
| `1-4` | Switch tabs |
| `F1-F3` | Switch renderer |
| `P` | Print/export |
| `V` | Split view |
| `?` | Show help |
| `Esc` | Close panels |

---

## Stack

- **Frontend:** Vite, React + Mantine UI, CesiumJS, deck.gl, MapLibre GL, Leaflet, Apache Arrow
- **Backend:** [GeoLang](https://github.com/GeoLang/tiletopia) (Rust) + [GeoLang](https://gitlab.com/geolanghq/geolang) (Python)
- **AI:** Letta-powered spatial agent
- **Analysis:** 31 space-time intelligence modules (Gotham-class)
- **Deploy:** Docker Compose, Helm, Terraform

---

## License

[AGPL-3.0](LICENSE)
