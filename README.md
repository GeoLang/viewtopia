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

### Source Modules (36 files)

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
└── style.css            # All styles (~1200 lines)
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

- **Frontend:** Vite, CesiumJS, deck.gl, MapLibre GL, Leaflet
- **Backend:** [TileTopia](https://github.com/TileTopia-HQ/tiletopia) (Rust) + [GeoLang](https://gitlab.com/geolanghq/geolang) (Python)
- **AI:** Letta-powered spatial agent
- **Deploy:** Docker Compose, Helm, Terraform

---

## License

[AGPL-3.0](LICENSE)
