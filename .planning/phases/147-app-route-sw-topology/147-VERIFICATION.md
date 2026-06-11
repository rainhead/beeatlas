---
phase: 147-app-route-sw-topology
verified: 2026-06-11T01:09:46Z
status: human_needed
score: 10/10
overrides_applied: 0
human_verification:
  - test: "DevTools SW topology: navigate to /app/ in a local production-build preview, confirm SW registered with scope /app/, no SW on /, /data/* shows ServiceWorker as initiator"
    expected: "DevTools Application > Service Workers shows scope '/app/' for /app/sw.js when on /app/; shows 'No service workers detected' when on /; Network tab shows ServiceWorker as initiator/served-by for a /data/* fetch while on /app/"
    why_human: "Service workers only register over https or localhost; the scope/attach state is only observable in a browser DevTools session, not greppable from the source tree. Requires npm run build && npm run preview."
  - test: "Post-deploy curl -I: confirm CloudFront serves Cache-Control: no-cache, no-store, must-revalidate on /app/sw.js after a real cdk deploy"
    expected: "curl -I https://<distribution-domain>/app/sw.js response includes Cache-Control: no-cache, no-store, must-revalidate; /app/manifest.webmanifest may return 403/404 with the same no-cache header (pre-Phase-151 state is expected)"
    why_human: "Requires a live cdk deploy to the real CloudFront distribution. The CDK template-assertion test (infra/test/beeatlas-stack.test.ts) verifies synth-time structure; live header behavior can only be confirmed post-deploy."
---

# Phase 147: `/app` Route + SW Topology — Verification Report

**Phase Goal:** A correctly-scoped service worker exists at `/app/sw.js` with `scope: '/app'`, the unlisted `/app/` route is served by Eleventy, and the main `/` route has no service worker — verified in DevTools. CDK serves `sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache` so updates are not delayed by CloudFront's default long-TTL.
**Verified:** 2026-06-11T01:09:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All automated facts are verified. Two items (DevTools SW topology + post-deploy CDK headers) are inherently manual and documented in 147-HUMAN-UAT.md. Those human items drive the `human_needed` status; they are not gaps — the automated structural evidence is complete and correct.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROUTE-01 / D-01: `_site/app/index.html` is emitted with the full `<bee-atlas>` SPA; `_pages/index.html` (the `/` template) is unchanged | VERIFIED | `_site/app/index.html` exists; `_site/index.html` still contains `bee-atlas`; `git diff --quiet -- _pages/index.html src/bee-atlas.ts` exits 0 |
| 2 | ROUTE-01 / D-07: `/app` is unlisted — `eleventyExcludeFromCollections: true` in front matter; no nav/home/sitemap link | VERIFIED | `_pages/app/index.html` lines 1-3 confirm the `---` front matter block with `eleventyExcludeFromCollections: true`; `_pages/index.html` unchanged (no link added) |
| 3 | ROUTE-01 / D-12: Build-output test asserts `_site/app/index.html` exists and references a hashed `/assets/app/index-*.js` chunk | VERIFIED | `src/tests/build-output.test.ts` lines 295-311 assert all three: existence, hashed chunk pattern `/assets/app/index-[^"]+.js`, and `_site/app/sw.js` existence; `VITEST_SKIP_BUILD=1 npm test` passes (630 tests, 26 files) |
| 4 | ROUTE-01 / D-12 (build gate): `_site/app/index.html` references a hashed `/assets/app/index-*.js` entry chunk from a real build | VERIFIED | Existing `_site/` confirms `src="/assets/app/index-DEedgzLV.js"` — Vite MPA mode names the chunk from the HTML page path (`app/index-<hash>`), not the module name; unhashed source reference `/src/app-entry.ts` is absent from `_site/app/index.html` |
| 5 | ROUTE-02 / D-02: `_pages/app/index.html` references `/src/app-entry.ts` (not `./src/bee-atlas.ts`); `src/app-entry.ts` imports `./bee-atlas.ts` and `./sw-registration.ts` | VERIFIED | `_pages/app/index.html` line 12: `src="/src/app-entry.ts"`; `src/app-entry.ts` lines 5-6: `import './bee-atlas.ts'` and `import './sw-registration.ts'` |
| 6 | ROUTE-02 / D-03: SW registration calls `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })` from `src/sw-registration.ts`, imported ONLY by `src/app-entry.ts` | VERIFIED | `src/sw-registration.ts` line 12 confirms the exact call; `grep -rln sw-registration src/` returns exactly `src/app-entry.ts` (one file) |
| 7 | ROUTE-02 / D-05: `public/app/sw.js` has install + activate listeners and a pass-through fetch handler; no caching | VERIFIED | File reads confirm: `install` listener (line 5), `activate` listener (line 10), `fetch` listener (line 15) with `event.respondWith(fetch(event.request))` (line 20) |
| 8 | ROUTE-02 / D-06: Neither `skipWaiting()` nor `clients.claim()` appears in `public/app/sw.js`; no `caches` reference | VERIFIED | `grep skipWaiting public/app/sw.js` → no output; `grep clients.claim public/app/sw.js` → no output; `grep caches public/app/sw.js` → no output |
| 9 | ROUTE-02 / D-04: `_site/app/sw.js` exists at unhashed stable URL | VERIFIED | `test -f _site/app/sw.js` confirmed present; filename is exactly `sw.js` with no hash suffix |
| 10 | ROUTE-03 / D-08/D-09: CDK stack has exactly two per-path behaviors (`/app/sw.js`, `/app/manifest.webmanifest`), shared zero-TTL CachePolicy, shared `Cache-Control: no-cache, no-store, must-revalidate` ResponseHeadersPolicy; no `/app/*` wildcard; CDK assertion test exits 0 | VERIFIED | `infra/lib/beeatlas-stack.ts` lines 98-144 confirm both `addBehavior('/app/sw.js', ...)` and `addBehavior('/app/manifest.webmanifest', ...)` using `swNoCachePolicy` (defaultTtl=0, maxTtl=0) and `swNoCacheHeadersPolicy` (Cache-Control: no-cache, no-store, must-revalidate); no `/app/*` wildcard present; `cd infra && npx ts-node test/beeatlas-stack.test.ts` prints "All CDK assertions passed." |

**Score:** 10/10 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_pages/app/index.html` | Eleventy SPA template for /app, `eleventyExcludeFromCollections: true`, references `/src/app-entry.ts` | VERIFIED | Exists; front matter correct; script src is absolute `/src/app-entry.ts` (not relative `./src/app-entry.ts` as PLAN specified, but Vite processes both equivalently — build output confirms hashed chunk emitted) |
| `src/app-entry.ts` | Vite entry importing `./bee-atlas.ts` and `./sw-registration.ts` | VERIFIED | Exists; 6 lines; imports both modules as side effects |
| `src/sw-registration.ts` | SW registration module; `registerServiceWorker()` not exported; registers `/app/sw.js` with scope `/app` | VERIFIED | Exists; function is NOT exported (no `export` keyword); `registerServiceWorker()` called at module bottom as side effect |
| `public/app/sw.js` | Pass-through stub SW: install/activate/fetch listeners, no caching, no skipWaiting, no clients.claim | VERIFIED | Exists; all three listeners present; D-06 prohibitions confirmed by grep |
| `src/tests/build-output.test.ts` | Three /app assertions inside existing `describe.skipIf(SKIP_BUILD)` block | VERIFIED | Lines 295-311 append three tests; all inside the existing describe block; no new describe created |
| `infra/lib/beeatlas-stack.ts` | Two per-path no-cache behaviors + shared zero-TTL CachePolicy + shared no-cache ResponseHeadersPolicy | VERIFIED | Lines 98-144 confirm all constructs; both behaviors share `swNoCachePolicy` and `swNoCacheHeadersPolicy` |
| `infra/test/beeatlas-stack.test.ts` | CDK template assertions: both PathPatterns, CachePolicyId by Ref, ResponseHeadersPolicyId by Ref, zero-TTL | VERIFIED | WR-01 fix applied: assertions link behaviors to policies by `{ Ref: zeroTtlCachePolicyId }` and `{ Ref: noCacheHeaderPolicyId }` |
| `infra/package.json` | `"test": "ts-node test/beeatlas-stack.test.ts"` in scripts | VERIFIED | Confirmed in scripts block |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `_pages/app/index.html` | `src/app-entry.ts` | `<script type=module src="/src/app-entry.ts">` | VERIFIED | Line 12 of `_pages/app/index.html`; absolute path (vs. PLAN's specified `./` relative — functionally equivalent; build confirms Vite processed it to hashed chunk) |
| `src/app-entry.ts` | `src/sw-registration.ts` | side-effect import `'./sw-registration.ts'` | VERIFIED | Line 6 of `src/app-entry.ts` |
| `src/sw-registration.ts` | `/app/sw.js` | `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })` | VERIFIED | Line 12 of `src/sw-registration.ts` |
| `infra/lib/beeatlas-stack.ts` | CloudFront distribution | `distribution.addBehavior('/app/sw.js', ...)` and `addBehavior('/app/manifest.webmanifest', ...)` | VERIFIED | Lines 126 and 137; `grep -c "addBehavior('/app/"` returns 2 |
| `infra/test/beeatlas-stack.test.ts` | `infra/lib/beeatlas-stack.ts` | `Template.fromStack(new BeeAtlasStack(...))` | VERIFIED | Line 33; `npx ts-node test/beeatlas-stack.test.ts` exits 0 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Quick-tier test suite passes | `VITEST_SKIP_BUILD=1 npm test` | 630 passed, 33 skipped, 1 file skipped | PASS |
| CDK assertion test passes | `cd infra && npx ts-node test/beeatlas-stack.test.ts` | "All CDK assertions passed." | PASS |
| `_site/app/index.html` emitted with hashed chunk | Check `_site/app/index.html` for `src="/assets/app/index-*.js"` | `src="/assets/app/index-DEedgzLV.js"` found | PASS |
| `_site/app/sw.js` emitted unhashed | `test -f _site/app/sw.js` | File exists | PASS |
| `grep -rln sw-registration src/` returns exactly one file | `grep -rln sw-registration src/` | `src/app-entry.ts` (1 file) | PASS |
| `_pages/index.html` and `src/bee-atlas.ts` untouched | `git diff --quiet -- _pages/index.html src/bee-atlas.ts` | exits 0 | PASS |
| SW stub has no `skipWaiting`, no `clients.claim`, no `caches` | `grep skipWaiting|clients.claim|caches public/app/sw.js` | no matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ROUTE-01 | 147-01-PLAN.md | Unlisted `/app/` route serves the offline-capable map+table; not linked from main site, sitemap, or nav; `/` unchanged | SATISFIED | `_pages/app/index.html` with `eleventyExcludeFromCollections: true`; `_site/app/index.html` emitted; `_pages/index.html`/`src/bee-atlas.ts` untouched |
| ROUTE-02 | 147-01-PLAN.md | SW at `/app/sw.js` with `scope: '/app'`, pass-through fetch handler, no SW on `/`, DevTools confirmation pending | SATISFIED (automated) / PENDING (manual SC-2, SC-4) | All structural and code-level evidence verified; DevTools step is a human-UAT item |
| ROUTE-03 | 147-02-PLAN.md | `/app/sw.js` and `/app/manifest.webmanifest` served with `Cache-Control: no-cache` via per-path CloudFront behaviors | SATISFIED (CDK synth) / PENDING (post-deploy curl) | CDK assertion test passes; behaviors use zero-TTL policy + no-cache headers; live `curl -I` is a human-UAT item |

### Anti-Patterns Found

No anti-patterns found in the phase-modified files.

- No `TBD`, `FIXME`, or `XXX` markers in any modified file.
- No stub implementations (`return null`, `return {}`, etc.).
- `src/sw-registration.ts`: `registerServiceWorker()` is intentionally not exported (IN-02 from REVIEW was already correct in the submitted code; the REVIEW incorrectly described it as exported — the function in the final code has no `export` keyword).
- `infra/test/beeatlas-stack.test.ts`: `import * as assert from 'node:assert/strict'` is present and IS used at lines 42 and 66 (`assert.equal(...)`); IN-01 in the REVIEW was a false positive.

### Human Verification Required

All automated checks pass. The following two items require human testing because they depend on a running browser with DevTools or a live cloud deployment. Both are documented in `147-HUMAN-UAT.md` as PENDING.

#### 1. DevTools SW Topology (D-11, ROUTE-02 SC-2 + SC-4)

**Test:** Run `npm run build && npm run preview`. Visit `http://localhost:<port>/app/`. Open DevTools → Application → Service Workers.
**Expected:**
- A service worker is registered and activated for scope `/app/` (source `/app/sw.js`) when viewing `/app/`
- DevTools → Application → Service Workers shows "No service workers detected" when visiting `/` (the main route)
- DevTools → Network: a `/data/*` request (e.g. `/data/occurrences.db`) shows ServiceWorker as the initiator/served-by
**Why human:** Service workers only register over https or localhost; the registration, scope, and fetch-intercept state are only observable in a live browser DevTools session.

#### 2. Post-Deploy CloudFront Header (D-10, ROUTE-03 SC-3)

**Test:** After `cd infra && npm run deploy`, run `curl -I https://<distribution-domain>/app/sw.js`.
**Expected:** Response includes `Cache-Control: no-cache, no-store, must-revalidate`. `/app/manifest.webmanifest` may return 403/404 with the same header (expected pre-Phase-151 state per D-08).
**Why human:** Requires a live CDK deploy to the real CloudFront distribution. The CDK template-assertion test verifies synth-time structure; real header behavior requires a deployed distribution.

### Gaps Summary

No automated gaps. All 10 must-have truths verified against the codebase. The `human_needed` status is driven by two by-design manual items (DevTools local preview + post-deploy curl) that were always expected to be manual — they are documented in `147-HUMAN-UAT.md` as PENDING and are not blockers on the structural correctness of the phase.

---

_Verified: 2026-06-11T01:09:46Z_
_Verifier: Claude (gsd-verifier)_
