# ViewTopia

**The all-in-one geospatial viewer** — 3D globe, 2D maps, AI agent, and professional analysis tools in a single web app.

[![CI](https://github.com/GeoLang/viewtopia/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/viewtopia/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

---

## Status

The viewer, local raster and geometry tools, DuckDB SQL, notebooks, 20 built-in
plugins, IndexedDB stores, and Agora collaboration paths are implemented.
Project and workspace metadata is server-backed through authenticated `/api/v1`
calls. Several surfaces are local-only or depend on configured services:

- Ptolemy stores workspace and project names, descriptions, memberships, roles,
  and expiring invitation records. ViewTopia does not write this metadata or
  invitations to IndexedDB.
- Dashboard definitions are stored in localStorage only.
- Conflict merge code exists, but the resolver is not mounted and the platform
  sync path does not queue the feature operations it expects.
- Space-Time Analysis buttons are present but have no handlers.
- LiveKit voice and video require a configured URL and a token.
- Vertical plugins read configured service datasets. They do not provide those
  datasets.

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
| **GeoLang agent** | Spatial reasoning backend. The API advertises 39 tools, and the viewer uses a subset including `sql_query`, `ptolemy_query`, `list_tilesets`, routing, and QGIS algorithms |

### Analysis Tools
| Feature | Description |
|---------|-------------|
| **Measurement** | Distance, area, and elevation measurement |
| **Terrain Profile** | Cross-section elevation profiles |
| **Shadow Analysis** | Cesium shadow display with time controls. This is not a sun-position analysis engine |
| **Viewshed** | Line-of-sight visibility analysis |
| **Routing** | itinera point-to-point directions (public OSRM demo fallback) |
| **Travel Time** | itinera service-area bands from a point, and OD matrices between two point layers |
| **Charts** | Histogram, scatter, and time series |

### Space-Time Intelligence
The panel tracks entities and their positions over time. Classification, RBAC and Gotham-class analysis are not in this product.

| Feature | Description |
|---------|-------------|
| **Entity Management** | Create, list and select entities (person/vehicle/device) |
| **CSV ingest** | Drop or browse a CSV with name, lat, lng, timestamp columns |
| **Track Visualization** | Time scrubber and play/pause over imported positions |
| **Manual Linking** | Dialog for analyst-created entity relationships |

The Analysis tab draws seven buttons with no handlers. Colocation, pattern-of-life, network metrics, clustering, prediction and data-quality functions exist as library code. Nothing in the panel calls them. Co-travel, geofencing UI, ontology, entity resolution, CDR import, case management and classification/RBAC have no UI.

### Plugin System
| Feature | Description |
|---------|-------------|
| **Auto-discovery** | Build-time discovery of folders in `src/plugins/`, followed by runtime loading |
| **Plugin SDK** | Full context: map control, store access, API proxy, settings |
| **Settings UI** | Each plugin declares settings schema, rendered in Settings panel |
| **20 built-in plugins** | Industry verticals + QGIS-equivalent tools (see below) |
| **Hot reload** | Vite HMR during development |

### Portal & Content Management
| Feature | Description |
|---------|-------------|
| **Item Catalog** | Searchable inventory of maps, layers, datasets, stories, and apps |
| **Sharing Model** | Portal items have private, organization, and public levels. Project and workspace metadata uses authenticated `/api/v1` calls |
| **Portal API** | REST-backed item CRUD with offline localStorage fallback |
| **Dashboard Builder** | Configurable widget-based dashboards (map, chart, indicator, gauge, list, rich text) |
| **Dashboard Grid** | CSS grid layout with per-widget positioning |
| **Save/Load** | Persist dashboard configurations to localStorage |

### Industry Verticals (Plugins)
| Plugin | Description |
|--------|-------------|
| **Real Estate** | Parcel search (APN/address/owner), comparable sales, split/merge editing |
| **Logistics** | Multi-stop delivery optimization, fleet tracking panel awaiting a live telemetry feed |
| **Environmental** | Sensor inventory from a configured sensors dataset, server-reported status, filter by type, fly to a sensor |
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
| **Terrain Profile** | Profile tool | 1.6M | Open-Elevation API, SVG chart |
| **Export Map** | qgis2web | 1.6M | PNG/JPEG/HTML + embed codes |
| **3D Viewer** | Qgis2threejs | 1.4M | deck.gl terrain + buildings |
| **Street View** | Street View | 901K | Google + Mapillary integration |
| **KML Tools** | KML Tools | 771K | Import KML/KMZ/GPX, export KML |
| **Shape Tools** | Shape Tools | 669K | Geodesic circles, ellipses, sectors, arcs |
| **Point Sampling** | Point Sampling Tool | 662K | Multi-layer sampling + CSV export |
| **Advanced Sketching** | Sketching Tools | 669K | Split, merge, offset, smooth, densify, snap |

### Data & Layers
| Feature | Description |
|---------|-------------|
| **Asset Catalogue** | Browse TileTopia tilesets and load with one click |
| **Cesium Ion** | Connect your Ion account and load assets |
| **OGC Layers** | Import WMS, WMTS, WFS, and XYZ tile services |
| **Image Overlay** | Drop a site plan image or PDF, place it by world file + `.prj` (projicio wasm) or two clicks, keep it as a layer |
| **Drag & Drop** | Drop GeoJSON, GPX, KML, CSV, GeoPackage, Shapefile (loose or zipped), FlatGeobuf and GeoParquet files to import |
| **GPX/KML Import** | Track and waypoint rendering |
| **SQL** | Run DuckDB SQL over imported and attached data, draw the result on the map, export CSV or Parquet |
| **Layer Manager** | Reorder, toggle visibility, opacity, remove |
| **GeoJSON Editor** | Edit feature properties and vertices |

### Visualization
| Feature | Description |
|---------|-------------|
| **Heatmaps** | MapLibre native heatmap layer |
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
| **PWA** | Installable web app manifest |

### Offline-First
| Feature | Description |
|---------|-------------|
| **Local-first storage** | Offline browser state uses IndexedDB and localStorage. Not all data is available without network |
| **Operation queue** | Client mutations can be queued locally. Each backend path requires a matching server API |
| **Auto-sync** | Attempts to push queued operations when the browser reconnects |
| **API response cache** | GET responses cached with TTL for offline fallback |
| **Sync indicator** | Real-time UI showing pending/synced/offline status |
| **Three-way merge** | Feature property edits queue as `update` operations. On sync the server version is fetched and merged against the state at the last sync |
| **Column-level resolution** | Changes to different properties merge without asking. Same-property changes on both sides open the resolver from the sync indicator, where you pick a side per property or in bulk |

### Projects & Workspaces
| Feature | Description |
|---------|-------------|
| **Workspaces** | Server-backed names, descriptions, memberships, and roles for groups of projects |
| **Projects** | Server-backed names, descriptions, and roles with browser-local map snapshots |
| **Share by user** | Owners add known users by JWT subject with direct member roles |
| **Share by link** | Owners create expiring invite links for editor or viewer access. Links expire after seven days and store only token hashes server-side |
| **Role-based access** | Workspace access is inherited by projects. Direct project membership can grant project-only access, and the highest effective role is returned |
| **Project switcher** | Header dropdown to create/switch/manage projects |
| **Offline scope** | Map snapshots and overlay files are browser-local. Project data sync is not implemented |
| **Cross-device** | Project and workspace metadata reads and mutations are server-backed. Map snapshots and overlay files remain browser-local |

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

### Geoprocessing
| Feature | Description |
|---------|-------------|
| **Geometry** | Buffer, simplify, centroid, convex hull, explode, collect |
| **Overlay** | Intersection, difference, clip to a layer or to an extent |
| **Aggregate** | Dissolve by field, union of several layers |
| **Generate** | Voronoi cells, square and hex grids |
| **Join** | Spatial join by intersects, within or nearest |
| **Quality** | Validity report per feature, make valid |
| **Batch** | Chain steps, each reading a layer or the previous step's output |

Runs topoi compiled to WASM in a worker. Every distance, tolerance and cell
size is metres: ops compute in a local equirectangular frame centred on their
inputs.

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
| **Offline** | Notebook data is stored in IndexedDB. Python and remote-backed cells still need their services |
| **Project-scoped** | Organize notebooks within projects |

### Collaboration
| Feature | Description |
|---------|-------------|
| **Room-based sessions** | Join a named room — all participants see each other |
| **Presence** | Online user list with coloured indicators |
| **Chat** | Real-time text messaging within the room |
| **Voice & Video** | Optional LiveKit WebRTC for mic, camera, and screen share. A URL and token are required |
| **Backend** | Connects to tiletopia's `/api/v1/realtime/{room}` ephemeral relay |
| **Cursors and camera-follow** | Not here: start a live session, then click a peer avatar in the header |

---

## Requirements

**Web app only (frontend dev):**

- **Node.js ≥ 20** and pnpm (pinned via `packageManager`; `corepack enable`)
- A modern WebGL2 browser

**Full platform (all backends, via Docker):**

- **Docker Engine + Docker Compose v2** (the `docker compose` subcommand)
- **git** to clone the GeoLang repos. The compose file *builds each backend
  from its sibling repository*, so you need them cloned as peers of `viewtopia/`.
  Use the bootstrap script:
  ```bash
  scripts/clone-geolang.sh ~/src/GeoLang   # clones every platform repo
  ```
  (every repo is public on GitHub, including
  [geolang](https://github.com/GeoLang/geolang). They clone over SSH by default,
  add `--https` for HTTPS.)
- **An LLM API key for the agent:** put `XAI_API_KEY` (or `OPENAI_API_KEY`) in
  `geolang/.env`.
- **~Several GB of disk** for images (the geolang + QGIS image is large) plus
  any OSM/address data.
- **No GPU required**.
- **bash** for the helper scripts (`scripts/`).

## Developing on Windows

**Yes — you can develop this on Windows natively, from PowerShell + Docker Desktop.
No WSL distro required.** The frontend runs natively (Node/Vite); the backends run as
Linux containers that Docker Desktop hosts for you. This is "Option A": **everything
on one Windows box.**

### 1. Install the prerequisites (from a terminal)

You can install everything from a PowerShell terminal with **winget** (built into
Windows 10/11) — no GUI clicking required:

```powershell
winget install OpenJS.NodeJS.LTS      # Node ≥ 20 (bundles corepack for pnpm)
winget install Git.Git                 # git + Git Bash
winget install Docker.DockerDesktop    # Docker Desktop (Linux-container backend)
corepack enable                        # activates pnpm (this repo pins pnpm via packageManager)
```

> **Heads-up — Docker Desktop over SSH:** the `docker` / `docker compose` CLI is the
> normal way to drive Docker and works fine from any Windows terminal. The one catch
> is Docker Desktop's *engine*: it's started by the Docker Desktop app in your
> **logged-in Windows desktop session**, and the first launch may need a prompt +
> reboot (to enable virtualization). So you can drive `docker` over SSH, but Docker
> Desktop must already be **running** in a desktop session — purely headless SSH with
> no login won't reach the daemon. If you'd rather avoid this entirely, run the
> containers on a **Linux host** (e.g. Fedora) with native Docker — see
> [On Linux (Fedora)](#on-linux-fedora--the-recommended-docker-host); the daemon is a
> systemd service with no session requirement.

### 2. Clone the platform repos

```powershell
.\scripts\clone-geolang.ps1 C:\src\GeoLang   # native PowerShell helper (clones all repos)
```

(or run `scripts/clone-geolang.sh` under Git Bash). Then put your `XAI_API_KEY` /
`OPENAI_API_KEY` in `C:\src\GeoLang\geolang\.env`.

### 3a. Frontend inner loop (native, no containers)

```powershell
cd C:\src\GeoLang\viewtopia
pnpm install
pnpm run dev          # → http://localhost:5174
pnpm test ; pnpm run build
```

### 3b. Full platform (backends in Docker Desktop)

With Docker Desktop running, from PowerShell:

```powershell
cd C:\src\GeoLang\viewtopia
docker compose -f docker-compose.platform.yml up --build   # → http://localhost:5174
```

Docker Desktop runs the Linux containers via its own managed VM (the Hyper-V backend,
or Docker Desktop's built-in WSL2 engine that you never open — *not* a WSL distro you
install).

**Backend dev (optional):** the Rust services (ptolemy, tiletopia, geokode, itinera,
fenestra) build natively with [rustup](https://rustup.rs) (`cargo build` / `cargo run`).
geolang (Python + QGIS/GDAL) is far easier to run via its container than to install
natively on Windows.

### Caveats

- **Share the drive** holding the repos with Docker Desktop (Settings → Resources →
  File Sharing) so the compose bind-mounts (`..\geolang`, `.\data`, `.\deploy`) work.
- `git config --global core.autocrlf input` so shell scripts / config files keep LF
  line endings.
- The `:z` SELinux volume labels in the compose file are ignored on Windows (harmless).
- Use the native `scripts\clone-geolang.ps1`, or run the bash `scripts/clone-geolang.sh`
  under Git Bash (ships with Git for Windows).

## Quick Start

```bash
# Clone
git clone https://github.com/GeoLang/viewtopia.git
cd viewtopia

# Install dependencies
pnpm install

# Start dev server
pnpm run dev
# → http://localhost:5174
```

### Full platform (all services via Docker Compose)

The platform compose file builds each backend from its sibling repository.
Clone them all with `scripts/clone-geolang.sh` (see [Requirements](#requirements)),
or ensure at least these repos are cloned as peers of `viewtopia/`:

```
src/GeoLang/
├── fenestra/
├── geokode/
├── geolang/      # AI agent tools + API (Python + QGIS)
├── sibyl/        # Agent loop service (Rust)
├── itinera/
├── ptolemy/
├── tiletopia/
└── viewtopia/
```

**One command** brings up the whole stack for **any region** from the `viewtopia/`
checkout — pass any [Geofabrik](https://download.geofabrik.de) extract URL:

```bash
# default region is Monaco; pass any extract to point the stack at your city:
bash scripts/platform-up.sh \
  https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf
# → http://localhost:5174
```

`platform-up.sh` generates the shared JWT secret, fetches the extract to
`data/region.osm.pbf`, builds, waits for every service (including itinera's routing
graph build) to answer, and seeds the real-estate demo. It needs the sibling repos
cloned and your LLM key in `../geolang/.env`.

**Switching regions re-derives everything automatically.** Run it again with a
different extract URL and it re-downloads the pbf, rebuilds the itinera routing graph,
re-ingests geokode's addresses, and re-anchors the seeded real-estate demo onto the
new region. Pass the same URL again and it skips the rebuilds. Pick a mid-size metro
(a US state/city or EU city extract) to keep the download and graph build quick;
country/continent extracts are large and slow to import.

**Alternative** — bring the stack up manually and manage `data/` yourself:

- `data/region.osm.pbf` — OSM extract that geokode (addresses) and itinera (routing
  graph) both read. Grab one from Geofabrik, then
  `docker compose -f docker-compose.platform.yml restart geokode itinera`.
- `data/addresses.csv` — optional OpenAddresses CSV geokode can import instead.

#### On Linux (Fedora) — the recommended Docker host

This is the simplest, fully verified setup: run the stack on a Linux box with
**native Docker Engine** — no Docker Desktop, and **no desktop-session caveat**.
The daemon is a normal `systemd` service, so it works fully over plain SSH (no
GUI / logged-in session required).

```bash
# Fedora: install Docker Engine + Compose v2 plugin
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
# (or Fedora's own packages: sudo dnf install -y moby-engine docker-compose)
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # log out/in once to use docker without sudo

# then, from the viewtopia/ checkout:
docker compose -f docker-compose.platform.yml up --build   # → http://localhost:5174
```

The Docker Desktop / interactive-session caveat in
[Developing on Windows](#developing-on-windows) applies **only** to Docker Desktop
on Windows — it does not apply to native Docker on Linux.

**Services exposed:**

| Service | Port | Notes |
|---------|------|-------|
| PostGIS | 5432 | PostgreSQL + PostGIS |
| Ptolemy | 3000 | Feature store |
| Geokode | 3001 | Geocoder (imports `data/region.osm.pbf`) |
| Itinera | 3002 | Router + isochrones (needs `data/region.osm.pbf`) |
| Fenestra | 3003 | WMS/WFS/WMTS/WCS gateway, proxied at `/ogc/` (host port is dev convenience) |
| TileTopia | 3100 | 3D Tiles / terrain / assets, plus auth, portal, and terrain analysis |
| GeoLang AI | 8080 | Agent API + tool executor; runs ride the sibyl service (port 8090) |
| Jupyter | n/a | Python notebook kernels, proxied at `/jupyter/` (no host port) |
| ViewTopia | 5174 | Web app (nginx reverse proxy) |

The nginx proxy fronts everything on 5174, so the app talks same-origin:
`/api/` → Ptolemy, `/api/v1/auth` + `/api/v1/portal` → TileTopia, `/tiles/` →
TileTopia (including `/tiles/v1/analysis`, backed by terrano), `/api/route` +
`/api/isochrone` + `/api/network/` → Itinera, `/api/geocode/` → Geokode, `/agent/` → GeoLang,
`/api/pipeline/runs` → geodukt's run history (its `/run` is not proxied),
`/jupyter/` → Jupyter, `/ogc/` → Fenestra (so WMS is `/ogc/wms` and OGC API
Features is `/ogc/ogc/collections`, since fenestra namespaces that API itself).
Fenestra's WMTS and OGC API responses carry absolute URLs, so serving the stack on
anything but `localhost:5174` needs `FENESTRA_PUBLIC_URL=<origin>/ogc` set for it.

**Data setup** (`scripts/platform-up.sh <extract-url>` does all of this for you,
and re-does the derived parts whenever the extract URL changes):

```bash
# Geokode and Itinera both read the OSM extract: geokode imports its addresses
# from it, so the geocoder and the routing graph stay aligned.
wget -O data/region.osm.pbf \
  https://download.geofabrik.de/europe/monaco-latest.osm.pbf
docker compose -f docker-compose.platform.yml restart geokode itinera

# Real-estate demo data (parcels + comparable sales) into Ptolemy. It anchors on
# the current region: it reads the pbf bbox and snaps to the nearest geocoded
# address, so the demo lands on the actual city (Monaco by default).
node scripts/seed-parcels.mjs
```

Geokode also accepts an OpenAddresses CSV (`LON,LAT,NUMBER,STREET,CITY,REGION,POSTCODE`)
instead: point its `--data` flag at one. A sample is at `data/addresses.csv`.

**Troubleshooting:**

```bash
# "failed to set up container networking ... network not found" → usually a stopped
# container from another compose project still pointing at a deleted network.
# scripts/platform-up.sh already runs the `down` for you:
docker compose -f docker-compose.platform.yml down --remove-orphans
docker network prune -f
docker container prune -f   # drops the stale containers holding the dead network
docker compose -f docker-compose.platform.yml up --build

# After editing deploy/nginx-platform.conf, no recreate needed:
docker compose -f docker-compose.platform.yml exec viewtopia nginx -s reload
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
pnpm install && pnpm run dev
# → http://localhost:4000 — health monitoring, service management, logs, metrics
```

---

## Architecture

The platform topology, service responsibilities, ViewTopia internals, and the full
source-module map now live in **[DESIGN.md](DESIGN.md)** (which also tracks the active
shipping plan). See [DESIGN.md §2 — Current architecture](DESIGN.md#2-current-architecture-as-built).

---

## Collaboration Guide

Chat and voice/video run over tiletopia's ephemeral room relay plus optional
LiveKit WebRTC. Peer cursors and camera-follow are not part of a room: they belong
to a live document, where a peer avatar in the header is the follow control.

### Setup

1. **Configure server URLs** in the Settings panel (⚙️):
   - **tiletopia URL** — e.g. `https://tiletopia.example.com/api/v1`
   - **LiveKit URL** (optional) — e.g. `wss://livekit.example.com`

2. **Open the Collaboration panel** from the toolbar menu (👥 Collab).

### Joining a Room

1. Enter your **display name** and a **Room ID** (any string — share it with teammates).
2. Click **Join Room**.
3. All participants in the same room see each other in the user list.

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

The room relay is at `{tiletopiaUrl}/realtime/{room}` (WebSocket). The session JWT
rides in the subprotocol, `['bearer', jwt]`, and the server stamps `user_id` from
the JWT `sub` on every frame it relays. The frames this client sends and reads:

```jsonc
{ "type": "Join",     "user_id": "u1", "asset_id": "room-1", "user_name": "Alice" }
{ "type": "Chat",     "user_id": "u1", "user_name": "Alice", "message": "Look here" }
{ "type": "Leave",    "user_id": "u1", "asset_id": "room-1" }
{ "type": "Presence", "users": [{ "user_id": "u1", "user_name": "Alice", "color": "#a78bfa" }] }
```

---

## Embedding

`?embed=1` renders the viewer with no app chrome, just the map and a badge
linking back to the full app. Pair it with a view-role share link (live map)
or a `#cam=` hash (static view). The share dialog copies a ready iframe
snippet for view links.

The iframe offers its host page a postMessage API. Messages the embed accepts
(parent window only):

```jsonc
{ "type": "viewtopia:flyTo", "lng": 7.42, "lat": 43.73, "zoom": 12 }   // zoom optional
{ "type": "viewtopia:getCamera", "requestId": "r1" }                   // requestId echoed back
{ "type": "viewtopia:listLayers", "requestId": "r2" }
{ "type": "viewtopia:setLayerVisibility", "layerId": "roads", "visible": false }
```

Messages the embed posts to its parent:

```jsonc
{ "type": "viewtopia:ready" }                                          // once, on boot
{ "type": "viewtopia:camera", "camera": { "longitude": 7.42, "latitude": 43.73, "zoom": 12, "bearing": 0, "pitch": 0 }, "requestId": "r1" }
// ^ as the getCamera reply, and throttled on every camera move (no requestId then)
{ "type": "viewtopia:layers", "layers": [{ "id": "roads", "name": "Roads", "type": "geojson", "visible": true }], "requestId": "r2" }
{ "type": "viewtopia:click", "lng": 7.43, "lat": 43.74 }
```

Minimal host page:

```html
<iframe id="map" src="https://viewer.example.com/?live=TOKEN&embed=1" width="800" height="450"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'viewtopia:ready') {
      document.getElementById('map').contentWindow.postMessage(
        { type: 'viewtopia:flyTo', lng: 7.42, lat: 43.73, zoom: 12 }, '*');
    }
  });
</script>
```

---

## Datum Shift Grids

A `.prj` naming a datum like NAD27 needs an NTv2 grid before its coordinates can be
projected, and no grid data ships with the app. When a transform turns out to need one,
the viewer fetches `/grids/<name>` for each name projicio reports, using the name
exactly as reported (`conus`, `ntv2_0.gsb`). Those names are alternatives, so the first
one that loads is enough, and it stays registered for the life of the page.

Put the files where that path resolves:

```bash
public/grids/conus            # local dev, served by vite
```

For a deployment, mount a grids directory at `/grids/` or bake it into the image.

When no grid is served, the image overlay panel takes a `.gsb` dropped alongside the
image and its `.prj`.

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
pnpm run dev                 # Start dev server
pnpm run build               # Production build
pnpm test                    # Unit tests (vitest)
pnpm run test:e2e            # E2E tests (Playwright)
pnpm run test:e2e:react      # React suites (28 tests) on a throwaway Vite server :5175
pnpm run test:e2e:platform   # Golden path (8), real-estate (5), analysis (5); needs the stack up
pnpm run test:all            # Unit + E2E
```

`test:e2e:platform` runs against a live platform stack, so bring it up with
`scripts/platform-up.sh` first. The same golden-path suite is the CI gate in
`.github/workflows/platform-e2e.yml` (master pushes, weekly, manual). It builds
the real backends from their public repos, no tokens needed.

Platform bring-up (`scripts/`):

```bash
scripts/platform-up.sh [GEOFABRIK_URL]   # full stack + data + demo seed
node scripts/seed-parcels.mjs            # re-seed real-estate demo data only
```

Workspace bootstrap, clone every platform repo:

```bash
scripts/clone-geolang.sh  [DIR]   # macOS/Linux/Git-Bash
#   --pull   update existing repos    --https   clone GitHub repos over HTTPS
```
```powershell
.\scripts\clone-geolang.ps1 [DIR]  # Windows (PowerShell)
#   -Pull    update existing repos    -Https    clone GitHub repos over HTTPS
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
- **Backend:** [GeoLang](https://github.com/GeoLang/tiletopia) (Rust) + [GeoLang](https://github.com/GeoLang/geolang) (Python)
- **AI:** sibyl agent loop (Rust) plus the viewer's spatial tool subset
- **Analysis:** space-time entity tracks and colocation in the Analysis tab, plus the charts and SQL workspace
- **Deploy:** Docker Compose, Helm, Terraform

---

## License

AGPL-3.0-or-later, see [LICENSE](LICENSE).

Copyright (C) 2026 Grok Image Compression Inc.
