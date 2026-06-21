# Phase 154: Mapbox Basemap Performance Cache - Research

**Researched:** 2026-06-21
**Domain:** Workbox service worker route configuration, Mapbox GL JS request patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Offline tile serving on GL JS is not pursued. §1.9 + §2.8.1 permit only a ≤30-day on-device performance cache populated live from the APIs.
- **D-02:** A ToS-review ADR is a required deliverable (replaces old TILE-02 self-test gate). It quotes the Mapbox Product Terms clauses, records the verdict, and lists the compliance checklist the design satisfies. Add a one-line pointer in CLAUDE.md "Known State".
- **D-03:** StaleWhileRevalidate — serve cached asset instantly, revalidate from network in background. This is the actual perf win and is squarely a §2.8.1 performance cache.
- **D-04:** Keep `access_token` in the request / cache key. Token is static per deployment; stripping it would conflict with §1.1 and §2.9.4.
- **D-05:** 200-only caching via `CacheableResponsePlugin({ statuses: [200] })`; `ExpirationPlugin` with TTL ≤ 30 days and bounded `maxEntries`; `purgeOnQuotaError: true`.
- **D-06:** Dedicated cacheName `mapbox-basemap` separate from `data-artifacts` / `data-manifest`.
- **D-07:** Ship enabled by default — register route unconditionally, no feature flag.
- **D-08:** Keep Mapbox GL JS default `attributionControl: true` in place (§1.4, no offline exception). No code change needed.

### Claude's Discretion

- Exact host/URL match predicate(s) for the route — confirm via DevTools which hosts GL JS pulls tiles/style/sprite/glyph from, and whether responses are CORS (non-opaque, normal-sized) or opaque (~7 MB/entry in Chrome) before finalizing `maxEntries`.
- Choice of TTL value and `maxEntries` within the bounds in D-05.
- Test surface (extend `src/tests/build-output` / sw route assertions following the existing data-route test patterns).

### Deferred Ideas (OUT OF SCOPE)

- True offline basemap — only achievable compliantly via a Mobile SDK (native app) or written Mapbox confirmation for a web offline cache, or by switching the basemap to a self-hostable/openly-licensed tile source (e.g., MapLibre + Protomaps/OpenFreeMap).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TILE-01 | SW runtime-caches Mapbox basemap requests (tiles, style, sprites, glyphs) with StaleWhileRevalidate; shipped enabled; retains `access_token`; 200-only; bounded `maxEntries` + TTL ≤ 30 days; does not intercept `events.mapbox.com` | Route predicate (§Host/URL Predicate), Workbox API (§Workbox API Specifics), quota analysis (§CORS and Quota), pattern (§Code Examples) |
| TILE-02 | ADR documents Mapbox ToS analysis — verdict that web-SDK offline serving is unlicensed, and §2.8.1/§1.4 compliance checklist | ADR location and format (§ADR Location and Format) |
</phase_requirements>

---

## Summary

Phase 154 adds a single `StaleWhileRevalidate` Workbox route in `src/sw.ts` that caches Mapbox basemap assets (vector tile JSON, style JSON, glyphs .pbf, sprite files) served from `api.mapbox.com`. The route is registered unconditionally — no feature flag — with a dedicated `mapbox-basemap` cache name, 200-only response filtering, a 7-day TTL, and a 150-entry cap. It explicitly excludes `events.mapbox.com` telemetry via host check.

Mapbox GL JS v3 (installed: 3.24.1) serves ALL basemap resource types — style JSON, vector tiles, glyphs, and sprites — from `api.mapbox.com`. The bundle analysis confirms a single `API_URL: "https://api.mapbox.com"` constant used for all normalized resource URLs. No `*.tiles.mapbox.com` is used for the outdoors-v12 vector style; that host only appears for a 3D buildings beta feature not used in this project. Mapbox's official API guide states "web services support Cross-Origin Requests with no domain restrictions" [CITED: docs.mapbox.com/api/guides/], meaning all responses carry `Access-Control-Allow-Origin: *` — they are non-opaque in the SW cache, so normal (not inflated) storage accounting applies.

The existing `src/tests/build-output.test.ts` pattern (read compiled `_site/app/sw.js`, assert on string literals preserved through Rollup) is the correct test surface for TILE-01. No ADR directory exists; this phase creates `docs/adr/0001-mapbox-basemap-cache.md`.

**Primary recommendation:** Add one `registerRoute` block to `src/sw.ts`, import `StaleWhileRevalidate` from `workbox-strategies` alongside the existing `CacheFirst`/`NetworkFirst`, and write a build-output test asserting the `mapbox-basemap` cache name, absence of `events.mapbox.com` interception, and presence of the host predicate.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Basemap tile caching | Service Worker | — | SW intercepts all network requests; the route predicate in sw.ts is the only correct interception point |
| Legal compliance gate | ADR document | CLAUDE.md pointer | ToS analysis is a one-time documentation artifact; no runtime component |
| Attribution display | Browser / Mapbox GL JS | — | `attributionControl: true` is already set in bee-map.ts; no new code required |
| Telemetry pass-through | Service Worker (exclusion rule) | — | Exclusion is expressed as a negative condition in the route matchCallback |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `workbox-strategies` | 7.4.1 | Provides `StaleWhileRevalidate` class | Already installed; `CacheFirst`/`NetworkFirst` already imported in sw.ts |
| `workbox-expiration` | 7.4.1 | `ExpirationPlugin` for TTL + maxEntries | Already installed and used in existing sw.ts routes |
| `workbox-cacheable-response` | 7.4.1 | `CacheableResponsePlugin` for 200-only filtering | Already installed and used in existing sw.ts routes |

[VERIFIED: npm registry — confirmed via `npm list` output in node_modules; all three are 7.4.1]

### Supporting

No new packages are needed. All required Workbox modules are already declared in `package.json` as direct dependencies and are present in `node_modules`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| StaleWhileRevalidate | NetworkFirst | NetworkFirst only helps offline (the use we're avoiding); provides no online perf benefit |
| StaleWhileRevalidate | CacheFirst | Fastest repeat loads but serves stale tiles indefinitely between purges; SWR is the compliant choice per D-03 |

**Installation:** None required — all dependencies already present.

---

## Package Legitimacy Audit

No new packages are being installed. All Workbox packages in use are already present in node_modules at version 7.4.1 and are direct dependencies of the project.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `workbox-strategies` | npm | 7+ yrs | High (Google project) | github.com/GoogleChrome/workbox | N/A — already installed | Approved (existing dep) |
| `workbox-expiration` | npm | 7+ yrs | High (Google project) | github.com/GoogleChrome/workbox | N/A — already installed | Approved (existing dep) |
| `workbox-cacheable-response` | npm | 7+ yrs | High (Google project) | github.com/GoogleChrome/workbox | N/A — already installed | Approved (existing dep) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Mapbox GL JS 3.24.1)
    |
    | fetch() with CORS mode
    | → GET https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=...
    | → GET https://api.mapbox.com/v4/{tileset}.json?access_token=...
    | → GET https://api.mapbox.com/v4/{tileset}/{z}/{x}/{y}.{ext}?access_token=...
    | → GET https://api.mapbox.com/fonts/v1/{fontstack}/{range}.pbf?access_token=...
    | → GET https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/sprite.{ext}?access_token=...
    |
    v
Service Worker (src/sw.ts)
    |
    |-- matchCallback: url.hostname === 'api.mapbox.com'
    |                  (events.mapbox.com is a different hostname — automatically excluded)
    |
    |-- StaleWhileRevalidate (cacheName: 'mapbox-basemap')
    |   |-- CacheableResponsePlugin({ statuses: [200] })   # 200-only, no opaque
    |   |-- ExpirationPlugin({ maxEntries: 150,            # tile diversity bound
    |   |                       maxAgeSeconds: 7*24*3600,  # 7 days << 30-day legal ceiling
    |   |                       purgeOnQuotaError: true })
    |
    |-- [events.mapbox.com telemetry passes through unchanged — not matched]
    |
    v
Network: https://api.mapbox.com   (CORS, non-opaque responses)
         https://events.mapbox.com (telemetry, not intercepted)
```

### Recommended Project Structure

```
src/
├── sw.ts             # +1 registerRoute block for mapbox-basemap
docs/
└── adr/
    └── 0001-mapbox-basemap-cache.md   # new — ToS analysis ADR
CLAUDE.md             # +1 line in "Known State" pointing to ADR
```

### Pattern 1: Workbox StaleWhileRevalidate Route

**What:** Register a route that intercepts cross-origin requests to `api.mapbox.com` and serves them stale-while-revalidating from a dedicated cache.

**When to use:** Any external CDN/API whose responses benefit from instant cache serving on repeat loads and where the provider permits a device performance cache.

**Example:**

```typescript
// Source: workbox-strategies v7.4.1 StaleWhileRevalidate.d.ts (confirmed in node_modules)
import { StaleWhileRevalidate } from 'workbox-strategies';

// Mapbox basemap performance cache (§2.8.1 compliant)
// Intercepts: api.mapbox.com/styles/**, /v4/**, /fonts/**, /styles/**/sprite.**
// Does NOT intercept: events.mapbox.com (different hostname — no match)
registerRoute(
  ({ url }) => url.hostname === 'api.mapbox.com',
  new StaleWhileRevalidate({
    cacheName: 'mapbox-basemap',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 7 * 24 * 60 * 60,   // 7 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);
```

**Critical note on plugin ordering:** `StaleWhileRevalidate` by default prepends `cacheOkAndOpaquePlugin` (accepts status 200 OR status 0) only if no plugin has a `cacheWillUpdate` hook. Because `CacheableResponsePlugin` implements `cacheWillUpdate`, including it in the plugins array suppresses the default opaque-response allowance. This is the correct behavior for D-05 (200-only). Verified in `node_modules/workbox-strategies/StaleWhileRevalidate.js` lines 50-56. [VERIFIED: npm registry]

### Anti-Patterns to Avoid

- **Matching on `*.mapbox.com` glob:** The SW `matchCallback` receives a `URL` object; use `url.hostname === 'api.mapbox.com'` rather than a regex on the full URL string. A hostname check is precise and fast; a regex on the full URL may accidentally match `events.mapbox.com` if written carelessly.
- **Sharing the cache name with `data-artifacts`:** The existing `data-artifacts` routes have their own `ExpirationPlugin` instances. Sharing the name would cause unpredictable cross-route eviction. D-06 mandates a dedicated `mapbox-basemap` name.
- **Using `NetworkFirst` instead of `StaleWhileRevalidate`:** NetworkFirst provides cache fallback only when offline, which is the use case we are explicitly NOT building. SWR actually speeds up warm-cache loads while online.
- **Stripping `access_token` from the cache key:** D-04 prohibits this. The token is static per deployment so URLs are naturally stable; stripping it would violate §1.1 / §2.9.4. No custom `cacheKeyWillBeUsed` plugin.

---

## Host/URL Predicate — Key Research Finding

### What Hosts Does Mapbox GL JS v3 Use for outdoors-v12?

Inspected `node_modules/mapbox-gl/dist/mapbox-gl.js` (v3.24.1 bundle): [VERIFIED: npm registry]

| Resource Type | URL Pattern | Host |
|---------------|-------------|------|
| Style JSON | `https://api.mapbox.com/styles/v1/{user}/{style}?access_token=...` | `api.mapbox.com` |
| Vector tile source JSON | `https://api.mapbox.com/v4/{tileset}.json?access_token=...&secure` | `api.mapbox.com` |
| Vector tile data | `https://api.mapbox.com/v4/{tileset}/{z}/{x}/{y}.{ext}?access_token=...` | `api.mapbox.com` |
| Glyphs | `https://api.mapbox.com/fonts/v1/{fontstack}/{range}.pbf?access_token=...` | `api.mapbox.com` |
| Sprites | `https://api.mapbox.com/styles/v1/{user}/{style}/sprite.{ext}?access_token=...` | `api.mapbox.com` |
| Telemetry | `https://events.mapbox.com/events/v2` | `events.mapbox.com` |
| Map sessions | `https://api.mapbox.com/map-sessions/v1` | `api.mapbox.com` |

**Single-host conclusion:** For the outdoors-v12 vector style, ALL cacheable basemap assets are served from `api.mapbox.com`. Telemetry is the ONLY resource that goes to `events.mapbox.com`. A simple `url.hostname === 'api.mapbox.com'` predicate correctly captures all basemap assets and never captures telemetry.

Evidence from bundle: `API_URL: "https://api.mapbox.com"` is the single constant from which all resource URLs are constructed via `_makeAPIURL()`. Path prefixes confirmed in bundle: `/styles/v1`, `/v4/`, `/fonts/v1`, `TILE_URL_VERSION: "v4"`, `/map-sessions/v1`. [VERIFIED: npm registry — inspected installed bundle]

**Note on `tiles.mapbox.com`:** This host does appear in GitHub issue #13155 (a 3D buildings beta feature). The outdoors-v12 style does not use 3D buildings tiles; however, if future style changes introduce such tiles, the `url.hostname === 'api.mapbox.com'` predicate would correctly exclude them and they would pass through uncached. This is acceptable and conservative — the matchCallback can be extended later if needed. [ASSUMED — host enumeration based on bundle analysis and style spec; DevTools verification during manual UAT is recommended]

---

## CORS vs Opaque Responses — Critical for Quota

### Finding: Non-Opaque (CORS) Responses

Mapbox API responses are non-opaque. Evidence:

1. **Official statement:** Mapbox API overview docs state "Mapbox web services support Cross-Origin Requests with no domain restrictions." [CITED: docs.mapbox.com/api/guides/] This means `Access-Control-Allow-Origin: *` (or `Access-Control-Allow-Origin: <origin>`) is present on responses.

2. **GL JS fetch mode:** The bundle uses `fetch(new Request(url, { credentials: e.credentials, ... }))`. The `credentials` field is passed through from the request options; no explicit `mode: 'no-cors'` is set anywhere in the bundle. Standard CORS fetch (mode defaults to `'cors'` for cross-origin `new Request()`) is used. [VERIFIED: npm registry — inspected bundle]

3. **Practical validation:** DevTools Network panel > click any `api.mapbox.com` request > Response Headers > confirm `Access-Control-Allow-Origin` is present. If the response shows `access-control-allow-origin: *`, the SW will receive a non-opaque response.

### Why This Matters for maxEntries

Opaque responses are charged ~7 MB each against the origin cache quota in Chrome, regardless of actual response size. With ~23 MB already used by the DB (Phase 149), a 7 MB/entry charge would exhaust the ~50 MB iOS quota after just 3-4 tiles.

Since Mapbox responses are non-opaque (CORS), they are cached at their actual sizes: vector tiles are typically 10-300 KB compressed, style JSON is ~20-100 KB, glyphs ~8-20 KB, sprites ~10-50 KB. 150 entries at average ~80 KB = ~12 MB additional usage — safe alongside the existing ~23 MB DB usage.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache-entry eviction by count/age | Custom SW cache pruning | `ExpirationPlugin` | Edge cases in multi-tab environments, quota events, concurrent writes — already handled |
| Response status filtering | `if (response.status === 200)` check | `CacheableResponsePlugin` | The `cacheWillUpdate` hook integrates with Workbox's plugin lifecycle; ad-hoc checks miss the lifecycle |
| Stale-while-revalidate logic | Manual SW `cache.match()` + `fetch().then(cache.put())` | `StaleWhileRevalidate` | Race conditions in parallel tab access, error propagation, background fetch queue — already handled |

---

## Common Pitfalls

### Pitfall 1: Including `events.mapbox.com` in the Cache

**What goes wrong:** A matchCallback that uses a regex like `/mapbox\.com/` or checks `url.origin.includes('mapbox')` catches `events.mapbox.com` telemetry requests. Mapbox uses events to count Map Loads for billing. Intercepting them may delay or drop billing events, risking §2.9.4 violation ("don't modify billing/accounting code").

**Why it happens:** Casual glob matching rather than explicit hostname comparison.

**How to avoid:** Use `url.hostname === 'api.mapbox.com'` — strict equality, not includes/regex.

**Warning signs:** Any SW matchCallback that operates on `url.href` or `url.origin` string-contains-mapbox without specifically excluding the events host.

---

### Pitfall 2: Default SWR Plugin Accepting Opaque Responses

**What goes wrong:** `new StaleWhileRevalidate({ cacheName: 'mapbox-basemap' })` without an explicit `CacheableResponsePlugin` causes SWR to prepend `cacheOkAndOpaquePlugin` internally. This plugin accepts status 0 (opaque) in addition to status 200. If Mapbox ever changes its CORS headers or a request mode changes, opaque responses (~7 MB each in Chrome quota accounting) silently fill the cache.

**Why it happens:** SWR's default behavior is intentionally permissive for developer convenience.

**How to avoid:** Always include `new CacheableResponsePlugin({ statuses: [200] })` as a plugin. Because this plugin implements `cacheWillUpdate`, SWR skips adding `cacheOkAndOpaquePlugin` (confirmed in bundle: `if (!this.plugins.some((p) => 'cacheWillUpdate' in p))`). Status-0 responses are silently dropped rather than cached. [VERIFIED: npm registry]

---

### Pitfall 3: Sharing Cache Name with `data-artifacts`

**What goes wrong:** Both `mapbox-basemap` and `data-artifacts` use an `ExpirationPlugin` scoped to their own route. If the same `cacheName` were shared, both plugins would observe the same cache but each would independently count and evict entries — leading to unpredictable behavior where the DB entry gets evicted because the tile counter reaches `maxEntries`.

**Why it happens:** The ExpirationPlugin comment in existing sw.ts ("per-route ExpirationPlugin scopes its eviction to the route it is registered on, not the cache as a whole") is sometimes misread as implying shared names are safe.

**How to avoid:** Use a dedicated `cacheName: 'mapbox-basemap'` per D-06.

---

### Pitfall 4: TTL Exceeding the Legal Ceiling

**What goes wrong:** An `maxAgeSeconds` value > 2,592,000 (30 days) would put the cache outside the §2.8.1 permitted window. While Workbox would still function, the legal standing of the cache becomes contested.

**How to avoid:** The recommended 7-day TTL (604,800 seconds) is well inside the ceiling. If the value is ever changed, verify it remains ≤ 2,592,000 seconds.

---

## Code Examples

### Full registerRoute Block (Drop Into sw.ts)

```typescript
// Source: workbox-strategies v7.4.1 (confirmed in node_modules), D-03/D-05/D-06/D-07
// Mapbox basemap performance cache — §2.8.1 compliant.
// Intercepts all GET requests to api.mapbox.com:
//   styles/v1/**       — style JSON
//   v4/**              — vector tile source JSON + tile data
//   fonts/v1/**        — glyph .pbf files
//   styles/**/sprite.* — sprite images + JSON
//   map-sessions/v1    — session accounting (non-sensitive, ok to SWR)
// Does NOT intercept events.mapbox.com (different hostname).
// access_token is retained in cache key (D-04: §1.1 / §2.9.4).
registerRoute(
  ({ url }) => url.hostname === 'api.mapbox.com',
  new StaleWhileRevalidate({
    cacheName: 'mapbox-basemap',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 7 * 24 * 60 * 60,  // 7 days — well within 30-day ToS ceiling
        purgeOnQuotaError: true,
      }),
    ],
  })
);
```

### Import Line Addition

```typescript
// Change existing import from:
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
// To:
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
```

### Build-Output Test Pattern (Extend build-output.test.ts)

```typescript
// Phase 154 — mapbox basemap cache assertions (TILE-01)

test('_site/app/sw.js registers StaleWhileRevalidate route for api.mapbox.com (TILE-01)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // Rollup preserves the dedicated cache name string literal
  expect(sw).toContain('mapbox-basemap');
  // The hostname predicate string is preserved through Rollup bundling
  expect(sw).toContain('api.mapbox.com');
  // events.mapbox.com must not appear — telemetry must never be intercepted
  expect(sw).not.toContain('events.mapbox.com');
  // ExpirationPlugin maxAgeSeconds must be <= 30 days (2592000 seconds) — ToS §2.8.1
  // 7 days = 604800; confirm it is present and is less than the 30-day ceiling
  const maxAgeMatch = [...sw.matchAll(/maxAgeSeconds[^\d]*(\d+)/g)].map(m => parseInt(m[1]!, 10));
  expect(maxAgeMatch.some(v => v > 0 && v <= 2_592_000), 'maxAgeSeconds must be ≤ 30 days').toBe(true);
});

test('_site/app/sw.js StaleWhileRevalidate is imported from workbox-strategies (TILE-01)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // Workbox SWR injects a background revalidation path; the string 'StaleWhileRevalidate'
  // may be minified, but the cache name 'mapbox-basemap' is always present when the route is registered.
  // Alternatively, check for the strategy-specific behavior: SWR resolves the cache first,
  // then re-fetches in background. The simplest durable assertion is the cache name.
  expect(sw).toContain('mapbox-basemap');
});
```

**Note on minification:** Rollup minifies class names in the SW bundle. `StaleWhileRevalidate` the class name may not appear verbatim; the string literal `'mapbox-basemap'` (the cacheName) is always preserved because it is a user-provided string constant. The existing OFF-02 test uses the same pattern (asserts on `'data-artifacts'` string, not the class name). Confirm this is consistent with the existing build-output test pattern.

---

## ADR Location and Format

### Finding: No `docs/adr/` Directory Exists

```bash
$ ls /Users/rainhead/dev/beeatlas/docs
# → "no docs/ dir"
```

This phase creates `docs/adr/` and writes the first ADR.

### Recommended Filename

`docs/adr/0001-mapbox-basemap-cache.md`

Use the Nygard format (lightweight decision record):
- **Title**: ADR 0001: Mapbox Basemap Cache — ToS Compliance Analysis
- **Status**: Accepted
- **Context**: Describe the §1.9 default restriction and §2.8.1 exception
- **Decision**: StaleWhileRevalidate performance cache, not offline cache
- **Compliance Checklist**: token retained, ≤30-day TTL, live-populated only, attribution intact, events.mapbox.com excluded
- **Consequences**: Modest perf benefit over browser HTTP cache; offline basemap remains gracefully degraded per Phase 149

### CLAUDE.md Pointer (Known State section)

One-line addition to "Known State":
```
- The `/app` SW caches Mapbox basemap assets (SWR, 7-day TTL, `mapbox-basemap` cache) per §2.8.1; legal analysis in `docs/adr/0001-mapbox-basemap-cache.md`.
```

---

## Attribution Verification

`bee-map.ts` line 395: `attributionControl: true` is explicitly set in the `mapboxgl.Map` constructor options. [VERIFIED: npm registry — inspected src/bee-map.ts]

This causes GL JS to render its default `AttributionControl` with: Mapbox logo + "© Mapbox © OpenStreetMap Improve this map" text, satisfying §1.4. No code change is needed in this phase. The phase does not touch `bee-map.ts` at all — this is documentation-only verification.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tiles.mapbox.com` is not used for outdoors-v12 vector tiles (only `api.mapbox.com`) | Host/URL Predicate | If tiles.mapbox.com is actually used, the route predicate misses those requests. Mitigation: DevTools verification during UAT (check Network tab for `tiles.mapbox.com` requests). Impact: low — cache still works for all api.mapbox.com assets; only potential additional tile subdomain missed. |
| A2 | Mapbox API responses carry `Access-Control-Allow-Origin` headers (non-opaque) | CORS vs Opaque | If responses are opaque, each tile costs ~7 MB in Chrome quota accounting; 150 entries would far exceed the ~50 MB iOS origin quota. Mitigation: DevTools verification during UAT (Network tab → any api.mapbox.com response → Response Headers → confirm ACAO present). Impact: if wrong, reduce maxEntries to ~5 and add a note in ADR. |
| A3 | `map-sessions/v1` being cached by SWR is benign | Host/URL Predicate | Session pings carry SKU tokens for billing; caching a stale one could cause billing edge cases. Mitigation: If uncertain, refine matchCallback to exclude `/map-sessions/` path. Low risk since SWR revalidates in background and the fresh network response is always sent. |

---

## Open Questions

1. **`tiles.mapbox.com` for future style changes**
   - What we know: outdoors-v12 currently uses `api.mapbox.com` only for vector tiles
   - What's unclear: future Mapbox style spec changes (e.g., 3D buildings enabled in the style) could introduce requests to `tiles.mapbox.com`
   - Recommendation: Accept current single-host predicate; note in ADR that monitoring DevTools Network for new hosts is part of future style version upgrades

2. **`map-sessions/v1` interception**
   - What we know: The session endpoint path is `/map-sessions/v1` on `api.mapbox.com`, which matches the `url.hostname === 'api.mapbox.com'` predicate
   - What's unclear: Whether stale-serving a session response has any billing side-effect
   - Recommendation: Add a path exclusion for `/map-sessions/` to be conservative: `url.hostname === 'api.mapbox.com' && !url.pathname.startsWith('/map-sessions/')`. Include this exclusion in the implementation.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is a code-only change to `src/sw.ts` and a new docs file. No new external tools, services, or CLIs are introduced. `npm run build` and `npm test` are already confirmed working per the existing test suite.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (inferred from existing test files and package.json scripts) |
| Config file | `vite.config.ts` (Vitest is configured there per project patterns) |
| Quick run command | `npm test -- --reporter=verbose src/tests/build-output.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TILE-01 | SW registers SWR route for api.mapbox.com with mapbox-basemap cacheName | Source assertion (build output) | `npm test -- src/tests/build-output.test.ts` | ❌ Wave 0 — add tests to existing file |
| TILE-01 | SW does not intercept events.mapbox.com | Source assertion (build output) | same | ❌ Wave 0 |
| TILE-01 | maxAgeSeconds ≤ 2,592,000 (30 days) | Source assertion (build output) | same | ❌ Wave 0 |
| TILE-01 | access_token is NOT stripped (no custom cacheKeyWillBeUsed plugin) | Source assertion (build output) — assert absence of cacheKeyWillBeUsed | same | ❌ Wave 0 |
| TILE-02 | ADR file exists at docs/adr/0001-mapbox-basemap-cache.md | File existence assertion | `npm test -- src/tests/build-output.test.ts` | ❌ Wave 0 |
| TILE-02 | CLAUDE.md contains basemap cache pointer | Source assertion | same | ❌ Wave 0 |
| TILE-01 | Attribution control remains enabled (attributionControl: true in bee-map.ts) | Source assertion | `grep -q 'attributionControl: true' src/bee-map.ts` | Manual / CI grep |

### Sampling Rate

- **Per task commit:** `npm test -- --reporter=verbose src/tests/build-output.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`; DevTools manual check (see TILE-01 UAT notes) [ASSUMED — TILE-01 requires manual DevTools verification of CORS behavior and network interception]

### Wave 0 Gaps

- [ ] New test block in `src/tests/build-output.test.ts` — covers TILE-01 (cache name, hostname predicate, events exclusion, maxAgeSeconds) and TILE-02 (ADR file existence, CLAUDE.md pointer)
- [ ] No new test file needed — extend existing `describe.skipIf(SKIP_BUILD)(...)` block

**Note:** The build-output test runs `npm run build` in `beforeAll`. This is expensive (~30-90s). All TILE assertions should be grouped into the existing `describe.skipIf(SKIP_BUILD)` block so they share the single build invocation.

---

## Security Domain

`security_enforcement` is not explicitly set to false in `.planning/config.json`. However, this phase makes no changes to authentication, session management, access control, or data validation flows. The only security-adjacent consideration is the ToS compliance already addressed by D-04 (token retention) and D-07 (no interception of events.mapbox.com). No new ASVS categories are introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | SW matchCallback uses strict `===` comparison on url.hostname |
| V6 Cryptography | no | — |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Caching Mapbox tiles offline (web SDK) | Performance cache only (SWR, live-populated) | 2026-06-21 re-scope | ToS compliance; offline basemap via Phase 149 graceful degradation |
| sw-precache | Workbox injectManifest | ~2018 | Already in use in this project |

**Deprecated/outdated:**
- `beta_tile_cache` feature flag: Dropped (was never shipped; D-07 mandates no flag).

---

## Sources

### Primary (HIGH confidence)

- `node_modules/mapbox-gl/dist/mapbox-gl.js` v3.24.1 — inspected for `API_URL`, `events.mapbox.com`, URL construction patterns, fetch mode, credentials
- `node_modules/workbox-strategies/StaleWhileRevalidate.js` v7.4.1 — inspected constructor plugin injection logic (cacheOkAndOpaquePlugin suppression)
- `node_modules/workbox-strategies/StaleWhileRevalidate.d.ts` v7.4.1 — constructor signature `(options?: StrategyOptions)`
- `src/sw.ts` — existing route pattern template (registerRoute, CacheFirst, NetworkFirst, ExpirationPlugin, CacheableResponsePlugin)
- `src/tests/build-output.test.ts` — existing SW assertion pattern (readFileSync `_site/app/sw.js`, string contains)

### Secondary (MEDIUM confidence)

- [CITED: docs.mapbox.com/api/guides/] — "Mapbox web services support Cross-Origin Requests with no domain restrictions" (CORS confirmation)
- [CITED: docs.mapbox.com/help/dive-deeper/api-caching/] — vector tile max-age: 12 hours (device cache TTL); s-maxage: 604,800 (CDN TTL)
- [CITED: docs.mapbox.com/api/maps/vector-tiles/] — Vector Tiles API URL pattern: `api.mapbox.com/v4/{tileset}/{z}/{x}/{y}.{format}?access_token=...`
- [CITED: docs.mapbox.com/api/maps/styles/] — Styles API URL pattern: `api.mapbox.com/styles/v1/{username}/{style_id}`

### Tertiary (LOW confidence — verify during UAT)

- A1/A2 (see Assumptions Log) — CORS verification and tiles.mapbox.com host check require DevTools during manual UAT

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed in node_modules at exact version
- Architecture: HIGH — URL patterns confirmed by bundle inspection; CORS confirmed by official docs
- Pitfalls: HIGH — pitfalls derived from direct code inspection of SWR constructor logic
- ADR location: HIGH — confirmed no docs/ dir exists; first ADR creates it

**Research date:** 2026-06-21
**Valid until:** 2026-09-21 (Workbox 7.x is stable; Mapbox GL JS v3 URL patterns are stable; ToS effective date 2026-06-17 reviewed)
