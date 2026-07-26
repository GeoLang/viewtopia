# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — completed items move to DESIGN.md (§4 history log).
> Last brought current: **2026-07-26**.

---

## IN PROGRESS — viewer test coverage (decided 2026-07-26)

- [ ] **Per-panel functional smoke suite (~42 panels).** Each panel's primary action
      exercised against the live stack with an observable-effect assertion. Planned as a
      fan-out workflow (one spec per panel, adversarially verified); runs nightly next to
      platform-load, golden path stays the per-push gate. The open/close sweeps
      (51 tool panels + 23 plugin panels, all green) scoped the list first.
- [ ] **Two plugin panels request a third-party API with no key** (found by the new
      plugin sweep, marked fixme in `tests/e2e/plugin-sweep.spec.js`): basemap-catalog
      fetches three jawg.io preview tiles that answer 400; street-view builds a Google
      embed URL with `key=` empty and gets 401. Both should detect the missing key and
      render a configure-a-key state instead of requesting, like the catalog panel's
      signed-out state.
- [~] **Building-data toggle on MapLibre** (committed ea421a9d, browser verification
      pending): disabled with tooltip when the loaded style has its own fill-extrusion
      layers (Liberty); detection re-runs on style.load; hook skips duplicate layer.

## OPEN — geolang agent tools (found in 2026-07-26 viewer testing)

- [ ] **Tool cold-start exceeds Letta 180s sandbox cap.** First tool call after an image
      rebuild pays schema re-registration + geo-stack import on top of an ~85s tool run
      and times out (agent retry succeeds). Pre-warm with a throwaway tool call in the
      entrypoint, or raise the sandbox timeout.
- [ ] **assess_environmental_risk run-to-run variance.** Two identical "Monaco, 2km"
      requests scored 4/10 (mean elev 14.1m, range 0–98) then 1/10 (mean 50.0m, range
      0–322) — geocode anchor and/or sampling nondeterminism. Pin the geocode result and
      make the grid deterministic so identical requests reproduce.
- [ ] **download_population_grid pop_total ignores the clip polygon**: computed from the
      radius bbox even when clip_layer_path is given, now visibly disagreeing with the
      rendered clip polygon.

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
- [ ] **tiletopia analysis endpoints throw transient 502s on cold CI runners** (surfaced
      by the console tripwire, 2026-07-26; platform config now tolerates 502/503/504 as
      warnings). Investigate the hiccup — nginx gets upstream-refused from tiletopia
      under cold-start load — rather than tolerating it forever.
- [ ] **fenestra has no platform nginx route** — the load scenario hits :3003 directly.
      Decide whether fenestra belongs behind the same-origin proxy like everything else.
- [ ] **ptolemy STAC raster search ungated**: `/api/v1/stac/search` returns raster tile
      ids/bounds without naming a dataset; rasters have no visibility concept, so
      dataset privacy does not cover them. Decide raster-catalog visibility.

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
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.
