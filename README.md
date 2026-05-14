# ViewTopia

**The all-in-one geospatial viewer** — 3D globe, 2D maps, AI agent, and professional analysis tools in a single web app.

[![CI](https://github.com/TileTopia-HQ/viewtopia/actions/workflows/ci.yml/badge.svg)](https://github.com/TileTopia-HQ/viewtopia/actions)
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
| **Collaboration** | Real-time cursors and chat |
| **Responsive** | Mobile-friendly layout with collapsible panels |
| **PWA** | Installable with offline support |

---

## Quick Start

```bash
# Clone
git clone https://github.com/TileTopia-HQ/viewtopia.git
cd viewtopia

# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5174
```

### With backends (full stack)

```bash
docker compose up
# → ViewTopia on :8080, TileTopia on :3000, GeoLang on :8081
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   ViewTopia                      │
│  Vite + Vanilla JS  ·  CesiumJS  ·  deck.gl     │
│  MapLibre  ·  Leaflet  ·  30+ feature modules    │
├─────────────────────────────────────────────────┤
│   /api → TileTopia        /agent → GeoLang      │
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
├── asset-catalogue.js   # TileTopia asset browser
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

- **Frontend:** Vite, CesiumJS, deck.gl, MapLibre GL, Leaflet, Apache Arrow
- **Backend:** [TileTopia](https://github.com/TileTopia-HQ/tiletopia) (Rust) + [GeoLang](https://gitlab.com/geolanghq/geolang) (Python)
- **AI:** Letta-powered spatial agent
- **Analysis:** 31 space-time intelligence modules (Gotham-class)
- **Deploy:** Docker Compose, Helm, Terraform

---

## License

[AGPL-3.0](LICENSE)
