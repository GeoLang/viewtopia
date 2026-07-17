# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
> **Open work is up top; completed phases are condensed at the bottom.**
> Last brought current: **2026-07-17**.

---

## OPEN — correctness follow-ups (from Phase 2 verification, fix next)

These were surfaced by fresh-context verifiers against the Phase 2 work but are out of
that work's committed scope. Ordered by severity.

- [ ] **ptolemy `conflicts.rs:147` (ResolutionStrategy::Theirs) cross-branch leak.** Still
      does an unscoped `FROM feature_versions WHERE feature_id=$1 ORDER BY created_at DESC
      LIMIT 1` — the same any-branch leak shape that was fixed in `commit()`. Scope it to the
      changeset ancestor chain. **Top priority.**
- [ ] **ptolemy-api ~15 untied `DISTINCT ON` queries.** The `fv.id DESC` latest-version
      tiebreaker fix stopped at the storage crate; `conflicts.rs`, `grpc.rs`,
      `vector_search.rs`, `analytics.rs`, `ogc.rs`, `geoprocessing.rs`, `qgis.rs` still use
      the untied `created_at DESC` pattern (nondeterministic on same-tx ops).
- [ ] **ptolemy cql2 mixed-type 500.** `(properties->>'x')::numeric` throws on rows where
      the property holds non-numeric text. Guard the cast (e.g. filter by `jsonb_typeof`).
- [ ] **collecta forms `?since` cursor** uses strict `>` on microsecond `updated_at`; two
      forms written in the same microsecond straddling the cursor could skip one. Switch to
      `(updated_at, rowid)` if it matters at scale.

## OPEN — platform hygiene

- [ ] **viewtopia: 13 dependency vulns on master** (2 high, 8 moderate, 3 low). Resolve.
- [ ] **Org Renovate app install still pending** — shared config exists in
      `GeoLang/renovate-config`, each repo extends it, but the GitHub app isn't installed yet.
- [ ] itinera writes to host-mounted `data/` fail as the default container user
      (PermissionDenied); worked around with `--user`. Fix Dockerfile user / volume ownership.
- [ ] geolang embedded Postgres is ephemeral (no volume) → re-`initdb` (~50s) on every
      recreate. Mount a volume at the container PG data dir to persist it.
- [ ] Editing `nginx-platform.conf` needs `up -d --force-recreate --no-deps viewtopia`
      (single-file bind-mounts pin the inode). Document or switch to a directory mount.
- [ ] Transient `failed to set up container networking … network not found` on `up` — needs
      `down --remove-orphans` + `network prune`. Root-cause or document.
- [ ] geokode has a `fuzzy` module (Levenshtein/Soundex) `forward()` doesn't use — wire a
      fuzzy fallback for typo tolerance.

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
