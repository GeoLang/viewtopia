# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 2026-08-02: geodukt's `/run` now follows the shared `PLATFORM_JWT_SECRET` in
  the platform compose instead of a separate never-set variable, and the agent
  client sends the bearer everywhere geolang now enforces it: `/agent/models`
  and `/agent/geojson` fetches carry the header, and output downloads go
  through an authenticated fetch instead of a plain anchor, which cannot.

### Added

- 2026-08-02: **Project file**: save and open the whole workspace as one JSON
  file (`*.viewtopia.json`, schemaVersion 1): renderer, basemap including
  custom, camera, split view, agent layers with styles and choropleth, markers,
  OGC layers. New Project panel in the Data menu, drag and drop opens a project
  file directly, unknown schema versions and basemaps are rejected with a clear
  error. Chat, settings, bookmarks and offline stores deliberately stay out.

- **In-browser DuckDB-WASM Spatial** ([docs/duckdb-wasm.md](docs/duckdb-wasm.md))
  - New `src/duckdb/` module: lazy worker-backed `AsyncDuckDB` singleton, `query`/`exec`/`queryAsGeoJson` API, geo-format loaders (`registerGeoJson`, `attachParquetUrl`, `attachCsvUrl`)
  - Spatial extension (`INSTALL spatial; LOAD spatial;`) auto-loaded on first connection
- **SQL cell type** in notebooks
  - `'sql'` added to `CellType`; `executeSqlCell()` in [src/notebooks/runtime.ts](src/notebooks/runtime.ts)
  - Mantine table renderer with 100-row preview and full row count
  - "+ SQL" button in the cell toolbar
- **Map ↔ SQL bridge**
  - `showSqlAsLayer(sql, layerId)` notebook store action
  - "Show on map" button on SQL cell results; auto-detects `GEOMETRY`, WKT strings, or lon/lat pairs and renders to Cesium + Leaflet with auto-fit
- **Agent `sql_query` viewer command** ([src/viewer-commands.js](src/viewer-commands.js))
  - GeoLang agent can emit `{action: "sql_query", params: {sql, show_on_map, color, fit}}` over SSE
  - Results dispatched as `viewtopia:sql_result` / `viewtopia:sql_error` CustomEvents; last 20 summaries stashed on `window.__viewtopiaSqlResults`
- `add_geojson` viewer command now accepts a direct `params.geojson` object in addition to `params.url`
- Shared `renderGeoJson()` helper consolidates Cesium + Leaflet rendering for `add_geojson` and `sql_query`
- **Dataset styling for vector tiles** ([src/lib/datasetStyle.ts](src/lib/datasetStyle.ts))
  - Vector Tiles panel takes an optional ptolemy dataset ID and draws the source with the layers from `/api/v1/datasets/{id}/style`
  - Falls back to the panel's own fill + outline when the dataset has no convertible style, and conversion losses go to `console.debug`
  - Sprites from the response's optional `images` object are decoded and registered with `addImage` at their declared css size, with `icon-image` / `fill-pattern` references rewritten to match ([src/lib/styleImages.ts](src/lib/styleImages.ts))

### Dependencies

- Added `@duckdb/duckdb-wasm` (~5 MB, code-split into a secondary chunk; WASM still fetched lazily from jsDelivr at first use)

## [0.1.0] - 2026-05-30

### Added

- Initial release.
