# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — a completed item is deleted; durable design knowledge folds
> into DESIGN.md's current-state sections, dated history goes in per-repo changelogs.
> Last brought current: **2026-08-13**.

---

## IN FLIGHT — 2026-08-14 session

Closed this session before dispatch: the React E2E break on every master push
since 2026-08-13 (the terrain panel's bundle-list fetch 500s with no platform
stack, and yesterday's console-guard allowance for it was written but never
committed, now landed), the stale tiletopia `agent/scoped-tool-tokens` worktree
and branch (merged, pruned), and the terravista version disagreement (workspace
Cargo version and gradle `VERSION_NAME` now match the changelog's 0.4.0, the
Android README keeps 0.2.0 because that is the latest JitPack tag). The two
geoplumb composite-latency tracks from 2026-08-13 landed and pushed.

The sensor claims verification also closed this session: verdicts and evidence
are in both repos' changelogs, and the durable finding is folded into the
region watch inventory below. The Logistics row and plugin description were
corrected the same way (FleetPanel is an honest empty state, only the delivery
optimizer is real).

## OPEN — direction: the Figma of GIS, only open (stated 2026-08-06)

The owner's product thesis: GeoLang becomes what Figma is to design, for GIS,
as open source. Assessed feasible 2026-08-06. The proprietary occupant of this
position is Felt (browser-native, real-time collaboration, freemium, "Google
Docs of GIS", 500+ teams as of 2026), which proves the demand; the open-source
quadrant is empty (QGIS is desktop single-user, GeoNode et al are plumbing).
The counter-position: open, self-hostable, data stays in your PostGIS, plus an
analysis engine (geoplumb) at a depth Felt lacks. AGPL already guards against
cloud strip-mining.

What the stack already covers: browser viewer with real tools (viewtopia),
versioned feature store with branch/diff/merge/audit (ptolemy, the version
history half, which Felt does not have), GEE-track compute (geoplumb), tiles,
mobile capture, auth and multi-tenancy, one-click deploy.

Live multiplayer shipped 2026-08-07 (agora service + viewtopia client,
current state in DESIGN.md). Open work from it:

- [ ] **hosted flagship instance + share links** — Figma's zero-install magic
      is a link that opens the document. Self-host is free with open source,
      but the "click a link, you're in the map" experience needs a hosted
      deployment. Ops and money, parked on the same AWS account decision as
      geoplumb in-region serving (2026-08-05). The executor precondition
      (decided 2026-08-09) is closed: tool code runs in `geolang-executor`,
      a container holding no platform signing secret, no service account and
      no model key, with capabilities dropped and resource limits, and the
      platform compose wires it (see geolang's DESIGN.md and README). The
      bearer question closed 2026-08-12: geolang exchanges the caller's JWT at
      the tool boundary for a five-minute token carrying only that tool's
      operation scopes, and ptolemy, geodukt, tiletopia and agora each enforce
      the scope claim (per-repo changelogs).

From the Felt comparison (2026-08-07, sourced from their docs): the gaps
below are where their product is ahead in ways that serve the same
collaborative workflow, so they are in-thesis rather than parity chasing.
Felt has no versioning, no routing, no 3D and self-hosts only on
enterprise contracts, so those fronts need no response.

- [ ] **read-only warehouse sources** (weigh before building) — Felt reads
      Snowflake/BigQuery/Databricks live, enterprise-only. Ptolemy already
      does external read-only PostGIS tables; the same model could take a
      warehouse driver. Only worth it when a real user asks: it is
      enterprise-pull, and the thesis says refuse parity fights.

Scope discipline that follows from the thesis: Figma did not beat Photoshop
on features, it won one workflow. Win "a team makes and analyzes a map
together in the browser" and refuse feature-parity fights with ArcGIS.

## PLANS — the bigger features, written up 2026-08-13

Each of these is too big to hand an agent cold. Written as a plan rather than a
line item so the next session starts from the shape rather than rediscovering it.

### Hosted flagship instance, the thesis blocker

Hosting was deferred by owner decision 2026-08-13, so everything in this section
is parked with it, along with the hosted stack decisions, the database TLS
operator steps, the CloudFront realtime test and geoplumb in-region serving. It
is still the thesis blocker, because the thesis is "click a link, you're in the
map" and nothing else delivers that.

State: the executor precondition closed 2026-08-09, the tool-boundary token
exchange closed 2026-08-12, and the 2026-08-13 terraform pass closed force_ssl,
immutable tags, the agora and jupyter security group splits, and the ALB
restriction. So the infrastructure is no longer the blocker.

What actually stands in the way, in order:
1. **the AWS account decision** (open since 2026-08-05, also blocks geoplumb
   in-region serving). Nothing proceeds without it. It is money and ops, not
   engineering.
2. **four owner calls**, each listed under platform hygiene above: ptolemy
   classifying every GET as public, terraform CI moving to OIDC, the S3 state
   backend needing a bucket, and the executor's 8081 admitting the VPC CIDR.
   Only the first is a genuine blocker for a public domain. The other three are
   things you would regret later rather than at launch.
3. **the mechanical apply blockers**, in infrastructure's README: the geolang
   image must contain application source, every enabled ECR image must be pushed
   under `image_tag`, EFS spatial and coverage data staged, and every secret
   container given a value including the two database URLs with
   `sslmode=verify-full`.
4. **share links themselves**, which do not exist yet in any repo. A link that
   opens a document for someone with no account needs a decision on what an
   anonymous viewer may see and do. That is a product design question, not a
   deploy step, and it is worth separating from the deploy so the deploy is not
   held up by it.

Suggested order: deploy privately first with no share links, prove the stack
runs in-region, then design sharing against a real instance.

### Live layer, if you want fluvius wired in

Decided 2026-08-13 that a sensor historian is off-thesis but a live layer is not.
The plan, should it ever be wanted: fluvius emits over its existing WebSocket
sink into agora, which already carries live multiplayer, and viewtopia renders it
as an ordinary layer whose features move. No new ingest path, no new store, no
observation history. This also answers FleetPanel, which is the same gap.

Unknowns to settle first: whether agora's attachment model can carry a
high-frequency feed without competing with collaboration traffic, and what
happens to a live layer's features when a user edits or saves the map.

### terravista v0.2 and v0.3, the biggest advertised-vs-real gap

v0.2 is HTTP tile fetch and MVT decode, so the SDK can actually draw a map. v0.3
is Metal and Vulkan rendering and needs platform GPU toolchains. Both are real
implementation work rather than decisions.

Worth saying plainly: this is post-v1 by the existing phasing, and it competes
with the hosted flagship for attention. The honest options are to do it properly
or to label the SDK's current reach as clearly as panoptes now labels its own.
Doing neither is what leaves a README overselling.

### verne, the next adapter

Blocked on real customer data rather than on engineering. v0.1 is KML/KMZ and
v0.2 is the Esri File Geodatabase. The recorded demand order puts photogrammetry
and reality-capture next, then CAD-adjacent platforms. Check any candidate
against GDAL's driver list before committing, and do not assume a reader exists.
The enterprise version tree is separately blocked on an enterprise deployment to
test against, with requirements documented under the verne section below.

### viewtopia product gaps: closed 2026-08-13

Both shipped: the Data Sources panel (Services, Database and Files tabs, old
panel ids open the right tab) and the print layout panel (page composition
with title, legend, scale bar and north arrow, PDF export, atlas capped at 60
pages, the old PrintExportPanel absorbed with its id aliased). Two known
limits worth keeping: Leaflet cannot be captured (tiles are img elements, same
as the old export), and the printed map is the live frame scaled to the page,
so a 300 DPI page carries screen-resolution pixels. Print-resolution rendering
means an off-screen render at target size, a separate piece of work.

## FEATURE — region watch: IoT sensors and change over time

One feature with two halves: a region you care about, watched over time, fed by
live sensor streams and by imagery, alerting when it changes.

**Parked 2026-08-13**, no use case available to test against. Written up while it
was fresh rather than built. Nothing here is in progress. Pick it up when a real
region and a real feed exist to point it at, since every open question below
needs a concrete case to answer well.

**What already exists**, verified rather than assumed:

- **fluvius** is a real stream processor, not a stub. Geofencing with per-entity
  state, complex event processing, tumbling/sliding/session windows, watermarks,
  temporal joins, an R-tree over millions of entities, and MQTT, Kafka and
  WebSocket connectors. 182 tests. It is deployed nowhere: no reference in the
  terraform, the platform compose, or the proxy Caddyfile.
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
- **tiletopia** carries two written, unit-tested but unwired modules, verified
  2026-08-14: `scripting.rs` (threshold triggers, comparison operators, alert
  severities) and `geofence.rs`. Each is referenced only by its `pub mod` line,
  no route or `AppState` field constructs either, so wiring them is route work,
  not engine work. The realtime WebSocket is real but carries a closed enum of
  collaboration messages and drops anything else, so a sensor feed through it
  needs a new message variant, not a new socket. The sensor claims audit
  (2026-08-14, both repos' changelogs) removed the README claims these backed.

**What is missing**, in dependency order:

1. **the watch object.** A persisted region plus its sources, rule and cadence.
   Nothing holds one. Decide where it lives: ptolemy already versions geometry
   and would give diff and audit for free, but a watch is configuration rather
   than a feature, so it may not belong in a feature store.
2. **the scheduler.** Something has to re-run the pull and compare. geoplumb is
   pull-only by design and computes only when asked. Do not put a scheduler
   inside it, that breaks its one architectural rule. The trigger belongs
   outside.
3. **the result store.** A per-watch time series of readings and detected
   changes. This is the real observation-store gap. For raster it is small, one
   row per run per region. For high-frequency sensors it is not, and that is the
   piece that quietly turns into an IoT platform if left unbounded. Bound it up
   front with a retention window and a per-watch cap.
4. **alerting.** fluvius already does thresholds and CEP over streams. On the
   raster side the rule is a threshold on a zonal statistic or a z-score.
   Delivery is the open question, a webhook is the cheapest first answer.
5. **sensor ingest.** fluvius deployed as a service with MQTT and WebSocket
   sources, emitting into agora so viewtopia renders it as an ordinary layer
   whose features move. No new ingest path and no new store, since agora already
   carries live multiplayer. This also answers FleetPanel, which is the same gap.

**Sequencing.** Raster first: a watch over a region with a scheduled
`/zonal/series` call, a threshold and a webhook is a working, useful feature that
needs no new compute at all. Sensors second, because that half needs fluvius
deployed and the bounded store designed. Splitting it this way means something
ships before the expensive part starts.

**Open questions to settle before building:**

- whether watch results belong in ptolemy as versioned features, which brings
  diff and audit for free, or in their own store
- retention, per watch, for sensor readings. Decide the number before writing the
  store, not after
- what a shared or anonymous viewer sees of a watch, which ties to hosted share
  links
- whether the sensor half should speak OGC SensorThings API or a private schema.
  SensorThings is the standard and buys interoperability, but it is a large
  surface to implement and nothing in the tree speaks it today
- whether agora can carry a high-frequency feed without competing with
  collaboration traffic, and what a live layer's features do when a user saves
  the map

**Scope note, recorded once.** This is the largest addition in the backlog and it
competes with the hosted flagship for attention. The raster-first sequencing is
what keeps it affordable, because it reuses geoplumb wholesale.

- [ ] **if any of this is wanted, the in-thesis version is a live layer, not a
      sensor platform**: fluvius emitting over WebSocket into agora, which
      already carries live multiplayer. One connector, reusing shipped
      infrastructure. It also answers the FleetPanel question below, since
      "nothing serves vehicle positions" is the same gap. A live layer is
      Figma-shaped. A sensor historian is not.

Note on `viewtopia/docs/verticals.md`: it is a planning doc for proposed
verticals, not a description of what exists, which is why it credits panoptes
with observation management and sensor monitoring that panoptes never did. Read
it as a wishlist.

## OPEN — stale entries keep turning up

Three items in this file were closed already when someone went to work on them:
ptolemy's `/check` org_members fallback (the org schema was dropped in migration
028), collecta media attachments (implemented in `ea8f66d` and `b4dfc7e`), and
collecta's "deferred" per-form grants table (it exists as `form_grants`). In each
case the entry named a mechanism that no longer existed, and in the ptolemy case
a real bug was still there for a different reason.

- [ ] Verify an entry against the code before working it, and do not trust the
      mechanism it names.

      The sweep is finished and found no further stale entries. It confirmed as
      current, with evidence: the ptolemy topology raw-writes gap
      (`ci/no-raw-writes.sh` itself documents that it cannot see a mutating
      function called through `SELECT`, naming those three by name), the
      geoprocessing NULL panic, collecta legacy-form access, the terrain wiring,
      tiletopia's Ion-compat endpoint and ptolemy's feature-level merge.

      The second pass closed the rest. The NL agent `sql_query` bypass is real:
      `TOOL_RUNS_CALLER_CODE = True` is declared only on sql_query, plan steps
      carry the flag, and the approval panel labels such a step rather than
      gating it, with the discouragement living in the persona text. tiletopia
      asset metadata is as described, `GET /assets` filters rows through
      `may_view_asset` while `GET /assets/{id}` applies no check at all and the
      Ion-compat `/v1/assets/{id}` is public. tiletopia annotation reads answer
      for any valid token while writes go through `may_modify_asset`. The
      viewtopia data source manager and print layout panels both really are
      missing: the panel registry in `ToolPanels.tsx` names 67 panels and
      neither is among them, and `PrintExportPanel.tsx` scales the live canvas.

## OPEN — platform hygiene

- [ ] **CloudFront realtime WS untested live**: the realtime behavior forwards
      `Sec-WebSocket-Protocol` and has a zero TTL, but the distribution has never
      carried a real collaboration session. Test it on the deployed distribution.
- [ ] **hosted stack decisions before a public deploy** (from the 2026-08-13
      security review of the hosted terraform). The mechanical half closed the
      same day, see the in-flight section. What is left needs an owner call:
      - ptolemy classifies every GET/HEAD/OPTIONS as public, so the entire
        geodatabase read API is anonymous on a public domain.
      - the terraform plan CI job authenticates with long-lived AWS access
        keys rather than OIDC.
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

## OPEN — dependencies and supply chain (2026-08-12)

Renovate grouped four breaking cargo bumps into one "non-major" PR, because it
classifies major/minor/patch positionally and a `0.x` minor bump is still a
minor to it. The shared config now guards both the cargo and npm groups with
`isBreaking != true`, so breaking updates arrive as separate PRs. What that
left open:

- [ ] **advisories nobody can upgrade out of (2026-08-12).** `cargo deny check
      advisories` reports findings in all four Rust repos. CI stays green
      anyway: every repo runs that step with `continue-on-error: true`, so it
      reports without gating, which is the policy already in place and is the
      right one while the fixes are not ours to make. The point of this entry
      is that the findings are real even though nothing goes red.

      Cleared 2026-08-12: `crossbeam-epoch` to 0.9.20 in all four
      (RUSTSEC-2026-0204) and `anyhow` to 1.0.104 in ptolemy
      (RUSTSEC-2026-0190). Both were lockfile-only.

      Outstanding, none fixable from here. Two of them print a "try
      `cargo update -p ...`" hint that does not work, because the version they
      want is a major ahead of what a transitive dependency requires, so cargo
      locks nothing. Verify with `--dry-run` before believing that hint again.
      - ptolemy: `rsa` 0.9.10, the Marvin timing sidechannel
        (RUSTSEC-2023-0071), through sqlx-postgres. No upgrade published.
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
      geodukt it is `md-5` 0.10 reaching the graph through `object_store`. In
      ptolemy it is sqlx 0.8, mongodb 3.7 and openidconnect 4.0, all still on
      sha2 0.10, so the 0.11 bump added a second copy rather than replacing
      one. `deny.toml` warns on duplicates rather than failing in both, so CI
      is green. Each resolves itself when those upstreams move. geokode and
      itinera took the same bump with no duplicate, so this is not inherent to
      sha2 0.11.
- [!] **enable the dependency graph for GeoLang repos, an owner-only click.**
      Diagnosed 2026-08-13: the graph is DISABLED for viewtopia (and every
      GeoLang repo probed, their SBOM endpoints all 404), because GitHub turned
      it off by default for new public repos in May 2025 and this org never
      enabled it, while Dependabot alerts stayed on. Alerts therefore keep
      matching new advisories against the last snapshot ever computed, taken
      from `package-lock.json` before the pnpm migration deleted it, which is
      why every one of the 22 alerts carries that manifest path and ghosts keep
      firing on ranges the tree left long ago (alert 19, dompurify, is such a
      ghost: the tree holds 3.4.13, past the fix). No workflow can help, the
      submission API 404s while the graph is off, and none is needed: pnpm v9
      lockfiles parse natively once it is on. Fix is owner-only, either per repo
      (Settings, Advanced Security, Dependency graph, Enable) or org-wide via a
      code-security configuration with `dependency_graph: enabled` attached to
      all repos without one (needs `write:org`, which the local gh token lacks).
      After enabling, the SBOM endpoint should return ~1000 packages and the
      alerts should re-resolve against `pnpm-lock.yaml`; whether stale alerts
      auto-close was not verifiable in advance, so check alert 19 and dismiss it
      by hand if it survives.
- [ ] **viewtopia's two `image-size` advisories have no fix published.** Both
      are denial of service through infinite loops in the JXL, HEIF and ICNS
      parsers, reached through deck.gl's texture-compressor. Nothing to upgrade
      to yet. The `dompurify` advisory alongside them was investigated and is
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

## OPEN — post-MVP: tiletopia tile edge caching (decided 2026-07-28)

- [ ] The CloudFront `/tiles/v1/*` cache behaviors have never matched a real
      tiletopia route, so tiles are not edge-cached on AWS (they ride the safe
      TTL-0 default). Aliasing the API under `/tiles/v1/` is blocked three ways:
      tiletopia's `is_public_read` treats any path containing `/tiles/` as
      public (the alias would expose the whole authenticated GET surface),
      routes are registered with absolute paths, and four handlers emit
      absolute `/api/v1` URLs in responses. Viable designs, pick one post-MVP:
      host-based `tiles.<domain>` routing (native ALB support, but CORS and
      viewer URL changes), or first rewrite `is_public_read` to anchored
      prefix matches, then the route/URL refactor. A dead-behavior TODO sits
      in infrastructure/modules/cdn/main.tf until then.

## OPEN — deferred decision: private-asset tile gating

- [ ] tiletopia serves every asset's tiles publicly (`is_public_read`), even
      for private assets: anyone holding the asset id can read them. The
      aggressive CloudFront TTLs on tile paths depend on tiles staying
      public. If private assets ever need gated tiles, decide together:
      per-asset visibility check in the tile path AND a CDN redesign
      (authenticated tiles cannot keep the shared long-TTL cache).

## OPEN: NL agent as plan substrate (decided 2026-07-29)

Decision: the NL agent's differentiator is trust with local open models. Instead
of free-form sequential tool calls, the model emits a geodukt manifest as the
execution plan: visible before running, validated, lineage-tracked, rerunnable,
results downloadable via the new GeoPackage/Shapefile sinks. Three spec items
(typed tools, visible plans, provenance) collapse into this one substrate.
Order: substrate first, eval harness alongside, permission propagation before
anything multi-user ships, local packaging last.

- [~] **geodukt as plan substrate**: plan-then-approve flow shipped (see the
      history log). Every plan step now carries `runs_caller_code`, set from the
      tool's own `TOOL_RUNS_CALLER_CODE` declaration, so the panel can mark an
      escape-hatch step before approval, and PlanPanel marks it. Marking it is
      as far as it goes: the owner decided 2026-08-12 that approval costs no
      extra click, because gating it means sql_query emitting a one-step plan
      instead of a viewer command, which adds a click to every ad-hoc query.
      Still open: sql_query called on its own bypasses the plan surface
      entirely, so it stays persona-discouraged there.
- [~] **permission-aware enforcement**: the far end is now enforced in every
      service (per-repo changelogs): tiletopia gates annotations, plugin
      mutations and the asset listing, collecta enforces roles and form
      ownership, geolang requires a platform JWT on everything that runs code,
      writes a file or reads back user data (chat, sessions, uploads, outputs),
      and geodukt's `/run` follows the shared platform secret. The org schema
      that the write ladder never read was dropped (ptolemy migration 028).
      Unknown role strings fail closed everywhere.
- [ ] **local deployment packaging (last)**: GPU detection, quantized model
      download, context config, inference-server setup. Wrap llama.cpp/ollama
      tooling rather than build. The differentiation lives in the eval harness
      proving which local model suffices, not in the installer.

## OPEN — ptolemy: what the write guard still leaves open (2026-07-30)

The runtime gate and the compile-time guard both shipped (history log). What is
left is the edges neither reaches.

- [ ] `ci/no-raw-writes.sh` cannot see a mutating Postgres function called through
      `SELECT`. `topology.rs` does exactly that (`SELECT topology.CreateTopology`,
      `AddFace`, `TopoGeom_addElement`), so those three routes are guarded only by
      being instance-admin-only in `auth.rs`. If topology is ever bound to a
      dataset, they need the ladder and the check needs to learn about them.
- [ ] `unguarded_pool()` exists because the CLI and the test fixtures are separate
      crates and could not use a crate-private accessor. Nothing in ptolemy-api may
      name it and the CI check enforces that, but it is a named accessor rather
      than a barrier. Revisit if the CLI ever grows a path that should be laddered.
- [ ] None of the above holds when auth is off (an empty `PTOLEMY_JWT_SECRET`):
      the ladder and the visibility layer both no-op by design.
- [ ] Two operational consequences of dropping the zero-rows rule, for whoever
      deploys first: a deployment needs at least one instance-admin token holder,
      because that is the only actor who can grant on a dataset the backfill
      skipped (blank or machine `created_by`), and any service account writing to
      datasets it did not create needs an explicit grant where the editor role
      alone used to pass.

## OPEN — ptolemy: what the route sweep still reports (2026-08-01)

The sweep closed the missing-column class: every mounted route is called against
a migrated database and 42703/42P01 fails CI (see the changelog). The fixable
class of its standing 500s closed 2026-08-04 (changelog again), and the same day
closed the pgRouting id mapping (junction uuids ranked to bigints per statement,
validated end to end against pgRouting 3.8) and removed the never-worked
`branches/{id}/reproject` route. What is left needs a decision rather than a
fix.

- [ ] the sweep only covers the SQL branches its fixtures reach, which is what
      query variants are for, and a handler that swallows its error is invisible
      to it. Add a variant when a route grows a second branch.
Decided against 2026-08-13: keeping the script that generated the request-body
table. The table is `const BODY` in `route_sweep.rs` and holds 93 entries, not
130, which was a rough count across three tables. Its values are domain-tuned
rather than derivable from struct shapes: 34 carry fixture-id markers, 11 carry
WKB or GeoJSON, and the sweep's whole point is that the handler reached SQL,
which needs values that pass validation. It also self-maintains, since adding a
route that refuses `{}` fails the sweep by name.

## OPEN — verne: get your data out (named 2026-07-29, v0.1 shipped same day)

Rationale: lock-in, not features, is what stops an org moving off an incumbent
platform, and nothing in the tree reads a proprietary project or enterprise
database from one today. Vendor-neutral by design: a common core (connect,
inventory, report fidelity, extract) with a thin adapter per source, so no single
vendor shapes the architecture. Candidate adapters in rough order of demand: the
large enterprise GIS suites, the photogrammetry and reality-capture stacks, the
CAD-adjacent platforms, the earth-browser exports, and the legacy desktop
formats. Per-source feasibility must be checked against GDAL's driver list before
any adapter is committed to; do not assume a reader exists.

A new repo rather than geodukt, because the dependency surface (GDAL with
optional drivers, REST/token auth, possibly ODBC and vendor database clients) and
the risk profile (it holds customer credentials) should not land on every geodukt
user. It emits GeoPackage/Parquet plus a semantics sidecar; geodukt and ptolemy
consume that through the source interface they already have.

Rust (owner decision 2026-07-29), consistent with the rest of the platform. GDAL
being C++ does not argue against it: GDAL exposes a stable C API, which is what
every binding wraps. Two constraints that follow, because verne would be the
first GDAL dependency here and the only native geo dependency today is geodukt's
PROJ, which vendors through cmake and is why that image takes minutes to build:

- GDAL stays behind one crate or adapter trait, feature-gated, so the core and
  its tests compile without it. Several adapters need no GDAL at all (hosted
  service APIs, KML/KMZ, JSON project files), and those should not pay for it.
- Ship the service as a container with GDAL from the distro, like ptolemy and
  geodukt already do, rather than fighting system-GDAL version skew across the
  cross-platform CI matrix. A local CLI can require a system GDAL instead of
  vendoring one.
- Check what the `gdal` crate actually exposes for driver-specific metadata
  before committing to it. The semantics layer is the whole point of verne, and
  bindings usually cover geometry and attributes better than metadata. If it
  falls short the answer is a little C-API glue, not a different language.
  Settled for Esri (2026-07-30): georust 0.19 wraps neither field domains nor
  relationships, so verne carries read-only `gdal-sys` glue. Minimum GDAL is 3.8
  (relationships need 3.6, related-table-types and raster-in-gdb 3.7); Debian 13
  ships 3.10 and Ubuntu 24.04 ships 3.8, so distro GDAL is fine and Ubuntu 22.04
  is the only casualty. Domain and relationship handles are borrowed const
  pointers the dataset owns: freeing them aborts the process.

- [ ] **the next adapter after Esri.** v0.1 covers KML/KMZ, v0.2 the Esri File
      Geodatabase (history log). Pick the next from real customer data rather than
      guesses, and check it against GDAL's driver list before committing to it. The
      recorded order of demand puts the photogrammetry and reality-capture stacks
      next, then the CAD-adjacent platforms.
- [ ] **verne: the rest of the hosted Esri story.** verne lists a portal's
      feature services, reads a FeatureServer or MapServer whole or scoped to
      one layer with the operator's token or one it mints itself, carries the
      untransformed originals, and the loader is unchanged (see verne's README
      and changelog). Still open:
      - the version tree: verne reads any named version (`--gdb-version`, one
        per extraction) and names which layers front versioned data and change
        tracking. Carrying the tree itself stays open, and the requirements
        are now documented rather than guessed: enumerating and diffing
        versions is the VersionManagementServer resource, whose `differences`
        needs the `features:user:edit` privilege, a read-session lock
        (`startReading`/`stopReading`, blocking editors on 11.5 and older) and
        at 11.2+ an Advanced Editing license; `extractChanges` needs the
        service to publish `changeTrackingInfo` generations, which
        sampleserver6 does not, and the only other source of generations is
        registering a sync replica, which writes server state. Both need an
        enterprise deployment verne may exercise; also decide the ptolemy
        mapping first (a branch per version needs update/delete ops in the
        sidecar, which today holds inserts only, and a persisted
        objectid-to-feature-id map across extractions).
      - legacy generateToken (username/password) is deliberately not taken:
        holding a password is worse than holding a client secret, and OAuth
        client_credentials covers the hosted case.
- [ ] **v0.2 gaps.** Rasters in a `.gdb` are detected and routed to terrano but
      have no fixture, because OpenFileGDB refuses to create them. Field subtypes,
      dataset-level metadata and glob domains are unexercised. Subtype, annotation
      and topology fixtures are hand-written catalog XML, since GDAL cannot create
      those either: the read path is real, the blob is not.
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
      constrains its own members to a shared one. The one real file tested carries
      two, plain NAD83 for ten classes and NAD83 with NAVD88 height for the nine
      in its Hydrography feature dataset, so a load already flattens two frames
      into one. Reprojecting at extraction (shipped) makes the data correct and
      renderable, which is what most viewing and analysis needs. The original
      coordinates now survive it: a commit operation may carry the untransformed
      geometry and its EPSG code beside the working copy, verne sends them for
      every transformed class whose reference a code names, and
      `GET /branches/{id}/features/{id}/native` returns them exactly, byte for
      byte. NULL means "no distinct original", and an edit's new version stores
      NULL rather than inheriting one. A reference no single EPSG code names,
      such as the real file's NAD83 + NAVD88 compound on its nine Hydrography
      classes, travels as its full WKT2 definition in `native_crs_wkt` instead,
      so an orthometric Z keeps its vertical datum on the record. Only a
      reference GDAL cannot state at all leaves its original in the GeoPackage
      alone, and the log says so per class.

      Supporting per-dataset srid later needs no storage migration, since the
      column already accepts any srid. It means taking the srid from the dataset
      on write instead of the literal, then auditing every query that assumes 4326
      (bbox envelopes built at 4326, `ST_Transform` calls pinned to it, the tile
      paths, the viewer), and deciding what a cross-dataset query does when two
      datasets disagree. Getting the numbers back out unchanged now works per
      feature through the native read, so this is worth it only if someone needs
      to query and serve in the native frame.
- [ ] **more real data, and from another vendor domain.** One public geodatabase
      found two bugs an afternoon (history log), and it was hydrography: no
      attachments, no annotation, no utility network, so those paths are still
      exercised only by fixtures verne builds itself. A utilities, parcels or
      emergency-services file would hit them. Public sources with attachments are
      hard to find, since attachments rarely survive open-data publishing, so this
      may need a customer file.
- [ ] **what the Esri report cannot land, by category** (from the GDAL feasibility
      pass and v0.2's own verdicts):
      - domains lose their field binding (ptolemy binds a domain to a field only
        through a subtype), their description, non-default split/merge policies and
        bound inclusivity.
      - relationship classes lose the origin key, `is_composite` (the column exists,
        the API cannot express it) and the many-to-many mapping table's own
        attributes. GDAL models no relationship rules or notification at all.
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

## OPEN — sibyl cutover cleanup

- [ ] Session routing is still server-side-global (sibyl active flag mirrors the
      old behavior). Later cleanup: route runs by AG-UI `thread_id` so sessions
      are per-client and stateless; needs viewer session-switcher rework.

## OPEN — what the enforcement pass left open per service (2026-08-01)

Deliberate scope calls from the multi-user enforcement work, each a product
decision rather than a bug. Per-repo changelogs hold what shipped.

- [ ] **tiletopia asset metadata is only listing-filtered.** `GET /assets`
      hides other tenants' rows, but `GET /assets/{id}` still answers for any
      valid token, and the Ion-compat `/v1/assets/{id}` is public by design, so
      gating one and not the other would be theater. Tiles are public regardless
      (the CDN TTLs depend on it). Decide whether asset metadata is tenant
      private, and if so do both routes and the CDN together.
- [ ] **tiletopia annotation reads are open** to any valid token on any asset.
      Writes are owner-or-admin. Only worth closing if annotations count as
      private content.
- [ ] **collecta legacy forms with no creator are admin-only** and are not
      backfilled to anyone. Decide whether to backfill or leave them.

      The rest of this entry is closed and was stale when read on 2026-08-13:
      the per-form grants table it called "deferred" exists as `form_grants`,
      with `grant_form`, `revoke`, `has_grant` and `list_grants` in
      `crates/collecta-server/src/store.rs`, and `require_read` admits the form
      creator, an admin, or a grantee. A read-only analyst over someone else's
      data is a supported case.
- [ ] **collecta role strings outside admin/editor/viewer now fail closed.**
      Nothing in the repo creates others, but a live database predating this may
      hold them, and those accounts stop working on deploy.

## OPEN: viewtopia feature gaps vs GeoLibre (surveyed 2026-07-30)

Diffed geolibre.app's documented features against the panel registry,
`importGeoJson.ts` and the duckdb loaders. Caution: this is GeoLibre's
advertised surface, not a source-level audit, so check depth before treating
any single item as table stakes. Deliberately skipped: planetary basemaps,
PGlite (redundant with DuckDB Spatial), Gaussian splats, and a Tauri
desktop/mobile wrapper (competes with the terravista/collecta track).

Format conversion is closed on both halves: raster on 2026-08-13 (multi-band
COG from the browser through terrano-wasm `writeCogBands`) and vector on
2026-08-06 (GeoParquet, FlatGeobuf, GeoJSON, PMTiles, with per-layer PMTiles
export from 2026-08-02). A durable lesson from the terrano COG pass: a green
COG-validator run is not evidence unless the output names the overviews, the
old writer passed vacuously while omitting them.

High value, product-level:

- [ ] **symbology, the one piece left**: a data-defined point size does not reach
      QML. QGIS sizes a symbol in the symbol's own units and needs a
      `<data_defined_properties>` block whose exact spelling nobody here has
      verified against a real QGIS writer, so the export reports the loss rather
      than guessing. Closing it needs a `.qml` written by an actual QGIS to read
      the encoding off. Everything else in the first cut is done.
Medium value:

- [ ] **STAC free-text defaults**: free text is conformance-gated (2026-08-13)
      and neither default catalog (Earth Search, Planetary Computer) advertises
      the free-text class, so the item search box ships disabled on both.
      Making it useful again means adding a conforming catalog to the defaults
      or teaching the panel client-side filtering, which was ruled out as
      look-like-search-while-missing-everything beyond the fetched page.
      (The data source manager itself shipped 2026-08-13: Services, Database
      and Files tabs in one panel, old ids open the right tab.)
- [ ] **offline area download**: regions download and the app shell is
      service-worker cached. What is left is in the offline story section
      below.

## OPEN: viewtopia offline story (audited 2026-07-30)

The sync layer is real: IndexedDB persistence (`src/offline/db.ts`, 9 stores),
online/offline detection, mutation queue with retry, three-way column-level
conflict merge, `offlineFetch()` API response cache. Data already loaded
survives reloads and syncs back, and a service worker precaches the built app
shell, so a reload with no network still boots the viewer. Everything below is
what does not work.

Closed 2026-08-13: viewtopia's terrain bundle picker. `GlobalTerrainPanel` fetches
the bundle list on mount and adds one option per name, an empty or failed fetch
leaves the panel otherwise unchanged, and the success status names the bundle
rather than always claiming Cesium World Terrain, which the old nested ternary
did. The rest of this entry is kept for the correction it records.

      This entry was wrong about the
      starting point: tiletopia already served `/api/v1/terrain/layer.json` and
      `/api/v1/terrain/{z}/{x}/{y}` as quantized mesh generated on demand, and
      `GlobalTerrainPanel.tsx` was already wired to it. The real gap was that
      those routes fall back to downloading SRTM from
      `elevation-tiles-prod.s3.amazonaws.com`, so they were never offline. The
      new bundle routes close that.

      The wiring, in `src/components/tools/GlobalTerrainPanel.tsx`:
      1. fetch `/tiles/v1/terrain/bundles` on mount, a JSON array of names,
         needs no token
      2. append one Select option per name, value `bundle:<name>`
      3. in `enableTerrain`, before the `stack` branch:
         `CesiumTerrainProvider.fromUrl('/tiles/v1/terrain/bundles/<name>/')`.
         The trailing slash matters, `fromUrl` appends `layer.json` to it.
      4. status text and the `NO_SOURCE` failure path need no change

      The `Custom URL` field already works today if a user types the bundle URL
      by hand, so this is a convenience, not a blocker.
- [ ] **tiletopia's ecosystem page has the wrong sections for two repos.**
      Descriptions were corrected 2026-08-13 for panoptes, fluvius, fenestra and
      ptolemy, but fenestra now reads as an OGC server while sitting under
      "Geometry & Topology" with a library badge, and fluvius sits under
      "Spatial Analysis". Re-sectioning is a page restructure rather than a
      factual fix, so it needs an owner call.
- [ ] **terrain bundle limits worth knowing** (each deliberate, none blocking):
      bundles are filesystem only, not S3/GCS, because `LocalStore::list` is one
      level deep while `S3Store::list` is recursive and capped at 1000 keys, so
      discovery would differ per backend. The availability walk touches every
      tile file, so a large bundle makes the layer.json request slow unless the
      bundle ships its own `available` array. (The third limit closed
      2026-08-13: an unreadable bundles directory now answers 500 with a logged
      reason instead of looking like an empty server.)
Closed 2026-08-13. Geocoding and routing already preferred the
platform, verified against geokode's and itinera's real response shapes. What was
missing was offline behaviour: both now go through `offlineFetch()` so a repeat
query answers from IndexedDB, and offline they raise a readable message instead
of returning empty, which the panels had been rendering as "no place matching"
and "no route found". Nominatim and public OSRM stay as fallbacks on purpose,
since geokode ships a small address dataset with no bbox biasing and itinera
routes only on the loaded extract, so a landmark or a cross-region route
genuinely needs them.

Open-elevation, open-meteo and Overpass are online only by decision, not
oversight: each is keyed by a freshly sampled line, view-bounds grid centres, or
a camera-derived bbox, so a cache entry would be written and never read. They now
refuse up front through `requireOnline()` rather than surfacing a raw fetch
failure.

## OPEN — geoplumb: gaps to Earth Engine parity (consolidated 2026-08-06)

The per-pull time axis and geoplumb-server shipped, so one graph now serves
any interval as on-demand composite tiles (the Timelapse panel is the proof).
What still separates it from GEE, engine details in geoplumb's DESIGN.md
Known limits:

- [ ] **composite latency on dense collections**: memory is bounded now (folds
      peak at one wave, median and percentile reduce in strips under a fixed
      value budget), but every intersecting item is still read, and a stack
      deep enough to strip pays one read-latency pass per strip.
- [ ] **in-region deployment**: cold pulls are bound by the residential
      link to us-west-2. Serving next to the data is the remaining latency
      lever; blocked on an AWS account decision (2026-08-05).
- [ ] **breadth**: GEE ships a huge operator library and charting/reduction
      over regions; geoplumb has hillshade, slope, aspect, map algebra, band
      math (arithmetic, comparisons, where, log/exp), reclassify, convolution,
      quality masking, focal statistics, composites through
      percentile/stddev/count, and zonal statistics plus per-step time series
      as pull drivers (2026-08-06) and as public server endpoints
      (POST /zonal/{layer} and /zonal/{layer}/series, 2026-08-07). Grow by
      demand, not by checklist.

## OPEN — Phase 3 (mobile & ML breadth, after v1)

- [ ] **terravista v0.2 leftovers** — the vector half shipped 2026-08-13: MVT
      decode in the Rust core (spec v2, checked against a reference-encoder
      fixture), placement through `DrawVectorLayer`, FFI grown to 50 symbols
      and a `vectorTileUrlTemplate` Kotlin surface. Still open: the Kotlin
      drawing code compiles nowhere (no Android SDK locally, CI is Rust-only,
      JitPack builds at release), no real tile server has been hit, the FFI
      flattening drops the layer name so colour is the only per-layer signal,
      there is no style setter, and the sample app still shows raster only.
- [ ] **terravista v0.3** — Metal/Vulkan GPU rendering. Biggest advertised-vs-real gap; needs
      platform GPU toolchains.
- [ ] **panoptes model weights** — train or source one usable segmentation model and publish
      weights. The "keep it clearly labeled experimental" branch is done (2026-08-13), so
      nothing oversells itself now, but no weights exist and segmentation still does
      not work out of the box. The ONNX inference path is real and proven end to end from the
      CLI against a synthetic sigmoid model.
Closed 2026-08-13: the onnx test now runs in CI. A separate `onnx`
job downloads onnxruntime 1.20.1 from the microsoft/onnxruntime release, verifies
its sha256, exports `ORT_DYLIB_PATH`, then runs clippy and tests under the
feature. The default matrix is untouched, so the crate is still proven to build
and test with no ONNX Runtime present. `ort` cannot supply the runtime itself:
`load-dynamic` sets `ort-sys/disable-linking`, and that build script returns
before any download logic, so `download-binaries` would be a no-op.
- [ ] **viewtopia FleetPanel** — currently an honest "no live feed" state; nothing serves
      vehicle positions. Decide whether real-time fleet tracking is in scope before building
      a WS/ingest path for it. Same gap as the sensors section above, and the same answer
      applies: if it is in scope, the path is fluvius over WebSocket into agora rather than a
      new ingest path.

## OPEN — deferred design decisions (not bugs)

- [ ] ptolemy merge is **feature-level** (edits to different attributes of one feature
      conflict). Attribute-level auto-merge would be a conflict-detection redesign; behavior
      is currently pinned by a test. Decide if it's worth it.
- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.
