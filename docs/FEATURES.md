# ViewTopia feature status

What ViewTopia does today, what only works locally or with a configured
service, and what is not built. [README.md](../README.md) has the full feature
list. Add a feature here only with a reachable source path or a test that
exercises it.

## Implemented

- Cesium, MapLibre and Leaflet viewer paths. deck.gl draws into MapLibre through
  `@deck.gl/maplibre` and is not a renderer you can pick.
- Local raster tools, geometry tools, overlays, imports, and exports.
- DuckDB-WASM spatial SQL from notebook cells, the SQL workspace tab, and the
  `sql_query` viewer command.
- Entity creation, CSV ingest, track playback, and manual Space-Time links.
- The Space-Time cube: a pitched camera where height is time, a sweep plane at
  the playhead, ground shadows, and a trailing time window over the tracks.
- Eight Space-Time analyses run from the Analysis tab in a worker, each drawing
  its result on the map: colocation, co-travel, geofence crossings,
  pattern-of-life, network metrics, behavioral clustering, predictive location,
  and data quality.
- 58 typed viewer actions the agent runs through one `viewer_control` run
  command, with the action catalogue and a snapshot of the current map sent to
  the model on every chat message. Chat replies render as Markdown. A chat-only
  mode (`?mode=chat`) leaves the chat as the only control. Every action taking a
  URL refuses anything but an absolute `http` or `https` one.
- Dropped GeoJSON, JSON, GeoPackage, zip and CSV files are also uploaded to the
  agent when the user is signed in.
- Build-time plugin discovery with 20 built-in plugins, and runtime install
  from a registry document whose bundles are checked against a mandatory
  sha-256.
- Portal item requests with an API path and local fallback.
- Dashboard widgets stored against the active project in Ptolemy.
- STAC catalog search and asset layers, browser-side format conversion to
  GeoParquet, FlatGeobuf, PMTiles and GeoJSON, print layout with atlas export,
  collecta field-data publishing into a Ptolemy dataset, interiora indoor
  venues, and geodukt pipeline run history.
- IndexedDB stores, an offline operation queue, and offline basemap areas.
- Live maps on agora: shared layers, peer cursors, camera-follow, undo of your
  own edits, comment threads with mentions, sensor feeds and asset rules.
- Region watches: agora reduces a drawn region over a geoplumb layer on a
  schedule, notifies on a threshold crossing, and posts a webhook.
- Workspace and project names, descriptions, memberships, owner/editor/viewer
  roles, and expiring invitation records stored by Ptolemy.
- Authenticated `/api/v1` reads and mutations for workspace and project
  metadata. This metadata and invitation records are not written to IndexedDB.
- Workspace creation for any signed-in user, inherited workspace access,
  project creation by workspace editors, direct project membership, and the
  highest effective role returned by the server.
- Server-enforced owner, editor, and viewer permissions. Owners manage direct
  members, pending invite links, and deletion. Editors update metadata. Viewers
  read and switch only.
- Seven-day invite links that store only token hashes server-side and grant
  editor or viewer access. When ptolemy has SMTP configured the invite dialog
  can email the link, otherwise the owner copies it. Owners add known users by
  JWT subject, there is no user directory.

## Partial or local-only

- Project roles reach a Ptolemy dataset only once it is attached to the
  project, from the project's datasets dialog. They never reach Agora document
  members.
- Only Dataset Editor feature property and geometry edits go through the
  offline operation queue. No other resource is queued.
- The Geofences panel creates and lists fences, and the Geofence Crossings
  analysis reads them. A polygon fence is stored with no vertices, so only a
  circle fence matches a point, and no renderer draws a fence.
- Vertical plugins read configured service datasets or demo data. They do not
  provide those datasets.
- Viewshed, flood, routing, travel time, and some terrain tools depend on the
  corresponding remote service.
- Notebooks live in this browser's IndexedDB and are not tied to a project.

## Not implemented

- Space-Time classification, RBAC, ontology, CDR import, entity resolution,
  and case management. Entity resolution has no algorithm and no button. The
  rest have library code or types but no reachable UI.
- Returning DuckDB result rows to the agent for follow-up reasoning. A query
  publishes a summary to a window event and a global ring buffer, which is
  read by the UI, not sent back to the model as a turn.
- Notebook JavaScript and map-action cells. Nothing calls the notebook store's
  `setRuntime`, so both answer "No runtime available". Nothing records map
  operations into a map-action cell, and the animated `replayNotebook` has no
  caller. SQL, Python and Markdown cells work.

## Source of truth

[README.md](../README.md) for the user-facing feature list,
[DESIGN.md](../DESIGN.md) for current architecture, and
[DESIGN_TODO.md](../DESIGN_TODO.md) for verified open gaps.
