# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 2026-08-04: the Global Terrain panel names the rejection behind its
  NO_SOURCE status. The catch-all message stays, with the provider's own error
  ("An error occurred while accessing /tiles/v1/terrain/layer.json.", "The tile
  format is not specified in the layer.json file.") on a line under it and the
  full error in `console.error`. Nothing was wrong deployment-side: probed
  against the live stack, `/tiles/v1/terrain/` reaches tiletopia through the
  nginx rewrite, terrain reads are exempt from auth, and the panel enables a
  real quantized-mesh provider. NO_SOURCE reproduces only when tiletopia is
  down, which the status now says.

- 2026-08-04: `pnpm audit` is clean: overrides in pnpm-workspace.yaml force the
  patched undici and `@babel/core`. Both are pinned to their current majors
  (`^7.29.0`, `^7.29.1`): an open `>=` range resolved them to the next major,
  which broke jsdom (undici 8 moved paths it deep-imports) and `pnpm dev`
  (Babel 8 misparses `<T = unknown>` arrow generics in .tsx that esbuild
  accepts, so only dev broke). All 13 advisories were dev-only (jsdom/vitest,
  the vite react plugin), nothing shipped to users.

- 2026-08-02: geodukt's `/run` now follows the shared `PLATFORM_JWT_SECRET` in
  the platform compose instead of a separate never-set variable, and the agent
  client sends the bearer everywhere geolang now enforces it: `/agent/models`
  and `/agent/geojson` fetches carry the header, and output downloads go
  through an authenticated fetch instead of a plain anchor, which cannot.

### Added

- 2026-08-04: **focal and zonal statistics in the Raster panel**, on new
  terrano-core ops. Focal runs a moving window (min/max/mean/sum/std/median/
  majority/range, square or circular, any radius) over a source band or the
  panel's last result and drapes like any other grid. Zonal summarizes one
  input grouped by another, and the zones can be a band, a previous result, or
  a polygon layer already on the map, which burns onto the raster's own grid
  through the new rasterize op first. Rows land in a table keyed by zone, named
  after the source feature when the zones came from a layer.

- 2026-08-04: **polygonize in the Raster panel**, on a new terrano-core op of
  the same name. Traces connected runs of equal cells into GeoJSON polygons
  with holes, reading a source band or the panel's last result, so the flow is
  reclass then polygonize. Contours and polygons now share one result slot and
  one drape path. Polygonizing a continuous raster returns a square per cell,
  so the wrapper refuses an input with more than 256 distinct values and says
  to reclass first. Rings are wound to the GeoJSON convention (exterior
  counter-clockwise) after the flip to north-up.

- 2026-08-04: **spectral index presets and a reclassify UI in the Raster
  panel**. The NDVI block became a preset picker over NDVI, NDWI and EVI,
  each declaring its band roles and ramp in one table (`src/raster/indices.ts`):
  a normalized-difference index runs the wasm call, EVI runs its expression
  through band math, and preset band defaults clamp to what the raster
  actually holds. Reclass now has a class table with an equal-interval
  generator, reading either a source band or the panel's last result, which
  is how a slope or NDVI raster gets binned. Its top class runs past the data
  maximum because terrano bins by [min, max). Fixes the reclass result range,
  which was the class count rather than the assigned values, so the render
  saturated.

- 2026-08-04: **in-browser raster processing on terrano wasm**. The Data menu's
  Raster panel left the preview gate: load a GeoTIFF/COG by URL or file
  (geotiff.js, auto-downsampled to 1024px), run hillshade, slope
  (degrees/percent), aspect, NDVI and contours computed by terrano-core
  compiled to wasm in a web worker, the same engine tiletopia runs
  server-side, replacing the orphaned JS reimplementations in src/raster.
  Band math (expression over b1..bn) stays JS. Geographic rasters convert
  their degree cell size to ground meters at center latitude, so gradients
  read true. Results preview inline with the color ramps and drape onto
  MapLibre or Cesium when the raster is EPSG:4326, contours as GeoJSON lines.
  The wasm artifact is vendored (src/raster/wasm, regeneration steps in its
  README), unit tests run the real module via initSync, and a panels e2e
  exercises the worker path end to end in a browser. The terrain panel exports any live
  op (hillshade with its sun, slope, ndvi) over the current view as a web
  mercator COG through tiletopia's new gated `/analysis/export/` route: a
  resolution input in m/px, bearer-authenticated fetch, blob anchor download,
  and the server's plain-text refusal (malformed bbox, pixel cap) shown
  verbatim in the panel.
- 2026-08-04: **live NDVI layer**. The terrain panel's live section grew an
  NDVI button: sentinel-2 red and nir reduced to a monthly median and painted
  brown-tan-green, served tile by tile from the same
  `/tiles/v1/analysis/xyz/` endpoint as hillshade and slope and managed as an
  ordinary XYZ layer. The op takes no parameters, so it dedups on its plain
  tile URL. Requires the tiletopia analysis bbox to be configured, tiles
  answer 500 otherwise.
- 2026-08-04: **live terrain analysis layers**. The terrain panel can add
  hillshade or slope as an XYZ layer over tiletopia's
  `/tiles/v1/analysis/xyz/{op}/{z}/{x}/{y}.png`, rendered per tile on demand
  instead of one PNG for the current view. Hillshade gained azimuth and
  altitude inputs, which the one-shot Run now sends too, and they are baked
  into the layer's tile URL and name (`hillshade 315/45 (live)`). The layer
  goes into the OGC layer store, so the layer panel toggles and removes it like
  any other, and adding the same op and parameters twice reuses the layer
  already on the map. The tiles are anonymous, so this works signed out.

- 2026-08-02: **PMTiles as a layer source and an export target**. As a source:
  a PMTiles archive can be added by URL from the OGC panel or dropped onto the
  import panel as a local file (`src/features/pmtiles/source.ts`); vector
  archives draw one colour per source layer, raster archives drape as imagery,
  both on the MapLibre renderer only (Cesium has no provider for the protocol,
  and a `.pmtiles` basemap URL already worked before this). A dropped file
  lives for the session and is kept out of saved project files. As a target:
  every agent layer's row offers Export PMTiles, cut in the browser by
  geojson-vt/vt-pbf to zoom 12 and written by our own PMTiles v3 writer
  (`src/features/pmtiles/writer.ts`: gzipped root/leaf directories, clustered
  tile data, `vector_layers` metadata), round-trip tested against the pmtiles
  reader the map itself uses.

- 2026-08-02: **Data-driven symbology**: agent layers can be styled by their
  data with three renderers picked per layer in the layer panel
  (`src/features/symbology/`): graduated (equal-interval or quantile breaks,
  2–9 classes, any raster colour ramp), categorized (one editable colour per
  distinct value, capped at 12), and rule-based (ordered field/op/value rules,
  first match wins, unmatched features keep the layer colour). Colours are
  baked into simplestyle feature properties as before, so MapLibre, Cesium and
  Leaflet all render them with no renderer-specific code. A new Legend toolbar
  panel auto-generates one swatch row per class for every layer. Symbology
  survives the project file; files saved with the old single-field choropleth
  shape are migrated to graduated on load.

- 2026-08-02: **SQL workspace** (Data ▸ 🗄 SQL): run DuckDB SQL against
  everything already in the browser database, Ctrl+Enter or the Run button,
  results capped at 500 displayed rows, the last 25 queries kept in
  localStorage. The result can go straight onto the map as an agent layer via
  `queryAsGeoJson`, out as CSV or Parquet (`src/duckdb/exportFile.ts`), and a
  remote `.parquet` or `.csv` URL can be attached as a view.

- 2026-08-02: **Binary vector import**: GeoPackage (one layer per import),
  Shapefile with its sidecars or as a zip, FlatGeobuf and GeoParquet drop into
  the import panel and are read entirely in the browser by the DuckDB-WASM
  spatial extension (`src/duckdb/importVector.ts`). Sources with a CRS other
  than EPSG:4326 are reprojected on the way in, and every imported layer also
  lands as a queryable DuckDB table.

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
