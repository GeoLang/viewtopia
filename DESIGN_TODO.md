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
- [x] **Reconcile geolang's run model with the platform stack.** geolang is all-in-one
      (embedded Letta + Postgres, connects at `LETTA_URL`=localhost:8283). Removed the
      redundant `letta` service + `letta-data` volume + bogus `LETTA_BASE_URL` env.
- [ ] geolang's embedded Postgres is ephemeral (no volume) → re-`initdb` on every
      recreate (~50s boot). Mount a volume at the container's PG data dir to persist it.
- [ ] Transient `failed to set up container networking ... network not found` on `up`
      — needed a `down --remove-orphans` + `network prune`. Investigate / document.
- [ ] Decide whether `fenestra` belongs in the default golden-path bring-up (skipped for now).

### Functional findings (first run)
- [x] **geokode forward search was prefix-only on the house-number-led full address**
      (`q=100` worked; `q="Main St"` / place names returned `[]`). Fixed in
      `geokode-core/src/geocode.rs`: index street, street+city, and city variants per
      record (id-suffixed FST keys) + dedup results by id. Tests added; covered by the
      golden-path E2E (street-name query).
- [ ] geokode needs real address data beyond the 9-row sample CSV for a meaningful demo
- [ ] geokode has a `fuzzy` module (Levenshtein/Soundex) that `forward()` doesn't use —
      consider wiring fuzzy fallback for typo tolerance

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
- [x] Wire `test:e2e:platform` into CI **without stubbing geolang** —
      `.github/workflows/platform-e2e.yml` checks out all repos (incl. private geolang),
      builds the stack, runs the golden-path suite. **Requires repo secrets:**
      `GEOLANG_TOKEN` (read access to private geolang) and optional `XAI_API_KEY` /
      `OPENAI_API_KEY`. Runs on master push + weekly + manual (too heavy for every PR).

### Reproducibility
- [ ] Document the exact one-command bring-up (incl. data prep) in DESIGN.md / README
- [ ] Script the itinera graph build + data download (no manual `--user` step)

---

## Track 2 — Collapse ViewTopia to one stack

- [x] **Decision (2026-06-19): React is the canonical front-end.** Port everything onto
      `main.tsx`/`index-react.html`, then delete the vanilla `.js` shell.
- [x] Make React independently buildable — created the missing `vite.react.config.ts`
      (`npm run build:react` was broken). React now compiles (8399 modules, → `dist-react/`).
- [x] **Parity audit done.** React already has 65 tool panels + full renderer hooks
      (useCesium/useDeckGL/useMapLibre/useLeaflet), space-time, draw/measure/buildings,
      and store-driven basemaps. Real vanilla-only GAPS to port (≈1900 LOC):

  | Feature (vanilla module) | LOC | React status | Priority |
  |---|---|---|---|
  | `viewer-commands.js` (agent → map) | 466 | **missing** — useSSE only streams text | **P0 (headline)** |
  | `feature-picker.js` (3D tiles inspect) | 255 | missing | P1 |
  | `geojson-editor.js` | 163 | missing | P1 |
  | `style-editor.js` | (n/a found) | missing | P1 |
  | `theme-toggle.js` | 37 | missing (Header has theme?) | P2 |
  | `auth.js` | 234 | partial (1 ref) | P2 |
  | `portal.js` | 383 | missing | P2 |
  | `dashboards.js` | 348 | missing | P2 |

- [x] **P0:** agent→map command execution ported (`src/viewer/registry.ts`,
      `src/viewer/commands.ts`, `useSSE` real protocol, chat-store `setLastContent`).
      Build + tsc clean. **Runtime not yet verified** (needs a live agent NL→map test).
      9 commands ported; deck-layer/analysis commands (add_heatmap, slope_map, …) remain.
- [x] **Runtime verification harness** added: `tests/e2e/react-smoke.spec.js` +
      `playwright.react.config.js` (`npm run test:e2e:react`, serves React on :5175).
      **No runtime crash — the `.fixme` was a misdiagnosis.** Captured console/pageerror:
      the app mounts and renders the full shell (title, tabs, chat, 23 plugins); the only
      failures are backend probes (`/api/health`, `/agent/health` → 500, `/manifest.json`
      → 404), expected when served standalone without the platform backend. The smoke test
      was failing on bad selectors: `#react-root > *` `.first()` matched Mantine's injected
      non-visible `<style>`, and there was no accessible "Measure" button. Fixed: added
      `aria-label`s to the toolbar tool ActionIcons (a11y + testability) and corrected the
      assertions. **2/2 passing** — this is now the live gate for P1/P2 ports.
### Porting organization (decided 2026-06-20)
- **Work unit:** feature-by-feature, gated. Each feature lands in its natural React home
  (panels → `src/components/tools/*Panel.tsx`; cross-cutting → `src/features/<name>/`;
  Cesium interaction → a `hooks/use*Cesium.ts` + `store/*.ts`, mirroring the measure tool),
  adds an assertion to `tests/e2e/react-smoke.spec.js`, must pass `tsc` + `build:react` +
  `test:e2e:react`, then commits to master.
- **Order:** P1 in TODO order (feature-picker → geojson-editor → style-editor), then P2.

- [~] **P1:** port feature-picker, geojson-editor, style-editor
  - [x] **feature-picker** — `store/featurePicker.ts`, `hooks/useFeaturePickerCesium.ts`,
        `components/tools/FeaturePickerPanel.tsx`; toolbar "Inspect" button + `featurePicker`
        panel key. Click a 3D Tiles feature → property table + yellow highlight. Gated by a
        new smoke test (3/3 passing). NOTE: the vanilla `feature-picker.js` *also* contains
        the **StyleEditor** class — port that when style-editor's turn comes (same source).
  - [ ] geojson-editor
  - [ ] style-editor (StyleEditor class lives in vanilla `feature-picker.js`)
- [ ] **P2:** port theme-toggle, auth, portal, dashboards
- [ ] **Only after parity:** flip default build/Dockerfile/nginx to React, then delete the
      vanilla `.js` shell + `index.html` + this dual-stack note (DESIGN §2.5).
- [ ] Do NOT flip the shipped deploy before the P0/P1 gaps close — it would regress the
      live app (agent can't drive the map; missing editors).

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
