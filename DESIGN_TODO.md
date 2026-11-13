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
> Last brought current: **2026-11-04**.
>
> Verify an entry against the code before working it, and do not trust the
> mechanism it names. Three items in this file were already closed when someone
> went to work on them, because the entry named a mechanism that no longer
> existed.

---

## In flight: fixes from the 2026-11-13 review of Grok's commits

The review of tiletopia 5957c73 and viewtopia dfc49778 and the eight commits
before it is `/home/aaron/tmp/geolang-fix/grok-review-2026-11-13.md`. Numbers
below are its finding numbers. Nothing is committed. Viewer fixes are written
in detached worktrees under `/home/aaron/src/GeoLang/.worktrees/review-*`, then
applied to the main tree and gated once with typecheck, Biome and vitest.

viewtopia: every finding except 7 and 19 is fixed in the main tree,
uncommitted. Typecheck and Biome are clean, and vitest passed 250 files and
3035 tests.

tiletopia: every finding is fixed in the working tree, uncommitted, together
with global buildings and the Overpass retry. On hercules the CI fmt and clippy
commands are clean, and `cargo test --all` with CI's features passed 1473 tests
in 45 binaries. Run that gate with `-j 6`, since default jobs ran this machine
and hercules out of memory. The gate script is
`/home/aaron/tmp/geolang-fix/hercules-gate/review-gate.sh`, its log is
`/home/aaron/tmp/geolang-fix/osm-buildings-proof/test-gate-3.log`.

Items 4 to 29 were fixed in four tracks, each in a worktree under
`/home/aaron/src/GeoLang/.worktrees/tt-review-*`, and the patches are in
`/home/aaron/tmp/geolang-fix/tt-review-*.patch`:

- `split`: 4, 5, 11, 19, and 29's temp dir.
- `edits`: 6, 7, 10, 16, 17, 18, 27, and 29's key numbering and escapes. Merged
  by hand over the `ifc` track in `ifc_edit.rs` and `edits.rs`.
- `ifc`: 12, 13, 15, 25.
- `misc`: 8, 9, 14, 20, 22, 23, 26, 28, and the drawing route and README section
  shape from the facade list.
- 24: section DXF polylines carry elevation and extrusion, and y sections and
  drawings are drawn with height up.

Closed after the tracks: edits re-read the asset under the write lock that
`run_job` holds while it marks the asset tiling, and a moved element gets its
own copy of an `IfcLocalPlacement` another product uses, taking its openings,
fillings and parts along. The unused `axum-extra`, core `memmap2` and store
`tiletopia-core` dependencies are removed.

## In flight: audit fixes and Ion tiling gaps

Stale as of 2026-11-13. This is the 2026-11-04 worktree list. Splats, DXF, CZML,
JPEG 2000, the Ion upload route and global terrain are on master. The open Ion
work is **Cesium Ion, what is left** under Plans.

Started 2026-11-04. Nothing here is committed. Each repo's `git status` is the
recovery path, and worktree patches are in `/home/aaron/tmp/geolang-fix/patches`.
Every repo had an independent re-review on 2026-11-05 and its fixes are in the
working trees, uncompiled. These tiletopia patches are not yet on main: splats,
cad-vector-inputs, global-data, ion-upload, photogrammetry, jp2.
The scripted gate is `/home/aaron/tmp/geolang-fix/gate.sh <repo>...` and
`gate-light.sh`, results in `gate-logs/results.tsv`. The Ion proof harness is
`/home/aaron/tmp/geolang-fix/ion-proof/run.sh` after a release build of
`tiletopia-cli`. The publish script is `/home/aaron/tmp/geolang-fix/publish/`.

Open in tiletopia, code being written 2026-11-05:

- [~] streaming imagery tiling, so the decode cap of about 1930x1930 RGBA goes
  away (owner chose streaming over a larger budget).
- [~] glTF node transforms: meshes under transformed nodes are tiled at their
  local origin.
- [~] per-tile vertex compaction: every tile carries its whole material group's
  vertices.
- [~] Ion-created and catalog imagery assets left in `uploading` or `tiling`.

Code-only work until hercules answers ssh, no builds and no tests before then:

- [~] finish ion-upload and photogrammetry in their worktrees and write their
  patches, restart jp2 from a fresh cut of main.
- [~] apply splats, cad-vector-inputs and global-data to tiletopia main, then
  ion-upload, photogrammetry and jp2 as each patch appears. One agent edits main.
- [~] write `/home/aaron/tmp/geolang-fix/hercules-gate/run.sh` and its README.
- [~] viewer: CZML assets, global terrain option, WMTS and TMS URLs on imagery
  rows. `.jp2` in the picker and photo-set upload follow their tiletopia patches.
- [~] publish prep: CHANGELOG drift and the four stale `publish.sh` rows.
- [~] `TILETOPIA_ION_BASE_URL` is the viewer origin on every stack, proxies pass
  `/v1/`, `/tiletopia_ion_uploads/` and the imagery service paths to tiletopia
  with the path and Host unchanged, and an unset variable is an error.
- [ ] move the NodeODM wait out of the job queue loop, after photogrammetry and
  ion-upload are on main.
- [ ] zip uploads on the Ion route, with path and size protection and a rule for
  the main file, after ion-upload is on main.
- [ ] hosted stack, before Ion uploads go live: `complete_multipart_upload` joins
  parts before it answers, and on EFS a large upload may outlast the CloudFront
  origin and ALB timeouts. Set `origin_read_timeout` and `idle_timeout`, or answer
  before the join. Unmeasured.
- [ ] tiletopia `deploy/terraform`: its CloudFront forwards only `Authorization`
  and `Origin`, so Ion upload signatures covering `Host` fail through that origin.
  `ion_base_url` also has no value on a first apply when it is the CloudFront
  domain. From reading the config, not tested.
- [ ] terrano: apply COG masks in `CogReader`, masked files are refused at `open`.
  Honour nonzero tiepoint raster coordinates (I, J).
- [ ] geoplumb `read_chunk`: uses `pixel_width` for rows and treats overviews as
  exact ladder multiples, so odd-sized GDAL files may place tiles under one
  overview pixel off at the far edge, now that terrano selects those overviews.
  From reading the code, check when geoplumb bumps terrano.
- [ ] tiletopia Ion zips: a retile reads the absolute input path from the latest
  job, so it fails after the data directory moves. Keys with subdirectories answer
  403 at PUT, several models in one upload are refused where Ion merges them, and
  the 100 to 1 unpack limit refuses mostly-nodata rasters that compress further.
- [ ] geoplumb `crates/geoplumb/src/elements/stac.rs`: name the asset and href when
  `CogReader::open` fails in `read_asset` and `open`, through `Error::Source`. Nothing
  matches on `Error::Terrano` as a pattern.
- [ ] tiletopia `terrain_bundle.rs` turns a DEM void into elevation 0 with
  `unwrap_or(0.0)`, with no message on the job.
- [ ] tiletopia CLI `Edge` prints `target/{}/release/tiletopia-cli` with the `{}`
  unsubstituted, and the binary is named `tiletopia`.
- [ ] tiletopia Dockerfile `grok` stage has no cargo, so Grok's mercury fast path
  compiles to a no-op there, while the CI `jp2` job has cargo and builds it. CI
  tests a different Grok build from the one the image ships.
- [ ] tiletopia jp2: `read_layout` takes GML only from `header.asocs`, so a GML
  document in a plain XML box is refused as having no georeferencing. Check against
  real GDAL and Kakadu files.
- [~] second wave, code only, each returning a patch for after the gate:
  `tiletopia-bim-base` (geometry and tile patches merged, base for slices 2b and 5),
  `tiletopia-followups` (recorded tiletopia defects), `terrano-masks`, `geodukt-sidecars`,
  BIM proof harness and fixtures under `/home/aaron/tmp/geolang-fix/bim/proof`, and a
  read-only security review of the Ion upload, zip and element routes.
- [~] third wave, code only, patches for after the gate: `tiletopia-access` (owner checks
  on asset reads, proposed and not yet approved, so the patch stays unapplied until the
  owner says), `tiletopia-archives` (Ion clip, archive and export),
  `tiletopia-asset-library` (labels, search, thumbnails, attribution),
  `tiletopia-terrain-inputs` (terrain mosaics, `.dem`, `.flt`, `.kmz`),
  `tiletopia-bim-streaming` (slice 2b), `tiletopia-bim-coordination` (slice 5 server side).
  Viewer slices 3b and 5 start when the viewtopia-bim patch is final.
- [ ] when hercules is up: run the gate, fix failures, run the Ion proof harness.
- [~] fourth wave, code only, started 2026-11-05 while the first batch merges to main.
  Each track is cut by `/home/aaron/tmp/geolang-fix/make-track.sh` from the worktree
  named in brackets and returns `patches/<track>.patch`:
  `tiletopia-bim-storey` [bim-base] storey elevation in `tree/children` and `elements/{id}`.
  `tiletopia-bim-edges` [bim-streaming] CAD edges, memory-mapped IFC.
  `tiletopia-bim-coordination-roles` [bim-coordination] BCF and version writes need edit rights.
  `viewtopia-bim-coordination` [viewtopia-bim-mode] slice 5 viewer: BCF, versions, change reports, DXF.
  `viewtopia-twin-from-elements` [viewtopia main] slice 4 twin rows from the element store.
  `geolang-bim-evals` [geolang-bim] eval-duplex.ifc and its upload step, BIM mode catalogue entries.
  `tiletopia-small-fixes` [tiletopia main] DEM void, CLI Edge path, jp2 GML in an XML box,
  Dockerfile grok cargo, CloudFront Host.
  `tiletopia-terrain-facades` [terrain-inputs] synthetic relief fallback, UTM export, KML with no Model.
  `tiletopia-export-zip` [archives] `3dtiles_zip` export reads the asset through the archive code.
  `geoplumb-stac-chunks` [geoplumb main] STAC href in errors, `read_chunk` row size and overviews.
  `collecta-blank-secret` [collecta-auth] and `interiora-blank-secret` [interiora-auth] refuse a
  whitespace-only secret at startup.
  Two read-only facade audits: tiletopia BIM tracks, and the viewer, geolang and third-wave tracks.
  Added the same day: `tiletopia-bim-integration` holds bim-base with streaming, coordination,
  coordination-roles and storey merged, because the coordination worktree was cut from a partial
  base and does not compile alone. Merge bim-edges into it next. `tiletopia-bim-audit-fixes`
  [bim-integration] fixes `audits/tiletopia-bim.md`. `terrano-overview-scale` [terrano main]:
  GDAL overview IFDs carry no pixel scale, so terrano never selects a GDAL overview.
  platform-auth gets one startup secret check, collecta and interiora call it.
- [ ] exports in tiletopia, found by the fourth wave, not yet given a track: the terrain export
  splits the DEM's own extent into tiles labelled `tms` that are not global TMS addresses, with
  rows counted from the north, and writes voids as the tile minimum. Zipping the tree
  `write_dem_bundle` builds would fix both. `glb` and `geojson` exports write placeholder
  output that ignores the asset, `ExportEngine::new` seeds two demo jobs, and only `3dtiles_zip`
  checks the asset's owner.
- [ ] platform-auth `check_signing_secret` at startup in the other consumers, which accept a
  whitespace secret today: tiletopia, ptolemy and agora (own `is_empty` and length checks),
  geodukt and sibyl (no check), and fenestra, geokode and itinera on the set branch only, where
  unset means auth off. interiora's lock pins mirror snapshot 857c58d without the function, so its
  patch builds after `cargo update -p platform-auth` against the published crate.
- [ ] twin rows from the element store insert and delete only. An element whose name, storey or
  position changed keeps its old row.
- [ ] storey `baseHeight` takes IFC Elevation relative to model z 0 and ignores the building's
  own placement and `ElevationOfRefHeight`.

Gate, then Ion proofs (upload, validator, CesiumJS screenshot per row), then one
branch per repo and GitHub CI before master.

Next Ion gaps, owner go-ahead 2026-11-05 for all four groups, code now and
compiled at the gate. Each track works in `.worktrees/tiletopia-<slug>`, cut
from the main checkout's working tree, and returns
`/home/aaron/tmp/geolang-fix/patches/tiletopia-<slug>.patch`:

- [~] ion-upload: `POST /v1/assets` answers an upload location,
  `uploadComplete` queues the job, unknown types refused, stale uploads expire.
- [~] imagery-services: WMTS and TMS for uploaded imagery beside XYZ.
- [~] jp2: decode JPEG 2000 uploads through Grok, streaming imagery is on main.
- [~] cad-vector-inputs: DXF, TopoJSON and CZML.
- [~] splats: Gaussian splat PLY to 3D Tiles.
- [~] photogrammetry: images to a textured mesh through an external tool.
- [~] global-data: global terrain and buildings without an Ion account.

Shared pieces, both new local repos that need creating on GitHub before anything
that uses them can build in CI:

- [~] `platform-crates`: `platform-auth` for JWT checks and `platform-webhook`
  for signing and the private address guard from agora.
- [~] `.github`: reusable Rust CI and release workflows, org profile, default
  community files.

One agent per repo, in the main checkout:

- [~] agora, ptolemy, fenestra, geokode, itinera, interiora, geodukt, sibyl: use
  `platform-auth` where the logic matches. agora and ptolemy also use
  `platform-webhook`.
- [~] itinera: one search for A* and Dijkstra, one haversine. ptolemy: one
  haversine.
- [~] doc fixes from the audit: infrastructure, ptolemy, agora, geodukt, geoplumb,
  geolang, panoptes, terrano, interiora, GeoLang.github.io.
- [~] reusable CI in every Rust repo whose `ci.yml` or `release.yml` matches.

tiletopia, each in `.worktrees/tiletopia-<slug>`:

- [~] compress: Draco through `draco-core`, `EXT_meshopt_compression`.
- [~] ktx2: `KHR_texture_basisu` tile textures through `basisu_c_sys`.
- [~] validator: CesiumGS `3d-tiles-validator` over fixtures in CI.
- [~] imagery: uploaded imagery to XYZ tiles through geoplumb.
- [~] terrain: uploaded DEM to a quantized-mesh bundle.
- [~] dae: tile DAE uploads.
- [~] cleanup: geometry on topoi, one haversine, canned routes deleted, docs.

viewtopia, each in `.worktrees/viewtopia-<slug>`:

- [~] docs: README, DESIGN, this file and the changelog against the 2026-11-04
  audit.
- [~] dedupe: draw and measure hooks, compose files, dead preview toggle, stale
  `/ws` proxies.
- [~] layers: open uploaded imagery and terrain assets in the viewer.

After the gate:

- [ ] natural earth through `run_workflow`, from reading the code and not yet run:
  geodukt `--caller-root` refuses those paths, neither deployment mounts natural
  earth on geodukt, and the failure is reported as missing credentials.

Build order after review: push `platform-crates` and `.github`, run `cargo update`
for `platform-auth` and `platform-webhook` in each consumer, then push the rest.

## Demo hardening

Goal: a signed-up demo user cannot spend the budget, take the service from
others, or damage shared state. What is in place is DESIGN.md §2.9. Finding
numbers refer to `/home/aaron/src/GeoLang/demo-review-2026-09-24.md` (not in
any repo).

- [ ] residuals, in priority order: ptolemy's `migrate` and admin CLI
  commands run with no statement
  timeout by choice, and a slow realtime client drops chat lines past 32 unread.
- [ ] F17 and F18 rollout, owner-run. The code is on master: geodukt
  d1d7606, ptolemy c452f35, geolang 294f692, infrastructure dc1fc28,
  viewtopia 46ecf5a5.
  1. tagged 2026-10-04 and pinned in `docker-compose.release.yml` and
     `preview.tfvars`: geodukt v0.2.1, geolang v0.1.12, ptolemy v0.2.6.
  2. apply with ptolemy at 0 tasks, then invoke
     `geolang-prod-database-secret-refresh` once. Expect ptolemy
     `changed: true`, agora `false`.
  3. as master, `SELECT datname, pg_get_userbyid(datdba) FROM pg_database`.
     ptolemy must be owned by `ptolemy_app` and agora by `agora`. The old
     `REASSIGN OWNED` gave agora every database the master owned, so hand
     any other database back with `ALTER DATABASE <name> OWNER TO ptolemy`.
  4. rotate the master password, then scale up and check a ptolemy topology
     create and an upload.
  Unverified until then: the Data API accepting the multi-line `DO` block,
  and master creating all 13 extensions on Aurora (`pg_partman` in doubt).
- [ ] F17 leftovers, each low:
  - geodukt `project.incremental` and `project.lineage` write
    `.geodukt/*.json` in the working directory every caller shares.
  - ptolemy `PgStore::create_dataset` still writes external columns with no
    probe. No caller passes one.
  - ptolemy's H3 and 3D routes now read external datasets on the external
    pool, untested because CI has neither extension.
  - nothing stops an operator pointing `PTOLEMY_EXTERNAL_DATABASE_URL` at
    the main role. The load workflow does exactly that.
  - the extension list in `database_secret_refresh.tf` copies ptolemy
    migration 015 and has to follow it by hand.
  - the Lambda's master-credential path (`role_name = ""`) has no caller.
  - geolang's QGIS input check has only run without QGIS bindings.
- [ ] not done after the F17 and F18 push:
  - the load test and the golden path have not run locally against the
    stack with the geodukt caller roots and ptolemy's external pool
    change. CI is green on all five commits, the golden path on 46ecf5a5
    included.
  - external datasets are off on the platform compose stack and the
    preview, neither sets `PTOLEMY_EXTERNAL_DATABASE_URL`. Turning them
    on needs a SELECT-only role, and on Aurora a `GRANT CONNECT` since
    PUBLIC connect on the `ptolemy` database is revoked.
  - the image does not pin pyogrio, so the `GeoJSON:` and `GPKG:` path
    prefixes are tested on the GDAL that CI installs, not the image's.
- [ ] later: sibyl message retention.

## Geokode planet index

- [ ] no OSM diff updates: a refresh is a full 95 GB planet download and a
  20 minute build on a box with 40 GB RAM and 110 GB disk (a spot
  `r6i.2xlarge`, the scripts are in `/home/aaron/geokode-data/`), then a
  new `geokode_index_version` and an apply.
- [ ] the shared trusted role's S3 policy grants write on every
  `geolang-prod-*` bucket, so any trusted service can overwrite the index.

## Doc sweep 2026-09-23, code defects found

Every README and Pages site was checked against the code and pushed. The
defects the sweep found were fixed or deleted on 2026-09-23, see each repo's
CHANGELOG. What is left:

Rollout pending, owner-run:

- [ ] re-score the viewer eval on gpt-oss from geolang master. The 0.92
  baseline (20260922T192650) is not comparable any more: the harness sent
  false "<param> is required" follow-ups on nearly every task (fixed in
  evals/viewer_replies.py), the system prompt gained one line per hidden
  tool, and seven catalogue parameters were renamed from `name`. The
  commands are in the 2026-09-23 handoff and need the owner's security-group
  change, and the preview is paused, so it has to resume first. Sign up a
  fresh eval user per sweep, one user's outputs carried between tasks.

Decisions:

- [ ] rotate `PLATFORM_JWT_SECRET` and the provider keys before the preview
  resumes, see F18.
- [ ] geolang `/upload`: a zip whose CRC does not match passes the pre-check,
  `extractall` raises, the client gets 500, and the raw zip plus an empty
  entry stay in `user_data` with the daily budget charged. Unzipping into a
  temporary sibling folder fixes it but changes how a re-upload with the same
  stem merges with the old files, which needs a decision.
- [ ] the demo wake function URL is public and CORS stops only browsers, so a
  script posting every thirty minutes keeps the preview up at about 5.50 USD
  a day. The landing prompt names Toronto parcels that are not loaded on the
  preview, and the viewer has no field for a pre-filled prompt, so the page
  copies it to the clipboard.
- [ ] a deal is invisible to agora live-link guests, who have no project.
  Covering them means a `deals` namespace in agora synced through
  `documentBridge`, about the size of the feature again.
- [ ] aavaaz refuses every tool token. The alternative is accepting one with
  an aavaaz scope, as agora does, and no such scope exists.

Found while fixing, small:

- [ ] viewtopia: with 96 busy loops on 16 cores, six render-heavy unit tests
  in raster-cog-panel and settings-panel pass the 15 s test timeout. All pass
  at 32 loops. A profile shows React and Mantine development rendering and
  `getByLabelText` walking the whole jsdom tree, no single fault.
- [ ] itinera steps carry no location, so RoutingPanel cannot fly to one, and
  slight turns along one road stay separate rows.
- [ ] tiletopia: orthometric LAS heights are still off by the geoid
  undulation, no geoid grid ships (TODO in crs_detect.rs).
- [ ] collecta: `DROP TABLE IF EXISTS sync_queue` on startup has not run
  against a database that still holds the old table.
- [ ] tab-to-leaflet fails one run in three on the model itself, the catalogue
  already maps leaflet to `view.set_tab`.

Em dashes sit in Rust comments and crate docs across most repos, about 230 files.

### Claims the sweep removed or marked not built

Each was in a README or on a Pages site and the code does not do it. Build one
only when a user asks for it. Items already listed above are not repeated.

- [ ] viewtopia: recording map operations into a notebook, a Hata propagation
  model for telecom coverage (it is a radius or radio-horizon footprint plus a
  terrain viewshed), and a FEMA flood zone overlay in real estate.
- [ ] geolang: `geopandas_api` running arbitrary GeoPandas (it takes
  `read_file`, `sjoin`, `proximity_analysis` and `filter`), and `pyqgis_api`
  running arbitrary PyQGIS (it loads a layer or runs a `native:` or `qgis:`
  algorithm with `uri` and `layer_name` only).
- [ ] ptolemy: k-means for `similarity/cluster` (it is `ntile` over cosine
  distance to the mean embedding), TopoGeometry support, edge and face
  adjacency queries, and a Helm chart that runs an in-cluster postgres.
- [ ] tiletopia: the viewer commands `set_view`, `add_marker`, `classify`,
  `add_geojson`, `set_time`, `clear_entities` and `screenshot`, which exist in
  neither geolang nor viewtopia. `POST /api/v1/catalog/{id}/add` queues a URL
  the job queue cannot read. CityJSON tiling, which the upload route does not
  accept. Cesium for Unreal and Unity compatibility, dropped as unverified.
- [ ] terravista: a configurable off-route threshold (50 m is hard-coded),
  continuous zoom interpolation, a pitch gesture and pitched drawing,
  zoom-interpolated widths and opacity (only colours interpolate), a
  `_destroy` per opaque pointer (only `tv_map_destroy` and `tv_string_free`),
  `TV_GESTURE_ZOOM`, `_ROTATE` and `_PITCH` results (never returned), and the
  offline vector store and TVPK packages over FFI (Rust API only).
- [ ] jung: the full Mapbox GL expression language and drop-in style
  compatibility (a listed subset), a style layer matching its `source`, `type`
  or `filter` (every layer draws every feature), data-driven values for any
  property, a real map projection in the Vello renderer (a linear bbox
  mapping), DEM processing, and polygon fill opacity (only the stroke takes
  `line-opacity`).
- [ ] terrano: GRIB2 beyond simple packing, and NetCDF-4 (classic and 64-bit
  offset files only).
- [ ] nubis: fitting the exponential and gaussian variogram models (only
  `fit_spherical` exists).
- [ ] projicio: projections exact to the published formulas. Transverse
  Mercator is a series, 0.8 mm off at a UTM zone edge at 60°N.
- [ ] panoptes: "pure Rust" (ONNX needs a system ONNX Runtime), and a CLI path
  to the ONNX detection engine (the library has it, no command reaches it).
- [ ] geoplumb: a layer-file `cog` source read over HTTP range requests. It
  takes a local path, and range reads are library-only.
- [ ] collecta: glob patterns in the pattern constraint. It takes one leading
  or trailing `*`, otherwise an exact match.
- [ ] interiora: full multi-floor support, reworded to what the code does.

Comparison tables removed because nobody here can source the competitor side:
itinera against OSRM, Valhalla and GraphHopper, fluvius against Kafka Streams,
Flink and GeoEvent, geogit's Kart column, and viewtopia's price, web-based and
QGIS download rows, and tiletopia's Mapbox, Google Maps, Bentley iTwin,
Trimble Clarity and Potree columns. The dropped tiletopia cells claimed Google
Maps and Bentley iTwin serve 3D Tiles point clouds, Bentley iTwin has presence,
chat and 3D annotations, and Potree is self-hosted, open source and has no REST
API.

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
- [ ] viewtopia admin dashboard, removed 2026-09-24: a separate Next.js app
  on port 4000 for service health, container logs, metrics, migrations and
  config, with its own lockfile that nothing built or deployed and that
  carried ten npm advisories. `dashboard/` at 37bce6d5.

### Modules removed 2026-10-19, rebuild from history if wanted

Same owner call as above: no caller, so deleted and recorded by path and the
last commit that still has the file.

- [ ] ptolemy websocket support, which was only the `/ws/rooms/{room_id}`
  relay: every text frame a client sent went to every other client in the
  room, 256 messages kept per room, no membership check. Nothing in the
  platform connected to it. `crates/ptolemy-api/src/room_relay.rs`, the
  `/ws/` rule and bearer subprotocol token in `crates/ptolemy-api/src/auth.rs`,
  and the handshake tests in `api_integration.rs`, all at 9a6353e.
- [ ] tiletopia facades: `/classification/models`, `/terrain-analysis/operations`,
  `/multispectral/indices` and `/multispectral/sensors` were static lists of
  operations nothing served, and the modules behind them had no other caller.
  `crates/tiletopia-server/src/{terrain_analysis,multispectral,classification}.rs`,
  `crates/tiletopia-core/src/{measurement,anomaly,clash_detection}.rs` and
  `geostatistics::morans_i` at 483ed94.

### Modules removed 2026-11-04, rebuild from history if wanted

Same owner call as above: no caller, so deleted and recorded by path and the
last commit that still has the file.

- [ ] viewtopia `docker-compose.yml` (3355f4b7): the stack could not start, its
  tiletopia had no `TILETOPIA_JWT_SECRET` and its proxy no `/tiles/` route.
- [ ] tiletopia facade routes with no caller in viewtopia, geolang or
  tiletopia's gui. `GET /api/v1/photogrammetry/projects` listed an in-memory
  engine nothing created a project in, `GET /api/v1/bim4d/projects` one
  built-in demo project, `GET /api/v1/indoor/buildings` built-in demo
  buildings, `GET /api/v1/metering/summary` a usage store nothing recorded
  into, and `GET /api/v1/metering/pricing` three fixed tiers. The routes are in
  `crates/tiletopia-server/src/premium_routes.rs` at 76c0366, the modules
  `crates/tiletopia-server/src/photogrammetry.rs` and `bim4d.rs` at 73a6fda,
  `indoor.rs` at d34c42c and `metering.rs` at 32bdd18. `indoor.rs` also had
  `find_route`, a petgraph Dijkstra between rooms that no route called, and
  the `petgraph` dependency went with it, in `Cargo.toml` at eb600b4 and
  `crates/tiletopia-server/Cargo.toml` at 18e2dc5.
  `GET /api/v1/photogrammetry/presets` stays.
- [ ] tiletopia vendored `draco-rs` crate and the optional `draco` feature
  built on it, with `draco_encode_mesh` and `draco_decode_mesh`.
  `patches/draco-rs/` at ae61592, `crates/tiletopia-core/src/compression.rs`
  at 87cc740. Tiles are Draco-compressed through the `draco-gltf` crate now,
  and nothing in tiletopia decodes Draco.
- [ ] viewtopia `docker-compose.re.yml`, the real-estate subset of
  `docker-compose.verticals.yml`, at 2ad09e48. The verticals file seeds the
  same three parcels and three sales.
- [ ] viewtopia Show Preview Tools setting, which hid menu entries flagged
  `preview` when no entry had the flag. `settings.showPreviewTools` in
  `src/store/app.ts` and `PreviewMarker` in `src/components/ToolPanels.tsx` at
  25aae306, the switch in `src/components/tools/SettingsPanel.tsx` at
  4b73cb7a, the `preview` field, `visibleToolItems` and `isPreviewPanel` in
  `src/components/toolMenus.ts` at 8174a56d, and the Preview badges in
  `src/components/CommandPalette.tsx` and `ViewerToolbar.tsx` at 8b5a4745.
- [ ] viewtopia proxies to ptolemy routes that no longer exist: the `/ws/`
  and `/api/v1/sse` locations in `deploy/nginx-platform.conf` at 07e7dccf,
  `/ws/` in `deploy/nginx-verticals.conf` at 3bb87e36, and `/ws` in the dev
  proxy list in `vite.config.js` at 02e59429.

### Modules removed 2026-11-05, rebuild from history if wanted

- [ ] tiletopia annotations store and its routes, removed by the BIM
  coordination patch because agora holds annotations.
  `crates/tiletopia-server/src/annotations.rs` at 34f844e.

## Self-host preview release, follow-ups

The 0.x preview shipped 2026-09-16: every platform repo publishes
`ghcr.io/geolang/<repo>:<tag>` on a `v*` tag, viewtopia's release carries the
`geolang-platform-<tag>.tar.gz` bundle, and the golden path passed 35 of 35
against a stack pulled from those images alone. Pins live in
`docker-compose.release.yml` and are bumped by hand per release. Open:

- [ ] **Upgrade test has only run backwards.** `scripts/upgrade-test.sh
      <old_image> <new_image>` writes a dataset, branch and features through the
      old image, restarts on the new one, and checks the migration version rose
      and the reads match. Passes from a ptolemy built at v0.1.0 to master
      (2026-09-22). The next release runs it forwards on the new pins, and agora
      once it has a second tag.

## Do next

Ordered 2026-08-30, hosting excluded.

0. **Weak eval tasks, per-task transcript work.** The standing baseline is
   `cloud:openai.gpt-oss-120b` on the preview, 0.92 over 76 tasks
   (20260922T192650), and weakness is read off that profile. `evals/viewer/tasks`
   has 82 tasks, and the re-score is pending under **Doc sweep**. The 0.82
   `local:Qwen3.5-35B-A3B` baseline (20260901T004124) and the Qwen3.8 sweep
   (0.87, 20260902T000529) are comparisons only. Hercules was shut down on
   2026-09-24 and answers ssh again since 2026-11-03. Whether its resident eval
   stack and the Qwen3.5 model are still there is unverified. Still weak, cause
   read from transcripts:
   - scenario-compare-within-25-metres and find-before-flying: the task
     prompt and the `find_feature` reads fixture were fixed in geolang
     5ad6d5c (2026-09-16), unscored until the gpt-oss re-score. If either
     is still weak after it the cause is the model, not the task.
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

7. **Chat-only viewer mode: a typed prompt reaches every capability that does
   not need the mouse.** Repositories: `viewtopia`, `geolang`. Owner call
   2026-08-25, plan under **Chat-only viewer mode** in the plans section.
   - [ ] File import from chat needs a URL (`data.import_url`), a local file
     has no path the chat can name.
   - [ ] `add_arcs` still has no catalogue entry, so the agent cannot reach it.
     It needs paired source and target points and no layer carries them. Owner
     call 2026-08-27: leave the handler in place unreached rather than delete
     it, because the spacetime co-travel analysis already produces paired
     entity segments and is the source it would draw from. Give it a
     layer-referencing action the day that pairing is exposed as a layer.

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
      extension installs from `/duckdb-extensions`, the copy
      `scripts/fetch-duckdb-extensions.mjs` vendors at build time, and reaches
      extensions.duckdb.org only on a deploy that skipped the script. That copy
      is outside the service worker's `APP_SHELL_GLOBS`, so it is not precached.
      Only spatial is vendored, so a json or parquet autoload still fetches from
      extensions.duckdb.org. The story export fetches MapLibre from unpkg plus
      tiles from the tile host. The tile cache is
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
      over a job queue, COG output to the S3 tile bucket, outputs registered in
      the STAC catalog. geoplumb computes windows in parallel inside one process
      and no job leaves it. `infrastructure` defines no `aws_sqs_queue`, and
      geokode's index copy is the only reader of the tiles bucket there. No
      request behind it.

- [ ] **NAIP, Planet and Maxar imagery sources.** Three sources named as worth
      supporting: NAIP (COG, US, 0.6m, free), Planet (COG, global, 3-5m, paid)
      and Maxar/WorldView (GeoTIFF, global, 0.3m, paid). geoplumb's STAC source
      reaches any collection on a STAC API, and the platform stack configures
      `cop-dem-glo-30` and `sentinel-2-l2a` only. No request behind it.

- [ ] **fenestra service gaps.** WMS answers GetMap and GetCapabilities with no
      GetFeatureInfo. WCS 2.0.1 serves one float64 band with no reprojection or
      scaling. Its OGC API Features has no CQL2 or datetime filter, which
      ptolemy's OGC API does have.

- [ ] **client packages.** No repo publishes a Python package or an npm
      package for the platform APIs. `topoi-wasm`, terrano's WASM build and
      `projicio-wasm` build, and viewtopia vendors them, but none is on a
      registry.

- [ ] **a collecta field app.** ODK Collect is the only client, through
      collecta's OpenRosa routes. collecta has a server, a form library and an
      offline CLI, and no mobile or desktop app that renders a pulled form.

- [ ] **panoptes models beyond buildings.** Roads, landcover, vegetation and
      change detection have no published weights and read as `planned` in the
      panoptes README catalog. Change detection runs as pixel differencing
      only.

- [ ] **ptolemy multi-tenancy.** The ptolemy README lists it as not built.
      Per-project roles, dataset visibility and dataset-admin delegation exist.
      Read the README's meaning of multi-tenancy before scoping this.

- [ ] **geogit metadata validation.** ISO 19115 and FGDC XML is stored as
      given, with no schema check and no search over it.

- [ ] **nubis LAZ and LAS output.** nubis has no LAZ code, so it reads
      uncompressed LAS only. It writes LAS 1.2 point format 0 only.

- [ ] **jung SLD filters.** SLD import reads no filters, and it matches only
      the literal `<se:Rule` element name.

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
      `PTOLEMY_AUTH_DISABLED=true` rather than an empty `PLATFORM_JWT_SECRET`:
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
      bundles are filesystem only: `terrain_bundle.rs` reads
      `<data-dir>/terrain_bundles/` directly, and `tiletopia-store` has only
      `LocalStore`. The availability walk touches every
      tile file, so a large bundle makes the layer.json request slow unless the
      bundle ships its own `available` array.

The geoprocessing NULL panic is latent in contour alone, deliberately left
because no PostGIS build ships `ST_ContourLines`, so that route answers 501
first.

## Plans — too big to hand an agent cold

### BIM, IFC first

Not promised: Revit, DWG, DGN or iModel parity. DGN V8 and iModel have no open route,
ODA SDKs and the iModel native addon are proprietary. Customers export IFC.

- [ ] After That Open Platform launches on 2026-11-23: read its docs and platform and
  write a feature comparison against what the viewer and tiletopia do.
- [ ] Size the IFC ingest budget from a measurement. `JOB_BUDGET_BYTES` in
  tiletopia is a third of a 1 GiB task, 357,913,941 bytes at the assumed 100
  bytes a vertex. Both large proof models pass that estimate partway through the
  read, `balconies-a2` at element #2378552 and `restage-demonstrator` at
  #2076200, and fail ingest. With `TASK_MEMORY_BYTES` raised to 48 GiB the server
  peaks at 2.44 GB and 1.71 GB resident, so neither fits a 1 GiB task. A program that
  runs `read_elements` and `tile_meshes` alone on tiletopia 6bea7f7 measured this:

  | | balconies-a2 | restage-demonstrator |
  | - | - | - |
  | meshes | 26,545 | 3,827 |
  | vertices | 17.9 M | 4.5 M |
  | peak after read | 1.59 GB | 1.70 GB |
  | peak after tiling | 2.42 GB | 1.85 GB |
  | peak bytes a vertex | 135 | 410 |
  | peak over IFC size | 9.2 | 9.7 |

  A vertex charge cannot size the budget: `restage-demonstrator` holds more during the
  read with a quarter of the vertices, so most of the read peak is ifc-lite's decoding,
  not the meshes `bytes_held_by_mesh` charges. The peak over the IFC size is close on
  both, so charge about ten bytes a source byte before the read starts, which refuses
  an IFC over about 36 MB at today's `JOB_BUDGET_BYTES`. Two models are too few to fix
  the factor, measure the proof models in `models.tsv` first.
- CesiumJS is the BIM viewer. Property editing and measurement snapping are in it.
  Both sides ran on hercules (RTX
  2080 Ti, headless Chromium on ANGLE OpenGL ES, 1280 by 800, the camera at 2.2
  bounding radii). CesiumJS from `benchmark.sh` run `welded-identity-sse24-quiet` on
  2026-11-06, with `TASK_MEMORY_BYTES` raised to 48 GiB, `maximumScreenSpaceError` 24
  and a load average under 3. The served tileset is the mirrored files compressed with
  brotli -q 5, the server's setting. That Open from `@thatopen/fragments` 3.6.0
  `IfcImporter` in node and `FragmentsModels` with three.js 0.187 in the page:

  | | balconies-a2 | restage-demonstrator |
  | - | - | - |
  | IFC size | 262 MB | 190 MB |
  | CesiumJS tiling job | 37.7 s | 12.6 s |
  | That Open conversion | 34.4 s | 20.6 s |
  | CesiumJS server peak resident | 2.11 GB | 1.71 GB |
  | That Open conversion peak resident | 1.36 GB | 1.61 GB |
  | elements without geometry, CesiumJS | 110, failed opening cuts | 14, no triangles |
  | CesiumJS tileset, served | 208 files, 31.2 MB | 59 files, 6.9 MB |
  | That Open fragments file | 18.9 MB | 15.0 MB |
  | CesiumJS first visible tile | 0.31 s | 0.31 s |
  | That Open first visible tile | 5.7 s | 4.4 s |
  | CesiumJS first view | 0.57 s, 2.3 MB, 0.69 M triangles | 0.55 s, 3.0 MB, 0.70 M triangles |
  | That Open first view | 6.2 s, 18.9 MB, 2.4 M triangles | 4.9 s, 15.0 MB, 0.76 M triangles |
  | CesiumJS geometry held at first view | 18 MB | 17 MB |
  | CesiumJS frame rate | 916 fps, 95th percentile 1.4 ms | 975 fps, 95th percentile 1.3 ms |
  | That Open frame rate | 256 fps, 95th percentile 5.1 ms | 1,864 fps, 95th percentile 0.7 ms |

  That Open fetches the whole fragments file before it draws, so its first visible
  tile waits for the worker to build meshes from it. The scripts are
  `~/tmp/geolang-fix/bim/thatopen-bench/{convert.mjs,bench.mjs,page.js}`.
- [!] Compare placement and properties against Ion with the BIM proof's
  `ion-compare.sh`. Needs a `CESIUM_ION_TOKEN`.

- [ ] IFC glazing. Check glass close up, then split glass from frame inside one window
  through ifc-lite's per-submesh producer. Tiles carry one colour per element today.
  The target look is That Open's "beautiful house" screenshot, glazing first.
- [ ] Match or beat That Open on the rows of the benchmark table above where CesiumJS
  still loses: frame rate on `restage-demonstrator`, served tileset size and tiling time
  on `balconies-a2`, and server peak resident on both. Repeated geometry is shared
  within a tile, not across tiles. On `restage-demonstrator` the CesiumJS scene costs
  more per frame than the tiles. `probe-frame-rate.mjs` measured an empty scene at
  1,377 fps with the globe and 2,892 fps without it. With the tiles, hiding globe, sky,
  sun and moon gives 1,437 fps, adding `orderIndependentTranslucency: false` gives
  1,645, and adding fog off gives 1,753, all at MSAA 4 like That Open's
  `antialias: true`. The face-shading shader costs 5% and FXAA is already off. Turning
  off order-independent translucency changes how glazing blends. That Open's methods, from engine_fragment v3.6.0:
  geometry deduplicated by a content hash, coplanar triangles stored as polygons and
  triangulated with earcut on load, no stored normals, pako deflate on the whole file,
  and a per-element drop under about 4 pixels on screen. Source in
  `~/tmp/geolang-fix/bim/thatopen-src/`.
- [ ] Check in a headed Chromium that `Cesium3DTileStyle` selection, hiding and
  isolation still work on tiles drawn with `FACE_SHADING_GLSL`. Cesium documents a
  `CustomShader` combined with a tile style as possibly undefined behaviour.
- [ ] Test `TiletopiaElementService` against a running tiletopia. Its unit tests use a
  fake XHR server.
- [ ] Walk, orbit and storey views on a real IFC interior, by hand, in a headed
  Chromium with a GPU.
- [ ] Run geolang viewer eval tasks 86, 87 and 88 (`query_elements`) at `--repeat 3`.
- [ ] Prove the That Open viewer tools in a headed Chromium on a real IFC: several
  clipping planes, floor plans and elevations, projected drawings, alignment
  cross-sections, and geometry edits with IDS paint and mesh volume. They have unit
  tests only, and the 2026-11-13 review found the multi-plane clipping wrong.
  4D schedules, clash detection, bSDD, and the parametric rebar, steel and building
  samples stay out. That Open Platform is still the 2026-11-23 read above.

Wait for demand: 4D schedules, clash detection, bSDD, and `rvt-rs` as a Revit preview
(bounding boxes outside 2024 and 2025 files, no built-in parameter names).

### Cesium Ion, what is left

Owner call 2026-11-13. RVT, DWG and DGN stay out.
4D schedules, clash detection, bSDD and the IFC ingest-budget rewrite stay out.
Placement against a real Ion asset is the blocked `ion-compare.sh` item above,
which needs `CESIUM_ION_TOKEN`.

- [ ] **Coarse DEM for global terrain levels 0 to 6.** The route samples
  `TILETOPIA_GLOBAL_TERRAIN_COARSE_URL` there. The worldwide file is not built.
  No vertex normals and no water mask. Roadmap 2.2.
- [ ] **Global buildings.** The comparison table's Global buildings row is none.
  Cesium OSM Buildings is the Ion side. The `gui/` globe extrudes OpenStreetMap
  footprints in the browser and does not use the server. In progress
  2026-11-13 in tiletopia's uncommitted `osm_buildings.rs`, plan by owner call:
  - One global implicit quadtree tileset, region root over the globe, heights
    -500 to 6000 m. Leaf level 15 holds the only content, about 1.2 by 0.6 km.
    Subtrees of 4 levels, binary `.subtree`, the same bytes for every subtree
    at one root level.
  - Each leaf GLB is one Overpass query to `TILETOPIA_OSM_BUILDINGS_OVERPASS_URL`,
    at most 2 at once, cached on disk under `TILETOPIA_OSM_BUILDINGS_CACHE_DIR`.
    The disk cache moves out of `global_terrain.rs` into a shared module.
  - Each building's base is the lowest ground height under its corners, sampled
    from the global terrain DEM and geoid. Without global terrain, the base is
    ellipsoid height 0 and the tileset `extras` says so.
  - Per-building feature ids and a property table with `cesium#color`, so
    `createOsmBuildingsAsync`'s default style colours them.
  - `TILETOPIA_OSM_BUILDINGS_ION_ASSET_ID` resolves an Ion id to the tileset,
    anonymous like global terrain. Reserved ion ids become a table, so two ids
    are skipped by new assets.
  - Proof, done 2026-11-13: a headed CesiumJS page over Bern drew 706 buildings
    in 26 tiles through `createOsmBuildingsAsync` and ion id 96188 on global
    terrain, bases within 1.4 m of the lowest sampled corner. CI's full test
    command passed, 1423 tests. Scripts in
    `/home/aaron/tmp/geolang-fix/osm-buildings-proof/`.
  - Open: two tiles answered 503 because overpass-api.de answered 502, and
    CesiumJS never refetches a failed tile.
- [ ] **Gaussian splats still short of Ion.** No CesiumJS run has drawn a tiled
  splat. `POST /api/v1/assets/{id}/tile` on a splat drops the upload's longitude
  and latitude, and the job fails naming them. `tiletopia tile` reads a splat
  PLY as a point cloud and writes the centres as black points. Roadmap 2.6,
  and the README rows Splat re-tile and Splat CLI.
- [ ] **Catalog add.** `POST /api/v1/catalog/{id}/add` queues a job whose input
  is the dataset URL. The job queue reads local files, so the job fails. A
  re-tile of that asset answers 404 naming the missing input.
- [ ] **Ion upload leftovers.** A source is one zip, or the single file whose
  extension the source type takes, so several models in one asset are refused
  where Ion merges them. Object keys with subdirectories answer 403.
  `DATA_ERROR` is never reported. `access_token` on the query string stays
  unread. Roadmap section 2's Need line for the Ion contract.

### Chat-only viewer mode

DESIGN.md 2.4 and 2.6 describe what is built. Upload still needs the mouse.
What is left is the weak eval tasks in **Do next** and a layer-referencing
`add_arcs` the day spacetime pairing is a layer (P0 item 7).

The eval fixtures are copies of `tests/unit/fixtures/action-catalogue.json`
and `tests/unit/fixtures/viewer-snapshot.json`. Refresh them from viewtopia
when an action or the snapshot changes. See `geolang/evals/viewer/README.md`.

### Public demo on the hosted preview

The preview is paused: `service_defaults.desired_count` is 0 in `preview.tfvars`.
DESIGN.md §2.9 has its shape and limits. It costs about 1.10 USD a day paused and
about 5.50 up. Owner calls 2026-09-19: no domain yet, share links keep granting
edit to guests. Resuming follows the F17 and F18 rollout under **Demo hardening**
and the secret rotation under **Doc sweep**. The plan, in payoff order:

- [ ] **Spend caps across accounts.** sibyl refuses model calls past
      `SIBYL_MONTHLY_SPEND_LIMIT_USD` (`src/spend.rs`) and caps runs and tokens
      per user per day and tokens per user per month (`src/daily_limits.rs`).
      geolang-api caps tool runs and uploads per caller per day. The preview
      pins sibyl v0.1.3 and geolang v0.1.12, which both carry these. Open
      tiletopia signup still lets one person hold several accounts, so the
      monthly spend limit is the real ceiling.
- [ ] **Let Aurora pause while the tasks are up.** Built on ptolemy and agora
      master: pollers tick every 30 minutes after 10 quiet minutes, pools hold no
      idle connection past 60 seconds. No tag carries it, so the preview's
      ptolemy v0.2.6 and agora v0.1.1 do not have it, and it is untested on
      Aurora. A resume after 24 paused hours can take over 30 s, which exceeds
      sqlx's `acquire_timeout`, so the first query after one may fail.
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
- [ ] **Eval tasks written for site selection prompts,** so model quality
      is measured on this workflow and not only the general suite.

Marketing, mostly distribution of the demo. The pitch: ask for sites in
plain English, get a shared map and a report, self-host free or pay a flat
fee for hosting. Pricing follows the GitLab model already decided: AGPL
self-host free, hosted per organisation at a flat monthly fee plus agent
usage, never per seat, which is the complaint about the incumbents.

- [ ] **Make the demo the ad.** A public example map on the preview that
      opens in one click, seeded with the region's parcels and census data,
      a prompt already typed and a sample report beside it. Needs the preview
      resumed, see **Public demo on the hosted preview**.
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

Rechecked 2026-11-04, the call stands: the twenty cold emails above are the test.
Evidence then: viewtopia had 5 views and 4 visitors in 14 days, the org has 2 stars,
the hosted preview is paused, every migration found goes to desktop QGIS, and no
buyer evidence exists for browser collaboration plus an agent. A QGIS plugin, a
consultant PDF report, reviewable agent branches, an Esri exit report and a change
watch wait until that test gets replies.

POC build. Owner calls: Toronto is the region, and the wedge is consultancies and
brokers who bring their own candidate sites and points of interest. The code is
geolang's `trade_area` and `score_sites`, viewtopia's `uploadToAgent.ts` and
`scripts/load-toronto.py`. Open:

- [ ] whether Toronto keeps `PARCELID` stable across daily rebuilds.
- [ ] the NL eval tests that upload a candidate sites CSV have not run against a
      live model.
- [ ] `scripts/load-toronto.py` has run on a downtown bbox only (3,951 parcels, 89
      areas, 102 s). The full city is an estimate of 4 to 6 minutes, and the hosted
      preview has not been loaded.

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

### geoplumb against GDAL

See `geoplumb/docs/gdal-gap-plan.md`, which has no open boxes. Its last section answers whether
GDAL can go to nothing: yes for the stack's own paths over two to three
years, driven by what the gated source opens in production, never for every
file a public user brings.

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
