# DuckDB-WASM in ViewTopia — design

## Motivation

GeoLibre (https://geolibre.app/) ships an in-browser DuckDB Spatial workbench as a headline feature. ViewTopia already scaffolds a `data.query(sql)` runtime method ([src/notebooks/runtime.ts:21-24](../src/notebooks/runtime.ts#L21-L24)) but has no implementation behind it. This doc lays out how we close that gap and go further: SQL becomes a first-class surface usable from notebooks, the standalone workbench, and the AI agent.

## Why it's a fit, not a graft

- `runtime.data.query(sql)` is already declared — interface exists, body is missing.
- `apache-arrow` is already a dependency. DuckDB-WASM returns Arrow natively, so no new transitive cost.
- `idb` is already wired for IndexedDB persistence.
- The notebook system ([src/notebooks/](../src/notebooks/)) already has cell types, an execution model, and an output renderer — adding a `'sql'` cell is the path of least resistance.

## Strategic angle vs GeoLibre

GeoLibre exposes DuckDB as a generic SQL pad. ViewTopia can do better:

1. **Map ↔ SQL bridge** — `map.addLayerFromQuery(sql)` so results render directly as deck.gl/MapLibre layers.
2. **Agent tool** — register `sql_query` on the AI agent so NL queries get translated to DuckDB SQL and rendered without a Ptolemy round-trip.

These two make DuckDB a force multiplier rather than a side panel.

## Scope (in order)

### Phase 1 — foundation
1. Add `@duckdb/duckdb-wasm` dependency.
2. New module `src/duckdb/`:
   - `index.ts` — public API: `getDb()`, `query(sql)`, `attachLayer(layerId)`, `close()`.
   - `worker.ts` — owns the `AsyncDuckDB` instance, runs in a Web Worker, lazy-initialised on first call.
   - `loaders.ts` — helpers to attach GeoJSON / GeoParquet / FlatGeobuf / current map layers as tables.
   - `spatial.ts` — ensures `INSTALL spatial; LOAD spatial;` runs once per connection.
3. Wire `runtime.data.query()` in [runtime.ts](../src/notebooks/runtime.ts) to call into the module.

### Phase 2 — notebook SQL cells
4. Add `'sql'` to `CellType` in [types.ts](../src/notebooks/types.ts).
5. Add `executeSqlCell()` in `runtime.ts`.
6. Render Arrow result tables in [NotebookPanel.tsx](../src/notebooks/NotebookPanel.tsx) using the existing data-table component.

### Phase 3 — map bridge
7. `map.addLayerFromQuery(sql, options)` runtime helper. Detect geometry columns (WKB/WKT or lon/lat pairs).
8. "Show on map" button on SQL cell results when a geometry column is detected.

### Phase 4 — agent integration ✓
9. Registered `sql_query` viewer command in [src/viewer-commands.js](../src/viewer-commands.js). The GeoLang agent emits this over its SSE `viewer_cmd` channel.

**Protocol — `sql_query` viewer command**

```json
{
  "type": "viewer_cmd",
  "cmd": {
    "action": "sql_query",
    "params": {
      "sql": "SELECT name, ST_Point(lon, lat) AS geom FROM parcels WHERE acres > 10",
      "show_on_map": true,
      "color": "#ff8800",
      "fit": true
    }
  }
}
```

Frontend behaviour:
- Runs the SQL against the in-browser DuckDB.
- If `show_on_map` (default `true`), converts to GeoJSON via `queryAsGeoJson` and renders to both Cesium and Leaflet via the shared `renderGeoJson` helper (auto-fits when `fit: true`).
- Stashes a result summary (`sql`, `rowCount`, `columns`, `sample` first 5 rows) on `window.__viewtopiaSqlResults` (ring buffer of 20).
- Dispatches a `viewtopia:sql_result` or `viewtopia:sql_error` CustomEvent for any UI/agent-roundtrip code to hook.

Server-side note: the GeoLang agent needs a `sql_query` tool that returns this command. Round-tripping result rows back to the agent for follow-up reasoning is not yet implemented — the agent would need to either re-emit a refined SQL or call a new HTTP endpoint that reads `window.__viewtopiaSqlResults`. Defer until the use case demands it.

### Phase 5 — standalone workbench panel (optional)
10. Panel under panel-manager mirroring GeoLibre's SQL pad. Shares the same DuckDB instance as the notebook.

## Architecture

```
src/duckdb/
  index.ts            // public API
  worker.ts           // AsyncDuckDB owner, bundle selection (eh vs mvp)
  loaders.ts          // attach helpers
  spatial.ts          // spatial extension bootstrap
```

- **Singleton AsyncDuckDB** in a Web Worker. Lazy init.
- **Bundle selection**: prefer the `eh` (exception-handling) build, fall back to `mvp`. Use Vite's worker/url imports.
- **Spatial extension**: `INSTALL spatial; LOAD spatial;` on connect.
- **Concurrency**: a single shared connection is fine for v1. Per-query connections later if needed.

## Data ingress

| Source | Path |
|---|---|
| Current map layers | `attachLayer(layerId)` — in-memory GeoJSON → Arrow → registered table |
| GeoParquet URL | `read_parquet('https://...')` direct |
| FlatGeobuf / Shapefile | spatial extension `ST_Read(...)` |
| GeoJSON URL | fetch + register as Arrow |
| Ptolemy / Fenestra | use existing `backends.js` / `ogc-layers.js`, register response as Arrow |
| PMTiles | deferred — requires custom UDF or local extract |

## Deferred / out of scope

- OPFS-persistent dataset catalog
- Write-back to Ptolemy
- Python interop via DuckDB (we have Jupyter at [jupyter.ts](../src/notebooks/jupyter.ts) for that need)

## Risks

- **Bundle size**: DuckDB-WASM is ~5 MB. Mitigation: load only on first SQL use (worker is lazy).
- **Cross-origin isolation**: DuckDB-WASM needs SharedArrayBuffer for some features. Verify Vite dev server and the deployed CDN headers (`COOP`/`COEP`). Fall back to non-SAB mode if needed.
- **Spatial extension availability**: hosted ourselves. `scripts/fetch-duckdb-extensions.mjs` (the `prebuild` hook) downloads spatial for the pinned DuckDB version into `public/duckdb-extensions/`, and the worker points `custom_extension_repository` at the app origin, falling back to extensions.duckdb.org only if the origin copy is missing.

## Effort

Phases 1–3 are roughly 2–4 days of focused work. Phase 4 depends on the agent's tool-registration shape. Phase 5 is small once 1–3 land.
