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
coverage, cross-platform); geolang has none (open item in DESIGN_TODO).

The three big structural bets are **settled**:
1. **Golden path proven and gated.** The full stack comes up from one compose file and a
   Playwright suite (18 tests, 0 skips) locks the viewer → backends → agent round-trip
   against the live services, in CI, without stubbing geolang. See §3, Phase 0.
2. **ViewTopia is one stack.** React (`main.tsx`) is the only front-end. There is no
   vanilla `.js` shell.
3. **The backbone has real tests.** ptolemy carries ~308 tests including conflict-depth,
   write-path and visibility coverage.

Maturity (test-fn counts via `grep -rE '#\[(test|tokio::test|sqlx::test)'`):

| Repo | Role | Tests | Read |
|------|------|-------|------|
| tiletopia | 3D tiles / terrain / COG | 651 | Mature ✅ |
| ptolemy | versioned PostGIS backbone | 581 | Hardened ✅ |
| jung | cartographic rendering | 307 | Well-tested ✅ |
| verne | foreign-format inventory + extractor (§2.7) | 230 | ✅ |
| geodukt / fluvius | ETL+workflow / spatial streams | 187 / 170 | ✅ |
| nubis / topoi | point cloud / geometry | 158 / 140 | ✅ |
| terravista | mobile SDK | 107 | core only, renderer is roadmap ⚠️ |
| collecta | field collection | 103 | JWT auth + sync real, media is roadmap ⚠️ |
| projicio / sibyl | CRS / agent loop (§2.4) | 97 / 87 | ✅ |
| terrano / fenestra | raster / OGC gateway (WMS/WFS/WMTS/WCS/OGC API) | 86 / 83 | ✅ |
| geokode / geogit / itinera | geocode / geo VCS / routing | 72 / 70 / 62 | ✅ |
| interiora | indoor | 49 | ✅ |
| panoptes | imagery ML | 45 | ONNX path real, **no published weights** ⚠️ |
| viewtopia | flagship viewer | 347 vitest + 18 platform E2E | 48 registry panels (18 preview-gated) + 22 plugin panels |
| geolang | NL→GIS agent | 172 (py) | 39 tools, wired to ptolemy/itinera/geokode/geodukt |

**Current headline risks:**
- **terravista can't draw a map yet.** Camera, cache and FFI are real, but GPU rendering,
  HTTP tile fetch and MVT decode are all still roadmap (v0.2/v0.3). Biggest
  advertised-vs-real gap.
- **panoptes ships no model weights.** Inference works only with a user-supplied ONNX file.
- **verne's ptolemy loader is not covered by CI.** ptolemy publishes no container image and
  no OpenAPI spec, so CI has nothing to stand up or check shapes against, and a mocked test
  would only assert verne's own assumptions. Verified by hand against a live ptolemy instead.
- **ptolemy's raw-write CI check has a blind spot.** `ci/no-raw-writes.sh` cannot see a
  mutating Postgres function called through `SELECT`, which `topology.rs` does. Those routes
  are admin-only for that reason.
- **The tiletopia terrain service's `layer.json` is still un-consumable** by the viewer's
  terrain panel, which falls back to a no-source state. Tracked in DESIGN_TODO.
- **CDN config is validated, not applied.** The CloudFront catalog path forwards Authorization
  and Origin, allows the full method set (the origin 405s what it lacks) and sets TTL 0 so an
  authorized response is never replayed cross-token or post-expiry. The Terraform passes
  `validate` but has not been applied to live infra, and two questions are open: default-behavior
  TTL versus revoked tokens, and untested `Sec-WebSocket-Protocol` forwarding for realtime.

---

## 2. Current architecture (as built)

### 2.0 Live shared map documents (agora)

agora is the live multiplayer service behind `/agora/`: a Rust axum websocket
service owning composition documents in its own Postgres database on the shared
instance. A document is the map composition, not the feature data: the layer
list (order as base62 fractional indexes, visibility, opacity, style overrides,
layers referenced by id, with a `source` for data that must travel: inline
GeoJSON under the op cap, a URL peers fetch, for an image overlay its four
corners plus an agora attachment url holding the bitmap, or for an OGC service
the handle every member requests for themselves), annotations, camera
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
- fenestra and tiletopia pin the `terrano` crate at tag `v0.1.0`, so terrano's multi-band
  work does not reach them until a retag. terrano's single-band GeoTIFF output is
  byte-identical to before that work (golden fixture), which is what keeps the pin safe.

### 2.3 Authorization model

One HS256 secret signs `{sub, exp, role}` tokens every service accepts, so a user is one
subject across the platform. The tenancy unit is that subject and the resources it owns or was
granted: there is no org boundary above it. `008_tenancy.sql` creates organizations,
org_members and `datasets.org_id`, and nothing enforcing reads them, only the informational
`/check` routes, which is why `/check` can answer allowed where a write refuses.

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
approving posts the manifest verbatim to `run_workflow` with `notify` so the model's session
learns the run happened. The manifest downloads with a copyable `geodukt run <file>.toml`,
which reproduces the run exactly through the same executor, so no generated script can drift
from what ran. A failed run still records its steps: `execute` returns progress alongside the
error, so the record shows the steps that finished, the one that died with its own message,
and the ones never reached.

**Identity flows end to end.** The viewer sends its platform JWT to `/chat/agui`, sibyl
carries it per run (in memory only, never persisted or logged), geolang's tool executor puts
it in a ContextVar, and its ptolemy/tiletopia/geodukt clients attach it. `PTOLEMY_API_TOKEN`
survives only as the headless fallback. geodukt validates the same secret, gates `POST /run`
to editor/admin and records the caller's `sub` on the run. `/validate`, `/operations` and
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
- ptolemy publishes no container image and no OpenAPI spec.

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
- Split view panes are a list of `{renderer, basemap}` entries, the viewer itself being pane 0
  in the app store, each pane with its own basemap picker, all driven by one shared-camera hub
  with a re-entrancy guard and a subscribe-time snap, with clean teardown so the WebGL context
  limit holds.
- All navigation, bookmarks included, goes through the shared fly-to pipeline, which is what
  makes it work on the 2D renderers and for bookmarks that carry no camera.
- The 2D map tab disables the renderer select and the vector basemap options.
- A `.pmtiles` file picked from disk in the basemap popover becomes the basemap
  itself: a vector archive through the Protomaps layer set with the app's own glyphs and
  sprites, a raster one as a single raster source, both over `pmtiles://<file name>`. Only
  MapLibre reads it, so Cesium, Leaflet and the minimap draw no basemap while one is
  selected rather than substituting a hosted raster. The archive is a browser File, so a
  reload and a project file both come back naming it and asking for the file again.

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
- The terrain panel defaults to the platform service with a graceful no-source state. tiletopia
  serves quantized mesh for Cesium and a terrain-RGB endpoint (mercator XYZ, mapbox encoding,
  anonymous) for MapLibre relief.
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
- A project carries its map. Switching saves what the outgoing project was showing and applies
  what the incoming one was left with, held per project in the `projectMaps` IndexedDB store in
  the same shape as a `.viewtopia.json` file (bitmaps stay in `overlayImages`). A project with
  no stored map keeps what is on screen, so creating one forks the current map rather than
  clearing it. Switching inside a live document imports the project into it, because the
  outbound sync watches the stores `applyProject` writes. OGC layers are the one thing a
  document cannot hold, see DESIGN_TODO.
- Imports carrying timestamps (CSV/GeoJSON properties, GPX `coordTimes`) become playable CZML
  with availability, so Timeline Fit-to-Data works through the UI.
- SQL exports go through `COPY (...) TO '<temp>'` and `copyFileToBuffer`, then drop the temp file.
  In the browser that file lives in the wasm filesystem, under the node bundle used by the tests it
  lands in the process working directory instead.
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
local-first + op queue; no service worker yet, see DESIGN_TODO), `projects/`, `store/` (Zustand),
`duckdb/` (in-browser analytics). ~228 source files.

**Test surface.** A vitest unit suite, an 18-test platform E2E suite against the live stack with
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
- **The loader is verified against a real ptolemy, not by verne's CI** (§1 risks).
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
  golden journey (viewer → tileset → geocode → route → NL agent command) is locked by an
  18-test Playwright gate against the live stack, wired into CI without stubbing geolang.
- **Phase 0b, collapse ViewTopia to one stack.** ✅ DONE. React is the only front-end, and
  NL→map is verified end-to-end through nginx.
- **Phase 1, finish the v1 surface (viewer + agent + services).** ✅ DONE. Vertical panels wired
  to real endpoints, experimental panels preview-gated, analysis + jupyter E2E un-skipped,
  one-command quickstart.
- **Phase 2, harden the backbone.** ✅ DONE. ptolemy write/merge hardening + fork-aware
  feature view, multi-tenancy across ptolemy and tiletopia (§2.3), collecta JWT auth + sync
  protocol, fenestra real WCS. All verifier-confirmed.
- **Phase 3, mobile & ML breadth.** ⏳ NEXT. terravista v0.2 (HTTP tiles + MVT) then v0.3
  (GPU rendering), panoptes model weights, collecta media attachments. Off the core
  viewer+agent path, so sequenced after v1.

**Explicitly not being invested in until the core ships:** breadth for its own sake. The
platform is already wide, and the work is depth on the golden path.
