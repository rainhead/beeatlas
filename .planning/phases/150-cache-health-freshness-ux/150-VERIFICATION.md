---
phase: 150-cache-health-freshness-ux
verified: 2026-06-18T17:50:00Z
status: needs_human
score: 5/5 success criteria verified (automated); 4 manual UAT items pending real-device/network testing
overrides_applied: 0
human_verification:
  - test: Ready-pill transitions render correctly under real network
    expected: pill goes "Caching… N%" → "✓ Offline-ready"; mid-prime offline flip → "Finish on WiFi"
    why_human: visual / motion check; depends on actual asset bytes + real CloudFront content-length
  - test: iOS standalone PWA SW-update banner appears + reloads cleanly
    expected: install /app to iOS home screen, deploy new SW, reopen → banner appears, tap reloads to new version
    why_human: iOS standalone-mode SW behavior differs from Safari tab; not simulable in vitest/happy-dom
  - test: Storage estimate matches DevTools Application → Storage value
    expected: after full prime, popover "X.X MB stored" matches DevTools Application → Storage usage to within rounding
    why_human: OS-reported quota estimate is platform-specific; visual sanity check on a real browser
  - test: Freshness label updates only when DB content-hash actually changes (not on refresh)
    expected: after a new nightly pipeline run the label moves; refresh without new pipeline → label unchanged
    why_human: requires a real nightly pipeline run shipping a new content-hashed DB URL
---

# Phase 150: Cache Health & Freshness UX — Verification Report

**Phase Goal:** The user can see whether the app is ready for offline use, how much space it occupies, how fresh the cached data is, and receives a prompt (not an automatic reload) when a SW update is available.
**Verified:** 2026-06-18T17:50:00Z
**Status:** needs_human (5/5 success criteria pass automated verification; 4 manual UAT items pending)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC-1 | "Ready for offline" indicator: incomplete (with "finish on WiFi" state) while caching, ready only once all 4 assets cached | VERIFIED | `src/bee-header.ts:290-312` renders 3-state ready-pill from `cacheState` @property; ready computed by `caches.match()` probe in `src/prime-orchestrator.ts:66-81` (NOT counter). UAT verifies real-network rendering. |
| SC-2 | Determinate progress during ~23 MB prime, driven by per-asset progress | VERIFIED | `src/prime-orchestrator.ts:92-135` uses `response.body.getReader()` and dispatches `cache-prime-progress` CustomEvent with `{received, total, assetInFlight}` in BYTES; 4-asset denominator; `Content-Length`-driven with localStorage persistence; throttled at 100KB. Inline `.ready-pill__progress-fill` rendered in `src/bee-header.ts:305-308`. |
| SC-3 | Device storage size shown via `navigator.storage.estimate()` | VERIFIED | `src/bee-atlas.ts:837-850` calls `navigator.storage.estimate()` lazily on `cache-popover-toggle` open event (`_onPopoverToggle:818`); feature-detect guard returns null when estimate undefined (D-19). Renders in `src/bee-header.ts:350-357` as "X.X MB stored on this device" with conditional "of Y MB available" sub-line (only when quota < 200 MB). |
| SC-4 | "Data as of <date>" label always visible; reflects `manifest.generated_at`; updates only when newer DB fetched | VERIFIED | `src/manifest.ts:32-94` exposes `parseGeneratedAt` (returns null for "local" sentinel + unparseable input), `formatFreshness` (relative <7 days, absolute ≥7 days, drops day at ≥1 year), `loadFreshnessLabel`. `src/sw.ts:87-94` adds NetworkFirst route for `/data/manifest.json` with `networkTimeoutSeconds: 3`. `src/bee-atlas.ts:833-835` refreshes label on online + focus events. `src/bee-header.ts:372` renders `.freshness-caption` only when label non-null (D-11 first-cold hide). |
| SC-5 | Non-blocking SW-update prompt; dismiss leaves old running; tap reloads to new | VERIFIED | `src/sw-registration.ts:9-44` migrated to workbox-window `Workbox`; `addEventListener('waiting', ...)` dispatches `sw-update-available` CustomEvent (bubbles + composed); `window.__wb` stashed. `src/bee-atlas.ts:175-234` renders fixed-bottom non-modal `.update-banner` from `_updateAvailable @state`; `_onBannerTap:825` calls `window.__wb.messageSkipWaiting()` + `reload()`; `_onBannerDismiss:831` clears state (per-session, in-memory only). `src/sw.ts:99-103` has gated `SKIP_WAITING` message listener; NO top-level naked `self.skipWaiting()`. |

**Score:** 5/5 success criteria verified by automated checks.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sw.ts` | NetworkFirst route for /data/manifest.json + gated SKIP_WAITING listener | VERIFIED | NetworkFirst on lines 87-94 with `networkTimeoutSeconds: 3`, `cacheName: 'data-manifest'`, CacheableResponsePlugin status 200. Gated `SKIP_WAITING` message listener at lines 99-103. NO top-level `self.skipWaiting()`. 149's DB + GeoJSON CacheFirst routes intact (lines 54-80). |
| `src/sw-registration.ts` | workbox-window Workbox wired | VERIFIED | `import { Workbox } from 'workbox-window'` (line 9); `new Workbox('/app/sw.js', { scope: '/app/' })` (line 20); `addEventListener('waiting', ...)` dispatches `sw-update-available` CustomEvent with `bubbles:true, composed:true` (lines 26-31); `(window as ...).__wb = wb` (line 35). 149's `requestPersistentStorage` block preserved verbatim (lines 46-71). |
| `src/manifest.ts` | parseGeneratedAt, formatFreshness, loadFreshnessLabel | VERIFIED | All three new exported helpers present; loadManifest promoted to exported; format matches UI-SPEC Copywriting Contract (Today / Yesterday / "N days ago" / "Data as of Mon DD, YYYY" / "Data as of Mon YYYY" / null). |
| `src/prime-orchestrator.ts` | byte-progress fetch loop + cache-as-truth probe + 4-asset denominator + localStorage persistence + online re-prime | VERIFIED | All requirements present; `computeReadyState` probes all 4 asset URLs; `primeAsset` uses `Response.body.getReader()`; fallback constants for absent Content-Length; `localStorage['beeatlas-prime-total-bytes']` persisted; `window.addEventListener('online', ...)` re-triggers `primeAll()`. |
| `src/app-entry.ts` | probeAndReprime removed; side-effect imports only | VERIFIED | File is exactly 3 imports: `./bee-atlas.ts`, `./sw-registration.ts`, `./prime-orchestrator.ts`. No `probeAndReprime` or `online` listener (now in prime-orchestrator). |
| `src/bee-atlas.ts` | 5 new @state + banner render + listeners | VERIFIED | `_cacheState`, `_primeProgress`, `_updateAvailable`, `_freshnessLabel`, `_storageEstimate` all declared as `@state` (lines 74-78). Listeners wired on `window` for `cache-prime-progress`, `cache-state-changed`, `sw-update-available`, `focus`; listeners on element for `cache-popover-toggle`, `cache-update-acted` (lines 440-447). `.update-banner` rendered fixed-bottom (lines 315-328) with both body-tap and ✕-dismiss buttons. |
| `src/bee-header.ts` | ready-pill (3 states) + freshness-caption + popover | VERIFIED | 5 new `@property` fields (lines 6-11); `_popoverOpen` @state (line 13). Ready-pill renders 3 states correctly (lines 290-312). Freshness-caption always rendered when non-null (line 372). Popover surface (lines 314-365) shows status, freshness, storage estimate (with conditional quota sub-line), and passive update affordance. Emits `cache-popover-toggle` and `cache-update-acted` composed/bubbles CustomEvents. |
| `src/tests/cache-state.test.ts` | New | VERIFIED | 16 tests pin <bee-header> ready-pill 3-state contract, popover open/close + dispatched events, storage row visibility, update affordance visibility, and <bee-atlas> banner render + tap + dismiss + lazy storage estimate. |
| `src/tests/prime-orchestrator.test.ts` | New | VERIFIED | 9 tests pin computeReadyState (4 hits + 2/2 split), monotone byte progress, content-length fallback, localStorage persist, skip-cached resumability, offline gate, online re-prime, final cache-state-changed event. |
| `src/tests/freshness.test.ts` | New | VERIFIED | 9 tests pin formatFreshness boundaries (Today/Yesterday/3 days/6 days/7 days/1 year) + parseGeneratedAt ("local" + valid ISO) + unparseable warn. |
| `src/tests/sw-update.test.ts` | New | VERIFIED | 6 tests pin Workbox constructor args, register() call, waiting → CustomEvent dispatch, window.__wb stash, requestPersistentStorage preservation, no-serviceWorker skip. |
| `src/tests/build-output.test.ts` | Extended with NetworkFirst manifest.json route + gated SKIP_WAITING listener + workbox-window dep | VERIFIED | Old "does not contain skipWaiting" assertion replaced with gated form (line 366: asserts `skipWaiting` present AND `SKIP_WAITING` present AND no `clients.claim`). New assertions: NetworkFirst manifest.json route (line 382), workbox-window runtime dep (line 389). |
| `package.json` | workbox-window in dependencies | VERIFIED | Line 56 — in `dependencies` block (47-57). Confirmed by build-output test "workbox-window is a runtime dependency (D-13)". |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| prime-orchestrator | bee-atlas | window `cache-prime-progress` CustomEvent | WIRED | Dispatched in `prime-orchestrator.ts:179-184, 204-213`; consumed in `bee-atlas.ts:440, 798-805`. |
| prime-orchestrator | bee-atlas | window `cache-state-changed` CustomEvent | WIRED | Dispatched in `prime-orchestrator.ts:221-225`; consumed in `bee-atlas.ts:441, 807-814`. |
| sw-registration | bee-atlas | window `sw-update-available` CustomEvent | WIRED | Dispatched in `sw-registration.ts:26-31` from Workbox `waiting` event; consumed in `bee-atlas.ts:442, 816`. |
| bee-header | bee-atlas | `cache-popover-toggle` CustomEvent (bubbles+composed) | WIRED | Dispatched in `bee-header.ts:240-244, 250-254, 263-269, 275-281`; consumed in `bee-atlas.ts:443, 818-823` → triggers lazy storage estimate read on `detail.open===true`. |
| bee-header | bee-atlas | `cache-update-acted` CustomEvent | WIRED | Dispatched in `bee-header.ts:283-288` from popover update-affordance click; consumed in `bee-atlas.ts:444` → reuses `_onBannerTap`. |
| bee-atlas | bee-header | 5 new `@property` bindings | WIRED | `bee-atlas.ts:239-246` passes `.cacheState`, `.primeProgress`, `.freshnessLabel`, `.storageEstimate`, `.updateAvailable` to `<bee-header>`. |
| bee-atlas | window.__wb | `messageSkipWaiting()` call | WIRED | `bee-atlas.ts:825-829` reads `(window as ...).__wb?.messageSkipWaiting()` on banner tap; stashed by `sw-registration.ts:35`. |
| sw.ts message handler | self.skipWaiting | gated dispatch | WIRED | `sw.ts:99-103` calls `self.skipWaiting()` ONLY when `event.data?.type === 'SKIP_WAITING'`. No naked top-level call. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `<bee-header>` ready-pill | `cacheState` @property | `<bee-atlas>._cacheState` ← `cache-state-changed` event ← `prime-orchestrator.computeReadyState()` real `caches.match()` calls | YES — real Cache Storage probe of 4 manifest-resolved URLs | FLOWING |
| `<bee-header>` progress fill | `primeProgress` @property | `<bee-atlas>._primeProgress` ← `cache-prime-progress` event ← `prime-orchestrator.primeAsset()` real `Response.body.getReader()` byte counts | YES — real fetch byte stream | FLOWING |
| `<bee-header>` freshness-caption | `freshnessLabel` @property | `<bee-atlas>._freshnessLabel` ← `loadFreshnessLabel()` ← `loadManifest()` real `fetch('/data/manifest.json')` → `manifest.generated_at` | YES — real manifest network/cache fetch via NetworkFirst route | FLOWING |
| `<bee-header>` storage row | `storageEstimate` @property | `<bee-atlas>._storageEstimate` ← `_readStorageEstimate()` ← real `navigator.storage.estimate()` call | YES — real platform Storage API; feature-detected (D-19) | FLOWING |
| `<bee-atlas>` update-banner | `_updateAvailable` @state | window `sw-update-available` event ← workbox-window `waiting` event ← real SW lifecycle | YES — real SW `waiting` event | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vitest suite passes | `VITEST_SKIP_BUILD=1 npm test -- --run` | 688 passed / 41 skipped (729) | PASS |
| Build-output gate (includes full build) | `npm test -- --run src/tests/build-output.test.ts` | 41 passed | PASS |
| Production build succeeds | `npm run build` | precache 11 entries / 1979.84 KiB / `_site/app/sw.js` generated | PASS |
| `_site/app/sw.js` contains NetworkFirst manifest.json route | `grep -E "data-manifest\|networkTimeoutSeconds\|manifest\.json" _site/app/sw.js` | All 3 strings present | PASS |
| `_site/app/sw.js` contains gated SKIP_WAITING listener | `grep -oE 'SKIP_WAITING.{0,80}' _site/app/sw.js` | `SKIP_WAITING\`&&self.skipWaiting()});` (single gated call) | PASS |
| `_site/app/sw.js` has NO top-level naked skipWaiting | `grep -oE '\.skipWaiting\(\)' _site/app/sw.js \| wc -l` | exactly 1 (the gated call) | PASS |
| `workbox-window` is a runtime dependency | inspect `package.json` line 56 | in `dependencies` block | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 150 declares no `scripts/*/tests/probe-*.sh` probes | N/A | N/A | SKIPPED — no conventional probes for this phase; behavioral coverage is via vitest + build-output gate |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CACHE-01 | 150-04 | Ready-for-offline indicator | SATISFIED | bee-header ready-pill (3 states) + computeReadyState() cache probe |
| CACHE-02 | 150-01, 150-03, 150-04 | Determinate progress during prime | SATISFIED | prime-orchestrator byte-progress fetch loop; ready-pill inline fill; build-output gate confirms SW supports the strategy |
| CACHE-03 | 150-04 | Device storage size via navigator.storage.estimate() | SATISFIED | bee-atlas `_readStorageEstimate()` + lazy popover trigger + D-19 feature-detect |
| CACHE-04 | 150-01, 150-03, 150-04 | "Data as of <date>" label tracks manifest.generated_at | SATISFIED | NetworkFirst manifest.json route + parseGeneratedAt/formatFreshness/loadFreshnessLabel + freshness-caption + online/focus refresh |
| OFF-03 (sub) | 150-01, 150-02, 150-04 | Non-blocking SW-update prompt | SATISFIED | workbox-window migration + bee-atlas update-banner + gated SKIP_WAITING listener |

### Architectural Invariants

| Invariant | Status | Evidence |
|-----------|--------|----------|
| No new top-level `@customElement` | VERIFIED | `grep -E "@customElement" src/*.ts` returns exactly 6 existing components: bee-atlas, bee-header, bee-map, bee-occurrence-detail, bee-table, bee-pane. No new components added. |
| `<bee-atlas>` is sole owner of `_cacheState`, `_primeProgress`, `_storageEstimate`, `_updateAvailable`, `_popoverOpen` | VERIFIED (with note) | `_cacheState`, `_primeProgress`, `_storageEstimate`, `_updateAvailable`, `_freshnessLabel` declared as `@state` on bee-atlas. `_popoverOpen` is a `@state` on bee-header (local UI state — appropriate for transient open/closed visual state; bee-atlas does not need to own it). |
| `<bee-header>` is pure presenter | VERIFIED | 5 `@property` fields receive state from parent; emits `cache-popover-toggle` and `cache-update-acted` via `composed:true, bubbles:true` CustomEvents. No business state stored beyond local `_popoverOpen` UI flag. |
| Filter race-guard untouched | VERIFIED | `_filterGuard = makeStaleGuard(...)` at bee-atlas.ts:93; `_runFilterQuery` (line 465) uses `this._filterGuard(() => queryVisibleGeoJSON(...))`. No changes to the guard mechanism. |
| Only manifest.json NetworkFirst route added to SW; 149's CacheFirst routes intact | VERIFIED | `src/sw.ts`: DB CacheFirst (54-63) + GeoJSON CacheFirst (72-80) + new manifest NetworkFirst (87-94) + SKIP_WAITING listener (99-103). No other changes. |
| `workbox-window` in `dependencies` | VERIFIED | package.json line 56. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | Zero TODO/FIXME/TBD/XXX/HACK/PLACEHOLDER in any of: bee-atlas.ts, bee-header.ts, sw.ts, sw-registration.ts, manifest.ts, prime-orchestrator.ts, app-entry.ts |

### Human Verification Required

These 4 manual UAT items are deferred-by-planner per VALIDATION.md §Manual-Only Verifications. ROADMAP Phase 150 carries `UI hint: yes`, so verification cannot fully auto-pass.

1. **Ready-pill transitions render correctly under real network**
   - Test: On a clean profile, open `/app/index.html` over WiFi; observe pill goes "Caching… N%" → "✓ Offline-ready"; toggle DevTools offline mid-prime → pill flips to "Finish on WiFi"
   - Expected: All three pill states render with correct copy and the inline progress fill animates
   - Why human: Visual / motion check; depends on actual asset bytes + real CloudFront `content-length` header

2. **iOS standalone PWA SW-update banner appears + reloads cleanly**
   - Test: Install `/app` to iOS home screen; deploy a new SW version; reopen the installed app
   - Expected: Banner appears at bottom; tapping reloads to new version; ✕ dismisses for this session
   - Why human: iOS standalone-mode SW behavior differs from Safari tab; not simulable in vitest/happy-dom

3. **Storage estimate matches DevTools Application → Storage value**
   - Test: After full prime, open ready-pill popover, compare `"X MB stored on this device"` to DevTools Application → Storage usage
   - Expected: Values match within rounding (1 decimal MB)
   - Why human: OS-reported quota estimate is platform-specific; sanity check on a real browser

4. **Freshness label updates only when DB content-hash actually changes**
   - Test: After a nightly pipeline run produces a new `occurrences_<hash>.db`, open `/app` → verify the freshness label moves; refresh once without a new pipeline run → verify label does NOT change
   - Expected: Label tracks `manifest.generated_at` end-to-end; refresh-only does not advance it
   - Why human: Requires a real nightly pipeline run shipping a new content-hashed DB URL

### Gaps Summary

No automated gaps. All 5 ROADMAP success criteria are observably true in the codebase via the artifact + wiring chain documented above. All Wave 0 contract tests pass (688 / 729 — the 41 skipped are pre-existing skips unrelated to Phase 150). The production build emits a `_site/app/sw.js` that satisfies the build-output gates (NetworkFirst route for manifest.json, gated SKIP_WAITING listener, no top-level naked `skipWaiting`).

Status = `needs_human` solely because Phase 150 carries `UI hint: yes` in ROADMAP — the visual / motion / real-device behaviors enumerated above cannot be confirmed without a human running the four UAT scenarios. The mechanics are wired; the user-facing experience needs eyes.

---

*Verified: 2026-06-18T17:50:00Z*
*Verifier: Claude (gsd-verifier)*
