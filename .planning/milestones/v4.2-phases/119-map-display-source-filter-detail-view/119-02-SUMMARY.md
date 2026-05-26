---
phase: 119-map-display-source-filter-detail-view
plan: "02"
subsystem: ui
tags: [url-state, source-filter, typescript]

requires:
  - phase: 119-01
    provides: "MAP-03 RED tests in url-state.test.ts"

provides:
  - "UiState.hiddenSources field (typed Set<SourceKey>) for source filter URL state"
  - "src= param round-trip in buildParams/parseParams with VALID_SOURCES allowlist"
  - "hasFilter condition extended to include hiddenSources"

affects: [119-06, url-state consumers]

tech-stack:
  added: []
  patterns:
    - "VALID_SOURCES allowlist filters user-controlled URL tokens before constructing typed Set"
    - "Alphabetical sort on Set spread for deterministic, shareable URLs"

key-files:
  created: []
  modified:
    - src/url-state.ts

key-decisions:
  - "VALID_SOURCES declared at module level (not function-local) to keep it alongside the SourceKey type export"
  - "hiddenSources with size 0 after filtering treated as absent — no phantom result.ui emission"

patterns-established:
  - "SourceKey union type exported alongside VALID_SOURCES Set for downstream type-safe consumers"

requirements-completed: [MAP-03]

duration: 3min
completed: 2026-05-26
---

# Phase 119 Plan 02: Source Filter URL State Summary

**`src=` param round-trip added to url-state.ts: UiState.hiddenSources Set with VALID_SOURCES allowlist, alphabetical sort, and extended hasFilter condition — all 6 MAP-03 tests green**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-26T06:08:00Z
- **Completed:** 2026-05-26T06:08:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `SourceKey` union type and `VALID_SOURCES` allowlist Set to `url-state.ts`
- Extended `UiState` interface with `hiddenSources?: Set<SourceKey>`
- `buildParams` emits `src=` (alphabetically sorted, comma-joined) when `hiddenSources` is non-empty
- `parseParams` parses `src=` tokens through allowlist, emits `hiddenSources` in `result.ui`
- `hasFilter` condition extended to trigger `result.ui` on `src=` alone
- All 6 MAP-03 tests pass; 86 total url-state tests green; `tsc --noEmit` clean

## Task Commits

1. **Task 1: Extend UiState with hiddenSources and add src= round-trip** - `a2f4fc4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/url-state.ts` - Added SourceKey type, VALID_SOURCES allowlist, UiState.hiddenSources field, src= buildParams/parseParams logic

## Decisions Made
- `VALID_SOURCES` declared at module scope so it is co-located with `SourceKey` and easily discoverable by downstream consumers
- Empty `hiddenSources` Set (after allowlist filtering) treated as `undefined` — prevents an empty-set `src=` polluting `result.ui`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MAP-03 requirement satisfied at pure-function layer
- Plan 119-06 can wire `bee-atlas._hiddenSources` state through `buildParams`/`parseParams` using the new `UiState.hiddenSources` field and `SourceKey` type

## Self-Check: PASSED
- `src/url-state.ts` exists and contains hiddenSources (6 occurrences), VALID_SOURCES (2 occurrences), params.set('src' (1 occurrence)
- Commit `a2f4fc4` verified in git log
- All 86 url-state tests pass
- `tsc --noEmit` exits 0

---
*Phase: 119-map-display-source-filter-detail-view*
*Completed: 2026-05-26*
