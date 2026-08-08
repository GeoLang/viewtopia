# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 2026-08-08: **first run and share (UI polish phase 4)**. A clean profile
  gets a bottom-center welcome card offering a demo dataset and the tour:
  accepting fetches the bundled SF-landmarks GeoJSON (public/demo/), adds
  it as an agent layer (the framing generation bump frames it) and opens
  the tour; dismissal persists in the viewtopia-welcome key. Dragging
  files anywhere over the window raises a full-screen drop affordance
  with an importing state; drops route through the Import panel's paths,
  now extracted to lib/importFiles.ts (a drop on the panel's own zone
  still wins via defaultPrevented). Joining a live document by view-role
  link renders view-only chrome: the toolbar collapses to tabs, search,
  Measure/Layers/Legend/Inspect and a "View only" badge, chat and its
  toggles hide, draw shortcuts drop (measure keys stay), and the command
  palette filters to view-safe groups. e2e: default-boot covers the
  welcome accept and dismiss-persists paths, react-smoke seeds the
  welcome flag; three unit tests pin the view-only toolbar.

- 2026-08-08: **command palette, tool shortcuts, panel states (UI polish
  phase 3)**. Cmd/Ctrl+K opens a Spotlight palette (@mantine/spotlight)
  over the same registries the toolbar renders: view switches, the quick
  tools, all seven menus, Export PNG and every plugin, preview items
  filtered by the existing setting. The toolbar's hardcoded Actions menu
  moved into toolMenus.ts, and Export PNG and the inspect toggle became
  shared helpers, so palette and toolbar render one table. One-letter
  shortcuts arm tools: P/L/G/C/R for the draw modes, M/A for
  distance/area, shown as tooltip hints on the mode controls; any armed
  mode shows a crosshair cursor on all three renderers. The data panels
  (geocoding, routing, weather, data-catalog) get skeleton loading rows
  and empty states that offer an action (new PanelStates primitives);
  their inline error text moved to red toasts, except weather, which
  shows an inline Retry because it loads on open. Panel cards animate in
  over 120ms (reduce-motion honored; close stays instant by design), the
  MapLibre/Leaflet controls get focus-visible rings, and 58 icon-only
  controls across 35 files got aria-labels. Dialog focus traps needed no
  work: every dialog is a Mantine Modal.

- 2026-08-08: **react e2e runs one worker on CI**. The suite's 3-per-run
  CI-only failures were wedged pages, not selectors: clicks stalled after
  "done scrolling", a page.evaluate never executed, and one browser died,
  with a different victim list each run. Playwright defaults to 2 workers
  on the 4-core runner, so two Cesium tabs software-rendering through
  swiftshader starved the machine. Local runs never reproduced it because
  spare cores absorbed the load.

- 2026-08-08: **panels dock, widgets go dark (UI polish phase 2, part 3)**.
  Right-anchored PanelCards now portal into a dock column at the map's top
  right and stack without collisions (Legend, live Comments and a tool
  panel can all be open); left/center panels and unit tests keep the
  floating card via a no-dock fallback. Map widgets match the chrome: the
  Cesium nav control loses its white box, MapLibre/Leaflet controls and
  attributions restyle via global.css, scrollbars are thin and dark. The
  toolbar dropdown menus swap emoji for Tabler icons from the registry,
  and the last alert/confirm calls became a confirm modal (project
  delete) and notifications (plugin errors). React e2e's console guard
  now records the failing resource URL and allows only the two backend
  health probes, which is what failed every CI run of the suite (no
  platform stack in that workflow, so the dev proxy answers 500; locally
  a running stack masked it).

- 2026-08-08: **one panel chrome, tokenized (UI polish phase 2, part 2)**.
  Every standard floating tool panel (~50 files) now renders through
  PanelCard/PanelHeader, which paints the header icon accent itself, and
  the GitHub-dark chrome hexes moved to Mantine theme variables app-wide
  (violet-4 in the theme is now the #a78bfa accent). Kept hand-rolled
  where the shape differs: SettingsPanel's wrapper (z-index above the nav
  toggle), the bottom bars (DataTable, Timeline), centered overlays (Tour,
  DragDropImport), self-scrolling wrappers (Raster, Toolbox), wrappers and
  close buttons pinned by tests (LiveComments, Legend, FeaturePicker), and
  ConvertPanel's blue-accented header. Map and data colors (MapLibre
  paint, Cesium colors, deck.gl, swatches, entity defaults) keep their
  literals by design.

- 2026-08-08: **MapLibre boots first, on the dark vector basemap (UI polish
  phase 2, part 1)**. A clean profile starts on the MapLibre globe with
  OpenFreeMap's dark style instead of Cesium on liberty; Cesium is one
  renderer switch away and persisted choices are untouched. 'dark' moved
  from the raster basemap list to a real vector style (its raster
  approximation stays for Cesium/Leaflet/minimap). Input chrome now comes
  from a theme-level `Input.extend` defaultProps instead of per-component
  `styles`, and the hand-rolled floating panel chrome collapsed into
  `PanelCard`/`PanelHeader`/`PanelCloseButton` primitives across the tool
  panels. e2e: a new default-boot spec pins the clean-profile boot, the
  Cesium-surface suites seed a persisted cesium renderer, the specs that
  still clicked pre-Actions-menu toolbar buttons go through the menu now,
  and the agent-layer chat seed moved to `addInitScript` so the running
  page can no longer clobber it before reload.

- 2026-08-08: **Cesium frames agent results top-down**, matching MapLibre's
  fitBounds. The shared camera records the camera's ground point as the
  look-at center, which only holds untilted: Cesium's default tilted flyTo
  poisoned that state, so a cesium → maplibre → cesium round trip could
  restore a view with the result off screen (caught by the e2e pick test,
  flaky since July; the react e2e suite runs in no CI workflow, so nothing
  flagged it).

- 2026-08-08: **the map owns the viewport (UI polish phase 1)**. The chat
  sidebar starts closed and toggles from a header icon (Ctrl+B unchanged, on
  phones the floating button remains); its header session switcher is the one
  session control, the dead Session 1/name/New/Clear row is gone. The toolbar
  merged into the single header row: brand and project left, viewer tabs and
  tools in the middle, offline/status/chat/theme right, with More, Plugins and
  Settings as icon buttons. The renderer and basemap selects moved off the
  toolbar into a map-corner popover control, the TILETOPIA/GEOLANG chips folded
  into one status dot with a per-service popover, and the minimap is off by
  default (Settings still has it). Ctrl+. (Cmd+. on mac) hides every piece of
  chrome for a map-only view. Map is now >90% of the viewport at rest.

- 2026-08-07: **one presence system, agora's**. Clicking a peer avatar in the live
  session header follows that peer: the local camera lands on every presence
  viewport they report until a local camera gesture takes it back, or a second
  click, or the peer leaving. Only a real gesture carries MapLibre's
  `originalEvent`, which is what keeps the client's own `jumpTo` from reading as
  the user grabbing the map, and because that jump publishes to the shared camera
  the minimap and the other renderers come along. The older room path lost its
  presence half: `collaboration.ts` no longer handles `Cursor` or `ViewChanged`,
  broadcasts no camera, and has no follow state, and the collab panel's eye icon
  is gone. That panel keeps chat, the online roster and LiveKit voice/video on the
  same tiletopia socket. Cursors and camera-follow now exist only inside a live
  document, which is the intended end state.
- 2026-08-07: **live documents have comment threads**. A comments panel in the
  live session controls: top-level comments with replies, resolve/unresolve
  with a resolved filter, delete-own, and an optional map anchor that flies
  the camera to where the comment was written. Carried as `comments/{id}`
  ops on the same agora log as every other live edit, so guests with edit
  links comment too, attribution frozen at write time. Deletion authority
  is UI-level only, the generic op log cannot enforce authorship.
- 2026-08-07: **the share dialog manages document members**. Members list
  with per-row role toggle and remove, an add row taking an exact platform
  user id (there is no directory to search), driving agora's PUT/DELETE
  membership routes. Server refusals surface verbatim, including the
  last-editor guard. Share-link guests see no members section.
- 2026-08-07: **the platform E2E gate covers live multiplayer**. agora is
  checked out, built, started and health-waited in platform-e2e.yml, and
  tests/e2e/live-session.spec.js runs a real browser client against one raw
  websocket peer: the browser starts a session from the header control, mints an
  edit share link, and the peer joins through nginx with the session token. It
  asserts both directions, an annotation placed in the browser arriving as an op
  on the peer and an op from the peer showing in the browser's panel, so the
  websocket upgrade on /agora/, agora's ordering and fan-out, and the viewtopia
  client are all in the gate. The job timeout went to 75 minutes to leave room
  for the added Rust build.

- 2026-08-07: **annotations render and place on MapLibre**, not Cesium only.
  Both renderer bindings moved out of AnnotatePanel into useAnnotationsCesium
  and useAnnotationsMapLibre, called from ViewerArea, so an annotation arriving
  from a live peer draws even with the panel closed. The pending placement is
  store state the renderer hooks watch, which is what lets either of them arm
  the map click, and "Place on map" no longer answers "No active viewer" on
  MapLibre. MapLibre draws each annotation as a DOM marker carrying its dot and
  label: a symbol layer needs a `glyphs` entry the basemaps mostly lack, so the
  label would go missing on all but one of them.

- 2026-08-06: the client half of agora, live multiplayer on a shared map
  document, landed in src/live/. A live document holds the layer list (order as
  a base62 fractional index, visibility, opacity, style overrides, layers by id
  only), annotations and camera bookmarks; ops are server ordered and last
  writer wins per key, applied optimistically and reconciled on ack. The socket
  resumes from the last applied sequence with exponential backoff and takes a
  snapshot when the service cannot replay; presence is throttled to one frame
  per 100 ms and dropped rather than buffered across reconnects. The header
  carries the session control, peer avatars and a view/edit share link dialog,
  peer cursors draw on MapLibre, and a share link opens the document through
  ?live=<token>. Annotations moved out of AnnotatePanel into a store so a
  session can own them. The client-side Project store stays as it is for local
  projects.

- 2026-08-06: the timelapse panel shows a "Pulling tiles…" spinner while
  either compare source still has tiles in flight, driven by MapLibre's
  source data events on whichever map holds each source, so a cold step's
  on-demand compute no longer looks like a hang.
- 2026-08-06: the timelapse panel left the preview gate as a real A/B time
  compare over geoplumb, proxied at /plumb/. The layer picker is the tile
  service's own list, filtered to the layers whose STAC collection advertises a
  temporal extent, and that extent becomes a sequence of month or year steps
  that A and B each pick from; each step asks for its own half-open interval,
  so the tiles are composited over that calendar month or year rather than a
  fixed date. Swipe puts B in the split view's second map clipped at the
  position slider, side by side leaves the split halved, and opacity blend
  draws both on the one map. Play walks B through the sequence at the speed
  slider's steps per second and any hand on B stops it. The panel is MapLibre
  only and says so on the other renderers, and it puts the split view back the
  way it found it on close. The platform compose gains the geoplumb service,
  its layer file (Copernicus DEM hillshade and Sentinel-2 NDVI) and a spill
  volume.

- 2026-08-06: the indoor panel left the preview gate as a real client of
  interiora, proxied at /api/indoor/. Venues come from the service, the floor
  picker is built from each venue's own ordinals, and the chosen floor's
  GeoJSON (unit polygons, doors, amenities) is drawn as an agent layer, so
  Cesium, MapLibre and Leaflet all show it; switching floors swaps it and
  closing the panel takes it off. Two map clicks set the route ends on the
  floor on screen, an accessible switch picks the wheelchair mode, and the
  answer draws as a line with its distance, ETA and turn instructions, showing
  the server's own message when a floor carries no graph node. An IndoorMapDoc
  .json can be uploaded, which refreshes the catalogue; a viewer-role account
  is told it needs editor rights. The hardcoded B1-to-Floor-3 list and the
  dead load button are gone. The platform compose gains the interiora service
  and a named volume for its documents.

- 2026-08-06: the photo panel left the preview gate as a real keyless client
  over two catalogues. Turning on photo markers arms a map click, which
  searches Panoramax (bbox from the click and the radius slider, metres
  converted at the clicked latitude) and Wikimedia Commons geosearch
  (lat|lon plus radius, origin=* for anonymous CORS) at once. Results land
  as Cesium point entities coloured per source, cleared when the toggle
  goes off or the panel closes. Clicking a marker or a result row shows the
  thumbnail with its author and license link, and the full image opens in a
  new tab. A source that fails costs its own results only. Panoramax
  thumbnails are host-probed the way the Panoramax plugin does, so photos
  on a down origin instance are dropped instead of rendering broken.

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

- 2026-08-08: **fullscreen toggle in the header**, on every renderer, via
  the browser fullscreen API. Cesium's own fullscreen widget is disabled
  so there is one control.

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
