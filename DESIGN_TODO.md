# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> **An advertised feature that is not implemented is captured here as an open
> item.** Rewording the doc is the fallback, for a claim nobody intends to build.
> Ranked 2026-08-21 against the DESIGN.md goal: ship the viewer, the agent, and
> the services that make a shared map, not more surface. Pick from **Do next**.
> Do not start at a parked item.
> Last brought current: **2026-09-19**.
>
> Verify an entry against the code before working it, and do not trust the
> mechanism it names. Three items in this file were already closed when someone
> went to work on them, because the entry named a mechanism that no longer
> existed.

---

## Doc audit 2026-09-02, findings to address

README.md and docs/index.html in every repo were compared against the code on
2026-09-02 and edited in place, uncommitted. Open items only, an item is
deleted when it is done.

### Modules removed 2026-09-02, rebuild from history if wanted

Owner call 2026-09-02: library code that no route, command or manifest
reached was deleted rather than left advertising itself. Each entry names the
last commit that still has the file, so `git show <sha>:<path>` recovers it.
Wire one only when a user asks for the feature.

- [ ] geokode API keys with per-key rate limits, an offline index file, and a
  Rayon parallel batch geocoder. `crates/geokode-server/src/api_keys.rs`,
  `crates/geokode-server/src/hex.rs`, `crates/geokode-core/src/offline.rs`,
  `crates/geokode-core/src/batch.rs` at 0852bcc. The offline file would let a client geocode with no server and no
  rebuild from CSV or PBF. `/batch` stays sequential through
  `Geocoder::batch_forward`.
- [ ] itinera API keys with permissions and rate limit tiers, a copy of the
  geokode module. `crates/itinera-server/src/api_keys.rs` and `hex.rs` at
  a80e93c. Auth is
  platform JWT only.
- [ ] fenestra OGC API Processes request and response types, a server-side
  plugin trait with request and response hooks, and the four stub crates that
  implemented it: `fenestra-inspire` (CSW types and three INSPIRE substring
  checks), `fenestra-geofence` (rule types), `fenestra-printing` (PDF stub),
  `fenestra-cascade` (upstream URL rewrite and cache, no HTTP request).
  `crates/fenestra-core/src/processes.rs`, `crates/fenestra-core/src/plugin.rs`
  and `crates/fenestra-{inspire,geofence,printing,cascade}/` at 9be4e75. The
  server linked none of the four.
- [ ] geodukt database and object store connectors. `DatabaseConnector` trait
  for PostGIS, SQL Server and Oracle with a `PostGisConnector` whose reads
  returned nothing, an `object_store` builder for S3, GCS and Azure, and the
  empty `geodukt-plugins` crate. `crates/geodukt-io/src/database_io.rs`,
  `crates/geodukt-io/src/cloud_io.rs`, `crates/geodukt-plugins/` at d9f1b76.
  A manifest source or sink for object stores is the one piece that did real
  work.
- [ ] fluvius edge runtime (single-threaded ingest, map operators, buffered
  forward flush for constrained devices), trajectory prediction (linear and
  weighted extrapolation per entity plus an anomaly flag on distance from the
  prediction), and multi-tenant quotas with API keys.
  `crates/fluvius-core/src/edge.rs`, `predict.rs`, `tenant.rs` at a5023b8.
  Also the unused k-NN and radius queries on `SpatialIndex`.
- [ ] geogit feature-level three-way merge: auto-resolves non-overlapping
  deltas, merges column edits on the same feature, returns typed conflicts
  (both modified, modify versus delete) with a side-picking strategy.
  `crates/geogit-core/src/merge.rs` at d856b5d. `ggt merge` merges the
  GeoPackage bytes through git instead.
- [ ] ptolemy OTLP trace export. `crates/ptolemy-api/src/telemetry.rs`
  (`init_telemetry`, `TelemetryConfig`, `OtlpProtocol`) built a fmt layer and
  logged that the exporter crate was missing, the CLI never called it. At the
  2026-09-02 HEAD of ptolemy. Rebuilding means adding the opentelemetry crates
  to `ptolemy-api` and calling the init from `ptolemy-cli`.
- [ ] tiletopia `crates/tiletopia-cache`, a workspace member with no caller and
  no tests, and `GET /api/v1/assets/{id}/thumbnail`, which nothing ever wrote a
  file for. At 68313a8.
- [ ] tiletopia crdt, geofence and tenant modules, 13 unit tests and no
  caller. `crates/tiletopia-server/src/crdt.rs`, `geofence.rs`, `tenant.rs`
  at 71910e3. Agora region watches cover the live geofence case.
- [ ] tiletopia s3, gcs, azure and hybrid tile store backends, nothing
  constructed them (the CLI and server build `LocalStore` only), with the
  aws, cloud-storage and azure_storage crates, the deploy tile bucket and the
  MinIO compose service. `crates/tiletopia-store/src/{s3,gcs,azure,hybrid}.rs`
  at 818e00f.
- [ ] tiletopia 2D map tile demo engine: an XYZ proxy-and-cache `fetch_tile`
  no route reached, four sources and a MapLibre style compiled into the
  binary, TileJSON over them and fixed cache stats, served as
  `GET /api/v1/tiles/*`. `crates/tiletopia-server/src/map_tiles.rs` above the
  martin module at 79ba8fb. Tiles from built tilesets are served under
  `/martin`.

## Self-host preview release, follow-ups

The 0.x preview shipped 2026-09-16: every platform repo publishes
`ghcr.io/geolang/<repo>:<tag>` on a `v*` tag, viewtopia's release carries the
`geolang-platform-<tag>.tar.gz` bundle, and the golden path passed 35 of 35
against a stack pulled from those images alone. Pins live in
`docker-compose.release.yml` and are bumped by hand per release. Open:

- [ ] **No upgrade test yet.** The first release exists now, so the next one
      can bring up v0.2.0 with data, move to the next pins, and check ptolemy
      and agora migrations carry the data.

## Do next

Ordered 2026-08-30, hosting excluded.

0. **Weak eval tasks, per-task transcript work.** The chat default is
   Qwen3.5 (owner call 2026-09-01), so weakness is read off the
   `local:Qwen3.5-35B-A3B` profile against the 0.82 baseline 20260901T004124.
   The Qwen3.8 sweep (0.87, 20260902T000529) is a comparison only. No weak task
   has been scored yet against the geolang-api container carrying the trimmed
   `viewer_control` manifest, so the standing per-task numbers predate it.
   Next: the full 72-task Qwen3.5 sweep at `--repeat 3` against
   20260901T004124, blocked on hercules being down; sibyl is on Qwen3.8 until
   then, because switching back was refused while the provider was unreachable.
   Still weak, cause read from transcripts:
   - scenario-compare-within-25-metres and find-before-flying: the task
     prompt and the `find_feature` reads fixture were fixed in geolang
     5ad6d5c (2026-09-16), unscored until a model server is back. If either
     is still weak after the next sweep the cause is the model, not the task.
   - dataset ids: the model writes `road_network` or `ds_roads` for Road
     Network in about half the dataset runs, some after inventing a
     dataset.list result inside its own turn.
   - attach-a-remote-table and search-a-stac-collection, flaky: one run in
     three writes an ATTACH through sql_query or loops on asset_readings.

## P0 path to the intended product, 2026-08-22

P0 means a task blocks the stated product path: a team opens one hosted map,
loads real data, edits it with permission, asks the agent to analyze it, and
sees the result. Each task needs source, integration, and failure-path tests.
Numbers keep their original places, so a missing number is a closed item and
other documents citing "P0 item 5" still land on the right one.

1. **Make the hosted stack start from the published images.**
   Repositories: `infrastructure`, `geolang`, `viewtopia`, `tiletopia`,
   `ptolemy`, `agora`.
   - [x] Run `infrastructure/scripts/publish-images.sh` against the applied ECR
     repositories with one new `image_tag` (v0.1.0, viewtopia and the proxy,
     2026-09-19).
   - [ ] After the first AWS apply, populate the four operator-managed secrets,
     confirm both database URL versions are created, force one RDS rotation,
     and prove Ptolemy and Agora recover with healthy replacement tasks.
   - [x] Stage the required EFS data and confirm startup migrations (nothing to
     stage for the nine-service preview, migrations ran on first start
     2026-09-19).
   - [x] Prove the public route set with service health checks and one
     authenticated session (curl signup, token accepted by three services, one
     agent run, 2026-09-19).

7. **Chat-only viewer mode: a typed prompt reaches every capability that does
   not need the mouse.** Repositories: `viewtopia`, `geolang`. Owner call
   2026-08-25, plan under **Chat-only viewer mode** in the plans section.
   - [ ] `add_arcs` still has no catalogue entry, so the agent cannot reach it.
     It needs paired source and target points and no layer carries them. Owner
     call 2026-08-27: leave the handler in place unreached rather than delete
     it, because the spacetime co-travel analysis already produces paired
     entity segments and is the source it would draw from. Give it a
     layer-referencing action the day that pairing is exposed as a layer.

## Before any public deploy

### Hosted preview, live since 2026-09-19

Owner calls 2026-09-19: AWS account 000152811496 in us-east-1 (the owner is in
Toronto) under IAM user `geolang-deploy` (CLI profile `geolang`), nine services
(proxy, viewtopia, ptolemy, tiletopia, agora, geolang-api, executor, sibyl,
geodukt), no domain, Sibyl on Amazon Bedrock. Low cost is the constraint.

Live at https://d2dkw27j378mpo.cloudfront.net, applied from
`infrastructure/profiles/preview.tfvars` (138 resources, state in the
`geolang-terraform-state-000152811496` bucket in us-west-2). Verified the same
day: every enabled route answers through CloudFront, all nine tasks healthy on
Fargate Spot, a signup on tiletopia yields a token that ptolemy, agora and
geolang-api accept, and one chat run ("Fly the map to Monaco") geocoded,
downloaded Natural Earth into EFS and returned a map spec. The viewer loads in
headless Chromium with its canvas and toolbar.

Shape, all in `infrastructure` (README has the detail):

- one Aurora Serverless v2 PostgreSQL 17.10 cluster, min 0 ACU, auto-pause
  after 300 s, `rds.force_ssl` on, RDS Data API on. Ptolemy and agora are two
  databases on it with the master credential (the compose layout), the refresh
  Lambda created `agora` through the Data API on its first run. Ptolemy's
  delivery worker polls every 5 s and agora's watch tick every 30 s, so the
  cluster only pauses while the tasks are scaled to zero.
- no NAT gateway: tasks run in the public subnets with public IPs.
- Fargate Spot for every service, ptolemy health check on `/api/v1/healthz`.
- ghcr images for seven services, ECR builds for the Caddy proxy and viewtopia.
- `scripts/platform-scale.sh up|down`, plus a nightly scale-down at 23:00
  America/Toronto with no morning schedule.
- Sibyl calls `https://bedrock-mantle.us-east-1.api.aws/v1` with
  `openai.gpt-oss-120b` (active) and `qwen.qwen3-235b-a22b-2507`. Bedrock has
  no Qwen3.5 or 3.8, so the 0.82 eval baseline does not carry over.

Cost, us-east-1 list prices: about 5.50 USD a day while up, about 1.10 a day
scaled to zero (ALB, secrets, storage).

Owner calls 2026-09-19 (evening): no domain yet, the nightly scale-down
stays with manual scale-up, share links keep granting edit to guests.

Hardening shipped 2026-09-20 (geolang aa5a003, infrastructure 78af6d5,
live on the preview): every tool run happens in a pre-warmed worker
process with `GEOLANG_TOOL_MEMORY_LIMIT_MB`, `GEOLANG_TOOL_TIMEOUT_SECONDS`
and `GEOLANG_TOOL_MAX_CONCURRENT` (defaults 3072, 840, 2) and the executor
task runs at 8 GiB; closed `/api/*` gates answer 501 before ptolemy's
catch-all; agora connects with its own database role, moved across by the
refresh Lambda; a forced master password rotation was run and ptolemy and
agora came back healthy with no authentication failures. Watch out: the
23:00 Toronto scale-down fired in the middle of that test, so do not roll
services near 23:00.

- [ ] one viewer eval sweep against both Bedrock profiles to pick the default.

Accepted as is: the Bedrock key stays a long-term key (expires 2027-09-19,
rotate by hand before then, noted in the infrastructure README); the refresh
Lambda has no reserved concurrency because the account quota is 10, and an
overlapping run is a no-op by the equality check.


## Wait for demand

Parked until a real user, a real feed, or a real customer file exists. The
thesis is "a team makes and analyzes a map together in the browser". Refuse
feature-parity fights with ArcGIS, Felt, GEE, Palantir.

- [ ] **Low priority: feature ideas from the deleted tiletopia modules**
      (2026-08-31 sitting). The code was facade with no callers and is deleted,
      rebuild from git history if a real user asks. Recorded because the idea
      was real even though the code was not: reports and print export (if it
      returns, build map-to-PDF in viewtopia against the live view, with
      fenestra's printing stub, not tile-side), temporal tiles behind a time
      slider (waits for a dataset with a time column in real use), flythrough
      camera paths, arvr viewing, model_zoo, prediction and onnx_inference
      (panoptes now publishes building segmentation weights, so tile-side
      inference has one model it could run), encryption at rest (needs
      a key backend, probably ops rather than app code), federation peering
      (needs a second instance), whitelabel branding, cluster raft
      scaffolding, retention policies. Not recorded:
      scripting, cloud_store, priority_queue, dynamic_raster and marketplace,
      each a duplicate of a shipped implementation (agora region watch,
      tiletopia-store, scheduler.rs, geoplumb, the plugin registry).

- [ ] **Fluvius as a rules consumer of agora's readings stream.** Thresholds,
      geofences and proximity alerts over the live asset readings (see
      DESIGN.md section 2.0). Fluvius is not in the platform stack. Its
      `--source-bind` socket binds a listener, but `ws_remote_source` already
      connects out for a remote feed and `CheckpointManager` already persists,
      so what is missing is a topology source pointed at agora's document
      websocket and a sink pointed at `/feeds/ws` with a feed token.

- [ ] **a standalone e2e for creating a dashboard and adding a widget.** A
      dashboard needs a server project, so that path is covered only against
      the platform stack.

- [ ] **collecta publish follow-ups.** `POST /api/v1/forms/{id}/publish` is
      on-demand with the caller's token. Not built:
      automatic push on every submission (needs a service credential collecta
      would hold, and a call on who owns the datasets), republishing a
      submission edited after publish (collecta has no submission
      `updated_at`), and live refresh of the published layer for other viewers
      (dataset layers are pull-based).

- [ ] **ptolemy commit-time topology rules** (owner call 2026-08-24): build a
      real rule engine only when an Esri migration customer needs rule
      validation at commit time. PostGIS Topology proper stays either way.

- [ ] **tiletopia API keys on write routes** (owner call 2026-08-24): keys stay
      read-only until a machine writer exists. Feeding keys into
      `require_editor` changes that middleware's contract.

- [ ] **native vector-to-3D-Tiles** (owner call 2026-08-24): mago stays for
      GeoJSON/GeoPackage/KML as a subprocess, same call as tippecanoe. Build a
      native extrusion tiler only if the jar/JRE cost or a real workload
      demands it.

- [ ] **movement analytics as geolang agent tools** (owner call 2026-08-24):
      Space-Time v1 runs its analytics client-side; expose them to the agent
      only after the cube proves they are worth exposing.

- [ ] **a tile builder of our own** (owner call 2026-08-23, against): the hard
      parts are feature dropping per zoom, a tile size budget that only settles
      by encoding and re-encoding, a streaming disk sort so the input never has
      to fit in memory, and topology-preserving polygon simplification that
      does not leave slivers between neighbours. Fenestra's MVT encoder,
      topoi's Douglas-Peucker and geoplumb's pyramid walker cover none of
      those. Revisit only if running tippecanoe as a subprocess stops paying.

- [ ] **read-only warehouse sources** (weigh before building) — Felt reads
      Snowflake/BigQuery/Databricks live, enterprise-only. Ptolemy already
      does external read-only PostGIS tables; the same model could take a
      warehouse driver. Only worth it when a real user asks: it is
      enterprise-pull, and the thesis says refuse parity fights.

- [ ] **if any of this is wanted, the in-thesis version is a live layer, not a
      sensor platform**: the ingest half is built.
      Agora's `/feeds/ws` takes `Readings` frames under a feed token minted at
      feed creation, relays them to document subscribers, and viewtopia's
      `AssetRule` path colors assets by their latest reading end to end. What
      is missing is only a pusher: fluvius connecting out to `/feeds/ws` as a
      sink (its runner already connects out and checkpoints), plus feed-token
      lifecycle for it. A sensor historian stays off-thesis. Parked, no use
      case to test against.

- [ ] **viewtopia FleetPanel** — honest "no live feed" state; nothing serves
      vehicle positions. Narrower than the live-layer row now: readings ingest
      and relay exist, so this needs a position feed pushed into `/feeds/ws`
      (fluvius, same connector as above) and FleetPanel consuming position
      kinds from the `readings` frames it already receives via liveStore.

- [ ] **terravista GPU rendering** — Metal and Vulkan backends. Biggest
      advertised-vs-real gap on mobile, needs platform GPU toolchains,
      competes with the hosted flagship for attention. What is left to
      decide is whether to build the GPU backends at all.

- [ ] **terravista has no iOS or macOS anything.** No `.swift`, `.h`, `.modulemap`,
      `Package.swift` or podspec, no cbindgen config, no generated C header, no
      iOS CI job, and "macOS" appears nowhere in the codebase. The README's
      roadmap keeps a Metal backend and Swift Package Manager distribution as
      planned, and Metal needs the iOS binding first.

- [ ] **terravista's style engine is unreachable and does not parse Mapbox GL
      JSON.** The structs are snake_case serde derives with no renames, while real
      styles use `type`, `minzoom`, `paint["fill-color"]` and stop functions. No
      `tv_` FFI symbol touches the style module, so no host can supply one, and
      the renderer uses its own hardcoded style keyed by layer name.

- [ ] **the next adapter after Esri.** v0.1 covers KML/KMZ, v0.2 the Esri File
      Geodatabase. Pick the next from real customer data rather than
      guesses, and check it against GDAL's driver list before committing to it. The
      recorded order of demand puts the photogrammetry and reality-capture stacks
      next, then the CAD-adjacent platforms. Blocked on real customer data rather
      than on engineering. Full verne write-up under **Plans**.

- [ ] **geogit has no feature-aware merge.** `cmd_merge` calls `repo.merge`,
      which merges the GeoPackage bytes through plain `git merge`, so two edits
      to one feature become a binary conflict on a MessagePack blob and
      `geogit resolve` can only pick ours, theirs, ancestor, delete or the
      working copy. The stored encoding is Kart v3 since geogit cd5b44f,
      proven against two blobs from Kart's own test repos, and a custom CRS
      gets Kart's hashed srs id in the working copy. Left on that side: the
      GeoPackage importer names the CRS file after the source table's local
      srs id, where Kart reads the code out of the WKT.

- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.

- [ ] **symbology, the one piece left**: a data-defined point size does not reach
      QML. QGIS sizes a symbol in the symbol's own units and needs a
      `<data_defined_properties>` block whose exact spelling nobody here has
      verified against a real QGIS writer, so the export reports the loss rather
      than guessing. Closing it needs a `.qml` written by an actual QGIS to read
      the encoding off.

- [ ] **the offline story's remaining network reads**: DuckDB's spatial
      extension fetches from extensions.duckdb.org, and the story export fetches
      MapLibre from unpkg plus tiles from the tile host. The tile cache is
      capped at `TILE_CACHE_BUDGET_BYTES` with saved regions pinned and
      `clearBrowsingCache` for the rest, so the cache side is closed.

- [ ] **composite latency on dense collections**: memory is bounded (folds peak
      at one wave, median and percentile reduce in strips under a fixed 4 Mi
      value budget), and a strip reads only the items whose footprint reaches
      its own rows rather than the whole stack. What remains
      is that strips run one after another, so a stack deep enough to need N
      strips pays N passes of read latency, over the same distinct bytes since
      shared tiles come from the byte cache.

- [ ] **geoplumb breadth**: GEE ships a huge operator library and charting/reduction
      over regions. Grow by demand, not by checklist.

- [ ] **seasonal decomposition over a raster stack.** `RasterStack` in
      `terrano-core/src/timeseries.rs` computes composites, a per-pixel linear
      trend, change detection, a z-score anomaly and phenology metrics.
      Seasonal decomposition is the gap in that set. No request behind it.

- [ ] **register external STAC items in ptolemy, plus a lazy COG copy to S3.**
      An ingest pipeline would register searched items in ptolemy's STAC
      catalog as metadata only, then download the COGs to S3 on demand.
      geoplumb searches per pulled window and reads assets over HTTP range
      requests instead, and its memory and disk caches absorb the repeats. No
      request behind it.

- [ ] **cloud-scale distributed raster processing.** Dask-style chunked tiles
      over an SQS job queue, COG output to the S3 tile bucket, outputs
      registered in the STAC catalog. geoplumb computes windows in parallel
      inside one process and no job leaves it. The SQS queues and the tiles
      bucket the platform profile creates have no consumer. No request behind
      it.

- [ ] **NAIP, Planet and Maxar imagery sources.** Three sources named as worth
      supporting: NAIP (COG, US, 0.6m, free), Planet (COG, global, 3-5m, paid)
      and Maxar/WorldView (GeoTIFF, global, 0.3m, paid). geoplumb's STAC source
      reaches any collection on a STAC API, and the platform stack configures
      `cop-dem-glo-30` and `sentinel-2-l2a` only. No request behind it.

## Open decisions that are not bugs

Deliberate scope calls, each a product decision rather than a defect to fix.

- [ ] tiletopia serves every asset's tiles and `tileset.json` publicly
      (`is_public_read`), even for private assets: anyone holding the asset id
      can read them. The asset listing is no longer public, it filters to what
      the caller may see, so the tile payload is the open part. The
      aggressive CloudFront TTLs on tile paths depend on tiles staying
      public. If private assets ever need gated tiles, decide together:
      per-asset visibility check in the tile path AND a CDN redesign
      (authenticated tiles cannot keep the shared long-TTL cache). The remaining
      post-MVP question is hosting tiles on a separate host (`tiles.<domain>`)
      so authenticated API paths and public tiles do not share a prefix, if
      private-asset tile gating ever ships. Settled at the 2026-08-31 sitting:
      asset metadata and annotation reads are not private, any valid token may
      read them, so the open part here is only the future private-asset tile
      question.

- [ ] ptolemy merge is **attribute-level** for disjoint property edits.
      Same-key and both-sides-moved-geometry still conflict.

- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.

- [ ] `ci/no-raw-writes.sh` cannot see a mutating Postgres function called through
      `SELECT`. `topology.rs` does exactly that (`SELECT topology.CreateTopology`,
      `AddFace`, `TopoGeom_addElement`), so those three routes are guarded only by
      being instance-admin-only in `auth.rs`. If topology is ever bound to a
      dataset, they need the ladder and the check needs to learn about them.
      The check documents in its own header that it cannot see a mutating
      function called through `SELECT`, though it names only two of the three
      sites and misses the `ST_Simplify(TopoGeom_addElement(...))` call.

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

- [ ] the sweep only covers the SQL branches its fixtures reach, which is what
      query variants are for, and a handler that swallows its error is invisible
      to it. Add a variant when a route grows a second branch.
      Decided against 2026-08-13: keeping the script that generated the request-body
      table. The table is `const BODY` in `route_sweep.rs` and holds 102 entries. Its
      values are domain-tuned
      rather than derivable from struct shapes: 33 carry fixture-id markers, 11 carry
      WKB hex and 3 more carry GeoJSON, and the sweep's whole point is that the
      handler reached SQL, which needs values that pass validation. It also
      self-maintains, since adding a route that refuses `{}` fails the sweep by name.

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
      constrains its own members to a shared one. Reprojecting at extraction makes
      the data correct and renderable, and the original coordinates survive it:
      a commit operation may carry the untransformed geometry and its EPSG code
      beside the working copy, read back per feature through the native read.
      So per-dataset srid is worth supporting only if someone needs to query and
      serve in the native frame. Supporting per-dataset srid later needs no storage
      migration, since the column already accepts any srid. It means taking the
      srid from the dataset on write instead of the literal, then auditing every
      query that assumes 4326, and deciding what a cross-dataset query does when
      two datasets disagree.

- [ ] **terrain bundle limits worth knowing** (each deliberate, none blocking):
      bundles are filesystem only, not S3/GCS, because `LocalStore::list` is one
      level deep while `S3Store::list` is recursive and un-paginated, so it sees
      only the S3 default page of 1000 keys and discovery would differ per
      backend. The availability walk touches every
      tile file, so a large bundle makes the layer.json request slow unless the
      bundle ships its own `available` array.

The geoprocessing NULL panic is latent in contour alone, deliberately left
because no PostGIS build ships `ST_ContourLines`, so that route answers 501
first.

## Plans — too big to hand an agent cold

### Chat-only viewer mode

DESIGN.md 2.4 and 2.6 describe what is built. Upload still needs the mouse.
What is left is the weak eval tasks in **Do next** and a layer-referencing
`add_arcs` the day spacetime pairing is a layer (P0 item 7).

The eval fixtures are copies of `tests/unit/fixtures/action-catalogue.json`
and `tests/unit/fixtures/viewer-snapshot.json`. Refresh them from viewtopia
when an action or the snapshot changes. See `geolang/evals/viewer/README.md`.

### Public demo on the hosted preview

The preview is live (see **Before any public deploy**) and costs about 5.50
USD a day up, about 1.10 scaled to zero. Owner calls 2026-09-19: no domain
yet, the nightly scale-down stays with manual scale-up, share links keep
granting edit to guests. Nothing in sibyl or geolang-api limits what one
caller can spend beyond `SIBYL_RUN_BUDGET_SECS` per run, so an open demo has
no ceiling on model tokens or executor time. The plan, in payoff order:

- [ ] **Spend caps in geolang-api, before anything public.** A global daily
      chat run budget and a per-caller cap (JWT subject, share-link guest id,
      or client address for anonymous callers), counted where `/chat/agui`
      starts a sibyl run, with a plain reply when either trips: "the demo
      budget for today is used up". Both limits are environment variables
      with the defaults spelled out in the README. Guests also get an upload
      size and count cap at the tiletopia and ptolemy attachment routes. The
      risk is a script in a loop, not a curious user: one chat run on
      `openai.gpt-oss-120b` costs well under a cent.
- [ ] **Wake on demand instead of always on.** A static landing page on the
      CloudFront hostname (S3 origin, no task) stays up at no cost. Its
      "start the demo" button calls a Lambda behind a function URL that runs
      the scale-up, the page polls `/health` and hands over when the proxy
      answers, about two to three minutes. An idle timer (no `/chat/agui`
      call for thirty minutes, read from the proxy access log or a
      CloudWatch metric) scales back down. The floor is then the load
      balancer, secrets and EFS.
- [ ] **Let Aurora pause while the tasks are up.** The cluster pauses only
      when ptolemy's five-second delivery poll and agora's thirty-second
      watch tick stop. Both pollers back off to a few minutes after a quiet
      period so the cluster can pause between sessions, and the first
      request after a pause pays the fifteen-second resume.
- [ ] **Demo hours as the no-code fallback.** A morning scale-up schedule
      beside the nightly scale-down in `infrastructure/nightly_scale_down.tf`,
      with the hours on the landing page. Halves the up-cost, no code.
- [ ] **When the AWS credits end,** the nine services fit the self-host
      compose bundle on one small VPS at about a tenth of the monthly cost.
      The caps above carry over unchanged, wake on demand does not apply.

### First vertical: commercial site selection

Owner direction 2026-09-19: pick one vertical workflow before the horizontal
platform. `docs/verticals.md` names seven and calls every one partial: the
panels read configured or demo datasets and no vertical has a live feed.
Commercial site selection is the pick, because it runs on public data
(parcels, zoning, census, roads, points of interest, terrain, flood risk)
and needs nothing new to demo. Residential brokerage is out: MLS listings
are licensed and closed. The buyers are retail and franchise expansion
managers, site selection consultants, small developers and commercial
brokers, who today pay per seat for Esri Business Analyst or Placer.ai or
work in spreadsheets and Google Maps.

What exists: the real-estate plugin's parcel and comparable-sales panels
over the two seeded demo datasets (`docs/verticals-setup.md`),
`score_sites` with population, amenities, transport, flood risk, green space
and competition criteria, `calculate_isochrones`, `download_population_grid`,
`download_osm_data` for competitors and anchors, `aggregate_by_region`,
`assess_environmental_risk`, terrain, 3D buildings, share links, comments,
dashboards, image and PDF overlays. None of it touches real data yet.

Product, in order. Items 1 and 2 are the product, about three to four weeks
for one region. Ship those, put them in front of two site selectors, and let
their reaction order the rest.

- [ ] **Real data connectors for one region.** Parcels and zoning from one
      municipal or county open-data portal, census demographics from
      StatCan or the US Census API, public sales records where a county
      publishes them. Each connector maps its source onto the property keys
      the panels already read. One region first, Ontario or one US state:
      parcel schemas differ per jurisdiction and one working region is a
      sellable product.
- [ ] **Trade area analysis as one chat step.** Drive-time area around a
      candidate, then population, income, competitors and anchors inside
      it, composed from the isochrone, population grid and OSM tools into
      one tool with one result table. Chaining is where the model slips
      (see the weak eval tasks under **Do next**).
- [ ] **Side-by-side site comparison with adjustable weights.**
      `score_sites` takes weights as an argument, the panel to move them and
      compare a shortlist does not exist.
- [ ] **A site report export.** A PDF with the map, the trade area table and
      the comparables. Today the outputs are a GeoPackage and a dashboard.
- [ ] **A deal as a unit of work.** One project per candidate set with a
      shortlist, a status and the comments already built, so the shared map
      is the record of the decision.
- [ ] **Eval tasks written for site selection prompts,** so model quality
      is measured on this workflow and not only the general suite.

Marketing, mostly distribution of the demo. The pitch: ask for sites in
plain English, get a shared map and a report, self-host free or pay a flat
fee for hosting. Pricing follows the GitLab model already decided: AGPL
self-host free, hosted per organisation at a flat monthly fee plus agent
usage, never per seat, which is the complaint about the incumbents.

- [ ] **Make the demo the ad.** A public example map on the preview that
      opens in one click, seeded with the region's parcels and census data,
      a prompt already typed and a sample report beside it. Depends on the
      spend caps and a morning scale-up in **Public demo on the hosted
      preview**: a demo that is off overnight loses everyone west of
      Toronto and all of Europe.
- [ ] **One case study per region, written as an answer.** "Every vacant
      commercial parcel within ten minutes of a Toronto subway station,
      ranked", with the map embedded and the prompt shown. Post where site
      selectors read (LinkedIn, the ICSC community, r/commercialrealestate)
      and where GIS people read (r/gis, the GIS newsletters, the Mastodon
      and Bluesky GIS crowds). A Show HN post carries the open-source angle
      to the developers at those firms.
- [ ] **Twenty cold emails that are maps.** Twenty expansion managers or
      consultants, each sent a shared map of their brand's actual market
      with three candidate sites scored and two sentences. Ten minutes each
      once the region's data is loaded, and the cheapest test of whether the
      workflow lands. No replies means the workflow is wrong, not the
      channel.
- [ ] **Economic development offices as a channel.** Host a public
      "available sites" map for one municipality for free. Every retailer
      that looks at that city sees the product, and public-sector buyers
      are the ones who ask for OGC conformance (a free TEAM Engine run of
      ptolemy against the OGC API Features suite is the cheap credibility
      step, an OGC code sprint the next).
- [ ] **The open-source channels for credibility.** A README with a
      thirty-second GIF, the awesome-gis lists, a FOSS4G talk. These bring
      contributors and GIS-literate users, not buyers, and they are what a
      buyer's GIS analyst checks before saying yes.

Measure three numbers: signups on the preview, maps shared from it, and
replies to the twenty emails.

Competitors, researched 2026-09-20 with sources in the session, not
re-verified since. Every serious competitor sells proprietary data first
and software second at quote-only prices: Esri Business Analyst (the only
published prices, 700 or 5,200 USD per user per year on its AWS
Marketplace listing, plus expiring credits), Placer.ai (property-level
foot traffic, no published price, the circulating figures trace to no
primary source), Buxton (Audiense since July 2025, consulting-built
models), Kalibrate (2.9 million traffic counts, also resold by Esri),
SiteZeus (rebuilt as Atlas with an "Ask Zeus" assistant, May 2026), CARTO
(quote-only, one 89,000 USD a year listing, self-hosting on Enterprise),
Regrid (parcels under an EULA that allows rendering to customers and
forbids redistribution), Felt (no site selection product, no published
prices, AI on Enterprise only). The AI-native entrants matter more:
GrowthFactor at 200 USD a month plus a 5,000 USD discovery fee with foot
traffic bundled and MCP access, Gini by MyTraffic at 249 EUR a month in
Europe. Nobody in the field is open source, self-hosted, or flat-priced.
Buyer complaints match this product line for line: no published prices,
per-seat plus credit metering, a skills barrier, data gaps fixed by
ticket, models that stay with the vendor's consultants. No site-selection
market report exists, only location intelligence at 21 to 25 billion USD
for 2025 with no SMB split; the SMB denominator is about 9,000 US franchise
brands, 1,100 Canadian, and a few thousand actively expanding.

Chance of success, the call made 2026-09-20: as a pure retail site
selection product, low, because the moat is foot traffic, traffic counts
and spend data that are not public, and GrowthFactor already holds the
cheap plain-English slot with that data bundled. As a wedge, good: sell to
site selection consultancies and brokers who bring their own data,
economic development offices publishing available sites, and teams outside
the US where the foot-traffic panels are thin. Do not promise foot
traffic. On that path the niche revenue bar is plausible over years.

Foot traffic, if it is ever wanted, in this order:

- [ ] **Bring the customer's own licence.** No visit-level vendor allows
      resale (Placer's terms forbid providing its data to third parties)
      and none publishes an OEM tier, but Placer Feeds and Advan deliver
      CSV or Parquet to the customer, Placer into the customer's own
      Snowflake. A connector that reads those files into a ptolemy dataset
      under the customer's licence is about a week and matches the
      own-your-data positioning.
- [ ] **Free exposure proxies, labelled as such.** Nothing free measures
      visits to a store. State DOT AADT and Toronto intersection counts for
      street traffic, transit faregate entries for station catchments (MTA
      hourly is open, TTC's station series stopped in 2017), LEHD LODES and
      StatCan commuting flows for daytime population, Overture places for
      POIs under CDLA-Permissive with no share-alike. Google Popular Times
      is off limits (not in the Places API, scraping and caching forbidden)
      and Strava Metro bars resale and model training.
- [ ] **An embedded licence only when a paying customer needs it.** Advan
      Research first (the old SafeGraph Patterns lineage, visits per POI,
      US and Canada, terms negotiated), SafeGraph for places and card
      spend with usage rights priced into the contract, dataplor's
      own-your-data claim unverified, Environics MobileScapes or TELUS
      Insights for Canada (carrier-modelled since April 2026, so numbers
      will not compare with a US panel). Expect an annual contract in the
      tens of thousands and the FTC obligations flowing down: five orders
      since 2024 require consent at collection, a sensitive-location
      blocklist, supplier audits and retention limits; Maryland, Oregon and
      Virginia ban the sale of precise geolocation; Canada is PIPEDA with
      Bill C-36 at first reading. No order defines a safe aggregation
      threshold.

### Region watch

agora's README and DESIGN.md 2.0 describe what is built. Open:

- [ ] **A third webhook sender now exists** (`agora-server/src/webhooks.rs`
      beside `ptolemy-api/src/delivery.rs` and tiletopia `webhooks.rs`),
      because agora cannot depend on either binary crate. Extract ptolemy's
      into a shared crate if a second agora event ever needs delivery.
- [ ] **Nothing caps watches per document.** `MAX_WATCH_RUNS_PER_TICK` bounds
      the work and the oldest-first order keeps it fair, so a document with
      thousands of watches slows every other document's ticks. Same posture
      the README takes on feeds. Add a per-document cap when a real deployment
      shows the need.
- [ ] Later, not now: sensors as a second source (fluvius over WebSocket into
      agora, its runner now connects out and checkpoints), a time-series
      watch over `/zonal/{layer}/series`, OGC SensorThings.

Note on `viewtopia/docs/verticals.md`: it is a planning doc for proposed
verticals, not a description of what exists.

### terravista v0.3

See **Wait for demand**. Android fetches and draws on Canvas, including MVT.
Metal/Vulkan is unstarted.

### verne, the next adapter

Rationale: lock-in, not features, is what stops an org moving off an incumbent
platform. Vendor-neutral by design: a common core (connect, inventory, report
fidelity, extract) with a thin adapter per source. A new repo rather than
geodukt, because the dependency surface and the risk profile (it holds customer
credentials) should not land on every geodukt user. It emits GeoPackage/Parquet
plus a semantics sidecar; geodukt and ptolemy consume that through the source
interface they already have.

Rust (owner decision 2026-07-29). GDAL stays behind one crate or adapter trait,
feature-gated. Ship the service as a container with GDAL from the distro.

- [ ] **verne: the rest of the hosted Esri story.**
      - the version tree. verne reads one named version per extraction and
        diffs it, but carries no tree. Carrying it means the
        VersionManagementServer resource: its `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license. That needs an enterprise
        deployment verne may exercise.
      - legacy generateToken (username/password) is deliberately not taken:
        holding a password is worse than holding a client secret, and OAuth
        client_credentials covers the hosted case.
- [ ] **v0.2 gaps.** Rasters in a `.gdb` are detected and routed to terrano but
      have no fixture, because OpenFileGDB refuses to create them. Field subtypes,
      dataset-level metadata and glob domains are unexercised. Subtype, annotation
      and topology fixtures are hand-written catalog XML, since GDAL cannot create
      those either: the read path is real, the blob is not.
- [ ] **more real data, and from another vendor domain.** One public geodatabase
      found two bugs an afternoon, and it was hydrography: no attachments, no
      annotation, no utility network, so those paths are still exercised only by
      fixtures verne builds itself. A utilities, parcels or emergency-services
      file would hit them. Public sources with attachments are hard to find, so
      this may need a customer file.
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
