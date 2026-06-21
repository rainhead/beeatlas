# Phase 154: Mapbox Basemap Performance Cache - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

> ⚠️ **Scope reshaped during discussion.** A ToS research pass (see Canonical
> References) found that the phase's original deliverable — *serving the basemap
> offline for previously-browsed areas* — is **not licensed for the Mapbox web
> SDK (GL JS)**. The phase was re-scoped from a flag-gated *offline* tile cache
> to a ToS-compliant, ship-enabled **performance** cache. The ROADMAP.md success
> criteria and REQUIREMENTS.md TILE-01/TILE-02 were updated to match (2026-06-21).

<domain>
## Phase Boundary

Add a Workbox **StaleWhileRevalidate** runtime-cache route in `src/sw.ts` for
Mapbox basemap requests (vector tiles, style JSON, sprites, glyphs) so that
**warm/repeat map loads are faster** while online. This is a §2.8.1-compliant
on-device performance cache, **not** an offline feature.

**In scope:**
- SWR route for Mapbox basemap GET requests from `api.mapbox.com` (+ any
  `*.tiles.mapbox.com` host GL JS actually uses — planner/researcher confirms
  via DevTools Network).
- 200-only caching; TTL well under the 30-day legal ceiling; conservative
  `maxEntries` bound.
- Ships **enabled by default** (no feature flag).
- An ADR recording the legal analysis + the compliant design rationale.

**Out of scope (and now legally excluded):**
- Offline-first / offline-as-substitute basemap serving (Mobile-SDK-only right).
- Stripping `access_token` from the cache key (conflicts with ToS §1.1 / §2.9.4).
- The `beta_tile_cache` feature flag (dropped — compliant code ships on).
- Caching/intercepting `events.mapbox.com` telemetry (must pass through —
  it carries Map-Load billing accounting; intercepting risks §2.9.4).
- Offline basemap UX: Phase 149 already ships graceful basemap degradation
  when offline; this phase does not change that.

</domain>

<decisions>
## Implementation Decisions

### Legal posture (the reframing)
- **D-01:** Offline tile serving on GL JS is **not pursued** — Mapbox Product
  Terms (2026-06-17) §1.9 + §2.8.1 do not grant a web offline right; offline is
  a Mobile-SDK-only product. We build only the permitted ≤30-day device
  performance cache populated live from the Mapping APIs.
- **D-02:** A ToS-review **ADR is a required deliverable** (replaces the old
  TILE-02 "self-test gate" comment). It records the quoted clauses, the verdict,
  and the compliance checklist the design satisfies. Also add a one-line
  pointer in CLAUDE.md "Known State".

### Cache strategy
- **D-03:** **StaleWhileRevalidate** — serve cached asset instantly, revalidate
  from network in background. This is the actual perf win and is squarely a
  §2.8.1 performance cache (vs NetworkFirst, which only helps offline — the use
  we're avoiding).
- **D-04:** **Keep `access_token` in the request / cache key** (reverses the
  old SC#3). Token is static per deployment so basemap URLs are stable; stripping
  it would conflict with §1.1 (access only with credentials) and §2.9.4 (don't
  modify billing/accounting path).
- **D-05:** **200-only** caching via `CacheableResponsePlugin({ statuses: [200] })`;
  `ExpirationPlugin` with a TTL **≤ 30 days** (planner picks a conservative perf
  value, e.g. 7 days) and a bounded `maxEntries`. `purgeOnQuotaError: true`
  consistent with the existing `data-artifacts` route.
- **D-06:** Use a **dedicated `cacheName`** (e.g. `mapbox-basemap`) separate from
  `data-artifacts` / `data-manifest`, so storage-estimate breakdown stays clean
  and the basemap cache can be invalidated independently.

### Rollout
- **D-07:** **Ship enabled by default** — register the route unconditionally,
  **no feature flag**. It's compliant, so real users get faster warm loads
  immediately. (The old "default-off TOS gate" rationale is resolved by the ADR.)

### Attribution
- **D-08:** Keep Mapbox GL JS's **default attribution control** in place (Mapbox
  logo + © Mapbox + © OpenStreetMap + Improve-this-map). §1.4 has **no offline
  exception**; do not suppress or obscure it.

### Claude's Discretion
- Exact host/URL match predicate(s) for the route — confirm via DevTools which
  hosts GL JS pulls tiles/style/sprite/glyph from, and whether responses are
  CORS (non-opaque, normal-sized) or opaque (~7 MB/entry in Chrome) before
  finalizing `maxEntries`. (Note: GL JS fetches tiles with CORS, so non-opaque
  is expected — verify.)
- Choice of TTL value and `maxEntries` within the bounds in D-05.
- Test surface (extend `src/tests/build-output` / sw route assertions following
  the existing data-route test patterns).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Legal — Mapbox terms (the reason this phase was reshaped)
- Mapbox **Product Terms**, "Last Updated: June 17, 2026" — binding restriction
  doc: https://www.mapbox.com/legal/product-terms
  - **§1.9 Default Restrictions** — "not export, download, cache or store
    Licensed Map Content... except as otherwise expressly permitted." Silence =
    prohibited.
  - **§2.8.1** — grants a **≤30-day on-device cache populated directly from the
    Mapping APIs**; bars proxying / static-image substitution / redistribution.
    Offline download limits are Mobile-SDK-only.
  - **§1.4 Mandatory Attribution** — logo + © Mapbox + © OpenStreetMap (+ Improve
    this map); no offline exception.
  - **§1.1 / §2.9.4** — access only with authorized credentials; do not modify
    billing/accounting code → do **not** strip the access token.
  - **§1.3.9** — no action that "improperly decreases fees owed to Mapbox."
  - **§3.31** — Licensed Map Content explicitly includes "map tile, static map
    image, style file, glyph, and/or sprite."
  - **§3.43** — Map Load = `new mapboxgl.Map()` (12-h session); web billing is
    per Map Load, not per tile.
- Master ToS (2024-03-31, incorporates Product Terms): https://www.mapbox.com/legal/tos
- API caching docs (Mapbox's own TTLs, informational): https://docs.mapbox.com/help/dive-deeper/api-caching/
- Attribution docs: https://docs.mapbox.com/help/dive-deeper/attribution/
- Mobile-offline scope (confirms offline is Mobile-SDK-only): https://docs.mapbox.com/help/troubleshooting/mobile-offline/

### Project — phase inputs
- `.planning/REQUIREMENTS.md` — TILE-01, TILE-02 (updated 2026-06-21 to compliant scope)
- `.planning/ROADMAP.md` §"Phase 154" — updated success criteria (2026-06-21)
- `.planning/phases/149-data-runtime-caching-offline-cold-start/` — SW runtime-cache
  route pattern + the graceful basemap-degradation behavior this phase relies on

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sw.ts` — existing Workbox `registerRoute` blocks for `data-artifacts`
  (CacheFirst) and `data-manifest` (NetworkFirst) are the direct template; reuse
  `ExpirationPlugin` + `CacheableResponsePlugin` imports already present.
- `StaleWhileRevalidate` from `workbox-strategies` (sibling of the already-imported
  `CacheFirst`/`NetworkFirst`).

### Established Patterns
- SW route predicates match on `url.pathname` / host; per-route `cacheName` +
  `ExpirationPlugin` scoping (a route's expiration is scoped to that route, not
  the whole cache name — see the `data-artifacts` note at `src/sw.ts:65-80`).
- `src/bee-map.ts:387` sets `accessToken = import.meta.env.VITE_MAPBOX_TOKEN`;
  `src/bee-map.ts:392` style `mapbox://styles/mapbox/outdoors-v12`;
  `src/bee-map.ts:443` comment already documents the style is fetched from
  api.mapbox.com and unavailable offline.

### Integration Points
- New `registerRoute(...)` in `src/sw.ts`, compiled by vite-plugin-pwa
  (injectManifest) — no new build wiring needed.
- ADR: no `docs/adr/` dir exists yet; this phase creates it.
- `CLAUDE.md` "Known State" — add the basemap-cache + legal-posture pointer.

</code_context>

<specifics>
## Specific Ideas

- The phase was retitled in spirit from "TOS-gated offline cache" to "ToS-compliant
  performance cache." Directory slug kept as `154-mapbox-tile-caching-tos-gated`
  to avoid churn; the "tos-gated" in the slug now refers to the ADR gate that was
  cleared, not a runtime flag.
- Honest expectation set with the user: the perf benefit over the browser's own
  HTTP cache is modest (faster warm loads on revisit); the value is correctness +
  a documented legal position, not offline capability.

</specifics>

<deferred>
## Deferred Ideas

- **True offline basemap** — only achievable compliantly via a Mobile SDK
  (native app) or written Mapbox confirmation for a web offline cache, or by
  switching the basemap to a self-hostable/openly-licensed tile source (e.g.,
  MapLibre + Protomaps/OpenFreeMap). Out of scope for v5.0; note for a future
  milestone if offline basemap becomes a hard requirement.

</deferred>

---

*Phase: 154-mapbox-tile-caching-tos-gated*
*Context gathered: 2026-06-21*
