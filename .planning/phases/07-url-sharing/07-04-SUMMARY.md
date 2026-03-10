---
phase: 07-url-sharing
plan: "04"
subsystem: frontend
tags: [url-sync, history-api, openlayers, lit]

dependency_graph:
  requires:
    - phase: 07-url-sharing
      provides: [url-state-sync, shareable-urls, history-navigation]
  provides:
    - multi-occurrence o= param encoding (comma-separated IDs)
    - o= param preserved on initial page load
    - cluster click encodes all occurrence IDs
    - _restoreSelectedOccurrences handles multiple IDs from URL
  affects: [bee-map.ts]

tech-stack:
  added: []
  patterns:
    - "Comma-separated o= param for multi-occurrence URL encoding: o=ecdysis:123,ecdysis:456"
    - "ParsedParams.occurrenceIds as string[] (never null, empty array = no selection)"
    - "buildSearchParams accepts string[] | null for selectedOccIds"

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "occurrenceIds: string[] (not string | null) in ParsedParams — cleaner, avoids null checks at call sites"
  - "Preserve o= on initial replaceState by passing initialParams.occurrenceIds to buildSearchParams"
  - "Call _pushUrlState() after _restoreSelectedOccurrences in data-load callback to keep o= in URL bar post-restore"

patterns-established:
  - "Multi-occurrence cluster clicks: store all IDs via toShow.map(f => f.getId() as string)"
  - "URL restore: _restoreSelectedOccurrences loops all IDs, looks up each feature individually"

requirements-completed: [NAV-01]

duration: 3min
completed: "2026-03-09"
---

# Phase 07 Plan 04: o= URL Parameter Bug Fixes Summary

**Fixed two o= URL param bugs: initial replaceState no longer strips the param, and cluster clicks now encode all occurrence IDs comma-separated (not just the first).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-10T03:01:08Z
- **Completed:** 2026-03-10T03:04:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Initial page load with `?o=ecdysis:123` now preserves the param in the URL bar and opens the detail panel
- Cluster clicks encode all occurrence IDs: `o=ecdysis:123,ecdysis:456,ecdysis:789`
- Pasting a multi-occurrence URL restores all occurrences in the sidebar
- `_pushUrlState()` called after occurrence restore keeps the URL in sync
- All 8 plan changes applied; TypeScript compiles with zero errors; Vite build succeeds

## Changes Made

1. **ParsedParams interface** — `occurrenceId: string | null` changed to `occurrenceIds: string[]`
2. **buildSearchParams signature** — `selectedOccId: string | null` changed to `selectedOccIds: string[] | null`; joins with comma if non-empty
3. **parseUrlParams return** — splits `o=` value on comma, filters for valid `ecdysis:` prefix, returns `string[]`
4. **_selectedOccId field** — renamed to `_selectedOccIds: string[] | null = null`; all references updated
5. **_restoreSelectedOccurrences** — renamed from singular; accepts `string[]`, looks up each feature, calls `buildSamples()` on all found
6. **singleclick handler** — now stores `toShow.map(f => f.getId() as string)` instead of only `toShow[0]`
7. **Initial replaceState** — passes `initialParams.occurrenceIds.length > 0 ? initialParams.occurrenceIds : null` (Bug 1 fix)
8. **Data-load callback** — calls `_pushUrlState()` after `_restoreSelectedOccurrences()` (keeps o= in URL bar after restore)

## How Multi-Occurrence Encoding Works

- **Encoding:** `buildSearchParams` joins `selectedOccIds` with `,` → `o=ecdysis:123,ecdysis:456`
- **Decoding:** `parseUrlParams` splits on `,`, trims whitespace, filters for `ecdysis:` prefix → `string[]`
- **Restore:** `_restoreSelectedOccurrences` loops IDs, calls `specimenSource.getFeatureById()` for each, aggregates results into one `buildSamples()` call — exactly reconstructing what the user saw when clicking the cluster

## Task Commits

1. **Task 1: Refactor o= param to support multiple occurrence IDs** - `489dadf` (fix)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `frontend/src/bee-map.ts` — All 8 changes applied: ParsedParams, buildSearchParams, parseUrlParams, _selectedOccIds, _restoreSelectedOccurrences, singleclick handler, initial replaceState, data-load callback

## Decisions Made

- `occurrenceIds: string[]` (empty array instead of null) makes call sites cleaner — no null checks needed before `.length > 0`
- Stale comment referencing `_selectedOccId` (old name) updated to describe new behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale comment referenced old _selectedOccId name**
- **Found during:** Task 1 verification (grep check)
- **Issue:** Comment on line 509 said "also track _selectedOccId" — would have failed the `grep -n "_selectedOccId[^s]"` verification check
- **Fix:** Updated comment to accurately describe new behavior ("store all occurrence IDs in cluster for URL encoding")
- **Files modified:** frontend/src/bee-map.ts
- **Verification:** Re-ran grep; no old name found
- **Committed in:** 489dadf (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — stale comment)
**Impact on plan:** Trivial fix. No scope creep.

## TypeScript Compile Status

`npx tsc --noEmit` exits 0 with no errors. Vite production build succeeds.

## Issues Encountered

None.

## Next Phase Readiness

- NAV-01 gap-closure complete: o= param preserved on load, cluster clicks encode all IDs, multi-occurrence restore works
- URL sharing scenarios A-G should now all function correctly
- No known blockers

## Self-Check: PASSED

- frontend/src/bee-map.ts: FOUND
- .planning/phases/07-url-sharing/07-04-SUMMARY.md: FOUND
- Commit 489dadf (Task 1): FOUND

---
*Phase: 07-url-sharing*
*Completed: 2026-03-09*
