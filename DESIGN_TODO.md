# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — completed items move to DESIGN.md (§4 history log).
> Last brought current: **2026-07-30**.

---


## OPEN — platform hygiene

- [ ] **drop the `geolang-pgdata` volume.** Kept as a rollback artifact when the
      embedded Letta server and its postgres were removed for sibyl. Nothing reads
      it, and the rollback it insures against is long past. Delete it once nobody
      wants the old sessions back.
- [ ] **tiletopia multi-node HA (raft)** — future reference, no open work. The
      openraft half of cluster.rs was deleted 2026-07-27: it was a never-compiled
      textbook key-value example wired to nothing (no transport, no discovery, no
      real server state through it). The single-process leader election that
      actually runs remains. If clustering ever becomes a requirement, design it
      around what needs replicating (catalog and auth state via Raft; tile data
      needs shared/object storage regardless) instead of resurrecting the deleted
      scaffolding.
- [ ] **tiletopia CloudFront default behavior caches authenticated responses ~1h**
      (post-MVP decision): Authorization is in the cache key so no cross-user leak,
      but a revoked token's responses keep serving until TTL. Clean fix: split the
      two public tile patterns into an aggressive-TTL behavior, default to TTL 0.
- [ ] **CloudFront realtime WS untested**: auth rides Sec-WebSocket-Protocol, which
      the distribution never forwards explicitly; collab may fail closed through the
      CDN. Test on a live distribution before relying on it.

## OPEN — post-MVP: tiletopia tile edge caching (decided 2026-07-28)

- [ ] The CloudFront `/tiles/v1/*` cache behaviors have never matched a real
      tiletopia route, so tiles are not edge-cached on AWS (they ride the safe
      TTL-0 default). Aliasing the API under `/tiles/v1/` is blocked three ways:
      tiletopia's `is_public_read` treats any path containing `/tiles/` as
      public (the alias would expose the whole authenticated GET surface),
      routes are registered with absolute paths, and four handlers emit
      absolute `/api/v1` URLs in responses. Viable designs, pick one post-MVP:
      host-based `tiles.<domain>` routing (native ALB support, but CORS and
      viewer URL changes), or first rewrite `is_public_read` to anchored
      prefix matches, then the route/URL refactor. A dead-behavior TODO sits
      in infrastructure/modules/cdn/main.tf until then.

## OPEN — deferred decision: private-asset tile gating

- [ ] tiletopia serves every asset's tiles publicly (`is_public_read`), even
      for private assets: anyone holding the asset id can read them. The
      aggressive CloudFront TTLs on tile paths depend on tiles staying
      public. If private assets ever need gated tiles, decide together:
      per-asset visibility check in the tile path AND a CDN redesign
      (authenticated tiles cannot keep the shared long-TTL cache).

## OPEN: NL agent as plan substrate (decided 2026-07-29)

Decision: the NL agent's differentiator is trust with local open models. Instead
of free-form sequential tool calls, the model emits a geodukt manifest as the
execution plan: visible before running, validated, lineage-tracked, rerunnable,
results downloadable via the new GeoPackage/Shapefile sinks. Three spec items
(typed tools, visible plans, provenance) collapse into this one substrate.
Order: substrate first, eval harness alongside, permission propagation before
anything multi-user ships, local packaging last.

- [~] **geodukt as plan substrate**: plan-then-approve flow shipped (see the
      history log). Still open: sql_query is only persona-discouraged, not
      labeled as a gated escape hatch in the rendered plan.
- [ ] **permission-aware enforcement (blocks multi-user)**: the caller's JWT now
      reaches ptolemy/tiletopia/geodukt (history log), so ptolemy's real RBAC
      applies, and as of 2026-07-30 it applies to writes too (history log): every
      mutating route runs the write ladder, so an editor grant no longer implies
      write access to every dataset. What is still missing is enforcement at the
      other end: tiletopia RBAC is type stubs, collecta checks nothing, and
      geolang's own `/tools` endpoint is unauthenticated, so anyone who can reach
      it runs tools as whatever token they present (no escalation, but no audit
      either). Security-sensitive work.
      Note: geodukt's `/run` gate is opt-in via `GEODUKT_JWT_SECRET`, unset in
      the local compose (owner decision 2026-07-29). Gating it by default meant
      an unauthenticated viewer session could not run a workflow at all, and the
      model answered the 401 by improvising with sql_query and the raw geopandas
      tools. Set it before this ships multi-user.
- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.
- [ ] **agent-requested shading**: the user can shade a layer by a numeric field
      now, but must pick it by hand every time, even though the tool that wrote
      the layer knows which column matters (`gap_score`, `overall_risk`). Needs an
      optional classification field in the ui_spec layer format, geolang's
      emit_ui_spec schema and the persona. Do this before letting the tool prose
      mention shading again.
- [ ] **cross-session run history**: geodukt keeps every run with its manifest,
      steps and caller, at `GET /runs`, and nothing exposes it. The executed plan
      is visible only in the session that ran it. Needs a proxied route plus a
      list view, and an access decision first: records name users, and geodukt
      gates only `/run`, not `/runs`.

## OPEN — ptolemy: what the write guard still leaves open (2026-07-30)

The runtime gate and the compile-time guard both shipped (history log). What is
left is the edges neither reaches.

- [ ] `ci/no-raw-writes.sh` cannot see a mutating Postgres function called through
      `SELECT`. `topology.rs` does exactly that (`SELECT topology.CreateTopology`,
      `AddFace`, `TopoGeom_addElement`), so those three routes are guarded only by
      being instance-admin-only in `auth.rs`. If topology is ever bound to a
      dataset, they need the ladder and the check needs to learn about them.
- [ ] `unguarded_pool()` exists because the CLI and the test fixtures are separate
      crates and could not use a crate-private accessor. Nothing in ptolemy-api may
      name it and the CI check enforces that, but it is a named accessor rather
      than a barrier. Revisit if the CLI ever grows a path that should be laddered.
- [ ] `/permissions` (4 routes) is the one place the write layer is deliberately
      absent from routes that write, because `require_dataset_admin` in rbac.rs is
      the stricter gate and running the ladder too would deny a dataset admin the
      exact case they need. That makes rbac.rs solely responsible for grant
      management; worth a second pair of eyes before multi-user.
- [ ] A dataset with zero permission rows accepts any editor even on laddered
      routes (documented compatibility rule in permission.rs). Datasets created
      before the creator auto-grant existed are therefore open. Decide whether to
      backfill grants or drop the rule before this ships multi-user.
- [ ] None of the above holds when `PTOLEMY_AUTH_DISABLED=true`: the ladder and
      the visibility layer both no-op by design.

## OPEN — ptolemy: a schema/query check in CI (2026-07-30)

Four feature families shipped querying columns their tables do not have (history
log). Three were found by accident and the fourth fell out of unrelated security
work, which is the argument for the check rather than for more reading.

- [ ] Compile-time query verification is not in use here, so nothing catches a
      handler that names a column the migrations never create. A CI check that
      runs every mounted route against a migrated database, or turns on sqlx's
      offline query checking, would end the class.
- [ ] The trajectory analytics routes (speed, distance, at, simplify,
      nearest-approach) are still MobilityDB-only and 500 on stock PostGIS, which
      is what CI and the compose stack run. Either gate them behind a capability
      check that answers 501, or install MobilityDB somewhere they are exercised.
- [ ] The relationship API still cannot express `is_composite`, though the column
      exists. Feature gap, not a bug.

## OPEN — verne: get your data out (named 2026-07-29, v0.1 shipped same day)

Rationale: lock-in, not features, is what stops an org moving off an incumbent
platform, and nothing in the tree reads a proprietary project or enterprise
database from one today. Vendor-neutral by design: a common core (connect,
inventory, report fidelity, extract) with a thin adapter per source, so no single
vendor shapes the architecture. Candidate adapters in rough order of demand: the
large enterprise GIS suites, the photogrammetry and reality-capture stacks, the
CAD-adjacent platforms, the earth-browser exports, and the legacy desktop
formats. Per-source feasibility must be checked against GDAL's driver list before
any adapter is committed to; do not assume a reader exists.

A new repo rather than geodukt, because the dependency surface (GDAL with
optional drivers, REST/token auth, possibly ODBC and vendor database clients) and
the risk profile (it holds customer credentials) should not land on every geodukt
user. It emits GeoPackage/Parquet plus a semantics sidecar; geodukt and ptolemy
consume that through the source interface they already have.

Rust (owner decision 2026-07-29), consistent with the rest of the platform. GDAL
being C++ does not argue against it: GDAL exposes a stable C API, which is what
every binding wraps. Two constraints that follow, because verne would be the
first GDAL dependency here and the only native geo dependency today is geodukt's
PROJ, which vendors through cmake and is why that image takes minutes to build:

- GDAL stays behind one crate or adapter trait, feature-gated, so the core and
  its tests compile without it. Several adapters need no GDAL at all (hosted
  service APIs, KML/KMZ, JSON project files), and those should not pay for it.
- Ship the service as a container with GDAL from the distro, like ptolemy and
  geodukt already do, rather than fighting system-GDAL version skew across the
  cross-platform CI matrix. A local CLI can require a system GDAL instead of
  vendoring one.
- Check what the `gdal` crate actually exposes for driver-specific metadata
  before committing to it. The semantics layer is the whole point of verne, and
  bindings usually cover geometry and attributes better than metadata. If it
  falls short the answer is a little C-API glue, not a different language.
  Settled for Esri (2026-07-30): georust 0.19 wraps neither field domains nor
  relationships, so verne carries read-only `gdal-sys` glue. Minimum GDAL is 3.8
  (relationships need 3.6, related-table-types and raster-in-gdb 3.7); Debian 13
  ships 3.10 and Ubuntu 24.04 ships 3.8, so distro GDAL is fine and Ubuntu 22.04
  is the only casualty. Domain and relationship handles are borrowed const
  pointers the dataset owns: freeing them aborts the process.

- [ ] **the next adapter after Esri.** v0.1 covers KML/KMZ, v0.2 the Esri File
      Geodatabase (history log). Pick the next from real customer data rather than
      guesses, and check it against GDAL's driver list before committing to it. The
      recorded order of demand puts the photogrammetry and reality-capture stacks
      next, then the CAD-adjacent platforms.
- [ ] **verne v0.3: ArcGIS REST and Portal.** v0.2 reads a `.gdb` on disk only.
      Hosted layers through the documented REST API with the operator's own
      credentials are the other half of the Esri story, and the one that needs the
      credential handling the repo was scoped around.
- [ ] **v0.2 gaps.** Rasters in a `.gdb` are detected and routed to terrano but
      have no fixture, because OpenFileGDB refuses to create them. Field subtypes,
      dataset-level metadata and glob domains are unexercised. Subtype, annotation
      and topology fixtures are hand-written catalog XML, since GDAL cannot create
      those either: the read path is real, the blob is not.
- [~] **features and attachments into ptolemy** (in flight 2026-07-30). Attachments
      dragged feature loading in with them: ptolemy hangs an attachment off a
      feature id and a branch, and verne had never put a feature into ptolemy at
      all, so blobs would have landed on empty datasets. `DiffOpRequest::Insert`
      takes an optional `feature_id`, so verne mints its own uuids on commit and
      keeps the Esri-OBJECTID-to-ptolemy-id map that attachments key on. Side
      effect worth having: `verne load` becomes a whole migration rather than the
      semantics half, with the data no longer stranded in the GeoPackage.
      `verne-load` stays GDAL-free, so how features reach it is a real constraint.
- [ ] **ptolemy is single-CRS by schema, and whether that is right is a product
      call.** Geometry columns are typed `GEOMETRY(Type, 4326)`, so the database
      rejects any other srid, and `ST_GeomFromWKB($4, 4326)` on insert and update
      stamps 4326 on whatever arrives regardless of the `datasets.srid` the
      dataset declares. Constraining one srid per column is ordinary PostGIS
      practice. Fixing it at 4326 platform-wide is the choice, and it is a
      reasonable one for a web-first stack: tiles and viewers are WGS84, and any
      cross-dataset operation needs a common frame anyway.

      The cost lands on the migration story. A geodatabase is not single-CRS: each
      feature class carries its own spatial reference and a feature dataset only
      constrains its own members to a shared one. The one real file tested carries
      two, plain NAD83 for ten classes and NAD83 with NAVD88 height for the nine
      in its Hydrography feature dataset, so a load already flattens two frames
      into one. Reprojecting at extraction (decided, in flight) makes the data
      correct and renderable, which is what most viewing and analysis needs. It
      does not make it unchanged: 4326 and back does not return the original
      numbers, and for cadastral, survey or engineering data the projected
      coordinates are the authoritative ones, so that round trip is the fidelity
      claim verne cannot make. The compound vertical datum has nowhere to go
      either, so a Z value referenced to NAVD88 arrives unreferenced.

      Deciding to support per-dataset srid later means the column typmod or a
      per-dataset geometry table, plus auditing every query that assumes 4326
      (bbox envelopes built at 4326, the tile paths, the viewer). Worth it only if
      someone needs data back out unchanged rather than merely correct.
- [ ] **more real data, and from another vendor domain.** One public geodatabase
      found two bugs an afternoon (history log), and it was hydrography: no
      attachments, no annotation, no utility network, so those paths are still
      exercised only by fixtures verne builds itself. A utilities, parcels or
      emergency-services file would hit them. Public sources with attachments are
      hard to find, since attachments rarely survive open-data publishing, so this
      may need a customer file.
- [ ] **the loader is not covered by verne's CI.** The one place verne's
      assumptions meet ptolemy's real API is gated on an env var naming a live
      server, so CI never runs it, and today's drift bugs are the argument for
      closing it. Automating it needs ptolemy to publish a container image (it
      publishes none) or an OpenAPI spec (it has none); a mocked test would assert
      only verne's own assumptions and is worse than the honest gap. Cheapest real
      fix is probably a ptolemy image, which helps more than verne.
- [ ] **display an alias.** A field alias now reaches ptolemy and is stored on the
      dataset schema, and nothing shows it (history log), so the verdict stays
      *approximated*. The work is viewtopia's: attribute table headers, feature
      popups and field pickers reading `alias` with the column name as fallback.
      Pin the field JSON shape in one place when doing it, because two writers and
      no agreed schema is how the drift fixed this morning started.
- [ ] **what the Esri report cannot land, by category** (from the GDAL feasibility
      pass and v0.2's own verdicts):
      - domains lose their field binding (ptolemy binds a domain to a field only
        through a subtype), their description, non-default split/merge policies and
        bound inclusivity.
      - relationship classes lose the origin key, `is_composite` (the column exists,
        the API cannot express it) and the many-to-many mapping table's own
        attributes. GDAL models no relationship rules or notification at all.
      - annotation and dimension graphics are unsupported: GDAL reads no class
        extension, and jung places labels from text and an anchor rather than
        storing a placed graphic.
      - topology rules, geometric/network/utility networks, parcel fabrics,
        terrains, mosaic datasets, attribute rules and contingent values have no
        GDAL model: named in the report and nothing more.
      - versioning and archiving are enterprise-only Esri features, so a `.gdb`
        reports them not applicable. The branching-beats-edit-history advantage
        only applies to enterprise sources, which lands in v0.3, not here.
- [ ] **fidelity gaps verne named that are still open.** Each is a real loss the
      report prints today, listed so the report stays a work list:
      - KML folder nesting flattens to a path attribute, because nothing holds a
        layer tree. Needs a grouping concept or an accepted loss.
      - `GroundOverlay` rotation and `gx:LatLonQuad`: terrano's GeoTIFF carries an
        origin and a pixel scale with no rotation terms, so a rotated or warped
        overlay has to be resampled north-up.
      - A `Model` (COLLADA mesh) has no home. interiora holds indoor and building
        models, not arbitrary meshes. Product question, not a small fix.
      - A `gx:Track` lands as a trajectory now, but with no `feature_id` the
        placemark's attributes, style and folder path stay on a separate feature
        with nothing joining the two, and altitude, per-sample angles and
        `gx:SimpleArrayData` columns have nowhere to go.
      - Viewer chrome stays unsupported by design: `BalloonStyle`, `ListStyle`,
        `ScreenOverlay`, `LookAt`/`Camera`, `NetworkLink` refresh.
      - `LabelStyle` scale multiplies an unstated base size, so text size is
        approximate either way. Probably not fixable.
- [ ] **the semantics with no target** (the actual work; geometry and attributes
      are the easy fifth and GDAL does most of that). The specifics differ per
      vendor but the categories repeat: attribute domains and subtypes, typed
      relationships with cardinality, validation and topology rules, cartographic
      text as features, network and utility models, styling and print layouts,
      attachments, metadata, and edit history. Schema concerns like domains and
      subtypes belong in ptolemy, not in a store verne invents. Versioned edit
      history maps onto ptolemy's branching better than onto anything else this
      platform could migrate to, which is where the real fidelity advantage is.
- [ ] **licence boundaries, needs a human to read each vendor's current terms.**
      The line is the same everywhere: the customer's own data in formats they
      hold, and their own hosted content through documented APIs with their own
      credentials, is clean. Vendor-supplied licensed content (basemaps,
      geocoders, demographic and imagery datasets) is not theirs to move, and
      neither is content they can merely see. Prefer open-source readers over
      vendor SDKs, several of which carry terms that do not sit with AGPL
      linking. "With permission" must be a mechanism, not a promise: explicit
      operator credentials and a log of what was extracted, nothing that sniffs
      or crawls.

## OPEN — sibyl cutover cleanup

- [ ] Session routing is still server-side-global (sibyl active flag mirrors the
      old behavior). Later cleanup: route runs by AG-UI `thread_id` so sessions
      are per-client and stateless; needs viewer session-switcher rework.

## OPEN: viewtopia feature gaps vs GeoLibre (surveyed 2026-07-30)

Diffed geolibre.app's documented features against the panel registry,
`importGeoJson.ts` and the duckdb loaders. Caution: this is GeoLibre's
advertised surface, not a source-level audit, so check depth before treating
any single item as table stakes. Deliberately skipped: planetary basemaps,
PGlite (redundant with DuckDB Spatial), Gaussian splats, and a Tauri
desktop/mobile wrapper (competes with the terravista/collecta track).

High value, existing GeoLang crates supply the engine:

- [ ] **client-side file import beyond text formats**: GeoPackage, Shapefile,
      FlatGeobuf and GeoParquet drag-and-drop. The client only handles
      GeoJSON/KML/GPX/CSV today, GeoParquet works only as a URL through DuckDB.
- [ ] **PMTiles** as a layer source and an export target.
- [ ] **in-browser raster processing** (terrano via WASM): hillshade, slope,
      aspect, contour, polygonize, zonal/focal stats, raster calculator,
      reclassify, spectral index presets (NDVI/NDWI/EVI).
- [ ] **browser geoprocessing toolbox** (topoi WASM instead of turf): catalogued
      buffer/dissolve/overlay/voronoi/joins/grids plus a batch runner with tool
      chaining. The geoprocessing plugin covers only the basics.
- [ ] **data quality tools** (topoi): check validity, fix geometries, topology
      checks.
- [ ] **convert loaded data to cloud-native formats**: GeoParquet, FlatGeobuf,
      PMTiles, COG.

High value, product-level:

- [ ] **project file format**: save/open/share the whole workspace (layers,
      styles, camera, panels) as one JSON file or URL. The share link encodes
      camera and renderer only. Probably the single biggest gap.
- [ ] **SQL workspace panel**: DuckDB is embedded but nothing exposes direct
      SQL entry outside notebooks. Add sample queries, history,
      add-results-to-map, CSV/GeoParquet export, bare-URL remote files via
      range requests.
- [ ] **data-driven symbology**: categorized, graduated, expression and
      rule-based renderers with scale-dependent visibility, SLD/QML/Mapbox
      style import/export (fenestra already parses SLD server-side), and an
      auto-generated legend panel.
- [ ] **attribute table upgrades**: field calculator, virtual fields,
      attribute joins, stats/charts from the table.
- [ ] **embedding support**: URL params for chrome-less/compact layouts and a
      postMessage API for host pages. Cheap, widens adoption.
- [ ] **runtime plugin install**: plugins are build-time only
      (`import.meta.glob`). GeoLibre ships a marketplace with
      install/update/remove.

Medium value:

- [ ] **story map export**: standalone HTML, scroll-driven layout, presenter
      view. Current stories are localStorage camera steps.
- [ ] **STAC catalog browser + data source manager panel**: browse services,
      databases, files and favorites in one place.
- [ ] **isochrones/service areas and OD matrices**, served by itinera.
- [ ] **print layout with atlas/map-series generation**: current export is a
      canvas screenshot.
- [ ] **time slider over tiled/mosaic data** (STAC, PMTiles), not only the
      Cesium clock.
- [ ] **map-to-video recording and route animation with MP4 export**: would
      finish the preview-gated flythrough panel.
- [ ] **offline area download** with service-worker caching. See the offline
      story section below for the audit.

## OPEN: viewtopia offline story (audited 2026-07-30)

The sync layer is real: IndexedDB persistence (`src/offline/db.ts`, 9 stores),
online/offline detection, mutation queue with retry, three-way column-level
conflict merge, `offlineFetch()` API response cache. Data already loaded
survives reloads and syncs back. Everything below is what does not work.

- [ ] **README oversells offline, fix first.** §Offline-First advertises "tile
      caching" and "service worker", neither exists. Trim the two lines or land
      the items below.
- [ ] **OfflinePanel is a stub behind the preview gate.** "Cache Current View"
      animates a timer-driven progress bar and caches nothing, the regions list
      is hardcoded empty. `cacheTilesForArea()` and `precacheUrls()` in
      `src/offline/cache.ts` are defined and never called, the `tileCache`
      IndexedDB store sits unused. Wire the panel to them or delete both.
- [ ] **no service worker.** `public/manifest.json` exists but nothing
      registers a worker and vite has no PWA plugin, so the app shell needs the
      server on every load. Offline today only means "the tab was already
      open".
- [ ] **DuckDB-WASM loads from jsDelivr** on first query
      (`getJsDelivrBundles()` in the worker). Serve the bundle from the app
      origin so SQL works without the CDN.
- [ ] **no local basemap.** All eight basemaps are external hosts and
      "selfhosted" needs the compose stack reachable. No way to load a local
      MBTiles/PMTiles file as a basemap, which is how GeoLibre solves offline
      basemaps. Pairs with the PMTiles item in the GeoLibre section above.
- [ ] **vector basemap glyphs/sprites load from protomaps.github.io**, so even
      a locally served vector style breaks offline. Bundle or proxy the assets.
- [ ] **Cesium terrain needs an external provider** (ion token or terrain
      endpoint), no local/offline terrain source. Blank terrain is the graceful
      floor, a tiletopia-served terrain bundle would be the real fix.
- [ ] External API fallbacks that fail offline, decide per case whether a
      cached or local answer is worth it: Nominatim geocoding, public OSRM
      routing, open-elevation, open-meteo, Overpass.

## OPEN — Phase 3 (mobile & ML breadth, after v1)

- [ ] **terravista v0.2** — HTTP tile fetch + MVT decode (the SDK can't fetch/draw tiles yet).
- [ ] **terravista v0.3** — Metal/Vulkan GPU rendering. Biggest advertised-vs-real gap; needs
      platform GPU toolchains.
- [ ] **panoptes model weights** — train or source one usable segmentation model and publish
      weights, or keep the repo clearly labeled experimental. Inference path itself is real.
- [ ] **collecta media attachments** — photo/document capture + sync (deferred from Phase 2).
- [ ] **viewtopia FleetPanel** — currently an honest "no live feed" state; nothing serves
      vehicle positions. Decide whether real-time fleet tracking is in scope before building
      a WS/ingest path for it.
- [ ] Preview-gated panels (18) — implement on demand, otherwise leave gated. Cheap wins if
      wanted: several reuse existing helpers.

## OPEN — deferred design decisions (not bugs)

- [ ] ptolemy merge is **feature-level** (edits to different attributes of one feature
      conflict). Attribute-level auto-merge would be a conflict-detection redesign; behavior
      is currently pinned by a test. Decide if it's worth it.
- [ ] ptolemy re-merge of an already-merged branch creates a redundant merge changeset each
      time (merge commits record only one parent, so the base never advances). "Already up to
      date" detection needs second-parent bookkeeping.
- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.
- [ ] **Split view: per-pane basemap picker, then tiled views** (owner, 2026-07-26,
      post-MVP). Panes currently share the basemap, so same-renderer split is a mirror.
      Step 1: each pane picks its own basemap, cameras stay locked (no focused-pane
      concept; viewer-scoped tools keep the left-pane convention). Build the pane state
      as a list of `{renderer, basemap}`, not a single right-pane entry, so step 2 —
      a 2x2 tiled compare view — is layout work, not a rewrite. Tiles are GL contexts:
      cap at 4, MapLibre by default, at most one Cesium instance.
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.
