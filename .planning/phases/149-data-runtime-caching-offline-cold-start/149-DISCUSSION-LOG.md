# Phase 149: `/data/` Runtime Caching + Offline Cold-Start - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 149-data-runtime-caching-offline-cold-start
**Areas discussed:** Re-prime trigger & boundary vs Phase 150, Quota & partial-write UX (CACHE-05), Offline-state UI surfaces (OFF-04 + OFF-05)

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| GeoJSON cache strategy | Precache vs runtime CacheFirst for counties/ecoregions/places.geojson | |
| Re-prime trigger & boundary vs Phase 150 | CACHE-05 trigger choice + UX boundary | ✓ |
| Quota & partial-write UX (CACHE-05) | Workbox plugin vs hand-coded vs sentinel; user-facing UX | ✓ |
| Offline-state UI surfaces (OFF-04 + OFF-05) | Online/offline indicator + blank-basemap label placement | ✓ |

**User's choice:** Three areas selected; GeoJSON cache strategy delegated to Claude's discretion.

---

## Re-prime trigger & boundary vs Phase 150

### Question 1: What triggers the re-prime when occurrences.db is absent on reconnect?

| Option | Description | Selected |
|--------|-------------|----------|
| Cold-start probe only | Check on every /app load; no event listeners; user reloads to recover mid-session | |
| Cold-start probe + online event | Probe on load AND listen for `online` event for offline→wifi field flow | ✓ |
| Probe on every page focus too | Cold-start + online + `visibilitychange` — most aggressive | |

**User's choice:** Cold-start probe + online event.
**Notes:** `visibilitychange` deferred — can be added later if field testing shows the `online` event misses cases.

### Question 2: What does the user see during the 149-phase re-prime?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent background fetch | No new UI in 149; Phase 150 progress indicator covers visibility | ✓ |
| Minimal transient banner | Small "Refreshing offline data…" toast that disappears on completion | |
| Reuse existing loading screen text | Augment tablesReady splash with "Restoring offline data…" copy | |

**User's choice:** Silent background fetch.
**Notes:** Phase 150 will surface the visible progress UI on top of the trigger wired here.

---

## Quota & partial-write UX (CACHE-05)

**Clarifying exchange:** User asked "walk me through the scenarios whereby we exceed quota — the app payload is bounded, either it fits or it doesn't." Claude explained the missing growth vector: the DB URL is content-hashed, so every nightly pipeline produces a *new* cache key. Without an entry cap, old DB entries accumulate (two DB copies during a nightly hash bump = ~46 MB, which tips iOS's ~50 MB quota even on a healthy device). The questions were reframed around that insight: cap entries first, then quota handling shrinks to a small edge case.

### Question 1 (reframed): Given the real growth vector is hash churn, how do we cap DB cache entries?

| Option | Description | Selected |
|--------|-------------|----------|
| Workbox `maxEntries: 1` + `purgeOnQuotaError: true` | ExpirationPlugin evicts previous DB on each new cache; steady-state ~23 MB | ✓ |
| Hand-coded activate-time cleanup | Scan `data-artifacts` on SW activate; delete old `/data/occurrences_*.db` entries not in current manifest | |
| Both | Belt-and-suspenders | |

**User's choice:** Workbox `maxEntries: 1` + `purgeOnQuotaError: true`.
**Notes:** Recommended option. Trusts Workbox's eviction; simpler than hand-coded scan.

### Question 2 (reframed): Given entries are capped, how do we handle the 'device truly full' QuotaExceededError edge case?

| Option | Description | Selected |
|--------|-------------|----------|
| Console warn + offline-readiness reports 'not ready' | No new UI in 149; Phase 150 indicator surfaces it | ✓ |
| Post a message to the page + minimal banner | SW posts {type:'cache-quota-exceeded'}; small dismissible banner | |
| Defer entirely to Phase 150 | 149 does SW-side cleanup only; postMessage rendered in 150 | |

**User's choice:** Console warn + offline-readiness reports 'not ready'.
**Notes:** Sentinel-key partial-write detection (PITFALLS Pitfall 6) NOT adopted — Cache API `put()` is atomic and `purgeOnQuotaError` is the cleanup path. Researcher may re-raise if a real corruption mode shows up in target browsers.

---

## Offline-state UI surfaces (OFF-04 + OFF-05)

### Question 1: Where does the online/offline indicator live, and when is it visible?

| Option | Description | Selected |
|--------|-------------|----------|
| Small pill in bee-header, only when offline | Rendered only on `!navigator.onLine`; nothing visible when online | ✓ |
| Persistent pill in bee-header (Online/Offline) | Always-visible green/gray state pill | |
| Inline in bee-pane footer | Co-located with the eventual "data as of" label in 150 | |

**User's choice:** Small pill in bee-header, only when offline.
**Notes:** Quiet UI preference — no editorializing on the normal-case.

### Question 2: How is the blank-basemap explanation surfaced?

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional overlay on the map, offline only | Bottom-left text overlay; appears only when offline; map-anchored | ✓ |
| Bee-pane footer note, offline only | Side-panel one-liner; keeps map chrome-free | |
| Static help text, always visible in /app | Always-on note explaining the limitation upfront | |

**User's choice:** Conditional overlay on the map, offline only.
**Notes:** Map-anchored so user sees the explanation where they're looking. No viewport-tile-cache awareness in 149 (a simple offline-gated overlay is honest enough for the dogfood phase).

---

## Claude's Discretion

- **GeoJSON cache strategy** (D-02): Default to runtime CacheFirst alongside DB; researcher may flip to precache if concrete reason. User skipped this area entirely.
- Exact pill / overlay copy text and visual styling.
- Cache name string (`data-artifacts` per research suggestion).
- Whether the cold-start probe lives in `app-entry.ts`, `bee-atlas.ts`, or a new `src/cache-probe.ts`.
- `CacheableResponsePlugin({ statuses: [200] })` on the DB route.
- Exact `online`/`offline` event wiring (one shared listener vs per-component).

## Deferred Ideas

- `visibilitychange` re-prime probe (revisit after field testing).
- Tile-cache-aware blank-basemap behavior (deferred until Mapbox tile caching ships behind `beta_tile_cache`).
- "Always-on" Online/Offline pill in `<bee-header>` (rejected in favor of offline-only pill).
- SW→page `postMessage({type:'cache-quota-exceeded'})` plumbing (additive later if Phase 150 design wants a richer storage-full surface).
- Mapbox tile runtime caching (TOS-gated, later milestone).
- `manifest.json` `NetworkFirst` caching → **Phase 150**.
- Prompt-to-reload banner → **Phase 150**.
- Real `manifest.webmanifest` + icons + installability → **Phase 151**.
