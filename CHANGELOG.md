# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 2026-08-29: **the speech service is part of the default stack.** `aavaaz`
  no longer sits behind the `speech` compose profile, so `platform-up.sh` and
  a plain `docker compose up` start it. Needs the Aavaaz checkout at
  `../../Aavaaz/aavaaz` and an NVIDIA GPU. The mic still waits on
  `/speech/health`.
- DESIGN_TODO brought current 2026-08-28: dropped shipped chat-only phases 2
  and 3, the voice leftover that pointed at a closed P0 item 8, Collecta
  Ptolemy as a gap, GeoGit GeoJSON-without-geometry, the duplicate native
  vector-to-3D-Tiles row, and the tiletopia mesh tiling leftovers now built.

### Added

- 2026-08-28: **Settings holds several cloud APIs and several local models.**
  Each provider is a named base URL with its own key (cloud) or none (local)
  and a comma-separated model list. You switch by picking a model; Add Cloud
  API / Add Local saves another provider without replacing the others. Keys
  stay on sibyl, never in localStorage. A switch still applies to new
  messages only.

- 2026-08-26: **dictating a run of prompts takes one click.** The mic stays
  connected across a send: `handleSend` marks what has been said so far and
  keeps listening, so the next sentence needs no second click.
  `src/speech/segments.ts` gains the watermark that does it, without which the
  ten segments the server keeps resending would walk back into the box after
  every send. Enter sends from anywhere, since a live mic leaves the cursor
  outside the input, and `useKeyboardShortcuts` now stands aside for a focused
  button or link so Enter does not both press it and send.
- 2026-08-26: **the recogniser is told what is on the map.** `src/speech/biasing.ts`
  builds WhisperLive's `initial_prompt` from the project, live document and
  layer names, deduplicated, skipping names that bias nothing ("Layer",
  "untitled", bare numbers) and stopping on a whole name before Whisper's
  224-token prompt window. So "Thames" comes back spelled the way the map
  spells it.

### Changed

- 2026-08-27: **an analysis result is an ordinary layer.** `analysis.viewshed`,
  `analysis.flood` and `analysis.cross_section`, and the Viewshed, Flood, Cross
  Section, Terrain Profile and Terrain Analysis panels, all draw through
  `addGeoJsonLayer` as "Viewshed", "Flood", "Cross section", "Terrain profile"
  and "Contours", so the layer panel and the chat's `layers.*` actions can hide,
  fade, reorder and remove them; before, they went straight to the renderer and
  nothing could reach them.
  `LayerOptions` gains `name` and `fit`, and neither the flood nor a profile
  line frames, since both are computed over the view framing would move.
  Taking a result off through the layer panel now also clears the reading the
  Viewshed and Flood panels report, which would otherwise describe a layer
  nobody can see. `src/features/terrain/resultLayer.ts`,
  `src/viewer/renderGeoJson.ts` and `addMapGeoJson` are gone with their last
  callers. The Terrain Analysis panel's draped raster is the one result the
  panel still owns outright.
- 2026-08-27: `tests/unit/fixtures/viewer-snapshot.json` holds the state the
  viewer sends, beside the action catalogue, so geolang's viewer evals copy
  both rather than keeping a hand-written state that drifts from the real shape.
  Rewrite it with `UPDATE_VIEWER_SNAPSHOT=1`.
- 2026-08-26: `b` no longer toggles the chat. It is `ctrl+b`, which was already
  bound to the same thing.

### Fixed

- 2026-08-27: **a layer removed while the MapLibre style was still loading came
  off the store and stayed on the map.** The effect that draws agent layers can
  only wait for a `load` event that has already fired, and the settled-style
  check re-applied when a layer was missing from the map but never when one was
  left over. It now compares both ways, so the removal lands on the next idle.
  Reached by any `layers.remove` or panel close that happens mid-load.
- 2026-08-26: an action argument wrapped in its own parameter name is read
  rather than refused. Small models send `{"basemap": {"basemap": "satellite"}}`
  where the action takes a string, and `basemap.set` answered `basemap must be a
  string`. `coerceArguments` now unwraps a single-key object whose key is the
  parameter's own name, for scalar parameters only, so an object parameter
  holding a same-named key is untouched. Every action gets this, not just
  `basemap.set`.

### Added

- 2026-08-26: **the dictation path checked against the real speech service.**
  `tests/e2e/dictation-live.spec.js` and `playwright.dictation-live.config.js`
  drive a headless chromium whose microphone is `tests/fixtures/fly-to-paris.wav`
  against a stack running the `speech` profile, mint a platform token into
  `viewtopia_auth`, and expect the spoken words in the chat input. This settles
  what the scripted socket in `dictation.spec.js` cannot: chrome accepting the
  101 with `Sec-WebSocket-Protocol: bearer`, and `AudioContext` at 16 kHz taking
  the mic stream. `large-v3-turbo` downloads on the first connection and the
  download stops when that client goes away, so warm the model with one
  long-lived connection before the run.

- 2026-08-26: **the analysis, simulate and data panels answer in the chat.**
  `src/actions/` grew from 25 to 41 named actions. `terrain.ts` adds
  `analysis.viewshed`, `analysis.flood`, `analysis.terrain_profile` and
  `analysis.cross_section`, `scene.ts` adds `scene.shadows`, `scene.clipping`,
  `analysis.travel_time` and `analysis.spatial_stats`, and `data.ts` adds
  `data.import_url`, `data.add_service`, `data.export`, `stac.search`,
  `stac.add_asset`, `sql.query`, `sql.to_layer` and `sql.attach_url`. Each is
  the same function the panel calls, so the Viewshed, Flood, Terrain Profile,
  Cross Section, Shadows, Clipping, Travel Time, Spatial Stats, Data Sources
  and STAC panels lost their inline copies to `src/features/terrain/`,
  `src/features/scene/`, `src/features/analysis/`,
  `src/features/dataSources/` and `src/features/stac/`. Viewshed now draws on
  MapLibre too, which chat mode ships with. The profile, cross section, STAC
  search and SQL query actions read their result back to the model. Unit
  tests per module and three chat-mode e2e specs cover them.
- 2026-08-25: **the chat takes dictation.** A mic button beside the send button
  streams the microphone to a WhisperLive server and the transcript into the
  input as you speak, a second click stops it, the text stays for editing and
  Enter sends. `src/speech/` holds the client: the WhisperLive handshake over
  `ws://<host>/speech/`, an AudioWorklet posting 16 kHz float32 frames, the
  server's segment windows merged by start time, `END_OF_AUDIO` on stop. The
  server is the Aavaaz GPU image as the `aavaaz` compose service behind the
  `speech` profile (`SPEECH_MODEL`, default `large-v3-turbo`), and the button
  is offered only when `/speech/health` answers. `tests/e2e/dictation.spec.js`
  drives it against a scripted server and Chromium's fake microphone. Since
  2026-08-26 the socket is not open: the browser offers the platform JWT as
  `['bearer', token]` subprotocols and Aavaaz verifies it on the handshake
  with `AAVAAZ_JWT_SECRET`, set from `PLATFORM_JWT_SECRET` in compose.
- 2026-08-25: **the chat runs the viewer on its own, and `?mode=chat` leaves it
  as the only control**. `src/actions/` holds 25 named actions with typed
  parameters, from `camera.fly_to` and `layers.set_visible` through
  `project.open`, `live.set_asset_rule`, `history.show_at` and
  `scenario.compare`, each registered by its domain module and each the same
  function the panel offering that capability calls, so the Scenario panel's
  compare logic now sits in `src/features/scenario/compare.ts`, the asset rule
  write in `src/live/assetRule.ts` and the scrubber's fetch in
  `src/live/assetHistory.ts`. A layer, project, feed, dataset or branch argument
  is an id or a name, resolved by exact id, exact name, then a unique
  case-insensitive substring, and an ambiguous name comes back naming the
  candidates. Every chat message carries `buildViewerSnapshot()` and
  `actionCatalogue()` as the AG-UI run state, so the model is told the camera,
  renderer, basemap, up to 50 layers, project, live document, asset rule and
  picked feature, and it answers with `viewer_control(action='run', name,
  args)`. A destructive action asks for a confirming reply in the chat before it
  runs, and a read action's answer goes back as a follow-up turn, at most two per
  prompt. In chat mode the header, dock, toolbars and overlays are not rendered,
  a floating "Exit chat mode" button sits over the map, entering posts one
  message listing what still needs the mouse, and a command that only opens a
  panel says which panel it would have opened. `tests/unit/actions-*.test.ts`
  and the deterministic `tests/e2e/chat-mode.spec.js` cover it with no model in
  the loop.
- 2026-08-25: **a scenario branch is compared against its base, side by side**.
  A Scenario panel picks a ptolemy dataset, a base branch and a scenario branch,
  makes a new scenario from the base where there is none, and draws each branch
  as its own layer in the split view: the base in the left pane, the scenario in
  the right, because a pane now carries a list of layer ids it leaves out and
  all three agent-layer hooks skip them. Each side shows its feature count and
  the area of the union of buffers around its features, from
  `GET /api/v1/branches/{id}/analytics/coverage?distance=`, with the difference
  as a signed area and percentage. Recompute re-reads both branches after an
  edit in the Dataset Editor, and Stop comparing takes both layers off and puts
  the split view back. Either side may name a past moment, which draws that
  branch through `/features/at`. `tests/e2e/digital-twin-scenario.spec.js`
  drives the whole path against the platform stack.
- 2026-08-25: **a scrubber shows every asset as it was at a past moment**. A
  live map carrying an asset rule grows a bar along the bottom: a window of 1h
  to 30d, a slider over it, a box taking an exact time, and a Live button. A
  drag or a keystroke settles for 200 ms, then asks
  `GET /agora/documents/{id}/assets/at?t=`, and the answer goes to the asset
  store beside the live state rather than over it, so the 2D layer, the tileset
  style and the inspector all paint that moment while readings keep arriving
  underneath and Live goes back to them with no request. An answer to a moment
  that is no longer the one asked for is dropped, so a slow one cannot win.
- 2026-08-25: **a 3D tileset is a layer of the map, and the asset rule colours
  its tile features**. Add to globe in the Assets panel, the agent's
  `load_tileset` and a live document all go through one layer store, so the
  model gets a Layers panel row with a switch and a remove, and every member of
  a live map loads the same tileset.json for themselves rather than one browser
  holding a primitive nobody else has. The asset rule accepts a tileset layer:
  it becomes a `Cesium3DTileStyle` with one colour condition per asset the
  readings store knows, matched on the tile feature's `asset_id`, and the
  tileset's own style comes back when the rule goes. Clicking a tile feature
  with Inspect on shows the ptolemy asset's attributes under the tile's own and
  the same live readings the 2D pick shows, because both key on `asset_id`.
  `scripts/seed-twin.mjs` takes a tileset url and the ids the tiles carry, and
  `tests/e2e/digital-twin-3d.spec.js` drives the whole path from an IFC of
  twelve boxes.
- 2026-08-25: **live asset readings recolour the map and fill the inspector**.
  The share dialog of a live map grows a Feeds section: an editor creates a feed
  with a name and an expected interval, copies the token it answers with once,
  and a producer sends `readings` frames into `/agora/feeds/ws` with it. Agora
  fans each reading out over the document websocket, and the browser holds them
  outside the document, so nothing about a reading is an op. An "Asset rule"
  form saves one `assets/rule` op naming the asset layer, the reading kind,
  breakpoints as `value:color`, and a default and offline colour, and the
  matching features on the 2D map take the colour of the last breakpoint at or
  below their latest reading, the offline colour once agora has missed three
  intervals from that asset. Clicking one with Inspect on shows every kind's
  latest value with its time, and whether the asset is online, following the
  feed without a second click. `scripts/seed-twin.mjs` writes the twelve-asset
  demo (ptolemy dataset, live document, layer, rule and feed) and
  `tests/e2e/digital-twin.spec.js` drives it from a node producer.
- 2026-08-25: **field data publishes into a ptolemy dataset from the Field Data
  panel**. Publish, next to the form picker, posts to collecta's
  `/collecta/api/v1/forms/{id}/publish`, then draws the dataset branch it
  answers with as the `ptolemy-branch-{id}` layer, so the submissions are on
  the globe as ptolemy features under their own submission ids. The
  notification says how many were published and how many were already there,
  and the button stays for a repeat publish, which writes only what is new.
  A refusal from collecta or ptolemy is shown as its own message.
- 2026-08-25: **a feature's geometry is editable at the vertex, and no WKB type
  keeps a feature out of the editor**. Selecting a feature in the Dataset
  Editor and pressing "Edit vertices" puts a draggable handle on every vertex,
  on both MapLibre and Cesium, and each released drag queues one update against
  the version the row was opened at, so a corner moves without redrawing the
  shape. Moving a polygon ring's first vertex moves its closing vertex with it,
  and a position that carried an elevation keeps it. The WKB codec now reads
  ISO Z, M and ZM type codes, the EWKB flag bits, an embedded SRID and
  GeometryCollection, keeping Z as the third ordinate and dropping M, and
  writes Z back for a geometry that has it. Features in those forms used to
  decode as null, which left them unselectable and unredrawable.
- 2026-08-25: **a project's datasets are managed from the Project menu**.
  Manage Datasets, shown to editors and owners, lists every readable dataset
  with Attach on the ones in no project and Detach on the ones in this one,
  over ptolemy's `PUT`/`DELETE /api/v1/datasets/{id}/project`. Attaching makes
  the dataset private to the project's members, detaching leaves it private,
  and a refusal is shown as a notification with the modal still open.

- 2026-08-24: **the Space-Time panel grew its GeoTime core**. A cube view
  toggle pitches the map so time reads as height over the existing
  elevation-equals-time deck.gl layers, with a sweep plane at the playhead,
  ground-projected track shadows, and a trail window that now actually
  filters (the control existed and did nothing). CSV import downsamples
  above 100k track points by uniform stride, keeping each track's endpoint,
  and says how much it dropped. The seven Analysis buttons run their
  already-written algorithms for real through a worker (colocation,
  pattern-of-life with anomalies, network metrics, behavioral clustering,
  predictive location, data quality, and new co-travel detection built on
  sustained colocation runs), each drawing into the cube and map plus a
  result list. The Entity Resolution button is gone, nothing implements it.
  Ontology, CDR import, classification, RBAC, geofencing UI and case
  management stay not implemented and the README/FEATURES say so plainly.

### Changed

- 2026-08-26: **sibyl's key and model variables are renamed.** The compose files
  pass `SIBYL_CLOUD_API_KEY` instead of `XAI_API_KEY`. The platform compose no
  longer lists `SIBYL_API_BASE`, `SIBYL_MODEL` or `SIBYL_THINKING` under
  `environment`: every `SIBYL_CLOUD_*` and `SIBYL_LOCAL_*` value now comes from
  `geolang/.env` through `env_file`, because an `environment` entry, even an
  empty one, hides the file's value. The
  platform E2E and sweep workflows write the `XAI_API_KEY` secret into
  `geolang/.env` as `SIBYL_CLOUD_API_KEY` and no longer write `OPENAI_API_KEY`.
- 2026-08-25: **the 3D and 2D tabs switch the highlighted split pane.** The
  viewer pane shows Leaflet in its own quadrant instead of collapsing the grid,
  a compare pane swaps to Leaflet and back to the globe it drew, the tab bar
  reads whichever pane is highlighted, and the Split View panel's "only on the
  3D tab" notice is gone. `tests/e2e/split-pane-tabs.spec.js` covers it.
- 2026-08-24: **a plan run names the chat session its report goes to**. The
  approve button's `run_workflow` call sends the viewer session's sibyl id as
  `thread_id`, so geolang appends the run report to that session and to no
  other. Before this geolang wrote to whichever sibyl session was active
  process-wide, which is how another caller's upload notes ended up in a
  person's chat.

- 2026-08-24: **a service that is down says which one it is**. The header names
  every platform service whose health probe went unanswered, one line per
  service in the sync popover and a "<service> is unreachable" wherever a
  ptolemy, tiletopia, agora or agent call fails with no reply or a gateway
  status. A layer whose tiles fail shows the reason on its own row in the
  Layers, Data Sources and tileset lists with a Retry that asks for the tiles
  again where the user already is. An edit the server refuses is shown once and
  dropped from the sync queue instead of being retried against a branch the
  user cannot write. `tests/e2e/backend-absent.spec.js` proves all of it in the
  browser with every backend prefix answered by the test: boot with four
  services down, an XYZ layer answering 503 and recovering on Retry, a commit
  answered 403, and a chat send with the agent gone. DESIGN.md now says which
  service answers for each layer type.

- 2026-08-24: **approving a plan records the approval before it runs**. The
  approve button posts the plan's own manifest to `/agent/workflow/approve`
  first, which is the only record geolang has that a person agreed, and only
  then to `run_workflow`, which now refuses a manifest without one. A refused
  approval shows its reason in the panel, runs nothing, and leaves the button
  pressable.

- 2026-08-24: **the platform e2e runs a real agent tool and draws its output**.
  `tests/e2e/agent-tool-run.spec.js` posts an inline point FeatureCollection to
  `/agent/upload`, calls `POST /agent/tools/voronoi` over the same nginx proxy
  the viewer uses, and asserts the run answers a result rather than a `❌`
  string. The GPKG the tool names is then replayed through chat history, so
  `renderUISpec` fetches it from the real `/agent/geojson/<file>` route with no
  mock, and the test reads the MapLibre source back to check the four cells and
  their labels are the tool's own. The tool call and the browser share one token
  `sub`, because geolang scopes an output file to its caller. No LLM is
  involved, so this costs nothing to run.

- 2026-08-23: **a geometry edit commits like an attribute edit**. The Dataset
  Editor's Redraw geometry button arms the Draw machinery in the selected
  feature's shape family, and the finished shape replaces the feature's
  geometry through the same queue, three-way merge and
  `POST /branches/{id}/commit` as a property edit, with the geometry treated as
  one value in a conflict. A single shape replacing a Multi geometry keeps the
  Multi type. The Draw panel gets a Save to dataset section that commits every
  drawn shape as an insert with a client-minted feature id, and a circle goes
  as its center point carrying `_radius_m`. `wkb.ts` now codes all six 2D WKB
  types both ways, so line features list with a drawable geometry instead of
  none.

- 2026-08-23: **a large vector file is tiled on the server instead of parsed in
  the tab**. A dropped or browsed `.geojson`, `.fgb` or `.csv` over 50 MB, and a
  `.geojson.gz` at any size, is offered to tiletopia's tileset builder rather
  than read into a FeatureCollection: the file is uploaded with a progress bar,
  the build is polled until it is ready or failed, and a failure shows the tail
  of tippecanoe's stderr. A ready archive becomes a vector tile layer reading
  its TileJSON at `/martin/{source}`, styled per source layer across the three
  geometry kinds, and it rides the project snapshot like every other layer. A
  smaller file that the builder can read is offered the same route as a second
  option after it imports. Only the MapLibre renderer draws these, the same as
  PMTiles. The Layers panel lists the archives with their status and build date,
  adds one as a layer, and deletes one behind a confirmation. nginx routes
  `/martin/*` to tiletopia and takes tileset uploads up to 4 GB, and the map
  puts the platform bearer on its `/martin` requests.

- 2026-08-23: **the share dialog can email an invite link**. It reads
  `GET /api/v1/capabilities` when it opens and shows an "Email the link to"
  field only where ptolemy reports a relay. The address goes with the
  create-invitation call, and the dialog says the invite was emailed or names
  the relay's refusal, leaving the link to copy either way.

- 2026-08-23: **a first run says where to start**. A profile that has imported
  nothing, opened no project and joined no live session gets a panel on the map
  naming those three entry actions. Doing any one of them retires it, as does
  the Got it button, under the `viewtopia-first-run` localStorage key. The
  panel also carries the demo-dataset-and-tour offer, and the separate
  WelcomeCard strip that used to make it is deleted, so a fresh profile sees
  one first-run surface instead of two.

- 2026-08-23: **a project's map lives on the server**. The snapshot
  `serializeProject` builds goes to ptolemy under the project's `map` state key,
  debounced four seconds behind any change to the renderer, basemap, layers,
  split view or camera, and is read back on project switch and on sign-in.
  IndexedDB `projectMaps` stays as the offline cache: the newer `savedAt` of the
  two wins, and a save the network refused goes out again on the next change,
  the next project switch, or the browser's `online` event. Opening a project
  over a live MapLibre map now moves that map, which it did not do before:
  MapLibre reads the shared camera when it is built and never again.

- 2026-08-23: **overlay bitmaps travel with the project**. A draped image is
  uploaded as a ptolemy project attachment and the snapshot names the
  attachment, so a member who has never seen the picture draws it instead of
  skipping the overlay. IndexedDB `overlayImages` stays the local cache and is
  still what a project saved to a file relies on.

- 2026-08-23: **a dashboard belongs to a project**. The dashboards store reads
  and writes the project's `dashboards` state key rather than the
  `viewtopia_dashboards` localStorage key, so every member sees the same ones.
  Dashboards already in that key move into the first project opened after this
  and the key is dropped. With no project open there is nowhere to put a
  dashboard, so the edit is refused rather than held in a browser that would
  lose it.

- 2026-08-23: **escape closes popups in full screen on chromium**. Entering
  full screen locks the Escape key through the keyboard lock api, so one press
  closes an open menu or dialog instead of leaving full screen, and leaving
  full screen takes press-and-hold Escape or the header button. Browsers
  without the api keep the native behavior.

- 2026-08-23: **comments pin to the map**. "Comment here" in the map context
  menu, offered in a live edit session, composes a comment at the clicked point
  and marks its anchor `placed`. Placed unresolved threads draw as pins over
  all three renderers through one projected overlay, and clicking a pin opens
  the thread in a floating box sharing the side panel's thread component, so
  replies, mentions, resolve and copy-link behave identically. Resolving
  removes the pin. Camera-anchored comments keep their fly-to behavior and
  never pin.

- 2026-08-23: **one real editing path against a ptolemy branch**. A new Dataset
  Editor panel picks a dataset and branch, lists the branch's features, and
  edits one feature's properties. Each edit queues an op that the sync engine
  commits as `POST /branches/{id}/commit` with an `update`, authenticated like
  every other client call. Values keep the JSON type they had, so a number
  edited in place does not come back a string. Before this the sync engine sent
  `PUT /features/{id}` with no bearer to a route ptolemy has never had, so
  nothing it queued could reach the server and the three-way merge, which ran
  only after a successful read, had never run at all. The draw store no longer
  queues: a drawn shape has no dataset behind it.

- 2026-08-23: **a replayed chat map says why a layer is missing**. geolang
  resolves a layer under the caller's own outputs directory, so opening an old
  chat message as a different account returned 404 and the viewer reported the
  same red "Could not load N layers" it shows for a broken request. A 404 now
  says the files are not in this workspace and that analysis outputs belong to
  the account that ran them.

- 2026-08-23: **a live map started inside a project is linked to it**.
  `createLiveDocument` sent `project_id` where agora reads `projectId`, so the
  key was dropped and every session started from the UI was created unlinked
  with a 201. Project members could not reach it, and the Live picker did not
  list it for them either, which is fixed on agora's side.

- 2026-08-23: **annotations work on the 2D Map tab**. `useAnnotationsLeaflet`
  draws the same dot and label the globe renderers use, through a leaflet
  divIcon carrying the shared marker element, and binds click-to-place with a
  crosshair over the container. The panel no longer refuses with "Click to
  place needs the 3D globe", and a placement armed on the globe tab stays armed
  across a switch to 2D.

- 2026-08-23: **offline conflict resolution runs end to end**. Editing a
  feature's properties queues an `update` op keyed on the feature id, so repeat
  edits collapse into one op whose base stays at the state of the last sync. On
  sync that op fetches the server's version and runs the three-way merge:
  changes to different properties merge and go out as one PUT, and
  same-property changes on both sides leave the op queued and land in
  `conflicts` without burning a retry attempt. The sync indicator then offers
  "Resolve Conflicts", which opens `ConflictResolver` with both values side by
  side. Picking a side rewrites the queued op with the server version as its
  new base and syncs, so the retry merges cleanly. What was sent is written to
  the local features store as the base for the next edit, and the server
  receives only `properties` and `geometry`, not the merge bookkeeping.

- 2026-08-21: Space-Time docs name the four panel surfaces that work
  (entities, CSV ingest, track player, manual links). FEATURES.md, README
  and docs/index.html no longer list colocation, classification, RBAC or
  the rest of the 31-row table.
- 2026-08-15: each agent run sends the sibyl session id as the AG-UI
  `threadId`, so two tabs keep separate histories instead of sharing one
  server-side active session.

### Fixed

- 2026-08-25: **no light grid between 2D tiles on dark imagery.** Leaflet
  1.9.4 blends tiles with `mix-blend-mode: plus-lighter` and paints the map
  ground `#ddd`, so every sub-pixel overlap or gap read as a light seam on the
  satellite basemap. The tiles blend normally through an SVG alpha filter that
  makes their edge pixels opaque (the fix the iD editor shipped) and the ground
  is dark.
- 2026-08-25: **the react smoke and default boot specs wait for the first
  boot.** Their first shell assertion after `goto` took Playwright's 5 s
  default, which a cold vite compile or a box running other suites exceeds,
  so they failed locally while CI's single worker passed them. They now wait
  the same 60 s the panel suites do.
- 2026-08-25: **a branch drawn at a past moment decodes WKB only.** ptolemy's
  `/features/at` now answers `geometry_wkb` as WKB like `/features`, so the
  reader no longer sniffs the first byte for GeoJSON text.
- 2026-08-25: **an attachment dropped by a save the server refused is still
  deleted on the retry.** The cached map record now carries the attachment ids
  the last accepted snapshot may still name and the current one does not, so
  the retry from a later change, the online event or the next start deletes
  them once the PUT succeeds. Before this the retry had no earlier snapshot to
  compare against and the attachment stayed in ptolemy. An overlay drawn again
  before the retry goes through leaves the list.
- 2026-08-25: **the first-run overlay's three entry rows do what they say.**
  Each row is a button now. Import data dismisses the overlay and opens the
  `import` tool panel, the project row opens the New Project modal in the
  project switcher, and the live row opens the live map picker. The two header
  controls read the request from a new `onboarding/entryPoints` store, so a
  click before the switcher has loaded its workspaces still lands, and a
  request from a workspace the user cannot create in opens the project menu
  instead. A live-session request while a live map is already open does
  nothing.

- 2026-08-25: **a removed image overlay takes its ptolemy attachment with it,
  the map retry queue survives a reload, and dashboard edits are one write.**
  After the server takes a map snapshot, `mapSync` compares it with the one it
  replaced and calls the new `deleteProjectAttachment` for every attachment id
  the map has stopped naming, so removing an overlay from the layer manager,
  the overlay panel or a live-sync edit clears the file behind it, and only
  once the snapshot that drops it is on the server. The retry queue moved from
  a Set in memory onto an `unpushed` flag on the cached `projectMaps` record,
  and every flagged record is pushed when the app starts watching the map, so
  a reload sends up each project's stale cache and not only the open one.
  Dashboard edits now wait a second and go up as one `putProjectState`, sent
  early when another project loads and dropped when the project closes, where
  each edit used to be its own PUT.
- 2026-08-25: **an oversize drop offers the tileset route for every file, not
  just the first.** `useTilesetStore` held one `offered` file, so a drop of
  several files past `BROWSER_IMPORT_LIMIT_BYTES` offered the first and told
  the rest to be brought back one at a time. The store now keeps a queue,
  `importFiles` appends every server-bound file in drop order with its own
  browser fallback, and the modal shows the head with a "1 of N" line while
  more wait. Cancel, "Load in the browser anyway" and a finished build each
  answer the head and bring up the next file. A failed build keeps the head
  with its error, as before.
- 2026-08-25: **the Statistics grid no longer stalls the browser's GPU
  process.** The panel's deck.gl `GridLayer` used GPU aggregation, which
  allocates one bin for every cell in the data extent, so points in two
  distant clusters at a small cell size meant millions of bins. Under
  SwiftShader that left the GPU process spinning after the page closed and the
  next `browser.newContext` in the panels e2e never returned, which is the
  flake on the two analysis-2 tests in every scheduled run since 08-16.
  The layer now aggregates on the CPU, which bins only the occupied cells.
- 2026-08-25: **a map spec with no layers no longer clears the globe.** geolang
  now answers an `emit_ui_spec` call with nothing to draw with an empty map
  spec rather than an error, and the viewer used to hand that empty list to the
  agent-layer store, dropping whatever the previous answer had put on the
  globe. `renderUISpec` leaves the store alone when the spec names no layer.
- 2026-08-23: **an asset upload over 1 MB was 413'd by nginx before tiletopia
  saw it.** `/tiles/v1/assets` gets its own location block, matching the one
  vector tileset uploads already had: body size up to tiletopia's 4 GiB cap,
  request buffering off so the progress bar tracks the real transfer, and a
  600s read timeout.

- 2026-08-21: notebooks IndexedDB access no longer throws when `indexedDB` is
  missing (jsdom / vitest). The all-panels test mounts NotebookPanel and that
  was failing CI on macos.

- 2026-08-15: **the Assets panel and 3D export talked to ptolemy.** Both
  hardcoded `/api/v1`, and nginx `/api/` is ptolemy. Terrain already used
  `/tiles/v1`, which rewrites to tiletopia `/api/`. The panels now do too.
  Auth, portal and realtime stay on `/api/v1` through their own nginx
  locations. Verified by the existing unit suites, now pointed at `/tiles/v1`.

- 2026-08-14: **switching to 3D with the origin down killed the globe with
  Cesium's "rendering has stopped" panel showing "[object Object]"**. The
  service worker precached the app shell but left cesium's lazy-loaded
  Workers, Assets and ThirdParty files on the network, so the shell booted
  and 2D worked while building a 3D viewer fetched those files from the dead
  origin and a stringified `RequestErrorEvent` landed in the render loop. The
  whole cesium runtime is precached now (422 entries, ~21 MB total), and the
  manifest test asserts the lazy files are present instead of asserting they
  are absent. Verified by installing the worker, killing the server,
  reloading and switching to 3D against a build served from cache alone.

- 2026-08-14: **the STAC item search box was dead on every catalog the panel
  offers**, since neither Earth Search nor Planetary Computer advertises the
  free-text conformance class the input is gated on. The CEDA STAC API does
  advertise it and now sits in the well-known list, so the box is live on a
  default catalog. Its `q` also goes out as an array of terms, which is what
  that class takes on POST, where the string the panel used to send comes back
  HTTP 400.

- 2026-08-14: **the README sold the Environmental plugin as live sensor
  monitoring with threshold alerts**, and it is neither. `SensorPanel` fetches
  `/api/v1/sensors` once when it opens and never again, with no websocket and
  no polling, and the status badge it shows per sensor is whatever the server
  already put on the feature, not a threshold this code evaluates. The
  plugin's own `wsUrl` and `alertThreshold` settings are declared and then
  never read by anything. The verticals table now describes what the panel is,
  a sensor inventory with server-reported status that filters by type and
  flies to a sensor.

- 2026-08-14: **the Logistics row and plugin description claimed fleet tracking
  via WebSocket**, but FleetPanel is a deliberate empty state, since no service
  serves vehicle positions. Both now lead with the real half, the itinera
  multi-stop delivery optimizer, and say the fleet panel waits on a feed.

- 2026-08-13: **the Cesium globe drew every basemap tile upside down**, a
  patchwork of flipped tiles mismatched at their borders. The offline
  `CachedImageryProvider` decoded tiles with `imageOrientation: 'none'`, while
  Cesium's own `ImageryProvider.loadImage` fetches everything with `flipY`, so
  each tile came out inverted relative to what the renderer expects. Found by a
  headless probe whose screenshot showed EUROPE mirrored, pinned by a test on
  the decode options.

### Added

- 2026-08-24: **a nightly job runs every geolang tool against the real stack**.
  `.github/workflows/platform-sweep.yml` boots the data plane plus geolang,
  sibyl and geodukt at 06:00 UTC, mints an editor token from
  `scripts/platform-token.mjs`, and runs geolang's `tool_sweep.runner` against
  `http://localhost:5174/agent`, the same nginx origin the viewer uses, so the
  sweep exercises the proxy path the product does. One `POST /tools/{name}` per
  manifest entry, failing the job on any tool error and on any manifest tool
  geolang has no sample arguments for. The per-tool JSONL is uploaded whether
  the run passed or not, because a failed run is the one worth reading. Not a
  per-push gate: geolang's own CI keeps the offline subset.

- 2026-08-14: **collecta joins the platform: field data lands on the map**. The
  compose stack gains a collecta service (OpenRosa for ODK Collect plus its
  REST API) behind an nginx /collecta/ route whose 60m body limit lets photo
  parts reach collecta's own 50MB cap instead of 413ing at the proxy. A Field
  Data panel (Data menu) lists the forms the account may read and loads a
  form's submissions as a map layer: geometry from the first geo field in the
  form's field order, falling back to the device location, scalar answers as
  feature properties, and photo attachments fetched with the bearer into
  object URLs, since an img tag cannot send Authorization. Submissions with no
  location are counted and said, not silently dropped. Platform tokens verify
  at collecta directly because both sides already speak HS256 {sub, exp,
  role}; ODK Collect signs in with Basic auth against collecta's own seeded
  users. Pushing submissions into ptolemy stays deliberately parked
  (DESIGN_TODO).

- 2026-08-13: **a print layout panel composes a page instead of screenshotting
  the window**. Page size (A4, A3, Letter, Legal), orientation and margins, with
  a title, a scale bar sized from the zoom and the width the map prints at, a
  north arrow that follows the bearing, and the Legend panel's own swatches down
  the right, all out as PDF through jsPDF. The map keeps the captured aspect and
  letterboxes rather than stretching. Atlas mode takes a loaded vector layer and
  prints one page per feature, fitting the camera to each feature's padded
  bounds and titling the page from a chosen attribute, capped at 60 pages with
  the layer's real count reported. The camera goes back where the user left it,
  including when a page fails mid-series. Print/Export is absorbed: its PNG and
  JPEG export at a chosen size and DPI is a format on the new panel, and the
  `printExport` id still opens it. Capture reads the live canvas, so MapLibre
  and Cesium work and Leaflet refuses with a message: it draws its tiles as
  images that no canvas can read back.

- 2026-08-13: **one Data Sources panel replaces the OGC Layers, SQL and Import
  panels**. Services, Database and Files are now tabs of a single card, each one
  the body of the panel it came from, moved to `src/features/dataSources/` with
  its logic and tests intact. The three menu entries collapse into one, and the
  command palette matches it on the old names through the menu registry's new
  `keywords`. Opening `ogc`, `sqlWorkspace` or `import` still works and lands on
  the matching tab, so links and agent commands holding an old id keep working.
  The tabs stay mounted, so a half-written query survives a look at another tab,
  and the tab in front is component state that is not persisted. The STAC browser
  stays its own panel.

- 2026-08-13: **a multi-band raster converts to one multi-band COG**. The Convert to
  COG card offers All bands above the per-band options whenever the raster carries
  two or more, writing every band into one pixel-interleaved file through terrano's
  new `writeCogBands`. The vendored `src/raster/wasm/` artifact was rebuilt for that
  binding, and the single-band write now goes through it at one band, which is what
  terrano's own `writeCog` already does. One file carries one sample type, so bands
  read at different widths go out as f64, and the nodata value is one no band uses.

- 2026-08-13: **STAC free text is only sent to catalogs that advertise it**. The
  landing page's `conformsTo` is read alongside its links, and `q` goes into the
  search body only when the item-search free-text class is there. None of Earth
  Search, Planetary Computer or LandsatLook advertises it and they quietly return
  unfiltered results, while NASA CMR answers HTTP 500 to any body carrying `q`, so
  the browser panel now disables the item search box with a note when the open
  catalog has no text search. The OpenLandMap default was dropped: its host serves
  an SPA on every path, and the real catalog is a static file with no collections
  link the panel could walk.

- 2026-08-13: **every tool panel minimizes and moves out of the way**. The shared
  panel header gained a minimize button beside the close X, collapsing the card to
  its title bar in place, docked or floating, with a double click of the title bar
  doing the same. The title bar is also a drag handle: pointer drag detaches the
  card to a fixed position clamped inside the viewport, portaled cards included,
  and the handlers sit on the header alone so touch scrolling inside a panel still
  works. The collapsed flag and the dragged position live in the app store keyed by
  card, since the space-time panel opens beside a tool panel, and are dropped when
  the panel closes or another one opens, so neither is persisted. Settings,
  geoprocessing, image overlay and raster analysis now render through
  `PanelCard`, and the space-time and convert panels through `PanelHeader`, so
  every panel carries both affordances.

- 2026-08-13: **a loaded raster converts to a Cloud Optimized GeoTIFF and downloads**.
  The raster panel gained a Convert to COG card beside the analysis ops, pointed at
  any source band or the last result, writing through the same terrano wasm module
  in the raster worker and the same download the vector Convert panel uses. The
  vendored `src/raster/wasm/` artifact was rebuilt from terrano master for the
  `writeCog` binding. A band goes out in the sample type it was read as, tracked on
  `RasterMetadata.sampleFormats`, so an 8-bit image writes 8-bit instead of eight
  times the bytes, and a result writes f32. Nodata keeps the source's own value when
  the sample type can hold it, otherwise the write takes a sample the band never
  uses. A failure shows in the panel's alert rather than downloading a broken file.

- 2026-08-13: **the terrain panel offers tiletopia's prebuilt terrain bundles**.
  The panel asks `/tiles/v1/terrain/bundles` on mount, an anonymous list, and adds
  a provider option per name under a "Terrain bundles" group. Picking one loads
  `/tiles/v1/terrain/bundles/<name>/`, the trailing slash being what keeps Cesium's
  `layer.json` lookup inside the bundle. A viewer deployed without tiletopia gets a
  404 there and a tiletopia holding no bundles answers an empty list, so in both
  cases the group is absent rather than empty and the other providers are untouched.

- 2026-08-13: **external services say when they are offline instead of failing
  obscurely**. Geocoding and routing already preferred the platform's own
  geokode and itinera, and now go through the offline API cache, so a place or
  a route asked for before still answers with no network. Nominatim and the
  public OSRM remain the fallback for a stack with neither deployed, but
  offline they are not attempted: the call raises, and the fly-to box and the
  routing panel show that message rather than "no place matching" or "no route
  found". Open-elevation, open-meteo and Overpass stay online only, because
  each is keyed by a fresh line, view or camera bbox that no second call
  repeats and a cache would never hit. All five now refuse up front with one
  message naming the network, in the elevation, weather, wind, traffic,
  buildings and OSM-download panels alike.

- 2026-08-13: **a pane gets its agent layers by subscription on every
  renderer**. `useMapLibre` and `useCesium` publish the instance they build as
  state, the way `useLeaflet` already did, and `useAgentLayersMapLibre` and
  `useAgentLayersCesium` key their effects on that instance rather than on the
  app-level renderer and tab. A compare pane switched to MapLibre or Cesium
  after mount now draws the layers that were already on, which before depended
  on effect ordering and did not happen.

- 2026-08-13: **expression renderers in the symbology editor**. A layer can now
  be coloured by arithmetic over its own columns, `population / area` rather
  than one column's classes, and points sized by the same value between a low
  and a high radius. The language is column names, numbers, brackets and
  `+ - * /` and nothing else, which is what QGIS, Mapbox and OGC filters all
  write, so the renderer exports whole to a Mapbox style and comes back off one,
  and reaches SLD and QGIS as five classes over the same arithmetic with the
  loss listed under the export buttons. A half-written expression says what is
  wrong with it and leaves the last working renderer on the map. The legend
  samples the ramp across the value range and draws the point sizes with it.

- 2026-08-13: **symbology imports and exports QGIS layer styles (.qml)**, next
  to the SLD and Mapbox exchanges. Import reads a single symbol, categorized,
  graduated or rule-based `renderer-v2` off SimpleFill, SimpleLine and
  SimpleMarker symbols, in both the `<Option>` map QGIS writes now and the
  older `<prop k v>` form, and carries the layer opacity and the scale-based
  visibility across as the layer's zoom range. Export writes the same set back,
  so a renderer round-trips. A file whose renderer this viewer cannot draw is
  refused by name, and everything a symbology has no place for is listed under
  the button rather than dropped quietly: symbol outlines and sizes, per-class
  opacity, per-rule scale ranges, else rules and hidden classes.

- 2026-08-13: **runtime plugin install from an owner-controlled registry**.
  More → Plugin Manager installs, updates and removes plugins listed by the
  registry named in `VITE_PLUGIN_REGISTRY_URL` or the panel's own setting, so
  a self-hoster may point at their own. Bundles are fetched over https only
  and verified against a mandatory sha256 integrity value at install and again
  at every load from IndexedDB, a bundle cannot claim a built-in plugin's id,
  and a plugin that fails any check is disabled with a visible reason rather
  than retried. There is no sandbox and the design does not claim one:
  installation is the trust decision, made per plugin with the bundle origin
  shown. `docs/plugins.md` covers the registry format and how to build a
  bundle against the host globals.

- 2026-08-13: **story presenter window**. The Stories panel opens a second
  window showing the current step's speaker notes, the next step, and the
  position, with prev/next/jump controls that drive the viewer over a
  BroadcastChannel. Steps gain a notes field, which stays out of the exported
  scroll page. The presenter boots its own 4 kB entry, never the viewer engine.

- 2026-08-13: **flythrough records the map to a video file**. Arming "Record
  Video" captures the flight from the Cesium canvas and downloads it when the
  flight ends, as MP4 where the browser can write it and WebM otherwise.
  Routing can hand its result to the flythrough as a path with "Fly This
  Route", at a configurable altitude, so a route animation records the same
  way.

- 2026-08-13: **the Timelapse panel plays a PMTiles series**. A source select
  switches the panel between geoplumb layers and a series of PMTiles archives
  added by URL or by file. Each archive takes its step from a date in its name
  (2024, 2024-06, 2024-06-01, anywhere in the basename), editable by hand, and
  the series runs oldest first with unlabelled archives at the end. The step
  slider and play button show one archive at a time, raster or vector, styled
  from the same header probe the layer list uses. The series lasts as long as
  the panel is open.

- 2026-08-13: **symbology exports to SLD 1.0 and Mapbox style JSON, and imports
  Mapbox styles**, next to the existing SLD import. Export is client-side and
  writes the constructs fenestra's importer reads back, so an exported SLD
  round-trips to an equivalent renderer. Mapbox export carries categorized,
  graduated and rule renderers as match, step and case expressions; import
  takes the first layer classified that way and lists what it could not carry
  rather than dropping it silently.

- 2026-08-13: **the split view styles the pane you click, and offers 2D panes**.
  Clicking a pane makes it the active one, framed in violet while the split is
  on, and the map-corner basemap and renderer pickers act on that pane instead
  of always on the viewer. The active pane goes back to the viewer when the
  split closes or the grid shrinks past it, and tools, agent commands and the
  viewer registry still act on pane 0 whichever pane is active. Cesium is
  limited to one pane at a time: its option is closed in every other pane's
  renderer select, in the panel and in the corner control, with no rule behind
  it in the store, so a project file naming two Cesium panes still loads as it
  was saved. A compare pane can also draw with Leaflet, on the raster
  approximation of a vector basemap the way the 2D tab does it, following the
  shared camera by centre and zoom. The viewer pane stays a globe, since the
  tools bound to it assume one, and the agent's layers draw on the globe panes
  only.

- 2026-08-13: **the split view tiles four panes**. The Split View panel now
  picks between two panes across and a 2x2 grid, naming the grid's panes by
  quadrant. The layout is the pane count rather than a field of its own, so a
  saved project carries it already: growing the split appends MapLibre panes
  and shrinking it drops the extra ones, keeping the pane beside the viewer.
  Every pane still picks its own renderer and basemap and follows the one
  shared camera, and tools and agent commands still act on the viewer, which is
  the top left pane. A swipe compare overlays two panes, so it stays two panes
  only and a timelapse takes the split back to two across while it runs.

- 2026-08-12: **each split-view pane picks its own basemap**. Pane state is a
  list of renderer-plus-basemap entries rather than a single right-pane
  renderer, the viewer itself is pane 0 and keeps its state in the app store
  where viewer-scoped tools already read it, and the Split View panel shows a
  renderer and a basemap select per pane. Cameras stay locked and there is
  still no focused-pane concept. A project file saves the pane list, and one
  saved before this keeps whatever panes are loaded instead of restoring an
  empty list. Nothing can grow the list past two panes yet, so the cap of 4
  and the one-Cesium rule wait for the tiled compare view.

- 2026-08-12: **STAC search pages past its first 20 items**. A filtered search
  now offers Load more, replaying the catalog's next link as the STAC API spec
  says: the link's own method, body and headers, with `merge: true` folding the
  link body over the body that produced the page so the filters survive. On a
  same-origin catalog the session bearer is applied after the link's headers,
  so a link cannot displace it.

- 2026-08-12: **the Offline panel says when saved regions starve the cache**.
  Region tiles are pinned and everything else shares the 200 MB budget, so
  regions alone filling it silently stopped browsing tiles from caching. The
  panel now says so in one line, shown only when pinned region size meets or
  exceeds the budget.

- 2026-08-12: **spatial SQL no longer leaves the app origin**. `INSTALL
  spatial` pulled from extensions.duckdb.org on every fresh session. A
  `prebuild` script now probes the pinned DuckDB-wasm for its engine version
  and downloads the spatial extension for each shipped wasm platform into
  `public/duckdb-extensions/` (gitignored, refetched on version bumps), and
  the worker points `custom_extension_repository` at the app origin, falling
  back to the CDN only when the origin copy is missing. The binaries stay out
  of the service worker precache like the DuckDB wasm itself, so a session
  with no network at all still has no spatial SQL, what changed is that no
  external host is needed.

- 2026-08-12: **STAC item filters, and the data-catalog plugin is gone**. The
  STAC Browser panel listed a collection's items and could cut them to the
  current view, and nothing else. Free text and a maximum cloud cover now sit
  next to that checkbox: with either one set the panel leaves the collection's
  item listing and posts to the catalog's search endpoint instead, carrying the
  collection, the text as the free-text extension's `q`, `eo:cloud_cover` under
  the query extension, and the view as `bbox`. With neither set the plain
  listing stays in use, so an ordinary browse still pages through the catalog's
  own next links. A search whose next link is a POST offers no Load more,
  because that link carries a body this client does not replay. The
  data-catalog plugin searched the same catalogs from a shallower panel and is
  deleted, with its README row, its docs card and the plugin counts those
  pages quote.

- 2026-08-12: **a story exports as a scroll-driven page**. The Stories panel
  writes a `story.html` you can open off disk: one card per step down the left,
  a full-bleed MapLibre map behind them, and an IntersectionObserver flying the
  map to a step's camera as that card reaches the middle of the screen. The
  steps, their cameras, the layout and the page's own script are in the file;
  the basemap tiles and the MapLibre bundle come off the network, so a reader
  with no connection gets the cards and no map. Cesium camera heights and
  pitches convert to MapLibre zoom and pitch on the way out, and a reader who
  asked for reduced motion gets jumps instead of flights. As with the standalone
  map export, a local .pmtiles basemap is refused rather than written into a
  page nobody else can load. Layers and drawn features are not included, and
  there is no presenter view.

- 2026-08-12: **Run history across sessions**. geodukt has kept every pipeline
  run it executed, with the manifest, the steps and the caller, and nothing
  outside the session that started it could see them. It is internal to the
  platform stack, so nginx now proxies its runs subtree at `/api/pipeline/runs`
  in both deploy configs, and a Run History panel under Data lists what comes
  back: the project, how the run ended, who ran it, and, per run, each step with
  its outcome and the manifest that executed. Only the runs subtree is exposed;
  `/run` stays inside the network. geodukt itself decides whose runs a token
  sees, so the panel shows a caller its own runs and an admin everyone's, and a
  refused token ends the session like every other platform call. A record
  carries no time, only the order geodukt ran them in, so the list says newest
  first and claims nothing more.

- 2026-08-11: **Travel time panel: service areas and OD matrices**. itinera
  already served both, but nothing in the viewer called them. Picking a centre
  on the map and a list of minutes draws one polygon per band, widest under
  narrowest, from `/api/isochrone`. Picking two point layers builds an
  origin-destination matrix from `/api/network/od-matrix`, which nginx did not
  proxy until now, so it was reaching ptolemy instead of itinera. Both results
  are ordinary layers, so all three renderers draw them, symbology shades them
  by `minutes`, and they save with the project. The matrix also shows as a grid
  in the panel and downloads as a CSV, one row per pair, matching the desire
  lines the layer draws. A pair itinera cannot route is left blank rather than
  filled in, and a band with nothing reachable is reported instead of drawn.

- 2026-08-11: **a .pmtiles file on disk can be the basemap, not just an
  overlay**. The basemap popover takes a local archive through the same reader
  a dropped one already used, so MapLibre styles a vector archive with the
  Protomaps layer set and the app's own glyphs and sprites, and a raster one as
  a single raster source. Nothing copies the archive into IndexedDB, since it
  can be tens of gigabytes and the browser is free to evict it, so a reload
  comes back knowing which file to ask for and shows an empty map until it gets
  one rather than quietly falling back to a hosted basemap. Cesium, Leaflet and
  the minimap cannot read pmtiles at all, so `rasterTiles` returns null for a
  local archive, each of them draws no basemap, and the picker says only
  MapLibre shows it. A project file carries the archive name and asks whoever
  opens it for the file. A live document carries no basemap at all, so a peer
  keeps their own.

- 2026-08-11: **a STAC catalog is browsable down to its assets**. The new STAC
  Browser panel (Data menu) takes a catalog URL, follows its `data` link to the
  collections, opens a collection to a page of items, and lists each item's
  assets with what the viewer can do with them: a GeoJSON asset becomes a map
  layer, a `.pmtiles` asset an OGC layer whose header is read on the spot, a
  `{z}/{x}/{y}` template an XYZ layer, and a COG opens prefilled in Raster
  Analysis, which is the panel that can actually do something with one. Items
  can be cut to the current view, and their footprints go on the map as one
  layer, which is how you see what a collection covers before opening anything.
  A catalog or a single collection can be starred, and the stars persist. The
  platform bearer only goes to a catalog on our own origin: the well-known
  catalogs are third-party servers with no business seeing a session token.

- 2026-08-12: **the plan panel marks a step that runs the agent's own code**.
  geolang sets `runs_caller_code` on every plan step from the tool's own
  declaration, and a true one means approving that step hands over something the
  model wrote rather than a fixed geodukt operation. The step row now carries a
  "runs agent code" badge beside its kind, and the plan gains a line above the
  steps saying what approving it does, alongside the existing "not validated"
  one. A plan from a geolang older than the field is read as ordinary: the panel
  labels, it does not gate, so approve and run are unchanged.

- 2026-08-12: **offline basemaps in Cesium and Leaflet, not just MapLibre**.
  All three renderers now read their raster tiles through one function over the
  IndexedDB tile cache, so a region downloaded in the Offline panel draws in the
  globe, the 2D map and the minimap once the network is gone. Cesium gets a
  `UrlTemplateImageryProvider` subclass that only replaces `requestImage`, and
  Leaflet a `TileLayer` subclass that only replaces `createTile`, so the tiling
  scheme, zoom limits and attribution stay whatever the plain layer made of the
  same options. The key is `z/x/y@template` in every renderer, built in one
  place, with the coordinates in that order whatever order the template writes
  them, so the satellite basemap's `{z}/{y}/{x}` lands on the same entry as the
  rest. A tile fetched from the network is now stored on the way through, which
  makes panning while online fill the cache for later; the Offline panel's
  region download stays the way to pick an area on purpose. Cesium's OSM
  basemap dropped `OpenStreetMapImageryProvider` for the same tile template the
  other renderers use, which is what puts it on the shared cache entry.

- 2026-08-12: **the app shell survives a reload with no network**. Offline used
  to mean "the tab was already open": `public/manifest.json` advertised a PWA
  but nothing registered a worker, and a stale hand-written `public/sw.js` sat
  unregistered in the repo caching tiles and API JSON, which would have fought
  the IndexedDB layer had anyone ever turned it on. It is deleted. vite-plugin-pwa
  now generates `sw.js` at build time, precaching the 24 files `index.html`
  pulls at boot (entry chunks, styles, fonts, and the Cesium runtime the bundle
  binds to as a global), 13.6 MiB. It precaches and nothing else: no runtime
  caching strategies, and the navigation fallback denies every backend prefix,
  so API responses and map tiles stay with `offlineFetch` and the tile cache
  rather than landing in a second cache that disagrees. The duckdb wasm, the
  basemap assets and Cesium's lazily-loaded Assets and Workers stay on the
  network. `manifest.json` is deliberately not precached, because
  `offline/network.ts` pings it to tell online from offline and a cached answer
  would always say online. A new build does not take over silently: the tab
  polls hourly and whenever it comes back into view, then offers a Reload
  notice, and only skips the waiting worker when that is clicked, so a
  lazily-imported chunk cannot vanish under a session in progress. Dev
  unregisters any worker instead of installing one, so a production build on
  the same host cannot serve stale chunks over the dev server.

- 2026-08-12: **SLD files import as symbology**. The symbology editor takes a
  `.sld` or `.xml` file per layer, posts it to fenestra's `/sld/symbology`
  (reached same-origin through the `/ogc/` proxy, with the platform bearer),
  and applies the returned renderer through `setSymbology` like any other. A
  symbology carries colour and nothing else, so the endpoint reports what it
  could not carry, and the editor lists every entry under the button rather
  than dropping it: labels, stroke width, scale ranges, filters no symbology
  rule can express. A file whose rules classify nothing by a property is a
  normal answer, not an error, and says so while the layer keeps its colour.
  fenestra converts the first NamedLayer and UserStyle in the document and
  reports the rest as unsupported, so the viewer needs no picker for them.
  A rejected document shows fenestra's own reason.

- 2026-08-11: **a dead session ends instead of erroring**. Platform sessions
  last 24 hours, and one that expired while a tab stayed open surfaced whichever
  service refused first, so agora's "invalid or expired token" reached a live
  dialog as if the feature were broken. A token past its `exp` now ends the
  session in `getAuthToken` before it reaches the wire, which is the only thing
  that covers the websockets, since a browser cannot read the status behind a
  refused upgrade. A 401 on a request that carried the bearer ends it too,
  catching what a slow client clock hides. Both sign the user out with one
  "Session expired" notice. An API key holder is untouched, since a wrong or
  revoked key is not a finished session, and an anonymous read has none to lose.

- 2026-08-11: **The tool that wrote a layer can say what to shade it by**. A
  ui_spec layer entry takes an optional fourth part, `shade_by`, naming one
  column in that file: `Gaps|outputs/gaps.gpkg|#ff6b35|gap_score`. The viewer
  picks the renderer from the data rather than being told, so a numeric column
  gets graduated classes and a text one gets a colour per value, and it reuses
  the same builders the symbology editor calls. A column the file does not
  carry, or one with nothing to separate, leaves the layer in its single
  colour. The suggestion is ordinary symbology once applied, so the editor
  changes or clears it like any other. geolang's `emit_ui_spec` rejects a
  fourth part that is not a column name instead of dropping it silently, and
  `service_gap` now tells the model to shade its cells by `gap_score`.

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

- 2026-08-13: **the verticals doc credited panoptes with work it does not do**.
  It was named for observation management and time-series storage under
  environmental monitoring, and for soil moisture and weather station monitoring
  under agriculture. panoptes does neither: it extracts features from imagery
  through tile IO, ONNX segmentation, polygonization and pixel-difference change
  detection, and ships no trained weights. Both verticals now name it for that
  and credit collecta for observation forms and storage, fluvius for the sensor
  feeds. The status table's panoptes test count is 44, not 45.

- 2026-08-13: **agent layers draw on leaflet compare panes**. The leaflet
  agent-layer hook keyed its effects on the 2D tab, a proxy for "the map was
  rebuilt", so it never saw a pane map appear. useLeaflet now renders its
  caller again when the map instance changes and the hook keys on the instance,
  so layers appear when a pane switches to leaflet and come off with the pane's
  map, with visibility, opacity, zoom range and symbology behaving as on the 2D
  tab.

- 2026-08-12: **docs page claimed 15 QGIS ports**. The QGIS Plugin Equivalents
  section shows 11 cards, and the stat beside it now says 11.

- 2026-08-12: **the standalone map export drew no basemap**. Its raster style
  carried the app's `cached://` tile URLs, which resolve only through the
  offline cache protocol the app registers at startup, so the exported page had
  nothing to load tiles from. Both standalone exports now write the plain XYZ
  URL.

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

- 2026-08-12: **run history says when a run happened**. geodukt records now
  carry a start and a finish time, so the Run History panel no longer has to
  present the id it hands out as the only thing it knows about ordering. Each
  run shows when it started, in the reader's own locale, and how long it took,
  down to milliseconds for the quick ones and minutes and seconds for the slow
  ones. The list is ordered newest first by finish time. Both times are optional
  on the client, because the viewer can be pointed at a geodukt too old to send
  them: a listing where any record is missing them falls back to the id order,
  which is the order that geodukt ran them in, and a run missing them shows no
  timing line rather than an empty one.

- 2026-08-12: **the offline tile cache has a ceiling**. Every tile ever viewed
  was kept forever, and the only deletion was a saved region's own delete. The
  tiles a saved region covers are still exactly that, pinned, and nothing but
  deleting the region drops them. Everything panning the map left behind now
  sits under a 200MB ceiling on the store: crossing it evicts unpinned tiles
  oldest first until the total is back under, and stops there even if only
  pinned tiles are left. Pinned-ness is derived from the saved regions store
  rather than a flag per tile, so tiles already on disk are covered without a
  schema migration, and the tile count and size a region's badges report cannot
  start lying. The Offline panel reports how much of the cache is browsing tiles and
  clears them behind an inline confirm, saved regions untouched. Writes carry a
  running byte total instead of scanning the store, seeded from it on the first
  write and re-read from the scan every eviction pass, so a total another tab
  has drifted comes back in line at the next pass.

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
