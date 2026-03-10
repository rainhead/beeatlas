---
phase: 07-url-sharing
plan: "02"
subsystem: frontend
tags: [url-sync, human-verify, nav-01]
dependency_graph:
  requires: [07-01]
  provides: [verified-url-sharing-partial]
  affects: [gap-closure]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
key-decisions:
  - "NAV-01 partially met: scenarios A-E pass; F (back button) and G (o= param) need gap-closure work"
  - "Back button failure: popstate handler not restoring map view — _isRestoringFromHistory flag or pushState timing suspect"
  - "o= param failure: parameter stripped on load and cluster click only encodes one occurrence from a multi-occurrence cluster"
requirements-completed: []
metrics:
  duration: "~1 day (human verification window)"
  completed: "2026-03-10"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 0
---

# Phase 07 Plan 02: Human Verification of URL Sharing Summary

**Browser verification confirmed core URL sharing works (scenarios A-E), but back-button navigation (F) and selected-occurrence URL restore (G) both fail and require gap-closure.**

## Performance

- **Duration:** ~1 day (human verification window)
- **Started:** 2026-03-10T02:37:11Z (checkpoint reached)
- **Completed:** 2026-03-10T02:43:09Z (results recorded)
- **Tasks:** 2 completed
- **Files modified:** 0 (verification-only plan)

## Accomplishments

- Frontend built and served successfully via `npm run dev`
- Human verified all 7 URL sharing scenarios in a real browser
- Scenarios A through E confirmed working in the browser
- Gaps F and G identified with precise failure descriptions for gap-closure planning

## Verification Results

| Scenario | Description | Result |
|----------|-------------|--------|
| A | Default load — Washington State view, URL shows x/y/z params | PASS |
| B | Pan/zoom updates URL bar in real time | PASS |
| C | Copy/paste URL round-trip restores exact map position | PASS |
| D | Taxon filter encoded in URL, restored on new tab load | PASS |
| E | Year filter (yr0) encoded and restored | PASS |
| F | Browser back button navigates between settled views | **FAIL** |
| G | Selected occurrence (o= param) opens detail panel on restore | **FAIL** |

### Scenario F — Back button failure

The back button does nothing, even when backed up to the beginning of browser history. The `popstate` event handler in `bee-map.ts` is likely not firing or not restoring the map view. The `_isRestoringFromHistory` flag and/or `pushState` call timing should be investigated.

### Scenario G — Selected occurrence URL failure

Two sub-failures observed:

1. **Load**: Pasting a URL containing `o=ecdysis:...` causes that parameter to be stripped from the query string on load — the occurrence is not restored and the param disappears from the URL bar.

2. **Encode**: Clicking a cluster encodes only a single occurrence ID in the URL, even when the cluster contains multiple occurrences. When that URL is opened in a new tab, only that one occurrence appears in the sidebar (the rest of the cluster is hidden).

## Task Commits

1. **Task 1: Build and serve the frontend** - `d3928e7` (docs — plan start commit)
2. **Task 2: Human verification checkpoint** — no code commit (verification-only task)

## Files Created/Modified

None — this was a pure verification plan with no code changes.

## Decisions Made

- NAV-01 is **not yet complete**. Scenarios A-E confirm the core URL sync architecture works. Scenarios F and G require targeted fixes before NAV-01 can be marked complete.
- Gap-closure work needed for:
  - Fix `popstate` handler so back button restores map view
  - Fix `o=` param parsing on load so occurrence detail panel opens
  - Fix cluster click to encode/restore multi-occurrence clusters correctly in the URL

## Deviations from Plan

None — plan executed exactly as written. No code was auto-fixed; this was a verification-only plan and failures are documented for gap-closure.

## Issues Encountered

Two gaps discovered during human verification:

**Gap F — Back button non-functional:** `popstate` event not restoring map view despite `pushState` calls during pan/zoom. The `_isRestoringFromHistory` guard or `pushState` invocation may need adjustment.

**Gap G — `o=` param not handled on load or encode:** The occurrence param is stripped on page load (`parseUrlParams` likely ignores `o`), and cluster clicks only write one occurrence to the URL. Multi-occurrence clusters need design decisions about URL representation.

## NAV-01 Status

**Partially met.** Core link-sharing (scenarios A-E) works. Gaps F and G must be fixed in a follow-up gap-closure plan before NAV-01 can be fully checked off.

## Next Phase Readiness

- A gap-closure plan is needed to fix scenarios F and G
- The core URL sync architecture (A-E) is solid — gap fixes will be surgical
- No blockers to starting gap-closure work immediately

## Self-Check: PASSED

- Verification results recorded accurately from human feedback
- No source files were modified (verification-only plan, as expected)
- Commit `d3928e7` confirmed in git log

---
*Phase: 07-url-sharing*
*Completed: 2026-03-10*
