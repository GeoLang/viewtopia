# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> **An advertised feature that is not implemented is captured here as an open
> item.** Rewording the doc is the fallback, for a claim nobody intends to build.
> Ranked 2026-08-21 against the DESIGN.md goal: ship the viewer, the agent, and
> the services that make a shared map, not more surface. Pick from **Do next**.
> Do not start at a parked or delete-don't-wire item.
> Last brought current: **2026-08-21**.
>
> Verify an entry against the code before working it, and do not trust the
> mechanism it names. Three items in this file were already closed when someone
> went to work on them, because the entry named a mechanism that no longer
> existed.

---

## Do next

The click-path defects and the advertised-vs-real doc cuts (2026-08-21) are
done. TileTopia, ViewTopia, ptolemy docs pages, terravista and projicio landing
pages, nubis PMF wording, and GeoLang.github.io were stripped to match the
code. sibyl has no docs site. verne, topoi and terrano READMEs already matched
the post-fix code.

The four code items that pass left (fluvius R-tree, geogit working copy path,
ptolemy Features Part 2, nubis PMF) closed 2026-08-21. Nothing is queued here.
The next pick is an owner call on the **Delete, do not wire** list below, one
module at a time, or a hosting decision under **Before any public deploy**.

## Delete, do not wire

A module is written, unit-tested, exported by a `pub mod` line, and never called
by any route, CLI path or render loop. `cargo` does not flag it because the
re-export keeps it live. The docs then describe the module as a feature. Do not
start from these. Per module: delete and drop the claim, or keep as a private
module with no advertised surface. Wiring them is a product decision.

- [ ] **tiletopia scheduler.** Cron/interval/one-shot enum, real cron parsing,
      priority, retry, three GET routes. `spawn()` is called from nowhere,
      `create_job` ignores cron and returns now plus one hour, the executor only
      formats a log line, there is no create route, and `Scheduler::new()` seeds
      three fabricated jobs with invented run counts of 28, 720 and 4. Nothing has
      ever run a scheduled job. Replace or delete; do not start from it.

- [ ] **tiletopia webhooks.** Real HMAC delivery with backoff in `process_pending`,
      which nothing calls, seeded with two demo subscriptions carrying secrets
      `whsec_demo_secret_1/2`, and read-only routes with no subscribe.

- [ ] **ptolemy webhook delivery, SSE, WebSocket events, background jobs, rate
      limiting, audit-log writes and lock enforcement are seven separate dead
      subsystems**, each advertised as done. `spawn_delivery_worker`,
      `SseBroadcast::send`, `EventBus::publish`, `BackgroundJobs::spawn`,
      `check_locks` and the audit writer all have zero callers; the rate-limit
      middleware is never layered (and is a fixed-window counter, not a token
      bucket, keyed on `X-Forwarded-For` with a `127.0.0.1` fallback so every
      direct caller shares one bucket). Pick the two or three worth wiring and
      delete the rest.

- [ ] **tiletopia has roughly 25 further modules that are `pub mod` and nothing
      else**, each advertised: temporal versioning, CRDT editing, federation,
      CI/CD validation, multi-tenant isolation, leader election, priority
      queue/SLA, white-label branding, marketplace, data-residency geofencing,
      field-level encryption, custom dashboards, AR/VR foveated rendering,
      cinematic flythrough, digital-twin scripting, offline viewer export. Decide
      per module: wire, or delete and drop the claim.

- [ ] **tiletopia premium routes return demo data or ignore input.** COG tile
      offsets are fabricated with no HTTP client; STAC search ignores bbox,
      datetime, collections and limit and returns one hardcoded item; static map
      rendering fills a flat grey buffer and encodes WebP as JPEG and both PDF and
      SVG as PNG; kriging is inverse-variogram weighting with no solve, and
      Ordinary/Simple/Universal run identical code; geoprocessing buffer scales
      vertices radially so a square stays a square, union is a convex hull;
      terrain analysis has no aspect, watershed or flow accumulation and viewshed
      has no ray casting; elevation always takes a synthetic sine fallback while
      reporting `source: Srtm30m`; API-key management seeds three fake keys and
      `get_by_hash` has zero callers, so a key cannot authenticate anything.

- [ ] **tiletopia's remaining dead readers.** Since 2026-08-22 the job queue
      tiles glTF, glb, OBJ, FBX, GeoJSON, GeoPackage, KML and CityGML with
      mago-3d-tiler (MPL-2.0, bundled in the image, `TILETOPIA_MAGO_JAR`,
      Linux and Windows x64 only) and IFC with the repo's own reader and
      mesh tiler, placed from the upload's longitude and latitude or the
      IfcSite coordinates. Point clouds keep the native tiler. DAE is the one
      model extension no tiler takes. Still dead: the gltf, obj, fbx, citygml
      and cityjson readers, `read_vector` and its readers, `imagery_tiler.rs`
      and `photogrammetry.rs`. Delete them or give them a caller.

- [ ] **viewtopia Space-Time Intelligence: four panel surfaces work.**
      Entities, CSV ingest, track player, manual links. The Analysis tab
      renders seven buttons with no `onClick`. Sixteen advertised rows have
      no code at all. Seven more have a real algorithm and zero callers.
      Classification and RBAC are absent. Docs now match. Do not build Gotham.

- [ ] **viewtopia conflict resolution is dead code.** The three-way merge only
      runs for `update`+`feature` ops, which nothing ever queues, and
      `ConflictResolver.tsx` is rendered nowhere.

- [ ] **ptolemy's Esri-style topology rule engine does not exist.** 31 rule
      variants are declared, nothing matches on them, stored rules are never read
      back, and the only validator ignores its dataset argument and queries two
      columns (`branch_id`, `is_deleted`) that `feature_versions` does not have,
      so it always errors. No commit-time gate. (PostGIS Topology proper is real.)

- [ ] **jung unused render modules** (labels, label priority, curved labels,
      text/TTF, MIL-STD 2525, heatmap, print layout). Each is exported by a
      `pub mod` line and tested in isolation; nothing on the render path calls
      them. `print_layout` pulls in `output`, so the print stack is a closed
      unused island rather than one module. The README already discloses it, so
      only the code is open. jung-wasm is a different matter and is not a gap:
      the crate exists, and jung's README already states that viewtopia does not
      import it. jung is already in the v1 path: ptolemy's `GET /style` uses
      `jung-esri` and terravista decodes tiles with `jung-mvt`. The open question
      is whether the off-render-path `jung-core` modules earn their keep.

## Before any public deploy

The hosted flagship is the thesis blocker ("click a link, you're in the map").
It is money and ops, not an engineering TODO an agent can pick. The AWS account
decision has been open since 2026-08-05 and also blocks geoplumb in-region
serving. Suggested order: deploy privately first, prove the stack runs
in-region, then settle the anonymous-edit and link-expiry questions against a
real instance.

Hosting was deferred by owner decision 2026-08-13, so everything in this section
is parked with it, along with the hosted stack decisions, the database TLS
operator steps, the CloudFront realtime test and geoplumb in-region serving.
The executor precondition closed 2026-08-09, the tool-boundary token exchange
closed 2026-08-12, and the 2026-08-13 terraform pass closed force_ssl, immutable
tags, the agora and jupyter security group splits, and the ALB restriction. So
the infrastructure is no longer the engineering blocker.

What actually stands in the way, in order:

1. **the AWS account decision**. Nothing proceeds without it.
2. **four owner calls**, listed under platform hygiene below. Only ptolemy
   classifying GET as public is a genuine blocker for a public domain.
   Topology name-keyed reads and `GET /replication/peers` are now Admin.
   The other three are things you would regret later rather than at launch.
3. **the mechanical apply blockers**, in infrastructure's README: the geolang
   image must contain application source (its Dockerfile installs requirements
   and never copies `src/`, because compose bind-mounts the repo in), every
   enabled ECR image must be pushed under `image_tag`, EFS spatial and coverage
   data staged, every secret container given a value including the two database
   URLs with `sslmode=verify-full`, and DNS delegation plus ACM validation
   completed when the platform profile uses `geolang.com`.
   Two doc bugs to fix while in there: `README.md:210` still lists "must be
   built with a sqlx TLS backend" as a blocker, which ptolemy and agora both
   closed (each names `tls-rustls-ring`), and `modules/database/main.tf:154`
   tells the operator to use `sslmode=require`, which `README.md:39` forbids and
   which buys encryption with no authentication.
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

Operator-facing errors, all still real:

- [ ] **RDS managed passwords rotate every seven days and nothing rewrites the URL
      secrets**, so ptolemy and agora lose their databases roughly a week after
      launch. Decide: disable rotation, read the managed secret directly, or run a
      rotation-triggered job.
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
      security review of the hosted terraform). The mechanical half closed the
      same day. What is left needs an owner call:
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

      h2 0.4.14 (RUSTSEC-2026-0258) was bumped to 0.4.16 on 2026-08-18 in
      geodukt, geokode, itinera, ptolemy, tiletopia. tiletopia keeps a second h2
      line at 0.3.27 via `aws-smithy-http-client`; it cannot move.

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
      alerts were dismissed by hand on 2026-08-13 as not-used, on the sharper
      ground that those parsers only run in texture-compressor's Node CLI path
      and never in the browser bundle. The `dompurify` advisory alongside them was investigated and is
      NOT reachable here: it needs `IN_PLACE` sanitizing with hook removal,
      viewtopia disables the Cesium InfoBox, and cesium 26.1.0 calls DOMPurify
      in one place only, `Credit.js`, in the string-returning mode. Recorded so
      nobody investigates it twice.

      The fourth alert, `postcss` (CVE-2026-69153, an attacker-chosen
      `sourceMappingURL` reading arbitrary `.map` files when `from` is unset),
      was dismissed as stale: it named `package-lock.json`, which the pnpm
      migration deleted, and the root lockfile is on 8.5.25, past the 8.5.23
      fix. What it did not report is real: `dashboard/pnpm-lock.yaml` carries
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

- [ ] **collecta increment 3: push submissions into ptolemy** as versioned
      features, deliberately parked until the panel proves demand. Needs the
      form-schema-to-dataset mapping, incremental sync off collecta's
      cursor, and a decision on who owns the bridge (an exporter in collecta
      versus a puller elsewhere). Print-resolution rendering and collecta
      increments 1–2 (compose + Field Data panel) shipped 2026-08-14.

- [ ] **read-only warehouse sources** (weigh before building) — Felt reads
      Snowflake/BigQuery/Databricks live, enterprise-only. Ptolemy already
      does external read-only PostGIS tables; the same model could take a
      warehouse driver. Only worth it when a real user asks: it is
      enterprise-pull, and the thesis says refuse parity fights.

- [ ] **if any of this is wanted, the in-thesis version is a live layer, not a
      sensor platform**: fluvius emitting over WebSocket into agora, which
      already carries live multiplayer. One connector, reusing shipped
      infrastructure. It also answers FleetPanel, which is the same gap.
      A sensor historian is off-thesis. Parked 2026-08-13, no use case to test
      against. Full write-up under **Plans** below.

- [ ] **viewtopia FleetPanel** — currently an honest "no live feed" state; nothing serves
      vehicle positions. Same gap as the live layer, same answer: fluvius over
      WebSocket into agora rather than a new ingest path.

- [ ] **terravista v0.3** — Metal/Vulkan GPU rendering. Biggest advertised-vs-real
      gap on mobile, needs platform GPU toolchains, post-v1 by the existing
      phasing, competes with the hosted flagship for attention. The labelling
      half is already done, the README says plainly it is not a Mapbox
      replacement, so what is left to decide is whether to build the GPU
      backends at all.

- [ ] **terravista has no iOS or macOS anything.** No `.swift`, `.h`, `.modulemap`,
      `Package.swift` or podspec, no cbindgen config, no generated C header, no
      iOS CI job. The README's Swift example imports a module that does not exist,
      and "macOS" appears nowhere in the codebase. Its JNI is hand-written, not
      generated from a header as the docs claim.

- [ ] **terravista's style engine is unreachable and does not parse Mapbox GL
      JSON.** The structs are snake_case serde derives with no renames, while real
      styles use `type`, `minzoom`, `paint["fill-color"]` and stop functions. No
      `tv_` FFI symbol touches the style module, so no host can supply one, and
      the renderer uses its own hardcoded style keyed by layer name.

- [ ] **panoptes model weights** — train or source one usable segmentation model and publish
      weights. The "keep it clearly labeled experimental" branch is done (2026-08-13), so
      nothing oversells itself now, but no weights exist and segmentation still does
      not work out of the box. The ONNX inference path is real and proven end to end from the
      CLI against a synthetic sigmoid model.

- [ ] **the next adapter after Esri.** v0.1 covers KML/KMZ, v0.2 the Esri File
      Geodatabase. Pick the next from real customer data rather than
      guesses, and check it against GDAL's driver list before committing to it. The
      recorded order of demand puts the photogrammetry and reality-capture stacks
      next, then the CAD-adjacent platforms. Blocked on real customer data rather
      than on engineering. Full verne write-up under **Plans**.

- [ ] **collecta conditional visibility is unread in the form model.** The
      `Condition` type exists, validation never looks at it, and the XLSForm
      importer sets it to `None`. It works only on the XLSForm path where the raw
      expression passes through to ODK Collect on the device. Its README also
      claimed GeoGit and GeoKode integrations; neither repo references collecta.

- [ ] **geogit's three-way merge is dead code**; `cmd_merge` shells out to plain
      `git merge`, so two edits to one feature become a binary conflict on a
      MessagePack blob. Kart compatibility is also broken three ways (geometry
      serializes as a MessagePack integer array not bytes, the GPKG header keeps
      the source SRS id where Kart requires 0, and `meta/crs/` is documented and
      never written).

- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.

- [ ] **symbology, the one piece left**: a data-defined point size does not reach
      QML. QGIS sizes a symbol in the symbol's own units and needs a
      `<data_defined_properties>` block whose exact spelling nobody here has
      verified against a real QGIS writer, so the export reports the loss rather
      than guessing. Closing it needs a `.qml` written by an actual QGIS to read
      the encoding off. Everything else in the first cut is done.

- [ ] **offline area download**: regions download and the app shell is
      service-worker cached. What is left is in the offline story: DuckDB's
      spatial extension still fetches from extensions.duckdb.org, and the story
      export fetches MapLibre from unpkg plus tiles from the tile host. The tile
      cache stores every tile ever viewed, with no size cap and no clear-all.

- [ ] **composite latency on dense collections**: memory is bounded (folds peak
      at one wave, median and percentile reduce in strips under a fixed 4 Mi
      value budget), and since 2026-08-13 a strip reads only the items whose
      footprint reaches its own rows rather than the whole stack. What remains
      is that strips run one after another, so a stack deep enough to need N
      strips pays N passes of read latency, over the same distinct bytes since
      shared tiles come from the byte cache. geoplumb's own DESIGN.md still says
      the item list never narrows per strip, which that change contradicts.

- [ ] **geoplumb breadth**: GEE ships a huge operator library and charting/reduction
      over regions. Grow by demand, not by checklist.

- [ ] **most of those operators are library-only, not reachable from a served
      layer.** `OpConfig` in geoplumb-server accepts `hillshade`, `bandmath`,
      `slope` and `aspect` and nothing else, so reclassify, focal statistics,
      quality masking, convolution, mosaic, reproject, rasterize and the vector
      ops exist in the engine but cannot be configured on a layer. Either widen
      `OpConfig` or say plainly that the server exposes four of them.

## Open decisions that are not bugs

Deliberate scope calls, each a product decision rather than a defect to fix.

- [~] **geodukt as plan substrate**: plan-then-approve flow shipped. Every plan
      step now carries `runs_caller_code`, set from the tool's own
      `TOOL_RUNS_CALLER_CODE` declaration, so the panel can mark an escape-hatch
      step before approval, and PlanPanel marks it. Marking it is as far as it
      goes: the owner decided 2026-08-12 that approval costs no extra click,
      because gating it means sql_query emitting a one-step plan instead of a
      viewer command, which adds a click to every ad-hoc query. Still open:
      sql_query called on its own bypasses the plan surface entirely, so it
      stays persona-discouraged there. The NL agent `sql_query` bypass is real:
      `TOOL_RUNS_CALLER_CODE = True` is declared only on sql_query, plan steps
      carry the flag, and the approval panel labels such a step rather than
      gating it, with the discouragement living in the persona text. It is
      bounded to `/chat`, since `/mcp` drops the tool from both the manifest
      and the call path.

- [~] **permission-aware enforcement**: the far end is now enforced in every
      service (per-repo changelogs): tiletopia gates annotations, plugin
      mutations and the asset listing, collecta enforces roles and form
      ownership, geolang requires a platform JWT on everything that runs code,
      writes a file or reads back user data (chat, sessions, uploads, outputs),
      and geodukt's `/run` takes an editor-or-admin platform token or a
      role-free tool token carrying the exact `geodukt:run` scope, both on the
      shared secret. The org schema that the write ladder never read was dropped
      (ptolemy migration 028). Unknown role strings fail closed everywhere.

- [ ] **tiletopia asset metadata is only listing-filtered.** `GET /assets`
      hides other tenants' rows, but `GET /assets/{id}` still answers for any
      valid token, and the Ion-compat `/v1/assets/{id}` is public by design, so
      gating one and not the other would be theater. Tiles are public regardless
      (the CDN TTLs depend on it). Decide whether asset metadata is tenant
      private, and if so do both routes and the CDN together. tiletopia's
      `GET /assets/{id}` applies no authorization, but it is absent from
      `is_public_read`, so it needs a valid token: any valid token reads any
      asset's metadata. The Ion-compat `/v1/assets/{id}` is genuinely public, and
      so is every asset's `tileset.json` and tile payload.

- [ ] **tiletopia annotation reads are open** to any valid token on any asset.
      Writes are owner-or-admin. Only worth closing if annotations count as
      private content. tiletopia annotation reads answer for any valid token
      while writes go through `may_modify_asset`.

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
      private-asset tile gating ever ships.

- [ ] **collecta legacy forms with no creator are admin-only** and are not
      backfilled to anyone. Decide whether to backfill or leave them.
      A legacy form with no creator is admin-only for both read and write and is
      never backfilled. What actually bypasses `form_grants` is not
      legacy-specific: form discovery answers any authenticated caller and
      submission is role-only, both pinned by tests as intended behaviour.

- [ ] ptolemy merge is **attribute-level** for disjoint property edits (shipped
      2026-08-15). Same-key and both-sides-moved-geometry still conflict.

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
      table. The table is `const BODY` in `route_sweep.rs` and holds 93 entries, not
      130, which was a rough count across three tables. Its values are domain-tuned
      rather than derivable from struct shapes: 34 carry fixture-id markers, 11 carry
      WKB hex and 2 more carry GeoJSON, and the sweep's whole point is that the
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
      constrains its own members to a shared one. Reprojecting at extraction
      (shipped) makes the data correct and renderable. The original coordinates
      now survive it: a commit operation may carry the untransformed geometry and
      its EPSG code beside the working copy. Getting the numbers back out
      unchanged now works per feature through the native read, so supporting
      per-dataset srid later is worth it only if someone needs to query and serve
      in the native frame. Supporting per-dataset srid later needs no storage
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

The geoprocessing NULL panic is real but latent: `merge` and `simplify`
were fixed 2026-08-13 and contour was deliberately left, because no
PostGIS build ships `ST_ContourLines`, so that route answers 501 first.

## Plans — too big to hand an agent cold

### Hosted flagship instance, the thesis blocker

See **Before any public deploy**. The executor and token-exchange preconditions
are closed. Share links exist. What is open is the AWS account, the apply
sequence, and the anonymous-edit / link-expiry policy.

### Live layer, if you want fluvius wired in

Decided 2026-08-13 that a sensor historian is off-thesis but a live layer is not.
The plan, should it ever be wanted: fluvius emits over its existing WebSocket
sink into agora, which already carries live multiplayer, and viewtopia renders it
as an ordinary layer whose features move. No new ingest path, no new store, no
observation history. This also answers FleetPanel, which is the same gap.

Unknowns to settle first: whether agora's attachment model can carry a
high-frequency feed without competing with collaboration traffic, and what
happens to a live layer's features when a user edits or saves the map.

### Region watch (parked 2026-08-13)

One feature with two halves: a region you care about, watched over time, fed by
live sensor streams and by imagery, alerting when it changes. No use case
available to test against. Written up while it was fresh rather than built.

What already exists, verified rather than assumed:

- **fluvius** is a real stream processor, not a stub. Geofencing with per-entity
  state, complex event processing, tumbling/sliding/session windows, watermarks,
  an rstar R-tree behind the proximity operator, and MQTT, Kafka and WebSocket
  connectors. 187
  test functions, 181 passing under `--all-features`. The "millions of entities"
  the README claims is a design target rather than a measurement: the repo has
  no benchmarks and no test above trivial scale. It is deployed nowhere: no
  reference in the terraform, the platform compose, or the proxy Caddyfile.
- **geoplumb** already answers the hard half of region change. `POST
  /zonal/{layer}` returns zonal statistics over a region and `POST
  /zonal/{layer}/series` returns a time series, on demand, against STAC
  collections or local COGs. That is region change tracking already, missing only
  persistence and a schedule.
- **terrano** has `RasterStack`: composites, linear trend fitting, change
  detection, anomaly z-scores, phenology metrics, normalized difference indices.
- **panoptes** does pixel-difference change detection, plus an ONNX segmentation
  path that works but ships no weights.
- **ptolemy** versions features with branch, diff, merge and audit, so change over
  time on *vector* data is already a solved problem here.
- **viewtopia** has TimelinePanel, TimelapsePanel and HeatmapPanel.
- **tiletopia** carries one written, unit-tested but unwired module worth
  reusing here: `scripting.rs` (threshold triggers, comparison operators, alert
  severities). It is referenced only by its `pub mod` line. `geofence.rs` is not
  spatial geofencing despite the name: it is data-residency policy. The realtime
  WebSocket is real but carries a closed enum of six collaboration messages and
  logs-and-drops anything else, so a sensor feed through it needs a new message
  variant, not a new socket.

What is missing, in dependency order:

1. **the watch object.** A persisted region plus its sources, rule and cadence.
   Nothing holds one. Decide where it lives: ptolemy already versions geometry
   and would give diff and audit for free, but a watch is configuration rather
   than a feature, so it may not belong in a feature store.
2. **the scheduler.** Something has to re-run the pull and compare. geoplumb is
   pull-only by design and computes only when asked. Do not put a scheduler
   inside it. The trigger belongs outside. tiletopia already mounts a
   scheduler-shaped facade that has never run a job. Replace or delete it, do
   not start from it.
3. **the result store.** A per-watch time series of readings and detected
   changes. Bound it up front with a retention window and a per-watch cap.
4. **alerting.** fluvius already does thresholds and CEP over streams. Delivery
   is already written twice and driven zero times (`ptolemy-api/src/delivery.rs`,
   tiletopia's `webhooks.rs`). Give one of those a caller instead of writing a
   third.
5. **sensor ingest.** fluvius deployed as a service with MQTT and WebSocket
   sources, emitting into agora. Same as the live-layer plan.

Sequencing. Raster first: a watch over a region with a scheduled `/zonal/series`
call, a threshold and a webhook is a working, useful feature that needs no new
compute at all. Sensors second. This is the largest addition in the backlog and
it competes with the hosted flagship for attention. The raster-first sequencing
is what keeps it affordable, because it reuses geoplumb wholesale.

Open questions to settle before building: whether watch results belong in
ptolemy, retention per watch, what a shared or anonymous viewer sees of a watch,
whether the sensor half should speak OGC SensorThings API, whether agora can
carry a high-frequency feed.

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

- [ ] **verne: the rest of the hosted Esri story.** verne lists a portal's
      feature services, reads a FeatureServer or MapServer whole or scoped to
      one layer with the operator's token or one it mints itself, and carries
      the untransformed originals. The loader is no longer unchanged: it commits
      deltas, posts each layer's drawing info as one symbology rule, and applies
      attachment adds, replacements and deletes. Still open:
      - the version tree. verne reads any named version (`--gdb-version`, one
        per extraction), names which layers front versioned data and change
        tracking, and implements `extractChanges` as the preferred delta path
        with a local diff fallback. What stays open is carrying the tree itself,
        which means the VersionManagementServer resource: its `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license. That needs an enterprise
        deployment verne may exercise. The ptolemy mapping is no longer a
        blocker on it: the sidecar carries insert, update and delete ops, and a
        persisted objectid-to-feature-id index (`object-ids/`) survives across
        extractions.
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
