---
phase: 150-cache-health-freshness-ux
plan: "04"
subsystem: cache-health-ux
tags:
  - bee-atlas
  - bee-header
  - lit
  - state-owner
  - presenter
  - popover
  - update-banner
  - tdd
  - phase-150
dependency_graph:
  requires:
    - 150-02  # sw-update-available CustomEvent contract
    - 150-03  # cache-prime-progress, cache-state-changed events + loadFreshnessLabel()
  provides:
    - ready-pill (3 states: priming / finish-on-wifi / ready)
    - freshness-caption under BeeAtlas title
    - cache-popover with freshness + storage + update rows
    - update-banner (non-modal, session-only dismiss)
    - lazy storage estimate via navigator.storage.estimate()
  affects:
    - Final user-facing cache health UX (end-of-phase artifact for Phase 150)
tech_stack:
  added: []
  patterns:
    - Lit @state ownership pattern (bee-atlas holds all cache reactive state)
    - @property relay pattern (bee-header is pure presenter)
    - Arrow-property handlers for automatic this-binding
    - document.addEventListener click-outside + ESC dismiss for popover
    - navigator.storage.estimate() lazy on popover open (D-18/D-19)
    - loadFreshnessLabel() with online + focus cadence (PATTERNS.md Pitfall 6)
key_files:
  created:
    - src/tests/cache-state.test.ts
  modified:
    - src/bee-atlas.ts
    - src/bee-header.ts
decisions:
  - "Task 4 (cache-update-acted wiring) was implemented inline with Task 2 — no separate commit needed since both bee-atlas.ts wires were added together"
  - "_readStorageEstimate implemented as private method on bee-atlas per plan discretion"
  - "data-species.test.ts and build-output.test.ts failures are pre-existing worktree issues (species.json gitignored) — documented in 150-03 SUMMARY; manually copied data files for build verification"
  - "22 unhandled rejection errors from window.location.startsWith in happy-dom are pre-existing (original bee-header.ts renders nav links against window.location) — all 22 tests pass despite these"
metrics:
  duration: "45m"
  completed: "2026-06-18"
  tasks_completed: 6
  tasks_total: 6
  files_created: 1
  files_modified: 2
---

# Phase 150 Plan 04: Cache Health UX — State Owner + Presenter + Tests Summary

Plans 01/02/03/04 collectively shipped CACHE-01..04 + the OFF-03 prompt-to-reload UX. This is the end-of-phase artifact for Phase 150. VALIDATION.md §Manual-Only Verifications still needs to be exercised on a real device before `/gsd-verify-work` runs.

**One-liner:** Cache state surfaces wired end-to-end — ready-pill (3 states), freshness caption, storage-estimate popover, and session-dismissable SW-update banner, with lazy storage probe and 22 new green tests.

## What Was Built

### src/bee-atlas.ts — 5 new @state fields, 7 handlers, 5 listeners

**New @state fields** (immediately after existing `_offline`):
- `_cacheState: { ready: boolean; cached: string[]; missing: string[] } | null = null`
- `_primeProgress: { received: number; total: number; assetInFlight: string | null } | null = null`
- `_updateAvailable: boolean = false`
- `_freshnessLabel: string | null = null`
- `_storageEstimate: { usageMB: string; quotaMB: string | null } | null = null`

**Event listeners** (added in `firstUpdated`, removed in `disconnectedCallback`):
- Window: `cache-prime-progress`, `cache-state-changed`, `sw-update-available`, `focus`
- Element: `cache-popover-toggle`, `cache-update-acted`

**Arrow-property handlers** (7):
- `_onPrimeProgress` — sets `_primeProgress` from event detail
- `_onCacheStateChanged` — sets `_cacheState` from event detail
- `_onSwUpdateAvailable` — sets `_updateAvailable = true`
- `_onPopoverToggle` — calls `_readStorageEstimate()` lazily when open=true
- `_onBannerTap` — calls `window.__wb?.messageSkipWaiting()` + `window.location.reload()`
- `_onBannerDismiss` — sets `_updateAvailable = false` (session-only per D-15)
- `_refreshFreshness` — calls `loadFreshnessLabel()`, updates `_freshnessLabel`

**`_readStorageEstimate()` private method** (per RESEARCH Pattern 7):
- Feature-detects `navigator.storage?.estimate`; returns null if absent (D-19)
- `usageMB = (usage / 1_048_576).toFixed(1)`
- `quotaMB` gated on `quota > 0 && quota < 200 * 1_048_576` (D-18 `<200 MB` rule)

**`<bee-header>` relay extended** with all 5 new states:
```html
<bee-header
  .offline=... .cacheState=... .primeProgress=... .freshnessLabel=...
  .storageEstimate=... .updateAvailable=...
></bee-header>
```

**Update banner** (bottom of render, outside error conditional):
```
A data update is available — tap to reload   [✕]
```
- Body: `A data update is available — tap to reload` (U+2014 em-dash)
- Dismiss: `✕` (U+2715), aria-label "Dismiss update for this session"
- CSS: `position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px));` with left-accent `var(--accent)` stripe

**Freshness cadence**: initial fetch on `firstUpdated`, re-fetches on `online` and `focus` events per PATTERNS.md Pitfall 6.

### src/bee-header.ts — 5 new @property, 1 @state, ready-pill + popover + freshness caption

**New @property declarations** (all `attribute: false`):
- `cacheState`, `primeProgress`, `freshnessLabel`, `storageEstimate`, `updateAvailable`

**Internal @state**: `_popoverOpen = false`

**CSS additions**:
- `.offline-pill, .ready-pill { ... }` — shared base (font, background, border, border-radius, padding, color)
- `.ready-pill { display: inline-flex; min-height: 44px; min-width: 9em; position: relative; cursor: pointer; }` — 44px tap target
- `.ready-pill__progress-fill { position: absolute; bottom: 0; height: 2px; background: rgba(255,255,255,0.45); }` — inline determinate bar
- `.title-group { flex-direction: column; align-items: flex-start; }` — vertical stack for title + caption
- `.freshness-caption { 0.75rem; rgba(255,255,255,0.65); }` — on dark header
- `.cache-popover { position: absolute; top: calc(100% + 4px); z-index: 50; }` — anchored under right-group
- `@media (prefers-reduced-motion: reduce)` block disabling transitions

**Ready-pill three states** (exact locked strings):
| State | Text | Visual |
|-------|------|--------|
| A — Priming online | `Caching… N%` (U+2026 ellipsis) | Inline fill bar at `received/total*100%`, clamped [0,99] |
| B — Offline mid-prime | `Finish on WiFi` | No progress bar |
| C — Ready | `✓ Offline-ready` | `✓` in accent color |
| Hidden | — | `cacheState === null` |

**Freshness caption**: `<span class="freshness-caption">` under `<h1>BeeAtlas` inside `.title-group`; hidden when `freshnessLabel === null` (no placeholder).

**Popover row visibility matrix**:
| Row | Visible When |
|-----|-------------|
| Row 1 — Status | Always (mirrors pill text in MB form for priming states) |
| Row 2 — Freshness | `freshnessLabel !== null` |
| Row 3 — Storage | `storageEstimate !== null` (feature-detected) |
| Row 3 sub-line — Quota | `quotaMB !== null` (quota < 200 MB per D-18) |
| Row 4 — Update affordance | `updateAvailable === true` |

**Popover locked strings**:
- Storage row: `${usageMB} MB stored on this device`
- Quota sub-line: `of ${quotaMB} MB available`
- Update affordance: `App update available — tap to reload` (U+2014 em-dash)

**`cache-update-acted` event flow**: Popover Row 4 button calls `_onUpdateActed` which dispatches `cache-update-acted` (composed + bubbles). `<bee-atlas>` listens for `cache-update-acted` and routes to `_onBannerTap` — reusing the same handler as the bottom banner. Passive duplicate of the banner tap per D-17.

**Click-outside and ESC dismiss**: `document.addEventListener('click', _onDocumentClick)` registered in `connectedCallback`; checks `composedPath()` to exclude the popover itself. `document.addEventListener('keydown', _onDocumentKeydown)` for ESC. Both removed in `disconnectedCallback`.

### src/tests/cache-state.test.ts (NEW)

22 tests across two describe blocks:

**`bee-header cache surfaces` (11 tests):**
- ready-pill states A (priming → "Caching… N%"), B (offline → "Finish on WiFi"), C (ready → "✓ Offline-ready")
- ready-pill hidden when cacheState null
- freshness-caption renders/hides based on freshnessLabel
- Popover opens on pill click + dispatches `cache-popover-toggle` (composed + bubbles)
- Popover closes on ✕ + dispatches event with open=false
- Storage row hidden when storageEstimate null
- Storage row shows usage + optional quota sub-line
- Update affordance hidden/visible based on updateAvailable

**`bee-atlas update banner + popover lazy storage estimate` (11 tests):**
- No banner when _updateAvailable=false
- Banner mounts on `sw-update-available` window event
- Tap banner body calls `window.__wb.messageSkipWaiting()`
- Tap ✕ dismisses (session-only)
- Lazy storage estimate via `cache-popover-toggle` detail.open=true
- Undefined `navigator.storage.estimate` → storageEstimate stays null (D-19)
- bee-atlas relays all 5 states to bee-header
- `cache-prime-progress` window event updates _primeProgress
- `cache-state-changed` window event updates _cacheState

## Locked UI-SPEC Copy Strings Confirmed

| String | Character | Used In |
|--------|-----------|---------|
| `Caching…` | U+2026 single ellipsis | ready-pill state A |
| `Finish on WiFi` | literal | ready-pill state B |
| `✓ Offline-ready` | U+2713 checkmark | ready-pill state C |
| `A data update is available — tap to reload` | U+2014 em-dash | update-banner body |
| `App update available — tap to reload` | U+2014 em-dash | popover row 4 |
| `✕` | U+2715 | dismiss buttons |

## Phase 150 Must-Haves Audit (7 Truths)

1. **PASS** — After full prime, `<bee-header>` renders `✓ Offline-ready` when `_cacheState.ready === true`. (cache-state.test.ts test "ready-pill state C" GREEN)

2. **PASS** — During active prime, ready-pill shows determinate progress bar driven by accumulated bytes, NOT a spinner. `_renderReadyPillContent` state A: `width: ${pct}%` inline fill bar. (cache-state.test.ts test "ready-pill state A" GREEN)

3. **PASS** — After prime, popover shows `X.X MB stored on this device` via `navigator.storage.estimate()`. Task 2 `_readStorageEstimate()` + Task 3 popover row 3. (cache-state.test.ts "popover storage row visible" GREEN)

4. **PASS** — Freshness caption always visible when data available, reflecting `manifest.generated_at`, formatted relative if <7 days / absolute if older. Task 5 `_refreshFreshness` wired to `firstUpdated` + `online` + `focus`. (cache-state.test.ts "freshness-caption renders" GREEN)

5. **PASS** — New SW → non-modal banner at bottom with text matching UI-SPEC; tap → `wb.messageSkipWaiting()` + reload; ✕ dismisses for session. (cache-state.test.ts "renders update banner", "tap banner body calls messageSkipWaiting", "tap ✕ dismisses" GREEN)

6. **PASS** — Compiled `_site/app/sw.js` contains gated `SKIP_WAITING` handler + NetworkFirst manifest.json route; no naked `self.skipWaiting()`. (build-output.test.ts GREEN, build verified)

7. **PASS** — `npm test -- --run` passes (729 tests, 30 files); `npm run build` succeeds; `build-output.test.ts` passes.

## Deviations from Plan

### Implementation Decisions

**1. [Rule 3 - Blocked Task 4 already resolved] Task 4 wired in Task 2**
- **Found during:** Task 2 planning
- **Decision:** Both `cache-popover-toggle` and `cache-update-acted` element-level listeners were added together in Task 2's firstUpdated/disconnectedCallback block. Task 4 had nothing to add since Task 2 anticipated the requirement.
- **Files modified:** `src/bee-atlas.ts`
- **Commit:** 02427c08

### Pre-existing Issues (not deviations)

**data-species.test.ts and build-output.test.ts in worktree**: Identical to the pre-existing issue documented in 150-03 SUMMARY — `public/data/species.json` and `higher_taxa.json`/`seasonality.json` are gitignored data artifacts not present in the worktree checkout. For Task 6 build verification, these were manually copied from the main repo. The files are gitignored and will not appear in any commit.

**22 unhandled rejection errors in test run**: `TypeError: Cannot read properties of undefined (reading 'startsWith')` from `window.location.pathname.startsWith()` in happy-dom. This is pre-existing from the original `bee-header.ts` nav link render code (existed before Plan 04). All 22 tests pass despite these errors.

## Known Stubs

None. All cache state flows wire to real browser APIs (`caches.match`, `navigator.storage.estimate`, `window.__wb.messageSkipWaiting`).

## Threat Flags

T-150-01, T-150-02, T-150-05, T-150-06 all addressed as documented in the plan's threat model — see 150-04-PLAN.md §threat_model for full register. No new surfaces beyond the plan's scope.

## Self-Check

Checking created files:
- [x] `src/tests/cache-state.test.ts` — FOUND
- [x] `src/bee-atlas.ts` — MODIFIED (156 + 7 lines added across two commits)
- [x] `src/bee-header.ts` — MODIFIED (298 lines rewritten to 415)

Checking commits:
- 8b6f129f — test(150-04): pin cache-state pill / popover / banner contracts (RED)
- 02427c08 — feat(150-04): add cache @state + listeners + banner to bee-atlas (GREEN bee-atlas tests)
- 33fb39ef — feat(150-04): add ready-pill + freshness-caption + popover to bee-header (GREEN all cache-state tests)
- 60919862 — feat(150-04): wire loadFreshnessLabel to _refreshFreshness + online/focus cadence

## Self-Check: PASSED
