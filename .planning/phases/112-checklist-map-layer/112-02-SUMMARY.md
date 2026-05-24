---
phase: 112-checklist-map-layer
plan: 02
subsystem: ui
tags: [typescript, url-state, manifest, vitest]

# Dependency graph
requires:
  - phase: 112-01
    provides: MAP-04 RED gate tests in src/tests/url-state.test.ts
provides:
  - UiState.checklistVisible optional boolean field in src/url-state.ts
  - cl=1 URL param encode/decode round-trip in buildParams/parseParams
  - checklist: string field on Manifest interface in src/manifest.ts
  - DataKey type now includes 'checklist'; resolveDataUrl('checklist') is a valid call
  - checklist: 'checklist.parquet' key in scripts/make-local-manifest.js output
affects:
  - 112-03 (bee-map checklist layer; consumes resolveDataUrl('checklist') and UiState.checklistVisible)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional UiState fields: omit URL param when false/undefined; include in result.ui object unconditionally when result.ui is emitted"
    - "Manifest interface + DataKey = keyof Omit<Manifest, 'generated_at'> pattern: adding a field to Manifest automatically admits it as a valid DataKey"

key-files:
  created: []
  modified:
    - src/url-state.ts
    - src/tests/url-state.test.ts
    - src/manifest.ts
    - scripts/make-local-manifest.js

key-decisions:
  - "checklistVisible is optional (?) in UiState — avoids breaking existing callers that construct UI objects without it; the dozens of existing call sites don't need updating"
  - "checklist: string is non-optional in Manifest — production manifest already includes the key (Phase 111) and local dev generator must produce it"
  - "parseParams includes checklistVisible unconditionally in result.ui object when emitted (not guarded like boundaryMode/paneState) — consumers use ?. access; simpler than conditional spread"

patterns-established:
  - "cl=1 strict equality check: p.get('cl') === '1' — any other value coerces to false; no string interpolation into DOM or SQL"

requirements-completed:
  - MAP-04

# Metrics
duration: 7min
completed: 2026-05-24
---

# Phase 112 Plan 02: URL Plumbing and Manifest Typing Summary

**UiState.checklistVisible optional field + cl=1 URL round-trip + Manifest checklist key enabling resolveDataUrl('checklist') for Plan 03**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-24T15:28:00Z
- **Completed:** 2026-05-24T15:35:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended UiState with `checklistVisible?: boolean`; all existing callers unchanged (optional field)
- Wired `cl=1` URL param encode (buildParams) and decode (parseParams) with strict equality guard
- All 6 MAP-04 tests turned GREEN; removed `@ts-expect-error` guards from test file
- Added `checklist: string` to Manifest interface — DataKey now includes `'checklist'` automatically
- Updated local dev manifest generator; `public/data/manifest.json` contains `"checklist": "checklist.parquet"`
- TypeScript typecheck exits 0 across all changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend UiState with optional checklistVisible and cl=1 round-trip** - `1409d83` (feat)
2. **Task 2: Add checklist key to Manifest interface and local dev generator** - `0df556f` (feat)

## Files Created/Modified
- `src/url-state.ts` - Added checklistVisible?: boolean to UiState; cl=1 encode in buildParams; cl decode in parseParams
- `src/tests/url-state.test.ts` - Removed @ts-expect-error guards (MAP-04 gate satisfied)
- `src/manifest.ts` - Added checklist: string field to Manifest interface
- `scripts/make-local-manifest.js` - Added checklist: 'checklist.parquet' to JSON output

## Decisions Made
- `checklistVisible` is optional in UiState so existing callers (bee-atlas.ts and test helpers) don't need updating — backward compatible
- `checklist: string` is non-optional in Manifest — production manifest already has the key (Phase 111 nightly.sh wiring)
- `checklistVisible` is included unconditionally in the emitted `result.ui` object (not conditionally spread) — Plan 03 consumers use `?.checklistVisible` access; simpler API

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all three edits applied cleanly; MAP-04 tests passed on first run after implementation.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond what is in the plan threat model. The `cl=1` param uses strict equality so injection is not possible. `checklist.parquet` is intentionally public data (same posture as occurrences.parquet).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 03 can now call `resolveDataUrl('checklist')` (TypeScript accepts `'checklist'` as DataKey)
- Plan 03 can read `UiState.checklistVisible` from `parseParams` and write it via `buildParams`
- No blockers for Plan 03 (bee-map checklist layer component work)

## Self-Check: PASSED

All task commits found: 1409d83, 0df556f. All modified files present. MAP-04 tests GREEN (6/6). TypeScript typecheck exits 0.

---
*Phase: 112-checklist-map-layer*
*Completed: 2026-05-24*
