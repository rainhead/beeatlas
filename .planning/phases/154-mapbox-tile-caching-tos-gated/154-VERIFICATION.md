---
phase: 154-mapbox-tile-caching-tos-gated
verified: 2026-06-21T16:30:00Z
status: passed
score: 7/7 must-haves verified
human_verification_result: passed (operator UAT 2026-06-21 — 3/3 DevTools checks confirmed; see 154-HUMAN-UAT.md)
overrides_applied: 0
human_verification:
  - test: "In DevTools > Application > Cache Storage, confirm a 'mapbox-basemap' cache appears after map load and entries have access_token retained in cache-key URLs"
    expected: "Entries are CORS (non-opaque), access_token query param is present in the stored request URL, no events.mapbox.com entries appear"
    why_human: "Cache Storage contents and CORS status of stored responses cannot be verified from source or build output alone"
  - test: "On warm reload, confirm basemap tiles are served from the 'mapbox-basemap' cache (DevTools Network tab shows '(ServiceWorker)' origin for api.mapbox.com tiles)"
    expected: "Network tab shows tiles served from SW cache on second load; map renders correctly; Mapbox attribution (logo + copyright) is visible"
    why_human: "SW cache hit behavior and runtime attribution display require browser execution"
  - test: "Confirm no tiles.mapbox.com requests appear in the Network tab (GL JS v3 routes all tile fetches through api.mapbox.com)"
    expected: "All Mapbox tile requests go to api.mapbox.com, not tiles.mapbox.com — confirming the hostname predicate covers actual tile traffic"
    why_human: "GL JS routing of tile fetches must be confirmed live in a browser; the host used can change across GL JS versions"
---

# Phase 154: Mapbox Tile Caching ToS-Gated Verification Report

**Phase Goal:** The SW runtime-caches Mapbox basemap requests (tiles, style, sprites, glyphs) with a StaleWhileRevalidate strategy to speed up warm/repeat map loads while online — a §2.8.1-compliant on-device performance cache populated live from the Mapping APIs, shipped enabled (no feature flag). It does NOT provide offline basemap serving.

**Verified:** 2026-06-21T16:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The /app SW runtime-caches api.mapbox.com basemap requests via StaleWhileRevalidate from a dedicated mapbox-basemap cache, registered unconditionally (no feature flag) — TILE-01 | VERIFIED | `src/sw.ts` lines 113-128: exactly one unconditional `registerRoute(({ url }) => url.hostname === 'api.mapbox.com' && !url.pathname.startsWith('/map-sessions/'), new StaleWhileRevalidate({ cacheName: 'mapbox-basemap', ... }))`. No env guard or feature flag. Compiled into `_site/app/sw.js` (strings `mapbox-basemap` and `api.mapbox.com` confirmed present). |
| 2 | events.mapbox.com telemetry and /map-sessions/ billing path are NOT intercepted — TILE-01 | VERIFIED | matchCallback uses strict `url.hostname === 'api.mapbox.com'` (not a substring match), so `events.mapbox.com` never matches. Path check `!url.pathname.startsWith('/map-sessions/')` explicitly excludes the billing path. `grep -c "events.mapbox.com" _site/app/sw.js` = 0. `grep "map-sessions" _site/app/sw.js` confirms the exclusion predicate is present in compiled output. Test 154-01-02 PASSES. |
| 3 | Only HTTP 200 responses are cached; growth is bounded by maxEntries + a TTL of 7 days (604800s, <= 30-day ceiling) with purgeOnQuotaError — TILE-01 | VERIFIED | `src/sw.ts` lines 120-124: `new CacheableResponsePlugin({ statuses: [200] })`, `maxEntries: 150`, `maxAgeSeconds: 604800`, `purgeOnQuotaError: true`. Test 154-01-03 parses all maxAgeSeconds values from compiled SW and asserts at least one is in (0, 2_592_000]. PASSES. |
| 4 | access_token is RETAINED in the cache key — no cacheKeyWillBeUsed plugin in user code — TILE-01 | VERIFIED | `grep -c "cacheKeyWillBeUsed" src/sw.ts` = 0. Compiled `_site/app/sw.js` does contain `cacheKeyWillBeUsed` once, but this is a Workbox v7 internal lifecycle method name bundled by Workbox itself — not a user-land plugin. Test 154-01-03 correctly checks `src/sw.ts` (source) for absence, as documented. PASSES. |
| 5 | Mapbox GL JS default attribution (attributionControl: true in bee-map.ts) remains in place, not suppressed — TILE-01 | VERIFIED | `src/bee-map.ts` line 395: `attributionControl: true,` in the `new mapboxgl.Map({ ... })` constructor. Test 154-01-04 reads source directly and asserts presence. PASSES. |
| 6 | ADR at docs/adr/0001-mapbox-basemap-cache.md records the ToS verdict that web-SDK offline basemap serving is NOT pursued/unlicensed and the §2.8.1/§1.4 compliance checklist — TILE-02 | VERIFIED | File exists. Contains all required Nygard sections (Context, Decision, Compliance Checklist, Consequences). States "Verdict: web-SDK offline basemap serving is NOT licensed under the Mapbox Product Terms." Cites §1.9, §2.8.1, §1.4, §1.1, §2.9.4, §1.3.9, §3.31, §3.43. References "Last Updated: June 17, 2026". Contains both literal strings `2.8.1` and `StaleWhileRevalidate`. Test 154-02-01 PASSES. |
| 7 | CLAUDE.md Known State has a one-line pointer to the basemap cache + the ADR — TILE-02 | VERIFIED | `CLAUDE.md` line 58 in Known State section: "The `/app` SW caches Mapbox basemap assets (StaleWhileRevalidate, 7-day TTL, `mapbox-basemap` cache, token retained, attribution intact) per §2.8.1 of the Mapbox Product Terms; web-SDK offline basemap serving is NOT licensed. Legal analysis in `docs/adr/0001-mapbox-basemap-cache.md`." Contains both `mapbox-basemap` and `docs/adr/0001-mapbox-basemap-cache.md`. Test 154-02-02 PASSES. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sw.ts` | StaleWhileRevalidate registerRoute for api.mapbox.com (mapbox-basemap cache) | VERIFIED | Contains the route block at lines 113-128; `StaleWhileRevalidate` added to the existing named import on line 27; no separate import statement added |
| `docs/adr/0001-mapbox-basemap-cache.md` | Mapbox ToS analysis + compliance checklist ADR | VERIFIED | Exists; 148 lines; Nygard format; all required clause refs present |
| `src/tests/build-output.test.ts` | TILE-01/TILE-02 build-output assertions | VERIFIED | Tests 154-01-01 through 154-02-02 appended inside the single existing `describe.skipIf(SKIP_BUILD)` block (confirmed: `grep -c "describe.skipIf(SKIP_BUILD)" src/tests/build-output.test.ts` = 1) |
| `CLAUDE.md` | Known State pointer to the basemap cache + ADR | VERIFIED | One bullet added to Known State section; no other section altered |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/sw.ts` | `_site/app/sw.js` | vite-plugin-pwa injectManifest build step | VERIFIED | `_site/app/sw.js` contains `mapbox-basemap`, `api.mapbox.com`, and `/map-sessions/`; does not contain `events.mapbox.com`; test suite PASSES (51/51) |
| `src/tests/build-output.test.ts` | `_site/app/sw.js` | readFileSync of compiled SW + string assertions | VERIFIED | Tests 154-01-01 and 154-01-02 read `_site/app/sw.js` via readFileSync and assert on the compiled string literals; all pass |

---

### Data-Flow Trace (Level 4)

Not applicable. This phase introduces a Workbox `registerRoute` block in a service worker — no React/Lit component rendering dynamic data. The "data" is runtime HTTP responses intercepted and stored in Cache Storage, which by definition can only be verified at runtime in a browser.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Compiled SW contains mapbox-basemap | `grep -c "mapbox-basemap" _site/app/sw.js` | 1 match | PASS |
| Compiled SW contains api.mapbox.com | `grep -c "api.mapbox.com" _site/app/sw.js` | 1 match | PASS |
| Compiled SW does NOT contain events.mapbox.com | `grep -c "events.mapbox.com" _site/app/sw.js` | 0 matches | PASS |
| Compiled SW contains /map-sessions/ exclusion predicate | `grep -c "map-sessions" _site/app/sw.js` | 1 match | PASS |
| src/sw.ts has no cacheKeyWillBeUsed user-land plugin | `grep -c "cacheKeyWillBeUsed" src/sw.ts` | 0 matches | PASS |
| src/bee-map.ts has attributionControl: true | `grep -n "attributionControl" src/bee-map.ts` | line 395: `attributionControl: true,` | PASS |
| ADR file exists and contains §2.8.1 and StaleWhileRevalidate | `grep "2.8.1" docs/adr/0001-mapbox-basemap-cache.md` | multiple matches | PASS |
| Full test suite | `npm test -- src/tests/build-output.test.ts` | 51/51 passed | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TILE-01 | 154-01-PLAN.md | SW caches api.mapbox.com with SWR, access_token retained, 200-only, bounded, telemetry/billing excluded, no feature flag | SATISFIED | All five sub-constraints verified (truths 1-5 above); tests 154-01-01 through 154-01-04 pass |
| TILE-02 | 154-01-PLAN.md | ADR documents ToS analysis, §2.8.1/§1.4 compliance checklist, CLAUDE.md pointer | SATISFIED | ADR exists with required content; CLAUDE.md pointer confirmed; tests 154-02-01 and 154-02-02 pass |

---

### Anti-Patterns Found

No debt markers (`TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`) found in any of the four files modified by this phase (`src/sw.ts`, `src/tests/build-output.test.ts`, `docs/adr/0001-mapbox-basemap-cache.md`, `CLAUDE.md`).

---

### Documented Deviation: cacheKeyWillBeUsed test checks source not compiled output

The SUMMARY correctly documents this: Workbox v7.4.1 bundles `cacheKeyWillBeUsed` as an internal plugin lifecycle callback name. The compiled `_site/app/sw.js` always contains this string regardless of whether any user-land plugin adds it. The test was updated to check `src/sw.ts` (source) for absence of the string — this is the correct proxy for D-04 (no cache-key-rewriting plugin added by user code).

This deviation is **sound**. The intent of D-04 is to confirm no user-land `cacheKeyWillBeUsed` plugin was added (which would strip the access_token). Checking the source file directly fulfills this intent more accurately than checking the compiled output, where Workbox's own bundled code introduces the string independently.

---

### Human Verification Required

#### 1. Cache Storage Population and CORS Status

**Test:** Open `/app` in Chrome, let the map load, then open DevTools > Application > Cache Storage. Look for a `mapbox-basemap` cache.
**Expected:** A `mapbox-basemap` cache entry appears; stored request URLs contain the `access_token` query parameter; entries are CORS (non-opaque, showing a real byte size not ~7 MB); no `events.mapbox.com` entries appear anywhere.
**Why human:** Cache Storage population and response opaque/CORS status can only be inspected at runtime in a browser.

#### 2. Warm Reload SW Cache Hit

**Test:** With the `/app` page already loaded once, open DevTools > Network, hard-reload, observe which api.mapbox.com requests show "(ServiceWorker)" in the origin column.
**Expected:** On second load, tile/style/glyph/sprite requests to `api.mapbox.com` are served from the SW cache (shown as ServiceWorker in the Network tab). The map renders correctly. The Mapbox attribution (logo + copyright text) is visible in the map corner.
**Why human:** SW cache hit behavior and correct attribution rendering require a live browser and cannot be verified from static analysis.

#### 3. Tile Host Confirmation (GL JS v3)

**Test:** In the Network tab during initial load, observe which hostname serves vector tile requests for the outdoors-v12 basemap.
**Expected:** All Mapbox tile requests go to `api.mapbox.com` (not `tiles.mapbox.com`), confirming the hostname predicate `url.hostname === 'api.mapbox.com'` actually covers the real traffic GL JS v3 generates.
**Why human:** The host Mapbox GL JS uses for tile fetches can vary by version; only a live browser run confirms the predicate covers actual traffic. This was identified in VALIDATION.md as a Manual-Only Verification item.

---

### Gaps Summary

None. All automated must-haves verified. The three human verification items above are runtime behavioral checks that cannot be confirmed from source or build output — they are the standard DevTools UAT prescribed in the phase's own VALIDATION.md.

---

_Verified: 2026-06-21T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
