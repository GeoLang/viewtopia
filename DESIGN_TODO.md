# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — completed items move to DESIGN.md (§4 history log).
> Last brought current: **2026-07-26**.

---


## OPEN — platform hygiene

- [ ] **tiletopia full-features clippy**: `cargo clippy --all-features` fails in
      tiletopia-core (ort/ndarray version clash); CI runs `--features
      draco,gpu,plugin-dylib,ml` — check whether that job is red on master and fix the
      version clash.
- [ ] **tiletopia CloudFront config**: `deploy/terraform/main.tf:235` gives
      `/api/v1/catalog*` GET/HEAD only and drops Authorization, so catalog-add cannot
      work through that distribution (fails closed).
- [ ] **loadtest: tiletopia fixture seeder.** The scenario measures whatever assets the
      stack holds; a fresh CI stack may have none and the ops skip with a warning.
      Needs a small tiling job in the harness for a deterministic asset.
- [ ] **fenestra has no platform nginx route** — the load scenario hits :3003 directly.
      Decide whether fenestra belongs behind the same-origin proxy like everything else.

## OPEN — post-v1: replace embedded Letta (decided 2026-07-25)

- [ ] **Replace the embedded Letta server with a thin in-house agent loop behind
      `agent_event_stream`.** Upstream's self-hosted line is deprecated and
      release-frozen; GeoLang needs only an LLM call loop with tool dispatch, message
      history + summarize-on-overflow, and an event stream (memory audit showed archival
      and core-memory tools entirely unused; the embeddings container exists only for
      unused archival and goes away too). The seam is already cut: `agent_event_stream`
      in geolang/src/api/server.py is the only place Letta shapes exist, and the viewer
      speaks vendor-neutral AG-UI. Also retires the ~2min embedded-server boot and the
      cold-start timeout above. Do after MVP announcement; stay on vendored 0.16.8 until.

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
- [ ] ptolemy external-source pushdown non-goals (documented in README): near-global
      windows fall back to unfiltered scans; `or`/`not` CQL2 spatial ops are never pushed.
      Revisit only if a real workload hits them.
- [ ] **Split view: per-pane basemap picker, then tiled views** (owner, 2026-07-26,
      post-MVP). Panes currently share the basemap, so same-renderer split is a mirror.
      Step 1: each pane picks its own basemap, cameras stay locked (no focused-pane
      concept; viewer-scoped tools keep the left-pane convention). Build the pane state
      as a list of `{renderer, basemap}`, not a single right-pane entry, so step 2 —
      a 2x2 tiled compare view — is layout work, not a rewrite. Tiles are GL contexts:
      cap at 4, MapLibre by default, at most one Cesium instance.
- [ ] **Replace the standalone deck.gl renderer with MapLibre + `MapboxOverlay`**
      (`@deck.gl/mapbox`, `interleaved: true`, maplibre-gl v3+, works with the v5 globe).
      Deck layers keep GPU rendering but draw into MapLibre's context, so everything the
      MapLibre path has (analysis results, agent layers, terrain-RGB relief) works in the
      same view and the per-panel "switch renderer" hints on deck go away. Collapses three
      renderers to two; touches useDeckGL, the registry, ViewerArea and the renderer picker.
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.
