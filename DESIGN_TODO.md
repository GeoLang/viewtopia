# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
> **Open work is up top; completed phases are condensed at the bottom.**
> Last brought current: **2026-07-25**.

---

## OPEN — auth follow-ups (queued after basemap lands, both security-role)

- [x] **tiletopia `/v1/` anonymous writes closed (2026-07-25).** Blanket `/v1/` exemption
      removed; `POST /v1/assets` now needs editor, `POST /v1/tokens` needs admin, tile-data
      GETs stay anonymous. ion routes split into read (anonymous) / write (role-layered) so a
      future `/v1/` route defaults protected. 5 new tests.
- [x] **ptolemy anonymous config reads gated (2026-07-25).** `classify()` now returns Admin
      for any method on `/permissions`, `/webhooks`, `/orgs`, `/audit` (moved above the
      GET→Public rule); map data reads stay public. Platform e2e 18/18 with it in. 6 new tests.

## OPEN — security follow-ups (surfaced by the fixes above, lower severity)

- [x] **ptolemy `GET /metrics` gated (2026-07-25).** Gated in both places, not just the proxy
      as first planned: platform nginx never proxied `/metrics` (the SPA fallback answered it),
      and compose publishes ptolemy's 3000 to the host, so a proxy allowlist alone left the
      endpoint open. nginx now returns 404 on `= /metrics` with a commented scraper allowlist,
      and `classify()` returns Admin for `/metrics`. Labels turned out narrower than described
      here: `normalize_path` collapses UUIDs to `{id}` and `record_domain_event` has no callers,
      so what leaked was traffic shape plus non-UUID path segments (topology names, room ids).
      ptolemy's own dev compose scrapes `/metrics`; `deploy/prometheus.yml` documents the bearer
      token it now needs. 2 new tests.
- [ ] **ptolemy anonymous reads still open on** `GET .../events` (webhook delivery history)
      and `/replication/feed/{branch}` (streams branch change data). Decide whether either is
      sensitive enough to gate.
- [x] **tiletopia native asset writes editor-gated (2026-07-25, dd9ba8e).** POST/DELETE
      assets, start-tiling, and the 3 streaming-upload routes moved to an editor-layered
      router (same mechanism as the Ion split); reads unchanged. 6 new tests (anonymous
      401 / viewer 403 / editor ok), 567 pass, clippy+fmt clean. Deliberately left
      any-JWT: asset annotations (viewer commenting). Follow-ups worth a decision:
      streaming upload has no per-asset ownership check (any editor can chunk-write into
      any asset's input dir), and `upload/init` ignores its path `{id}` and mints its own.

- [x] **tiletopia user role management (done 2026-07-25).** Admin-only
      `PUT /api/v1/admin/users/{id}/role` behind require_admin, plus `tiletopia set-role`
      CLI to bootstrap the first admin offline. `update_me` can't change role (no
      self-escalation), `signup` still viewer-only by design. Also fixed the two `users.rs`
      security-debt items in the same pass: deleted the hardcoded dev jwt fallback, moved
      passwords to argon2id with constant-time verify and transparent rehash-on-login of old
      hashes. 338 tests pass.
- [x] **service tokens: NOT NEEDED (verified 2026-07-25).** Premise was wrong. Neither
      geolang nor fenestra writes to ptolemy — every call is a GET (geolang
      `ptolemy_query.py`, fenestra `source.rs`), and ptolemy reads are public, so nothing
      401s. The agent NL→map *write* path does not exist in code (the e2e step is
      intentionally omitted, not skipped). No change made. If an agent-writes-to-ptolemy
      feature is ever built, add self-signed editor tokens then.
- [ ] ptolemy audit-trail fields (`granted_by`, `created_by`, `author`) come from the request
      body, not `claims.sub`; DB-backed `dataset_permissions`/`branch_permissions` tables exist
      but nothing enforces them (only the coarse JWT role gates writes). Both small follow-ups
      now that claims are in request extensions.

- [ ] **DECIDE: ptolemy auth is fail-open.** RESOLVED 2026-07-25 — required the secret to
      serve (fail-closed startup), unified on one platform JWT, role-gated writes. Pending
      verifier CONFIRM before commit. Keeping this line until committed.
- [ ] **ptolemy cql2 minor gaps** (from the same audit, all non-exploitable): malformed
      GeoJSON coordinate arrays still 500 via PostGIS parse errors; `limit`/`offset` are
      unvalidated (negative → 500, no upper bound); `in` doesn't accept the CQL2 spec's
      array form `args: [prop, [a, b]]`; `filter_lang` is accepted but ignored (cql2-text
      parses as JSON and 400s).
- [ ] **ptolemy `resolve_conflicts` resolves but never merges**: it commits resolution ops
      onto the *source* branch (`merge_id`) and creates no merge commit on the target.
      Existing behavior, pinned by tests; decide if the endpoint should finalize merges
      (the newer `/branches/{t}/merge/{s}/resolve` route does this properly).
- [ ] **collecta forms `?since` cursor** uses strict `>` on microsecond `updated_at`; two
      forms written in the same microsecond straddling the cursor could skip one. Switch to
      `(updated_at, rowid)` if it matters at scale.

## DONE — qgis + cql2 correctness/security (2026-07-25, pushed)

- [x] **ptolemy qgis endpoints queried nonexistent columns** (`fv.branch_id`,
      `fv.is_deleted`) — `qgis_pull`, `layer_definition`, and `qgis_push`'s existence
      check all 500'd on every call. Rewritten against the fork-aware `features` view
      (pull keeps an inline ancestor-chain CTE for its id tiebreaker). 5 new integration
      tests incl. branch-scoping and delete semantics.
- [x] **ptolemy cql2 parameterized.** Filter-to-SQL now emits bind parameters for property
      names, literals, and GeoJSON (no request bytes reach SQL); spatial ops validate
      GeoJSON structure, honor `args[0]`, and strip `crs`; short arg arrays 400 instead of
      panicking the handler. 7 new tests incl. injection probes.

## DONE — Phase 2 correctness follow-ups (2026-07-25, pushed)

- [x] **ptolemy `conflicts.rs` (ResolutionStrategy::Theirs) cross-branch leak.** Theirs now
      resolves the target ('main' of the dataset, as `list_conflicts` does) and reads the
      version from the target head's recursive ancestor chain (`resolve_target_head`
      helper); NotFound instead of unscoped fallback; a target-side `delete` now yields
      `DiffOp::Delete`. Regression tests prove the old code fails them.
- [x] **ptolemy-api untied latest-version queries.** `fv.id DESC` (or `id ASC` for the one
      earliest-pick) appended across conflicts/grpc/vector_search/analytics/ogc/
      geoprocessing/qgis (16 queries).
- [x] **ptolemy cql2 mixed-type 500.** Numeric comparisons and `between` use a guarded
      `CASE WHEN <numeric-regex> THEN ::numeric END` cast: non-numeric text drops out,
      JSON numbers and numeric strings still match. Regression test covers `>`/`<`/between.

## OPEN — platform hygiene

- [x] **basemaps consistent across renderers (2026-07-25).** MapLibre keeps the OpenFreeMap
      vector styles (Liberty/Bright/Positron) + self-hosted pmtiles; Cesium and deck.gl can't
      render vector styles, so each vector pick resolves to its closest Carto raster
      (`VECTOR_APPROX_RASTER`) so all three look approximately the same globally. Also fixed
      the platform-e2e CI failure: fail-closed services need `PLATFORM_JWT_SECRET`, now set as
      a throwaway job env in the workflow.
- [x] **MapLibre globe projection (2026-07-25).** The MapLibre renderer (3D Globe tab only)
      now projects its vector/raster basemap onto a globe via `setProjection({type:'globe'})`,
      re-applied on `style.load` so basemap swaps keep it. Gives a true 3D vector globe (OSM
      buildings via the OpenFreeMap style) as a Cesium-free option. maplibre-gl 5.24 already
      installed; no dep change.
- [x] **viewtopia dependency vulns resolved 2026-07-25** — dompurify 3.4.12, protobufjs
      8.7.1, vite 6.4.3, all within existing ranges; alerts draining as dependabot rescans.
- [x] **Renovate app installed on the org 2026-07-25** (Renovate Only, scan-and-alert,
      silent mode off, all repos). Update PRs follow the shared schedule (Mon before 06:00).
- [x] **itinera data/ permissions fixed 2026-07-25.** Root cause: `USER itinera` in the
      Dockerfile disabled the entrypoint's root branch, so the privilege-drop never ran.
      Entrypoint now drops to the owner of `/data` (host user for bind mounts, itinera for
      named volumes); `user:` override and CI graph workaround removed.
- [x] **geolang embedded Postgres was already persistent** — the `geolang-pgdata` volume
      mount at the image's PGDATA landed earlier; verified force-recreate skips initdb and
      keeps Letta agent state. (Boot logs show a harmless ~300ms crash-recovery because
      postgres never gets a clean shutdown signal; see open note below.)
- [x] **nginx config now reload-safe 2026-07-25**: single-file mount replaced by a stub
      include + `deploy/` directory mount; `nginx -s reload` picks up edits.
- [x] **"network not found" on `up` root-caused 2026-07-25**: stopped containers from
      renamed projects hold refs to deleted networks. `platform-up.sh` and CI now `down
      --remove-orphans` first; README troubleshooting updated.
- [ ] geolang `startup.sh` runs postgres as a background child of PID 1, so `docker stop`
      never delivers a clean shutdown (harmless auto-recovery each boot). Fix = signal
      handling in the startup chain. (Entrypoint shadowing fixed 2026-07-25, `544fffc`.)
- [ ] **geolang rebuilds the tool-exec venv on every start (~44s).** The
      `env/.populated` marker vanishes between starts (root cause unopened; Letta's own
      pip-upgrade path touches `bin/`/`share/` but its rmtree shouldn't run). DECIDE: replace
      the marker with a real state check (import-probe a requirements package) or drop the
      entrypoint population and let Letta own the venv (contradicts the comment explaining
      why it exists).
- [ ] **geolang-api may mint a fresh Letta agent per process start** — `/agent/health`
      returned a different `agent_id` after a recreate, suggesting agents accumulate in the
      DB across restarts. Investigate `geolang/src/` agent bootstrap: reuse-by-name before
      create.
- [ ] geokode has a `fuzzy` module (Levenshtein/Soundex) `forward()` doesn't use — wire a
      fuzzy fallback for typo tolerance.

## DONE — legacy chat channel retired (2026-07-25, pushed)

- [x] **AG-UI is the only agent channel now.** geolang: deleted `POST /chat/stream` +
      the legacy SSE renderer (c9393dc); the built-in static demo page migrated to
      `/chat/agui`; docs (api_reference/architecture/viewer_integration) updated to the
      AG-UI event vocabulary. viewtopia: deleted the legacy fetch/parse branch in useSSE
      and the `useAgUiChannel` setting + toggle (a16f382). Verified live: `/agent/chat/stream`
      404s, "fly to rome" works end to end. Still internal (kept): the `__UI_SPEC__:`/
      `__VIEWER_CMD__:` tool-return markers feeding the shared event generator — retiring
      those means redesigning the Letta tool→server signal, separate task if ever.

## DONE — chat replay for viewer commands + multi-renderer markers (2026-07-25, pushed)

- [x] **Clicking an old chat reply now replays its viewer commands.** Replay only covered
      `ui_spec` map results; `fly_to`-style commands were executed live but never stored.
      Both channels now keep each reply's `viewerCmds` on the message and a click re-runs
      them (then re-renders the mapSpec). Browser-verified: Tokyo → click "Flown to
      Monaco." → camera returns.
- [x] **add_marker/clear_entities work on every renderer.** Markers moved into the
      agent-layer store; Cesium/MapLibre/deck.gl hooks each draw them (dot + label), so
      they survive renderer switches like ui_spec layers. Root-caused missing MapLibre
      markers to `maplibre-gl.css` never being imported (markers/controls are DOM overlays);
      importing it also fixed the unstyled zoom/attribution controls. Browser-verified on
      all three renderers.
- [x] **add_geojson/sql_query render on every renderer (2026-07-25).** Both now append an
      agent layer to the store (any GeoJSON root normalized to a FeatureCollection);
      sql_query's `fit:false` skips the reframe. `renderGeoJson` stays for the Cesium
      analysis tool panels that track/remove their data sources. Browser-verified: agent
      add_geojson polygon renders on the MapLibre globe. `load_tileset`/`screenshot`
      remain inherently Cesium.

## DONE — AG-UI agent channel + panel close fix (2026-07-25)

- [x] **AG-UI agent channel (behind a flag).** geolang serves `POST /chat/agui` next to the
      legacy `/chat/stream` (shared event generator; `ag-ui-protocol` installed into the base
      image's uv venv via the Dockerfile). viewtopia routes through `@ag-ui/client` `HttpAgent`
      when `settings.useAgUiChannel` is on (default off), mapping AG-UI events to the existing
      handlers. Standard events (text/lifecycle) for the chat, Custom events for viewer_cmd +
      ui_spec. Verified end to end: client hit `/chat/agui`, agent "fly to Monaco" streamed
      RUN_STARTED→TEXT→CUSTOM(viewer_cmd fly_to)→RUN_FINISHED and rendered. Legacy untouched.
      Follow-up: the `__UI_SPEC__:`/`__VIEWER_CMD__:` Letta tool-return markers still feed the
      generator (internal); AG-UI didn't replace those, clean up later. Prior chat turns aren't
      sent yet (latest prompt only). Flip default + delete legacy after real-world use.
- [x] **Panel close fix.** Escape closes any open tool panel (`ToolPanels.tsx`), and the
      Settings panel z-index (500) now clears the nav toggle (400) so its close X is clickable.
      Fixes the "can't close Settings" report. Also fixed the settings-panel black screen
      (persist deep-merge backfills settings keys from older builds).

## DONE — data story: one-command regional bring-up (2026-07-25)

- [x] `platform-up.sh <pbf-url>` now re-derives everything for any region: a `data/.region-url`
      marker detects a change, re-fetches the pbf, invalidates `graph.bin` (itinera rebuilds),
      recreates geokode to re-ingest, and polls geokode/itinera health directly (metro graph
      builds take minutes). Same URL skips all rebuilds.
- [x] `seed-parcels.mjs` anchors the demo on the region (pbf header bbox → geokode `/reverse`
      to snap onto a real address, Monaco fallback), and on a region change wipes the demo
      datasets' branch first (scoped, versioned delete) so parcels don't linger offshore.
      Verified end to end on Washington DC and Monaco; Monaco e2e still 18/18.
- [ ] follow-up: demo property labels are still Monaco-flavored ("Grimaldi Holdings" etc.), so
      on another region the coordinates are right but street/owner names read as Monaco.
      Genericize the labels if the demo should look native per region.

## OPEN — trust & adoption

- [x] **"Your data is just PostGIS" docs section (2026-07-25).** ptolemy README gets a
      section under Data Model (verified against migration 020 + 001: `feature_versions`
      PostGIS geometry + JSONB properties, GIST index, `features` view; plain-SQL example,
      GDAL/QGIS/pg_dump story); platform.html stack section links to it.
- [ ] **Read-only entry point: viewtopia over an existing PostGIS.** SCOPED 2026-07-25,
      build later. Shape: ptolemy "external dataset" mode, not a separate adapter service,
      so the whole existing read stack (API, parameterized CQL2, OGC) is reused. Sketch:
      nullable `datasets.external_table` (+ geometry column name, srid); storage read path
      scans that relation directly instead of the changeset chain; every write/branch/merge
      route rejects for external datasets; recommend connecting with a read-only postgres
      role so safety doesn't depend on app guards. Zero viewtopia changes — the viewer
      already talks to ptolemy. First touch for a skeptical team: point ptolemy at their
      DB read-only, browse in viewtopia.

## DONE — Letta upgrade compatibility (resolved 2026-07-25, no test needed)

- [x] **Verdict: stay pinned; there is nothing to upgrade to.** Server 0.16.8 (2026-05-14)
      is still the latest release on GitHub/PyPI/Docker Hub as of 2026-07-25; the OSS
      server line looks frozen post-"Letta Code" pivot (self-hosting docs now marked
      legacy/unsupported). License unchanged Apache-2.0 at 0.16.8 and main. Client: pin
      `letta_client==1.7.12` stays — 1.8–1.12 additions target cloud endpoints our server
      lacks (and 1.8.0 removed isolated conversation blocks). Security: CVE-2026-4965
      (eval injection in `resolve_type`, listed vs 0.16.4) — verified our vendored
      `letta/functions/ast_parsers.py` has the allowlist + eval-behind-flag hardening;
      0.16.8 also swapped pickle→JSON for sandbox transport. Watch item: upstream `main`
      has unreleased commits (through 2026-07-22); if a 0.16.9+ ever ships, re-run this
      check. Strategic note: plan around a frozen upstream (vendored fork is ours to
      maintain), not around upgrades.

## OPEN — post-v1: replace embedded Letta (decided 2026-07-25)

- [ ] **Replace the embedded Letta server with a thin in-house agent loop behind
      `agent_event_stream`.** Decision rationale: upstream's self-hosted line is
      deprecated and release-frozen (functionality moving to their closed SaaS; no
      security response), so long term we'd be sole maintainers of a large fork we
      barely use. GeoLang needs only: an LLM call loop with tool dispatch, conversation
      history, a couple of memory blocks, and an event stream — small code against our
      own Postgres, direct provider calls (xAI/OpenAI-compatible). The seam is already
      cut: `agent_event_stream` in geolang/src/api/server.py is the only place Letta
      shapes exist, and the viewer speaks vendor-neutral AG-UI. Keep the existing tool
      functions as-is. Also retires in one move: the ~2min embedded-server boot, the
      ~44s tool-venv rebuild, the agent-accumulation-per-restart bug, and the
      eval/pickle-class attack surface. Do after MVP proves the golden path; until
      then stay on vendored 0.16.8.

## OPEN — Phase 3 (mobile & ML breadth, after v1)

- [ ] **terravista v0.2** — HTTP tile fetch + MVT decode (the SDK can't fetch/draw tiles yet).
- [ ] **terravista v0.3** — Metal/Vulkan GPU rendering. Biggest advertised-vs-real gap; needs
      platform GPU toolchains.
- [ ] **panoptes model weights** — train or source one usable segmentation model and publish
      weights, or keep the repo clearly labeled experimental. Inference path itself is real.
- [ ] **collecta media attachments** — photo/document capture + sync (deferred from Phase 2).
- [ ] **viewtopia FleetPanel** — currently an honest "no live feed" state; nothing serves
      vehicle positions. Decide whether real-time fleet tracking is in scope before building
      a WS/ingest path for it.
- [ ] Preview-gated panels (18) — implement on demand, otherwise leave gated. Cheap wins if
      wanted: several reuse existing helpers.

## OPEN — deferred design decisions (not bugs)

- [ ] ptolemy merge is **feature-level** (edits to different attributes of one feature
      conflict). Attribute-level auto-merge would be a conflict-detection redesign; behavior
      is currently pinned by a test. Decide if it's worth it.
- [ ] ptolemy re-merge of an already-merged branch creates a redundant merge changeset each
      time (merge commits record only one parent, so the base never advances). "Already up to
      date" detection needs second-parent bookkeeping.
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.

---

## DONE — Phase 2: harden the backbone (2026-07-17, verifier-confirmed)

- [x] **ptolemy write/merge hardening.** Fixed a partial-update cross-branch leak in
      `commit()` and a nondeterministic latest-version tie on same-tx `created_at` (added
      `fv.id DESC` to 16 storage queries). Migration 020 makes the `features` view walk
      `changesets.parent_id` recursively so forked branches see inherited data (was
      fork-blind → served partial data to sfcgal/cql2/h3). `find_merge_base` depth-ordered.
      Bonus: cql2 numeric comparison `::numeric` cast (was 500ing text-vs-int). +12
      conflict-depth tests. (Test DB container `ptolemy-test-db` on port 5433, NOT the
      platform db on 5432.)
- [x] **collecta auth + sync.** HS256 JWT (claims sub/exp/role, 24h) mirroring tiletopia;
      argon2id hashing (diverges from tiletopia's HMAC — chose a work factor); admin-only
      `create-user` CLI seed (stdin pw), no signup endpoint; all data routes behind the JWT
      layer, only `/health` + `/auth/login` public; `COLLECTA_JWT_SECRET` mandatory ≥32 bytes
      (server refuses to start without it). Sync `push` idempotent on submission UUID
      (first-write-wins), `forms?since` cursor. Picked jsonwebtoken 9 (10 pulls rsa 0.9 /
      RUSTSEC-2023-0071, fails cargo-deny).
- [x] **fenestra WCS.** Real routed `/wcs` 2.0.1 (GetCapabilities/DescribeCoverage/
      GetCoverage) over a `COVERAGE_DIR` of GeoTIFFs via terrano-core; subset parsing, OWS
      exception XML, spec-compliant Lat-first EPSG:4326 envelopes. Limits: single-band f64,
      no reprojection/scaling. (The earlier route-or-delete pass had deleted the skeletal
      module; reversed on request and built for real.)

## DONE — Phase 1: finish v1 surface (2026-07-17, verifier-confirmed)

- [x] Vertical panels (sensor/coverage/construction/field/incident) wired to ptolemy
      `/api/v1/*`; delivery → itinera `/api/delivery/optimize`; geocode parse fixed.
      FleetPanel → honest "no live feed" (nothing serves vehicle positions). Added ptolemy
      `GET /construction/surveys` + milestone `planned_pct`.
- [x] Implemented 4 stub panels for real: terrain profile, data table, charts, timeline
      (reuse elevation lib / dashboard chart / Cesium clock). Row-click NDVI detail wired.
- [x] Gated 18 experimental stub panels behind a persisted "Show Preview Tools" setting with
      Preview badges — no dead buttons in the default UI.
- [x] E2E: un-skipped `analysis-smoke` (tiletopia analysis endpoints), made the jupyter
      python-cell step a hard requirement. Platform suite now **18/18, zero skips**.
- [x] Docs site test counts recomputed; collecta/terravista cards de-oversold; README
      one-command quickstart.

## DONE — Phase 0b: collapse ViewTopia to one stack (2026-06-20)

- [x] Decision: React is canonical. Ported P0 (agent→map commands), P1 (feature-picker,
      geojson-editor, style-editor), P2 (theme-toggle, auth, portal, dashboards), each gated
      by a smoke test.
- [x] Cutover: `index.html` loads `main.tsx`; single `vite.config.js` → `dist/`; deleted all
      115 vanilla `.js` files + `index-react.html` + the second Vite config + vanilla unit
      tests. NL→map verified end-to-end ("Fly to Monaco" → `viewer_cmd fly_to` through nginx).

## DONE — Phase 0: prove & lock the golden path (2026-06-19)

- [x] Brought up `docker-compose.platform.yml` for real (no stubs). Fixed the critical
      same-origin nginx proxy bug (variable `proxy_pass` dropped URI suffix + query string;
      added per-location `rewrite … break`). Reconciled geolang's self-hosted-Letta run model
      (removed the redundant `letta` service).
- [x] geokode forward search fixed (was prefix-only); added an OSM `.pbf` importer (426 real
      Monaco addresses).
- [x] Encoded the golden journey as a Playwright suite against the live stack and wired it
      into CI (`.github/workflows/platform-e2e.yml`) without stubbing geolang (public since
      2026-07-15; LLM keys optional). Runs on master push + weekly + manual.
