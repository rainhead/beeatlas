---
phase: 154-mapbox-tile-caching-tos-gated
plan: 01
subsystem: pwa
tags: [workbox, service-worker, mapbox, pwa, tos-compliance, adr]

# Dependency graph
requires:
  - phase: 149-data-runtime-caching-offline-cold-start
    provides: Workbox registerRoute pattern (CacheFirst/NetworkFirst) + ExpirationPlugin/CacheableResponsePlugin already imported in src/sw.ts
provides:
  - StaleWhileRevalidate mapbox-basemap route in src/sw.ts (api.mapbox.com basemap caching, §2.8.1 compliant)
  - docs/adr/0001-mapbox-basemap-cache.md (Mapbox Product Terms ToS analysis)
  - CLAUDE.md Known State pointer to the basemap cache and ADR
affects: [infra, future-pwa-phases, any-phase-touching-sw.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StaleWhileRevalidate for cross-origin CDN assets (api.mapbox.com) — always include CacheableResponsePlugin to suppress SWR's default opaque allowance"
    - "Separate cacheName per route (mapbox-basemap) for independent storage accounting and invalidation"
    - "Hostname strict-equality predicate (url.hostname === 'api.mapbox.com') to exclude adjacent telemetry host (events.mapbox.com)"
    - "ADR pattern: docs/adr/NNNN-slug.md in Nygard format for ToS/legal decisions"

key-files:
  created:
    - docs/adr/0001-mapbox-basemap-cache.md
  modified:
    - src/sw.ts
    - src/tests/build-output.test.ts
    - CLAUDE.md

key-decisions:
  - "access_token is retained in cache key (no cacheKeyWillBeUsed plugin) — required by Mapbox ToS §1.1/§2.9.4"
  - "StaleWhileRevalidate chosen over NetworkFirst (NetworkFirst only helps offline — the use we're avoiding; SWR speeds up warm online loads)"
  - "maxAgeSeconds: 604800 (7 days) — conservative, well within 30-day §2.8.1 ceiling"
  - "maxEntries: 150 — safe because Mapbox API responses are CORS (non-opaque), stored at real size not ~7 MB Chrome opaque estimate"
  - "events.mapbox.com excluded by hostname strict equality; /map-sessions/ billing path excluded by path prefix check (D-07)"
  - "Registered unconditionally — no feature flag (D-07); ToS analysis cleared the ship-enabled path"
  - "cacheKeyWillBeUsed test assertion checks src/sw.ts (not compiled output) because Workbox bundles the string internally as a plugin lifecycle callback name"

patterns-established:
  - "ADR at docs/adr/ for ToS/legal decisions with Nygard format (Title/Status/Context/Decision/Compliance Checklist/Consequences)"
  - "Build-output tests for SW string literals: assert on cacheName strings (preserved by Rollup); check source file for callback names suppressed by Workbox internals"

requirements-completed: [TILE-01, TILE-02]

# Metrics
duration: 45min
completed: 2026-06-21
---

# Phase 154 Plan 01: Mapbox Tile Caching ToS-Gated Summary

**StaleWhileRevalidate mapbox-basemap cache for api.mapbox.com in src/sw.ts, ship-enabled, §2.8.1 compliant with full ToS analysis in docs/adr/0001-mapbox-basemap-cache.md**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-21T16:00:00Z
- **Completed:** 2026-06-21T16:15:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added unconditional StaleWhileRevalidate route in `src/sw.ts` for `api.mapbox.com` basemap assets (tiles, style, glyphs, sprites) with dedicated `mapbox-basemap` cache, 7-day TTL, 200-only, token retained, telemetry path excluded
- Created `docs/adr/0001-mapbox-basemap-cache.md`: Nygard-format ADR documenting Mapbox Product Terms §1.9 default restriction, §2.8.1 performance-cache exception, and full compliance checklist (verdict: web-SDK offline basemap NOT licensed; this cache is permitted)
- Wrote 6 new TILE-01/TILE-02 build-output assertions in `src/tests/build-output.test.ts`; all pass in the final green run (824/824)

## Task Commits

1. **Task 1: RED — TILE-01/TILE-02 build-output assertions** - `e5933041` (test)
2. **Task 2: GREEN — StaleWhileRevalidate route in src/sw.ts (TILE-01)** - `c4b9cae8` (feat)
3. **Task 3: GREEN — ADR + CLAUDE.md pointer (TILE-02)** - `82a1cd87` (docs)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/sw.ts` — StaleWhileRevalidate route for api.mapbox.com; StaleWhileRevalidate added to workbox-strategies import
- `src/tests/build-output.test.ts` — 6 new assertions (154-01-01..04, 154-02-01..02) inside existing describe.skipIf(SKIP_BUILD) block
- `docs/adr/0001-mapbox-basemap-cache.md` — Mapbox ToS analysis ADR (new file; new docs/adr/ directory)
- `CLAUDE.md` — one-line Known State pointer to mapbox-basemap cache + ADR

## Decisions Made

- **cacheKeyWillBeUsed test assertion uses source file, not compiled output:** Workbox bundles `cacheKeyWillBeUsed` internally as a plugin lifecycle callback name in the compiled bundle. The compiled sw.js always contains it regardless of whether a user-land plugin adds it. The test was updated to check `src/sw.ts` (source) for absence of `cacheKeyWillBeUsed` — this correctly proxies for D-04 (no cache-key-rewriting plugin added).
- **matchCallback excludes /map-sessions/ explicitly:** RESEARCH Open Q2 raised concern that stale-serving a Map Load session response could cause billing edge cases. Added `!url.pathname.startsWith('/map-sessions/')` path exclusion in addition to the hostname check (D-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cacheKeyWillBeUsed test assertion needed source-file redirect**

- **Found during:** Task 2 verification (compiled sw.js check)
- **Issue:** The plan specified `expect(sw).not.toContain('cacheKeyWillBeUsed')` checking the compiled output. Workbox v7.4.1 bundles `cacheKeyWillBeUsed` as a plugin lifecycle callback name in its `getCacheKey` method — the string always appears in the compiled SW regardless of whether any user-land plugin adds it. The assertion would always fail.
- **Fix:** Updated the Task 1 test to read `src/sw.ts` (source file) instead of the compiled bundle for this check. Source correctly proves no `cacheKeyWillBeUsed` plugin is added.
- **Files modified:** `src/tests/build-output.test.ts`
- **Verification:** `grep -c "cacheKeyWillBeUsed" src/sw.ts` returns 0; all 824 tests pass
- **Committed in:** `c4b9cae8` (Task 2 commit, updated test alongside route implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug in test assertion incompatible with Workbox internals)
**Impact on plan:** The fix maintains the spirit of D-04 (no token-stripping plugin) while using the correct proxy signal. No scope creep.

## Issues Encountered

None beyond the cacheKeyWillBeUsed deviation documented above.

## Known Stubs

None. The SW route is wired unconditionally; no placeholder data flows to the UI.

## Threat Flags

No new security surface introduced beyond what the PLAN.md threat model anticipated. The route excludes `events.mapbox.com` (T-154-02 mitigated), caches 200-only (T-154-01 mitigated), and ExpirationPlugin bounds growth (T-154-03 mitigated).

## User Setup Required

None — no external service configuration required. The `mapbox-basemap` cache populates automatically from existing Mapbox API calls.

## Next Phase Readiness

- Phase 154 is the last phase of v5.0 Offline Field Mode milestone.
- Manual DevTools verification (VALIDATION.md Manual-Only Verifications) remains: confirm `api.mapbox.com` responses carry `Access-Control-Allow-Origin` (non-opaque), that warm reload serves tiles from `mapbox-basemap` cache with `access_token` retained, and that no `tiles.mapbox.com` requests appear for outdoors-v12.
- Ready for `/gsd-verify-work` (human UAT verification).

## Self-Check

Files:

- `/Users/rainhead/dev/beeatlas/src/sw.ts` — FOUND (modified)
- `/Users/rainhead/dev/beeatlas/docs/adr/0001-mapbox-basemap-cache.md` — FOUND (created)
- `/Users/rainhead/dev/beeatlas/src/tests/build-output.test.ts` — FOUND (modified)
- `/Users/rainhead/dev/beeatlas/CLAUDE.md` — FOUND (modified)

Commits:

- `e5933041` — FOUND (test: RED assertions)
- `c4b9cae8` — FOUND (feat: SW route)
- `82a1cd87` — FOUND (docs: ADR + CLAUDE.md)

Test suite: 824/824 passed (confirmed above)

## Self-Check: PASSED

---

*Phase: 154-mapbox-tile-caching-tos-gated*
*Completed: 2026-06-21*
