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
paths (`/api/*`, `/tiles/*`, `/agent/*`, `/jupyter/*`). The nginx config is
`deploy/nginx-platform.conf`, reached through a stub include
(`deploy/nginx-platform-include.conf`) plus a `deploy/` directory mount, so config edits
take effect with `nginx -s reload` instead of a force-recreate.

```
                    Browser (ViewTopia SPA, :5174, nginx)
                                   │  same-origin proxy
   ┌──────────┬──────────┬─────────┼─────────┬──────────┬──────────┐
 /api/*    /tiles/*  /api/geocode /api/route /agent/*  /jupyter/*
   │          │          │          │          │          │
┌──────┐ ┌─────────┐ ┌───────┐ ┌────────┐ ┌─────────┐ ┌────────┐
│ptolemy│ │tiletopia│ │geokode│ │itinera │ │geolang- │ │jupyter │
│feature│ │3D tiles/│ │geocode│ │routing/│ │api +    │ │(python │
│store +│ │terrain/ │ │(OSM   │ │isochr. │ │geolang  │ │cells)  │
│geoproc│ │COG/asset│ │ pbf)  │ │(graph) │ │(Letta)  │ │        │
└──┬───┘  └─────────┘ └───────┘ └────────┘ └────┬────┘ └────────┘
   │                                            │
┌──┴────┐   fenestra (:3003) OGC WMS/WFS/    ┌──┴──────┐
│PostGIS│   WMTS/WCS gateway, reads ptolemy  │embeddings│ (TEI, CPU)
│ :5432 │   (off the golden path)            └─────────┘
└───────┘
```

- **The agent calls the same backend REST APIs the viewer does.** `geolang` is configured
  with `PTOLEMY_URL`/`TILETOPIA_URL`/`GEOKODE_URL`/`ITINERA_URL`; it self-hosts an embedded
  Letta + Postgres (no separate `letta` service — that was removed as redundant).
- Backends are independent Rust services except `geolang` (Python/Letta) and `jupyter`
  (scipy-notebook for python notebook cells). Only `ptolemy`/`fenestra` share PostGIS.

### 2.2 Service responsibilities

| Service | Lang | Role | State |
|---------|------|------|-------|
| ptolemy | Rust | Versioned PostGIS feature store + geoprocessing; git-like branch/diff/merge; industry vertical endpoints (`/api/v1/*`) | PostGIS |
| tiletopia | Rust | 3D Tiles / terrain / COG / asset server + analysis endpoints; JWT auth + portal | volume |
| geokode | Rust | Forward/reverse/autocomplete geocoding from an OSM `.pbf` | `data/region.osm.pbf` |
| itinera | Rust | Routing + isochrones + delivery optimization over a prebuilt graph | `data/graph.bin` |
| fenestra | Rust | OGC gateway WMS/WFS/WMTS/OGC-API/**WCS** over ptolemy + a GeoTIFF coverage dir | reads ptolemy; `COVERAGE_DIR` |
| geolang / geolang-api | Python | NL→GIS agent; drives the viewer + calls the backends | Letta + cache |
| embeddings | — | sentence-transformers TEI (agent memory embeddings) | CPU |
| jupyter | — | python notebook kernels for viewtopia notebook cells | scipy-notebook |
| viewtopia | JS/TS | The SPA (this repo) | nginx |

### 2.3 ViewTopia internals (this repo)

- **Renderer abstraction** switches CesiumJS (3D globe), MapLibre GL (2D vector), deck.gl
  (data-viz layers), Leaflet, plus a synced split view. Picking/draw/measure/agent-layers
  survive renderer switches (hardened 2026-07).
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
