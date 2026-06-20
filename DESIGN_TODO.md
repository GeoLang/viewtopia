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
- [x] geokode needs real address data beyond the 9-row sample CSV for a meaningful demo
      — added an **OSM PBF importer** to geokode (`geokode-ingest::osm::ingest_osm_pbf`,
      `.pbf` branch in the CLI) and pointed the geokode service at `data/region.osm.pbf`
      (the same Monaco extract as itinera routing). Now serves **426 real Monaco addresses**.
      The viewer's fly-to / Search use geokode (Nominatim fallback for places outside the
      extract). Widen coverage by swapping in a larger Geofabrik `.pbf`.
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
- [x] **Agent NL command drives the map** (geolang → letta → viewer command protocol)
      — verified end-to-end through nginx: POST `/agent/chat/stream` "Fly to Monaco" streams a
      `viewer_cmd` `fly_to` event the viewer executes. Required wiring the platform stack to
      actually run geolang's FastAPI app (`geolang-api` service) + a CPU embedding server
      (`embeddings`), repointing nginx `/agent/` at the app, and fixing two geolang bugs
      (viewer_control `json` import; missing embedding endpoint). See platform commit + geolang.
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
      **Command set now complete** (2026-06-20): the original 9 + the 5 deck.gl layers
      (add_heatmap/hexbin/arcs/scatter/screengrid → my deck-layers registry, auto-switches to
      the deck renderer), style_by_height/classification/property (reuse `viewer/tileStyles`),
      measure_distance/area/height, and ~20 tool commands mapped to their React panels
      (annotate, terrain_profile, slope_map, weather, flood, viewshed, …). Gated by a vitest
      unit suite (`tests/unit/viewer-commands.test.ts`, 5 tests). **Still to do: end-to-end
      runtime check against a live agent** (the dispatcher is unit-tested, but no NL→map test
      against geolang yet).
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

- [x] **P1:** port feature-picker, geojson-editor, style-editor — **all done.**
  - [x] **feature-picker** — `store/featurePicker.ts`, `hooks/useFeaturePickerCesium.ts`,
        `components/tools/FeaturePickerPanel.tsx`; toolbar "Inspect" button + `featurePicker`
        panel key. Click a 3D Tiles feature → property table + yellow highlight. Gated by a
        new smoke test (3/3 passing). NOTE: the vanilla `feature-picker.js` *also* contains
        the **StyleEditor** class — port that when style-editor's turn comes (same source).
  - [x] **geojson-editor** — `components/tools/GeoJsonEditorPanel.tsx`; extended the draw
        store with per-feature `properties` + `setFeatureProperties` + a `featuresToGeoJSON`
        export helper. Toolbar "GeoJSON Editor" button + `geojsonEditor` panel key. Edits
        the draw store's features (key/value add/edit/remove, delete feature, export
        FeatureCollection) — works across ALL renderers, not just Leaflet like the vanilla
        original. **Deferred:** in-place vertex/geometry editing (vanilla used leaflet-draw
        Edit handlers; not worth a Leaflet-only path — revisit if geometry editing is needed).
        Gated by a new smoke test (4/4 passing).
  - [x] **style-editor** — `viewer/tileStyles.ts` (helpers ported from the StyleEditor
        class in vanilla `feature-picker.js`) + `components/tools/StyleEditorPanel.tsx`.
        Toolbar "Style Editor" button + `styleEditor` panel key. Color by property/height/
        classification, reset, opacity + point-size sliders. Applies to every Cesium3DTileset
        in `viewer.scene.primitives` (React has no central tileset store); warns when none are
        loaded. Gated by a new smoke test (5/5 passing).
- [x] **P2:** port theme-toggle, auth, portal, dashboards — **all done.**
  - [x] **theme-toggle** — already present in React `components/Header.tsx`
        (`useMantineColorScheme` + Sun/Moon, Mantine's default localStorage scheme manager
        handles persistence). Added an `aria-label="Toggle theme"` (a11y + testability) and a
        smoke test that toggles dark→light and asserts it survives a reload (6/6 passing).
  - [x] **auth** — `features/auth/store.ts` (login/register/API-key against
        `/api/v1/auth/*`, localStorage-persisted `viewtopia_auth`, `getAuthToken`/
        `isAuthenticated` exports for parity) + `features/auth/AuthControl.tsx` (header
        control: login/register/API-key Modal when logged out, user Menu w/ logout when
        logged in). Replaced the dead "Login / Account" icon in Header. Gated by a new
        smoke test (7/7 passing).
  - [x] **portal** — `features/portal/` (`types.ts`, `store.ts`, `PortalPanel.tsx`).
        Content catalog: search + type/sharing filters, item grid (open → `portal:open-item`
        event for parity), add/delete items. `/api/v1/portal/items` with the auth Bearer
        token (reuses `features/auth` `getAuthToken`), localStorage fallback
        (`viewtopia_portal_items`). Toolbar "Data → 🗂 Catalog" + `portal` panel key.
        Gated by a new smoke test (8/8 passing).
  - [x] **dashboards** — `features/dashboards/` (`types.ts`, `store.ts`, `DashboardPanel.tsx`).
        Dashboard builder: list view + editor (rename, add/remove widgets, 6 widget types —
        indicator/gauge/list/richtext/chart+map placeholders). localStorage-only
        (`viewtopia_dashboards`); auto-saves on every edit (no explicit Save button needed —
        improvement over vanilla). Toolbar "Tools → 📈 Dashboards" + `dashboards` panel key.
        Gated by a new smoke test (9/9 passing).
- [x] **Cutover done (2026-06-20): React is now the only stack.** `index.html` loads
      `main.tsx`; the single `vite.config.js` builds React → `dist/` (default `npm run build`).
      Deleted: all 115 vanilla `src/**/*.js`, `src/style.css`, `index-react.html`,
      `vite.react.config.ts`, the `build:react`/`dev:react` scripts, and the 10 vanilla
      `*.test.js` unit suites. Dockerfile (`npx vite build` → `dist/`) and `nginx-platform.conf`
      (serves `dist/index.html`) need no change — they already pointed at the default build.
      Verified: tsc clean, `npm run build` → React `dist/`, `vitest` 56/56, smoke 9/9.
- [x] **Resolved (2026-06-20): NL→map verified end-to-end** against the live stack. The agent
      command set is ported + unit-tested, AND the live round-trip works: "Fly to Monaco" →
      `viewer_cmd` `fly_to` streamed through nginx. Needed the `geolang-api` + `embeddings`
      services and the two geolang fixes (see golden-journey item above).

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
