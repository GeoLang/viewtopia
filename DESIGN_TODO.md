# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> Last brought current: **2026-08-08**.

---


## OPEN — direction: the Figma of GIS, only open (stated 2026-08-06)

The owner's product thesis: GeoLang becomes what Figma is to design, for GIS,
as open source. Assessed feasible 2026-08-06. The proprietary occupant of this
position is Felt (browser-native, real-time collaboration, freemium, "Google
Docs of GIS", 500+ teams as of 2026), which proves the demand; the open-source
quadrant is empty (QGIS is desktop single-user, GeoNode et al are plumbing).
The counter-position: open, self-hostable, data stays in your PostGIS, plus an
analysis engine (geoplumb) at a depth Felt lacks. AGPL already guards against
cloud strip-mining.

What the stack already covers: browser viewer with real tools (viewtopia),
versioned feature store with branch/diff/merge/audit (ptolemy, the version
history half, which Felt does not have), GEE-track compute (geoplumb), tiles,
mobile capture, auth and multi-tenancy, one-click deploy.

Live multiplayer shipped 2026-08-07 (agora service + viewtopia client,
current state in DESIGN.md). Open work from it:

- [ ] **hosted flagship instance + share links** — Figma's zero-install magic
      is a link that opens the document. Self-host is free with open source,
      but the "click a link, you're in the map" experience needs a hosted
      deployment. Ops and money, parked on the same AWS account decision as
      geoplumb in-region serving (2026-08-05). The executor precondition
      (decided 2026-08-09) is closed: tool code runs in `geolang-executor`,
      a container holding no platform signing secret, no service account and
      no model key, with capabilities dropped and resource limits, and the
      platform compose wires it (see geolang's DESIGN.md and README). What
      the split does not close, and what a multi-tenant deployment still
      needs decided: a tool holds the caller's own bearer while it runs, and
      geolang's `outputs/` is one directory every user reads and writes.

From the Felt comparison (2026-08-07, sourced from their docs): the gaps
below are where their product is ahead in ways that serve the same
collaborative workflow, so they are in-thesis rather than parity chasing.
Felt has no versioning, no routing, no 3D and self-hosts only on
enterprise contracts, so those fronts need no response.

- [ ] **read-only warehouse sources** (weigh before building) — Felt reads
      Snowflake/BigQuery/Databricks live, enterprise-only. Ptolemy already
      does external read-only PostGIS tables; the same model could take a
      warehouse driver. Only worth it when a real user asks: it is
      enterprise-pull, and the thesis says refuse parity fights.

Scope discipline that follows from the thesis: Figma did not beat Photoshop
on features, it won one workflow. Win "a team makes and analyzes a map
together in the browser" and refuse feature-parity fights with ArcGIS.

## OPEN — platform hygiene

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
- [ ] **ALB rules cannot strip path prefixes**, so every nginx location that
      rewrites before proxying (/plumb, /api/indoor, /api/geocode, /api/route,
      /tiles) reaches its container unstripped on ECS and 404s. Works through
      the compose nginx only. Fix is either prefix-aware routes in each service
      or an ECS-side proxy layer; the ecs module comment documents it.
- [ ] **No terraform service wires PLATFORM_JWT_SECRET**, so every service that
      refuses to start without it (ptolemy, tiletopia, interiora) crash-loops on
      Fargate until a secrets path (SSM/Secrets Manager → task env) exists.
      geoplumb also needs its layers TOML baked into the deployed image, since
      the ecs module mounts no volumes.

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
      history log). Every plan step now carries `runs_caller_code`, set from the
      tool's own `TOOL_RUNS_CALLER_CODE` declaration, so the panel can mark an
      escape-hatch step before approval, and PlanPanel marks it. Still open:
      whether approving such a step should cost an extra click, and sql_query
      called on its own still bypasses the plan surface entirely, so it stays
      persona-discouraged there.
- [~] **permission-aware enforcement**: the far end is now enforced in every
      service (per-repo changelogs): tiletopia gates annotations, plugin
      mutations and the asset listing, collecta enforces roles and form
      ownership, geolang requires a platform JWT on everything that runs code,
      writes a file or reads back user data (chat, sessions, uploads, outputs),
      and geodukt's `/run` follows the shared platform secret. The org schema
      that the write ladder never read was dropped (ptolemy migration 028).
      Unknown role strings fail closed everywhere.
- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.
- [ ] **runs carry no time**: a geodukt run record has an id, a manifest, steps
      and a caller, but nothing saying when it ran. The run history panel can
      only order by id and say so. Needs a timestamp on the record in geodukt.

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
- [ ] None of the above holds when auth is off (an empty `PTOLEMY_JWT_SECRET`):
      the ladder and the visibility layer both no-op by design.
- [ ] `/check` (dataset and branch) still falls back to `org_members`, which the
      write ladder and `is_dataset_admin` both ignore, so it can answer allowed
      for someone a write would refuse. Informational routes, nothing enforcing
      calls them, but a client trusting them is misled. Same decision as the org
      boundary item above.
- [ ] Two operational consequences of dropping the zero-rows rule, for whoever
      deploys first: a deployment needs at least one instance-admin token holder,
      because that is the only actor who can grant on a dataset the backfill
      skipped (blank or machine `created_by`), and any service account writing to
      datasets it did not create needs an explicit grant where the editor role
      alone used to pass.

## OPEN — ptolemy: what the route sweep still reports (2026-08-01)

The sweep closed the missing-column class: every mounted route is called against
a migrated database and 42703/42P01 fails CI (see the changelog). The fixable
class of its standing 500s closed 2026-08-04 (changelog again), and the same day
closed the pgRouting id mapping (junction uuids ranked to bigints per statement,
validated end to end against pgRouting 3.8) and removed the never-worked
`branches/{id}/reproject` route. What is left needs a decision rather than a
fix.

- [ ] the sweep only covers the SQL branches its fixtures reach, which is what
      query variants are for, and a handler that swallows its error is invisible
      to it. Add a variant when a route grows a second branch.
- [ ] The relationship API still cannot express `is_composite`, though the column
      exists. Feature gap, not a bug.
- [ ] the throwaway script that generated the 130-entry request-body table by
      parsing handler structs lives in no repo. Worth keeping as a small dev
      script if the table needs regenerating.

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
- [ ] **verne: the rest of the hosted Esri story.** verne lists a portal's
      feature services, reads a FeatureServer or MapServer whole or scoped to
      one layer with the operator's token or one it mints itself, carries the
      untransformed originals, and the loader is unchanged (see verne's README
      and changelog). Still open:
      - the version tree: verne reads any named version (`--gdb-version`, one
        per extraction) and names which layers front versioned data and change
        tracking. Carrying the tree itself stays open, and the requirements
        are now documented rather than guessed: enumerating and diffing
        versions is the VersionManagementServer resource, whose `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license; `extractChanges` needs the
        service to publish `changeTrackingInfo` generations, which
        sampleserver6 does not, and the only other source of generations is
        registering a sync replica, which writes server state. Both need an
        enterprise deployment verne may exercise; also decide the ptolemy
        mapping first (a branch per version needs update/delete ops in the
        sidecar, which today holds inserts only, and a persisted
        objectid-to-feature-id map across extractions).
      - legacy generateToken (username/password) is deliberately not taken:
        holding a password is worse than holding a client secret, and OAuth
        client_credentials covers the hosted case.
- [ ] **v0.2 gaps.** Rasters in a `.gdb` are detected and routed to terrano but
      have no fixture, because OpenFileGDB refuses to create them. Field subtypes,
      dataset-level metadata and glob domains are unexercised. Subtype, annotation
      and topology fixtures are hand-written catalog XML, since GDAL cannot create
      those either: the read path is real, the blob is not.
- [ ] **ptolemy is single-CRS by code, not by schema, and whether that is right is
      a product call.** `feature_versions.geometry` is a bare untyped `geometry`
      column with no srid constraint, so PostGIS would hold mixed srids in it
      quite happily. What forces one is `ST_GeomFromWKB($4, 4326)` on insert and
      update, which stamps 4326 on whatever arrives regardless of the
      `datasets.srid` the dataset declares. (The `GEOMETRY(Type, 4326)` typmods
      elsewhere, on networks, raster bounds and LRS, are real constraints but do
      not cover features.) One srid per column is ordinary PostGIS practice and a
      database normally holds many tables in many srids, so single-CRS platform
      wide is this platform's choice rather than a PostGIS norm. It is a
      reasonable one for a web-first stack: tiles and viewers are WGS84, and any
      cross-dataset operation needs a common frame anyway.

      The cost lands on the migration story. A geodatabase is not single-CRS: each
      feature class carries its own spatial reference and a feature dataset only
      constrains its own members to a shared one. The one real file tested carries
      two, plain NAD83 for ten classes and NAD83 with NAVD88 height for the nine
      in its Hydrography feature dataset, so a load already flattens two frames
      into one. Reprojecting at extraction (shipped) makes the data correct and
      renderable, which is what most viewing and analysis needs. The original
      coordinates now survive it: a commit operation may carry the untransformed
      geometry and its EPSG code beside the working copy, verne sends them for
      every transformed class whose reference a code names, and
      `GET /branches/{id}/features/{id}/native` returns them exactly, byte for
      byte. NULL means "no distinct original", and an edit's new version stores
      NULL rather than inheriting one. A reference no single EPSG code names,
      such as the real file's NAD83 + NAVD88 compound on its nine Hydrography
      classes, travels as its full WKT2 definition in `native_crs_wkt` instead,
      so an orthometric Z keeps its vertical datum on the record. Only a
      reference GDAL cannot state at all leaves its original in the GeoPackage
      alone, and the log says so per class.

      Supporting per-dataset srid later needs no storage migration, since the
      column already accepts any srid. It means taking the srid from the dataset
      on write instead of the literal, then auditing every query that assumes 4326
      (bbox envelopes built at 4326, `ST_Transform` calls pinned to it, the tile
      paths, the viewer), and deciding what a cross-dataset query does when two
      datasets disagree. Getting the numbers back out unchanged now works per
      feature through the native read, so this is worth it only if someone needs
      to query and serve in the native frame.
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

## OPEN — what the enforcement pass left open per service (2026-08-01)

Deliberate scope calls from the multi-user enforcement work, each a product
decision rather than a bug. Per-repo changelogs hold what shipped.

- [ ] **tiletopia asset metadata is only listing-filtered.** `GET /assets`
      hides other tenants' rows, but `GET /assets/{id}` still answers for any
      valid token, and the Ion-compat `/v1/assets/{id}` is public by design, so
      gating one and not the other would be theater. Tiles are public regardless
      (the CDN TTLs depend on it). Decide whether asset metadata is tenant
      private, and if so do both routes and the CDN together.
- [ ] **tiletopia annotation reads are open** to any valid token on any asset.
      Writes are owner-or-admin. Only worth closing if annotations count as
      private content.
- [ ] **collecta viewers can read no submissions at all**, because a viewer
      cannot create a form and submission access is creator-or-admin. A
      read-only analyst over someone else's data needs the deferred per-form
      grants table. Legacy forms with no creator are admin-only and are not
      backfilled to anyone.
- [ ] **collecta JSON submissions record no submitter** (only the OpenRosa path
      sets `collector_id`), so there is no per-submitter audit trail and
      ownership cannot be reconstructed later.
- [ ] **collecta role strings outside admin/editor/viewer now fail closed.**
      Nothing in the repo creates others, but a live database predating this may
      hold them, and those accounts stop working on deploy.

## OPEN: viewtopia feature gaps vs GeoLibre (surveyed 2026-07-30)

Diffed geolibre.app's documented features against the panel registry,
`importGeoJson.ts` and the duckdb loaders. Caution: this is GeoLibre's
advertised surface, not a source-level audit, so check depth before treating
any single item as table stakes. Deliberately skipped: planetary basemaps,
PGlite (redundant with DuckDB Spatial), Gaussian splats, and a Tauri
desktop/mobile wrapper (competes with the terravista/collecta track).

High value, existing GeoLang crates supply the engine:

- [ ] **convert loaded rasters to COG**: waits on a browser-capable COG writer.
      The duckdb-wasm build has no GDAL write path and nothing else in the tree
      writes a tiled, overviewed TIFF; an upstream Rust writer is in progress.
      (Vector conversion shipped 2026-08-06: GeoParquet, FlatGeobuf, GeoJSON,
      PMTiles. PMTiles per-layer export shipped 2026-08-02.)

High value, product-level:

- [ ] **symbology, what the first cut left open** (categorized, graduated and
      rule-based renderers plus the legend panel shipped 2026-08-02,
      scale-dependent visibility 2026-08-11, SLD import 2026-08-12): expression
      renderers, SLD export, and QML/Mapbox style import/export.
- [ ] **runtime plugin install**: plugins are build-time only
      (`import.meta.glob`). GeoLibre ships a marketplace with
      install/update/remove.

Medium value:

- [ ] **story presenter view**: the Stories panel exports a scroll-driven
      standalone page (2026-08-12), but there is no second window with speaker
      notes, the next step and a synced position. Steps have no notes field to
      show either.
- [ ] **STAC catalog browser + data source manager panel**: browse services,
      databases, files and favorites in one place.

- [ ] **data source manager panel**: the STAC Browser panel covers catalogs,
      collections, items, assets and saved favourites. Services, databases and
      files are still one panel each (OGC Layers, SQL, Import), not one place.
      The data-catalog plugin is a shallower duplicate of the STAC half and
      should go.
- [ ] **isochrones/service areas and OD matrices**, served by itinera.
- [ ] **print layout with atlas/map-series generation**: current export is a
      canvas screenshot.
- [ ] **time slider over PMTiles archives** (the STAC side shipped 2026-08-06
      as the Timelapse panel over geoplumb).
- [ ] **map-to-video recording and route animation with MP4 export**: the
      flythrough panel plays live but exports nothing.
- [ ] **offline area download** with service-worker caching. See the offline
      story section below for the audit.

## OPEN: viewtopia offline story (audited 2026-07-30)

The sync layer is real: IndexedDB persistence (`src/offline/db.ts`, 9 stores),
online/offline detection, mutation queue with retry, three-way column-level
conflict merge, `offlineFetch()` API response cache. Data already loaded
survives reloads and syncs back, and a service worker precaches the built app
shell, so a reload with no network still boots the viewer. Everything below is
what does not work.

- [ ] **cesium and leaflet still fetch raster tiles from the network.** The
      cached:// protocol serves MapLibre from the offline tile cache, but the
      other renderers build plain tile URLs, so offline basemaps are
      MapLibre-only. Cesium would need an ImageryProvider over the cache. A
      local .pmtiles basemap is MapLibre-only for the same reason, and those
      renderers draw no basemap while one is selected.

- [ ] **no service worker.** `public/manifest.json` exists but nothing
      registers a worker and vite has no PWA plugin, so the app shell needs the
      server on every load. Offline today only means "the tab was already
      open".

      MapLibre-only. Cesium would need an ImageryProvider over the cache.
- [ ] **DuckDB's spatial extension still loads from extensions.duckdb.org.**
      The wasm bundle and the basemap glyphs are served from the app origin
      now, so plain SQL works with no network, but `getConnection()` runs
      `INSTALL spatial; LOAD spatial;` and that fetch is what spatial SQL
      needs. It is wrapped so a failure degrades rather than throws. Vendoring
      it means pinning the extension to the exact DuckDB version and a script
      that refreshes both together on upgrade.
- [ ] **Cesium terrain needs an external provider** (ion token or terrain
      endpoint), no local/offline terrain source. Blank terrain is the graceful
      floor, a tiletopia-served terrain bundle would be the real fix.
- [ ] External API fallbacks that fail offline, decide per case whether a
      cached or local answer is worth it: Nominatim geocoding, public OSRM
      routing, open-elevation, open-meteo, Overpass.

## OPEN — geoplumb: gaps to Earth Engine parity (consolidated 2026-08-06)

The per-pull time axis and geoplumb-server shipped, so one graph now serves
any interval as on-demand composite tiles (the Timelapse panel is the proof).
What still separates it from GEE, engine details in geoplumb's DESIGN.md
Known limits:

- [ ] **item footprint under-coverage** (remainder of the mixed-CRS fix,
      2026-08-07): cross-CRS items now warp onto the anchor grid at read,
      but an item's lon/lat footprint converts to the anchor CRS through
      two opposite corners, under-covering a rotated cross-zone quad by up
      to ~2 km on its far side, so a chunk entirely inside that strip
      still skips the item. Fix is converting the footprint through a
      densified envelope, which also widens same-CRS footprints slightly.
- [ ] **zonal endpoint edge protections**: /zonal and /zonal/series ship
      with input validation and resource caps but no per-request timeout
      or concurrency limit; that belongs at the edge (nginx or a tower
      layer), not in the crate. Also document that overlapping zones
      resolve by burn order (a contained zone reads empty, not an error).
- [ ] **composite latency and memory on dense collections**: a reducing
      composite reads every intersecting item with the whole stack resident
      per window. Fine at a few items, not at hundreds. Streaming reductions
      for mean/min/max would come cheap; median needs the stack.
- [ ] **in-region deployment**: cold pulls are bound by the residential
      link to us-west-2. Serving next to the data is the remaining latency
      lever; blocked on an AWS account decision (2026-08-05).
- [ ] **breadth**: GEE ships a huge operator library and charting/reduction
      over regions; geoplumb has hillshade, slope, aspect, map algebra, band
      math (arithmetic, comparisons, where, log/exp), reclassify, convolution,
      quality masking, focal statistics, composites through
      percentile/stddev/count, and zonal statistics plus per-step time series
      as pull drivers (2026-08-06) and as public server endpoints
      (POST /zonal/{layer} and /zonal/{layer}/series, 2026-08-07). Grow by
      demand, not by checklist.

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
