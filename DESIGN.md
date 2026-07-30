# GeoLang — Shipping Plan & Design Notes

> Living document. **This file + [DESIGN_TODO.md](DESIGN_TODO.md) are the single source of
> truth for whole-platform status.** DESIGN.md = state, architecture, what's shipped.
> DESIGN_TODO.md = the actionable backlog.
>
> Owner goal (since **2026-06-19**, still current): **ship a usable product** — the
> ViewTopia viewer + AI agent + the backend service stack — not add more breadth.
> Last brought current: **2026-07-26**.

---

## 1. State of the suite (2026-07-17)

GeoLang is ~20 sibling repos under `/home/aaron/src/GeoLang/` (~250k LOC) — a full
Esri/Cesium-class platform, not an "LLM-over-GIS" toy. All repos are **AGPL-3.0** and
public on GitHub (`geolang` was open-sourced 2026-07-15). Every repo carries standardized
CI (fmt, clippy, test, cargo-deny, coverage; cross-platform).

The three big structural bets are now **settled**:
1. **Golden path proven and gated.** The full stack comes up from one compose file and a
   Playwright suite (18 tests, 0 skips) locks the viewer → backends → agent round-trip
   against the live services. See §3, Phase 0.
2. **ViewTopia is one stack.** The vanilla `.js` shell is gone; React (`main.tsx`) is the
   only front-end (done 2026-06-20).
3. **The backbone has real tests.** ptolemy went from 1 test to ~140 including
   conflict-depth and write-path coverage (Phase 2).

Maturity as of the 2026-07-17 docs refresh (test-fn counts via
`grep -rE '#\[(test|tokio::test|sqlx::test)'`):

| Repo | Role | Tests | Read |
|------|------|-------|------|
| tiletopia | 3D tiles / terrain / COG | 559 | Mature ✅ |
| jung | cartographic rendering | 229 | Well-tested ✅ |
| ptolemy | versioned PostGIS backbone | ~140 | Hardened this cycle ✅ (was 🔴 at 1) |
| fluvius | spatial stream processor | 89 | ✅ |
| fenestra | OGC gateway (+ WCS now) | 83 | ✅ |
| geodukt / topoi / terrano | ETL / geometry / raster | 73 / 73 / 70 | ✅ |
| geogit | geo VCS | 70 | ✅ |
| itinera / geokode / nubis | routing / geocode / point cloud | 62 / 65 / 64 | ✅ |
| terravista | mobile SDK | 58 | core only; renderer is roadmap ⚠️ |
| collecta | field collection | 56 | auth+sync added; media is roadmap ⚠️ |
| projicio / interiora | CRS / indoor | 52 / 49 | ✅ |
| panoptes | imagery ML | 45 | ONNX path real, **no published weights** ⚠️ |
| viewtopia | flagship viewer | 9 unit files + 18 platform E2E | ~42 real panels, 18 preview-gated |
| geolang | NL→GIS agent | (py) | 31/33 tools real, wired to ptolemy/itinera/geokode |

**Current headline risks:**
- **terravista can't draw a map yet** — camera/cache/FFI are real, but GPU rendering, HTTP
  tile fetch, and MVT decode are all still roadmap (v0.2/v0.3). Biggest advertised-vs-real gap.
- **panoptes ships no model weights** — inference works only with a user-supplied ONNX file.
- **viewtopia has 13 dependency vulns on master** (2 high); the org Renovate app install is
  still pending.
- A handful of correctness follow-ups from Phase 2 verification remain open — see
  DESIGN_TODO.md "Open correctness follow-ups."

---

## 2. Current architecture (as built)

### 2.1 Platform topology

The shipping unit is `docker-compose.platform.yml` (11 services), all fronted by
ViewTopia's nginx on `:5174` so the SPA talks to every backend same-origin via relative
paths (`/api/*`, `/tiles/*`, `/agent/*`, `/jupyter/*`, `/ogc/*`). The nginx config is
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
│store +│ │terrain/ │ │(OSM   │ │isochr. │ │geolang  │ │cells)  │ │WFS/WMTS│
│geoproc│ │COG/asset│ │ pbf)  │ │(graph) │ │(sibyl)  │ │        │ │WCS/API │
└──┬───┘  └─────────┘ └───────┘ └────────┘ └────┬────┘ └────────┘ └────────┘
   │                                            │            fenestra reads its
┌──┴────┐                                  ┌────┴─────┐      features from
│PostGIS│                                  │  sibyl   │      ptolemy's REST API
│ :5432 │                                  └──────────┘      (PTOLEMY_URL)
└───────┘                                 (agent loop)
```

- fenestra's own OGC API Features prefix is `/ogc`, so through the proxy that API
  is `/ogc/ogc/*` while WMS/WFS/WMTS/WCS are `/ogc/wms` etc. Its capabilities
  embed absolute URLs, hence `FENESTRA_PUBLIC_URL=<origin>/ogc` in compose.
- **The agent calls the same backend REST APIs the viewer does.** `geolang-api` is configured
  with `PTOLEMY_URL`/`TILETOPIA_URL`/`GEOKODE_URL`/`ITINERA_URL`; agent runs execute on
  the `sibyl` service (Rust agent loop, sessions in sqlite), which calls back into
  geolang-api's `/tools` endpoints for in-process tool execution.
- Backends are independent Rust services except `geolang-api` (Python) and `jupyter`
  (scipy-notebook for python notebook cells). Only `ptolemy` talks to PostGIS; fenestra
  goes through ptolemy's REST API.

### 2.2 Service responsibilities

| Service | Lang | Role | State |
|---------|------|------|-------|
| ptolemy | Rust | Versioned PostGIS feature store + geoprocessing; git-like branch/diff/merge; industry vertical endpoints (`/api/v1/*`) | PostGIS |
| tiletopia | Rust | 3D Tiles / terrain / COG / asset server + analysis endpoints; JWT auth + portal | volume |
| geokode | Rust | Forward/reverse/autocomplete geocoding from an OSM `.pbf` | `data/region.osm.pbf` |
| itinera | Rust | Routing + isochrones + delivery optimization over a prebuilt graph | `data/graph.bin` |
| fenestra | Rust | OGC gateway WMS/WFS/WMTS/OGC-API/**WCS** over ptolemy + a GeoTIFF coverage dir | reads ptolemy; `COVERAGE_DIR` |
| geolang-api | Python | NL→GIS agent tools + API; drives the viewer + calls the backends | cache |
| sibyl | Rust | agent loop, LLM calls, sessions | sqlite volume |
| jupyter | — | python notebook kernels for viewtopia notebook cells | scipy-notebook |
| viewtopia | JS/TS | The SPA (this repo) | nginx |

### 2.3 ViewTopia internals (this repo)

- **Renderer abstraction** switches CesiumJS (3D globe), MapLibre GL (vector globe, with
  the deck.gl data-viz layers interleaved into it), Leaflet, plus a synced split view.
  Picking/draw/measure/agent-layers survive renderer switches (hardened 2026-07).
- **Agent UI**: chat panel + a registered viewer command protocol — the agent emits
  commands (flyTo, addLayer, measure, deck layers, style-by-*, ~20 tool commands) executed
  client-side; the agent side is geolang's `viewer_control` tool.
- **Tool panels**: ~42 functional panels (measure, feature-picker, geojson/style editors,
  geocoding, routing via itinera, terrain profile, cross-section, heatmap, spatial stats,
  weather/wind, shadows/lighting, raster/COG, space-time, notebooks, the industry verticals
  wired to ptolemy `/api/v1/*`). **18 experimental panels are gated** behind a
  "Show Preview Tools" setting with a Preview badge — no dead buttons in the default UI.
- **`src/` module groups:** `components/` + `features/`, `spacetime/` (31 space-time
  modules), `plugins/` (file-discovered + built-ins), `notebooks/`, `raster/`, `offline/`
  (IndexedDB local-first + op queue + service worker), `projects/`, `store/` (Zustand),
  `duckdb/` (in-browser analytics). ~228 source files.

### 2.4 Data prerequisites (runtime)

| Service | Needs | Provided by |
|---------|-------|-------------|
| geokode + itinera | `data/region.osm.pbf` (OSM extract; Monaco for the demo) | `scripts/platform-up.sh` fetches it |
| itinera | `data/graph.bin` (built from the `.pbf`) | built by `platform-up.sh` |
| geokode | `data/addresses.csv` (optional, extra addresses) | optional |
| geolang | LLM API keys (`XAI_API_KEY` / `OPENAI_API_KEY`) | `geolang/.env` via `env_file` |
| fenestra WCS | `COVERAGE_DIR` of `.tif`/`.tiff` (optional) | operator-supplied |

One-command bring-up: `docker compose -f docker-compose.platform.yml up -d --build`, then
open `http://localhost:5174`. `scripts/platform-up.sh` wraps it with data fetch + seeding.

---

## 3. Roadmap — phases

Detailed task state lives in [DESIGN_TODO.md](DESIGN_TODO.md). High-level:

- **Phase 0 — Prove & lock the golden path.** ✅ DONE. Stack bring-up reproducible; one
  golden journey (viewer → tileset → geocode → route → NL agent command) locked by an
  18-test Playwright gate against the live stack, wired into CI without stubbing geolang.
- **Phase 0b — Collapse ViewTopia to one stack.** ✅ DONE (2026-06-20). React is the only
  front-end; 115 vanilla `.js` files deleted; NL→map verified end-to-end.
- **Phase 1 — Finish v1 surface (viewer + agent + services).** ✅ DONE (2026-07-17).
  Vertical panels wired to real endpoints, 4 stub panels implemented, 18 stubs preview-gated,
  analysis + jupyter E2E un-skipped, docs/counts corrected, one-command quickstart.
- **Phase 2 — Harden the backbone.** ✅ DONE (2026-07-17). ptolemy write/merge hardening +
  fork-aware feature view, collecta JWT auth + sync protocol, fenestra real WCS. All
  verifier-confirmed. A few correctness follow-ups remain (DESIGN_TODO.md).
- **Phase 3 — Mobile & ML breadth.** ⏳ NEXT. terravista v0.2 (HTTP tiles + MVT) then v0.3
  (GPU rendering); panoptes model weights; collecta media attachments. Off the core
  viewer+agent path, so sequenced after v1.

**Explicitly not being invested in until the core ships:** breadth for its own sake. The
platform is already wide; the work is depth on the golden path.

---

## 4. History log (condensed, append-only)

Milestone record. Detailed per-run notes have been retired into these one-liners.

- **2026-05-31** — mass push: ~20 repos land at once, uneven maturity.
- **2026-06-19/20** — Golden path proven against `docker-compose.platform.yml`. Hard blocker
  fixed: the same-origin nginx proxy dropped URI suffix + query string on every API call
  (variable `proxy_pass` needs explicit `rewrite … break`). geokode forward search fixed
  (was prefix-only); OSM `.pbf` importer added (426 real Monaco addresses). geolang run-model
  reconciled (self-hosts Letta; redundant `letta` service removed). React cutover completed;
  vanilla shell deleted. NL→map verified end-to-end through nginx.
- **2026-07-15** — Advertised-vs-implemented audit + remediation: ptolemy datastores real,
  tiletopia exports/analysis real, fluvius kafka/mqtt real, collecta xlsform+sqlite,
  geodukt buffer, panoptes ONNX path. geolang open-sourced (AGPL-3.0, squashed history).
- **2026-07-17** — Phase 1 (viewer polish, vertical wiring, preview gating, E2E un-skips)
  and Phase 2 (ptolemy hardening, collecta auth+sync, fenestra WCS) shipped and
  verifier-confirmed. Exposed xai key (from pre-squash history) rotated.
- **2026-07-25** — Auth surface closed (tiletopia /v1 + native writes editor-gated, role
  management + argon2id; ptolemy config reads/metrics admin-gated, audit identity from JWT).
  Phase-2 correctness follow-ups all fixed (conflicts Theirs leak, untied latest-version
  queries, cql2 mixed-type + injection-proof parameterization, qgis endpoints had queried
  nonexistent columns). geolang lifecycle trio (agent reuse, venv rebuild, clean shutdown);
  AG-UI became the only agent channel; chat replay + markers on all three renderers;
  external dataset mode (read-only plain-PostGIS entry point); one-command regional
  bring-up; MapLibre vector globe; Renovate installed; verdict: stay on vendored Letta
  0.16.8, plan replacement post-v1.
- **2026-07-26** — **Multi-tenant MVP decided and shipped.** ptolemy: write-permission
  ladder + creator auto-grant, per-dataset visibility (private = 404), dataset-admin
  delegation with revoke-lockout protection, private datasets filtered from all listings;
  tiletopia: asset ownership (owner-or-admin on destructive writes), ungated catalog-add
  closed, dead streaming-upload routes deleted. Load-test harness (loadtest/, nightly CI)
  + first published baseline validated the data model — after fixing the biggest defect
  testing found: every features-view consumer walked ALL branches' chains (5.7s flat
  filters → 3-48ms branch-scoped). Also fixed: OGC single-item GET ignored branches,
  feature locks had never worked over HTTP (make_interval type bug), per-dataset tiles
  route mixed SRIDs (never worked), external-source predicate pushdown (3-15x, plain GiST
  suffices), env-risk/population tools render area polygons (UTM buffers; 3857 shrank
  them ~40%). Platform e2e green on fresh DB with enforcement on; 16 dependabot alerts
  confirmed stale (anchored to deleted package-lock.json) and dismissed; ptolemy suite
  1 → 262 tests since June. Viewer test coverage started: registry-derived panel sweep
  (50 tools, 49 pass) + console-error tripwire across all e2e specs; building-data
  toggle self-disables on styles with native 3D buildings. Sweep findings then cleared:
  catalog panel no longer fires an anonymous 401 (signed-out state instead), Escape closes
  Space-Time through the shared handler, the two vanilla-era specs (22 dead tests) deleted
  with their one live assertion ported, vector-tile + terrain specs mocked and made
  minification-safe, and a runtime-enumerated plugin sweep covers all 23 plugin panels.
  The tripwire tolerates cold-upstream 502/503/504 in the platform config only.
- **2026-07-26 (later)** — **Viewer feature push, all panel-suite defects cleared.**
  tiletopia realtime shipped and pushed: collaboration WS mounted, JWT via WebSocket
  subprotocol (query tokens rejected), sender identity server-stamped from the JWT sub,
  SRTM fetches bounded per terrain request, terrain reads anonymous. Viewer collab client
  rewritten to that contract: token from the session, no socket when signed out, identity
  keyed off the JWT sub (a Presence roster has no self marker and names are spoofable);
  found the old client's `Camera` frames were never in the server enum, so follow-view had
  never worked — now sends `ViewChanged` with zoom↔height conversion; 18 unit tests + e2e.
  Real synced split view: second pane per renderer, one shared-camera hub with re-entrancy
  guard and subscribe-time snap, clean teardown (WebGL-context-limit toggle test). Imports
  with timestamps (CSV/GeoJSON properties, GPX coordTimes) become playable CZML with
  availability, so Timeline Fit-to-Data works through the UI. Terrain panel defaults to
  the platform service with a graceful no-source state (live service's layer.json is
  still un-consumable — tracked in DESIGN_TODO). WMTS (REST template) + WFS (GeoJSON →
  agent layers) restored for real, verified against fenestra. Remaining recorded panel
  defects fixed: print-export size/pdf, spatial-stats aggregation, tour selectors,
  sharelink active camera, vector-tile origin-relative templates, space-time import
  summary. Panels suite 36 passed + 3 starvation flakes (pass on retry); vitest 197.
- **2026-07-26 (evening)** — **Terrain made real end to end.** tiletopia: quantized-mesh
  contract fixed (format, relative template, availability; index encoder rewritten to
  match Cesium's decoder), DEM cache race fixed (atomic writes, unconstructable empty
  grids), and a **latitude-mirror bug** found and fixed: HGT rows are north-up but the
  sampler indexed south-up, so every elevation reflected about its tile's mid-latitude
  (Monaco coast read as -2312 m of bathymetry); layer version bumped to 1.0.1 to bust
  24h tile caches. New terrain-RGB endpoint (mercator XYZ, mapbox encoding, anonymous)
  feeds MapLibre relief in the Global Terrain panel; Cesium keeps the mesh path;
  browser-verified on both. Analysis panels (Terrain/Flood/Solar) now read the shown
  renderer's view and draw results on it (viewBounds.ts); 2D map tab disables the
  renderer select and vector basemap options. tiletopia 616 tests; viewer vitest 203.
- **2026-07-27** — Agent tool cold-start fixed: geolang-api pre-warms the Letta sandbox
  at boot (throwaway /v1/tools/run importing the geo stack) and TOOL_SANDBOX_TIMEOUT
  raised 180→420s in both compose files; verified live (pre-warm success, agent resumed).
  Panels/load CI unbroken: compose geolang env_file now `required: false` (those jobs
  don't check out geolang). Bookmark fly-to falls back to the shared flyTo pipeline, so
  it works on 2D renderers and camera-less bookmarks. Biome lint added (lint/lint:fix,
  formatter off), 315 findings triaged: autofixes + 4 real errors fixed, noisy rules
  downgraded; 0 open dependabot alerts confirmed.
- **2026-07-27 (later)** — **Raster/pointcloud multi-tenancy closed.** ptolemy's
  visibility resolver now maps raster and pointcloud catalog/tile ids to their dataset,
  so every /rasters/{id}, /pointclouds/{id} and /stac/collections/{id} route 404s on
  private data; /stac/search filters by visible datasets and binds its collections
  filter as Vec<Uuid>. Raster + pointcloud writes (create_catalog, upload_tile,
  add_patch) now run the dataset write ladder (403 non-granted; external datasets 409,
  read-only by design). 9 new integration tests, all proven to fail pre-fix; 134+31
  green. geolang agent tools: assess_environmental_risk made deterministic (stable
  geocode pick, rounded grid, batch retries), download_population_grid pop_total is a
  GHS-POP zonal sum inside the dissolved clip polygon (was radius bbox; UTM area,
  ~2.7x Mercator inflation gone), both live-verified.
- **2026-07-27 (viewer)** — Signed-out and keyless panel states, following the catalog
  panel's pattern. Terrain/Flood/Solar read the session before POSTing: Run is disabled
  and a sign-in hint replaces the old generic "request failed" 401. The two keyed plugin
  panels render a configure-a-key state instead of requesting: basemap-catalog gained a
  Jawg access-token setting and previews (and selects) jawg tiles only once it is set,
  street-view a Google Maps API key setting for the embed. The plugin sweep's fixme list
  is gone, it now asserts both states and that neither keyed host is contacted; 11 new
  unit tests. Follow-up: Viewshed got the same gate, and the collab client handles
  tiletopia's room cap (close code 4029 -> "too many rooms open", no reconnect into the
  same refusal) and finally builds a valid socket URL from an absolute `tiletopiaUrl`
  (http -> ws, https -> wss; root-relative unchanged).
- **2026-07-27 (realtime + population)** — tiletopia collab WS hardened: presence
  refcounted per connection (two tabs of one account survive one closing; stale cleanup
  cannot evict a reconnected user), rooms reclaimed when empty (they previously leaked a
  256-slot channel per distinct id, forever) and creation capped at 32 per user, refusals
  close with 4029; tests mutation-checked. geolang download_population_grid: local
  GHS-POP zonal sum is now the primary source for clipped AND unclipped runs; the
  WorldPop fallback speaks the real async contract (geojson param, task polling,
  pyramid sum — the old bbox call had never been valid, hence the -1s) and the iso3=GBR
  hardcode is gone. Also fixed: the biome autofix in ab0295e2 had arrow-converted the
  collab e2e's WebSocket recording wrapper, breaking `new` (the only conversion in that
  commit; audited). Building-data toggle browser-verified on MapLibre (Liberty disables
  with the basemap note, raster styles re-enable on style.load); the panel's
  Badge-inside-Text DOM nesting error fixed along the way. ptolemy error shapes:
  writes to a missing dataset 404 instead of 500 (fixed in ensure_dataset_writable,
  so create_branch benefits too), pointcloud query/profile reclassified as reads so
  anonymous callers reach public data (visibility middleware is now their only gate,
  pinned by tests). Loadtest: tiletopia scenario measures a harness-owned seeded
  tileset (idempotent, honest skip after teardown).
- **2026-07-27 (e2e 502s)** — The "cold-start 502s" were not cold starts and not
  tiletopia. The platform e2e never started `geolang-api`, so nginx could not resolve
  that upstream (`geolang-api could not be resolved`, run 30208376624) and the viewer's
  per-page-load `/agent/health` probe answered 502 in all 18 tests. The workflow now
  starts and waits for geolang-api (which gained a healthcheck), and the console guard
  is strict again: the 502/503/504 tolerance and its unit tests are gone. 18/18 pass
  strict against the live stack with zero 5xx. tiletopia was measured and cleared: 49ms
  from exec to serving a request on an empty data dir (migrations included), so nothing
  there needs a readiness change. The ~2s of connection-refused after `docker restart
  tiletopia` is container-start overhead before the process runs, and compose already
  gates nginx on tiletopia's healthcheck, so a cold `up` never exposes it. Follow-up
  found on the way: viewtopia's depends_on pulled geolang into the panels/load jobs,
  which never build that image — dep dropped (nginx resolves /agent/ at request time),
  so those jobs can finally start their stack. That stack has no agent at all, so the
  panels and sweep suites stub the probe in `openApp` (tests/e2e/panel-helpers.js): a
  2xx is the only answer chrome does not log as a console error, so the stub reports the
  agent reachable and only the header's status dot reads that.
- **2026-07-27 (fenestra on-proxy)** — fenestra was the last service off the same-origin
  proxy. Now mounted at `/ogc/` (prefix stripped), so WMS/WFS/WMTS/WCS are `/ogc/wms` etc
  and fenestra's own `/ogc`-prefixed OGC API Features lands on `/ogc/ogc/*`. The wiring
  needed a fenestra change: its WMTS `ResourceURL` templates and OGC API links were built
  from the bind address, so every capabilities document handed clients
  `http://0.0.0.0:8080/...` — unusable direct, and through a proxy it would have bounced
  them off it. `FENESTRA_PUBLIC_URL` now overrides that base (compose sets
  `<origin>/ogc`). The loadtest fenestra scenario measures the proxy route by default;
  the :3003 publish stays for dev and is still reachable via `LOADTEST_FENESTRA_URL`.
- **2026-07-27 (CDN)** — CloudFront catalog path fixed: Authorization + Origin forwarded,
  full method set (origin 405s what it lacks), TTL 0 so authorized responses are never
  replayed cross-token or post-expiry. Terraform validate clean; not applied to live
  infra. Two follow-ups filed: default-behavior TTL vs revoked tokens, and the untested
  Sec-WebSocket-Protocol forwarding for realtime through the CDN.
- **2026-07-27 (deck.gl folded into MapLibre)** — the standalone deck.gl renderer is gone:
  deck layers now interleave into the MapLibre map through `MapboxOverlay`
  (`@deck.gl/mapbox`, `interleaved: true`), so analysis/agent/panel layers draw in the same
  view as the vector globe, terrain relief and OGC rasters. Three globe renderers became
  two; the per-panel "switch renderer" hints are gone. Persisted state and share links that
  say `deckgl` fall back to maplibre. Feature picking goes through one map click handler
  that asks the overlay first (`deck.pickObject`), since `queryRenderedFeatures` never
  returns deck's custom layers. deck's screen-space aggregation layers (HeatmapLayer,
  ScreenGridLayer) do not draw under a GlobeView: the globe projection stays (owner
  decision), so heatmaps left deck for MapLibre's native `heatmap` layer type, which the
  globe draws. `src/lib/mapHeatmap.ts` owns the spec store and the radius/intensity/weight
  → `heatmap-*` paint mapping, `useHeatmapsMapLibre` re-adds the layers after a basemap
  swap, and the Heatmap panel and `add_heatmap` both go through it. `add_screengrid` keeps
  its deck layer but now says so: it reports "screengrid is not available on the globe
  renderer" as a system message in the chat transcript instead of drawing nothing.
- **2026-07-27 (later)** — **Embedded Letta replaced by sibyl.** New Rust repo `sibyl`
  (axum, rusqlite, hand-rolled xAI client) owns the agent loop, sessions, and
  summarize-on-overflow history; geolang-api serves a `/tools` manifest + executor
  (tools run in-process, no sandbox, no source shipping) and proxies runs as NDJSON
  behind the unchanged `agent_event_stream` seam, so the viewer's AG-UI contract is
  untouched. Deleted: embedded Letta server + postgres, embeddings (TEI) container,
  legacy `POST /chat`, sessions.json, the ~2min Letta boot. Letta sessions dropped by
  design (no migration); `geolang-pgdata` volume kept as rollback artifact.
- **2026-07-29**: **Plan substrate, evals and identity propagation.** The NL agent now
  composes a geodukt TOML manifest as its execution plan: `plan_workflow` validates it,
  the viewer renders the steps with a validated badge, and approving posts the manifest
  verbatim to `run_workflow` with `notify` so the model's session learns the run
  happened. geodukt gained a Dockerfile and runs internally on 8100. The eval harness
  (`geolang/evals/`) scores NL-to-manifest against the expected pipeline graph, never
  prose: local Qwen3.5-35B-A3B went 0.87 then 1.00 over 10 tasks once the persona stopped
  telling it to put `spatial_join` in manifests (transforms are single-input, geodukt
  rejects it), so all three misses were prompt-caused. Identity now flows end to end: the
  viewer sends its platform JWT to `/chat/agui`, sibyl carries it per run (memory only,
  never persisted or logged), geolang's tool executor puts it in a ContextVar and its
  ptolemy/tiletopia/geodukt clients attach it, with the old `PTOLEMY_API_TOKEN` kept only
  as the headless fallback. geodukt validates the same secret and gates `POST /run` to
  editor/admin, recording the caller's `sub` on the run; `/validate`, `/operations` and
  `/health` stay open so headless planning and the evals still work. Verified against the
  live stack, 11 checks including a real run whose record carried the approving user.
  Two things this surfaced, both since fixed: geodukt ran as uid 999 against a bind mount
  owned by the host user, so every pipeline sink failed until compose pinned `user:`; and
  failed runs recorded no steps, because the core executor discarded its progress report
  on any error. `execute` now returns that progress alongside the error, so a failed run
  records the steps that finished, the one that died with its own message, and the ones
  never reached.
- **2026-07-29 (later)**: **Results became visible, downloadable and honest.** The plan
  panel now shows what a run actually did: one line per step with its operation,
  parameters, input and outcome, the failing step's reason in a tooltip rather than
  inline, and written outputs as download links (the serving route is not a `:path`
  route, so links use the basename). The manifest downloads with a copyable
  `geodukt run <file>.toml`, which is exact reproduction through the same executor, so
  no script is generated that could drift from what ran. Found while wiring this up:
  the layer panel listed only `useAppStore().layers`, written solely by the plugin host,
  so agent-drawn layers had never appeared in it and its controls did nothing. It now
  lists agent layers with working opacity, remove and download. Choropleth shipped on
  top: the class colour is baked into each feature as simplestyle properties, which
  Cesium already honours per feature, so MapLibre took three lines, Leaflet six and
  Cesium none. It is offered only for a numeric field with more than one distinct value,
  since our environmental risk tool writes a single polygon and shading it would say
  nothing. Five tools and the persona had been telling users to use a choropleth
  dropdown that was never built; that prose is now true.
- **2026-07-29 (later still)**: **geodukt stopped accepting manifests it cannot honour.**
  Every ParamSpec was `required: false`, several with defaults, so a buffer with no
  distance validated and silently used 1 metre. Worse, `as_float()` rejected integer
  literals, so `distance = 500` also fell through to that default. `distance`, `epsilon`,
  `to_crs`, filter's field and value, clip's four edges and expression's expressions are
  required now, enforced once in the registry and checked identically on `/validate`,
  `/run` and both CLI paths; `schema_map` must do at least one of rename, drop or add;
  `/gp/clip` no longer defaults to the whole world. `rename` was documented as "old
  column to new column", which reads both ways and made the model invert it. Breaking
  for manifests that leaned on those defaults, which beats silent wrong data. The eval
  harness gained `--repeat`: scoring one sample per task let a flaky task report a clean
  sheet, and a rejected manifest is no longer counted as the model's answer.
- **2026-07-29 (last)**: **verne v0.1 shipped and pushed, and the report changed the
  platform.** A read-only KML/KMZ inventory (verne-core model plus verdicts, verne-kml
  adapter, verne-cli, 30 tests, public AGPL). Each row says faithful, approximated or
  unsupported, and `Losses` cannot be built empty, so an approximated verdict that names
  nothing lost cannot be written down. The first pass at those verdicts was wrong in both
  directions and every one was rechecked against the destination code. Over-harsh: it
  claimed GeoLang has no scale-dependent visibility when a jung `StyleRule` carries
  min/max zoom and `symbology_rules` carries min/max scale, claimed no asset store when
  the `attachments` table is real and routed, and claimed jung symbolises only from its
  own library when `SpriteAtlas::insert` takes any icon. Over-generous: three faithful
  verdicts hid real losses, since a dataset declares one `geometry_type` so a mixed
  container must split, a null geometry records a deletion so attribute-only placemarks
  need their own convention, and KML `SimpleField` widths collapse to JSON numbers in
  `properties`. Running it on a realistic file caught what synthetic fixtures missed: a
  Placemark whose geometry is a `Model` or `gx:Track` counted as geometry-less, inventing
  a loss and double-reporting it, and the `Model`'s own `altitudeMode` leaked into the
  container's losses. Worst of all, a truncated file passed as a clean source, because
  quick_xml reaches Eof without objecting to elements left open. Then the reverse
  direction: **jung gained an icon anchor, a pixel offset and a clockwise rotation**
  (229 to 242 tests, `blit_icon` kept bit-identical as a default-placement wrapper), so
  KML `hotSpot` and IconStyle `heading` are now carried instead of dropped. The report is
  the product, so a loss it names is a work item, not a footnote.
- **2026-07-29 (extensions)**: **the platform grew to fit what the report said it was
  losing**, and verne's verdicts were rewritten as each landed. **terrano**: `BandedRaster`
  plus 8-bit samples and a multi-band GeoTIFF writer and reader, so an RGB or RGBA overlay
  keeps its colour (70 to 86 tests). `Raster`, `GeoTiffMetadata`, `write_geotiff` and
  `read_geotiff` are untouched, and a golden fixture captured before the edit proves the
  single-band output is byte-identical, which is what keeps fenestra and tiletopia safe
  (both pin the crate at tag v0.1.0, so neither sees this until a retag). Reviewing that
  row also killed a second wrong claim of mine: an axis-aligned `LatLonBox` in EPSG:4326
  maps exactly onto an origin and a pixel scale, so nothing is resampled. **ptolemy**
  (migration 023, 308 tests): a dataset may declare the geometry type `geometry`, so a
  mixed container no longer splits, and `geometry_type` needed no DDL because it was
  always free text with no CHECK. An attachment may belong to a dataset instead of a
  feature, enforced by a one-owner CHECK, so a style's icon has a carrier without
  inventing a feature. A feature version carries a half-open `[valid_from, valid_to)`
  valid range, exposed through the rebuilt `features` view and filtered by `?valid_at`.
  The valid time had to reach `DiffOp`, since that is the only path into
  `feature_versions`, and an `Update` with both fields null inherits the previous
  version's range so a properties-only patch cannot silently erase it. Two latent bugs
  fell out of the same work: the GeoPackage reader mapped a gpkg's `"GEOMETRY"` (exactly
  how a mixed-type layer declares itself) to `GeometryCollection`, and the mongodb and
  elasticsearch readers used `GeometryCollection` as their unknown-type fallback. What is
  left in verne's report is now mostly honest mismatch rather than missing capability: a
  `TimeStamp` is an instant and a range is not, KML permits year precision and
  `timestamptz` does not, and overlay rotation still has no rotation terms to land in.
- **2026-07-30**: **ptolemy's attachments, then every dataset-owned id, reached the
  visibility layer, and attachment writes reached the write ladder.** `GET
  /attachments/{id}` and `/meta` served a private dataset's blob to anyone holding the id,
  because `private_datasets_for_ids` had no clause for an attachment; the same pass then
  covered every other id kind a path can name. Writing an attachment now goes through
  `ensure_dataset_writable`, which also inherits its external-table check, so uploading to
  an external (read-only) dataset answers 409 where it used to succeed. That is kept on
  purpose: "an external dataset is read-only" is a simpler invariant than "read-only except
  for attachments", and exempting it would mean threading a flag through the ladder for a
  workflow nobody has.
- **2026-07-30 (drift)**: **three ptolemy feature families never worked and now do.** Each
  handler queried a column its table does not have, so every call was a guaranteed 500 on
  read and on write; the tables are real and the routes are mounted, which is why it looked
  implemented, and nothing depends on them, which is why nothing caught it. Label rules
  selected `label_expression` where the schema names it `field_expression`, and bound the
  jsonb `placement` as a string. Trajectories selected a `feature_id` that exists in neither
  schema branch. Relationship classes selected `rel_type`, which has no equivalent column
  (`cardinality` is a different axis, so the field was dropped rather than renamed), and
  records used `class_id` where the migration names it `relationship_class_id`. Fixing them
  surfaced three more blockers the audit had not seen: `create_class` never inserted the
  NOT NULL `origin_foreign_key`, two nullable labels were read as `String` and would panic
  on NULL, and both trajectory handlers were written in MobilityDB-only SQL, so they failed
  on the stock PostGIS that CI and the compose stack actually run. Trajectories gained a
  JSONB fallback path chosen per request; the five analytics routes stay MobilityDB-only.
  A fourth family fell out of the security pass below: `POST /datasets/{id}/subtypes` never
  inserted the NOT NULL `subtype_field`. The three visibility-matrix assertions weakened to
  `assert_ne!(status, NOT_FOUND)` because these handlers 500ed regardless are now real 200s.
- **2026-07-30 (ladder)**: **every mutating route is gated on the write ladder, and the
  first gate was refuted before it shipped.** An audit of all 124 mutating routes found 39
  that bypassed `ensure_branch_writable` / `ensure_dataset_writable` and were gated only by
  the editor role, so an editor could write to any public dataset they held no grant on, or
  any private one they held only a read grant on; 30 never extracted an `Actor` at all. The
  prior estimate of ~33 was low, and its misses were the worst of the set: `h3/index` and
  `similarity/embed` bulk-`UPDATE` feature rows on someone else's branch. The store was not
  the chokepoint the plan assumed: `PgStore::pool()` hands out the raw pool and all 39
  routes wrote through it, so a `Writer` on the 28 store write methods would have guarded a
  surface they never touch. What shipped instead is a middleware symmetric to the visibility
  layer, reusing the same id resolution and calling the same two ladder functions, so the
  rule stays in one place: 36 routes covered by the layer, 3 checked in-handler because
  their target arrives in the body, and the three topology routes made admin-only since they
  issue schema DDL and discard the dataset id, leaving nothing to ladder. Adversarial
  verification then refuted the first version with a working exploit: the compute-only
  exemption list was matched against the raw request path, and a free-text trailing segment
  is caller-controlled, so `DELETE /datasets/{id}/tags/trace` (and nine more, including
  `tags/permissions`) read as an exempt compute endpoint and deleted rows past the gate. The
  fix keys every path-based policy decision on axum's matched route template instead, which
  ends the class rather than the instance, since a template comes from this crate's own
  route tables. The convention the gate rests on is now the first `{param}` of the template
  rather than the first uuid-shaped path segment. Tests were rebuilt around the failure:
  the old ones asserted against hand-picked literal strings and could not have caught it, so
  they now drive the live router, walk the real mounted route table, and plant policy
  keywords in every free-text terminal segment. Deliberately still exempt: the four
  `/permissions` routes, where `require_dataset_admin` is the stricter gate and running the
  ladder as well would lock a dataset admin out of the case they need it for.
- **2026-07-30 (panels CI)**: **the settings panel moved and only half its tests followed.**
  The toolbar reorg made Settings a top-level button instead of a More-menu entry; the unit
  test was updated in the same session, the per-panel e2e suite was not, so both settings
  tests timed out waiting on a menu item that no longer exists. The suite is scheduled
  rather than per-push, which is why a passing push run and a failing nightly disagreed.
  The other two failures in that run were WebGL context timeouts that passed on retry, and
  are the reason a red panels run needs reading before it is believed.
- **2026-07-30 (geodukt fixtures)**: **two manifest fixtures set parameters no transform
  reads.** `visual.rs` set `target_crs` on a reproject where the transform reads `to_crs`,
  and a docgen fixture nested parameters under `[transform.params]`, which the flattened
  manifest reads as one parameter literally named `params`. Both sat in paths that never
  validate or execute a manifest, so nothing caught them. Fixing the second turned up a
  third: its filter named `property`/`value` where the transform requires `field`/`equals`,
  so flattening alone would still have failed validation. `check_parameters` would catch a
  missing required parameter in a test, but it does not reject an unknown one, so a stray
  `target_crs` beside a valid `to_crs` would still pass.
- **2026-07-30 (verne v0.2)**: **the Esri File Geodatabase adapter, and a trajectory
  verdict that changed the same day the platform did.** `gx:Track` had been reported as
  flattening to a line "because nothing reads it back as a trajectory", which stopped being
  true the moment the trajectory routes worked on stock PostGIS, so tracks are now
  inventoried one row per placemark against ptolemy's trajectory model, with the losses
  computed from what each track actually holds (altitude, per-sample angles, `gx:SimpleArrayData`
  columns, year-precision timestamps) rather than a single static sentence. Then v0.2: a
  read-only `.gdb` inventory behind a feature-gated crate, so verne-core and the KML adapter
  still build with no GDAL installed. GDAL reads the two hardest semantic layers (coded and
  range domains since 3.3, relationship classes with cardinality and composite flag since
  3.6) but georust's crate wraps neither, so verne carries ~260 lines of read-only glue over
  `gdal-sys`. Esri subtypes have no GDAL model at all and are parsed out of the geodatabase's
  own catalog XML. The licence line holds in code, not in prose: the dataset opens with
  `allowed_drivers` pinned to `OpenFileGDB`, so Esri's SDK driver can never be picked up.
  One correction worth keeping: the domain and relationship handles are borrowed const
  pointers the dataset owns, and freeing them aborts the process; only the two `*Names`
  lists are the caller's to destroy. Also settled: a file geodatabase has no versioning or
  archiving at all (they are enterprise-only features), so the report says "not applicable"
  rather than "unsupported", and the branching-beats-SDE-history advantage only applies to
  enterprise sources.
- **2026-07-30 (verne moves data)**: **the report stopped being the only output.** verne
  now extracts a geodatabase into a GeoPackage plus a sidecar whose structs mirror
  ptolemy's request bodies field for field, so loading is a POST of each struct rather
  than a translation that can drift; `verne load` creates the datasets, schemas, domains,
  subtypes and relationship classes in a running ptolemy. Two fields cannot mirror one,
  because ptolemy wants the id of a row that does not exist until the load runs: a
  subtype's `domain_assignments` names its domains and a relationship class names its two
  datasets, so both are typed as names and the loader swaps them. An extraction log
  records every row of the report as carried, carried-with-losses or skipped, decided from
  the verdict rather than from the caller, so the report and the log cannot give different
  accounts of the same thing; the operator and a timestamp are required, because the
  licence position is that "with permission" must be a mechanism with a record of what was
  taken. The loader is verified against a real ptolemy and **not** by verne's CI: ptolemy
  publishes no container image and no OpenAPI spec, so there is nothing CI could stand up
  or check shapes against, and a mocked test would only assert verne's own assumptions.
  That gap is real and recorded rather than papered over.
- **2026-07-30 (real data)**: **one public geodatabase found two bugs that every test
  suite had passed.** Run on a USGS National Hydrography file (41 tables, 62 domains, 10
  relationship classes, 5 subtype sets, public domain). First: verne paired written
  GeoPackage layers to source tables **by position**, on the assumption that GDAL writes
  them in the order it was given them. True of the synthetic fixture, false of real output,
  where a GeoPackage lists its spatial layers first. The conversion was in fact perfect,
  but the report claimed renames that never happened, invented dropped fields and reported
  features as lost, because every table was compared against another table's layer. In a
  product whose whole value is an honest account of what is lost, a report that fabricates
  losses is the worst failure available. Now paired by name, with a single-candidate rule
  for real renames and a loud refusal when two at once make attribution a guess. Second:
  the README claimed the GeoPackage carries "the domains themselves and the binding of a
  field to a domain", verified with `ogrinfo` against a fixture where both domains happen
  to be field-bound. On the real file 42 of 62 domains are reachable only through subtypes,
  which GDAL does not model, so it never sees them used and never carries them. Both the
  code and the documentation were confidently wrong in the same way: the fixture was built
  by the tool whose behaviour the claim described, so it agreed with itself. The measured
  comparison now lives in verne's README, and it is the clearest statement of why the
  project exists: for the same conversion, GDAL's GeoPackage keeps 18 of 62 domains, none
  of the 10 relationship classes and no subtypes at all.
- **2026-07-30 (GDAL 3.8)**: **a double free that only two CPUs could show.** verne's
  GeoPackage tests aborted on CI and passed everywhere locally. Not the ownership mistake
  it looked like: valgrind over the whole binary reported zero errors, because the bug is
  concurrency-only. GDAL 3.8's GeoPackage driver calls `spatialite_cleanup_ex` on every
  dataset close, tearing down libxml2's process-global encoding table, so two threads
  closing a GeoPackage at once free it twice; 3.11 never reaches that path, which is why a
  sixteen-core machine on a newer GDAL could not reproduce it in fifteen runs and two
  pinned cores reproduced it in nineteen of forty. All GeoPackage work is now serialised
  behind one mutex, read-back included. The part that keeps it fixed is a thread-local flag
  with a debug assertion: on 3.11 an unguarded close is harmless, so a future call added
  outside the lock would pass every local test and abort only on CI, and the assertion
  fails on any version instead. Proved by removing the guard and watching it fire where the
  memory bug itself is invisible.
- **2026-07-30 (aliases)**: **an Esri field label now survives the migration, and the
  report says exactly how far.** verne's report had claimed aliases "can be carried,
  because ptolemy's dataset_schemas takes free-form JSON". The column is JSONB, but the
  API deserialises into a typed `FieldDef`, so an alias posted through the schema route was
  silently dropped: the load would report success with the label gone. ptolemy's `FieldDef`
  gained `alias: Option<String>`, defaulted and omitted when absent so existing schemas are
  untouched, and verne now writes a schema per dataset carrying each column's name, type,
  required flag from the source's real nullability, and its alias. The verdict is still
  *approximated*, and deliberately so: the label reaches ptolemy and is stored, and nothing
  in the platform displays it, which is a smaller loss rather than none. A column type that
  ptolemy's six field types cannot name is approximated to the nearest and both the report
  and the log name the column and the type it had. The viewtopia side that would show an
  alias is deferred, and nothing claims otherwise.
- **2026-07-30 (write guard)**: **an unguarded write in ptolemy now fails to compile, and
  what types could not reach is checked in CI.** The write middleware closed the 39 routes
  at runtime, but the reason they were possible remained: `PgStore::pool()` handed out the
  raw pool and 48 raw write statements across the api crate used it. Those all moved into
  `ptolemy-storage` behind a `WriteGrant`, a struct with a private field that only the
  ladder can mint, and each guarded write takes the id it writes under **from the grant**
  rather than from its own arguments, so a grant cannot be aimed at a target that was never
  checked. `Writer` and `WriteGrant` deliberately did not merge: one is the input to the
  check and has to stay freely constructible for the CLI, the other is the output and is
  worth nothing unless it is unforgeable. `pool()` could not become crate-private because
  the CLI and the test fixtures are separate crates, so it split into `read_pool()` and
  `unguarded_pool()`, the latter banned by name inside ptolemy-api by `ci/no-raw-writes.sh`.
  That script is what closes the residual hole, and its limit is written into its own
  header: it cannot see a mutating Postgres function called through `SELECT`, which
  `topology.rs` does, and those routes are admin-only for that reason. The check found a
  real one on its first run: the gRPC service committed with `Writer::Unenforced`. Nothing
  mounted it, and ptolemy's README had advertised "gRPC bulk ops" as done since v1.6, so
  the module, its two dependencies and the README claims were deleted rather than fixed —
  419 lines removed, and no unenforced commit path left in the tree to mount by accident.
