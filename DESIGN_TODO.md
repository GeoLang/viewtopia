# GeoLang — Planned Work (DESIGN_TODO)

> Whole-platform backlog for the shipping plan in [DESIGN.md](DESIGN.md).
> Status keys: `[ ]` todo · `[~]` in progress · `[!]` blocked.
> **Open work only** — completed items move to DESIGN.md (§4 history log).
> Last brought current: **2026-07-27**.

---


## OPEN — platform hygiene

- [ ] **tiletopia multi-node HA (raft)** — future reference, no open work. The
      openraft half of cluster.rs was deleted 2026-07-27: it was a never-compiled
      textbook key-value example wired to nothing (no transport, no discovery, no
      real server state through it). The single-process leader election that
      actually runs remains. If clustering ever becomes a requirement, design it
      around what needs replicating (catalog and auth state via Raft; tile data
      needs shared/object storage regardless) instead of resurrecting the deleted
      scaffolding.
- [ ] **tiletopia CloudFront default behavior caches authenticated responses ~1h**
      (post-MVP decision): Authorization is in the cache key so no cross-user leak,
      but a revoked token's responses keep serving until TTL. Clean fix: split the
      two public tile patterns into an aggressive-TTL behavior, default to TTL 0.
- [ ] **CloudFront realtime WS untested**: auth rides Sec-WebSocket-Protocol, which
      the distribution never forwards explicitly; collab may fail closed through the
      CDN. Test on a live distribution before relying on it.

## OPEN — sibyl cutover cleanup

- [ ] Session routing is still server-side-global (sibyl active flag mirrors the
      old behavior). Later cleanup: route runs by AG-UI `thread_id` so sessions
      are per-client and stateless; needs viewer session-switcher rework.

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
- [ ] Raise jung from its rendering-only coverage into the v1 path *(only if it enters it)*.
