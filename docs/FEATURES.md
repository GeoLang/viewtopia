# GeoLang platform feature status

This file replaces the old feature catalogue. The old catalogue described
planned and local-only behavior as shipped behavior.

The lists below were last checked against the source on 2026-09-02, one agent
per repository over each README, `docs/index.html` when present, the other
Markdown documents, and the source paths those documents name.

## ViewTopia implemented paths

- Cesium, MapLibre, deck.gl, and Leaflet viewer paths.
- Local raster tools, geometry tools, overlays, imports, and exports.
- DuckDB-WASM spatial queries from notebooks and the `sql_query` viewer command.
- Entity creation, CSV ingest, track playback, and manual Space-Time links.
- The Space-Time cube: a pitched camera where height is time, a sweep plane at
  the playhead, ground shadows, and a trailing time window over the tracks.
- Seven Space-Time analyses run from the Analysis tab in a worker, each drawing
  its result on the map: colocation, co-travel, pattern-of-life, network
  metrics, behavioral clustering, predictive location, and data quality.
- Fifty-five typed viewer actions the agent runs through one `viewer_control`
  run command, with the action catalogue and a snapshot of the current map sent
  to the model on every chat message, and a chat-only mode (`?mode=chat`) that
  leaves the chat as the only control. Every action taking a URL refuses
  anything but an absolute `http` or `https` one.
- Build-time plugin discovery with 20 built-in plugins, and runtime install
  from a registry document whose bundles are checked against a mandatory
  sha-256.
- Portal item requests with an API path and local fallback.
- Dashboard widgets stored against the active project in Ptolemy.
- STAC catalog search and asset layers, browser-side format conversion to
  GeoParquet, FlatGeobuf, PMTiles and GeoJSON, print layout with atlas export,
  collecta field-data publishing into a Ptolemy dataset, interiora indoor
  venues, and geodukt pipeline run history.
- IndexedDB stores, an offline operation queue, and Agora collaboration.
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
  editor or viewer access. There is no email delivery or user directory. Owners
  add known users by JWT subject.

## ViewTopia partial or local-only paths

- Project roles are not yet propagated to Ptolemy dataset grants or Agora
  document members.
- Only Dataset Editor feature property and geometry edits go through the
  offline operation queue. No other resource is queued.
- The Geofences panel creates and lists circle fences. Nothing evaluates a
  crossing and no renderer draws a fence.
- Vertical plugins read configured service datasets or demo data. They do not
  provide those datasets.
- Viewshed, flood, routing, travel time, and some terrain tools depend on the
  corresponding remote service.

## Not implemented in ViewTopia

- Space-Time classification, RBAC, ontology, CDR import, entity resolution,
  and case management. Entity resolution has no algorithm and no button; the
  rest have library code or types but no reachable UI.
- Returning DuckDB result rows to the agent for follow-up reasoning. A query
  publishes a summary to a window event and a global ring buffer, which is
  read by the UI, not sent back to the model as a turn.

## Source of truth

Use [README.md](../README.md) for the user-facing feature list,
[DESIGN.md](../DESIGN.md) for current architecture, and
[DESIGN_TODO.md](../DESIGN_TODO.md) for verified open gaps. Do not add a feature
to this file without a reachable source path or a test that exercises it.
