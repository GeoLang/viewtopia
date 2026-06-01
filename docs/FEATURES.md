# GeoLang Platform — Complete Feature Reference

> **Single source of truth** for all capabilities across the GeoLang ecosystem.
> Last updated: 2025-01-28

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                        │
│  ViewTopia (Web)  │  TerraVista (Mobile)  │  QGIS Plugin  │  CLI Tools │
└────────┬──────────┴───────────┬───────────┴───────┬───────┴────────────┘
         │                      │                   │
┌────────▼──────────────────────▼───────────────────▼────────────────────┐
│                        API GATEWAY                                       │
│  Fenestra (OGC: WMS/WFS/WMTS/OGC API Features)                         │
└────────┬────────────────────────────────────────────────────┬──────────┘
         │                                                    │
┌────────▼────────────────────────────────────────────────────▼──────────┐
│                      CORE SERVICES                                       │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Ptolemy  │  │TileTopia │  │ Geokode  │  │ Itinera  │  │ GeoLang │ │
│  │Geodatabase│  │3D Tiles  │  │Geocoding │  │ Routing  │  │AI Agent │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Fluvius  │  │ Geodukt  │  │ Collecta │  │  GeoGit  │              │
│  │Streaming │  │  ETL     │  │Field Data│  │ Versioning│              │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │
└──────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────────────┐
│                       ENGINES & LIBRARIES                                  │
│                                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Topoi   │  │Projicio  │  │ Terrano  │  │  Nubis   │  │  Jung    │ │
│  │ Geometry │  │   CRS    │  │ Terrain  │  │Pt. Cloud │  │Rendering │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
│  │Interiora │  │ Panoptes │  │TerraVista│                              │
│  │ Indoor   │  │ AI/CV    │  │Mobile SDK│                              │
│  └──────────┘  └──────────┘  └──────────┘                              │
└────────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────────────┐
│                        STORAGE                                             │
│  PostgreSQL + PostGIS │ S3/GCS/Azure │ Local FS │ IndexedDB (offline)     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Ptolemy — Versioned Geodatabase & Collaboration

**Port**: 3000 | **Stack**: Rust (Axum), PostgreSQL + PostGIS | **Auth**: JWT + OIDC + API Keys

### Data Management
- Dataset CRUD with schema definition
- Git-like versioning: branch, commit, merge, diff
- Changeset DAG (directed acyclic graph) with temporal history
- Three-way merge with geometry-aware conflict detection
- Feature locking (pessimistic concurrency)
- Temporal queries (features at any point in time)
- Batch operations (bulk insert/update/delete via gRPC)

### Spatial Capabilities
- PostGIS spatial queries (bbox, intersects, within, buffer)
- MVT vector tile serving per branch
- CRS transformation (reproject datasets)
- Spatial analytics: buffer, union, DBSCAN clustering, anomaly detection, statistics

### Advanced Data Structures
- **Geometric Networks**: junctions, edges, trace (upstream/downstream), shortest path, connectivity
- **Linear Referencing (LRS)**: routes, events (point/linear), locate, subline extraction
- **Raster Catalogs**: upload, spatial query, pixel value at point, band statistics
- **Domains & Rules**: coded value domains, range domains, subtypes, attribute rules with expression validation
- **Relationship Classes**: 1:1, 1:M, M:N relationships with record navigation
- **PostGIS Topology**: faces, edges, nodes, validation, simplification
- **SFCGAL 3D**: extrude, volume, 3D intersection, straight skeleton, Minkowski sum, tesselation, visibility/LOS
- **H3 Indexing**: hex cell indexing, aggregation, k-ring neighbors, compact, point→cell
- **Vector Similarity (pgvector)**: similarity search, deduplication, embedding generation, k-means clustering
- **Point Cloud (pointcloud ext.)**: catalogs, patches, spatial queries, elevation profiles
- **Trajectories (MobilityDB)**: temporal positions, speed/distance analysis, simplification, nearest approach

### Cartography & Styling
- Symbology rules (CRUD, per-dataset)
- Label rules (field expressions, placement, halos)
- Styles stored as JSONB (Mapbox GL compatible)

### Catalog & Discovery
- Full-text dataset search (pg_trgm fuzzy matching)
- Tag management (add/remove/filter)
- Dataset metadata (arbitrary JSONB)
- Multi-tenancy: organizations with members and role-based access

### Webhooks & Events
- Webhook subscriptions per dataset (create/update/delete triggers)
- HMAC-SHA256 request signing
- Exponential backoff delivery (3 retries: 1s, 2s, 4s)
- CDC event stream + SSE real-time events
- WebSocket per-branch event subscriptions

### Real-Time Collaboration
- Ephemeral room-based WebSocket relay
- View sync (camera state broadcast)
- Cursor sharing (map position)
- Presence tracking
- Real-time chat

### Review & Governance
- Pull-request-style merge reviews
- Diff visualization (geometry + attribute changes)
- Comment threads on reviews
- Approve/reject/merge workflow
- Schema validation gate
- Topology rule enforcement
- Data quality reports with auto-repair
- Audit logging (full change trail)

### Standards Compliance
- OGC API - Features (Part 1 & 2)
- CQL2 filter queries
- OGC Tiles (WebMercatorQuad, WorldCRS84Quad tile matrix sets)
- STAC 1.0 (SpatioTemporal Asset Catalog for raster discovery)

### Import/Export
- **Import**: GeoJSON, Shapefile (.shp+.dbf), GeoPackage (.gpkg) — auto-detected by extension
- **Export**: GeoJSON, CSV, FlatGeobuf
- Offline sync protocol (pull/push/status)

### Operations
- Prometheus metrics endpoint
- Graceful shutdown
- Connection pool tuning (min/max connections)
- Rate limiting
- Background job queue

### CLI Commands
- `ptolemy serve` — Start API server
- `ptolemy migrate` — Run database migrations
- `ptolemy import` — Import data (GeoJSON/Shapefile/GeoPackage)
- `ptolemy backup` — pg_dump database backup
- `ptolemy restore` — pg_restore database restore
- `ptolemy apikey create|list|revoke` — API key management

---

## 2. ViewTopia — All-in-One Geospatial Viewer & Dashboard

**Port**: 4000 (dashboard) / 5173 (viewer) | **Stack**: React/TypeScript, CesiumJS, MapLibre GL, deck.gl

### Viewers
- CesiumJS 3D globe (terrain, buildings, photogrammetry)
- MapLibre GL 2D map (vector tiles, custom styles)
- deck.gl (large-scale data visualization)
- Leaflet (lightweight 2D)
- Split View (side-by-side comparison)

### AI Agent (30+ Commands)
- Voice-driven geospatial commands
- Natural language queries
- Session persistence
- Commands: fly_to, set_view, add_marker, load_tileset, classify, add_geojson, set_time, clear_entities, screenshot

### Analysis Tools
- Measurement (distance, area, elevation)
- Terrain profiles
- Shadow analysis (sun position simulation)
- Viewshed analysis (line-of-sight)
- Routing & isochrones
- Charts & data visualization

### Space-Time Intelligence
- Entity tracking
- Colocation detection
- Co-travel analysis
- Pattern-of-life profiling
- Geofencing (enter/exit/dwell)
- Network graph visualization
- Behavioral clustering
- Predictive location estimation
- CDR (Call Detail Record) import & analysis
- Multi-format ingest: CSV, GPX, KML, GeoJSON, CDR
- Export: KML, CSV, video capture

### Data Fusion
- Multi-source data with provenance tracking
- Field conflict detection
- Entity resolution (Levenshtein distance matching)

### Plugin System (23+ Built-in)
- Real Estate, Logistics, Environmental, Construction, Agriculture, Telecom, Emergency
- QGIS-equivalent functionality
- Hot-reload plugin architecture

### Portal & Content Management
- Item catalog with sharing model (private/org/public)
- Dashboard builder (grid-based widgets)
- Projects & workspaces
- Team-level containers
- Role-based access
- Cross-device sync

### Raster Analysis
- COG (Cloud Optimized GeoTIFF) loader
- NDVI, hillshade, slope, aspect
- Band math expressions
- Contour generation
- Reclassification

### Offline-First Architecture
- IndexedDB persistence
- Operation queue with auto-sync
- Tile caching via Service Worker
- Conflict resolution (last-write-wins with manual override)

### UX Features
- Keyboard shortcuts
- Dark/light theme
- Geocoding search bar
- Coordinate readout
- Right-click context menu
- Minimap
- Print/export (PNG, PDF)
- Tours & stories (narrated presentations)
- PWA (Progressive Web App)

### Dashboard Pages
- `/dashboard/config` — Platform configuration
- `/dashboard/datasets` — Dataset catalog & discovery
- `/dashboard/layers` — Layer management
- `/dashboard/logs` — System logs
- `/dashboard/metrics` — Prometheus metrics viewer
- `/dashboard/migrations` — Database migration status
- `/dashboard/services` — Service health
- `/dashboard/styles` — Map style editor

---

## 3. TileTopia — 3D Tiles Server & Digital Twin Engine

**Port**: 3001 | **Stack**: Rust, OGC 3D Tiles 1.1, WebSocket

### 3D Tile Processing
- OGC 3D Tiles 1.1 output (batched 3D models, point clouds, implicit tiling)
- Octree spatial partitioning with LOD (Level of Detail)
- Parallel tiling across CPU cores
- GPU-accelerated point cloud decimation
- Draco & meshopt mesh compression
- View-dependent streaming

### Input Formats
- Point Clouds: LAS, LAZ, E57, PLY
- 3D Models: glTF, GLB, OBJ, FBX, IFC
- Urban: CityGML, CityJSON
- Terrain: GeoTIFF, DTED, HGT
- Vector: Shapefile, GeoJSON, KML, GeoPackage

### Digital Twin
- Real-time data injection (WebSocket)
- Temporal versioning (time-series playback)
- Entity linking (relate 3D objects to sensor data)
- 3D annotations
- Change detection
- Scripting/rules engine
- CRDT collaborative editing

### 2D Map Tiles
- XYZ raster tile serving
- Vector Tiles (MVT/PBF)
- MapLibre GL style generation
- TileJSON metadata
- Tile caching (memory + disk)

### OSM Buildings
- Building extrusion from OpenStreetMap footprints
- Tiered height profiles
- Roof shape rendering (flat, gabled, hipped, pyramidal)

### Advanced Services
- Photogrammetry (Structure from Motion / Multi-View Stereo)
- AI point cloud classification (ground, buildings, vegetation, power lines)
- Colorization from aerial imagery
- BIM 4D scheduling
- Indoor mapping
- COG (Cloud Optimized GeoTIFF)
- STAC catalog
- Geocoding
- Routing & isochrone
- Geoprocessing
- WFS
- Elevation service
- Map matching
- Static map image generation
- Drone flight planning
- Scan registration (point cloud alignment)
- Terrain analysis
- Geostatistics
- Multispectral imagery

### Enterprise Features
- Cesium Ion-compatible API (drop-in replacement)
- Asset catalog with versioning
- Multi-tenant with org isolation
- RBAC + OIDC authentication
- Audit logging
- HA clustering
- Priority queue scheduling
- Webhooks
- API key management + metering/billing
- White-label branding
- Plugin system + marketplace
- Mobile SDK
- AR/VR support
- Flythrough & narrated presentations
- Site reports (PDF generation)

### Storage Backends
- Local filesystem
- AWS S3
- Google Cloud Storage
- Azure Blob Storage

---

## 4. Geokode — Self-Hosted Geocoding Service

**Port**: 3002 | **Stack**: Rust (Axum), FST text index, R-tree spatial index

### Capabilities
- **Forward geocode**: fuzzy text matching with abbreviation expansion (St→Street, Ave→Avenue, etc.)
- **Reverse geocode**: R-tree k-nearest-neighbor lookup
- **Autocomplete**: prefix search with spatial bias (prioritize nearby results)
- **Batch geocode**: bulk address resolution
- **Address parsing**: structured decomposition (house number, street, city, state, postal code, country)

### Data Sources
- OpenAddresses (CSV import)
- GeoJSON files
- OSM PBF/XML (planet file import)
- Custom data loaders

### API
- `GET /geocode?q=` — Forward geocode
- `GET /reverse?lat=&lon=` — Reverse geocode
- `GET /autocomplete?q=` — Autocomplete
- `POST /batch` — Batch geocode
- `GET /health` — Health check

---

## 5. Itinera — Pure-Rust Routing Engine

**Port**: 3003 | **Stack**: Rust (Axum), CSR graph, Contraction Hierarchies, R-tree

### Routing Algorithms
- Dijkstra (exact shortest path)
- A* (heuristic shortest path)
- Contraction Hierarchies (sub-millisecond queries on continental graphs)

### Capabilities
- Shortest path (distance/time optimization)
- Isochrones (reachability polygons at time thresholds)
- Turn-by-turn navigation instructions
- Turn restrictions (from OSM relations)
- Multi-modal profiles: car, bicycle, pedestrian, truck

### Network Analysis
- Connected components
- Origin-Destination matrix
- Closest facility
- Betweenness centrality

### Data Import
- OSM XML
- OSM PBF (Protocol Buffer Format)

### API
- `POST /route` — Calculate route
- `GET /nearest?lat=&lon=` — Snap to nearest road
- `POST /isochrone` — Generate isochrone polygon
- `GET /health` — Health check

### Special Properties
- Zero C dependencies (no OSRM, Valhalla, or GraphHopper)
- WebAssembly (WASM) compatible
- Binary graph serialization for fast startup

---

## 6. Fenestra — OGC Services Gateway

**Port**: 3004 | **Stack**: Rust (Axum), tiny-skia (CPU), Vello/wgpu (GPU)

### OGC Standards
- **WMS** (Web Map Service): GetCapabilities, GetMap (server-side rendered images)
- **WFS** (Web Feature Service): GetCapabilities, GetFeature (bbox, attribute filtering)
- **WMTS** (Web Map Tile Service): GetCapabilities, GetTile (pre-rendered tile cache)
- **OGC API - Features**: Landing page, conformance, collections, feature CRUD

### Rendering
- CPU backend: tiny-skia (software rasterizer)
- GPU backend: Vello + wgpu (hardware-accelerated)
- MVT (Mapbox Vector Tile) encoding

### Styling
- SLD/SE (Styled Layer Descriptor / Symbology Encoding)
  - NamedLayer, Rules, Filters
  - PointSymbolizer (marks, external graphics)
  - LineSymbolizer (stroke, width, dash)
  - PolygonSymbolizer (fill, stroke)
  - TextSymbolizer (labels, fonts, halos)

### Integration
- Ptolemy backend (reads versioned datasets)
- JSON-based layer configuration
- Multi-layer composition

---

## 7. Collecta — Schema-Driven Field Data Collection

**Port**: 3005 | **Stack**: Rust (Axum), form schema engine, sync queue

### Form Schema
- 20+ field types:
  - Basic: Text, Integer, Decimal, Date, Time, DateTime
  - Selection: Select (single), MultiSelect
  - Geospatial: GeoPoint, GeoTrace, GeoShape
  - Media: Photo, Audio, Video
  - Special: Barcode, Signature, Calculate, Note, Group, Repeat

### Validation
- min/max constraints
- Regex patterns
- Required fields
- OneOf (enum values)
- Conditional visibility (show_if expressions)

### Features
- Repeat groups (nested sub-forms)
- Default values & help text
- Offline sync queue with exponential backoff
- Attachment sync (media files)
- XLSForm compatibility
- Integration with Ptolemy geodatabase

### API
- `GET /forms` — List forms
- `POST /forms` — Create form
- `GET /forms/{id}` — Get form
- `PUT /forms/{id}` — Update form
- `POST /forms/{id}/submissions` — Submit response
- `GET /forms/{id}/submissions` — List submissions
- `GET /sync/status` — Sync queue status

---

## 8. Fluvius — Real-Time Geospatial Stream Processor

**Stack**: Rust, R-tree, Kafka, MQTT, WebSocket, Prometheus

### Spatial Operators
- **Geofencing**: enter/exit/dwell triggers against polygon zones
- **Proximity alerts**: distance-based triggers between moving entities
- **Trajectory analysis**: speed, heading, stop detection, path smoothing
- **Spatial aggregation**: count/sum/avg within spatial windows
- **Map matching**: snap GPS traces to road network

### Stream Processing
- Complex Event Processing (CEP)
- Windowing: tumbling, sliding, session, count-based
- Watermarks (late event handling)
- Temporal joins
- R-tree spatial index (updated in real-time)

### Connectors
- **Input**: WebSocket, File, Kafka, MQTT
- **Output**: WebSocket, File, Kafka, MQTT

### Operations
- Checkpointing (fault tolerance)
- Replay mode (1x, 10x, 100x, max speed)
- Prometheus metrics
- TOML topology DSL (declare pipelines without code)

### CLI
- `fluvius run <topology.toml>` — Execute pipeline
- `fluvius serve` — HTTP API mode
- `fluvius geofence` — Standalone geofence monitor
- `fluvius proximity` — Proximity alert service
- `fluvius trajectory` — Trajectory processor

---

## 9. Geodukt — Declarative Geospatial ETL

**Stack**: Rust, TOML pipeline definitions, DAG execution engine

### Pipeline Definition (TOML)
- Declarative source/transform/sink definitions
- Automatic dependency resolution (DAG)
- Incremental processing (hash-based change detection)
- Lineage tracking

### Spatial Transforms
- Reproject (CRS transformation)
- Clip (spatial intersection with boundary)
- Buffer (distance-based expansion)
- Simplify (Douglas-Peucker / Visvalingam)
- Spatial join (point-in-polygon, nearest)
- Centroid
- Dissolve (aggregate by attribute)

### Format Support
- GeoJSON
- CSV (with lat/lon columns)
- GeoPackage
- FlatGeobuf
- GeoParquet

### Validation
- Geometry validity checks
- CRS verification
- Schema assertions

### Geoprocessing REST Service
- `GET /gp/catalog` — List available tools
- `POST /gp/execute` — Run geoprocessing tool

### CLI
- `geodukt init` — Scaffold new project
- `geodukt run` — Execute pipeline
- `geodukt validate` — Check pipeline definition
- `geodukt graph` — Visualize DAG

---

## 10. GeoGit — Distributed Version Control for Geodata

**Stack**: Rust, Git storage backend, MessagePack encoding

### Core Workflows
- `geogit init` — Initialize repository
- `geogit clone` — Clone remote repository
- `geogit import` — Import datasets (GeoPackage, Shapefile, PostGIS)
- `geogit export` — Export (GeoJSON, CSV, GeoPackage)
- `geogit status` — Show working copy changes
- `geogit diff` — Show feature-level changes
- `geogit commit` — Record changes
- `geogit log` — Commit history
- `geogit branch` — Branch management
- `geogit switch` — Switch branches
- `geogit merge` — Merge branches
- `geogit push` / `geogit pull` — Remote sync
- `geogit conflicts` — View/resolve conflicts

### Features
- Efficient diffs: O(changed) not O(total features)
- Git deduplication (content-addressed storage)
- Working copy as GeoPackage (editable in QGIS)
- Schema evolution via legends (handle schema changes across versions)
- Standard Git remotes (GitHub, GitLab, etc.)
- MessagePack-encoded features (compact binary format)

### Advanced
- File & document version control (arbitrary files alongside datasets)
- Dataset metadata management (ISO 19115 XML)
- License management
- Point cloud tiles (LAS/LAZ import)
- Raster tiles (GeoTIFF import)

---

## 11. Interiora — Indoor Mapping & Navigation SDK

**Stack**: Rust, graph algorithms, BLE/WiFi positioning

### Venue Modelling
- Venues (buildings/complexes)
- Floors (with elevation, display name)
- Units (rooms, corridors, open spaces)
- Openings (doors, gates, with accessibility annotations)
- Amenities (with category, floor, coordinates)

### Navigation
- Indoor graph with typed traversals: walk, elevator, stairs, escalator
- Dijkstra shortest-path routing
- Multi-floor navigation (automatic transitions)
- Accessibility-aware routing (wheelchair mode: avoids stairs/escalators)

### Positioning
- BLE/WiFi fingerprint positioning
- k-NN signal-space matching
- Signal strength → distance estimation

---

## 12. Jung — Geospatial Symbology & Cartographic Rendering Engine

**Stack**: Rust, Vello (GPU), tiny-skia (CPU), TTF parsing, WASM

### Core Rendering
- Lines: variable width, dash patterns, caps (butt/round/square), joins (miter/round/bevel), offset
- Polygons: fill, stroke, opacity
- Anti-aliasing (8x MSAA equivalent)

### Data-Driven Styling
- Property-based expressions
- Zoom-dependent interpolation (linear, exponential, step)
- Mapbox GL compatible expression engine

### Icon & Marker Rendering
- Sprite atlases (texture packing)
- Built-in shapes: circle, square, diamond, star, triangle, cross, x
- External graphic support (PNG, SVG)

### Label Engine
- Bitmap text rendering
- Word wrap & text overflow
- Collision detection (label deconfliction)
- Halo rendering (text outline)
- Curved labels (text along lines, per-character rotation)
- TrueType font rendering (TTF/OTF parsing, glyph rasterization, kerning, subpixel AA)

### Advanced Symbology
- Graduated/classified: equal interval, quantile, Fisher-Jenks (natural breaks)
- Proportional symbols
- Heatmaps
- Temporal animation
- 3D extrusion (buildings, data-driven heights)
- Clustering (point aggregation)

### Specialized Symbology
- **MIL-STD-2525**: Military symbols (warfighting, stability operations)
- **Maritime S-52/S-57**: Nautical chart symbols (lights, buoys, soundings)
- **Topographic**: Contour labeling, hillshade overlay, hypsometric tinting

### Rule-Based Cascade
- Priority ordering
- Zoom-bounded rules (min/max zoom)
- Expression-based filters

### Print Layout
- Map sheets with composition
- Legend (auto-generated from rules)
- Scale bar
- North arrow
- Inset maps
- Graticule (coordinate grid)

### Output Formats
- Raster (RGBA tiles)
- SVG (scalable vector)
- High-DPI print (300+ DPI)
- GPU (Vello real-time)
- WebAssembly (client-side rendering)

### Input Formats
- GeoJSON
- Mapbox Vector Tiles (MVT/PBF)

---

## 13. Nubis — Point Cloud Processing Engine

**Stack**: Rust, LAS I/O, Octree spatial index

### I/O
- LAS file reading (header, point records, classifications)
- LAS file writing

### Processing
- Ground filtering (progressive morphological filter)
- Thinning: random sampling, voxel-based decimation
- Statistical Outlier Removal (SOR)
- Normal estimation (per-point surface normals via local PCA)
- Classification (ASPRS LAS standard codes: ground, vegetation, building, water, etc.)

### Interpolation
- IDW (Inverse Distance Weighting) gridding
- Ordinary Kriging (geostatistical interpolation)

### Spatial Indexing
- Octree with radius queries
- Efficient nearest-neighbor search

### Geostatistics
- Variogram models: spherical, exponential, gaussian, linear, power
- Moran's I (spatial autocorrelation)
- Getis-Ord Gi* (hotspot analysis)

### CLI
- `nubis info <file.las>` — Point cloud metadata
- `nubis ground <file.las>` — Ground classification
- `nubis thin <file.las>` — Point cloud decimation

---

## 14. Panoptes — AI Feature Extraction from Geospatial Imagery

**Stack**: Rust, image processing, ML inference

### AI Models
- `buildings-v1` — Building footprint extraction
- `roads-v1` — Road network extraction
- `landcover-v1` — Land use/land cover classification
- `vegetation-v1` — Vegetation detection
- `change-v1` — Temporal change detection

### Capabilities
- Semantic segmentation (per-pixel classification)
- Object detection (bounding-box extraction)
- Change detection (temporal comparison of two images)
- Vector output (GeoJSON polygonization of raster masks)
- Multi-resolution analysis (image pyramid processing)
- Sliding window (tiled inference for large images)
- Quality metrics: IoU, pixel accuracy, confidence scores

### CLI
- `panoptes segment <image> --model <name>` — Run segmentation
- `panoptes change <before> <after>` — Detect changes
- `panoptes models` — List available models
- `panoptes evaluate <predictions> <ground_truth>` — Compute metrics

### Properties
- GDAL-free (pure Rust image decoding: GeoTIFF, PNG, JPEG)
- No Python dependency for inference

---

## 15. Projicio — Pure-Rust Coordinate Reference System Engine

**Stack**: Pure Rust (no PROJ, no GDAL, no C dependencies)

### Projections
- Web Mercator (EPSG:3857)
- Transverse Mercator / UTM (120 zones: EPSG:32601–32660, 32701–32760)
- Mercator (EPSG:3395)
- Lambert Conformal Conic (2 standard parallels)
- Albers Equal Area Conic
- Polar Stereographic

### Datum Transforms
- Helmert 7-parameter (translation + rotation + scale)
- NTv2 grid shifts (e.g., NAD27 → NAD83)

### Ellipsoids
- WGS84
- GRS80
- Clarke 1866
- International 1924
- Unit sphere

### Features
- EPSG code dispatch (auto-select projection by SRID)
- Batch transforms (array of coordinates)
- Forward and inverse projection
- Sub-meter accuracy

---

## 16. Terrano — Raster Algebra & Terrain Analysis Engine

**Stack**: Rust, GeoTIFF I/O, terrain algorithms

### Terrain Analysis
- Hillshade (azimuth + altitude angle)
- Slope (degrees, Horn's method)
- Aspect (0–360°, compass direction)
- Contour generation (at specified interval)
- Watershed delineation (D8 flow routing)
- Flow direction (D8)
- Flow accumulation
- Stream ordering (Strahler)
- Sink filling (depression removal)

### Map Algebra
- Unary operations: add constant, multiply, sqrt, abs, log
- Binary operations: add, subtract, multiply, divide, min, max (two rasters)
- Reclassification (value ranges → new values)

### Earth Observation Time-Series
- Composites: mean, median, max
- Linear trend analysis
- Change detection
- Anomaly z-scores
- Phenology (growing season metrics)
- Normalized indices: NDVI, NDWI, EVI, SAVI, NDBI, etc.

### I/O
- GeoTIFF reading/writing
- Cloud Optimized GeoTIFF (COG) with HTTP range requests

### CLI
- `terrano hillshade <dem.tif>` — Generate hillshade
- `terrano slope <dem.tif>` — Compute slope
- `terrano contour <dem.tif> --interval 10` — Extract contours
- `terrano flow <dem.tif>` — Flow direction/accumulation
- `terrano watershed <dem.tif>` — Delineate watersheds

---

## 17. TerraVista — Mobile Map SDK (iOS & Android)

**Stack**: Rust (FFI), C ABI, Metal (iOS) / Vulkan (Android)

### Core Engine
- Continuous zoom (levels 0–22)
- Bearing & pitch (3D perspective)
- Web Mercator projection
- Frame-based render command buffer

### Gesture Recognition
- Multi-touch state machine
- Pan (single finger drag)
- Pinch zoom (two finger)
- Rotate (two finger twist)
- Double-tap zoom

### Offline Tile Cache
- LRU eviction (256 MB default, configurable)
- Per-region tile pre-fetch (download areas for offline use)
- MBTiles format support
- TVPK (TerraVista Package) format

### Offline Vector Store
- GeoJSON CRUD (local feature storage)
- Sync status tracking (pending/synced/conflict)
- Bounding-box spatial queries

### Style Engine
- Mapbox GL JSON style format
- Zoom-level interpolation
- Layer types: Fill, Line, Symbol, Circle, Raster

### Turn-by-Turn Navigation
- On-device routing (no network required)
- Maneuver instructions (turn left, continue, arrive)
- Off-route detection & rerouting
- Arrival detection

### Location Service
- GPS coordinate tracking
- Haversine distance/bearing calculation
- Tracking modes: none, follow, follow-with-bearing

### Platform Bindings
- Swift (iOS/macOS) via C FFI
- Kotlin (Android) via JNI

---

## 18. Topoi — Computational Geometry Engine

**Stack**: Rust, R-tree spatial index, WebAssembly (wasm-bindgen)

### Geometry Types
- Point, LineString, Polygon, MultiPolygon, Ring, Envelope (bounding box)

### Spatial Predicates
- Point-in-polygon (winding number)
- Envelope intersection
- Contains
- Intersects
- Segment intersection

### Measurements
- Area (signed area for orientation)
- Length (perimeter, line length)
- Centroid
- Distance (point-to-point, point-to-line, point-to-polygon)

### Algorithms
- Buffering (vertex-offset polygon buffer)
- Convex hull (Graham scan, O(n log n))
- Delaunay triangulation (incremental) + Voronoi dual
- Boolean operations (polygon intersection, union)
- Polygon clipping: Sutherland-Hodgman, rectangle clip
- Simplification (Douglas-Peucker)
- R-tree spatial index (bulk loading, nearest-neighbor, range query)
- Parcel operations (subdivision, merge)

### GeoJSON I/O
- Parse GeoJSON → Geometry types
- Serialize Geometry → GeoJSON

### WebAssembly SDK (`topoi-wasm`)
All algorithms exposed to JavaScript/TypeScript:
- `convex_hull(geojson)` → GeoJSON polygon
- `buffer(geojson, distance)` → buffered GeoJSON
- `clip(geojson, bbox)` → clipped features
- `delaunay(points)` → triangle mesh
- `simplify(geojson, tolerance)` → simplified GeoJSON
- `point_in_polygon(point, polygon)` → boolean
- `polygon_intersection(a, b)` → GeoJSON
- `bounding_box(geojson)` → [minx, miny, maxx, maxy]

---

## 19. GeoLang — AI-Powered Geospatial Agent

**Port**: 8283 (internal) / 8080 (external) | **Stack**: Python 3.12+, Letta, vLLM, sentence-transformers

### Capabilities
- Natural language → geospatial operations
- Persistent agent memory (learns user preferences over sessions)
- Multi-model LLM support (XAI/Grok, Groq)
- Embedding server (vLLM + sentence-transformers)

### Viewer Commands (30+)
- `fly_to(lat, lon, zoom)` — Navigate camera
- `set_view(lat, lon, zoom, bearing, pitch)` — Set exact view
- `add_marker(lat, lon, label)` — Place marker
- `load_tileset(url)` — Load 3D Tiles
- `classify(model)` — Run AI classification
- `add_geojson(data)` — Add vector layer
- `set_time(datetime)` — Set temporal filter
- `clear_entities()` — Remove all entities
- `screenshot()` — Capture current view

### Integration
- Ptolemy (geodatabase queries)
- Geokode (geocoding)
- Itinera (routing)
- TileTopia (3D tile loading)

---

## Cross-Cutting Platform Features

### Authentication & Authorization
- JWT tokens (short-lived, refresh flow)
- OIDC SSO (Keycloak, Auth0, Azure AD, etc.)
- API keys (SHA-256 hashed, prefix-only listing)
- Role-based access: Admin, Editor, Viewer
- Multi-tenant organization model

### Deployment
- Docker Compose (full platform in one command)
- Individual service containers
- Air-gapped/offline capable
- Prometheus + Grafana monitoring
- Health check endpoints on all services

### Data Format Support (Platform-Wide)

| Format | Import | Export | Services |
|--------|--------|--------|----------|
| GeoJSON | ✓ | ✓ | Ptolemy, GeoGit, Geodukt, TileTopia, ViewTopia |
| Shapefile | ✓ | — | Ptolemy, GeoGit, TileTopia |
| GeoPackage | ✓ | ✓ | Ptolemy, GeoGit, Geodukt, TileTopia |
| FlatGeobuf | ✓ | ✓ | Ptolemy, Geodukt |
| GeoParquet | ✓ | ✓ | Geodukt |
| CSV | ✓ | ✓ | Ptolemy, Geodukt, ViewTopia |
| KML/KMZ | ✓ | ✓ | TileTopia, ViewTopia |
| GPX | ✓ | — | ViewTopia |
| LAS/LAZ | ✓ | — | TileTopia, Nubis, GeoGit |
| GeoTIFF/COG | ✓ | ✓ | Terrano, TileTopia, GeoGit |
| MVT (PBF) | — | ✓ | Ptolemy, Fenestra, TileTopia, Jung |
| glTF/GLB | ✓ | — | TileTopia |
| IFC (BIM) | ✓ | — | TileTopia |
| CityGML/CityJSON | ✓ | — | TileTopia |
| OSM PBF/XML | ✓ | — | Geokode, Itinera |
| MBTiles | ✓ | — | TerraVista |

### OGC Standards Compliance

| Standard | Service | Status |
|----------|---------|--------|
| OGC API - Features (Part 1 & 2) | Ptolemy, Fenestra | ✓ |
| WMS 1.3.0 | Fenestra | ✓ |
| WFS 2.0 | Fenestra | ✓ |
| WMTS 1.0 | Fenestra | ✓ |
| OGC 3D Tiles 1.1 | TileTopia | ✓ |
| OGC Tiles (TileMatrixSets) | Ptolemy | ✓ |
| CQL2 | Ptolemy | ✓ |
| STAC 1.0 | Ptolemy, TileTopia | ✓ |
| SLD/SE | Fenestra, Jung | ✓ |

---

## Competitive Comparison

| Capability | ArcGIS | GeoServer | Mapbox | **GeoLang** |
|-----------|--------|-----------|--------|-------------|
| Versioned geodatabase | ✓ (Enterprise) | ✗ | ✗ | ✓ (Ptolemy) |
| Branch/merge/diff | ✗ | ✗ | ✗ | ✓ (Ptolemy) |
| 3D Tiles serving | ✗ | ✗ | ✗ | ✓ (TileTopia) |
| Self-hosted geocoding | ✗ | ✗ | ✗ | ✓ (Geokode) |
| Self-hosted routing | ✗ | ✗ | Directions API | ✓ (Itinera) |
| WMS/WFS/WMTS | ✓ | ✓ | ✗ | ✓ (Fenestra) |
| Field data collection | ✓ (Field Maps) | ✗ | ✗ | ✓ (Collecta) |
| Stream processing | ✓ (GeoEvent) | ✗ | ✗ | ✓ (Fluvius) |
| ETL pipelines | ✓ (Data Interop) | ✗ | ✗ | ✓ (Geodukt) |
| AI imagery analysis | ✓ (Image Analyst) | ✗ | ✗ | ✓ (Panoptes) |
| Indoor navigation | ✓ (Indoors) | ✗ | ✗ | ✓ (Interiora) |
| Mobile SDK | ✓ (Runtime) | ✗ | ✓ (Maps SDK) | ✓ (TerraVista) |
| Natural language GIS | ✗ | ✗ | ✗ | ✓ (GeoLang AI) |
| Point cloud processing | ✗ | ✗ | ✗ | ✓ (Nubis) |
| Open source | ✗ | ✓ | Partial | ✓ (AGPL-3.0) |
| Pure Rust (no C deps) | ✗ | ✗ | ✗ | ✓ (core libs) |

---

## Docker Compose Services (Full Platform)

```yaml
services:
  db:          # PostgreSQL + PostGIS
  ptolemy:     # Geodatabase API (:3000)
  tiletopia:   # 3D Tiles server (:3001)
  geokode:     # Geocoding (:3002)
  itinera:     # Routing (:3003)
  fenestra:    # OGC Gateway (:3004)
  geolang:     # AI Agent (internal :8283)
  letta:       # LLM memory framework (:8083)
  viewtopia:   # Web viewer + dashboard (:4000)
```

Start the full platform:
```bash
docker compose -f docker-compose.platform.yml up -d
```
