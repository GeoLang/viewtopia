# Platform load test

k6 against the real platform stack, for two purposes: a reproducible performance
baseline, and a nightly regression gate where the k6 thresholds are the pass/fail.

The headline measurement is ptolemy read latency against changeset-chain depth.
Every listing read resolves a branch by walking a recursive CTE from the branch
head up `changesets.parent_id`, so read cost grows with the number of commits on
the branch. Either the numbers show that is affordable, or they force
materialized branch heads.

## Running it

Needs the platform stack up (`scripts/platform-up.sh`) and docker. No host k6
install: everything runs in `grafana/k6:2.1.0`.

```bash
node loadtest/seed.mjs                  # depths 100,1000,10000 + wide + external + tileset
loadtest/run.sh                         # every scenario
loadtest/run.sh ptolemy                 # one scenario
node loadtest/seed.mjs --teardown       # drop every loadtest-* fixture
```

Seeding depth 10000 is 10000 sequential commits and takes a long time. For a
quick check:

```bash
node loadtest/seed.mjs --depths 10 --no-wide --no-external
LOADTEST_VUS=5 LOADTEST_DURATION=10s LOADTEST_DEPTHS=10 loadtest/run.sh ptolemy
node loadtest/seed.mjs --teardown
```

`--no-tileset` skips the tiletopia upload the same way, for a run that only
targets ptolemy.

Summaries land in `loadtest/out/<scenario>.json`. Exit status is k6's, so a
breached threshold fails the caller.

| env | default | meaning |
| --- | --- | --- |
| `LOADTEST_BASE_URL` | `http://localhost:5174` | the nginx front, so numbers include the real proxy path |
| `LOADTEST_FENESTRA_URL` | `<base>/ogc` | fenestra's proxy mount; set to `http://localhost:3003` to bypass nginx |
| `LOADTEST_FENESTRA_LAYER` | shallowest seeded chain | any ptolemy dataset name |
| `LOADTEST_DEPTHS` | `100,1000,10000` | which chain datasets the scenarios target |
| `LOADTEST_RATE` | `20` | iterations started per second |
| `LOADTEST_VUS` | `5` | VUs pre-allocated to sustain that rate (max is 10x) |
| `LOADTEST_DURATION` | `30s` | run length per scenario |
| `LOADTEST_P95_SCALE` | `1` | multiplier on every p95 budget, for slower box classes (CI sets 6) |
| `K6_IMAGE` | `grafana/k6:2.1.0` | pinned, k6 2.0 was a breaking major |

`LOADTEST_DEPTHS` must match what the seeder actually created. A depth with no
dataset is skipped with a warning rather than failing the run, so a mismatch
shows up as missing rows in the summary, not as a red build.

## Load shape

Scenarios use k6's `constant-arrival-rate`: `LOADTEST_RATE` iterations are started
every second regardless of how fast they finish. That is deliberate. Looping VUs
with no think time do not measure latency, they measure how fast the box can be
saturated, and unpaced they push about 2900 req/s through the proxy, at which
point nginx sheds connections and the 502s read as if a service regressed.

One iteration issues every op in the scenario, so requests per second is roughly
`LOADTEST_RATE` times the op count.

If the stack cannot keep up, k6 warns that it ran out of VUs and drops iterations.
That warning is a result. Read it before raising the VU ceiling.

## What each scenario measures

**ptolemy** is the point of the harness. The `chain-*` datasets each hold an
identical 100-feature grid at a different commit depth, so a latency gap between
them is the changeset walk and nothing else. One iteration touches every op on
every target, which means all depths are measured under the same load and the
same cache state: the depth comparison is valid within a single run in a way that
comparing isolated runs would not be.

- `bbox`: `GET /branches/{id}/features/bbox`, the read the map viewport issues.
- `filter`: `POST /branches/{id}/features/filter` with a CQL2-JSON `=` on a
  property that matches about 1 row in 20.
- `item`: `GET /ogc/collections/{id}/items/{fid}`. This is the **control**: that
  handler selects the newest `feature_versions` row for the feature directly and
  never walks the chain, so it should stay flat as depth grows. If `bbox` climbs
  and `item` does not, the CTE is the cost.

Two things confound the `filter` numbers, both worth knowing before reading them:

- `filter` runs against the `features` SQL view, and that view's recursive CTE
  walks **every branch in the database**, not just the queried one, before the
  `branch_id` predicate is applied. So `filter` on `chain-100` gets slower merely
  because `chain-10000` exists alongside it. Read `filter` as a function of total
  changeset count in the database, not of one branch's depth. `bbox` does not
  have this problem, it walks the queried branch only.
- `external` is a registered external PostGIS table, so it has no changesets at
  all. It is the floor: what these reads cost with versioning out of the picture.

**tiletopia** serves `tileset.json` and one content tile from `loadtest-tileset.ply`,
the asset the seeder uploads. The scenario resolves it by name and ignores every
other asset in the catalog: picking whichever asset happened to be there measured a
different tileset on every box, and found nothing at all on a fresh CI stack. If the
seeder has not run, these ops are skipped with a warning rather than falling back to
another asset, because a fixture that is missing is a seeding gap, not a regression,
and a substitute would publish a number that is not comparable to the baseline.

**geokode** forward and reverse geocoding against the addresses imported from the
OSM extract. In-memory FST and R-tree lookups, so the fastest reads on the
platform. The forward queries are derived from streets geokode actually holds,
not hardcoded: the stack takes any OSM extract, a fixed query list would silently
match nothing on a different region, and an empty 200 result measures no index
work, so it would read as a speedup.

**itinera** route and isochrone over the graph built from the same extract.
Random coordinate pairs do not work here: itinera snaps an off-graph point to the
nearest node, and on a small extract two snapped nodes often land in different
connected components, so `/route` answers 404 "no route found". That is correct
behaviour, but it makes the error-rate gate flap. So the scenario discovers pairs
that actually route, by pulling addresses from geokode (which imported the same
extract) and probing them, rather than hardcoding coordinates for one region. It
logs how many pairs it found.

**fenestra** WMS GetMap and WFS GetFeature. fenestra resolves a layer by
exporting the whole ptolemy branch as GeoJSON and filtering in process, with no
bbox pushdown, so its latency tracks the layer's total feature count rather than
the requested extent. The default layer is the shallowest seeded chain (100
features) for that reason. Point `LOADTEST_FENESTRA_LAYER` at `loadtest-wide` to
measure the 50k-feature cliff deliberately.

## Thresholds

Every op carries a p95 budget and an error budget of `rate<0.01`, both as
sub-metric thresholds tagged by op and target, so a breach names the exact
op/target pair. Each scenario file builds its thresholds from the same spec table
it iterates, so a target cannot be added without a budget attached.

The committed p95 values reflect the 2026-07-26 baseline below: roughly 2x the
measured p95, rounded up to a clean number, with a 50ms floor so ops that run in
single-digit milliseconds do not flake on scheduler noise. 2x leaves room for
normal run-to-run variance on shared CI hardware while still catching a real
regression.

## Baseline numbers

First full baseline, 2026-07-26. Code state: ptolemy at `0ee367c` (branch-scoped
reads). Filled from `loadtest/out/*.json`.

Box spec disclosure: a latency number without the machine it came from is not a
number. Record the CPU model and core count, RAM, disk type, docker version, and
whether the stack and the load generator shared the box. **They do share it
here**. `run.sh` uses `--network host` and k6 runs on the same host as the
services, so every figure includes generator contention and proxy overhead on
purpose. That is the shape a single-box deployment actually has. Numbers from a
GitHub-hosted runner and numbers from a workstation are not comparable, so label
which is which.

Box: workstation, AMD Ryzen 9 6900HX (16 threads), 27 GB RAM, single machine
running the full docker compose stack and k6 together. Load shape: k6
`constant-arrival-rate` at 20 iterations/s, `LOADTEST_DURATION=30s`.

| scenario | p50 | p95 | req/s |
| --- | --- | --- | --- |
| ptolemy bbox chain-100 | 5 ms | 9 ms | 18.4 |
| ptolemy bbox chain-1000 | 9 ms | 11 ms | 18.4 |
| ptolemy bbox chain-10000 | 48 ms | 67 ms | 18.4 |
| ptolemy bbox wide | 59 ms | 72 ms | 18.4 |
| ptolemy bbox external | 57 ms | 66 ms | 18.4 |
| ptolemy filter chain-100 | 3 ms | 8 ms | 18.4 |
| ptolemy filter chain-1000 | 8 ms | 11 ms | 18.4 |
| ptolemy filter chain-10000 | 48 ms | 68 ms | 18.4 |
| ptolemy filter wide | 54 ms | 68 ms | 18.4 |
| ptolemy filter external | 97 ms | 110 ms | 18.4 |
| ptolemy item chain-100 | 3 ms | 6 ms | 18.4 |
| ptolemy item chain-1000 | 5 ms | 7 ms | 18.4 |
| ptolemy item chain-10000 | 19 ms | 28 ms | 18.4 |
| ptolemy item wide | 3 ms | 5 ms | 18.4 |
| ptolemy item external | 44 ms | 62 ms | 18.4 |
| tiletopia tileset | 2 ms | 2 ms | 20.0 |
| tiletopia tile | 1 ms | 1 ms | 20.0 |
| geokode forward | 1 ms | 2 ms | 20.0 |
| geokode reverse | 1 ms | 1 ms | 20.0 |
| itinera route | 2 ms | 2 ms | 20.0 |
| itinera isochrone | 1 ms | 1 ms | 20.0 |
| fenestra getmap | 7 ms | 17 ms | 20.0 |
| fenestra getfeature | 6 ms | 15 ms | 20.0 |

Every scenario reported 0.00% failed requests. The ptolemy scenario sustained
276.7 req/s in total across its 15 ops, the other scenarios ran at the rate their
op count implies (about 40 req/s).

## Fixtures

`loadtest/seed.mjs` creates three kinds of ptolemy dataset plus one tiletopia
asset, all named `loadtest-*`, all idempotent. `loadtest/geo.js` holds the grid,
bbox and fixture-name constants and is imported by both the seeder and the k6
scripts, so a bbox the seeder filled cannot drift from the bbox a scenario
queries, nor a fixture name from the name a scenario looks up.

- `loadtest-chain-<depth>`: 100 features, then `depth - 1` commits each editing
  one feature. The commit counter rides in that feature's properties, because
  `GET /branches/{id}/history` caps at 100 rows and cannot report a deeper chain.
- `loadtest-wide`: ~50k features in batched commits of 2000 operations.
  ptolemy applies operations one statement at a time, so a single 50k-operation
  commit would hold a write transaction open for minutes.
- `loadtest-external`: a registered external PostGIS table. Registration probes
  the relation, so the table has to exist first, which needs SQL the HTTP API
  does not expose. The seeder creates it with `psql` inside the compose `db`
  container. Without docker access it substitutes an ordinary versioned dataset
  and says so, because the two do not measure the same read path.
- `loadtest-tileset.ply`: a 200-point ascii PLY uploaded to tiletopia. Point-cloud
  uploads tile on arrival, so this needs no separate job request, and the seeder
  polls the asset until it reports `ready` (bounded at 120s, so a wedged tiling
  worker fails the seed instead of hanging CI). The `.ply` in the name is required,
  not cosmetic: tiletopia stores the upload under its asset name and the tiler picks
  its reader from that path's extension. A rerun keeps the asset that is already
  `ready` and deletes any other asset under the same name, so an interrupted seed
  self-heals rather than leaving two candidates behind.

## Teardown

`--teardown` drops every `loadtest-*` dataset and the tiletopia asset. Ptolemy has **no
`DELETE /datasets/{id}` route**, so this goes through `psql` in the compose `db`
container and relies on the schema's own cascades: `branches`, `changesets` and
`feature_versions` all declare `ON DELETE CASCADE` on their dataset or changeset
foreign key, so deleting the dataset row reclaims the feature rows with it. The
seeder verifies that by counting `feature_versions` for loadtest datasets before
and after, and also counts rows with no surviving dataset row at all. Every
statement is scoped to the `loadtest-` prefix.

Without docker access it falls back to committing deletes on each branch. That
empties the branches but reclaims nothing: the datasets survive, and a delete
operation appends another `feature_versions` row rather than removing one. The
seeder says so when it takes that path. Do not use the soft path to clean up a
deep chain, it makes the database bigger.

The tiletopia asset is not subject to any of that: tiletopia does have an asset
delete, so teardown goes over HTTP and reclaims the tiles either way. It only
reaches assets this harness uploaded, because tiletopia scopes delete to the JWT
`sub` that created the asset, and the seeder always presents `loadtest`.

## CI

`.github/workflows/platform-load.yml`, nightly cron plus manual dispatch, never
on push or pull request. The nightly seeds depths 100 and 1000 only, depth 10000
is dispatch-only behind the `full` input. It starts the data plane without
geolang, since the agent is not under test and is the slowest image to build. It
records the runner's box spec to `loadtest/out/box.txt` and uploads
`loadtest/out/` as an artifact. Thresholds are the gate, there is no separate
comparison step and no stored history yet.

The runner is a different box class from the workstation baseline: 4 vCPUs
running the stack, postgres and k6 together. At the baseline rate of 20/s the
ptolemy scenario asks for ~240 req/s, which saturates the box and reports
seconds of queueing delay as if it were service latency (the first two nightly
runs did exactly that). So CI runs at `LOADTEST_RATE=5` and widens the budgets
with `LOADTEST_P95_SCALE=6`. The depth comparison the harness exists for
(chain-100 vs chain-1000) is unaffected: both depths still run in the same
iteration under the same load.
