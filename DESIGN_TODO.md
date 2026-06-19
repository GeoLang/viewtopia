# GeoLang — Planned Work (DESIGN_TODO)

> Actionable backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
> Track order: **T1 (golden path) → T2 (viewer consolidation) → T3 (backbone tests)**.

---

## Track 1 — Prove & lock the golden path  *(active)*

### Stack bring-up fixes (found during first run)
- [x] Pass LLM keys to geolang container — added `env_file: ../geolang/.env`
- [x] Build itinera `data/graph.bin` from an OSM extract (Monaco) for routing
- [x] Bind-mount geolang repo at `/app/geolang` + set `TOOL_EXEC_DIR`/`TOOL_EXEC_VENV_NAME`
      (geolang runs tools from a mounted repo root, not a self-contained image)
- [x] **Fix the same-origin nginx proxy** (`deploy/nginx-platform.conf`) — variable
      `proxy_pass` dropped URI suffix + query string; added per-location `rewrite … break`.
      This was a hard blocker: the SPA uses relative paths, so *all* API calls 404'd.
- [ ] **CI/dev ergonomics:** editing `nginx-platform.conf` requires
      `up -d --force-recreate --no-deps viewtopia` (Docker single-file bind-mounts pin
      the inode; a `Write`/replace doesn't propagate). Document or switch to a dir mount.
- [ ] **itinera writes to host-mounted `data/` fail as default container user**
      (PermissionDenied). Fix Dockerfile user or volume ownership — currently worked
      around with `--user` for the one-off graph build.
- [ ] **Reconcile geolang's run model with the platform stack.** geolang's own compose
      runs an all-in-one `letta-gis` (Letta + Postgres in-container); the platform compose
      builds it and points at a *separate* `letta` service. Decide one model and make the
      platform compose match it (avoid double Letta / orphaned Postgres).
- [ ] Transient `failed to set up container networking ... network not found` on `up`
      — needed a `down --remove-orphans` + `network prune`. Investigate / document.
- [ ] Decide whether `fenestra` belongs in the default golden-path bring-up (skipped for now).

### Functional findings (first run)
- [ ] **geokode forward search is prefix-only on the house-number-led full address**
      (`"100, Main St, Demo City, DC"`). `q=100` works; `q="Main St"` / place names
      return `[]`. Add street-name / token / fuzzy matching so natural queries work —
      otherwise the viewer's place search is unusable. (`geokode-core/src/geocode.rs`)
- [ ] geokode needs real address data beyond the 9-row sample CSV for a meaningful demo

### Golden journey (encode each as a step, then as Playwright E2E)
- [x] Stack comes up; all 8 services report healthy
- [x] Viewer loads at `:5174`
- [x] Route between two points (itinera, Monaco graph) — verified end-to-end
- [~] Geocode a place (geokode) — endpoint works but matching is prefix-only (see above)
- [x] Same-origin proxy reachable from the browser (ptolemy/tiletopia/geokode/itinera)
- [x] Capture the journey as a Playwright E2E test that runs against the live stack
      — `tests/e2e/golden-path.spec.js` + `playwright.platform.config.js`
      (`npm run test:e2e:platform`), **5/5 passing**
- [ ] Load a TileTopia layer (needs a tileset ingested; add as an E2E step)
- [ ] Agent NL command drives the map (geolang → letta, viewer command protocol)
- [ ] Wire `test:e2e:platform` into CI **without stubbing geolang** (CI currently stubs it)

### Reproducibility
- [ ] Document the exact one-command bring-up (incl. data prep) in DESIGN.md / README
- [ ] Script the itinera graph build + data download (no manual `--user` step)

---

## Track 2 — Collapse ViewTopia to one stack

- [ ] Decide React as the canonical target (recommended) and record the decision
- [ ] Make React the default build: point `vite.config.js` / Dockerfile / nginx at
      `main.tsx` + `index-react.html`
- [ ] Inventory features that exist only in the vanilla `main.js` path (not yet in the
      React shell) — produce a parity checklist
- [ ] Port remaining vanilla-only UI shells onto the shared `.js` feature modules
- [ ] Delete `index.html` / `main.js` and the second Vite config once at parity
- [ ] Update DESIGN.md §2.5 once the dual-stack note no longer applies
- [ ] Burn down the ~123 TODO/stub markers in `src/` that block the golden path first

---

## Track 3 — De-risk the data backbone (ptolemy)

- [ ] Add tests for ptolemy write path (feature insert/update/delete)
- [ ] Add tests for versioning: branch / commit / diff / merge correctness
- [ ] Add tests for conflict resolution (column-level / three-way) parity with viewer
- [ ] Smoke test ptolemy ↔ fenestra (OGC reads) once fenestra is in the loop
- [ ] Raise jung from 0 tests *(deferred — only if it enters the v1 critical path)*

---

## Deferred for v1 (do not invest until core ships)
- [ ] jung, fluvius, geogit, panoptes — 0 tests each, off the viewer+agent critical path
- [ ] Open-source decision for the private `geolang` repo (affects CI stubbing strategy)
