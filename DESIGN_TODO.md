# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> **An advertised feature that is not implemented is captured here as an open
> item.** Rewording the doc is the fallback, for a claim nobody intends to build.
> Last brought current: **2026-08-18**.

---

- [ ] **collecta increment 3: push submissions into ptolemy** as versioned
      features, deliberately parked until the panel proves demand. Needs the
      form-schema-to-dataset mapping, incremental sync off collecta's
      cursor, and a decision on who owns the bridge (an exporter in collecta
      versus a puller elsewhere). Print-resolution rendering and collecta
      increments 1–2 (compose + Field Data panel) shipped 2026-08-14.

## OPEN — advertised vs implemented (audited 2026-08-15)

The 2026-08-14 pass covered six repos (renovate-config, sibyl, terrano, agora,
collecta, fenestra) and those ACTIONs closed the same day. The rest of the
suite was finished 2026-08-15. A gap between what a doc claims and what the
code does is captured below as an open item; rewording alone is the fallback.

Advertised gaps implemented 2026-08-15 (code, not reword): geokode
directional/unit matching + autocomplete `lon`/`lat` bias; fluvius stop
detection, path smoothing, and `map_match` topology operator; ptolemy
attribute-level merge of disjoint property edits; geodukt
`incremental`/`lineage`/`quality` project flags and `Pipeline::execute`
running independent DAG waves through `ParallelScheduler`. Vanity counts
and the tiletopia ecosystem page were reworded the same day.

Still too big to fake as a README fix, or not a runner-shaped gap:

- [ ] **fluvius temporal joins and R-tree.** Windowing and watermarks drive
      the runner. Temporal joins and the R-tree are still unused modules.
- [ ] **geogit PostGIS working copy** is advertised on the docs comparison
      page. `create-workingcopy postgresql://` writes tables; there is no
      PostGIS `WorkingCopy` impl and no status/commit from PostGIS.
- [ ] **jung unused render modules** (labels, label priority, curved labels,
      text/TTF, MIL-STD 2525, heatmap, print layout). Each is exported by a
      `pub mod` line and tested in isolation; nothing on the render path calls
      them. `print_layout` pulls in `output`, so the print stack is a closed
      unused island rather than one module. Real work, not a wire-up. The
      README already discloses it, so only the code is open. jung-wasm is a
      different matter and is not a gap: the crate exists, and jung's README
      already states that viewtopia does not import it.
- [ ] **itinera WASM crate.** No crate, no graph in the browser. The README
      comparison table already marks WASM ❌, but `docs/index.html:49` still
      calls itinera "WASM-capable" in its tagline while the same page's own
      table says ❌. Build the crate or drop the tagline.
- [ ] **ptolemy OGC API Features Part 2.** Not implemented: the `/crs` routes
      are a CRS lookup service, not the Features CRS extension, and there is no
      `storageCrs` and no `crs` query parameter. README and the docs site
      already scope the claim to Part 1, so only the code is open.
- [ ] **ptolemy QGIS plugin.** Does not exist anywhere in the platform and is
      not planned; `qgis.rs` is server-side HTTP endpoints. The roadmap line
      was reworded to match, but `README.md:63`'s architecture diagram still
      lists "QGIS Plugin" as a client. Drop it or build one.

## OPEN — full doc sweep of all 26 repos (2026-08-18)

Every README and `docs/index.html` validated against its own code by one agent per
repo. The 2026-08-14/15 pass corrected vanity counts; this pass looked for
capabilities that are advertised and absent. It found a great deal more.

The recurring shape, worth naming once because it explains most of the list: a
module is written, unit-tested, exported by a `pub mod` line, and never called by
any route, CLI path or render loop. `cargo` does not flag it because the
re-export keeps it live. The docs then describe the module as a feature. A second
shape is almost as common: the README gets corrected and `docs/index.html`, which
is what GitHub Pages publishes, does not.

Doc edits removing the false claims landed for most repos (uncommitted). This
section is the work those claims implied. Nothing here is started.

### Code defects found behind an advertised feature (not doc drift)

- [ ] **geokode house-number lookup does not work on its own documented data.**
      The OpenAddresses CSV ingest joins fields with `", "`, producing the key
      `123, Main St, Springfield, IL`, and normalization never strips commas, so
      a normally-written query never matches. Verified by building the CLI: the
      README's own example returns "No results found". CSV is the only format the
      Dockerfile and both compose files load. One line either side.
- [ ] **itinera parses OSM turn restrictions and no routing algorithm consults
      them**, so routes drive through banned turns. Enforcing needs edge-based
      state (previous way id) in dijkstra, A* and CH.
- [ ] **itinera rebuilds the nearest-node R-tree inside every query** and throws
      it away, twice per `/route` call. Build once at load, hold it on the graph.
- [ ] **itinera `algorithm=ch` fabricates distance** by assuming 50 km/h for the
      whole route and returns zero turn-by-turn steps. CH unpacking already
      yields the full node path, so both are recoverable.
- [ ] **fenestra parses SLD filters and never applies them when rendering.** Every
      feature is drawn for every symbolizer of every rule, so a two-rule
      categorized style paints everything twice and the last rule wins.
      `min_scale`/`max_scale` are ignored at render time too.
- [ ] **fenestra GetCapabilities documents are not client-consumable.** The WFS
      document emits `wfs:`/`ows:` prefixes with no `xmlns:` declarations, so a
      namespace-aware parser rejects it outright. WMS has no Capability/Request
      section, so a client cannot discover GetMap. WMTS has no TileMatrix levels.
- [ ] **agora never checkpoints a document edited in short sessions.** The 256-op
      counter lives on the in-memory room and resets every load, and the room is
      dropped when the last connection leaves, so the ops table grows without
      bound and every join replays the whole log. Drive the fold off
      `seq - checkpoint_seq` at room load.
- [ ] **fluvius count-based windows never close.** A count window sets its end
      from wall clock while expiry compares against an event-time watermark, so
      events accumulate unboundedly and the configured count never participates.
- [ ] **geolang workflow manifests bypass per-caller confinement**, which the
      README explicitly promises is closed. `plan_workflow` and `run_workflow`
      forward the TOML verbatim to geodukt, whose `[[sink]] path` is a real
      filesystem path with no confinement root. Also plainly broken as a feature:
      the persona writes sinks as `outputs/foo.gpkg`, which lands in the shared
      parent where no tool or route can see it.
- [ ] **geolang `pyqgis_api` passes the caller's `uri` straight into
      `QgsVectorLayer`/`QgsRasterLayer`** with no confinement call. One line.
- [ ] **geodukt `/gp/*` is ungated.** Six routes are nested with no auth layer, so
      with `PLATFORM_JWT_SECRET` set an unauthenticated caller can still POST
      arbitrary GeoJSON and consume server CPU. Decide gate or document.
- [ ] **geodukt `quality = true` skips engine-resident transforms**, which is the
      common case (a filter, schema_map or clip directly under a source).
      Verified: the same invalid polygon fails locally and passes on the engine.
- [ ] **geodukt lineage records a fabricated positional mapping** (output i came
      from input i) regardless of what the operation did, and writes an empty
      file when transforms are engine-resident.
- [ ] **geogit loses geometry on three paths**: GeoJSON export emits
      `"geometry": null` always, shapefile import inserts the literal string
      `"GEOMETRY"`, and PostGIS import reads every non-geometry column as
      `Option<String>` so integers, floats, booleans and dates all land as Null.
      No test in the repo ever moves a geometry value, which is why none of it
      surfaced.
- [ ] **ptolemy's Esri-style topology rule engine does not exist.** 31 rule
      variants are declared, nothing matches on them, stored rules are never read
      back, and the only validator ignores its dataset argument and queries two
      columns (`branch_id`, `is_deleted`) that `feature_versions` does not have,
      so it always errors. No commit-time gate. (PostGIS Topology proper is real.)
- [ ] **ptolemy API keys authenticate nothing.** The middleware decodes the bearer
      as a JWT and a `ptk_` string is not one, and nothing in the API ever queries
      `api_keys`. Two adjacent CLI bugs: key generation has no CSPRNG (it is
      `timestamp ^ 0xdeadbeef`), and `key_prefix` is `ptk_` plus the top 16 bits of
      a v7 timestamp, so revoke's `WHERE key_prefix = $1` with no LIMIT
      mass-revokes every key minted in the same ~49-day window.
- [ ] **ptolemy FlatGeobuf export emits GeoJSON** with a `.geojson` filename and
      no FGB crate in any manifest. Implement or rename the route.
- [ ] **ptolemy room relay echoes each message back to its sender** (it subscribes
      to the same channel it sends on), so a client applying camera updates
      naively echo-loops.
- [ ] **terrano GRIB2 decoding cannot succeed for any input.** Only sections 0 and
      1 are parsed; the grid is hardcoded, `data_length` is 0 and `data_offset`
      points past section 1, so decode always fails a length check. NetCDF is
      nearly as bad: the variable's `begin` offset is read and discarded, so only
      the first variable can land on its data.
- [ ] **terrano `read_geotiff` ignores BitsPerSample, SampleFormat, Compression
      and RowsPerStrip** and reads 8 bytes per pixel unconditionally, so a 16-bit
      or compressed DEM is read as garbage with no error. fenestra's WCS path
      calls this on fetched bytes.
- [ ] **nubis octree does no spatial pruning.** The radius query recurses into
      every child with no bounds test, so every query is a full linear scan with
      tree-walk overhead. The stored child centres come from a member point
      rather than the node's geometry, so they are unusable for pruning as-is.
- [ ] **topoi segment intersection misses two whole classes.** The parallel test
      uses an absolute epsilon on a quantity that scales as the square of
      coordinate magnitude, so segments crossing at right angles over a 1e-7 span
      return None (about a centimetre in degrees, ordinary survey data). Collinear
      overlapping segments, including the shared-endpoint case, return None too.
- [ ] **topoi `intersects` is a bounding-box test** over each polygon's exterior
      only, so two disjoint polygons with overlapping envelopes return true. It is
      exported to JS as `polygonsIntersect`, where the name carries no caveat.
- [ ] **sibyl's agent memory leaks across users.** `memories` is
      `(id, content, created_at)` with no session and no user column, and the
      lister returns the newest 50 for every run on that database, so anything one
      user saves is injected into every other user's runs. Undocumented. Also:
      runs serialize globally on one lock, so a second `POST /runs` blocks even on
      a different `thread_id`.
- [ ] **viewtopia KMZ import is broken.** The `.kmz` branch fetches an unzip
      library, discards the result, and parses the raw zip bytes as XML, so a real
      KMZ reports "✓ Imported 0 features".
- [ ] **viewtopia project sharing and sync reach no server.** Project, workspace
      and invite mutations queue as `resource: 'session'`, which syncs to
      `POST {tiletopia}/sessions/{id}` — a route tiletopia does not have — and
      sends no Authorization header. Share links point at `/join`, which the SPA
      does not route. Email invites write an IndexedDB row and send nothing.

### Facades: mounted, seeded with fabricated data, never run

- [ ] **tiletopia scheduler.** Cron/interval/one-shot enum, real cron parsing,
      priority, retry, three GET routes. `spawn()` is called from nowhere,
      `create_job` ignores cron and returns now plus one hour, the executor only
      formats a log line, there is no create route, and `Scheduler::new()` seeds
      three fabricated jobs with invented run counts of 28, 720 and 4. Nothing has
      ever run a scheduled job. Replace or delete; do not start from it.
- [ ] **tiletopia webhooks.** Real HMAC delivery with backoff in `process_pending`,
      which nothing calls, seeded with two demo subscriptions carrying secrets
      `whsec_demo_secret_1/2`, and read-only routes with no subscribe.
- [ ] **ptolemy webhook delivery, SSE, WebSocket events, background jobs, rate
      limiting, audit-log writes and lock enforcement are seven separate dead
      subsystems**, each advertised as done. `spawn_delivery_worker`,
      `SseBroadcast::send`, `EventBus::publish`, `BackgroundJobs::spawn`,
      `check_locks` and the audit writer all have zero callers; the rate-limit
      middleware is never layered (and is a fixed-window counter, not a token
      bucket, keyed on `X-Forwarded-For` with a `127.0.0.1` fallback so every
      direct caller shares one bucket). Pick the two or three worth wiring and
      delete the rest.
- [ ] **tiletopia has roughly 25 further modules that are `pub mod` and nothing
      else**, each advertised: temporal versioning, CRDT editing, federation,
      CI/CD validation, multi-tenant isolation, leader election, priority
      queue/SLA, white-label branding, marketplace, data-residency geofencing,
      field-level encryption, custom dashboards, AR/VR foveated rendering,
      cinematic flythrough, digital-twin scripting, offline viewer export. Decide
      per module: wire, or delete and drop the claim.
- [ ] **tiletopia premium routes return demo data or ignore input.** COG tile
      offsets are fabricated with no HTTP client; STAC search ignores bbox,
      datetime, collections and limit and returns one hardcoded item; static map
      rendering fills a flat grey buffer and encodes WebP as JPEG and both PDF and
      SVG as PNG; kriging is inverse-variogram weighting with no solve, and
      Ordinary/Simple/Universal run identical code; geoprocessing buffer scales
      vertices radially so a square stays a square, union is a convex hull;
      terrain analysis has no aspect, watershed or flow accumulation and viewshed
      has no ray casting; elevation always takes a synthetic sine fallback while
      reporting `source: Srtm30m`; API-key management seeds three fake keys and
      `get_by_hash` has zero callers, so a key cannot authenticate anything.
- [ ] **tiletopia only tiles point clouds.** 18 input formats are advertised and
      the job queue calls `read_point_cloud` unconditionally. `read_vector` has
      zero callers, the mesh tiler is unreachable, and `.tif/.glb/.obj/.ifc`
      uploads queue a job that fails. Several extensions are misclassified as
      PointCloud by a `_ =>` arm.
- [ ] **viewtopia Space-Time Intelligence: 31 advertised rows, ~3 working.** The
      Analysis tab renders seven buttons with no `onClick`. Sixteen of the rows
      have no code at all (co-travel, activity histogram, swimlanes, alerting,
      CDR import, audit trail, ontology, entity resolution, attachments, timeline
      correlation, classification/RBAC, data fusion, and the four performance
      claims). Seven more have a real algorithm and zero callers. Classification
      and RBAC are absent entirely, not merely unenforced. Ten of these are ✅ in
      the comparison table against Palantir Gotham.
- [ ] **viewtopia notebooks are unreachable.** `src/notebooks/` is real and has no
      panel id, no menu entry and no `ToolPanels` case, and nothing outside the
      directory imports it. A Jupyter container runs in the platform compose for
      it. This one is a genuine wire-up: one panel id, one menu entry, one case.
- [ ] **viewtopia conflict resolution is dead code.** The three-way merge only
      runs for `update`+`feature` ops, which nothing ever queues, and
      `ConflictResolver.tsx` is rendered nowhere.

### Advertised platform support that does not exist

- [ ] **terravista has no iOS or macOS anything.** No `.swift`, `.h`, `.modulemap`,
      `Package.swift` or podspec, no cbindgen config, no generated C header, no
      iOS CI job. The README's Swift example imports a module that does not exist,
      and "macOS" appears nowhere in the codebase. Its JNI is hand-written, not
      generated from a header as the docs claim.
- [ ] **terravista's style engine is unreachable and does not parse Mapbox GL
      JSON.** The structs are snake_case serde derives with no renames, while real
      styles use `type`, `minzoom`, `paint["fill-color"]` and stop functions. No
      `tv_` FFI symbol touches the style module, so no host can supply one, and
      the renderer uses its own hardcoded style keyed by layer name.
- [ ] **geogit's PostGIS working copy does not exist.** One `impl WorkingCopy`
      (GeoPackage). `create-workingcopy postgresql://` writes a config nothing
      reads, and its writes bind every value as a String against BIGINT/DOUBLE/
      BOOLEAN/GEOMETRY columns with the failures swallowed by `let _ =`. Also the
      `<path>` argument is ignored: `wc_path()` hardcodes `<root>/<rootname>.gpkg`.
- [ ] **geogit's three-way merge is dead code**; `cmd_merge` shells out to plain
      `git merge`, so two edits to one feature become a binary conflict on a
      MessagePack blob. Kart compatibility is also broken three ways (geometry
      serializes as a MessagePack integer array not bytes, the GPKG header keeps
      the source SRS id where Kart requires 0, and `meta/crs/` is documented and
      never written).
- [ ] **projicio's Lambert Azimuthal Equal Area does not exist**, and its landing
      page Quick Start calls a method that is not on `Transform` and prints a
      result 199 m and 265 m off projicio's own arithmetic.
- [ ] **panoptes polygonization emits axis-aligned bounding boxes**, not feature
      outlines, so every polygon in every GeoJSON it writes is a rectangle. Its
      whole satellite-preprocessing card is unreachable: `SatelliteImage` is never
      constructed anywhere including tests, and the only reader calls `to_rgb8()`
      so no NIR or SWIR band can enter.
- [ ] **collecta conditional visibility is unread in the form model.** The
      `Condition` type exists, validation never looks at it, and the XLSForm
      importer sets it to `None`. It works only on the XLSForm path where the raw
      expression passes through to ODK Collect on the device. Its README also
      claimed GeoGit and GeoKode integrations; neither repo references collecta.
- [ ] **nubis "progressive morphological filter" is a single-pass minimum-Z
      threshold** with no opening, no window progression, no slope term and no
      iteration. PMF is a specific named algorithm and this is a different method.

### Operator-facing errors in infrastructure/README

- [ ] **RDS managed passwords rotate every seven days and nothing rewrites the URL
      secrets**, so ptolemy and agora lose their databases roughly a week after
      launch. Decide: disable rotation, read the managed secret directly, or run a
      rotation-triggered job.
- [ ] **The first apply cannot complete on the platform profile.** The ALB
      security group needs the certificate, which needs ACM validation, which
      needs registrar delegation to a hosted zone the same apply creates. Real
      sequence is apply, let ACM time out, read `name_servers`, delegate, re-apply.
- [ ] **Agora's security group admits the whole shared ECS group** (twelve tasks),
      not the two the README names, and the stated rationale that agora
      authenticates nothing is false.
- [ ] **With `enable_cdn = true` and no domain, the shipped defaults, CloudFront
      reaches the ALB over `http-only`**, sending Authorization headers and
      cookies across the public internet in cleartext.
- [ ] Also unrecorded: GuardDuty and the Route53 zone are both created
      unconditionally and fail or duplicate against an existing one; the RDS
      engine minor is pinned to `16.4`; the ALB CloudWatch alarms are wired with
      the DNS name where the dimension needs the ARN suffix, so they silently
      report no data; ElastiCache and SQS are provisioned with no consumer.

### Doc-fix work not yet applied

Doc edits landed for agora, collecta, fenestra, fluvius, geodukt, geogit, geokode,
geolang, geoplumb, infrastructure, interiora, itinera, jung and panoptes. Still
to do, because the pass was interrupted:

- [ ] **ptolemy** `docs/index.html` and `docs/comparison.html` (README done). These
      hold the multi-tenancy claims, which migration 028 deleted from the product,
      and the "32 topology rule types, full Esri-equivalent set implemented" cell.
      `comparison.html`'s "42 full parity of 48" is wrong by at least 12 cells.
- [ ] **terravista** and **projicio** `docs/index.html` (READMEs done).
- [ ] **terrano**, **verne**, **topoi**, **sibyl**, **nubis**: nothing applied yet.
- [ ] **tiletopia** and **viewtopia**: validated, no doc edits applied. These are
      the two largest sets of findings in the sweep.
- [ ] **GeoLang.github.io**, the org landing page: never validated.

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
      platform compose wires it (see geolang's DESIGN.md and README). The
      bearer question closed 2026-08-12: geolang exchanges the caller's JWT at
      the tool boundary for a five-minute token carrying only that tool's
      operation scopes, and ptolemy, geodukt, tiletopia and agora each enforce
      the scope claim (per-repo changelogs).

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

## PLANS — the bigger features, written up 2026-08-13

Each of these is too big to hand an agent cold. Written as a plan rather than a
line item so the next session starts from the shape rather than rediscovering it.

### Hosted flagship instance, the thesis blocker

Hosting was deferred by owner decision 2026-08-13, so everything in this section
is parked with it, along with the hosted stack decisions, the database TLS
operator steps, the CloudFront realtime test and geoplumb in-region serving. It
is still the thesis blocker, because the thesis is "click a link, you're in the
map" and nothing else delivers that.

State: the executor precondition closed 2026-08-09, the tool-boundary token
exchange closed 2026-08-12, and the 2026-08-13 terraform pass closed force_ssl,
immutable tags, the agora and jupyter security group splits, and the ALB
restriction. So the infrastructure is no longer the blocker.

What actually stands in the way, in order:
1. **the AWS account decision** (open since 2026-08-05, also blocks geoplumb
   in-region serving). Nothing proceeds without it. It is money and ops, not
   engineering.
2. **four owner calls**, each listed under platform hygiene above: ptolemy
   classifying every GET as public, terraform CI moving to OIDC, the S3 state
   backend needing a bucket, and the executor's 8081 admitting the VPC CIDR.
   Only the first is a genuine blocker for a public domain. The other three are
   things you would regret later rather than at launch.
3. **the mechanical apply blockers**, in infrastructure's README: the geolang
   image must contain application source (its Dockerfile installs requirements
   and never copies `src/`, because compose bind-mounts the repo in), every
   enabled ECR image must be pushed under `image_tag`, EFS spatial and coverage
   data staged, every secret container given a value including the two database
   URLs with `sslmode=verify-full`, and DNS delegation plus ACM validation
   completed when the platform profile uses `geolang.com`.
   Two doc bugs to fix while in there: `README.md:210` still lists "must be
   built with a sqlx TLS backend" as a blocker, which ptolemy and agora both
   closed (each names `tls-rustls-ring`), and `modules/database/main.tf:154`
   tells the operator to use `sslmode=require`, which `README.md:39` forbids and
   which buys encryption with no authentication.
4. **share-link policy**, not the links themselves. Share links are built, and
   have been since agora's first migration: create, revoke and resolve, a
   `view` or `edit` role per link, and `resolve_link` mints an anonymous guest
   session (`sub` = `guest-<uuid>`, 12 hours) whose entire surface is the
   websocket, since every other route requires a platform JWT. Role is re-read
   from the row on each connect, so revoking kills the next handshake but not a
   socket already open. What is actually open is policy: links never expire
   (there is no expiry column, only `revoked`), and whether a public instance
   should hand an anonymous guest an `edit` role at all is a product decision
   nobody has made.

Suggested order: deploy privately first, prove the stack runs in-region, then
settle the anonymous-edit and link-expiry questions against a real instance.

### Live layer, if you want fluvius wired in

Decided 2026-08-13 that a sensor historian is off-thesis but a live layer is not.
The plan, should it ever be wanted: fluvius emits over its existing WebSocket
sink into agora, which already carries live multiplayer, and viewtopia renders it
as an ordinary layer whose features move. No new ingest path, no new store, no
observation history. This also answers FleetPanel, which is the same gap.

Unknowns to settle first: whether agora's attachment model can carry a
high-frequency feed without competing with collaboration traffic, and what
happens to a live layer's features when a user edits or saves the map.

### terravista v0.3, the remaining advertised-vs-real gap

terravista is at v0.4. Since the v0.2 entry was written it also gained per-layer
vector styling and layer-name readback over the FFI (50 symbols to 59), an
on-disk tile cache, pinned offline regions with download, progress and cancel,
TVPK tile packages, and an Android CI job building the AAR and the sample APK.
v0.3 in the README's roadmap is the Metal and Vulkan backends, still unstarted,
still needing platform GPU toolchains: real implementation work rather than
decisions.

Worth saying plainly: this is post-v1 by the existing phasing, and it competes
with the hosted flagship for attention. The labelling half is already done, the
README says plainly it is not a Mapbox replacement, so what is left to decide is
whether to build the GPU backends at all.

### verne, the next adapter

Blocked on real customer data rather than on engineering. verne is at v0.4 and
reads three sources: KML/KMZ, the Esri File Geodatabase, and hosted ArcGIS
feature services over REST including attachments and relationship classes. All
three are Esri or KML, so "the next adapter" is still genuinely open. The
recorded demand order puts photogrammetry and reality-capture next, then
CAD-adjacent platforms. Check any candidate
against GDAL's driver list before committing, and do not assume a reader exists.
The enterprise version tree is separately blocked on an enterprise deployment to
test against, with requirements documented under the verne section below.

### viewtopia product gaps: closed 2026-08-13

Both shipped: the Data Sources panel (Services, Database and Files tabs, old
panel ids open the right tab) and the print layout panel (page composition
with title, legend, scale bar and north arrow, PDF export, atlas capped at 60
pages, the old PrintExportPanel absorbed with its id aliased). Print-resolution
rendering shipped too: `printMap.ts` builds a second off-screen MapLibre map at
the page's own pixel size. One limit is left, worth keeping: Cesium and any
non-MapLibre renderer still fall back to the live frame scaled to the page, so
a 300 DPI page carries screen-resolution pixels there, and Leaflet cannot be
captured at all because its tiles are img elements.

## FEATURE — region watch: IoT sensors and change over time

One feature with two halves: a region you care about, watched over time, fed by
live sensor streams and by imagery, alerting when it changes.

**Parked 2026-08-13**, no use case available to test against. Written up while it
was fresh rather than built. Nothing here is in progress. Pick it up when a real
region and a real feed exist to point it at, since every open question below
needs a concrete case to answer well.

**What already exists**, verified rather than assumed:

- **fluvius** is a real stream processor, not a stub. Geofencing with per-entity
  state, complex event processing, tumbling/sliding/session windows, watermarks,
  temporal joins, an rstar R-tree, and MQTT, Kafka and WebSocket connectors. 187
  test functions, 181 passing under `--all-features`. The "millions of entities"
  the README claims is a design target rather than a measurement: the repo has
  no benchmarks and no test above trivial scale. It is deployed nowhere: no
  reference in the terraform, the platform compose, or the proxy Caddyfile.
- **geoplumb** already answers the hard half of region change. `POST
  /zonal/{layer}` returns zonal statistics over a region and `POST
  /zonal/{layer}/series` returns a time series, on demand, against STAC
  collections or local COGs. That is region change tracking already, missing only
  persistence and a schedule.
- **terrano** has `RasterStack`: composites, linear trend fitting, change
  detection, anomaly z-scores, phenology metrics, normalized difference indices.
- **panoptes** does pixel-difference change detection, plus an ONNX segmentation
  path that works but ships no weights.
- **ptolemy** versions features with branch, diff, merge and audit, so change over
  time on *vector* data is already a solved problem here.
- **viewtopia** has TimelinePanel, TimelapsePanel and HeatmapPanel.
- **tiletopia** carries one written, unit-tested but unwired module worth
  reusing here: `scripting.rs` (threshold triggers, comparison operators, alert
  severities). It is referenced only by its `pub mod` line, no route and no
  `AppState` field constructs it, so wiring it is route work, not engine work.
  `geofence.rs` is not spatial geofencing despite the name: it is data-residency
  policy (`DataRegion`, `StorageNode`, `ResidencyPolicy`, `ComplianceReport`)
  and buys nothing here. The realtime WebSocket is real but carries a closed
  enum of six collaboration messages and logs-and-drops anything else, so a
  sensor feed through it needs a new message variant, not a new socket. The
  sensor claims audit (tiletopia 2026-08-14, panoptes 2026-08-13) removed the
  README claims these backed.

**What is missing**, in dependency order:

1. **the watch object.** A persisted region plus its sources, rule and cadence.
   Nothing holds one. Decide where it lives: ptolemy already versions geometry
   and would give diff and audit for free, but a watch is configuration rather
   than a feature, so it may not belong in a feature store.
2. **the scheduler.** Something has to re-run the pull and compare. geoplumb is
   pull-only by design and computes only when asked. Do not put a scheduler
   inside it, that breaks its one architectural rule. The trigger belongs
   outside. Check the prior art before writing one: tiletopia already mounts a
   scheduler-shaped facade, with a cron/interval/one-shot `Schedule` enum, real
   cron parsing and three GET routes. It has never run a job. It serves
   fabricated demo jobs from memory, `spawn()` is called from nowhere, the
   default executor only formats a log line, cron expressions are ignored on
   creation (any cron schedule returns now plus one hour), and no route creates
   a job. Replace or delete it, do not start from it.
3. **the result store.** A per-watch time series of readings and detected
   changes. This is the real observation-store gap. For raster it is small, one
   row per run per region. For high-frequency sensors it is not, and that is the
   piece that quietly turns into an IoT platform if left unbounded. Bound it up
   front with a retention window and a per-watch cap.
4. **alerting.** fluvius already does thresholds and CEP over streams. On the
   raster side the rule is a threshold on a zonal statistic or a z-score.
   Delivery is not the open question it looks like: it is already written twice
   and driven zero times. `ptolemy-api/src/delivery.rs` has an HMAC-SHA256
   signing webhook worker with retries that nothing spawns, and tiletopia's
   `webhooks.rs` has another whose `process_pending` nothing calls, whose
   subscriptions are seeded demo data, and whose only routes are read-only.
   Give one of those a caller instead of writing a third.
5. **sensor ingest.** fluvius deployed as a service with MQTT and WebSocket
   sources, emitting into agora so viewtopia renders it as an ordinary layer
   whose features move. No new ingest path and no new store, since agora already
   carries live multiplayer. This also answers FleetPanel, which is the same gap.

**Sequencing.** Raster first: a watch over a region with a scheduled
`/zonal/series` call, a threshold and a webhook is a working, useful feature that
needs no new compute at all. Sensors second, because that half needs fluvius
deployed and the bounded store designed. Splitting it this way means something
ships before the expensive part starts.

**Open questions to settle before building:**

- whether watch results belong in ptolemy as versioned features, which brings
  diff and audit for free, or in their own store
- retention, per watch, for sensor readings. Decide the number before writing the
  store, not after
- what a shared or anonymous viewer sees of a watch, which ties to hosted share
  links
- whether the sensor half should speak OGC SensorThings API or a private schema.
  SensorThings is the standard and buys interoperability, but it is a large
  surface to implement and nothing in the tree speaks it today
- whether agora can carry a high-frequency feed without competing with
  collaboration traffic, and what a live layer's features do when a user saves
  the map

**Scope note, recorded once.** This is the largest addition in the backlog and it
competes with the hosted flagship for attention. The raster-first sequencing is
what keeps it affordable, because it reuses geoplumb wholesale.

- [ ] **if any of this is wanted, the in-thesis version is a live layer, not a
      sensor platform**: fluvius emitting over WebSocket into agora, which
      already carries live multiplayer. One connector, reusing shipped
      infrastructure. It also answers the FleetPanel question below, since
      "nothing serves vehicle positions" is the same gap. A live layer is
      Figma-shaped. A sensor historian is not.

Note on `viewtopia/docs/verticals.md`: it is a planning doc for proposed
verticals, not a description of what exists, which is why it credits panoptes
with observation management and sensor monitoring that panoptes never did. Read
it as a wishlist.

## OPEN — stale entries keep turning up

Three items in this file were closed already when someone went to work on them:
ptolemy's `/check` org_members fallback (the org schema was dropped in migration
028), collecta media attachments (implemented in `ea8f66d` and `b4dfc7e`), and
collecta's "deferred" per-form grants table (it exists as `form_grants`). In each
case the entry named a mechanism that no longer existed, and in the ptolemy case
a real bug was still there for a different reason.

- [ ] Verify an entry against the code before working it, and do not trust the
      mechanism it names.

      The 2026-08-18 re-verification found this section had itself gone stale in
      four places, which is the point of the entry.

      Still current, with evidence: the ptolemy topology raw-writes gap
      (`ci/no-raw-writes.sh` documents in its own header that it cannot see a
      mutating function called through `SELECT`, though it names only two of the
      three sites and misses the `ST_Simplify(TopoGeom_addElement(...))` call);
      tiletopia's Ion-compat endpoint; and ptolemy's merge, attribute-level for
      disjoint keys as of 2026-08-15.

      The geoprocessing NULL panic is real but latent: `merge` and `simplify`
      were fixed 2026-08-13 and contour was deliberately left, because no
      PostGIS build ships `ST_ContourLines`, so that route answers 501 first.

      Corrected here rather than left to mislead a third time:
      - **the terrain wiring is done**, and this same file already says so
        further down. It should never have been on the confirmed-current list.
      - **collecta legacy-form access fails closed, not open.** A legacy form
        with no creator is admin-only for both read and write and is never
        backfilled. What actually bypasses `form_grants` is not legacy-specific:
        form discovery answers any authenticated caller and submission is
        role-only, both pinned by tests as intended behaviour.
      - **the viewtopia data source manager and print layout panels both
        exist.** Each is imported and registered in `ToolPanels.tsx` with a menu
        entry carrying no preview flag, and `PrintExportPanel.tsx` is gone from
        the tree. The registry names 70 panels, not 67. The old sentence was
        written at 22:20 on 2026-08-13, when 67 was correct, and both panels
        landed that same evening at 23:17 and 23:43.
      - **tiletopia's `GET /assets/{id}` is not "no check at all".** It applies
        no authorization, but it is absent from `is_public_read`, so it needs a
        valid token: any valid token reads any asset's metadata. The Ion-compat
        `/v1/assets/{id}` is genuinely public, and so is every asset's
        `tileset.json` and tile payload, which is a larger exposure than the
        metadata this entry focuses on.

      The NL agent `sql_query` bypass is real: `TOOL_RUNS_CALLER_CODE = True` is
      declared only on sql_query, plan steps carry the flag, and the approval
      panel labels such a step rather than gating it, with the discouragement
      living in the persona text. It is bounded to `/chat`, since `/mcp` drops
      the tool from both the manifest and the call path. tiletopia annotation
      reads answer for any valid token while writes go through
      `may_modify_asset`.

## OPEN — platform hygiene

- [ ] **CloudFront realtime WS untested live**: the realtime behavior forwards
      `Sec-WebSocket-Protocol` and has a zero TTL, but the distribution has never
      carried a real collaboration session. Test it on the deployed distribution.
- [ ] **hosted stack decisions before a public deploy** (from the 2026-08-13
      security review of the hosted terraform). The mechanical half closed the
      same day, see the in-flight section. What is left needs an owner call:
      - ptolemy classifies GET/HEAD/OPTIONS as public, so reads are anonymous on
        a public domain. Narrower than it sounds, and worse in two specific
        places. It is scoped to public datasets: the visibility middleware
        answers 404 for any uuid that resolves to a private dataset, and every
        listing filters to `visibility = 'public'` in SQL, pinned by
        `test_private_dataset_is_absent_from_every_listing`. The two real gaps
        are below, and neither is an owner call, both are bugs.
      - the terraform plan CI job authenticates with long-lived AWS access
        keys rather than OIDC. The job is gated to `workflow_dispatch` and the
        workflow grants only `contents: read`, which bounds the blast radius.
      - the S3 state backend is commented out, terraform state is local only.
        Needs a bucket that does not exist yet.
      - the executor's inbound 8081 admits the whole VPC CIDR (a security group
        reference cycle prevents naming geolang-api's group), so
        `GEOLANG_EXECUTOR_SECRET` is the only guard on it.
- [ ] **ptolemy topology reads are anonymous, and this one is a bug rather than
      an owner call.** `/api/v1/topologies/{name}/faces`, `/edges` and `/nodes`
      are keyed by name rather than uuid, so `referenced_ids` comes back empty
      and the visibility middleware passes them straight through. They return
      face bounds and edge and node geometry with no check at all. Alongside
      that, `GET /api/v1/datasets/{id}/topologies` discards the dataset id and
      lists every topology in the instance, so any public dataset id enumerates
      the names. Nothing binds a topology to a dataset today, so whether this
      can expose private geometry is undetermined. Settle that first, then
      either bind topologies to datasets or gate the routes.
- [ ] **`GET /api/v1/replication/peers` is public.** Its Admin classification is
      unreachable, because the read-is-public rule returns first for any GET. It
      exposes peer names, endpoint URLs and sync state, though no credential
      field. The fix is ordering: match replication before the read rule.
- [ ] **database TLS is opt-in per operator, not enforced in code.** With
      `rds.force_ssl` now on, a service reaches its database only over TLS, but
      whether that TLS is *verified* rests on the connection string an operator
      pastes into Secrets Manager. sqlx makes this worse than it looks: under
      `sslmode=require` it installs a verifier that returns Ok for any
      certificate and ignores `sslrootcert` entirely, contradicting its own doc
      comment, so `require` buys encryption with no authentication and anything
      answering in the database's place can read and rewrite the session. Only
      `verify-ca` and `verify-full` check the chain. The URLs must therefore end
      in `?sslmode=verify-full&sslrootcert=/etc/ssl/rds-global-bundle.pem` and
      must name the RDS endpoint directly, since a CNAME in front of it fails
      hostname verification. Neither ptolemy nor agora enforces this in code,
      because doing so would break local and CI postgres, which have no TLS.
      Decide whether a hosted-only check is worth having. Also note the service
      images now fetch the CA bundle unpinned at build time, so rebuilds pick up
      CA rotations automatically and reproducibility rests on AWS.

      Both agents reached the `require` finding independently and both reproduced
      it live: `sslmode=require` connects happily to a cert signed by an untrusted
      CA with a mismatched hostname. It also diverges from libpq, where a present
      root CA file silently upgrades `require` to `verify-ca`. sqlx does no such
      thing, so an operator pasting AWS's own `require` guidance plus an
      `sslrootcert` gets zero verification and no warning.

      Operator steps, since neither service can enforce this itself:
      - `ptolemy_database_url` and `agora_database_url` must both end in
        `?sslmode=verify-full&sslrootcert=/etc/ssl/rds-global-bundle.pem`.
        Without the `sslmode`, ptolemy defaults to `prefer` and reaches RDS over
        unverified TLS rather than failing.
      - `PTOLEMY_EXTERNAL_DATABASE_URL`, if set, needs the same two parameters.
      - assumes the deployment reaches RDS directly rather than through RDS
        Proxy, which uses ACM certificates and would not need this bundle.

## OPEN — dependencies and supply chain (2026-08-12)

Renovate grouped four breaking cargo bumps into one "non-major" PR, because it
classifies major/minor/patch positionally and a `0.x` minor bump is still a
minor to it. The shared config now guards both the cargo and npm groups with
`isBreaking != true`, so breaking updates arrive as separate PRs. What that
left open:

- [ ] **h2 0.4.14 is a fixable advisory and nothing has taken it** (found
      2026-08-18). RUSTSEC-2026-0258, unbounded empty DATA frames. cargo-deny
      says upgrade to >= 0.4.16, and `cargo update -p h2 --dry-run` confirms it
      locks cleanly in ptolemy, geodukt, geokode and itinera. fenestra and
      tiletopia carry 0.4.14 as well, and tiletopia additionally carries 0.3.27,
      whose range was not checked. Lockfile-only across six repos.
- [ ] **advisories nobody can upgrade out of (2026-08-12, re-checked
      2026-08-18).** `cargo deny check advisories` fails in ptolemy, geodukt,
      geokode and itinera. That is four of roughly twenty Rust repos, not all of
      them: agora, checked as a fifth, reports clean. CI stays green anyway,
      because each of the four runs that step with `continue-on-error: true`, so
      it reports without gating, which is the right policy while the fixes are
      not ours to make. The preceding `check licenses sources bans` step carries
      no such flag and does gate. The point of this entry is that the findings
      are real even though nothing goes red.

      Cleared 2026-08-12: `crossbeam-epoch` to 0.9.20 in all four
      (RUSTSEC-2026-0204) and `anyhow` to 1.0.104 in ptolemy
      (RUSTSEC-2026-0190). Both were lockfile-only.

      Outstanding, none of these fixable from here (h2 above is, and is
      separate). Two of them print a "try `cargo update -p ...`" hint that does
      not work, because the version they want is a major ahead of what a
      transitive dependency requires, so cargo locks nothing. Verify with
      `--dry-run` before believing that hint again.
      - ptolemy: `rsa` 0.9.10, the Marvin timing sidechannel
        (RUSTSEC-2023-0071), through `openidconnect` 4.0.1. Not through
        sqlx-postgres, which is in the tree but does not reach `rsa`. No
        upgrade published. ptolemy also warns on yanked `spin` 0.9.8.
      - geodukt: `quick-xml` 0.37.5, two denial-of-service advisories
        (RUSTSEC-2026-0194, -0195). Wants >= 0.41 but `object_store` 0.11.2
        pins `^0.37`. Also `rustls-pemfile` through the same `object_store`
        (RUSTSEC-2025-0134, unmaintained, no safe upgrade).
      - geokode: `protobuf` 2.28.0 uncontrolled-recursion crash
        (RUSTSEC-2024-0437). Wants >= 3.7.2 but `osmpbfreader` 0.16.1 pins
        `^2.28`. Also `bincode` 1.3.3 and `smartstring` 1.0.1, both
        unmaintained with no successor version (RUSTSEC-2025-0141, -2026-0249).
      - itinera: `bincode` 1.3.3, same as geokode's.
- [ ] **geodukt and ptolemy each carry digest 0.10 and 0.11 at once.** In
      geodukt it is `md-5` 0.10 reaching the graph through `object_store`, and
      the duplicate is `digest` alone, since geodukt holds a single `sha2`
      (0.11). In ptolemy it is sqlx 0.8, mongodb 3.7 and openidconnect 4.0, all
      still on sha2 0.10, so the 0.11 bump added a second copy rather than
      replacing one, and ptolemy duplicates both `digest` and `sha2`.
      `deny.toml` warns on duplicates rather than failing in both, so CI is
      green. Each resolves itself when those upstreams move. geokode and itinera
      took the same bump with no duplicate, so this is not inherent to sha2
      0.11. agora is deliberately not in this entry: it never took the bump, so
      it holds one copy of each and is simply a version behind.
- [!] **enable the dependency graph for GeoLang repos, an owner-only click.**
      Diagnosed 2026-08-13: the graph is DISABLED for viewtopia (and every
      GeoLang repo probed, their SBOM endpoints all 404), because GitHub turned
      it off by default for new public repos in May 2025 and this org never
      enabled it, while Dependabot alerts stayed on. Alerts therefore keep
      matching new advisories against the last snapshot ever computed, taken
      from `package-lock.json` before the pnpm migration deleted it, which is
      why all 23 alerts carry that manifest path and ghosts keep firing on
      ranges the tree left long ago (alert 19, dompurify, is such a ghost: the
      tree holds 3.4.13, past the fix). Re-checked 2026-08-18: the graph is
      still off, every SBOM endpoint still 404s, and alert 19 is now the only
      one still open. Two nanoid alerts (23 and 25) were auto-dismissed, the
      newer of them on 2026-08-17, but the tree does hold nanoid 3.3.16, inside
      alert 25's `< 3.3.18` range, so that one is not a manifest ghost. No workflow can help, the
      submission API 404s while the graph is off, and none is needed: pnpm v9
      lockfiles parse natively once it is on. Fix is owner-only, either per repo
      (Settings, Advanced Security, Dependency graph, Enable) or org-wide via a
      code-security configuration with `dependency_graph: enabled` attached to
      all repos without one (needs `write:org`, which the local gh token lacks).
      After enabling, the SBOM endpoint should return ~1000 packages and the
      alerts should re-resolve against `pnpm-lock.yaml`; whether stale alerts
      auto-close was not verifiable in advance, so check alert 19 and dismiss it
      by hand if it survives.
- [ ] **viewtopia's two `image-size` advisories have no fix published.** Both
      are denial of service through infinite loops in the JXL, HEIF and ICNS
      parsers. The tree holds `image-size` 0.7.5 through `texture-compressor`
      under `@loaders.gl/textures` 4.4.3, which is deck.gl's loader family
      rather than deck.gl itself. GitHub still reports no patched version. Both
      alerts were dismissed by hand on 2026-08-13 as not-used, on the sharper
      ground that those parsers only run in texture-compressor's Node CLI path
      and never in the browser bundle. The `dompurify` advisory alongside them was investigated and is
      NOT reachable here: it needs `IN_PLACE` sanitizing with hook removal,
      viewtopia disables the Cesium InfoBox, and cesium 26.1.0 calls DOMPurify
      in one place only, `Credit.js`, in the string-returning mode. Recorded so
      nobody investigates it twice.

      The fourth alert, `postcss` (CVE-2026-69153, an attacker-chosen
      `sourceMappingURL` reading arbitrary `.map` files when `from` is unset),
      was dismissed as stale: it named `package-lock.json`, which the pnpm
      migration deleted, and the root lockfile is on 8.5.25, past the 8.5.23
      fix. What it did not report is real: `dashboard/pnpm-lock.yaml` carries
      8.4.31 as well, from `next@15.5.22`, whose package.json requires that
      exact version with no range, so no update moves it and only a pnpm
      override would. Left alone because it is build-time and
      development-scope, and the dashboard compiles only its own stylesheets,
      so no CSS anyone else chose reaches postcss.

## OPEN — post-MVP: tiletopia tile edge caching (decided 2026-07-28)

CloudFront now matches the public `/tiles/v1/assets/*/…` and `/tiles/v1/terrain/*`
paths the viewer uses. The remaining post-MVP question is hosting tiles on a
separate host (`tiles.<domain>`) so authenticated API paths and public tiles
do not share a prefix, if private-asset tile gating ever ships.

## OPEN — deferred decision: private-asset tile gating

- [ ] tiletopia serves every asset's tiles and `tileset.json` publicly
      (`is_public_read`), even for private assets: anyone holding the asset id
      can read them. The asset listing is no longer public, it filters to what
      the caller may see, so the tile payload is the open part. The
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
      escape-hatch step before approval, and PlanPanel marks it. Marking it is
      as far as it goes: the owner decided 2026-08-12 that approval costs no
      extra click, because gating it means sql_query emitting a one-step plan
      instead of a viewer command, which adds a click to every ad-hoc query.
      Still open: sql_query called on its own bypasses the plan surface
      entirely, so it stays persona-discouraged there.
- [~] **permission-aware enforcement**: the far end is now enforced in every
      service (per-repo changelogs): tiletopia gates annotations, plugin
      mutations and the asset listing, collecta enforces roles and form
      ownership, geolang requires a platform JWT on everything that runs code,
      writes a file or reads back user data (chat, sessions, uploads, outputs),
      and geodukt's `/run` takes an editor-or-admin platform token or a
      role-free tool token carrying the exact `geodukt:run` scope, both on the
      shared secret. The org schema
      that the write ladder never read was dropped (ptolemy migration 028).
      Unknown role strings fail closed everywhere.
- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.

## OPEN — ptolemy: what the write guard still leaves open (2026-07-30)

The runtime gate and the compile-time guard both shipped (history log). What is
left is the edges neither reaches.

- [ ] `ci/no-raw-writes.sh` cannot see a mutating Postgres function called through
      `SELECT`. `topology.rs` does exactly that (`SELECT topology.CreateTopology`,
      `AddFace`, `TopoGeom_addElement`), so those three routes are guarded only by
      being instance-admin-only in `auth.rs`. If topology is ever bound to a
      dataset, they need the ladder and the check needs to learn about them.
- [ ] `unguarded_pool()` exists because the CLI and the test fixtures are separate
      crates and could not use a crate-private accessor. Nothing in
      `ptolemy-api/src` may name it and the CI check enforces that, but the check
      is scoped to that directory, so the api crate's own integration tests do
      use it. It is a named accessor rather than a barrier. Revisit if the CLI
      ever grows a path that should be laddered.
- [ ] None of the above decides anything when auth is off, which is now
      `PTOLEMY_AUTH_DISABLED=true` rather than an empty `PTOLEMY_JWT_SECRET`:
      the serve path uses the strict config, which refuses an empty secret
      outright. With auth off the permission check passes and the read
      visibility layer no-ops, but the write ladder still resolves the target
      and still refuses one that does not exist or is an external read-only
      table.
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
Decided against 2026-08-13: keeping the script that generated the request-body
table. The table is `const BODY` in `route_sweep.rs` and holds 93 entries, not
130, which was a rough count across three tables. Its values are domain-tuned
rather than derivable from struct shapes: 34 carry fixture-id markers, 11 carry
WKB hex and 2 more carry GeoJSON, and the sweep's whole point is that the
handler reached SQL,
which needs values that pass validation. It also self-maintains, since adding a
route that refuses `{}` fails the sweep by name.

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
      one layer with the operator's token or one it mints itself, and carries
      the untransformed originals. The loader is no longer unchanged: it commits
      deltas, posts each layer's drawing info as one symbology rule, and applies
      attachment adds, replacements and deletes. Still open:
      - the version tree. verne reads any named version (`--gdb-version`, one
        per extraction), names which layers front versioned data and change
        tracking, and implements `extractChanges` as the preferred delta path
        with a local diff fallback. What stays open is carrying the tree itself,
        which means the VersionManagementServer resource: its `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license. That needs an enterprise
        deployment verne may exercise. The ptolemy mapping is no longer a
        blocker on it: the sidecar carries insert, update and delete ops, and a
        persisted objectid-to-feature-id index (`object-ids/`) survives across
        extractions.
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
- [ ] **what the Esri report cannot land, by category** (from the GDAL feasibility
      pass and v0.2's own verdicts):
      - domains lose their field binding (ptolemy binds a domain to a field only
        through a subtype), their description, non-default split/merge policies and
        bound inclusivity.
      - relationship classes lose the origin's own primary key (the origin
        foreign key is carried), aggregation as distinct from composition
        (`is_composite` now travels end to end, so the vocabulary is two-valued
        and a partial-ownership class cannot be stated), and the many-to-many
        mapping table's own attributes. GDAL models no relationship rules or
        notification at all.
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

Runs take `thread_id` (2026-08-15). The stored `active` session row, one per
database rather than a process-wide flag, is only the fallback for headless
callers with no thread. Activate/switch stays for the
session list UI.

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
- [ ] **collecta legacy forms with no creator are admin-only** and are not
      backfilled to anyone. Decide whether to backfill or leave them.

      The rest of this entry is closed and was stale when read on 2026-08-13:
      the per-form grants table it called "deferred" exists as `form_grants`,
      with `grant_form`, `revoke_form`, `has_grant` and `list_grants` in
      `crates/collecta-server/src/store.rs`, and `require_read` admits the form
      creator, an admin, or a grantee. A read-only analyst over someone else's
      data is a supported case.
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

Format conversion is closed on both halves: raster on 2026-08-13 (multi-band
COG from the browser through terrano-wasm `writeCogBands`) and vector on
2026-08-06 (GeoParquet, FlatGeobuf, GeoJSON, PMTiles, with per-layer PMTiles
export from 2026-08-02). A durable lesson from the terrano COG pass: a green
COG-validator run is not evidence unless the output names the overviews, the
old writer passed vacuously while omitting them.

High value, product-level:

- [ ] **symbology, the one piece left**: a data-defined point size does not reach
      QML. QGIS sizes a symbol in the symbol's own units and needs a
      `<data_defined_properties>` block whose exact spelling nobody here has
      verified against a real QGIS writer, so the export reports the loss rather
      than guessing. Closing it needs a `.qml` written by an actual QGIS to read
      the encoding off. Everything else in the first cut is done.
Medium value:

- [ ] **offline area download**: regions download and the app shell is
      service-worker cached. What is left is in the offline story section
      below.

## OPEN: viewtopia offline story (audited 2026-07-30)

The sync layer is real: IndexedDB persistence (`src/offline/db.ts`, 12 stores),
online/offline detection, mutation queue with retry, three-way column-level
conflict merge, `offlineFetch()` API response cache. Data already loaded
survives reloads and syncs back, and a service worker precaches the built app
shell, so a reload with no network still boots the viewer. Everything below is
what does not work.

Closed 2026-08-13: viewtopia's terrain bundle picker. `GlobalTerrainPanel` fetches
the bundle list on mount and adds one option per name, an empty or failed fetch
leaves the panel otherwise unchanged, and the success status names the bundle
rather than always claiming Cesium World Terrain, which the old nested ternary
did. The rest of this entry is kept for the correction it records.

      This entry was wrong about the
      starting point: tiletopia already served `/api/v1/terrain/layer.json` and
      `/api/v1/terrain/{z}/{x}/{y}` as quantized mesh generated on demand, and
      `GlobalTerrainPanel.tsx` was already wired to it. The real gap was that
      those routes fall back to downloading SRTM from
      `elevation-tiles-prod.s3.amazonaws.com`, so they were never offline. The
      new bundle routes close that.

- [ ] **terrain bundle limits worth knowing** (each deliberate, none blocking):
      bundles are filesystem only, not S3/GCS, because `LocalStore::list` is one
      level deep while `S3Store::list` is recursive and un-paginated, so it sees
      only the S3 default page of 1000 keys and discovery would differ per
      backend. The availability walk touches every
      tile file, so a large bundle makes the layer.json request slow unless the
      bundle ships its own `available` array. (The third limit closed
      2026-08-13: an unreadable bundles directory now answers 500 with a logged
      reason instead of looking like an empty server.)
Closed 2026-08-13. Geocoding and routing already preferred the
platform, verified against geokode's and itinera's real response shapes. What was
missing was offline behaviour: both now go through `offlineFetch()` so a repeat
query answers from IndexedDB, and offline they raise a readable message instead
of returning empty, which the panels had been rendering as "no place matching"
and "no route found". Nominatim and public OSRM stay as fallbacks on purpose,
since geokode ships a small address dataset with no bbox biasing and itinera
routes only on the loaded extract, so a landmark or a cross-region route
genuinely needs them.

Open-elevation, open-meteo and Overpass are online only by decision, not
oversight: each is keyed by a freshly sampled line, view-bounds grid centres, or
a camera-derived bbox, so a cache entry would be written and never read. They now
refuse up front through `requireOnline()` rather than surfacing a raw fetch
failure.

## OPEN — geoplumb: gaps to Earth Engine parity (consolidated 2026-08-06)

The per-pull time axis and geoplumb-server shipped, so one graph now serves
any interval as on-demand composite tiles (the Timelapse panel is the proof).
What still separates it from GEE, engine details in geoplumb's DESIGN.md
Known limits:

- [ ] **composite latency on dense collections**: memory is bounded (folds peak
      at one wave, median and percentile reduce in strips under a fixed 4 Mi
      value budget), and since 2026-08-13 a strip reads only the items whose
      footprint reaches its own rows rather than the whole stack. What remains
      is that strips run one after another, so a stack deep enough to need N
      strips pays N passes of read latency, over the same distinct bytes since
      shared tiles come from the byte cache. geoplumb's own DESIGN.md still says
      the item list never narrows per strip, which that change contradicts.
- [ ] **in-region deployment**: cold pulls are bound by the residential
      link to us-west-2. Serving next to the data is the remaining latency
      lever; blocked on an AWS account decision (2026-08-05).
- [ ] **breadth**: GEE ships a huge operator library and charting/reduction
      over regions; geoplumb has hillshade, slope, aspect, map algebra, band
      math (arithmetic, comparisons, where, log/exp), reclassify, convolution,
      quality masking, focal statistics, composites through
      percentile/stddev/count, and zonal statistics plus per-step time series
      as pull drivers (2026-08-06) and as public server endpoints
      (POST /zonal/{layer} and /zonal/{layer}/series, 2026-08-07). The list
      above also omits mosaic, two-input algebra, reproject, rasterize/burn, the
      vector ops and LAS IDW gridding, all real elements. Grow by demand, not by
      checklist.
- [ ] **most of those operators are library-only, not reachable from a served
      layer.** `OpConfig` in geoplumb-server accepts `hillshade`, `bandmath`,
      `slope` and `aspect` and nothing else, so reclassify, focal statistics,
      quality masking, convolution, mosaic, reproject, rasterize and the vector
      ops exist in the engine but cannot be configured on a layer. Either widen
      `OpConfig` or say plainly that the server exposes four of them.

## OPEN — Phase 3 (mobile & ML breadth, after v1)

- [ ] **terravista v0.3** — Metal/Vulkan GPU rendering. Biggest advertised-vs-real gap; needs
      platform GPU toolchains.
- [ ] **panoptes model weights** — train or source one usable segmentation model and publish
      weights. The "keep it clearly labeled experimental" branch is done (2026-08-13), so
      nothing oversells itself now, but no weights exist and segmentation still does
      not work out of the box. The ONNX inference path is real and proven end to end from the
      CLI against a synthetic sigmoid model.
Closed 2026-08-13: the onnx test now runs in CI. A separate `onnx`
job downloads onnxruntime 1.20.1 from the microsoft/onnxruntime release, verifies
its sha256, exports `ORT_DYLIB_PATH`, then runs clippy and tests under the
feature. The default matrix is untouched, so the crate is still proven to build
and test with no ONNX Runtime present. `ort` cannot supply the runtime itself:
`load-dynamic` sets `ort-sys/disable-linking`, and that build script returns
before any download logic, so `download-binaries` would be a no-op.
- [ ] **viewtopia FleetPanel** — currently an honest "no live feed" state; nothing serves
      vehicle positions. Decide whether real-time fleet tracking is in scope before building
      a WS/ingest path for it. Same gap as the sensors section above, and the same answer
      applies: if it is in scope, the path is fluvius over WebSocket into agora rather than a
      new ingest path.

## OPEN — deferred design decisions (not bugs)

- [ ] ptolemy merge is **attribute-level** for disjoint property edits (shipped
      2026-08-15). Same-key and both-sides-moved-geometry still conflict.
- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.
- [ ] jung is already in the v1 path: ptolemy's `GET /style` uses `jung-esri`
      and terravista decodes tiles with `jung-mvt`. Its 322 tests cover parsing,
      expressions, classification and Esri translation alongside rendering, so
      "rendering-only coverage" was wrong. The open question is whether the
      off-render-path `jung-core` modules (MIL-STD, maritime, topographic, print
      layout, SLD) earn their keep, since nothing calls them.
