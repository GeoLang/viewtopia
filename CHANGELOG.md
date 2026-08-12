# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- 2026-08-11: **Scale-dependent visibility**. A layer can be limited to a zoom
  range, min inclusive and max exclusive, the way QGIS scale ranges and
  MapLibre's minzoom/maxzoom work. The range sits on the layer rather than on
  the symbology, so a single-colour layer can carry one too, and the symbology
  editor offers it whether or not a field is worth shading by. MapLibre takes it
  natively; Leaflet and Cesium have no scale range of their own, so they follow
  the camera and take the layer off or put it back. It saves to the project file
  and travels to live peers as a style override.

- 2026-08-11: **SQL and vector basemap labels stop reaching a CDN**. DuckDB-WASM
  fetched its bundle from jsDelivr on the first query, and a pmtiles basemap
  pulled glyphs and sprites from protomaps.github.io, so even a locally served
  vector style broke without internet. The mvp and eh bundles are now vite asset
  imports emitted next to the app, and the protomaps assets are vendored under
  `public/basemaps-assets` (11.2 MB, refreshed by
  `scripts/fetch-basemap-assets.sh`). Only the three font stacks the en-language
  style asks for ship, which a test enforces by reading the style's `text-font`
  values, and the one left out is a symlink farm that would not survive a
  windows checkout. The duckdb spatial extension still loads from
  extensions.duckdb.org.

- 2026-08-11: **a field alias is displayed**. A ptolemy dataset's schema is read
  at `/api/v1/datasets/{id}/schema` when the vector-tiles panel loads the dataset,
  and its aliases label the attribute table headers, the feature-info rows, the
  legend, and the join, stats, symbology, charts, spatial-stats and toolbox field
  selects. A field with no alias still shows its column name, and the alias is a
  label only: sorting, property lookups and every select's value stay the column
  name. `lib/datasetSchema.ts` is the one place ptolemy's `FieldDef` JSON is
  written down, since ptolemy and verne both write that shape.

- 2026-08-10: **the cross section panel's failure is tested**. A DEM lookup that
  answers 503, the way a loaded free service does, has to put the error on the
  panel and plot nothing, and a 200 carrying no usable results has to reach the
  same surface instead of plotting whatever parsed. Both are now asserted in the
  react e2e suite, along with the chart and the stats block being absent. The
  panel has thrown rather than invented terrain since the synthetic fallback was
  removed, and nothing checked it, which is how a stale comment claiming the
  fallback still existed survived for months.

- 2026-08-09: **OGC layers reach a live document**. A WMS, WMTS, XYZ or remote
  PMTiles layer travels as the service handle, so every member requests the
  same tiles for themselves and the layer keeps its id, which is what a later
  delete needs. A WFS layer stays out, since its features already travel from
  the agent layers, and so does a dropped `.pmtiles`, which is a browser File
  nobody else can read. The layers gained a visibility and an opacity both
  renderers honour, and the layer manager row a live document gives them drives
  both. `layerVisibility.ts` is now `layerControls.ts` and carries the opacity
  switchboard as well.

- 2026-08-09: **a project remembers its map**. Switching projects saves what
  the outgoing one was showing and puts back what the incoming one was left
  with, held per project in IndexedDB in the same shape as a saved project
  file. A project nobody has left a map in keeps what is on screen, so a new
  project starts from the map you made it from rather than a blank globe.
  Switching inside a live document imports the project into it, since the
  outbound sync watches the same stores. `Project.layerIds` and
  `bookmarkIds`, only ever written empty, are gone.

- 2026-08-09: **one visibility switch per layer**. A layer sits in the layer
  list and in the store the renderers draw from, and the list's switch reached
  only the list, so an overlay or a live document's layer had two switches and
  one of them did nothing to the map. Every switch now writes both, agent
  layers honour it in all three renderers, a peer switching a layer off is
  followed locally, and the layer manager shows one row per layer: the row
  whose opacity, shading and remove reach what is drawn.

- 2026-08-09: **agent strings render as data, never markup**. A marker label
  went to Leaflet's `bindTooltip` as a string, which Leaflet assigns via
  `innerHTML`, so markup in an agent-authored label became live DOM. Labels
  now travel as elements with `textContent`. MapLibre marker colours are
  assigned as a style property rather than interpolated into `cssText`,
  closing a CSS injection that could fire an outbound request.

- 2026-08-09: **image overlays sync into live documents**. The bitmap uploads
  once as an agora attachment and the overlay travels as its url plus four
  corners, so corner drags and opacity changes reach peers without resending
  the image, and per-user undo takes an overlay frame back like any other. A
  share link session keeps its overlays local with one quiet notice, since
  only platform members may upload.

- 2026-08-09: **quad overlays warp on Cesium**. An image overlay dragged out
  of square renders warped onto its four corners instead of showing the
  rectangle around it. An axis-aligned overlay still drapes as imagery so it
  follows the terrain.

- 2026-08-09: **tiling progress on the asset row**. The assets panel reads the
  job the upload queued and shows its progress, stopping when the asset goes
  terminal. An asset this session did not upload finds its job through
  tiletopia's new `GET /assets/{id}/jobs`, looked up once per polled asset, so
  progress survives a page reload.

- 2026-08-09: **colours are parsed or dropped**. A layer or marker colour from
  the agent or a file reached three renderers unchecked. Anything the browser
  does not read as a css colour now falls back to the default, which keeps
  Cesium from answering undefined to its own parser and taking down the draw
  of every layer behind it.

- 2026-08-09: **per-user undo in live sessions**. cmd/ctrl+z takes back your
  own last applied frame as inverse ops and shift adds redo, with buttons
  beside the session controls. A batch comes back as one step, a key someone
  else wrote since is skipped rather than clobbered, undo waits until every
  sent op is acked, and a view-role session gets no affordance.

- 2026-08-09: **live sessions know they are guests**. The live store records
  whether the session joined through a share link, so the share dialog and the
  mention list stop asking agora for members a session token cannot read.

- 2026-08-09: **bookmarks restore on leaving a live session**. The browser's
  own bookmarks are held aside while a live document is showing and put back
  on the same leave path annotations use. A mid-session reload keeps them.

- 2026-08-09: **image overlays place by their four corners**. Drag handles on
  the MapLibre map move each corner (Cesium and Leaflet drape the bounding
  rectangle), and images and PDFs dropped anywhere on the window land at the
  viewport centre ready to place. Overlays save and reload with a project, the
  placement in the project file and the bitmap in IndexedDB, so a project
  opened in another browser comes back without its pictures and says so. The
  layer panel gives overlays a visibility switch and stacking order.

- 2026-08-09: **datum shift grids in the browser**. When a `.prj` names a
  coordinate system that needs an NTv2 grid (NAD27 and friends), the overlay
  fetches candidates from `/grids/<name>` and retries the transform; no grids
  ship with the app, deployments drop `.gsb` files there. A `.gsb` dropped into
  the overlay panel alongside the `.prj` registers under its filename and
  satisfies the transform with no fetch. Vendored projicio wasm regenerated
  with `register_grid`, `registered_grids` and `missing_grids`.
- 2026-08-09: **nightly panels suite runs serial in CI**, after five timing
  failures at two workers on the shared runner. The overlay panel also no
  longer flashes a false not-lon/lat error while a `.prj` transform is still
  loading, and the first wasm assert in the overlay spec gets the same 30s
  budget the raster suite uses.

- 2026-08-09: **live layers carry their publisher's colour**. A layer entry's
  `styleOverrides` may hold a CSS `color`, which the GeoLang agent and peers
  write alongside the layer. A materialized layer takes that colour instead of
  the default blue, and a later colour change from the publisher restyles the
  layer in place. A member who restyles the layer themselves keeps their own
  overrides.

- 2026-08-08: **live documents carry layer data**. A layer entry may hold a
  `source`: inline GeoJSON when the op stays under 48KiB (agora caps op values
  at 64KiB), or a URL each member fetches. Local agent layers publish inline
  automatically and materialize on peers under the document's layer id, so an
  external agent writing layer ops reaches every open viewer. Oversized layers
  stay local for now, and creating a document snapshots agent layers too.

- 2026-08-08: **georeferenced image + PDF overlays**. A Data menu "Image
  Overlay" panel drapes a site plan image or a PDF page over the map. A world
  file sidecar places it exactly, a `.prj` names its coordinate system
  (transformed by projicio compiled to wasm, the platform's own CRS engine,
  vendored in src/overlay/wasm), and rotated or reprojected images resample
  north-up onto their bbox. Without sidecars, two clicks pin the corners with
  the image aspect held at that latitude. Placement stays editable (bbox
  fields, opacity) until "Keep layer" hands it to the raster layer store all
  three renderers draw. Supersedes the georeferencer preview plugin, deleted.

- 2026-08-08: **embed postMessage API**. An `?embed=1` iframe now offers its
  host page a message surface (lib/embedMessaging.ts, active only inside an
  iframe): host → embed `viewtopia:flyTo` {lng, lat, zoom?},
  `viewtopia:getCamera`, `viewtopia:listLayers`,
  `viewtopia:setLayerVisibility` {layerId, visible}; embed → host
  `viewtopia:ready` on boot, `viewtopia:camera` (as the getCamera reply and
  throttled on every move), `viewtopia:layers`, `viewtopia:click` {lng, lat}.
  Only messages from the parent window are honoured. Unit tests cover the
  handlers, and a react e2e drives a real iframe from a host page (fly,
  camera stream, click).

- 2026-08-08: **compact phone toolbar**. The phone row used to mount the
  full desktop toolbar behind a horizontal scroll. `ViewerToolbar compact`
  now keeps the renderer tabs, fly-to search and one-tap Layers/Inspect,
  and folds the five labeled menus plus Measure, Legend, More, Plugins and
  Settings into a single scrollable "All tools" menu with section labels.
  View-only sessions keep their icon row and badge.

- 2026-08-08: **embed mode**. `?embed=1` renders the viewer with no chrome:
  header, toolbar, chat, panels, palette, shortcuts, welcome and tour all
  gone, just the map plus a pill badge naming the live document and linking
  back to the full app (same URL minus the param). Pairs with a view role
  share link for a read only live embed, and with hash share links for
  static maps. The share dialog offers a copyable iframe snippet under view
  links. Live share links and embed snippets now carry the sharer's current
  camera as the existing `#cam=` hash (built by cameraHashFragment, shared
  with ShareLinkPanel), because the live document syncs layers but holds no
  camera, so recipients used to land at the default view. e2e: a golden-path
  scenario mints a view link and asserts an anonymous visitor gets the live
  map, the badge and none of the chrome.

- 2026-08-08: **comment deep links and export**. Every thread offers a Link
  button copying a URL that opens the document at that thread: guests keep
  their share token (`?live=…&comment=…`), members link by id
  (`?doc=…&comment=…`, signed in members only, with a sign-in prompt
  otherwise). Following one joins the document, opens Comments, reveals the
  thread (resolved included), rings it for a few seconds and flies to the
  comment's anchor. The panel header grew an export menu writing the
  document's comments as CSV or GeoJSON (thread order, anchored comments as
  Points, `geometry: null` for the rest). Fixed along the way: the client
  now adopts the member role the snapshot carries, so joining through the
  bell or a doc link as a view member renders view-only instead of
  assuming edit. e2e: a golden-path deep-link scenario (copy in one
  browser, follow in a second, read-only panel ringed at the thread).

- 2026-08-08: **comment mentions and a notifications bell**. The comment
  compose and reply boxes offer document members while an `@name` is being
  typed (MentionTextarea over the members list, named by their peer entry
  when online; share link guests get no suggestions because they cannot
  list members). A posted comment carries the picked mentions the text
  still names, agora turns each into a notification row for that member
  (see agora's changelog), and rendered comment text highlights the
  tokens. A bell in the header, for signed in users only, polls
  `/agora/notifications` every minute, badges the unread count, and
  clicking an entry marks it read, joins that document and opens its
  comments panel (the panel open state moved into the live store for
  this). e2e: the golden path live-session spec grew a mention + bell
  scenario; unit tests cover the trigger parsing, candidate matching,
  posting, segment rendering and the bell.

### Fixed

- 2026-08-10: **the react e2e suite reaches no third-party host at all**. Two
  were left. The agent-layer basemap-change test picked Satellite, which is
  Esri World Imagery, so around 24 tile requests a run went to
  `server.arcgisonline.com` carrying the same intermittent
  `ERR_NAME_NOT_RESOLVED` the other basemap hosts were fixed for; the page
  fixture now answers it with the one-pixel raster it already serves
  `basemaps.cartocdn.com`. The Cross Section test fetched a real DEM from
  `api.open-elevation.com`, and the panel throws rather than inventing terrain
  when that lookup fails, so a slow or unresolvable API failed the test. That
  lookup is now stubbed with a climb of 7 m per sample and one deep notch, and
  the test asserts the profile carries those numbers: the stats line, and the
  drawn chart's own path rescaled back to the elevations it was built from. It
  used to assert only that a chart appeared, under a comment claiming the panel
  falls back to synthetic terrain, which it has not done since the DEM errors
  were surfaced. Both hosts joined the react config's resolver rules, so
  anything past a stub fails outright.

- 2026-08-10: **the react e2e suite draws its basemap from disk**. Every page
  load fetched a style from `tiles.openfreemap.org`, and chromium fails to
  resolve that host every few runs on a loaded box while the shell resolves it
  fine. A style that never arrives leaves MapLibre with no layers, which failed
  whichever test was reading the map. The shared page fixture now answers that
  host and `basemaps.cartocdn.com` itself, with the OpenFreeMap dark style and
  its TileJSON exactly as they are served, saved under `tests/e2e/fixtures/`,
  plus empty vector tiles and a one-pixel raster. The react config also tells
  chromium neither host resolves, so anything that slips past the fixture fails
  outright instead of intermittently. Nothing in the suite watches whether the
  hosted style is reachable any more, which is the point.

- 2026-08-10: **the react e2e suite stops failing on a busy machine**. Three
  unrelated causes, none of them the app. The share link and stories panels
  were asserted with a bare `getByText`, which matches both the panel title
  and the menu item that opened it, so the assertion raced the menu's close
  transition and hit a strict-mode violation; both now scope to `.panel-dock`
  the way the neighbouring panel tests already do, which the menu's portal
  sits outside of. The config's 60s test timeout was under the 40-44s the
  heaviest Cesium tests really take on swiftshader under load, and it fired
  before any of the specs' own 30-60s waits could report what was slow, so it
  now matches the 120s the other two swiftshader configs use. The vector-tiles
  and traffic tests waited 15s for a MapLibre style that comes from a public
  CDN, against the 60s every other MapLibre spec allows.

- 2026-08-09: **a saved OGC layer comes back as itself**. Opening a project
  file minted a new id for every OGC layer, which lost a WFS layer's features
  (they are filed in the agent layers under the old id, so removing the layer
  left them on the map) and left a remote PMTiles layer in the list with no
  archive behind it, drawing nothing. Each layer is now put back under its
  saved id, and an archive's header is read again, since the pmtiles protocol
  only resolves a url it was given a source for in this session. One archive
  failing to load no longer stops the rest of the project from opening.

- 2026-08-09: **a peer's layer keeps the colour its publisher chose, or none**.
  A layer arriving from a live document with no colour of its own was given
  blue on the way in, and the next local edit to that layer, a visibility
  toggle was enough, published that blue back to everyone as a chosen colour.
  A layer may now carry no colour at all, and the renderers, the legend and
  the map all fall back to the same default at draw time.

- 2026-08-08: **live errors read like the app wrote them**. The Live dialog,
  share dialog and link-join banner rendered `AgoraRequestError.message` raw
  ("agora GET /documents failed with 500"). One helper (`agoraErrorText` in
  live/api.ts) now shows a plain sentence, plus agora's own refusal reason
  when the response carried one.

- 2026-08-08: **unit suite teardown flake**. A component tree left mounted
  when a test file ends keeps a React scheduler task queued, and the task
  reads `window` after vitest tears down jsdom (`ReferenceError: window is
  not defined` out of performWorkOnRootViaSchedulerTask, twice on macOS CI).
  A vitest setup file now runs testing-library `cleanup` after every test;
  most files only cleaned up in `beforeEach`, leaving their last render
  mounted.

- 2026-08-08: **`#cam=` hashes now restore MapLibre views**. The share hash
  hook seeded the shared camera and then flew only a Cesium viewer, but
  viewers mount before the hook's effect runs, so a maplibre link (every
  embed snippet, most share links) landed at the default view. The hook now
  flies whichever viewer registers, and the embed golden-path e2e asserts
  the landing camera.

### Changed

- 2026-08-08: **the tour drives the app**. The static five-step TourPanel
  (statements over screen regions, two of them aiming at elements that
  did not exist) is replaced by a driven tour in its own overlay + store,
  so it survives the panels it opens: seven steps that open the command
  palette, arm the draw line tool, arm distance measuring, open Layers,
  open the basemap/renderer popover, and point at Live — each step's
  action undone when stepped back or closed. Started from the welcome
  card or More → Tour (the 'tour' panel slot now just launches it). The
  panels-suite tour e2e asserts the driven behavior per step.

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
