# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 2026-08-05: the export panel left the preview gate as a real client for
  tiletopia's newly routed export API: ready assets and the server's
  advertised formats populate the pickers, start posts the job, status
  polls every 3s until ready or failed, and the download link pulls the
  file through an authed fetch into a blob anchor the way the COG export
  does. The fake resolution slider and the hardcoded stl/obj/gltf/ply
  list are gone, formats come from the backend.

- 2026-08-05: cached tiles now serve back to MapLibre. Raster basemap
  styles reference a cached:// scheme (registered beside the pmtiles
  protocol) that fetches from the network while online and answers from
  the offline tile cache when the fetch fails or the browser is offline,
  so regions downloaded in the Offline panel keep rendering without a
  network. MapLibre only: Cesium and Leaflet still build plain tile URLs,
  recorded in DESIGN_TODO.

- 2026-08-05: four preview stubs deleted instead of implemented (owner
  decision): noise and energy had no engine or data source anywhere in
  the platform, webxr had no Cesium XR path, point cloud compare had no
  registration or alignment substrate. Their panel keys, menu entries,
  switch cases and the compare_pointclouds agent command mapping are
  gone. tiletopia's server-side arvr module is untouched.

- 2026-08-05: the volume and assets panels left the preview gate. Volume:
  cut and fill over a polygon from the draw store, 64x64 grid clipped by
  even-odd test, heights from sampleTerrainMostDetailed, base height min,
  mean or typed, refuses to sample the ellipsoid provider and points at
  the Global Terrain panel instead of reporting zeros. Assets: real
  tiletopia pipeline, authed list/upload/delete on /api/v1/assets with
  XHR upload progress, asset status polled every 3s until ready or error
  (the upload response carries no job id, so job progress is not
  reachable from the viewer, recorded in DESIGN_TODO), add-to-globe
  loads the public tileset.json for ready assets.

- 2026-08-05: the flythrough and drone panels left the preview gate over a
  shared camera path helper (src/lib/cameraPath.ts): catmull-rom or linear
  spline parametrised by cumulative arc length so uneven waypoints fly at
  one speed, camera driven per animation frame with heading from a
  great-circle bearing and pitch from the height change, user input locked
  during playback and restored on pause, stop, completion, Escape and
  unmount. Flythrough records camera-position waypoints and flies them at
  a m/s speed. Drone draws a ground track by click (double-click ends),
  shows it as point and polyline entities, and simulates the flight
  raised by the altitude input above each clicked height.

- 2026-08-05: the model import panel left the preview gate, scoped honestly
  to glTF/GLB (Cesium's entity model layer takes nothing else, the
  OBJ/FBX/IFC claims are gone). Choose a file, click the globe to place it
  with the chosen scale and heading, placed models list with remove, blob
  URLs revoked on remove and unmount, entities stay on the globe after the
  panel closes. minimumPixelSize 64 keeps metre-scale models visible at
  globe zoom.

- 2026-08-05: the Cesium Ion and Google 3D panels left the preview gate.
  Ion: a token validates against api.cesium.com, becomes
  `Ion.defaultAccessToken`, persists in settings, and the account's assets
  list with per-asset add and remove (3D Tiles to primitives, imagery to
  imagery layers, terrain to the terrain provider, removal resets terrain
  to the ellipsoid as the Global Terrain panel does). Google 3D: an API
  key toggles Photorealistic 3D Tiles via the public root.json with
  on-screen credits, key persisted only after a successful load. Both
  show the switch-to-Cesium notice on other renderers.

- 2026-08-05: the Offline panel left the preview gate and caches for real.
  "Cache Current View" downloads the active raster basemap's tiles for the
  viewport at the current zoom plus two (capped at z19, refused over 2000
  tiles), with progress from tiles actually fetched, and records a named
  region (bbox, zoom range, tile count, bytes) in IndexedDB. Regions list
  from the store and delete evicts their tiles. Vector basemaps cache the
  nearest raster equivalent and say so. Cached tiles are not yet served
  back to the renderers offline, that needs the service worker tracked in
  DESIGN_TODO.

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

- 2026-08-06: **attribute table upgrades** (Tools ▸ 📋 Data Table): column
  sorting, a field calculator, virtual fields, attribute joins and column
  statistics, in `src/features/attributes/`. Headers cycle asc, desc and off,
  and the order is applied before the 500-row cap so the cap shows the true
  top rows. Fields are DuckDB SQL expressions over the layer's columns, with
  no expression parser added: as a virtual field the expression is evaluated
  for display only, added to the layer it is materialized into the features
  and the layer is replaced in place, so every renderer redraws it. A join
  picks a second layer and a key on each side, left joins them in DuckDB with
  the keys compared as text, and lands the match as a new layer with
  colliding columns prefixed. Stats give count, distinct, min, max, mean and
  median over the filtered rows, with a bar, line or pie chart through the
  existing chart views. In-place cell editing stays out.

- 2026-08-06: **convert loaded layers to cloud-native formats** (Data ▸ 🔄
  Convert). Pick a drawn or loaded vector layer and write it out as
  GeoParquet, FlatGeobuf, PMTiles or GeoJSON, downloaded straight from the
  browser. GeoParquet is a DuckDB spatial COPY, which stamps the GeoParquet
  `geo` metadata (1.0.0, WKB, bbox, PROJJSON CRS) onto the parquet; FlatGeobuf
  is serialized by the flatgeobuf package, because the GDAL write drivers in
  this duckdb-wasm build abort the wasm instance instead of writing a file;
  PMTiles calls the writer the layer list already uses. COG stays open, no
  browser-side writer exists yet.

- 2026-08-06: **browser geoprocessing toolbox** (Data ▸ 🧰 Geoprocessing),
  computed by topoi over wasm in a worker. Eighteen tools in one panel that
  renders from the catalogue in `src/toolbox/catalog.ts`: buffer, simplify,
  centroid, convex hull, explode, collect, intersection, difference, clip to
  a layer or to an extent, dissolve, union, voronoi, square and hex grids,
  spatial join, a per-feature validity report and make valid. Inputs are the
  drawn features and every loaded or plugin layer, results become map layers,
  and a batch runner chains steps so each reads a layer or the step before
  it, stopping at the first error with the failing step named. Every op runs
  in a local equirectangular frame centred on its inputs, so distances,
  tolerances and cell sizes are metres. The Turf.js geoprocessing plugin it
  supersedes is deleted, and that plugin's collect-with-field aggregation is
  replaced by plain multi-part collect.

- 2026-08-04: **raster analysis results are real layers**. Add as layer hands a
  result to the layer store every renderer draws from, so runs stack, survive a
  renderer switch, and get listed in the Layers panel with their own opacity and
  remove, instead of the single drape the panel used to own and replace on the
  next run. Raster results ride a new `rasterLayers` list rather than widening
  `AgentLayer`: an image shares none of the vector machinery (symbology, PMTiles
  export, feature bounds), and keeping it out of the vector list also keeps its
  multi-megabyte data URL out of saved project files. Drawn on all three
  renderers (MapLibre image source, Cesium single-tile imagery, Leaflet image
  overlay). The panel loses its overlay bookkeeping entirely.

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
