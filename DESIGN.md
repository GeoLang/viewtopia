# GeoLang: Shipping Plan & Design Notes

> Living document. **This file + [DESIGN_TODO.md](DESIGN_TODO.md) are the single source of
> truth for whole-platform status.** DESIGN.md = state, architecture, what's shipped.
> DESIGN_TODO.md = the actionable backlog. Dated history goes in the per-repo changelogs,
> never here: this file states how things are, not how they got that way.
>
> Owner goal: **ship a usable product**. That means the ViewTopia viewer, the AI agent and
> the backend service stack, not more breadth.

---

## 1. State of the suite

GeoLang is ~20 sibling repos under `/home/aaron/src/GeoLang/` (~250k LOC), a full
Esri/Cesium-class platform, not an "LLM-over-GIS" toy. All repos are **AGPL-3.0** and
public on GitHub. Every Rust repo carries standardized CI (fmt, clippy, test, cargo-deny,
coverage, cross-platform). Geolang runs Ruff and its pytest suite in CI.

The three big structural bets are **settled**:
1. **Golden path proven and gated.** The full stack comes up from one compose file and a
   Playwright suite (22 tests, 0 skips) locks the viewer → backends → agent round-trip
   against the live services, in CI, without stubbing geolang. See §3, Phase 0.
2. **ViewTopia is one stack.** React (`main.tsx`) is the only front-end. There is no
   vanilla `.js` shell.
3. **The backbone has real tests.** ptolemy carries ~595 test functions including conflict-depth,
   write-path and visibility coverage.

Maturity from source-level test declarations:

| Repo | Role | Tests | Read |
|------|------|-------|------|
| tiletopia | 3D tiles / terrain / COG | ~737 | Mature ✅ |
| ptolemy | versioned PostGIS backbone | ~595 | Hardened ✅ |
| jung | cartographic rendering library | 324 | Labels render on the default path (style text properties, priority collision, curved along lines, caller-supplied TTF), in the browser via the wasm `Renderer.add_font`, and `{token}` labels read real GeoJSON properties; viewtopia does not use the wasm crate |
| verne | foreign-format inventory + extractor (§2.7) | 233 | ✅ live-load CI against ptolemy |
| geodukt / fluvius | ETL+workflow / spatial streams | ~240 / 187 | geodukt consumed; fluvius not deployed |
| nubis / topoi | point cloud / geometry | 161 / 246 | nubis via geoplumb; topoi as viewer wasm |
| terravista | mobile SDK | 130 Rust | Android fetches and draws (Canvas); Metal/Vulkan is v0.3 ⚠️ |
| collecta | field collection | 117 | OpenRosa + attachments + Field Data panel, which publishes a form into a ptolemy dataset |
| projicio / sibyl | CRS / agent loop (§2.4) | 198 / 87 | ✅ |
| terrano / fenestra | raster / OGC gateway (WMS/WFS/WMTS/WCS/OGC API) | 140 / 98 | ✅ |
| geokode / geogit / itinera | geocode / geo VCS / routing | 75 / 73 / 84 | geogit is CLI-only, not in the viewer |
| interiora | indoor | 82 | ✅ |
| panoptes | imagery ML | 44 | ONNX path real, **no published weights** ⚠️ |
| viewtopia | flagship viewer | 1,299 Vitest tests + 22 platform E2E | 48 registry panels (18 preview-gated) + 22 plugin panels |
| geolang | NL→GIS agent | 404 pytest functions | 39 tools, wired to ptolemy/itinera/geokode/geodukt |

**Current headline risks:**
- **terravista v0.3 is Metal/Vulkan.** The Android library fetches tiles over HTTP and
  draws on Canvas, including MVT. The core still only describes the frame. Biggest
  remaining advertised-vs-real gap on mobile.
- **panoptes ships no model weights.** Inference works only with a user-supplied ONNX file.
- **ptolemy's raw-write CI check has a blind spot.** `ci/no-raw-writes.sh` cannot see a
  mutating Postgres function called through `SELECT`, which `topology.rs` does. Those routes
  are admin-only for that reason.
- **CDN config is validated, not applied.** The CloudFront catalog path forwards Authorization
  and Origin, allows the full method set (the origin 405s what it lacks) and sets TTL 0 so an
  authorized response is never replayed cross-token or post-expiry. Realtime behaviors forward
  `Sec-WebSocket-Protocol`. Tile cache behaviors match `/tiles/v1/assets/*/…` and
  `/tiles/v1/terrain/*`. The Terraform passes `validate` but has not been applied to live
  infrastructure, so the remaining risk is the untested live path.
- **nginx splits tiletopia.** `/tiles/` rewrites to tiletopia `/api/`. `/api/v1/auth/`,
  `/api/v1/portal/` and `/api/v1/realtime/` are special locations to tiletopia. Everything
  else under `/api/` is ptolemy. Asset and export calls must use `/tiles/v1`.

---

## 2. Current architecture (as built)

### 2.0 Live shared map documents (agora)

agora is the live multiplayer service behind `/agora/`: a Rust axum websocket
service owning composition documents in its own Postgres database on the shared
instance. A document is the map composition, not the feature data: the layer
list (order as base62 fractional indexes, visibility, opacity, style overrides,
layers referenced by id, with a `source` for data that must travel: inline
GeoJSON under the op cap, a URL peers fetch, for an image overlay its four
corners plus an agora attachment url holding the bitmap, for an OGC service
the handle every member requests for themselves, or for a 3D model the
tileset.json url every member loads), annotations, camera
bookmarks,
metadata and members. Concurrency is server-ordered ops with last-writer-wins
per key, no CRDT: the server assigns a monotonic sequence per document,
persists every op, folds them into a checkpoint every 256 ops and keeps a
4096-op reconnect tail, so a join gets a snapshot (carrying the caller's own
actor id and role) and a reconnect replays from `since` or falls back to a
snapshot. Presence (cursor, selection, viewport) relays with a server-stamped
actor, never to its sender, never persisted. Members authenticate with the
shared platform JWT, share links carry a view or edit role and resolve to
short-lived session tokens (`aud: "agora-session"`, so neither token kind can
stand in for the other), the link row decides the role so revocation bites on
the next connect, and the websocket handshake offers the token as the
`["bearer", jwt]` subprotocol, the tiletopia realtime contract, so tokens stay
out of access logs. Everything from the wire is capped by named constants and
rate limited without dropping the connection. The viewtopia client
(`src/live/`) applies ops optimistically, reconciles on ack, bridges the
`useAppStore` layer registry, the annotation store, the OGC layers and camera
bookmarks both ways, draws peer cursors on MapLibre, and re-offers unacked ops
after a reconnect. WMS, WMTS, XYZ and remote PMTiles travel as the service
handle alone; a WFS layer does not, because its features are already published
from the agent layers, and neither does a dropped archive, which is a browser
File nobody else can read. Clicking a peer avatar in the header follows that peer, putting the
local camera on each presence viewport it reports until a local camera gesture
takes it back, told apart from the client's own `jumpTo` by MapLibre only
setting `originalEvent` on a real gesture. Undo is per-user inverse ops. Feature co-editing is phase two: new
op types on the same session routed to ptolemy, which stays the feature
authority. Phoenix/Elixir was considered and rejected, the stack stays Rust.

A document also carries live asset readings. An editor creates a feed on the
document (`POST /agora/documents/{id}/feeds`, a name and an expected interval)
and gets a token back once; a producer opens `/agora/feeds/ws` with that token
as the bearer subprotocol and sends `readings` frames of `{asset, kind, value,
at}`. Agora writes them to a readings table and fans each one out over the map
document's websocket, so every member sees the same values, and marks an asset
offline after three missed intervals with a `liveness` frame. A join gets an
`assets` frame of current state after the snapshot, so a member who just opened
the map needs no replay, and `GET /documents/{id}/assets/at?t=` answers for a
past moment. The readings never enter the document: the client holds them in
`src/live/assetState.ts` and only the threshold rule is document state, one
`assets/rule` op naming a layer, a reading kind, breakpoints with a colour each,
and a default and offline colour. `useAssetColorsMapLibre` turns that rule and
the store into one `match` expression on the feature's `asset_id` and sets it as
the layer's colour paint, leaving the agent layer's own features and colour
alone, and the inspector shows the picked asset's latest value per kind. A rule
naming a 3D tileset layer instead becomes a `Cesium3DTileStyle` over the same
asset ids, `useAssetColorsCesium` applying it to the tileset the layer store
holds, and a picked tile feature shows the matching ptolemy feature's attributes
beside its own. The bottom bar `src/live/AssetTimeBar.tsx` asks `assets/at` for
one past moment, and the store holds that answer beside the live map so both
renderers and the inspector paint the past until Live is pressed, while the feed
keeps updating what Live goes back to.

### 2.1 Platform topology

The shipping unit is `docker-compose.platform.yml`, all fronted by ViewTopia's nginx on
`:5174` so the SPA talks to every backend same-origin via relative paths (`/api/*`,
`/tiles/*`, `/agent/*`, `/jupyter/*`, `/ogc/*`). The nginx config is
`deploy/nginx-platform.conf`, reached through a stub include
(`deploy/nginx-platform-include.conf`) plus a `deploy/` directory mount, so config edits
take effect with `nginx -s reload` instead of a force-recreate.

```
                    Browser (ViewTopia SPA, :5174, nginx)
                                   │  same-origin proxy
   ┌──────────┬──────────┬─────────┼─────────┬──────────┬──────────┬─────────┐
 /api/*    /tiles/*  /api/geocode /api/route /agent/*  /jupyter/*   /ogc/*
   │          │          │          │          │          │          │
┌──────┐ ┌─────────┐ ┌───────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐
│ptolemy│ │tiletopia│ │geokode│ │itinera │ │geolang- │ │jupyter │ │fenestra│
│feature│ │3D tiles/│ │geocode│ │routing/│ │api +    │ │(python │ │OGC WMS/│
│store +│ │terrain/ │ │(OSM   │ │isochr. │ │tools    │ │cells)  │ │WFS/WMTS│
│geoproc│ │COG/asset│ │ pbf)  │ │(graph) │ │executor │ │        │ │WCS/API │
└──┬───┘  └─────────┘ └───────┘ └────────┘ └────┬────┘ └────────┘ └────────┘
   │                                            │            fenestra reads its
┌──┴────┐                                  ┌────┴─────┐      features from
│PostGIS│                                  │  sibyl   │      ptolemy's REST API
│ :5432 │                                  └──────────┘      (PTOLEMY_URL)
└───────┘                                 (agent loop)
```

- A variable `proxy_pass` in nginx drops the URI suffix and query string unless the location
  carries an explicit `rewrite … break`. Every proxied API location depends on that.
- Compose gates nginx on tiletopia's healthcheck, so a cold bring-up never exposes the
  window between the container starting and the process serving requests.
- fenestra sits behind `/ogc/` with the prefix stripped, so WMS/WFS/WMTS/WCS are `/ogc/wms`
  etc, and fenestra's own `/ogc`-prefixed OGC API Features lands on `/ogc/ogc/*`. Its
  capabilities documents build absolute URLs, and without an override they build them from
  the bind address (`http://0.0.0.0:8080/...`), which is unusable direct and bounces clients
  off the proxy. Compose sets `FENESTRA_PUBLIC_URL=<origin>/ogc`. The `:3003` publish stays
  for dev and is reachable in the loadtest via `LOADTEST_FENESTRA_URL`.
- **The agent calls the same backend REST APIs the viewer does.** `geolang-api` is configured
  with `PTOLEMY_URL`/`TILETOPIA_URL`/`GEOKODE_URL`/`ITINERA_URL` plus geodukt. Agent runs
  execute on the `sibyl` service, which calls back into geolang-api's `/tools` endpoints for
  in-process tool execution.
- Backends are independent Rust services except `geolang-api` (Python) and `jupyter`
  (scipy-notebook for python notebook cells). Only `ptolemy` talks to PostGIS. fenestra
  goes through ptolemy's REST API.
- The panels and loadtest CI jobs bring up a stack without geolang, so viewtopia carries no
  `depends_on` for it (nginx resolves `/agent/` at request time) and compose marks geolang's
  `env_file` `required: false`.

### 2.2 Service responsibilities

| Service | Lang | Role | State |
|---------|------|------|-------|
| ptolemy | Rust | Versioned PostGIS feature store + geoprocessing, git-like branch/diff/merge, industry vertical endpoints (`/api/v1/*`) | PostGIS |
| tiletopia | Rust | 3D Tiles / terrain / COG / asset server + analysis endpoints + collaboration WS, JWT auth + portal | volume |
| geokode | Rust | Forward/reverse/autocomplete geocoding from an OSM `.pbf` | `data/region.osm.pbf` |
| itinera | Rust | Routing + isochrones + delivery optimization over a prebuilt graph | `data/graph.bin` |
| fenestra | Rust | OGC gateway WMS/WFS/WMTS/OGC-API/WCS over ptolemy + a GeoTIFF coverage dir | reads ptolemy, `COVERAGE_DIR` |
| geodukt | Rust | ETL workflow executor, validates and runs TOML manifests (internal `:8100`) | bind-mounted workspace |
| geolang-api | Python | NL→GIS agent tools + `/tools` manifest and executor, drives the viewer + calls the backends | cache |
| sibyl | Rust | agent loop, LLM calls, sessions | sqlite volume |
| jupyter | n/a | python notebook kernels for viewtopia notebook cells | scipy-notebook |
| viewtopia | JS/TS | The SPA (this repo) | nginx |

- geodukt's container runs as uid 999 against a host-owned bind mount, so compose pins
  `user:` or every pipeline sink fails.
- fenestra pins the `terrano` crate at tag `v0.1.0`, so terrano's multi-band
  work does not reach it until a retag. terrano's single-band GeoTIFF output is
  byte-identical to before that work (golden fixture), which is what keeps the pin safe.
  tiletopia tracks terrano's master branch: its terrain analysis (slope, aspect,
  hillshade, hydrology, viewshed) and elevation reads come from there, so terrano
  pushes before tiletopia builds.
- tiletopia picks a tiler by file extension. Meshes (glTF, glb, obj, FBX, IFC, GML) go through
  this repository's own readers and mesh tiler, and only GeoJSON, GeoPackage and KML reach
  mago-3d-tiler, a jar named by `TILETOPIA_MAGO_JAR`, because the native readers take no vector
  input. A source whose own coordinates are z-up rotates the written glTF, since the tileset's
  frame is the ENU one the root transform names.
- tiletopia builds a PMTiles archive by running `tippecanoe` as a subprocess with a memory
  limit, a timeout, a work-directory quota and its stderr captured into the job record, which is
  the only place it reports progress or explains a refusal. Linking it is not an option: it
  builds no library, its entry point takes `sqlite3 *` and STL types across what would be the
  ABI, it calls `exit()` throughout, and its configuration is global mutable state. ptolemy's own
  MVT path stays live from PostGIS, because an archive is stale the moment someone commits and
  editable data is what tippecanoe cannot serve at all.

### 2.3 Authorization model

One HS256 secret signs `{sub, exp, role}` tokens every service accepts, so a user is one
subject across the platform. The tenancy unit is that subject and the resources it owns or was
granted: there is no org boundary above it. The organizations, org_members and
`datasets.org_id` that `008_tenancy.sql` created are dropped again by migration 028, because
nothing enforcing ever read them and the `org_members` fallback in the informational `/check`
routes could answer allowed where the write ladder refuses.

In ptolemy, multi-tenancy is enforced in two symmetric middleware layers over the same id
resolution.

**Visibility (read side).** Datasets have per-dataset visibility. A private dataset answers
404, not 403, and is filtered out of every listing. The resolver maps every dataset-owned id
kind a path can name (features, rasters, pointclouds, STAC collections, attachments) back
to its dataset, so `/rasters/{id}`, `/pointclouds/{id}`, `/stac/collections/{id}` and
`GET /attachments/{id}` all 404 on private data, and `/stac/search` filters by visible
datasets. Pointcloud query/profile are classified as reads so anonymous callers reach public
data, with the visibility middleware as their only gate. Terrain reads are anonymous.

**Write ladder (write side).** Every mutating route is gated on `ensure_branch_writable` /
`ensure_dataset_writable`: a write-permission ladder with creator auto-grant, dataset-admin
delegation and revoke-lockout protection. The editor role alone is not enough, because
without the ladder an editor could write to any public dataset they hold no grant on. The
ladder fails closed: a dataset with no grant rows denies every enforced writer rather than
falling back to the role gate, and migration 027 backfills an admin grant for each such
dataset's `created_by`. A dataset whose `created_by` is blank or a machine label is skipped
and stays instance-admin-only until an admin grants, so a deployment needs at least one
instance admin, and a service account writing to datasets it did not create needs a grant. Three
routes check in-handler because their target arrives in the request body. The three topology
routes are admin-only because they issue schema DDL and discard the dataset id, leaving
nothing to ladder. The four `/permissions` routes are deliberately exempt: `require_dataset_admin`
is the stricter gate there, and running the ladder as well would lock a dataset admin out of
the case they need it for.

**Every path-based policy decision keys on axum's matched route template, never the raw
request path.** A free-text trailing segment is caller-controlled, so a raw-path exemption
list let `DELETE /datasets/{id}/tags/trace` read as an exempt compute endpoint and delete
rows past the gate. A template comes from this crate's own route tables, which ends the class
rather than the instance. The convention the gate rests on is the first `{param}` of the
template, not the first uuid-shaped path segment. The tests drive the live router, walk the
real mounted route table and plant policy keywords in every free-text terminal segment.

**Unguarded writes fail to compile.** Raw write statements live in `ptolemy-storage` behind
`WriteGrant`, a struct with a private field that only the ladder can mint, and each guarded
write takes the id it writes under *from the grant* rather than from its own arguments, so a
grant cannot be aimed at a target that was never checked. `Writer` and `WriteGrant` stay
separate on purpose: one is the input to the check and must stay freely constructible for the
CLI, the other is the output and is worth nothing unless it is unforgeable. `pool()` is split
into `read_pool()` and `unguarded_pool()`, the latter banned by name inside `ptolemy-api` by
`ci/no-raw-writes.sh`. That script's own header records its limit: it cannot see a mutating
Postgres function called through `SELECT`.

**Every mounted route is swept against a migrated database.** `tests/route_sweep.rs` derives
the route list from the router itself, by parsing axum's `Debug` output for the internal path
table, so a new route is covered without anyone remembering it. It calls each one with fixture
data and fails on SQLSTATE 42703 and 42P01, which is the class where a handler names a column
or table the migrations never create. The SQLSTATE cannot come from the response, since a
handler flattens the error to `internal error` and the ArcGIS facade answers 200 with the
failure in the body, so every database error goes through `errors::log_db_error` and the test
reads the logged code. An extractor rejection also fails the sweep, because then the handler
never ran and the sweep proved nothing. Coverage is only as deep as the SQL branches the
fixtures reach, which is what per-route query variants are for. Routes needing an absent
extension answer 501 rather than 500: MobilityDB for the five trajectory analytics routes,
pgvector for the four similarity routes.

**Workspaces, projects and roles.** ptolemy holds workspace and project names, descriptions,
memberships, owner/editor/viewer roles and invitation records. ViewTopia reads and mutates them
over authenticated `/api/v1` calls and keeps none of that metadata in IndexedDB. Any signed-in
user creates a workspace and becomes its owner, a workspace editor creates projects and becomes
their direct owner, project access is inherited from the workspace or granted directly, and the
effective role is the highest of the two. Owners manage direct members, pending invite links and
deletion, editors update metadata, viewers read and switch. An invite link is stored as a token hash
alone, grants editor or viewer and never owner, and carries the expiry its creator names, which
ViewTopia sets seven days out (`SHARE_LINK_EXPIRY_DAYS`). Owners also add a known user by JWT
subject, since there is no user directory. ptolemy emails the link when `SMTP_URL`, `SMTP_FROM`
and `PUBLIC_BASE_URL` are set, and the share dialog offers the email field only when the server
reports email configured. A project's shared state is `project_state(project_id, key, value jsonb,
updated_at, updated_by)` behind `GET/PUT /api/v1/projects/{id}/state/{key}`, viewers reading and
editors writing, capped at 5 MB per value: ViewTopia keeps its map snapshot under `map` and its
dashboards under `dashboards`. The value is opaque to the server, so a snapshot shape change
needs no migration. A project is also a third attachment owner beside a dataset and a feature,
in the same one-owner CHECK, which is what carries overlay bitmaps.

**Project roles reach datasets and documents.** A ptolemy dataset carries a nullable
`project_id`. Attaching one needs dataset admin plus project editor or owner and makes the
dataset private, detaching never makes it public again, and the read, write and admin checks take
the max of the explicit grants and the project role, mapping viewer to read, editor to write and
owner to admin. ViewTopia's Project menu offers Manage Datasets to editors and owners, listing
every readable dataset with Attach on the ones in no project and Detach on the ones in this one.
An agora document carries the same nullable `project_id`, set at creation or by a
document editor, and access to a project-linked document is the max of its members row and the
project role, mapping viewer to view and both editor and owner to edit. agora resolves that role
by calling ptolemy `GET /api/v1/projects/{id}` with the caller's own bearer, cached 30 seconds per
document and user, so a revoked membership can still reach the document for that long. ptolemy
unreachable, refusing, or unconfigured (`PTOLEMY_URL` unset) falls back to the members row alone.
`GET /documents` folds the role in with one call to ptolemy's `/api/v1/projects` for the whole
listing, so the Live picker offers a project editor the documents their role reaches, and
ViewTopia sends the active project id when it creates a live document.

**Invariants:**
- An external dataset is read-only. Writes answer 409, attachment uploads included. Exempting
  attachments would mean threading a flag through the ladder for a workflow nobody has, and
  "external means read-only" is the simpler invariant.
- A write to a missing dataset answers 404, not 500.
- tiletopia: assets have an owner, destructive writes are owner-or-admin, `/v1` and native
  writes are editor-gated. Roles are managed in-service with argon2id hashing. Annotations are
  asset content, so writing one is editor-gated plus owner-or-admin on the target asset, and a
  delete is scoped in SQL to the asset in the path. Plugin-registry mutations are admin-only.
  The asset listing shows the caller's own assets plus ownerless legacy rows, admins all.
  Tiles stay public by asset id, which the CDN cache TTLs depend on, so the boundary protects
  metadata and writes rather than tile bytes.
- tiletopia API keys are a second read credential beside the JWT: admin-minted (`ttk_` plus
  32 random bytes, shown once, SHA-256 at rest in SQLite), scoped by permission to read/
  terrain/analytics/export route classes, fed through a per-key token-bucket rate limit.
  A key reaches no write, admin, or user-scoped route, and a request carrying `X-Api-Key`
  is judged by the key alone, a bearer token in the same request adds nothing.
- tiletopia's premium compute routes are real, not demo payloads: STAC search proxies
  `TILETOPIA_STAC_API`, COG windows read `TILETOPIA_COG_SOURCES` through range requests,
  static maps render the server's DEM to PNG/JPEG/WebP/SVG/PDF, geostatistics solves the
  kriging systems (dense solve, capped samples and grid), geoprocessing runs geo's boolean
  overlays with buffers in a local metric frame. The STAC collection list proxies the
  same upstream as search. Absent data answers 4xx/503, never an invented payload.
- tiletopia webhooks deliver for real: subscriptions in SQLite with mint-once `whsec_`
  secrets, HMAC-SHA256 signed posts with bounded exponential backoff from a worker
  started with the server, and the advertised event set equals what the code emits
  (job.completed, job.failed, asset.deleted). The signature covers the body only, so
  replay protection is the receiver's, deduped on the stable delivery id header.
- tiletopia's scheduler runs real jobs: interval, one-shot and five-field UTC cron
  schedules persisted in SQLite, a worker claiming due jobs each tick, and only
  actions with real entry points behind them (re-tile an asset, prune export files,
  prune settled job rows). Three consecutive failures disable a job.
- tiletopia audits from one middleware inside `auth_middleware`, so a request with no token or
  a bad one never reaches it. Only the routes listed in `AUDITED_ROUTES` are recorded and only
  when they answered 2xx, because recording refusals would let a caller fill the table by being
  refused in a loop and recording every mutating method would bury the data writes under this
  server's many compute-only POSTs. A row is id, timestamp, user (`unidentified` when auth is
  off), action, resource type and id, details, success, and optional ip and org. The resource id
  is the last template parameter's value, which is empty for a create. An audit write that fails
  is logged and dropped, since the mutation has already happened. Reading the log is
  instance-admin only, capped at 1000 rows a read, and an hourly batched sweep drops rows past
  `TILETOPIA_AUDIT_RETENTION_DAYS` (default 30, 0 keeps everything).
- ptolemy audits every mutating route from one middleware inside the write gate
  (actor, method plus matched template, resource type, target id; refusals and reads
  are not recorded, an audit failure never fails the user's write). Webhooks are an
  outbox: delivery rows are inserted in the same transaction as the change (commit,
  merge, branch create, schema change), claimed with SKIP LOCKED, HMAC-signed, five
  attempts with capped exponential backoff, dead letters kept with their error.
  Webhook management is instance-admin: a subscription redirects dataset content to
  a caller-chosen URL. The delivery worker retires settled deliveries and the events
  nothing pending references, hourly in LIMIT-batched deletes
  (`PTOLEMY_EVENTS_RETENTION_DAYS`, default 30, 0 keeps everything). SSE, WS events,
  background jobs, the broken rate limiter and lock enforcement are deleted; the
  `feature_locks` table from shipped migration 006 is orphaned (nothing reads or
  writes it).
- collecta: forms carry a creator. Creating a form or submitting needs editor or admin, reading
  submissions is creator-or-admin, and form definitions are instance-readable so collectors can
  discover them. A form id cannot be taken over: the upsert carries the ownership test in the
  same statement.
- geolang: executing a tool needs a valid platform JWT when `PLATFORM_JWT_SECRET` is set. The
  manifest stays open because sibyl fetches it before anyone signs in. Unset means no gate,
  which is the standalone dev flow, the test suite and the evals.
- An unknown role string grants nothing anywhere. Every service parses the claim into a closed
  enum rather than comparing strings, so a typo or a future role fails closed.
- ptolemy config reads and metrics are admin-gated, and audit identity comes from the JWT.

### 2.4 Agent stack

**sibyl** (Rust: axum, rusqlite, hand-rolled xAI client) owns the agent loop, sessions and
summarize-on-overflow history. `geolang-api` serves a `/tools` manifest plus an executor,
where tools run in-process with no sandbox and no source shipping, and proxies runs as NDJSON
behind the `agent_event_stream` seam, so the viewer's AG-UI contract is untouched. **AG-UI is
the viewer's agent channel.**

**External agents come in over MCP.** geolang-api serves the same 39 tools as stateless
streamable HTTP at `/agent/mcp`, behind the same platform JWT gate. A request carrying an
`X-Agora-Document` header (document id or share link token) lands its map effects in that
live document: `__UI_SPEC__` layers become `layers/` ops (inline under 48KiB, published to
an open-read URL otherwise), camera commands become presence, and the agent joins as
`agent:<caller sub>` granted edit through the caller's own token. Live layer entries carry
the publisher's colour in `styleOverrides.color`. Contract details in geolang's
`docs/api_reference.md`.

**Plans are geodukt manifests.** The agent composes a geodukt TOML manifest as its execution
plan: `plan_workflow` validates it, the viewer renders the steps with a validated badge, and
approving posts the manifest verbatim twice, to `/agent/workflow/approve` and then to
`run_workflow` with `notify` so the model's session learns the run happened. The first post is
the only record geolang has that a person agreed, and `run_workflow` refuses a manifest
without one, so a model that calls it on its own gets an error instead of a run. A refused
approval shows its reason in the panel and runs nothing. The manifest downloads with a copyable `geodukt run <file>.toml`,
which reproduces the run exactly through the same executor, so no generated script can drift
from what ran. A failed run still records its steps: `execute` returns progress alongside the
error, so the record shows the steps that finished, the one that died with its own message,
and the ones never reached. Every plan step carries `runs_caller_code`, read from the tool
module's own `TOOL_RUNS_CALLER_CODE` declaration, which only `sql_query` sets, and the plan panel
labels such a step before approval rather than gating it.

**Identity flows end to end.** The viewer sends its platform JWT to `/chat/agui`, sibyl
carries it per run (in memory only, never persisted or logged), geolang's tool executor puts
it in a ContextVar, and its ptolemy/tiletopia/geodukt clients attach it. `PTOLEMY_API_TOKEN`
survives only as the headless fallback. geodukt validates the same secret, takes either an
editor-or-admin platform token or a role-free tool token carrying the exact `geodukt:run` scope
on `POST /run`, and records the caller's `sub` on the run. `/validate`, `/operations` and
`/health` stay open so headless planning and the evals still work.

**The manifest format is flat.** A step's parameters sit directly under the transform, so a
nested `[transform.params]` table is read as one parameter literally named `params`. This
bites anyone writing a manifest by hand.

**Manifest validation is strict.** Required parameters are enforced once in the registry and
checked identically on `/validate`, `/run` and both CLI paths: `distance`, `epsilon`,
`to_crs`, filter's field and value, clip's four edges, expression's expressions. `schema_map`
must do at least one of rename, drop or add, and `/gp/clip` has no whole-world default. This
is breaking for manifests that leaned on the old defaults, which beats silent wrong data (a
buffer with no distance used to validate and silently use 1 metre). Transforms are
single-input, so `spatial_join` cannot appear in a manifest at all. Known limit:
`check_parameters` catches a missing required parameter but does not reject an unknown one,
so a misspelled parameter sitting beside a valid one still validates.

**Evals** (`geolang/evals/`) score NL-to-manifest against the expected pipeline graph, never
prose. `--repeat` exists because scoring one sample per task let a flaky task report a clean
sheet. A rejected manifest is not counted as the model's answer. The local Qwen3.5-35B-A3B
model scores 1.00 over the 10-task set.

**Tool behaviour worth knowing:**
- `assess_environmental_risk` is deterministic: stable geocode pick, rounded grid, batch retries.
- `download_population_grid` computes `pop_total` as a GHS-POP zonal sum inside the dissolved
  clip polygon, for clipped and unclipped runs alike. WorldPop is the fallback and speaks the
  real async contract (geojson param, task polling, pyramid sum).
- Area and buffer geometry is computed in UTM, not 3857: Mercator inflated the reported areas
  ~2.7x and shrank the rendered buffers ~40%.
- `add_screengrid` reports "screengrid is not available on the globe renderer" as a system
  message in the chat transcript rather than drawing nothing (§2.6).

### 2.5 ptolemy data model

- Versioned feature store with git-like branch/diff/merge and a fork-aware `features` view.
- **The features view must be branch-scoped by every consumer.** Walking all branches' chains
  is the difference between 5.7s flat filters and 3-48ms branch-scoped ones.
- A dataset may declare the geometry type `geometry`, so a mixed-geometry container does not
  have to split. `geometry_type` is free text with no CHECK constraint.
- An attachment belongs to a dataset *or* a feature, enforced by a one-owner CHECK, so a
  style's icon has a carrier without inventing a feature.
- A feature version carries a half-open `[valid_from, valid_to)` valid range, exposed through
  the `features` view and filtered by `?valid_at`. Valid time reaches `DiffOp` because that is
  the only path into `feature_versions`, and an `Update` with both fields null inherits the
  previous version's range, so a properties-only patch cannot silently erase it.
- `FieldDef` carries `alias: Option<String>`, defaulted and omitted when absent so existing
  schemas are untouched. The API deserialises schemas into typed `FieldDef`, so a field the
  type does not name is dropped even though the column is JSONB. ViewTopia mirrors that shape
  in `src/lib/datasetSchema.ts` and displays the alias (§2.6).
- Trajectories pick a JSONB fallback path per request so they work on the stock PostGIS that
  CI and the compose stack run. The five trajectory analytics routes stay MobilityDB-only.
- External sources push predicates down (3-15x, and plain GiST indexing suffices).
- ptolemy publishes `ghcr.io/geolang/ptolemy` from `.github/workflows/docker.yml`. No OpenAPI spec.

### 2.6 ViewTopia internals (this repo)

**Shell layout.** One 48px header row holds everything: brand and project switcher left, the
viewer toolbar (tab pills, fly-to, tool icons and menus) in the middle, offline indicator,
backend status dot, chat toggle and theme toggle right. The chat sidebar starts closed and the
chat panel owns session management. The renderer and basemap selects live in a popover behind a
map-corner button, not in the toolbar. The minimap is opt-in via Settings. Ctrl+. (metaKey maps
to the same combo, so Cmd+. on mac) collapses header, aside, panels and map widgets for a
map-only view. On phones the toolbar is its own compact row under the header (tabs, fly-to,
Layers and Inspect one tap away, everything else folded into one "All tools" menu) and chat is
a bottom sheet with a floating toggle. Not chased from the Felt audit: their canvas annotation
renderer and per-frame cursor rotation, still below the visible waterline.

**Renderers.** Two globe renderers, not three: CesiumJS (3D globe) and MapLibre GL (vector
globe) with the deck.gl data-viz layers interleaved into MapLibre through `MapboxOverlay`
(`@deck.gl/mapbox`, `interleaved: true`), so analysis/agent/panel layers draw in the same view
as the vector globe, terrain relief and OGC rasters. There is no standalone deck.gl renderer.
Persisted state and share links that say `deckgl` fall back to maplibre. Leaflet is the 2D
map, plus a synced split view. Picking/draw/measure/agent-layers survive renderer switches.

- Feature picking goes through one map click handler that asks the overlay first
  (`deck.pickObject`), because `queryRenderedFeatures` never returns deck's custom layers.
- **The globe projection stays** (owner decision), so deck's screen-space aggregation layers
  (HeatmapLayer, ScreenGridLayer) cannot draw. Heatmaps therefore use MapLibre's native
  `heatmap` layer type: `src/lib/mapHeatmap.ts` owns the spec store and the
  radius/intensity/weight → `heatmap-*` paint mapping, `useHeatmapsMapLibre` re-adds the layers
  after a basemap swap, and both the Heatmap panel and `add_heatmap` go through it. ScreenGrid
  keeps its deck layer and says so when asked for on the globe.
- Split view panes are a list of `{renderer, basemap, hiddenLayerIds}` entries, the viewer itself being pane 0
  in the app store, each pane with its own basemap picker, all driven by one shared-camera hub
  with a re-entrancy guard and a subscribe-time snap, with clean teardown so the WebGL context
  limit holds. The layout is two panes across or a 2x2 grid, derived from how many panes there
  are rather than stored, and the viewer is the top left one. A swipe compare overlays two
  panes under a clip path, so it is two panes only. Compare panes may also draw with Leaflet,
  on the raster approximation of a vector basemap; the viewer pane stays a globe because the
  tool bindings assume one. Clicking a pane makes it the active one, which is what the
  map-corner basemap and renderer pickers style, and only the UI keeps Cesium to one pane: the
  option is closed wherever another pane holds it. A pane's `hiddenLayerIds` is
  what lets two panes draw different things: every agent-layer hook skips a layer
  its own pane hides, which is how the Scenario panel puts a base branch on one
  side and a scenario branch on the other.
- Agent layers reach a pane by subscription, not by effect ordering: `useLeaflet`, `useMapLibre`
  and `useCesium` publish the instance they build as state, and the three `useAgentLayers*`
  hooks key every effect on that instance rather than on the app-level renderer and tab. A pane
  switching renderer after mount builds a new map, and the hooks re-add against it because they
  saw it appear.
- All navigation, bookmarks included, goes through the shared fly-to pipeline, which is what
  makes it work on the 2D renderers and for bookmarks that carry no camera.
- The 2D map tab disables the renderer select and the vector basemap options.
- A `.pmtiles` file picked from disk in the basemap popover becomes the basemap
  itself: a vector archive through the Protomaps layer set with the app's own glyphs and
  sprites, a raster one as a single raster source, both over `pmtiles://<file name>`. Only
  MapLibre reads it, so Cesium, Leaflet and the minimap draw no basemap while one is
  selected rather than substituting a hosted raster. The archive is a browser File, so a
  reload and a project file both come back naming it and asking for the file again.
- A server tileset (a large vector file built into PMTiles by tiletopia, served under
  `/martin`) is an `ogcLayers` entry drawn by MapLibre only, the same rule as the local
  PMTiles basemap: Cesium filters the type out and the layer UI says so. The import path
  offers the server route for supported files and requires it over 50 MB
  (`BROWSER_IMPORT_LIMIT_BYTES` in `src/features/tilesets/api.ts`).

**Editing a branch feature.** The Dataset Editor edits properties, redraws a whole geometry
through the draw tool, and moves one vertex at a time by dragging handles the map draws over
the open feature, with every released drag queued as one update against the version the row
was opened at. Its WKB codec reads Z, M and GeometryCollection geometries, keeping Z and
dropping M, so a feature ptolemy holds in any of those forms is still selectable and editable.

**Which service answers for a layer.** Every layer type in the viewer is served by one
service, reached at one prefix (§2.2 says what each service is):

| Layer or panel data | Service | Route |
|---|---|---|
| datasets, branches, features, projects, workspaces | ptolemy | `/api/v1/*` |
| server tilesets and their `/martin` vector tiles, PMTiles exports, terrain bundles, 3D Tiles assets | tiletopia | `/tiles/v1/*`, `/martin/*` |
| live documents, comments, presence | agora | `/agora/*`, the `/agora/ws` socket |
| agent layers and tool outputs | geolang | `/agent/geojson/*` |
| WMS, WFS and WMTS the platform serves | fenestra | `/ogc/*`, which the viewer asks itself only for SLD conversion (`/ogc/sld/symbology`) |
| a WMS, WFS, WMTS, XYZ or PMTiles URL the user typed | whichever host that URL names | as typed |
| basemaps | the configured tile host (`src/hooks/basemapTiles.ts`) | as configured |
| elevation profiles and cross sections | open-elevation.com | `/api/v1/lookup` |

A layer that cannot load says which of those failed. Every client names the service on
status 0, 502, 503 and 504 ("<service> is unreachable"), a layer that failed carries the
reason and a Retry on its own row in the Layers, Data Sources and tileset lists, a commit
the server refuses is dropped from the sync queue and shown once rather than retried, and
the header lists the services that answered no health probe.

**Agent UI.** Chat panel plus a registered viewer command protocol. The agent emits commands
(flyTo, addLayer, measure, deck layers, style-by-*, ~20 tool commands) that execute
client-side, and the agent side is geolang's `viewer_control` tool. Chat replay and markers
work on all three renderers. The plan panel shows one line per step with its operation,
parameters, input and outcome, the failing step's reason in a tooltip rather than inline, and
written outputs as download links (the serving route is not a `:path` route, so links use the
basename). Agent-supplied strings reach the renderers as data, never markup: Leaflet
tooltips take an element with `textContent` because a string tooltip is parsed as HTML,
MapLibre marker colours are assigned to `style.background` rather than interpolated into
`cssText` so a value carrying a second declaration is dropped, and Cesium labels are WebGL
glyphs that never touch the DOM.

**Tool panels.** 48 registry panels, 30 on by default, plus 22 plugin panels (measure, feature-picker, geojson/style editors,
geocoding, routing via itinera, terrain profile, cross-section, heatmap, spatial stats,
weather/wind, shadows/lighting, raster/COG, space-time, notebooks, the industry verticals
wired via plugins to ptolemy `/api/v1/*`). **18 experimental panels are gated** behind a "Show Preview
Tools" setting with a Preview badge, so there are no dead buttons in the default UI.

- Signed-out and keyless states replace failed requests. Terrain/Flood/Solar and Viewshed
  read the session before POSTing, disabling Run behind a sign-in hint. The catalog panel
  renders a signed-out state rather than firing an anonymous 401. The basemap-catalog panel
  previews and selects Jawg tiles only once its access-token setting is filled in, and
  street-view needs a Google Maps API key for the embed. Neither keyed host is contacted
  before its key is set.
- Analysis panels read the shown renderer's view and draw results on it (`viewBounds.ts`).
- **External services.** Geocoding and routing prefer the platform's own geokode and itinera
  over the proxy (`/api/geocode/forward`, `/api/route`), through the offline API cache, so a
  query asked before still answers with no network. Nominatim and the public OSRM stay as the
  fallback for a stack that has neither deployed, and offline they are not attempted at all:
  `services/geocode.ts` and `services/route.ts` raise instead, so the panel says the user is
  offline rather than reporting an empty result. Open-elevation, open-meteo and Overpass are
  online only, because every one of them is keyed by a fresh line, view or camera bbox that no
  second call repeats, and they refuse through `requireOnline()` with the same message rather
  than through whatever the browser's failed fetch throws.
- The terrain panel defaults to the platform service with a graceful no-source state. tiletopia
  serves quantized mesh for Cesium and a terrain-RGB endpoint (mercator XYZ, mapbox encoding,
  anonymous) for MapLibre relief. It also serves prebuilt quantized-mesh bundles, listed
  anonymously at `/tiles/v1/terrain/bundles`, and the panel offers one provider option per name
  it finds there. A stack without tiletopia answers 404 and a tiletopia with nothing on disk
  answers `[]`, so the panel shows the bundle group only when there is a bundle to pick.
- The layer panel lists agent-drawn layers as well as plugin-host layers, with working opacity,
  remove and download. One id can sit in the layer list and in the store the renderers draw
  from, so the panel shows one row per layer, the row whose controls reach what is drawn, and
  visibility is written to both stores through `store/layerVisibility.ts`.
- A layer or marker colour from the agent or a file is parsed or dropped (`lib/color.ts`).
  Beyond injection, Cesium's `Color.fromCssColorString` answers undefined where its typing
  promises a `Color`, so one unreadable colour would stop the draw of every layer behind it.
- An image overlay dragged out of square renders warped on MapLibre and Cesium. Leaflet drapes
  onto a rectangle only and shows the envelope, which stands: it has no native quad warp and a
  plugin dependency is not worth one renderer's edge case.
- Choropleth bakes the class colour into each feature as simplestyle properties, which Cesium
  already honours per feature, so MapLibre and Leaflet need only a few lines each. It is offered
  only for a numeric field with more than one distinct value.
- The Space-Time panel draws tracks as a cube, time on the vertical axis, with a sweep plane,
  ground shadows and a trail window over the entities the map holds. An import is capped at
  `MAX_TRACK_POINTS` (100k) points and strided down past it. Seven analyses run in a worker off
  the main thread: colocation, co-travel, pattern of life, network metrics, clustering,
  prediction and data quality. The deliberate line is that this is a movement cube and not an
  intelligence platform: no ontology, no CDR import, no classification markings, no per-record
  access control and no entity resolution.
- A project carries its map, and the map lives on the server: the snapshot goes to ptolemy under
  the project's `map` state key, debounced behind any change, and is read back on project switch
  and on sign-in. `projectMaps` in IndexedDB is the offline cache of the same shape as a
  `.viewtopia.json` file, the newer `savedAt` of the two wins, and a save the network refused goes
  out again on the next change, the next project switch, or the browser's `online` event. Overlay
  bitmaps go up as ptolemy project attachments and the snapshot names them, with `overlayImages`
  as the local cache, so a member who has never seen a picture still draws the overlay. A project
  with no stored map keeps what is on screen, so creating one forks the current map rather than
  clearing it. Switching inside a live document imports the project into it, because the
  outbound sync watches the stores `applyProject` writes. Dashboards sit in the same store under
  the project's `dashboards` state key rather than in localStorage, so they follow the project
  rather than the browser. OGC layers are the one thing a
  document cannot hold, see DESIGN_TODO.
- Imports carrying timestamps (CSV/GeoJSON properties, GPX `coordTimes`) become playable CZML
  with availability, so Timeline Fit-to-Data works through the UI.
- SQL exports go through `COPY (...) TO '<temp>'` and `copyFileToBuffer`, then drop the temp file.
  In the browser that file lives in the wasm filesystem, under the node bundle used by the tests it
  lands in the process working directory instead.
- A loaded raster is written back out as a Cloud Optimized GeoTIFF by the same terrano wasm
  module the analysis ops run in, one band or one analysis result per file, tiled with
  overviews and deflated. The band goes out in the sample type it was read as, which
  `RasterMetadata.sampleFormats` carries from the typed array geotiff decoded it into, so an
  8-bit image stays 8-bit rather than costing eight times its size as f64. An analysis result
  is f32. Pixel size comes from the bbox and the size actually read, because a large raster is
  read downsampled and the resolution tag describes the file. An integer COG has no NaN, so
  nodata is the source's own value when the format can hold it and otherwise a sample the band
  never uses, counted in from the bottom of a signed range or the top of an unsigned one.
- Binary vector imports read registered buffers through DuckDB spatial. Zips are unpacked with
  fflate because `/vsizip/` cannot see a registered buffer, the geometry column and its CRS both
  come from `DESCRIBE` (`GEOMETRY('EPSG:3857')`), and `ST_Transform` needs `always_xy` or EPSG:4326
  comes back as lat/lon.
- A ptolemy dataset's field aliases are displayed wherever a column name is. `lib/datasetSchema.ts`
  is the one mirror of ptolemy's `FieldDef` JSON, and the vector-tiles panel loads a dataset's
  fields into `store/datasetSchemas.ts` beside its style. Lookup is by column name across every
  loaded dataset, because the attribute table, the feature-info panel and the symbology and
  toolbox selects all work off property keys and none of them carries a dataset id. The alias is
  a label only: every select's value, every sort and every property lookup stays the column name.
- An expression renderer colours, and optionally sizes points, by arithmetic over a feature's
  own columns rather than by a class lookup. `features/symbology/expression.ts` holds the whole
  language: column names, numbers, brackets and `+ - * /`, parsed to a three-node tree and
  evaluated over one property bag. It is deliberately the intersection of QGIS expressions,
  Mapbox expressions and OGC filter arithmetic, so it exports to all three with nothing to drop,
  and it is total, so a malformed expression is a message under the input rather than a throw in
  the render loop. The rule renderer's condition evaluator is not reused because it answers
  true or false about one comparison where this has to produce a number. A ramp over the value
  is the colour, so the legend samples the ramp rather than listing classes.
- A layer's symbology exchanges with three foreign style formats, all per layer from the
  symbology editor. SLD import posts the document to fenestra's `/sld/symbology`; SLD export,
  Mapbox style JSON both ways and QGIS `.qml` both ways are client-side in
  `features/symbology/`. QML is the only one of the three that carries the single colour, the
  layer opacity and the zoom range, because it is the only one whose format has a place for
  them: SLD export writes the classes alone and its button is disabled without symbology.
  A symbology holds colour per class and nothing else, so every importer reports what it could
  not carry in the same `unsupported` shape fenestra answers with, and the panel lists it.
  Exports report the same way, because an expression renderer is continuous and only a Mapbox
  style has an interpolate to hold that: SLD and QML take it as five classes and say so, and
  the point sizes reach SLD as a per-class graphic size but reach QML not at all. Only SLD
  import is blind to all this, since it is fenestra's conversion rather than this viewer's.
- WMTS (REST template) and WFS (GeoJSON → agent layers) are verified against fenestra.
- The building-data toggle self-disables on styles with native 3D buildings and re-enables on
  raster styles at `style.load`.

**Collaboration client.** tiletopia mounts the room WebSocket, which now carries chat and the
online roster only: peer cursors and camera-follow belong to a live document's agora presence, so
a room without a live session has neither. The JWT travels in the WebSocket subprotocol and query
tokens are rejected, sender identity is server-stamped from the JWT `sub`, and SRTM fetches are
bounded per terrain request. The viewer takes its token from the session, opens no socket when
signed out, and keys identity off the JWT `sub` because a presence roster has no self marker and
names are spoofable. The socket URL is built from an absolute `tiletopiaUrl` (http → ws,
https → wss, root-relative unchanged). Server-side: presence is refcounted per connection so two
tabs of one account survive one closing, rooms are reclaimed when empty, and room creation is
capped at 32 per user with refusals closing as 4029, which the client surfaces as "too many rooms
open" without reconnecting into the same refusal.

**`src/` module groups:** `components/` + `features/`, `spacetime/` (31 space-time modules),
`plugins/` (file-discovered + built-ins), `notebooks/`, `raster/`, `offline/` (IndexedDB
local-first, op queue, and a vite-plugin-pwa service worker that precaches the built shell and
nothing else, so API responses and tiles stay with `offlineFetch` and the tile cache),
`projects/`, `store/` (Zustand),
`duckdb/` (in-browser analytics). ~228 source files.

**Test surface.** A vitest unit suite, a 22-test platform E2E suite against the live stack with
a strict console-error tripwire and zero 5xx tolerance, a registry-derived panel sweep across 50
tools, and a runtime-enumerated plugin sweep across all 23 plugin panels. The panels and sweep
stacks run without an agent, so `openApp` in `tests/e2e/panel-helpers.js` stubs the
`/agent/health` probe with a 2xx (the only answer chrome does not log as a console error). The
header status dot is the only thing that reads it. Lint is Biome (`lint`/`lint:fix`, formatter
off) with the noisy rules downgraded.

Two things to know before believing a red panels run: the suite is scheduled rather than
per-push, so a passing push run and a failing nightly can legitimately disagree about the same
tree, and WebGL context timeouts flake and pass on retry.

### 2.7 verne (foreign-format inventory and migration)

verne is a read-only inventory and extractor for foreign GIS sources: `verne-core` (model plus
verdicts), `verne-kml`, a feature-gated Esri File Geodatabase crate, `verne-arcgis` (hosted
ArcGIS feature services over REST, no GDAL, always built), `verne-load` and `verne-cli`. Public
AGPL. It lists a portal's feature services (`verne services`, `sharing/rest/search`), reads
KML/KMZ, `.gdb`, FeatureServer and MapServer URLs (whole or scoped to one layer id, the shape
portal item URLs come in; a map service's group layers become hierarchy rows, its rasters are
named for terrano, and per-layer versioning reaches the report; `--gdb-version` reads a named
geodatabase version, one per extraction), reports what a migration into
GeoLang would keep and lose, and can extract a geodatabase or a feature or map service into a
sidecar that `verne load` posts into a running ptolemy. A geodatabase extraction also writes a GeoPackage;
a REST extraction cannot (no GDAL), so its feature files and sidecar are the whole output. On
the REST path the service itself reprojects to 4326 (`outSR`); the untransformed original is
fetched in a second per-page pass keyed by object id and rides on each insert as an EPSG code
or WKT. The token comes from `VERNE_ARCGIS_TOKEN` in the `X-Esri-Authorization` header, never
an argument, or verne mints one itself from `VERNE_ARCGIS_CLIENT_ID`/`_SECRET` via OAuth
client_credentials against the portal in `VERNE_ARCGIS_PORTAL`.

**The report is the product, so a loss it names is a work item, not a footnote.** Each row is
faithful, approximated or unsupported, and `Losses` cannot be constructed empty, so an
approximated verdict that names nothing lost cannot be written down. Where a source format has
no equivalent concept at all, the verdict is "not applicable" rather than "unsupported": a file
geodatabase has no versioning or archiving (both are enterprise-only Esri features), so
branching-beats-SDE-history is an advantage only over enterprise sources.

A truncated source must be detected explicitly: quick_xml reaches Eof without objecting to
elements left open, so an unchecked read reports a truncated file as a clean one.

- **Licence position holds in code, not prose.** The geodatabase opens with `allowed_drivers`
  pinned to `OpenFileGDB`, so Esri's SDK driver can never be picked up.
- GDAL reads the two hardest semantic layers (coded and range domains since 3.3, relationship
  classes with cardinality and composite flag since 3.6) but georust's crate wraps neither, so
  verne carries ~260 lines of read-only glue over `gdal-sys`. Esri subtypes have no GDAL model
  at all and are parsed out of the geodatabase's own catalog XML.
- The domain and relationship handles are borrowed const pointers the dataset owns, and freeing
  them aborts the process. Only the two `*Names` lists are the caller's to destroy.
- **All GeoPackage work is serialised behind one mutex, read-back included.** GDAL 3.8's
  GeoPackage driver calls `spatialite_cleanup_ex` on every dataset close, tearing down libxml2's
  process-global encoding table, so two threads closing a GeoPackage at once free it twice. GDAL
  3.11 never reaches that path, which makes the bug invisible on newer GDAL and on machines with
  enough cores to spread the work. A thread-local flag with a debug assertion catches an
  unguarded close on any version, since otherwise a future call added outside the lock would pass
  every local test and abort only on CI.
- Written GeoPackage layers are paired to source tables **by name**, with a single-candidate rule
  for real renames and a loud refusal when two candidates make attribution a guess. Pairing by
  position is wrong on real output, where a GeoPackage lists its spatial layers first, and it made
  the report claim renames that never happened and invent dropped fields and lost features. In a
  product whose value is an honest account of losses, a fabricated loss is the worst failure
  available.
- The extraction sidecar's structs mirror ptolemy's request bodies field for field, so loading is
  a POST of each struct rather than a translation that can drift. Two fields cannot mirror,
  because ptolemy wants the id of a row that does not exist until the load runs: a subtype's
  `domain_assignments` names its domains and a relationship class names its two datasets, so both
  are typed as names and the loader swaps them.
- The extraction log records every report row as carried, carried-with-losses or skipped, decided
  from the verdict rather than from the caller, so the report and the log cannot give different
  accounts of the same thing. Operator and timestamp are required, because the licence position
  is that "with permission" must be a mechanism with a record of what was taken.
- **The loader's live tests run in CI** (`live-load` against `ghcr.io/geolang/ptolemy:master`).
- The measured comparison in verne's README is the clearest statement of why the project exists:
  for the same conversion, GDAL's GeoPackage keeps 18 of 62 domains, none of the 10 relationship
  classes and no subtypes at all. Most of those domains are reachable only through subtypes,
  which GDAL does not model, so it never sees them used and never carries them.

**What the platform carries because of the report.** jung's `StyleRule` carries min/max zoom and
`symbology_rules` carries min/max scale. `SpriteAtlas::insert` takes any icon, so jung symbolises
from outside its own library. jung symbol placement carries an icon anchor, a pixel offset and a
clockwise rotation, so KML `hotSpot` and IconStyle `heading` survive (`blit_icon` remains the
default-placement wrapper). terrano's `BandedRaster`, 8-bit samples and multi-band GeoTIFF
writer/reader keep an RGB or RGBA overlay's colour. `gx:Track` is inventoried one row per
placemark against ptolemy's trajectory model, with losses computed from what each track actually
holds (altitude, per-sample angles, `gx:SimpleArrayData` columns, year-precision timestamps).

**Honest mismatches that remain.** A KML `TimeStamp` is an instant and a valid range is not. KML
permits year precision and `timestamptz` does not. Overlay rotation has no rotation terms to land
in, though an axis-aligned `LatLonBox` in EPSG:4326 maps exactly onto an origin and a pixel scale,
so nothing is resampled. A column type ptolemy's six field types cannot name is approximated to
the nearest, with both the report and the log naming the column and the type it had. A KML
`SimpleField` width collapses to a JSON number in `properties`. A null geometry records a
deletion, so an attribute-only placemark needs its own convention.

### 2.8 Data prerequisites (runtime)

| Service | Needs | Provided by |
|---------|-------|-------------|
| geokode + itinera | `data/region.osm.pbf` (OSM extract, Monaco for the demo) | `scripts/platform-up.sh` fetches it |
| itinera | `data/graph.bin` (built from the `.pbf`) | built by `platform-up.sh` |
| geokode | `data/addresses.csv` (optional, extra addresses) | optional |
| geolang | LLM API keys (`XAI_API_KEY` / `OPENAI_API_KEY`) | `geolang/.env` via `env_file` |
| fenestra WCS | `COVERAGE_DIR` of `.tif`/`.tiff` (optional) | operator-supplied |

One-command bring-up: `docker compose -f docker-compose.platform.yml up -d --build`, then
open `http://localhost:5174`. `scripts/platform-up.sh` wraps it with data fetch + seeding,
and also covers one-command regional bring-up for a chosen extract.

A read-only external dataset mode exists as an entry point over plain PostGIS, for pointing
the platform at a database it does not own.

`loadtest/` holds the load-test harness (nightly in CI) with a published baseline. Its
tiletopia scenario measures a harness-owned seeded tileset so it is idempotent and skips
honestly after teardown. Its fenestra scenario measures the proxy route by default.

---

## 3. Roadmap: phases

Detailed task state lives in [DESIGN_TODO.md](DESIGN_TODO.md). High-level:

- **Phase 0, prove & lock the golden path.** ✅ DONE. Stack bring-up is reproducible, and one
  golden journey (viewer → tileset → geocode → route → NL agent command) is locked by a
  22-test Playwright gate against the live stack, wired into CI without stubbing geolang.
- **Phase 0b, collapse ViewTopia to one stack.** ✅ DONE. React is the only front-end, and
  NL→map is verified end-to-end through nginx.
- **Phase 1, finish the v1 surface (viewer + agent + services).** ✅ DONE. Vertical panels wired
  to real endpoints, experimental panels preview-gated, analysis + jupyter E2E un-skipped,
  one-command quickstart.
- **Phase 2, harden the backbone.** ✅ DONE. ptolemy write/merge hardening + fork-aware
  feature view, multi-tenancy across ptolemy and tiletopia (§2.3), collecta JWT auth + sync
  protocol, fenestra real WCS. All verifier-confirmed.
- **Phase 3, mobile & ML breadth.** ⏳ NEXT. terravista v0.2 (HTTP tiles + MVT on Android)
  shipped; v0.3 is Metal/Vulkan. panoptes model weights. collecta media attachments
  shipped; increment 3 is ptolemy push. Off the core viewer+agent path.

**Explicitly not being invested in until the core ships:** breadth for its own sake. The
platform is already wide, and the work is depth on the golden path.
