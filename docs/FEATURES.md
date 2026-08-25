# GeoLang platform feature status

This file replaces the old feature catalogue. The old catalogue described
planned and local-only behavior as shipped behavior.

The workspace audit on 2026-08-22 covered 26 repositories. It checked each
repository README, `docs/index.html` when present, other Markdown documents,
and the source paths named by those documents.

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
- Build-time plugin discovery with 20 built-in plugins.
- Portal item requests with an API path and local fallback.
- Dashboard widgets stored in localStorage.
- IndexedDB stores, an offline operation queue, and Agora collaboration.
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

- Per-project map snapshots and overlay files remain browser-local. Project
  roles are not yet propagated to Ptolemy dataset grants or Agora document
  members.
- Dashboard save and load use localStorage. There is no dashboard API store.
- The conflict merge code supports a narrow operation shape. The resolver is
  not mounted, and the platform sync path does not queue the feature operations
  it expects.
- Vertical plugins read configured service datasets or demo data. They do not
  provide those datasets.
- LiveKit voice and video require a configured URL and a token.
- Viewshed, flood, routing, travel time, and some terrain tools depend on the
  corresponding remote service.

## Not implemented in ViewTopia

- Space-Time classification, RBAC, ontology, CDR import, entity resolution,
  geofencing UI, and case management. Entity resolution has no algorithm and no
  button; the rest have library code or types but no reachable UI.
- Returning DuckDB result rows to the agent for follow-up reasoning.
- A standalone SQL workbench panel. The notebook and agent SQL paths are
  implemented.

## Source of truth

Use [README.md](../README.md) for the user-facing feature list,
[DESIGN.md](../DESIGN.md) for current architecture, and
[DESIGN_TODO.md](../DESIGN_TODO.md) for verified open gaps. Do not add a feature
to this file without a reachable source path or a test that exercises it.
