# ViewTopia

ViewTopia is the GeoLang web viewer: a Cesium globe, MapLibre and Leaflet maps, a chat agent that drives the map, and analysis tools that run in the browser.

[![CI](https://github.com/GeoLang/viewtopia/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/viewtopia/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)

---

## Status

The viewer, local raster and geometry tools, DuckDB SQL, notebooks, 20 built-in
plugins, IndexedDB stores, and live maps on agora are implemented.
Project and workspace metadata is server-backed through authenticated `/api/v1`
calls. Several surfaces are local-only or depend on configured services:

- Ptolemy stores workspace and project names, descriptions, memberships, roles,
  and expiring invitation records. ViewTopia does not write this metadata or
  invitations to IndexedDB.
- Dashboard definitions belong to the active project and are stored on the server.
- Only feature property and geometry edits from the Dataset Editor go through
  the offline operation queue. No other resource is queued.
- The Geofences panel creates and lists fences, and the Space-Time Analysis tab
  finds track crossings of them. A polygon fence is stored with no vertices, so
  only a circle fence matches a point. No renderer draws a fence on the map.
- Vertical plugins read configured service datasets. They do not provide those
  datasets.
- Notebook SQL, Python and Markdown cells work. JavaScript and map action cells
  do not, see [Notebooks](#notebooks).

## Features

### Viewers
| Feature | Description |
|---------|-------------|
| **CesiumJS 3D Globe** | Full 3D globe with terrain, 3D Tiles, and imagery |
| **MapLibre GL** | GPU-accelerated 2D vector maps |
| **deck.gl** | Data visualization layers drawn into MapLibre through `@deck.gl/maplibre`. There is no standalone deck renderer to pick |
| **Leaflet** | The Map tab: 2D map with drawing and marker clustering. The globe area itself switches between Cesium and MapLibre |
| **Split View** | Two panes across or a four-pane grid, with synced cameras. Each pane picks its own renderer |

### AI Agent
| Feature | Description |
|---------|-------------|
| **Natural language queries** | "Fly to London and classify the point cloud" |
| **Session persistence** | Chat history saved and replayable |
| **GeoLang agent** | sibyl runs the agent loop and geolang serves the tools, among them `sql_query`, `ptolemy_query`, `list_tilesets`, `compute_route`, `run_qgis_algorithm` and `viewer_control` |
| **Typed actions** | 58 named viewer actions with validated parameters (panels, camera, renderer, basemap, split view, view tabs, layers, tilesets, scene, terrain, flood, travel time and spatial stats analysis, markers, data import and export, SQL attach, STAC, projects, datasets, live maps, history, scenario compare, feature search). The model is sent the catalogue and a snapshot of what the map is showing with every message, including the attributes of the feature you last clicked. A destructive action asks for a confirming reply first. Every action that takes a URL refuses anything but an absolute `http` or `https` one |
| **Markdown replies** | Replies render as GitHub-flavoured Markdown, tables and lists included |
| **File hand-off** | A dropped GeoJSON, JSON, GeoPackage, zip or CSV file is drawn in the browser and, when you are signed in, also posted to `/agent/upload` so the agent's tools can read it |
| **Chat-only mode** | `?mode=chat`, the header icon or the command palette hides the header, dock and toolbars and leaves the chat as the only control. Drawing, measuring with the cursor and picking by click still need the mouse |

### Analysis Tools
| Feature | Description |
|---------|-------------|
| **Measurement** | Distance, area, and elevation measurement |
| **Terrain Profile** | Cross-section elevation profiles |
| **Shadow Analysis** | Cesium shadow display with time controls. This is not a sun-position analysis engine |
| **Viewshed** | Line-of-sight visibility analysis |
| **Routing** | itinera point-to-point directions (public OSRM demo fallback) |
| **Travel Time** | itinera service-area bands from a point, and OD matrices between two point layers |
| **Charts** | Bar or histogram, line, and pie over a layer's attributes |
| **Simulate** | Weather and wind from open-meteo, flood level over terrain, lighting, solar irradiance, and traffic tiles from your own provider key or a labelled demo mode |

### Space-Time Intelligence
The panel tracks entities and their positions over time.

| Feature | Description |
|---------|-------------|
| **Entity Management** | Create, list and select entities (person/vehicle/device) |
| **CSV ingest** | Drop or browse a CSV with name, lat, lng, timestamp columns. Imports above 100k points are strided down and the count is reported |
| **Track Visualization** | Time scrubber and play/pause over imported positions, with a trailing time window |
| **Space-time cube** | Toggle a pitched camera where height is time, with a sweep plane at the playhead and ground shadows under each track |
| **Manual Linking** | Dialog for analyst-created entity relationships |

The Analysis tab runs eight analyses in a worker and draws each result on the map and in the cube: colocation (meeting markers), co-travel (paired track segments over a sustained window), geofence crossings (an entry or exit point per crossing), pattern-of-life (dwell rings and off-pattern events), network metrics (ranked entity list), behavioral clustering (tracks recolored by cluster), predictive location (ghost marker and projected path), and data quality (issues marked at their events).

The Geofences panel creates a named fence and lists the fences. The Geofence
Crossings analysis above is what reads them. A polygon fence is stored with no
vertices, so only a circle fence matches a point, and no renderer draws a fence.

Not implemented: ontology, CDR import, entity resolution, case management, and
classification/RBAC.

### Plugin System
| Feature | Description |
|---------|-------------|
| **Auto-discovery** | Build-time discovery of folders in `src/plugins/`, followed by runtime loading |
| **Plugin SDK** | Map control, store access, API proxy and per-plugin settings, see [Plugin Context API](#plugin-context-api) |
| **Settings UI** | Each plugin declares settings schema, rendered in Settings panel |
| **20 built-in plugins** | Seven industry verticals, eleven QGIS-equivalent tools, Panoramax street-level imagery, and one example plugin (see below) |
| **Runtime install** | More, Plugin Manager installs a plugin from a registry document, checked against a mandatory sha-256. A runtime plugin can never claim a built-in id |
| **Hot reload** | Vite HMR during development |

### Portal & Content Management
| Feature | Description |
|---------|-------------|
| **Item Catalog** | Searchable inventory of maps, layers, datasets, stories, and apps |
| **Sharing Model** | Portal items have private, organization, and public levels. Project and workspace metadata uses authenticated `/api/v1` calls |
| **Portal API** | REST-backed item CRUD with offline localStorage fallback |
| **Dashboard Builder** | Configurable widget-based dashboards (map, chart, indicator, gauge, list, rich text) |
| **Dashboard Grid** | CSS grid layout with per-widget positioning |
| **Save/Load** | A dashboard belongs to the active project and is stored under its `dashboards` state key in Ptolemy, so every member sees the same ones. Dashboards left in this browser's old `viewtopia_dashboards` key move into the first project that opens |

### Industry Verticals (Plugins)
| Plugin | Description |
|--------|-------------|
| **Real Estate** | Parcel search (APN/address/owner), comparable sales, split/merge editing |
| **Logistics** | Multi-stop delivery ordering. The fleet tab has no vehicle feed and shows an empty state |
| **Environmental** | Sensor inventory from a configured sensors dataset, server-reported status, filter by type, fly to a sensor |
| **Construction** | Survey comparison, cut/fill volumes, milestone tracking |
| **Agriculture** | NDVI field health, soil moisture, crop status |
| **Telecom** | Tower inventory, a coverage footprint from each tower's radius or radio horizon, terrain viewshed from a candidate site |
| **Emergency** | Incident dispatch, evacuation routing, affected area analysis |

None of these draw anything until the dataset they look for exists.
[docs/verticals-setup.md](docs/verticals-setup.md) lists the dataset name each
one discovers, the properties its panel reads, and every settings key.

### QGIS Plugin Equivalents (Plugins)
Eleven widely used QGIS plugins have an equivalent here:

| Plugin | QGIS Equivalent | What it does |
|--------|-----------------|--------------|
| **Basemap Catalog** | QuickMapServices | 30 tile providers, category filter |
| **OSM Downloader** | QuickOSM | Overpass API, 12 presets, custom Overpass QL |
| **Raster Classification** | Semi-Auto Classification | K-means in the browser. The ISODATA option runs the same k-means with twice the iterations, it has no split or merge step |
| **Coordinate Tools** | Lat Lon Tools | DD, DMS, DDM, UTM and Geohash, WKT and GeoJSON output |
| **Terrain Profile** | Profile tool | Open-Elevation API, SVG chart |
| **Export Map** | qgis2web | PNG, JPEG or standalone HTML, plus embed code |
| **Street View** | Street View | Google Street View and Mapillary |
| **KML Tools** | KML Tools | Import KML, KMZ and GPX, export KML |
| **Shape Tools** | Shape Tools | Geodesic circles, ellipses, sectors, arcs, lines of bearing, stars, regular polygons |
| **Point Sampling** | Point Sampling Tool | Sample several layers at points, export CSV |
| **Advanced Sketching** | Sketching Tools | Split, merge, offset, smooth, densify, simplify. Reshape, orthogonalize, extend/trim and snap are shown disabled |

Terrain and extruded buildings, which Qgis2threejs covers in QGIS, are the
Terrain and Buildings panels here rather than a plugin. The vector geoprocessing
ops are the Geoprocessing panel, described under
[Geoprocessing](#geoprocessing).

Panoramax is the twentieth built-in plugin: open street-level imagery from the
federated catalog at api.panoramax.xyz, no API key, with each picture's author
and CC-BY-SA licence shown.

### Data & Layers
| Feature | Description |
|---------|-------------|
| **Asset Catalogue** | Browse TileTopia tilesets, and add one to the globe as a layer with a row of its own. In a live map every member loads it too |
| **Cesium Ion** | Connect your Ion account and load assets |
| **OGC Layers** | Import WMS, WMTS, WFS, and XYZ tile services |
| **Image Overlay** | Drop a site plan image or PDF, place it by world file + `.prj` (projicio wasm) or two clicks, keep it as a layer |
| **Drag & Drop** | Drop GeoJSON, GPX, KML, CSV, GeoPackage, Shapefile (loose or zipped), FlatGeobuf and GeoParquet files to import. GeoPackage, Shapefile, FlatGeobuf and GeoParquet are read by DuckDB spatial and stay queryable as tables in SQL |
| **PMTiles** | Drop a `.pmtiles` archive and it is registered on the pmtiles protocol as a tile layer, MapLibre only |
| **STAC Browser** | Search a STAC catalog by bbox and date, then add an item's asset as a layer. Earth Search, Microsoft Planetary Computer and CEDA are offered before you type a URL |
| **Convert** | Write a loaded vector layer back out as GeoParquet, FlatGeobuf, PMTiles or GeoJSON, in the browser |
| **Server Tilesets** | A GeoJSON, FlatGeobuf or CSV over 50 MB is built into a vector tileset by TileTopia and drawn as tiles, MapLibre only. A gzipped GeoJSON goes to the builder whatever its size, since nothing in the browser reads one |
| **GPX/KML Import** | Track and waypoint rendering |
| **SQL** | Run DuckDB SQL over imported files and attached Parquet or CSV URLs, draw the result on the map, export CSV or GeoParquet |
| **Layer Manager** | Reorder, toggle visibility, opacity, remove |
| **GeoJSON Editor** | Edit the properties of shapes drawn in this browser |
| **Dataset Editor** | Pick a Ptolemy dataset and branch, edit a feature's properties, redraw its geometry or drag single vertices, and commit to the branch |
| **Scenario** | Draw a base branch and a scenario branch one per split-view pane, with each side's buffered coverage area and the difference between them |

### Visualization
| Feature | Description |
|---------|-------------|
| **Heatmaps** | MapLibre native heatmap layer |
| **Hex Bins** | Hexagonal aggregation. Asked for in the chat, no panel offers it |
| **Arc Diagrams** | Origin-destination arcs. Asked for in the chat, no panel offers it |
| **Scatter Plots** | Point-based scatter, from the chat or the Wind and Space-Time panels |
| **Density Grid** | Square aggregation grid in the Spatial Stats panel |
| **Style Editor** | Color by property/height/classification |
| **Feature info** | Click a feature to list its attributes, each label above its value |
| **Annotations** | Click-to-annotate with pins |
| **Bookmarks** | Save & restore camera positions |

### UX
| Feature | Description |
|---------|-------------|
| **Keyboard Shortcuts** | one-letter draw and measure tools, see [Keyboard Shortcuts](#keyboard-shortcuts) |
| **Dark/Light Theme** | Toggle with persistence |
| **Geocoding** | Place search through geokode, falling back to public Nominatim |
| **Coordinate Readout** | Live lat/lon/height under cursor |
| **Right-Click Menu** | Context actions at any location |
| **Minimap** | Overview map with viewport rectangle |
| **Export Map** | PNG or JPEG of the view with an optional title, scale bar and north arrow (the Export Map plugin) |
| **Print Layout** | Compose a page at a chosen size and margin with a title, scale bar, north arrow and layer legend, and save it as PDF. PNG and JPEG export the map image alone. Atlas mode writes one PDF page per feature of a coverage layer |
| **Tour** | 7-step onboarding walkthrough |
| **Stories** | Guided fly-through presentations, with a second presenter window |
| **Collaboration** | Room-based presence and chat over tiletopia's relay |
| **Responsive** | Mobile-friendly layout with collapsible panels |
| **PWA** | Installable web app manifest, plus a service worker that precaches the app shell and the whole Cesium runtime so the viewer boots with the origin down |

### Offline-First
| Feature | Description |
|---------|-------------|
| **Local-first storage** | Offline browser state uses IndexedDB and localStorage. Not all data is available without network |
| **Operation queue** | A Dataset Editor feature edit queues locally and commits to its Ptolemy branch on sync. Other resources have no server path and are not queued |
| **Auto-sync** | Attempts to push queued operations when the browser reconnects |
| **API response cache** | GET responses cached with TTL for offline fallback |
| **Offline areas** | The Offline panel downloads basemap tiles for the current view, from the current zoom a few levels deeper. Tiles are capped at 200 MB, and only tiles outside a saved area are dropped to get under it |
| **Sync indicator** | Real-time UI showing pending/synced/offline status |
| **Three-way merge** | On sync the branch head is read and merged against what the branch held when the feature was opened, then committed as one `update` operation |
| **Column-level resolution** | Changes to different properties merge without asking. Same-property changes on both sides open the resolver from the sync indicator, where you pick a side per property or in bulk |

### Projects & Workspaces
| Feature | Description |
|---------|-------------|
| **Workspaces** | Server-backed names, descriptions, memberships, and roles for groups of projects |
| **Projects** | Server-backed names, descriptions, roles, and map snapshots, so every member opens the same map |
| **Share by user** | Owners add known users by JWT subject with direct member roles |
| **Share by link** | Owners create expiring invite links for editor or viewer access. Links expire after seven days and store only token hashes server-side. When ptolemy has SMTP configured, the dialog can also email the link |
| **Role-based access** | Workspace access is inherited by projects. Direct project membership can grant project-only access, and the highest effective role is returned |
| **Project datasets** | Attach a Ptolemy dataset to a project, and the project's viewers read it, editors write it and owners administer it. Project roles do not reach live maps on agora |
| **Project switcher** | Header dropdown to create/switch/manage projects |
| **Offline scope** | Map snapshots and overlay bitmaps cache in the browser and sync to the server. Feature-level project data sync is not implemented |
| **Cross-device** | Project and workspace metadata, map snapshots, overlay bitmaps, and dashboards are server-backed |

### Raster Analysis
| Feature | Description |
|---------|-------------|
| **COG Loader** | Load Cloud Optimized GeoTIFFs from URL or file (with overviews) |
| **NDVI** | Normalized Difference Vegetation Index from multispectral imagery |
| **Hillshade** | Sun-angle illumination model (Horn's method) |
| **Slope** | Terrain slope in degrees or percent |
| **Aspect** | Terrain aspect (compass direction of steepest descent) |
| **Band Math** | Raster calculator over expressions with band references |
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

### Field Data, Indoor and Pipelines
| Feature | Description |
|---------|-------------|
| **Field Data** | Pick a collecta form and draw its submissions as a layer, geometry taken from the form's first geo field and falling back to the device location. Attachments show inline, and publishing copies the submissions into a Ptolemy dataset, only the new ones on a repeat call |
| **Indoor** | Load an interiora venue, switch floors, and upload an indoor map document with the editor or admin role |
| **Run History** | Every geodukt pipeline run the platform kept, not only this session's, with each run's steps, their outcomes and the manifest it ran |
| **Workflow plans** | The agent's `plan_workflow` tool streams a geodukt manifest as a plan for you to read before anything runs. Approving posts the manifest back to the approval route and then to `run_workflow`, which refuses a manifest with no approval |

### Notebooks
| Feature | Description |
|---------|-------------|
| **SQL cells** | DuckDB in the browser, with a Show on map button when the result has geometry |
| **Python cells** | Run on the stack's Jupyter service, the `scipy-notebook` image with numpy, pandas and matplotlib |
| **JavaScript and map action cells** | Not working: nothing hands the notebook its map runtime, so these cells answer "No runtime available", and nothing records map operations into a map action cell |
| **Markdown cells** | Notes inline |
| **Run All / Run Up To** | Execute notebook sequentially or partially |
| **Outputs** | Text, JSON, images, tables and errors below each cell |
| **Offline** | Notebooks are stored in IndexedDB in this browser. Python cells still need Jupyter |

### Collaboration
| Feature | Description |
|---------|-------------|
| **Rooms** | Join a named room, see who else is in it, and chat. Runs over tiletopia's `/api/v1/realtime/{room}` relay, which stores nothing |
| **Live maps** | The share button starts a live map on agora. Every member loads the same layers and tilesets, sees peer cursors, and can follow a peer's camera by clicking their avatar in the header. A share link carries view or edit access |
| **Undo** | In a live map an editor's `Ctrl+Z` and `Ctrl+Shift+Z` take back or restore their own last edit |
| **Comments** | Comment threads pinned to a point on a live map, with `@` mentions, resolving, and CSV or GeoJSON export. A bell in the header lists mentions of you |
| **Region watch** | Watch a drawn region over a geoplumb layer on a schedule, with an optional threshold that notifies the map's members and posts a webhook |

The Region Watch panel watches part of the map over time. Draw a polygon, pick
a geoplumb layer and a reducer, say how often to run and optionally a threshold
and a webhook, and agora reduces that region on its own schedule. The panel
lists each watch with its last value, the time it ran and whatever failed last,
marks the run that crossed the threshold, and shows a watch's recent readings
when you click it. Every region is outlined on the MapLibre globe for everyone
holding the map, a share link guest included.

The Live panel, reached from the share button of a live map, also manages the
map's sensor feeds and its asset rule. Creating a feed gives you a token, shown
once, that a producer sends readings with. The asset rule names the layer, the
reading kind and a colour per threshold, and every member's map recolours the
matching features as readings arrive. The layer can be a 3D tileset, in which
case the tile features carrying the same `asset_id` take the colour. Inspect
shows the clicked asset's latest value per kind and whether it is still
reporting, and a picked tile feature also shows the attributes of the ptolemy
asset it stands for. The bar along the bottom of a live map with a rule scrubs
back: pick a window, drag the slider or type a time, and every asset takes the
colour and values it had then until you press Live.

---

## Requirements

**Web app only:**

- Node.js 20 or later (CI uses 22) and pnpm, pinned in `packageManager`, so
  `corepack enable` picks the right version
- A browser with WebGL2

**Full platform, built from source:**

- Docker Engine with Compose v2.
- The sibling repos, cloned as peers of `viewtopia/`, since the compose file
  builds each backend from its checkout:
  ```bash
  scripts/clone-geolang.sh ~/src/GeoLang
  ```
  It clones every GeoLang repo the compose file builds, over SSH by default.
  `--https` clones over HTTPS and `--pull` updates repos that are already there.
- A `../geolang/.env` file. `scripts/platform-up.sh` stops without one, but it
  can be empty. sibyl reads `SIBYL_CLOUD_API_KEY` and the rest of the
  `SIBYL_CLOUD_*` and `SIBYL_LOCAL_*` model settings from it, see
  `geolang/.env.example`. Without a key, add a model later under Settings, AI
  Model: an xAI or Anthropic key, any OpenAI-compatible base, or a local
  OpenAI-compatible server.
- Several GB of disk for the images (the geolang image carries QGIS) and the
  OSM extract.
- bash for `scripts/`.

No GPU is needed, except for dictation.

**Build-time variables** (Vite reads them when the bundle is built):

| Variable | What it does |
|----------|--------------|
| `VITE_CARTO_API_KEY` | Key for the Carto raster basemaps. The Cesium globe and the Leaflet Map tab draw Carto rasters in place of the Dark, Liberty, Bright and Positron vector styles, and the Basemap Catalog lists three Carto entries. Without a key those tiles carry an "API KEY REQUIRED" watermark from about zoom 13. Request one at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey). Put it in `viewtopia/.env` for `pnpm run dev` and in `.env.platform` for the compose build |
| `VITE_PLUGIN_REGISTRY_URL` | Default registry document for More, Plugin Manager, see [docs/plugins.md](docs/plugins.md#runtime-plugins) |

## Developing on Windows

The frontend runs natively on Windows and the backends run as Linux containers
under Docker Desktop. No WSL distro is needed.

### 1. Install the prerequisites

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Docker.DockerDesktop
corepack enable
```

Docker Desktop's engine runs inside a logged-in Windows desktop session, and its
first launch may ask to enable virtualization and reboot. You can drive `docker`
over SSH, but only while Docker Desktop is running in a desktop session. A Linux
host with native Docker has no such requirement, see
[On Linux (Fedora)](#on-linux-fedora).

### 2. Clone the platform repos

From Git Bash:

```bash
scripts/clone-geolang.sh /c/src/GeoLang
```

`scripts/clone-geolang.ps1` also exists, but it clones geolang from a private
GitLab SSH alias (`gitlab-rsa`) instead of GitHub and adds a `letta` checkout,
so use the bash script.
Then create `C:\src\GeoLang\geolang\.env`, see [Requirements](#requirements).

### 3a. Frontend only

```powershell
cd C:\src\GeoLang\viewtopia
pnpm install
pnpm run dev          # http://localhost:5173
```

### 3b. Full platform

With Docker Desktop running, from Git Bash:

```bash
cd /c/src/GeoLang/viewtopia
bash scripts/platform-up.sh   # http://localhost:5174
```

The Rust services also build natively with [rustup](https://rustup.rs).
geolang needs QGIS and GDAL, so run it from its container.

### Caveats

- Share the drive that holds the repos with Docker Desktop (Settings, Resources,
  File Sharing) so the bind mounts of `../geolang`, `./data` and `./deploy` work.
- Run `git config --global core.autocrlf input` so shell scripts and config
  files keep LF line endings.
- Docker Desktop ignores the `:z` SELinux labels in the compose file.

## Quick Start

```bash
git clone https://github.com/GeoLang/viewtopia.git
cd viewtopia
pnpm install
pnpm run dev
# http://localhost:5173, which proxies /agent, /agora, /api, /ogc, /plumb,
# /tiles, /jupyter, /ws and /speech to a platform stack on 5174
```

The viewer loads with no stack behind it. It probes each backend's health route
on load and again when the network comes back.

### Self-hosting from published images

To run the platform rather than develop on it, you need none of the checkouts
below. Every tagged release carries a `geolang-platform-<tag>.tar.gz` bundle on
the [releases page](https://github.com/GeoLang/viewtopia/releases): the two
compose files, `deploy/`, the fetch and seed scripts, and a README with the
five commands. It runs the whole stack from `ghcr.io/geolang/*` images, so the
only prerequisite is Docker Engine with Compose v2.

The AWS deployment is a Terraform stack in
[infrastructure](https://github.com/GeoLang/infrastructure). Its README covers
the first deploy, scaling the stack up and down, and redeploying a service
after a change.

### Full platform from source

The platform compose file builds each backend from its sibling repository.
Clone them with `scripts/clone-geolang.sh` (see [Requirements](#requirements)),
or clone every repo the compose file has a build context for as a peer of
`viewtopia/`:

```
src/GeoLang/
├── agora/        # Live maps, presence, region watches
├── collecta/     # Field data collection
├── fenestra/     # OGC gateway
├── geodukt/      # Pipeline runs
├── geokode/      # Geocoding
├── geolang/      # Agent tools and API (Python + QGIS)
├── geoplumb/     # Windowed raster and vector compute
├── interiora/    # Indoor maps
├── itinera/      # Routing
├── ptolemy/      # Versioned geodatabase
├── sibyl/        # Agent loop (Rust)
├── tiletopia/    # 3D Tiles, terrain, auth
└── viewtopia/
```

One script brings up the whole stack for any region. Pass a
[Geofabrik](https://download.geofabrik.de) extract URL, Monaco is the default:

```bash
bash scripts/platform-up.sh \
  https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf
# http://localhost:5174
```

`platform-up.sh` writes `PLATFORM_JWT_SECRET` and `GEOLANG_EXECUTOR_SECRET` into
`.env.platform` on first run and reuses them after, fetches the extract to
`data/region.osm.pbf`, builds, waits for geokode and itinera to answer (itinera
builds its routing graph on first start), and seeds the real-estate demo.

Run it again with a different extract URL and it downloads the new pbf, deletes
`data/graph.bin` so itinera rebuilds it, recreates geokode so it re-imports its
addresses, and moves the demo parcels to the new region. The same URL again
skips all of that. A city or state extract keeps the download and graph build
short, a country or continent takes much longer.

Every later compose command needs the secrets file, or ptolemy and tiletopia
refuse to start:

```bash
docker compose --env-file .env.platform -f docker-compose.platform.yml up -d --build
```

**Dictation** (optional): the chat's mic button needs the `aavaaz` speech
service, built from an [Aavaaz](https://github.com/boxerab/aavaaz) checkout at
`../../Aavaaz` and an NVIDIA GPU with the nvidia container runtime. It sits
behind the `speech` compose profile, so a plain `up` skips it. `platform-up.sh`
turns it on when the checkout and a working `nvidia-smi` are both there. By
hand:

```bash
docker compose --env-file .env.platform -f docker-compose.platform.yml --profile speech up -d --build aavaaz
```

`SPEECH_MODEL` picks the whisper model (default `large-v3-turbo`). The mic
button appears once `/speech/health` answers.

#### On Linux (Fedora)

Native Docker Engine runs as a systemd service, so the stack works over plain
SSH with no desktop session.

```bash
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # log out and in once to drop sudo
bash scripts/platform-up.sh       # from the viewtopia/ checkout
```

`docker-ce` comes from Docker's own dnf repository. Fedora's `moby-engine` and
`docker-compose` packages work too.

**Services:**

| Service | Host port | Notes |
|---------|-----------|-------|
| PostGIS | 5432 | PostgreSQL + PostGIS |
| Ptolemy | 3000 | Versioned feature store |
| Geokode | 3001 | Geocoder, imports `data/region.osm.pbf` |
| Itinera | 3002 | Router and isochrones, builds `data/graph.bin` from `data/region.osm.pbf` |
| Fenestra | 3003 | WMS, WFS, WMTS and WCS gateway |
| TileTopia | 3100 | 3D Tiles, terrain, assets, auth, portal, terrain analysis, realtime rooms |
| GeoLang API | 8080 | Agent API. Tool code runs in `geolang-executor`, which has no host port |
| Sibyl | 8090 | Agent loop, published for the admin dashboard's health probe |
| ViewTopia | 5174 | Web app and the nginx proxy in front of everything |
| Agora | none | Live maps, presence, sensor feeds and region watches |
| GeoPlumb | none | Windowed raster and vector compute |
| Interiora | none | Indoor maps |
| Collecta | none | Field data collection over OpenRosa |
| GeoDukt | none | Pipeline runner and run history |
| Jupyter | none | Python notebook kernels |
| aavaaz | none | Speech to text, `speech` profile only |

The app only talks to nginx on 5174, same-origin. Routes:

| Path | Service |
|------|---------|
| `/api/`, `/ws/`, `/api/v1/sse`, `/api/v1/auth/oidc/` | Ptolemy |
| `/api/v1/auth/`, `/api/v1/portal/`, `/api/v1/realtime/` | TileTopia |
| `/tiles/` (including `/tiles/v1/analysis`), `/martin/` | TileTopia |
| `/api/route`, `/api/isochrone`, `/api/network/`, `/api/delivery/` | Itinera |
| `/api/geocode/` | Geokode |
| `/agent/` | GeoLang API |
| `/api/pipeline/runs` | GeoDukt run history. Its `/run` is not proxied |
| `/agora/` | Agora |
| `/plumb/` | GeoPlumb |
| `/collecta/` | Collecta |
| `/api/indoor/` | Interiora |
| `/speech/` | aavaaz |
| `/jupyter/` | Jupyter |
| `/ogc/` | Fenestra. WMS is `/ogc/wms` and OGC API Features is `/ogc/ogc/collections`, since fenestra adds its own prefix |

Fenestra's WMTS and OGC API responses carry absolute URLs, so serving the stack
anywhere but `localhost:5174` needs `FENESTRA_PUBLIC_URL=<origin>/ogc`.

**Data by hand.** `platform-up.sh` does all of this. To change the region
yourself:

```bash
scripts/fetch-osm-extract.sh https://download.geofabrik.de/europe/monaco-latest.osm.pbf data/region.osm.pbf
rm -f data/graph.bin   # itinera only rebuilds a missing graph
docker compose --env-file .env.platform -f docker-compose.platform.yml restart geokode itinera
```

Seed data, each against a running stack:

```bash
node scripts/seed-parcels.mjs   # demo parcels and sales, anchored on the region's geocoded addresses
node scripts/seed-twin.mjs      # digital twin demo: twelve assets, a live map with a temperature rule, a feed token
uv run scripts/load-toronto.py  # City of Toronto parcels and 2021 census areas, see docs/real-estate.md
```

Geokode also reads an OpenAddresses CSV (`LON,LAT,NUMBER,STREET,CITY,REGION,POSTCODE`)
when its `--data` flag points at one. A sample is at `data/addresses.csv`.

**Troubleshooting:**

```bash
# "failed to set up container networking ... network not found": a stopped
# container from another compose project still points at a deleted network.
# platform-up.sh already runs the down.
docker compose --env-file .env.platform -f docker-compose.platform.yml down --remove-orphans
docker network prune -f
docker container prune -f
docker compose --env-file .env.platform -f docker-compose.platform.yml up -d --build

# after editing deploy/nginx-platform.conf, no recreate needed
docker compose --env-file .env.platform -f docker-compose.platform.yml exec viewtopia nginx -s reload
```

### All-in-one container

Ptolemy, Fenestra, TileTopia and PostGIS in one image, with no agent and no
viewer. Build it from the directory that holds the ptolemy, fenestra, tiletopia
and viewtopia checkouts. Ptolemy and TileTopia refuse to start without a JWT
secret of 32 bytes or more, so pass the same one under both names:

```bash
docker build -f viewtopia/Dockerfile.allinone -t geolang-allinone .
SECRET=$(openssl rand -base64 48)
docker run -e PLATFORM_JWT_SECRET="$SECRET" -e TILETOPIA_JWT_SECRET="$SECRET" \
  -p 3000:3000 -p 3003:3003 -p 3100:3100 -p 5432:5432 geolang-allinone
# Ptolemy :3000, Fenestra :3003, TileTopia :3100, PostGIS :5432
```

### Admin dashboard

A separate Next.js app with its own lockfile:

```bash
cd dashboard
pnpm install
pnpm run dev
# http://localhost:4000: service health, container logs, metrics, migrations, config
```

---

## Architecture

[DESIGN.md](DESIGN.md) covers the platform topology, what each service does,
ViewTopia's internals and the source module map. Start at
[Current architecture](DESIGN.md#2-current-architecture-as-built).

---

## Collaboration Guide

A room carries presence and chat over tiletopia's relay, which stores nothing.
Peer cursors and camera-follow belong to a live map instead, where a peer
avatar in the header is the follow control.

On the platform stack rooms need no setup: the tiletopia URL in Settings
defaults to `/api/v1`, which nginx routes to tiletopia. Point it at another
origin, for example `https://tiletopia.example.com/api/v1`, to use a tiletopia
elsewhere.

Open Tools, Collaborate, enter a display name and any room id, and click Join
Room. Everyone in the same room shows in the user list and sees the chat.

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

`?mode=chat` is the other chrome-free URL: the map fills the window and the
chat is the only control. The header icon and the command palette set the same
mode, and toggling either way rewrites the URL, so a reload stays where it was.

The rest of the URL scheme: `?live=TOKEN` opens a live map from a share link,
`?invite=TOKEN` joins the project the invite names once you are signed in, and
`?presenter=1` is the second window Stories opens for the presenter view.
`#cam=lng,lat,height,heading,pitch&renderer=...` lands a reader at a fixed view.

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
        { type: 'viewtopia:flyTo', lng: 7.42, lat: 43.73, zoom: 12 }, '*')
    }
  })
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

Plugins are discovered at build time: a folder in `src/plugins/` with an
`index.tsx` that default-exports a `PluginDefinition` shows up in the toolbar.

### Creating a Plugin

```bash
mkdir src/plugins/my-plugin
```

```tsx
// src/plugins/my-plugin/index.tsx
import type { PluginDefinition, PluginContext } from '../sdk'

function MyPanel({ ctx }: { ctx: PluginContext }) {
  return (
    <div>
      <button onClick={() => ctx.map.flyTo(-73.9, 40.7, 14)}>Fly to NYC</button>
    </div>
  )
}

export default {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  category: 'plugins',
  Panel: MyPanel,
  settings: [
    { key: 'apiKey', label: 'API Key', type: 'text', defaultValue: '' },
  ],
} satisfies PluginDefinition
```

### Plugin Context API

| Property | Description |
|----------|-------------|
| `ctx.map.flyTo(lng, lat, zoom?)` | Fly the camera to coordinates |
| `ctx.map.addGeoJsonLayer(id, geojson, options?)` | Add a data layer |
| `ctx.map.removeLayer(id)` | Remove a layer |
| `ctx.map.fitBounds([west, south, east, north])` | Fit view to bounding box |
| `ctx.map.getCursorCoords()` | Cursor lat, lng and elevation |
| `ctx.map.onMapClick(cb)` | Subscribe to map clicks, returns an unsubscribe |
| `ctx.store.getLayers()` | Current layer list |
| `ctx.store.getActivePanel()` | Id of the open panel |
| `ctx.store.getBasemap()` | Current basemap id |
| `ctx.store.setCustomBasemap({url, attr})` | Switch the viewers to custom raster tiles |
| `ctx.store.getRenderer()` | Current renderer, `cesium` or `maplibre` |
| `ctx.store.getSettings()` | App settings |
| `ctx.api.fetch(path, options?)` | Proxied fetch to the platform API |
| `ctx.api.baseUrl` | The platform API base URL |
| `ctx.settings.get(key, default?)` | Read a plugin setting |
| `ctx.settings.set(key, value)` | Write a plugin setting to localStorage |
| `ctx.settings.getAll()` | Every setting of this plugin |
| `ctx.close()` | Close the plugin panel |

See [docs/plugins.md](docs/plugins.md) for the full guide, including runtime
plugins installed from a registry.

---

## Scripts

```bash
pnpm run dev                 # dev server on 5173
pnpm run build               # production build, fetches the DuckDB spatial extension first
pnpm run preview             # serve the build
pnpm run lint                # biome
pnpm run lint:fix            # biome, applying safe fixes
pnpm test                    # unit tests (vitest)
pnpm run test:watch          # vitest in watch mode
pnpm run test:e2e            # Playwright against a Vite server on 5174
pnpm run test:e2e:react      # React suites on a Vite server on 5175
pnpm run test:e2e:platform   # against the live platform stack on 5174, golden path included
pnpm run test:e2e:sweep      # panel and plugin sweeps
pnpm run test:e2e:panels     # per-panel suites
pnpm run test:all            # unit, then E2E
```

`test:e2e:platform` runs against a live platform stack, so bring it up with
`scripts/platform-up.sh` first. The same suite is the CI gate in
`.github/workflows/platform-e2e.yml`, on master pushes that touch more than
Markdown, weekly, and on manual dispatch. It builds the backends from their
public repos and needs no secrets.

Shell and Node scripts in `scripts/`:

```bash
scripts/platform-up.sh [GEOFABRIK_URL]          # full stack, data and demo seed
scripts/clone-geolang.sh [--pull] [--https] [DIR]   # clone every GeoLang repo, default ./GeoLang
scripts/fetch-osm-extract.sh URL DEST           # Geofabrik download checked against its md5
scripts/upgrade-test.sh OLD_IMAGE NEW_IMAGE     # write a dataset with one ptolemy image, start the other on the same database, check the features survive
scripts/fetch-basemap-assets.sh                 # refresh the vendored protomaps glyphs and sprites in public/basemaps-assets
node scripts/seed-parcels.mjs                   # real-estate demo data only
node scripts/seed-twin.mjs                      # digital twin demo
uv run scripts/load-toronto.py                  # Toronto parcels and census areas
```

`upgrade-test.sh` needs docker, jq and openssl. The two Node seed scripts reach
ptolemy at `PTOLEMY_URL` (default `http://localhost:3000`), and
`load-toronto.py` takes `--ptolemy-url`. All three sign their requests with
`PLATFORM_JWT_SECRET`, from the environment or from `.env.platform`.

---

## Keyboard Shortcuts

Bare letters open the tool's panel and arm that mode. The same letter again
disarms it. None of them fire while a text field has focus. Embeds have no
shortcuts, chat mode keeps only `Ctrl+.`, and view-only links drop the draw
keys and `Ctrl+B`.

| Key | Action |
|-----|--------|
| `P` | Draw point |
| `L` | Draw line |
| `G` | Draw polygon |
| `C` | Draw circle |
| `R` | Draw rectangle |
| `M` | Measure distance |
| `A` | Measure area |
| `T` | Space-time panel |
| `Ctrl+B` | Show or hide the chat |
| `Ctrl+.` | Hide the chrome, map only |

---

## Stack

- **Frontend:** Vite, React + Mantine UI, CesiumJS, deck.gl, MapLibre GL, Leaflet, DuckDB-WASM, Apache Arrow
- **Backend:** [tiletopia](https://github.com/GeoLang/tiletopia), [ptolemy](https://github.com/GeoLang/ptolemy), [agora](https://github.com/GeoLang/agora), [itinera](https://github.com/GeoLang/itinera), [geokode](https://github.com/GeoLang/geokode), [fenestra](https://github.com/GeoLang/fenestra), [geoplumb](https://github.com/GeoLang/geoplumb), [interiora](https://github.com/GeoLang/interiora), [collecta](https://github.com/GeoLang/collecta), [geodukt](https://github.com/GeoLang/geodukt) (Rust) + [geolang](https://github.com/GeoLang/geolang) (Python)
- **AI:** [sibyl](https://github.com/GeoLang/sibyl) agent loop (Rust), geolang's tools, and the viewer's 58 actions
- **In the browser:** topoi, projicio and terrano compiled to WASM (vendored under `src/toolbox/wasm`, `src/overlay/wasm` and `src/raster/wasm`)
- **Deploy:** Docker Compose here. The Terraform for AWS is in [infrastructure](https://github.com/GeoLang/infrastructure)

---

## Build Status

The CI workflow of every GeoLang repo, on its default branch. infrastructure has no CI, its badge is the Terraform workflow. GeoLang.github.io, proj4rs and renovate-config have no workflow.

| Repo | Build |
|------|-------|
| [agora](https://github.com/GeoLang/agora) | [![agora](https://github.com/GeoLang/agora/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/agora/actions/workflows/ci.yml) |
| [collecta](https://github.com/GeoLang/collecta) | [![collecta](https://github.com/GeoLang/collecta/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/collecta/actions/workflows/ci.yml) |
| [fenestra](https://github.com/GeoLang/fenestra) | [![fenestra](https://github.com/GeoLang/fenestra/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/fenestra/actions/workflows/ci.yml) |
| [fluvius](https://github.com/GeoLang/fluvius) | [![fluvius](https://github.com/GeoLang/fluvius/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/fluvius/actions/workflows/ci.yml) |
| [geodukt](https://github.com/GeoLang/geodukt) | [![geodukt](https://github.com/GeoLang/geodukt/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/geodukt/actions/workflows/ci.yml) |
| [geogit](https://github.com/GeoLang/geogit) | [![geogit](https://github.com/GeoLang/geogit/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/geogit/actions/workflows/ci.yml) |
| [geokode](https://github.com/GeoLang/geokode) | [![geokode](https://github.com/GeoLang/geokode/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/geokode/actions/workflows/ci.yml) |
| [geolang](https://github.com/GeoLang/geolang) | [![geolang](https://github.com/GeoLang/geolang/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/geolang/actions/workflows/ci.yml) |
| [geoplumb](https://github.com/GeoLang/geoplumb) | [![geoplumb](https://github.com/GeoLang/geoplumb/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/geoplumb/actions/workflows/ci.yml) |
| [infrastructure](https://github.com/GeoLang/infrastructure) | [![infrastructure](https://github.com/GeoLang/infrastructure/actions/workflows/terraform.yml/badge.svg)](https://github.com/GeoLang/infrastructure/actions/workflows/terraform.yml) |
| [interiora](https://github.com/GeoLang/interiora) | [![interiora](https://github.com/GeoLang/interiora/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/interiora/actions/workflows/ci.yml) |
| [itinera](https://github.com/GeoLang/itinera) | [![itinera](https://github.com/GeoLang/itinera/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/itinera/actions/workflows/ci.yml) |
| [jung](https://github.com/GeoLang/jung) | [![jung](https://github.com/GeoLang/jung/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/jung/actions/workflows/ci.yml) |
| [nubis](https://github.com/GeoLang/nubis) | [![nubis](https://github.com/GeoLang/nubis/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/nubis/actions/workflows/ci.yml) |
| [panoptes](https://github.com/GeoLang/panoptes) | [![panoptes](https://github.com/GeoLang/panoptes/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/panoptes/actions/workflows/ci.yml) |
| [projicio](https://github.com/GeoLang/projicio) | [![projicio](https://github.com/GeoLang/projicio/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/projicio/actions/workflows/ci.yml) |
| [ptolemy](https://github.com/GeoLang/ptolemy) | [![ptolemy](https://github.com/GeoLang/ptolemy/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/ptolemy/actions/workflows/ci.yml) |
| [sibyl](https://github.com/GeoLang/sibyl) | [![sibyl](https://github.com/GeoLang/sibyl/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/sibyl/actions/workflows/ci.yml) |
| [terrano](https://github.com/GeoLang/terrano) | [![terrano](https://github.com/GeoLang/terrano/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/terrano/actions/workflows/ci.yml) |
| [terravista](https://github.com/GeoLang/terravista) | [![terravista](https://github.com/GeoLang/terravista/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/terravista/actions/workflows/ci.yml) |
| [tiletopia](https://github.com/GeoLang/tiletopia) | [![tiletopia](https://github.com/GeoLang/tiletopia/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/tiletopia/actions/workflows/ci.yml) |
| [topoi](https://github.com/GeoLang/topoi) | [![topoi](https://github.com/GeoLang/topoi/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/topoi/actions/workflows/ci.yml) |
| [verne](https://github.com/GeoLang/verne) | [![verne](https://github.com/GeoLang/verne/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/verne/actions/workflows/ci.yml) |
| [viewtopia](https://github.com/GeoLang/viewtopia) | [![viewtopia](https://github.com/GeoLang/viewtopia/actions/workflows/ci.yml/badge.svg)](https://github.com/GeoLang/viewtopia/actions/workflows/ci.yml) |

---

## License

AGPL-3.0-or-later, see [LICENSE](LICENSE).

Copyright (C) 2026 Grok Image Compression Inc.
