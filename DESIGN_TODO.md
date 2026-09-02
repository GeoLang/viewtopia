# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> **An advertised feature that is not implemented is captured here as an open
> item.** Rewording the doc is the fallback, for a claim nobody intends to build.
> Ranked 2026-08-21 against the DESIGN.md goal: ship the viewer, the agent, and
> the services that make a shared map, not more surface. Pick from **Do next**.
> Do not start at a parked item.
> Last brought current: **2026-09-02**.
>
> Verify an entry against the code before working it, and do not trust the
> mechanism it names. Three items in this file were already closed when someone
> went to work on them, because the entry named a mechanism that no longer
> existed.

---

## Doc audit 2026-09-02, findings to address

README.md and docs/index.html in every repo were compared against the code on
2026-09-02 and edited in place, uncommitted. Open items only, an item is
deleted when it is done.

### Modules removed 2026-09-02, rebuild from history if wanted

Owner call 2026-09-02: library code that no route, command or manifest
reached was deleted rather than left advertising itself. Each entry names the
last commit that still has the file, so `git show <sha>:<path>` recovers it.
Wire one only when a user asks for the feature.

- [ ] geokode API keys with per-key rate limits, an offline index file, and a
  Rayon parallel batch geocoder. `crates/geokode-server/src/api_keys.rs`,
  `crates/geokode-server/src/hex.rs`, `crates/geokode-core/src/offline.rs`,
  `crates/geokode-core/src/batch.rs` at 0852bcc. The offline file would let a client geocode with no server and no
  rebuild from CSV or PBF. `/batch` stays sequential through
  `Geocoder::batch_forward`.
- [ ] itinera API keys with permissions and rate limit tiers, a copy of the
  geokode module. `crates/itinera-server/src/api_keys.rs` and `hex.rs` at
  a80e93c. Auth is
  platform JWT only.
- [ ] fenestra OGC API Processes request and response types, a server-side
  plugin trait with request and response hooks, and the four stub crates that
  implemented it: `fenestra-inspire` (CSW types and three INSPIRE substring
  checks), `fenestra-geofence` (rule types), `fenestra-printing` (PDF stub),
  `fenestra-cascade` (upstream URL rewrite and cache, no HTTP request).
  `crates/fenestra-core/src/processes.rs`, `crates/fenestra-core/src/plugin.rs`
  and `crates/fenestra-{inspire,geofence,printing,cascade}/` at 9be4e75. The
  server linked none of the four.
- [ ] geodukt database and object store connectors. `DatabaseConnector` trait
  for PostGIS, SQL Server and Oracle with a `PostGisConnector` whose reads
  returned nothing, an `object_store` builder for S3, GCS and Azure, and the
  empty `geodukt-plugins` crate. `crates/geodukt-io/src/database_io.rs`,
  `crates/geodukt-io/src/cloud_io.rs`, `crates/geodukt-plugins/` at d9f1b76.
  A manifest source or sink for object stores is the one piece that did real
  work.
- [ ] fluvius edge runtime (single-threaded ingest, map operators, buffered
  forward flush for constrained devices), trajectory prediction (linear and
  weighted extrapolation per entity plus an anomaly flag on distance from the
  prediction), and multi-tenant quotas with API keys.
  `crates/fluvius-core/src/edge.rs`, `predict.rs`, `tenant.rs` at a5023b8.
  Also the unused k-NN and radius queries on `SpatialIndex`.
- [ ] geogit feature-level three-way merge: auto-resolves non-overlapping
  deltas, merges column edits on the same feature, returns typed conflicts
  (both modified, modify versus delete) with a side-picking strategy.
  `crates/geogit-core/src/merge.rs` at d856b5d. `ggt merge` merges the
  GeoPackage bytes through git instead.
- [ ] ptolemy OTLP trace export. `crates/ptolemy-api/src/telemetry.rs`
  (`init_telemetry`, `TelemetryConfig`, `OtlpProtocol`) built a fmt layer and
  logged that the exporter crate was missing, the CLI never called it. At the
  2026-09-02 HEAD of ptolemy. Rebuilding means adding the opentelemetry crates
  to `ptolemy-api` and calling the init from `ptolemy-cli`.
- [ ] tiletopia `crates/tiletopia-cache`, a workspace member with no caller and
  no tests, and `GET /api/v1/assets/{id}/thumbnail`, which nothing ever wrote a
  file for. At 68313a8. The CRDT, multi-tenant isolation and geofencing
  modules stay parked by the earlier owner call recorded below.

### Platform config

- [ ] infrastructure: the WAF rate limit keys on the CloudFront edge address,
  not the client. The SNS alarm topic has no subscription. TileTopia's task
  definition sets `AWS_S3_BUCKET` and no TileTopia code reads it.
- [ ] infrastructure `tests/` is not run by CI.

### Doc claims left standing without backing

- [ ] geokode docs/index.html: "tested up to 500k records, about a second per
  short prefix query". No benchmark or fixture backs the number.
- [ ] projicio README header: "5935 EPSG codes embedded at compile time". 6184
  definitions are embedded, 5935 resolve.
- [ ] geolang docs/DESIGN.md: "rotate the once-committed API keys". Not
  verifiable from the repo.
- [ ] infrastructure docs/earth-observation-plan.md still lists as planned:
  STAC collection and item write endpoints (ptolemy has six GET routes under
  `/api/v1/stac`), seasonal decomposition, phase 4 registration in ptolemy and
  lazy COG copy to S3, all of phase 5, NAIP, Planet and Maxar sources. Marked
  not built in the plan.
- [ ] viewtopia README Stack line said Helm. No chart exists anywhere, reworded
  to Docker Compose plus Terraform in infrastructure. If Helm is wanted it is
  an item here, not a doc line.
- [ ] viewtopia README "Embedding" section (`?embed=1`, postMessage API) and
  the pricing tiers in docs/platform.html were not verified against the code.
- [ ] GeoLang.github.io index.html hero: "custom interfaces, instantly". The
  viewer renders a map, image or table spec, no form or chart generation.
  "Live Collaboration" card claims comment mentions, agora has no mention
  handling that the audit could find. Security section: "TLS required for all
  external connections", nothing in compose or code enforces it.

## Do next

Ordered 2026-08-30, hosting excluded.

0. **Weak eval tasks, per-task transcript work.** The chat default is
   Qwen3.5 (owner call 2026-09-01), so weakness is read off the
   `local:Qwen3.5-35B-A3B` profile against the 0.82 baseline 20260901T004124.
   The Qwen3.8 sweep (0.87, 20260902T000529) is a comparison only. No weak task
   has been scored yet against the geolang-api container carrying the trimmed
   `viewer_control` manifest, so the standing per-task numbers predate it.
   Next: the full 72-task Qwen3.5 sweep at `--repeat 3` against
   20260901T004124, blocked on hercules being down; sibyl is on Qwen3.8 until
   then, because switching back was refused while the provider was unreachable.
   Still weak, cause read from transcripts:
   - scenario-compare-within-25-metres, 0: "pairing features within 25
     metres" reads as a geoprocessing job and the model builds a
     find_nearest and plan_workflow pipeline. The action's `distance` is a
     coverage buffer, so the prompt asks for something scenario.compare does
     not do.
   - find-before-flying, flaky: the reads fixture answers every find_feature
     with the Kingsway matches, so a run that asks for the brewery is told
     about a substation and geocodes.
   - dataset ids: the model writes `road_network` or `ds_roads` for Road
     Network in about half the dataset runs, some after inventing a
     dataset.list result inside its own turn.
   - attach-a-remote-table and search-a-stac-collection, flaky: one run in
     three writes an ATTACH through sql_query or loops on asset_readings.

## Chat action leftovers, 2026-08-29

- [!] **Drop `patches/maplibre-gl@5.24.0.patch`, blocked on deck.gl.** The fix
      shipped upstream in maplibre 6.4.0 (PR 8071) but no 5.x release carries
      it, and the 6.x bump is blocked: v6 removed the internal `map.transform`,
      and `@deck.gl/mapbox` dereferences it on every interleaved render
      (`map.transform.height` in `getViewport`, unguarded), verified in the
      shipped 9.3.7, 9.3.11 and 9.4.0-beta.1 tarballs. The replacement is
      `@deck.gl/maplibre`'s `MapLibreOverlay`, published only in the 9.4.0
      beta family, and adopting it also moves luma.gl to a 9.4 beta and
      reworks the deck plumbing: it does not set `map.__deck`
      (useDeckOverlay.ts reads it, useFeaturePickerMapLibre.ts pulls the Deck
      out for `pickObject`) and has no `isInitialized`, so the registry holds
      the overlay instead and about a dozen unit tests re-mock. Checked
      2026-08-31: no fix on any 9.3.x, deck.gl RFC 10501 still proposed.
      Revisit when deck.gl 9.4.0 is stable. Migration notes beyond the import
      rewrite (47 sites, including 10 type-only default imports): the
      export-map plugin template links the UMD bundle that v6 no longer
      publishes, and the stale patch comment sits at
      `tests/e2e/chat-actions-tabs.spec.js` ("goes back to a vector basemap"
      stays the proof either way).

## P0 path to the intended product, 2026-08-22

P0 means a task blocks the stated product path: a team opens one hosted map,
loads real data, edits it with permission, asks the agent to analyze it, and
sees the result. Each task needs source, integration, and failure-path tests.
Numbers keep their original places, so a missing number is a closed item and
other documents citing "P0 item 5" still land on the right one.

1. **Make the hosted stack start from the published images.**
   Repositories: `infrastructure`, `geolang`, `viewtopia`, `tiletopia`,
   `ptolemy`, `agora`.
   - [ ] Run `infrastructure/scripts/publish-images.sh` against the applied ECR
     repositories with one new `image_tag`.
   - [ ] After the first AWS apply, populate the four operator-managed secrets,
     confirm both database URL versions are created, force one RDS rotation,
     and prove Ptolemy and Agora recover with healthy replacement tasks.
   - [ ] Stage the required EFS data and confirm startup migrations.
   - [ ] Prove the public route set with service health checks and one
     authenticated browser session.

7. **Chat-only viewer mode: a typed prompt reaches every capability that does
   not need the mouse.** Repositories: `viewtopia`, `geolang`. Owner call
   2026-08-25, plan under **Chat-only viewer mode** in the plans section.
   - [ ] `add_arcs` still has no catalogue entry, so the agent cannot reach it.
     It needs paired source and target points and no layer carries them. Owner
     call 2026-08-27: leave the handler in place unreached rather than delete
     it, because the spacetime co-travel analysis already produces paired
     entity segments and is the source it would draw from. Give it a
     layer-referencing action the day that pairing is exposed as a layer.

## Wire for real

A module is written, unit-tested, exported by a `pub mod` line, and never called
by any route, CLI path or render loop. `cargo` does not flag it because the
re-export keeps it live. The docs then describe the module as a feature. Owner
call 2026-08-24: implement these for real rather than delete them, each with
tests through its real route, ordered viewer-facing routes first, then platform
machinery, then the large islands. One exception to reconfirm when reached:
the Space-Time rows sit under an earlier "do not build Gotham" owner call that
this direction reverses.

- [ ] **tiletopia modules still parked after the 2026-08-31 triage**: crdt
      (plausible if collaboration deepens), tenant (tiny, quota types a
      hosted instance would want), geofence (delete instead if no tile-side
      geofence is ever wanted, agora region watch covers the live case).

- [ ] **Space-Time geofencing crossings and case management.** The Geofences
      panel creates and lists circle and polygon fences, and
      `src/features/spacetime/analysis/geofence.ts` exports
      `detectFenceCrossings`, which computes enter and exit events. Nothing
      calls it, so no crossing is ever shown. Case management has types and no
      UI. Network metrics render as a list rather than a graph.

## Before any public deploy

The hosted flagship is the thesis blocker ("click a link, you're in the map").
It is money and ops, not an engineering TODO an agent can pick. The AWS account
decision has been open since 2026-08-05 and also blocks geoplumb in-region
serving. Suggested order: deploy privately first, prove the stack runs
in-region, then settle the anonymous-edit and link-expiry questions against a
real instance.

Hosting was deferred by owner decision 2026-08-13, so everything in this section
is parked with it, along with the hosted stack decisions, the database TLS
operator steps, the CloudFront realtime test and geoplumb in-region serving. The
Terraform definitions are present, but the image, data, secret, and first-apply
work below still blocks a running hosted stack.

What actually stands in the way, in order:

1. **the AWS account decision**. Nothing proceeds without it.
2. **four owner calls**, listed under **hosted stack decisions before a public
   deploy** below. Only ptolemy
   classifying GET as public is a genuine blocker for a public domain.
   Topology name-keyed reads and `GET /replication/peers` are now Admin.
   The other three are things you would regret later rather than at launch.
3. **the mechanical apply blockers**, in infrastructure's README: every enabled
   ECR image must be pushed under `image_tag`, required spatial and coverage
   data must be staged, every secret container needs a value including the two
   database URLs with `sslmode=verify-full`, and DNS delegation plus ACM
   validation must complete when the platform profile uses `geolang.com`. The
   Natural Earth EFS access point still needs data staged before the first
   hosted scale-up.
4. **share-link policy**, not the links themselves. Share links are built, and
   have been since agora's first migration: create, revoke and resolve, a
   `view` or `edit` role per link, and `resolve_link` mints an anonymous guest
   session (`sub` = `guest-<uuid>`, 12 hours) whose entire surface is the
   websocket, since every other route requires a platform JWT. Role is re-read
   from the row on each connect, so revoking kills the next handshake but not a
   socket already open. What is actually open is policy: links never expire
   (there is no expiry column, only `revoked`), and whether a public instance
   should hand an anonymous guest an `edit` role at all is a product decision
   nobody has made.

Operator-facing deployment gaps:

- [ ] **The first apply cannot complete on the platform profile.** The ALB
      security group needs the certificate, which needs ACM validation, which
      needs registrar delegation to a hosted zone the same apply creates. Real
      sequence is apply, let ACM time out, read `name_servers`, delegate, re-apply.
- [ ] **Agora's security group admits the whole shared ECS group** (twelve tasks),
      not the two the README names, and the stated rationale that agora
      authenticates nothing is false.
- [ ] **With `enable_cdn = true` and no domain, the shipped defaults, CloudFront
      reaches the ALB over `http-only`**, sending Authorization headers and
      cookies across the public internet in cleartext.
- [ ] Also unrecorded: GuardDuty and the Route53 zone are both created
      unconditionally and fail or duplicate against an existing one; the RDS
      engine minor is pinned to `16.4`; the ALB CloudWatch alarms are wired with
      the DNS name where the dimension needs the ARN suffix, so they silently
      report no data; ElastiCache and SQS are provisioned with no consumer.

- [ ] **CloudFront realtime WS untested live**: the realtime behavior forwards
      `Sec-WebSocket-Protocol` and has a zero TTL, but the distribution has never
      carried a real collaboration session. Test it on the deployed distribution.
- [ ] **hosted stack decisions before a public deploy** (from the 2026-08-13
      security review of the hosted terraform). What is left needs an owner
      call:
      - ptolemy classifies GET/HEAD/OPTIONS as public, so reads are anonymous on
        a public domain. Narrower than it sounds: it is scoped to public
        datasets. The visibility middleware answers 404 for any uuid that
        resolves to a private dataset, and every listing filters to
        `visibility = 'public'` in SQL, pinned by
        `test_private_dataset_is_absent_from_every_listing`. Topology
        name-keyed reads and `GET /replication/peers` are Admin, not this rule.
      - the terraform plan CI job authenticates with long-lived AWS access
        keys rather than OIDC. The job is gated to `workflow_dispatch` and the
        workflow grants only `contents: read`, which bounds the blast radius.
      - the S3 state backend is commented out, terraform state is local only.
        Needs a bucket that does not exist yet.
      - the executor's inbound 8081 admits the whole VPC CIDR (a security group
        reference cycle prevents naming geolang-api's group), so
        `GEOLANG_EXECUTOR_SECRET` is the only guard on it.
- [ ] **database TLS is opt-in per operator, not enforced in code.** With
      `rds.force_ssl` now on, a service reaches its database only over TLS, but
      whether that TLS is *verified* rests on the connection string an operator
      pastes into Secrets Manager. sqlx makes this worse than it looks: under
      `sslmode=require` it installs a verifier that returns Ok for any
      certificate and ignores `sslrootcert` entirely, contradicting its own doc
      comment, so `require` buys encryption with no authentication and anything
      answering in the database's place can read and rewrite the session. Only
      `verify-ca` and `verify-full` check the chain. The URLs must therefore end
      in `?sslmode=verify-full&sslrootcert=/etc/ssl/rds-global-bundle.pem` and
      must name the RDS endpoint directly, since a CNAME in front of it fails
      hostname verification. Neither ptolemy nor agora enforces this in code,
      because doing so would break local and CI postgres, which have no TLS.
      Decide whether a hosted-only check is worth having. Also note the service
      images now fetch the CA bundle unpinned at build time, so rebuilds pick up
      CA rotations automatically and reproducibility rests on AWS.

      Both agents reached the `require` finding independently and both reproduced
      it live: `sslmode=require` connects happily to a cert signed by an untrusted
      CA with a mismatched hostname. It also diverges from libpq, where a present
      root CA file silently upgrades `require` to `verify-ca`. sqlx does no such
      thing, so an operator pasting AWS's own `require` guidance plus an
      `sslrootcert` gets zero verification and no warning.

      Operator steps, since neither service can enforce this itself:
      - `ptolemy_database_url` and `agora_database_url` must both end in
        `?sslmode=verify-full&sslrootcert=/etc/ssl/rds-global-bundle.pem`.
        Without the `sslmode`, ptolemy defaults to `prefer` and reaches RDS over
        unverified TLS rather than failing.
      - `PTOLEMY_EXTERNAL_DATABASE_URL`, if set, needs the same two parameters.
      - assumes the deployment reaches RDS directly rather than through RDS
        Proxy, which uses ACM certificates and would not need this bundle.

- [ ] **in-region deployment**: cold pulls are bound by the residential
      link to us-west-2. Serving next to the data is the remaining latency
      lever; blocked on an AWS account decision (2026-08-05).

- [!] **enable the dependency graph for GeoLang repos, an owner-only click.**
      Diagnosed 2026-08-13: the graph is DISABLED for viewtopia (and every
      GeoLang repo probed, their SBOM endpoints all 404), because GitHub turned
      it off by default for new public repos in May 2025 and this org never
      enabled it, while Dependabot alerts stayed on. Alerts therefore keep
      matching new advisories against the last snapshot ever computed, taken
      from `package-lock.json` before the pnpm migration deleted it, which is
      why all 23 alerts carry that manifest path and ghosts keep firing on
      ranges the tree left long ago (alert 19, dompurify, is such a ghost: the
      tree holds 3.4.13, past the fix). Re-checked 2026-08-18: the graph is
      still off, every SBOM endpoint still 404s, and alert 19 is now the only
      one still open. Two nanoid alerts (23 and 25) were auto-dismissed, the
      newer of them on 2026-08-17, but the tree does hold nanoid 3.3.16, inside
      alert 25's `< 3.3.18` range, so that one is not a manifest ghost. No workflow can help, the
      submission API 404s while the graph is off, and none is needed: pnpm v9
      lockfiles parse natively once it is on. Fix is owner-only, either per repo
      (Settings, Advanced Security, Dependency graph, Enable) or org-wide via a
      code-security configuration with `dependency_graph: enabled` attached to
      all repos without one (needs `write:org`, which the local gh token lacks).
      After enabling, the SBOM endpoint should return ~1000 packages and the
      alerts should re-resolve against `pnpm-lock.yaml`; whether stale alerts
      auto-close was not verifiable in advance, so check alert 19 and dismiss it
      by hand if it survives.

- [ ] **advisories nobody can upgrade out of (2026-08-12, re-checked
      2026-08-18).** `cargo deny check advisories` fails in ptolemy, geodukt,
      geokode and itinera. That is four of roughly twenty Rust repos, not all of
      them: agora, checked as a fifth, reports clean. CI stays green anyway,
      because each of the four runs that step with `continue-on-error: true`, so
      it reports without gating, which is the right policy while the fixes are
      not ours to make. The preceding `check licenses sources bans` step carries
      no such flag and does gate.

      Outstanding, none of these fixable from here. Two of them print a "try
      `cargo update -p ...`" hint that does not work, because the version they
      want is a major ahead of what a transitive dependency requires, so cargo
      locks nothing. Verify with `--dry-run` before believing that hint again.
      - ptolemy: `rsa` 0.9.10, the Marvin timing sidechannel
        (RUSTSEC-2023-0071), through `openidconnect` 4.0.1. Not through
        sqlx-postgres, which is in the tree but does not reach `rsa`. No
        upgrade published. ptolemy also warns on yanked `spin` 0.9.8.
      - geodukt: `quick-xml` 0.37.5, two denial-of-service advisories
        (RUSTSEC-2026-0194, -0195). Wants >= 0.41 but `object_store` 0.11.2
        pins `^0.37`. Also `rustls-pemfile` through the same `object_store`
        (RUSTSEC-2025-0134, unmaintained, no safe upgrade).
      - geokode: `protobuf` 2.28.0 uncontrolled-recursion crash
        (RUSTSEC-2024-0437). Wants >= 3.7.2 but `osmpbfreader` 0.16.1 pins
        `^2.28`. Also `bincode` 1.3.3 and `smartstring` 1.0.1, both
        unmaintained with no successor version (RUSTSEC-2025-0141, -2026-0249).
      - itinera: `bincode` 1.3.3, same as geokode's.
      - tiletopia: a second h2 line at 0.3.27 through `aws-smithy-http-client`,
        which pins it.

- [ ] **geodukt and ptolemy each carry digest 0.10 and 0.11 at once.** In
      geodukt it is `md-5` 0.10 reaching the graph through `object_store`, and
      the duplicate is `digest` alone, since geodukt holds a single `sha2`
      (0.11). In ptolemy it is sqlx 0.8, mongodb 3.7 and openidconnect 4.0, all
      still on sha2 0.10, so the 0.11 bump added a second copy rather than
      replacing one, and ptolemy duplicates both `digest` and `sha2`.
      `deny.toml` warns on duplicates rather than failing in both, so CI is
      green. Each resolves itself when those upstreams move.

- [ ] **viewtopia's two `image-size` advisories have no fix published.** Both
      are denial of service through infinite loops in the JXL, HEIF and ICNS
      parsers. The tree holds `image-size` 0.7.5 through `texture-compressor`
      under `@loaders.gl/textures` 4.4.3, which is deck.gl's loader family
      rather than deck.gl itself. GitHub still reports no patched version. Both
      alerts are dismissed as not-used, on the ground that those parsers only
      run in texture-compressor's Node CLI path and never in the browser bundle.
      The `dompurify` advisory alongside them is
      NOT reachable here: it needs `IN_PLACE` sanitizing with hook removal,
      viewtopia disables the Cesium InfoBox, and cesium 26.1.0 calls DOMPurify
      in one place only, `Credit.js`, in the string-returning mode. Recorded so
      nobody investigates it twice.

      The fourth alert, `postcss` (CVE-2026-69153, an attacker-chosen
      `sourceMappingURL` reading arbitrary `.map` files when `from` is unset),
      is dismissed as stale: it names `package-lock.json`, which the pnpm
      migration deleted, and the root lockfile is on 8.5.25, past the 8.5.23
      fix. What it does not report is real: `dashboard/pnpm-lock.yaml` carries
      8.4.31 as well, from `next@15.5.22`, whose package.json requires that
      exact version with no range, so no update moves it and only a pnpm
      override would. Left alone because it is build-time and
      development-scope, and the dashboard compiles only its own stylesheets,
      so no CSS anyone else chose reaches postcss.

- [ ] Two operational consequences of dropping the zero-rows rule, for whoever
      deploys first: a deployment needs at least one instance-admin token holder,
      because that is the only actor who can grant on a dataset the backfill
      skipped (blank or machine `created_by`), and any service account writing to
      datasets it did not create needs an explicit grant where the editor role
      alone used to pass.

- [ ] **collecta role strings outside admin/editor/viewer now fail closed.**
      Nothing in the repo creates others, but a live database predating this may
      hold them, and those accounts stop working on deploy.

## Wait for demand

Parked until a real user, a real feed, or a real customer file exists. The
thesis is "a team makes and analyzes a map together in the browser". Refuse
feature-parity fights with ArcGIS, Felt, GEE, Palantir.

- [ ] **Low priority: feature ideas from the deleted tiletopia modules**
      (2026-08-31 sitting). The code was facade with no callers and is deleted,
      rebuild from git history if a real user asks. Recorded because the idea
      was real even though the code was not: reports and print export (if it
      returns, build map-to-PDF in viewtopia against the live view, with
      fenestra's printing stub, not tile-side), temporal tiles behind a time
      slider (waits for a dataset with a time column in real use), flythrough
      camera paths, arvr viewing, model_zoo, prediction and onnx_inference
      (panoptes now publishes building segmentation weights, so tile-side
      inference has one model it could run), encryption at rest (needs
      a key backend, probably ops rather than app code), federation peering
      (needs a second instance), whitelabel branding, cluster raft
      scaffolding, retention policies. Not recorded:
      scripting, cloud_store, priority_queue, dynamic_raster and marketplace,
      each a duplicate of a shipped implementation (agora region watch,
      tiletopia-store, scheduler.rs, geoplumb, the plugin registry).

- [ ] **Fluvius as a rules consumer of agora's readings stream.** Thresholds,
      geofences and proximity alerts over the live asset readings (see
      DESIGN.md section 2.0). Fluvius is not in the platform stack. Its
      `--source-bind` socket binds a listener, but `ws_remote_source` already
      connects out for a remote feed and `CheckpointManager` already persists,
      so what is missing is a topology source pointed at agora's document
      websocket and a sink pointed at `/feeds/ws` with a feed token.

- [ ] **a standalone e2e for creating a dashboard and adding a widget.** A
      dashboard needs a server project, so that path is covered only against
      the platform stack.

- [ ] **collecta publish follow-ups.** `POST /api/v1/forms/{id}/publish` is
      on-demand with the caller's token. Not built:
      automatic push on every submission (needs a service credential collecta
      would hold, and a call on who owns the datasets), republishing a
      submission edited after publish (collecta has no submission
      `updated_at`), and live refresh of the published layer for other viewers
      (dataset layers are pull-based).

- [ ] **ptolemy commit-time topology rules** (owner call 2026-08-24): build a
      real rule engine only when an Esri migration customer needs rule
      validation at commit time. PostGIS Topology proper stays either way.

- [ ] **tiletopia API keys on write routes** (owner call 2026-08-24): keys stay
      read-only until a machine writer exists. Feeding keys into
      `require_editor` changes that middleware's contract.

- [ ] **native vector-to-3D-Tiles** (owner call 2026-08-24): mago stays for
      GeoJSON/GeoPackage/KML as a subprocess, same call as tippecanoe. Build a
      native extrusion tiler only if the jar/JRE cost or a real workload
      demands it.

- [ ] **movement analytics as geolang agent tools** (owner call 2026-08-24):
      Space-Time v1 runs its analytics client-side; expose them to the agent
      only after the cube proves they are worth exposing.

- [ ] **a tile builder of our own** (owner call 2026-08-23, against): the hard
      parts are feature dropping per zoom, a tile size budget that only settles
      by encoding and re-encoding, a streaming disk sort so the input never has
      to fit in memory, and topology-preserving polygon simplification that
      does not leave slivers between neighbours. Fenestra's MVT encoder,
      topoi's Douglas-Peucker and geoplumb's pyramid walker cover none of
      those. Revisit only if running tippecanoe as a subprocess stops paying.

- [ ] **read-only warehouse sources** (weigh before building) — Felt reads
      Snowflake/BigQuery/Databricks live, enterprise-only. Ptolemy already
      does external read-only PostGIS tables; the same model could take a
      warehouse driver. Only worth it when a real user asks: it is
      enterprise-pull, and the thesis says refuse parity fights.

- [ ] **if any of this is wanted, the in-thesis version is a live layer, not a
      sensor platform**: the ingest half is built.
      Agora's `/feeds/ws` takes `Readings` frames under a feed token minted at
      feed creation, relays them to document subscribers, and viewtopia's
      `AssetRule` path colors assets by their latest reading end to end. What
      is missing is only a pusher: fluvius connecting out to `/feeds/ws` as a
      sink (its runner already connects out and checkpoints), plus feed-token
      lifecycle for it. A sensor historian stays off-thesis. Parked, no use
      case to test against.

- [ ] **viewtopia FleetPanel** — honest "no live feed" state; nothing serves
      vehicle positions. Narrower than the live-layer row now: readings ingest
      and relay exist, so this needs a position feed pushed into `/feeds/ws`
      (fluvius, same connector as above) and FleetPanel consuming position
      kinds from the `readings` frames it already receives via liveStore.

- [ ] **terravista GPU rendering** — Metal and Vulkan backends. Biggest
      advertised-vs-real gap on mobile, needs platform GPU toolchains,
      competes with the hosted flagship for attention. What is left to
      decide is whether to build the GPU backends at all.

- [ ] **terravista has no iOS or macOS anything.** No `.swift`, `.h`, `.modulemap`,
      `Package.swift` or podspec, no cbindgen config, no generated C header, no
      iOS CI job, and "macOS" appears nowhere in the codebase. The README's
      roadmap keeps a Metal backend and Swift Package Manager distribution as
      planned, and Metal needs the iOS binding first.

- [ ] **terravista's style engine is unreachable and does not parse Mapbox GL
      JSON.** The structs are snake_case serde derives with no renames, while real
      styles use `type`, `minzoom`, `paint["fill-color"]` and stop functions. No
      `tv_` FFI symbol touches the style module, so no host can supply one, and
      the renderer uses its own hardcoded style keyed by layer name.

- [ ] **the next adapter after Esri.** v0.1 covers KML/KMZ, v0.2 the Esri File
      Geodatabase. Pick the next from real customer data rather than
      guesses, and check it against GDAL's driver list before committing to it. The
      recorded order of demand puts the photogrammetry and reality-capture stacks
      next, then the CAD-adjacent platforms. Blocked on real customer data rather
      than on engineering. Full verne write-up under **Plans**.

- [ ] **collecta conditional visibility is unread in the form model.** The
      `Condition` type exists, validation never looks at it, and the XLSForm
      importer sets it to `None`. It works only on the XLSForm path where the raw
      expression passes through to ODK Collect on the device.

- [ ] **geogit has no feature-aware merge.** `cmd_merge` calls `repo.merge`,
      which merges the GeoPackage bytes through plain `git merge`, so two edits
      to one feature become a binary conflict on a MessagePack blob and
      `geogit resolve` can only pick ours, theirs, ancestor, delete or the
      working copy. Kart compatibility is broken three ways as well: geometry
      serializes as a MessagePack integer array rather than bytes, the GPKG
      header keeps the source SRS id where Kart requires 0, and no vector
      dataset writes a `meta/crs/` entry (only the point cloud import writes
      `meta/crs.wkt`).

- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.

- [ ] **symbology, the one piece left**: a data-defined point size does not reach
      QML. QGIS sizes a symbol in the symbol's own units and needs a
      `<data_defined_properties>` block whose exact spelling nobody here has
      verified against a real QGIS writer, so the export reports the loss rather
      than guessing. Closing it needs a `.qml` written by an actual QGIS to read
      the encoding off.

- [ ] **the offline story's remaining network reads**: DuckDB's spatial
      extension fetches from extensions.duckdb.org, and the story export fetches
      MapLibre from unpkg plus tiles from the tile host. The tile cache stores
      every tile ever viewed, with no size cap and no clear-all.

- [ ] **composite latency on dense collections**: memory is bounded (folds peak
      at one wave, median and percentile reduce in strips under a fixed 4 Mi
      value budget), and a strip reads only the items whose footprint reaches
      its own rows rather than the whole stack. What remains
      is that strips run one after another, so a stack deep enough to need N
      strips pays N passes of read latency, over the same distinct bytes since
      shared tiles come from the byte cache.

- [ ] **geoplumb breadth**: GEE ships a huge operator library and charting/reduction
      over regions. Grow by demand, not by checklist.

- [ ] **fenestra cannot reach terrano's multi-band GeoTIFF or COG work.**
      `fenestra/Cargo.toml` pins `terrano-core` at git tag `v0.1.0`, the newest
      tag terrano has, and terrano's workspace version is still `0.1.0`. Moving
      fenestra means bumping terrano's version, cutting a tag, and repinning.
      Only worth doing when fenestra needs a multi-band coverage.

## Open decisions that are not bugs

Deliberate scope calls, each a product decision rather than a defect to fix.

- [ ] tiletopia serves every asset's tiles and `tileset.json` publicly
      (`is_public_read`), even for private assets: anyone holding the asset id
      can read them. The asset listing is no longer public, it filters to what
      the caller may see, so the tile payload is the open part. The
      aggressive CloudFront TTLs on tile paths depend on tiles staying
      public. If private assets ever need gated tiles, decide together:
      per-asset visibility check in the tile path AND a CDN redesign
      (authenticated tiles cannot keep the shared long-TTL cache). The remaining
      post-MVP question is hosting tiles on a separate host (`tiles.<domain>`)
      so authenticated API paths and public tiles do not share a prefix, if
      private-asset tile gating ever ships. Settled at the 2026-08-31 sitting:
      asset metadata and annotation reads are not private, any valid token may
      read them, so the open part here is only the future private-asset tile
      question.

- [ ] ptolemy merge is **attribute-level** for disjoint property edits.
      Same-key and both-sides-moved-geometry still conflict.

- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.

- [ ] `ci/no-raw-writes.sh` cannot see a mutating Postgres function called through
      `SELECT`. `topology.rs` does exactly that (`SELECT topology.CreateTopology`,
      `AddFace`, `TopoGeom_addElement`), so those three routes are guarded only by
      being instance-admin-only in `auth.rs`. If topology is ever bound to a
      dataset, they need the ladder and the check needs to learn about them.
      The check documents in its own header that it cannot see a mutating
      function called through `SELECT`, though it names only two of the three
      sites and misses the `ST_Simplify(TopoGeom_addElement(...))` call.

- [ ] `unguarded_pool()` exists because the CLI and the test fixtures are separate
      crates and could not use a crate-private accessor. Nothing in
      `ptolemy-api/src` may name it and the CI check enforces that, but the check
      is scoped to that directory, so the api crate's own integration tests do
      use it. It is a named accessor rather than a barrier. Revisit if the CLI
      ever grows a path that should be laddered.

- [ ] None of the above decides anything when auth is off, which is now
      `PTOLEMY_AUTH_DISABLED=true` rather than an empty `PTOLEMY_JWT_SECRET`:
      the serve path uses the strict config, which refuses an empty secret
      outright. With auth off the permission check passes and the read
      visibility layer no-ops, but the write ladder still resolves the target
      and still refuses one that does not exist or is an external read-only
      table.

- [ ] the sweep only covers the SQL branches its fixtures reach, which is what
      query variants are for, and a handler that swallows its error is invisible
      to it. Add a variant when a route grows a second branch.
      Decided against 2026-08-13: keeping the script that generated the request-body
      table. The table is `const BODY` in `route_sweep.rs` and holds 102 entries. Its
      values are domain-tuned
      rather than derivable from struct shapes: 33 carry fixture-id markers, 11 carry
      WKB hex and 3 more carry GeoJSON, and the sweep's whole point is that the
      handler reached SQL, which needs values that pass validation. It also
      self-maintains, since adding a route that refuses `{}` fails the sweep by name.

- [ ] **ptolemy is single-CRS by code, not by schema, and whether that is right is
      a product call.** `feature_versions.geometry` is a bare untyped `geometry`
      column with no srid constraint, so PostGIS would hold mixed srids in it
      quite happily. What forces one is `ST_GeomFromWKB($4, 4326)` on insert and
      update, which stamps 4326 on whatever arrives regardless of the
      `datasets.srid` the dataset declares. (The `GEOMETRY(Type, 4326)` typmods
      elsewhere, on networks, raster bounds and LRS, are real constraints but do
      not cover features.) One srid per column is ordinary PostGIS practice and a
      database normally holds many tables in many srids, so single-CRS platform
      wide is this platform's choice rather than a PostGIS norm. It is a
      reasonable one for a web-first stack: tiles and viewers are WGS84, and any
      cross-dataset operation needs a common frame anyway.

      The cost lands on the migration story. A geodatabase is not single-CRS: each
      feature class carries its own spatial reference and a feature dataset only
      constrains its own members to a shared one. Reprojecting at extraction makes
      the data correct and renderable, and the original coordinates survive it:
      a commit operation may carry the untransformed geometry and its EPSG code
      beside the working copy, read back per feature through the native read.
      So per-dataset srid is worth supporting only if someone needs to query and
      serve in the native frame. Supporting per-dataset srid later needs no storage
      migration, since the column already accepts any srid. It means taking the
      srid from the dataset on write instead of the literal, then auditing every
      query that assumes 4326, and deciding what a cross-dataset query does when
      two datasets disagree.

- [ ] **terrain bundle limits worth knowing** (each deliberate, none blocking):
      bundles are filesystem only, not S3/GCS, because `LocalStore::list` is one
      level deep while `S3Store::list` is recursive and un-paginated, so it sees
      only the S3 default page of 1000 keys and discovery would differ per
      backend. The availability walk touches every
      tile file, so a large bundle makes the layer.json request slow unless the
      bundle ships its own `available` array.

The geoprocessing NULL panic is latent in contour alone, deliberately left
because no PostGIS build ships `ST_ContourLines`, so that route answers 501
first.

## Plans — too big to hand an agent cold

### Chat-only viewer mode

DESIGN.md 2.4 and 2.6 describe what is built. Upload still needs the mouse.
What is left is the weak eval tasks in **Do next** and a layer-referencing
`add_arcs` the day spacetime pairing is a layer (P0 item 7).

The eval fixtures are copies of `tests/unit/fixtures/action-catalogue.json`
and `tests/unit/fixtures/viewer-snapshot.json`. Refresh them from viewtopia
when an action or the snapshot changes. See `geolang/evals/viewer/README.md`.

### Hosted flagship instance, the thesis blocker

See **Before any public deploy**. What is open is the AWS account, the apply
sequence, and the anonymous-edit / link-expiry policy.

### Region watch

agora's README and DESIGN.md 2.0 describe what is built. Open:

- [ ] **A third webhook sender now exists** (`agora-server/src/webhooks.rs`
      beside `ptolemy-api/src/delivery.rs` and tiletopia `webhooks.rs`),
      because agora cannot depend on either binary crate. Extract ptolemy's
      into a shared crate if a second agora event ever needs delivery.
- [ ] **Nothing caps watches per document.** `MAX_WATCH_RUNS_PER_TICK` bounds
      the work and the oldest-first order keeps it fair, so a document with
      thousands of watches slows every other document's ticks. Same posture
      the README takes on feeds. Add a per-document cap when a real deployment
      shows the need.
- [ ] Later, not now: sensors as a second source (fluvius over WebSocket into
      agora, its runner now connects out and checkpoints), a time-series
      watch over `/zonal/{layer}/series`, OGC SensorThings.

Note on `viewtopia/docs/verticals.md`: it is a planning doc for proposed
verticals, not a description of what exists.

### terravista v0.3

See **Wait for demand**. Android fetches and draws on Canvas, including MVT.
Metal/Vulkan is unstarted.

### verne, the next adapter

Rationale: lock-in, not features, is what stops an org moving off an incumbent
platform. Vendor-neutral by design: a common core (connect, inventory, report
fidelity, extract) with a thin adapter per source. A new repo rather than
geodukt, because the dependency surface and the risk profile (it holds customer
credentials) should not land on every geodukt user. It emits GeoPackage/Parquet
plus a semantics sidecar; geodukt and ptolemy consume that through the source
interface they already have.

Rust (owner decision 2026-07-29). GDAL stays behind one crate or adapter trait,
feature-gated. Ship the service as a container with GDAL from the distro.

- [ ] **verne: the rest of the hosted Esri story.**
      - the version tree. verne reads one named version per extraction and
        diffs it, but carries no tree. Carrying it means the
        VersionManagementServer resource: its `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license. That needs an enterprise
        deployment verne may exercise.
      - legacy generateToken (username/password) is deliberately not taken:
        holding a password is worse than holding a client secret, and OAuth
        client_credentials covers the hosted case.
- [ ] **v0.2 gaps.** Rasters in a `.gdb` are detected and routed to terrano but
      have no fixture, because OpenFileGDB refuses to create them. Field subtypes,
      dataset-level metadata and glob domains are unexercised. Subtype, annotation
      and topology fixtures are hand-written catalog XML, since GDAL cannot create
      those either: the read path is real, the blob is not.
- [ ] **more real data, and from another vendor domain.** One public geodatabase
      found two bugs an afternoon, and it was hydrography: no attachments, no
      annotation, no utility network, so those paths are still exercised only by
      fixtures verne builds itself. A utilities, parcels or emergency-services
      file would hit them. Public sources with attachments are hard to find, so
      this may need a customer file.
- [ ] **what the Esri report cannot land, by category** (from the GDAL feasibility
      pass and v0.2's own verdicts):
      - domains lose their field binding (ptolemy binds a domain to a field only
        through a subtype), their description, non-default split/merge policies and
        bound inclusivity.
      - relationship classes lose the origin's own primary key (the origin
        foreign key is carried), aggregation as distinct from composition
        (`is_composite` now travels end to end, so the vocabulary is two-valued
        and a partial-ownership class cannot be stated), and the many-to-many
        mapping table's own attributes. GDAL models no relationship rules or
        notification at all.
      - annotation and dimension graphics are unsupported: GDAL reads no class
        extension, and jung places labels from text and an anchor rather than
        storing a placed graphic.
      - topology rules, geometric/network/utility networks, parcel fabrics,
        terrains, mosaic datasets, attribute rules and contingent values have no
        GDAL model: named in the report and nothing more.
      - versioning and archiving are enterprise-only Esri features, so a `.gdb`
        reports them not applicable. The branching-beats-edit-history advantage
        only applies to enterprise sources, which lands in v0.3, not here.
- [ ] **fidelity gaps verne named that are still open.** Each is a real loss the
      report prints today, listed so the report stays a work list:
      - KML folder nesting flattens to a path attribute, because nothing holds a
        layer tree. Needs a grouping concept or an accepted loss.
      - `GroundOverlay` rotation and `gx:LatLonQuad`: terrano's GeoTIFF carries an
        origin and a pixel scale with no rotation terms, so a rotated or warped
        overlay has to be resampled north-up.
      - A `Model` (COLLADA mesh) has no home. interiora holds indoor and building
        models, not arbitrary meshes. Product question, not a small fix.
      - A `gx:Track` lands as a trajectory now, but with no `feature_id` the
        placemark's attributes, style and folder path stay on a separate feature
        with nothing joining the two, and altitude, per-sample angles and
        `gx:SimpleArrayData` columns have nowhere to go.
      - Viewer chrome stays unsupported by design: `BalloonStyle`, `ListStyle`,
        `ScreenOverlay`, `LookAt`/`Camera`, `NetworkLink` refresh.
      - `LabelStyle` scale multiplies an unstated base size, so text size is
        approximate either way. Probably not fixable.
- [ ] **the semantics with no target** (the actual work; geometry and attributes
      are the easy fifth and GDAL does most of that). The specifics differ per
      vendor but the categories repeat: attribute domains and subtypes, typed
      relationships with cardinality, validation and topology rules, cartographic
      text as features, network and utility models, styling and print layouts,
      attachments, metadata, and edit history. Schema concerns like domains and
      subtypes belong in ptolemy, not in a store verne invents. Versioned edit
      history maps onto ptolemy's branching better than onto anything else this
      platform could migrate to, which is where the real fidelity advantage is.
- [ ] **licence boundaries, needs a human to read each vendor's current terms.**
      The line is the same everywhere: the customer's own data in formats they
      hold, and their own hosted content through documented APIs with their own
      credentials, is clean. Vendor-supplied licensed content (basemaps,
      geocoders, demographic and imagery datasets) is not theirs to move, and
      neither is content they can merely see. Prefer open-source readers over
      vendor SDKs, several of which carry terms that do not sit with AGPL
      linking. "With permission" must be a mechanism, not a promise: explicit
      operator credentials and a log of what was extracted, nothing that sniffs
      or crawls.
