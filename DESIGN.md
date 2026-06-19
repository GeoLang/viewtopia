# GeoLang — Shipping Plan & Design Notes

> Living document. Owner goal as of **2026-06-19**: **ship a usable product**
> (the ViewTopia viewer + AI agent + the backend service stack), not add more breadth.

---

## 1. State of the suite (2026-06-19)

GeoLang is ~20 sibling repos under `/home/aaron/src/GeoLang/` (~250k LOC) — a full
Esri/Cesium-class platform, not an "LLM-over-GIS" toy. Two repos are under active
development ([viewtopia](.), [geolang]); the rest landed in a single push on
2026-05-31 and have not moved since.

Maturity is uneven — this is the headline risk:

| Repo | LOC | Test files | Read |
|------|-----|-----------|------|
| tiletopia | 52k | 96 | Well-tested, mature ✅ |
| viewtopia | 65k | 19 | Flagship, thin coverage, ~123 TODO/stub markers ⚠️ |
| ptolemy | 22k | 1 | Versioned-PostGIS core — nearly untested 🔴 |
| jung | 15.6k | 0 | Cartographic rendering — zero tests 🔴 |
| geogit / fluvius / panoptes | 5–8k each | 0 | Untested |
| geolang | ~10k | 3 | Agent under-tested |

**Two structural issues in the active code:**

1. **ViewTopia is mid-migration across two stacks.** Two entry points
   (`index.html` → `main.js`, `index-react.html` → `main.tsx`), two Vite configs,
   ~115 vanilla `.js` source files *and* ~113 React `.tsx` files. The React side is
   a **UI shell that reuses the existing `.js` feature modules** (spacetime, plugins,
   notebooks), not a parallel rewrite — so consolidation is *finishing a shell*, not a
   from-scratch port. Vanilla `main.js` is still the `npm run dev` default.
2. **The integration loop is unproven.** `docker-compose.platform.yml` exists, but CI
   *stubs* geolang when its (private) repo is absent, and there is no end-to-end test
   that the agent → backends → viewer round-trip actually works against real services.

> **Note:** the `geolang` repo is **private** — not yet decided for open-source.
> The other repos are AGPL-3.0. This is why CI stubs geolang when unavailable.

---

## 2. Current architecture (as built)

### 2.1 Platform topology

```
                         Browser (ViewTopia SPA, :5174)
                                     │
        ┌──────────────┬────────────┼────────────┬──────────────┐
        │              │            │             │              │
   VITE_PTOLEMY   VITE_TILETOPIA  VITE_GEOCODE  VITE_ROUTING  VITE_GEOLANG
    :3000          :3100          :3001         :3002          :8080
        │              │            │             │              │
   ┌────────┐    ┌──────────┐  ┌────────┐   ┌─────────┐   ┌──────────┐
   │ptolemy │    │tiletopia │  │geokode │   │itinera  │   │ geolang  │
   │feature │    │3D tiles/ │  │geocode │   │routing/ │   │ AI agent │
   │store + │    │terrain/  │  │(addr   │   │isochrone│   │ (Letta)  │
   │geoproc │    │COG/assets│  │ CSV)   │   │(graph)  │   │          │
   └───┬────┘    └──────────┘  └────────┘   └─────────┘   └────┬─────┘
       │                                                       │
   ┌───┴────┐                                            ┌─────┴─────┐
   │PostGIS │                                            │  letta    │
   │  :5432 │                                            │  :8283    │
   └────────┘                                            │ (memory)  │
                                                         └───────────┘
   fenestra (:3003) — OGC WMS/WFS/WMTS gateway, reads ptolemy (off golden path)
```

- **The agent calls the same backend REST APIs the viewer does.** `geolang` is
  configured (in compose) with `PTOLEMY_URL`, `TILETOPIA_URL`, `GEOKODE_URL`,
  `ITINERA_URL` and runs as a **Letta** server; `letta` holds agent memory.
- **The browser talks to backends directly** via build-time `VITE_*_URL` args baked
  into the SPA; in the platform deploy an **nginx reverse proxy**
  (`deploy/nginx-platform.conf`) fronts the viewer container.
- Backends are independent Rust services (except `geolang`, which is Python/Letta);
  only `ptolemy`/`fenestra` share the PostGIS database.

### 2.2 Service responsibilities

| Service | Lang | Role | State |
|---------|------|------|-------|
| ptolemy | Rust | Versioned PostGIS feature store + geoprocessing API; git-like branch/diff/merge | PostGIS |
| tiletopia | Rust | 3D Tiles / terrain / COG / asset server (Cesium-Ion-class) | volume `tiletopia-data` |
| geokode | Rust | Forward/reverse/autocomplete geocoding from an address CSV | `data/addresses.csv` |
| itinera | Rust | Routing + isochrones over a prebuilt graph | `data/graph.bin` |
| fenestra | Rust | OGC gateway (WMS/WFS/WMTS) + server-side rendering over ptolemy | reads ptolemy |
| geolang | Python | NL→GIS agent; drives the viewer + calls the backends above | Letta + `geolang-cache` |
| letta | — | Agent memory/runtime backend | volume `letta-data` |
| viewtopia | JS/TS | The SPA (this repo) | nginx |

### 2.3 ViewTopia internals (this repo)

- **Renderer abstraction** (`renderers.js`) switches between **CesiumJS** (3D globe),
  **MapLibre GL** (2D vector), **deck.gl** (data viz layers), and **Leaflet**, plus a
  synced split view.
- **Agent UI**: `chat.js` + a registered **viewer command protocol** — the agent emits
  commands (flyTo, addLayer, measure, …) executed by `viewer-commands.js`. The agent
  side lives in geolang's `viewer_control` tool.
- **`src/` module groups:** `components/` + `features/` (React shell, in migration),
  `spacetime/` (31 space-time intelligence modules — entities, tracks, colocation,
  network metrics, etc.), `plugins/` (file-discovered plugin system + 23 built-ins),
  `notebooks/` (code/markdown/map-action/python cells), `raster/` (COG/NDVI/hillshade),
  `offline/` (IndexedDB local-first + operation queue + service worker), `projects/`
  (workspaces/projects/sharing), `store/` (Zustand), `duckdb/` (in-browser analytics).
- **Offline-first by design:** all data in IndexedDB, mutations queued and synced when
  online, three-way/column-level merge for conflicts.
- **Dual-stack caveat:** see §1 — `main.js` (vanilla, current default) and `main.tsx`
  (React shell wrapping the shared `.js` feature modules) coexist; Track 2 collapses them.

### 2.4 Data prerequisites (runtime)

| Service | Needs | Provided by |
|---------|-------|-------------|
| geokode | `data/addresses.csv` (OpenAddresses CSV) | sample committed in repo |
| itinera | `data/graph.bin` (built from an OSM `.pbf` via `itinera import`) | generated in Track 1 (Monaco) |
| geolang | LLM API keys (`XAI_API_KEY` / `OPENAI_API_KEY`) | `geolang/.env` via `env_file` |

### 2.5 Layered view & source module map

> Moved here from `README.md` (this is internal design detail, not user-facing overview).
> The tree below documents the **vanilla `.js` module set**; the React shell in
> `components/`/`features/` wraps these same modules (see §1 dual-stack note). File
> count is now ~228 source files (the historical "63 files" label was pre-migration).

```
┌─────────────────────────────────────────────────┐
│                   ViewTopia                      │
│  Vite + React + Mantine  ·  CesiumJS  ·  deck.gl │
│  MapLibre  ·  Plugin System  ·  Offline-First    │
├─────────────────────────────────────────────────┤
│  Projects & Workspaces   │  Conflict Resolution  │
│  Workspace→Team          │  Three-way merge      │
│  Project→Context         │  Auto-resolve         │
│  Share→Roles             │  Column-level merge   │
├─────────────────────────────────────────────────┤
│  IndexedDB (local)       │  Service Worker (cache)│
│  Layers/Features         │  Static assets         │
│  Annotations             │  Map tiles             │
│  Pending Ops ───────────→│  Sync to server        │
│  Projects/WS · API cache │  Offline fallback      │
├─────────────────────────────────────────────────┤
│   tiletopia (tiles/terrain)   geolang (NL agent) │
│   3D Tiles · point clouds     NL→spatial commands │
│   COGs                        Letta memory        │
└─────────────────────────────────────────────────┘
```

```
src/
├── main.js              # Entry point (vanilla; default today)
├── main.tsx             # Entry point (React shell; migration target)
├── backends.js          # Backend discovery
├── renderers.js         # Cesium/deck.gl/MapLibre/Leaflet switching
├── chat.js              # Agent chat panel
├── viewer-commands.js   # 30+ registered viewer commands (agent-driven)
├── asset-catalogue.js   # TileTopia asset browser
├── cesium-ion.js        # Cesium Ion integration
├── measurement.js       # Distance/area/elevation
├── annotations.js       # Click-to-pin annotations
├── feature-picker.js    # 3D Tiles property inspector
├── terrain-profile.js   # Elevation cross-sections
├── timeline.js          # Cesium clock widget
├── bookmarks.js · data-table.js · geojson-editor.js · print-export.js
├── split-view.js · minimap.js · stories.js · collaboration.js
├── keyboard-shortcuts.js · geocoding.js · routing.js · ogc-layers.js
├── theme-toggle.js · track-import.js · tour.js · drag-drop.js
├── coord-readout.js · context-menu.js · layer-manager.js · charts.js
├── shadows.js · viewshed.js
├── spacetime/           # 31 space-time intelligence modules
│   ├── models.js · layers.js · panel.js · entity-manager.js
│   ├── colocation.js · pattern-of-life.js · geofence.js
│   ├── network-graph.js · network-metrics.js · activity-histogram.js
│   ├── swimlanes.js · clustering.js · prediction.js · alerting.js
│   ├── data-quality.js · audit-trail.js · export.js
│   ├── ingest-formats.js · ingest-cdr.js · binary-store.js
│   ├── worker-pool.js · analysis-worker.js · viewport-tiling.js
│   ├── persistence.js · virtual-scroll.js · ontology.js
│   ├── entity-resolution.js · attachments.js · timeline-correlation.js
│   ├── classification.js · case-management.js · data-fusion.js
├── components/ · features/   # React shell (migration; wraps modules above)
├── plugins/             # File-discovered plugin system + 23 built-ins
├── notebooks/           # code/markdown/map-action/python cells
├── raster/              # COG loader, NDVI, hillshade, slope, contours
├── offline/             # IndexedDB local-first, op queue, service worker
├── projects/            # Workspaces / projects / sharing
├── store/               # Zustand state
├── duckdb/              # In-browser columnar analytics
└── style.css            # All styles (~1900 lines)
```

---

## 3. Plan to ship a usable product

The shipping unit is a multi-service Docker Compose stack:
`db, ptolemy, tiletopia, fenestra, geokode, itinera, letta, geolang, viewtopia`.

### Track 1 — Prove and lock the golden path  *(FIRST)*
You cannot ship what you cannot reproducibly run, and CI currently stubs geolang.

1. Bring up `docker-compose.platform.yml` for real — no stubs.
2. Walk **one golden journey**: open viewer → load a TileTopia layer → geocode a place
   → route between two points → issue one NL command to the agent that drives the map.
3. Capture every breakage; convert the journey into a Playwright E2E test that runs
   against the live stack. This becomes the **"is it shippable?" gate**.

*Why first:* it converts the vague "~123 TODOs" into a concrete blocker list and tells
us which backend gaps actually block the product vs. which are cosmetic.

### Track 2 — Collapse ViewTopia to one stack
1. Commit to **React** as the target (where the structure is going); make it the
   default — point `vite.config.js`, the Dockerfile, and nginx at `main.tsx` /
   `index-react.html`.
2. Inventory features that still only exist in the vanilla path; finish their thin React
   shells (logic modules are already shared).
3. Delete `index.html` / `main.js` once at parity. Ends double-maintenance.

### Track 3 — De-risk the data backbone *(parallel / after T1)*
`ptolemy` is 22k LOC behind 1 test and every service reads/writes through it. Add tests
around its write / version / diff / merge paths before real customer data lives there.
Fine to skip for a *demo*, mandatory before *users*.

### Explicitly deferred for v1
`jung`, `fluvius`, `geogit`, `panoptes` (0 tests each) — impressive breadth, off the
viewer + agent critical path. Do not invest there until the core ships.

**Sequence:** T1 → T2, with T3 in parallel once T1 surfaces what's actually broken.

---

## 4. Track 1 execution log

First-run prep against `docker-compose.platform.yml` (golden-path subset; fenestra
skipped as it is not on the journey):

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Platform compose passes **no LLM keys** to the geolang container (only the sibling `geolang/docker-compose.yml` did) | Added `env_file: ../geolang/.env` to the `geolang` service so XAI/OPENAI keys inject |
| 2 | itinera expects a prebuilt `/data/graph.bin` that did not exist | Downloaded Monaco OSM extract → built `data/graph.bin` (1346 nodes / 2484 edges) via `itinera import` |
| 3 | itinera container **cannot write to host-mounted `data/`** as its default user (PermissionDenied) | Worked around with `--user` for the one-off graph build. **TODO:** fix Dockerfile user / compose volume ownership before shipping |
| 4 | geolang exited(1): entrypoint expects the repo bind-mounted at `/app/geolang` (its own compose does `.:/app/geolang:z`); platform compose only mounted a cache volume | Added `../geolang:/app/geolang:z` bind-mount + `TOOL_EXEC_DIR`/`TOOL_EXEC_VENV_NAME` to the platform compose |
| 5 | **Run-model mismatch:** geolang is an *all-in-one* `letta-gis` (boots its own embedded PostgreSQL + Letta in-container); platform compose treats it as a built image pointing at a *separate* `letta` service → duplicate Letta/Postgres | Open — needs a decision (see DESIGN_TODO §T1). For now geolang self-hosts; the separate `letta` service is redundant |
| 6 | Transient `failed to set up container networking: network ... not found` on first `up` | Resolved by `down --remove-orphans` + `docker network prune -f`; root cause TBD |
| 7 | **CRITICAL: the same-origin nginx proxy was fully broken.** The SPA calls backends via relative paths (`/api/...`, `/tiles/...`, `/api/geocode/...`, `/api/route`) — the `VITE_*_URL` build args are unused. Every `location` used `set $upstream …; proxy_pass http://$upstream…/path;`, and nginx's variable-in-`proxy_pass` form **drops the matched URI suffix + query string** → 404/400 on every API call | Fixed `deploy/nginx-platform.conf`: added explicit `rewrite ^/prefix/(.*)$ /target/$1 break;` per location (preserves suffix *and* query string). All paths now 200 |
| 8 | After editing the host conf, the container still served the old file | Docker single-file bind-mounts bind the **inode**; `Write` replaces the file (new inode), so edits don't propagate. Fixed by `up -d --force-recreate --no-deps viewtopia`. (A future Write to that file needs the same recreate.) |

Data prereqs now satisfied: `data/addresses.csv` (geokode), `data/graph.bin` (itinera).
First-run geolang boot is slow (embedded `initdb` + Letta migrations + agent load — minutes).

**Next:** complete image build → `up` → walk the golden path → record per-step results
here → encode as a Playwright E2E gate.

### Golden-path checklist (first run: 2026-06-19)
- [x] Stack comes up; all 8 services healthy (geolang ~50s first-boot)
- [x] Viewer loads at `:5174` (HTTP 200)
- [x] ptolemy `/api/v1/health` → `ok`; tiletopia `/api/v1/health` → `{"status":"ok"}`
- [~] Geocode a place (geokode) — endpoint works (`/forward?q=`), but **prefix-only
      matching on the house-number-led full address**: `q=100` works, `q="Main St"`
      returns `[]`. Street/place-name search is effectively broken (see DESIGN_TODO §T1).
- [x] Route between two points (itinera) — `/route?from=lat,lon&to=lat,lon` returns a
      real route (Monaco: 1453 m / 96 s with geometry) ✅
- [x] **Same-origin proxy verified from the browser** (the real app path) for ptolemy,
      tiletopia, geokode, itinera — after the nginx fix (#7)
- [x] **Journey encoded as a Playwright E2E** — `tests/e2e/golden-path.spec.js` +
      `playwright.platform.config.js`; run with `npm run test:e2e:platform`.
      **5/5 passing** against the live stack (2026-06-19)
- [ ] Load a TileTopia layer (needs a tileset ingested; browser step)
- [ ] Agent NL command drives the map (geolang → Letta; needs live LLM call + viewer)
- [ ] Wire `test:e2e:platform` into CI **without stubbing geolang**

**Verdict:** the platform stack now comes up reproducibly, the deployed SPA can reach
every backend through the (now-fixed) same-origin proxy, and the golden path is locked
by a green Playwright gate. Remaining: tileset-load + agent→map steps, then CI wiring.
