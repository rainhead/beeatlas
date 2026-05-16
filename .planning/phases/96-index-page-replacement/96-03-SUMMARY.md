---
phase: 96-index-page-replacement
plan: "03"
subsystem: cleanup
tags: [cleanup, eleventy, vitest, typescript]

requires:
  - phase: 96-index-page-replacement
    plan: "02"
    provides: "species-index.ts entry and rewritten species.njk (the replacements that make deletions safe)"

provides:
  - "D-01 fulfilled: all 8 monolith production files deleted from repo"
  - "All 6 dedicated test files for deleted components deleted"
  - "src/tests/arch.test.ts: 3 describe blocks (species boundary, spa-link, species-index allowlist)"

affects: []

tech-stack:
  added: []
  patterns:
    - "Surgical describe-block deletion in arch.test.ts using label as anchor"

key-files:
  created: []
  modified:
    - src/tests/arch.test.ts

key-decisions:
  - "Dropped bare 'filter' token from FORBIDDEN_PATTERNS in new species-index allowlist block — would false-positive on any TS file with 'filter' in a comment; allowlist already gates this precisely"
  - "bee-sidebar.test.ts and build-output.test.ts race-condition failures are pre-existing; documented as out-of-scope"
  - "public symlink created in worktree (untracked) for data-species.test.ts to resolve species.json"

metrics:
  duration: 15min
  completed: 2026-05-16
---

# Phase 96 Plan 03: Monolith Deletion and arch.test.ts Surgery Summary

**D-01 fulfilled: 14 files deleted (8 production, 6 test) and arch.test.ts reduced from 4 to 3 describe blocks with a new species-index.ts allowlist replacing the defunct species.ts allowlist**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-16T15:29:00Z
- **Completed:** 2026-05-16T15:44:00Z
- **Tasks:** 4 (3 committed + 1 verification)
- **Files modified:** 1 (arch.test.ts)
- **Files deleted:** 14 (8 production + 6 test)

## Accomplishments

- Deleted 8 monolith production files: `src/entries/species.ts`, `src/species/bee-species-page.ts`, `src/species/bee-species-filter.ts`, `src/species/bee-species-card.ts`, `src/species/bee-taxon-nav.ts`, `src/species/url-state.ts`, `src/styles/species.css`, `_includes/taxon-tree.njk`
- Deleted 6 dedicated test files: `bee-species-page.test.ts`, `bee-species-filter.test.ts`, `bee-species-card.test.ts`, `bee-taxon-nav.test.ts`, `species-url-state.test.ts`, `src/species/tests/a11y.test.ts`
- Preserved `src/species/seasonality-viz.ts`, `src/species/seasonality-cache.ts`, `src/tests/seasonality-viz.test.ts` (all kept — seasonality-viz is still loaded by taxon-page.ts)
- Surgically updated `src/tests/arch.test.ts`: deleted PAGE-06 and species.ts allowlist describe blocks, added new `species-index.ts allowlist (IDX-02, Phase 96)` block
- Removed unused code from arch.test.ts: `basename` import, `ENTRY_FILE`, `PAGE_COORDINATOR_FORBIDDEN`, `isCoordinatorImport`
- All 9 arch.test.ts tests pass; tsc --noEmit clean; build-output.test.ts passes standalone
- `_site/species/index.html` builds with 6 `.family-section` elements (regression confirmed)
- Zero production-code references to any deleted symbol remain

## Task Commits

1. **Task 1: Delete 8 monolith production files** - `994067c` (feat)
2. **Task 2: Delete 6 dedicated test files** - `1b3ba68` (feat)
3. **Task 3: Update arch.test.ts** - `bf74330` (feat)
4. **Task 4: Full test + build verification** - (no commit — verification only)

## Files Created/Modified

- `src/tests/arch.test.ts` - Updated: deleted PAGE-06 and species.ts allowlist blocks, added species-index.ts allowlist block; 4→3 describe blocks, 1258→78 lines (net -119 lines including removed dead code)

## Files Deleted

### Production Files (8)
- `src/entries/species.ts` — entry for old page; replaced by species-index.ts
- `src/species/bee-species-page.ts` — Lit coordinator for old page
- `src/species/bee-species-filter.ts` — filter presenter
- `src/species/bee-species-card.ts` — card presenter
- `src/species/bee-taxon-nav.ts` — taxon navigation presenter
- `src/species/url-state.ts` — URL sync module
- `src/styles/species.css` — old page stylesheet
- `_includes/taxon-tree.njk` — Nunjucks macro for old page

### Test Files (6)
- `src/tests/bee-species-page.test.ts` — tested deleted coordinator
- `src/tests/bee-species-filter.test.ts` — tested deleted filter presenter
- `src/tests/bee-species-card.test.ts` — tested deleted card presenter
- `src/tests/bee-taxon-nav.test.ts` — tested deleted taxon-nav presenter
- `src/tests/species-url-state.test.ts` — tested deleted url-state module
- `src/species/tests/a11y.test.ts` — imported deleted bee-taxon-nav.ts

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "describe(" src/tests/arch.test.ts` | 3 (was 4; -2 +1) |
| `grep -c "PAGE-06" src/tests/arch.test.ts` | 0 |
| `grep -c "src/entries/species.ts allowlist"` | 0 |
| `grep -c "src/entries/species-index.ts allowlist"` | 1 |
| `grep -c "ARCH-04: src/lib/spa-link.ts boundary"` | 1 |
| `grep -c "ARCH-04: src/species boundary"` | 1 |
| `VITEST_SKIP_BUILD=1 npx vitest run src/tests/arch.test.ts` | 9/9 passed |
| `npx tsc --noEmit` | clean (0 errors) |
| Production references to deleted symbols | 0 (comments only in kept files) |
| `_site/species/index.html` has `.family-section` | 6 occurrences |
| `npm run build` exits 0 | yes |

## Deviations from Plan

### Minor Adjustments

**1. [Rule 1 - Bug] Removed 'filter' from FORBIDDEN_PATTERNS in new arch.test.ts describe block**
- **Found during:** Task 3
- **Issue:** The PATTERNS.md new block listed `'filter'` in FORBIDDEN_PATTERNS. Since the allowlist test reads the source file and checks `src.not.toContain(pattern)`, a bare `'filter'` token would false-positive on any comment or variable name containing that word. The existing arch.test.ts FORBIDDEN list already uses more specific tokens like `'../filter.ts'` and `'../filter'` — and the allowlist itself already gates all non-approved imports more precisely.
- **Fix:** Dropped `'filter'` from the new FORBIDDEN_PATTERNS array; kept `'bee-species-page'`, `'bee-species-filter'`, `'bee-atlas'`, `'wa-sqlite'`, `'mapbox-gl'`.
- **Files modified:** `src/tests/arch.test.ts`
- **Commit:** `bf74330`

## Pre-existing Failures (Out of Scope)

Two test failures exist in both the worktree and main repo and are unrelated to this plan:

1. **`frontend/src/tests/bee-sidebar.test.ts`** — References `../bee-filter-controls.ts` which does not exist. This file was orphaned when `frontend/` was hoisted to repo root (Phase 74). Pre-existing before Phase 96.

2. **`src/tests/build-output.test.ts` (intermittent)** — Race condition: when vitest runs `validate-species.test.ts` (which temporarily writes bad data to `content/species-photos.toml`) concurrently with `build-output.test.ts` (which runs `npm run build`), the build sees the bad data and fails. Pre-existing before Phase 96.

These are logged to `deferred-items.md` scope — not fixed here.

## Known Stubs

None.

## Threat Flags

None — this plan only deletes files; no new network endpoints, auth paths, or data sources introduced.

## Self-Check

- [x] `src/entries/species.ts` does not exist
- [x] `src/species/bee-species-page.ts` does not exist
- [x] `src/species/bee-species-filter.ts` does not exist
- [x] `src/species/bee-species-card.ts` does not exist
- [x] `src/species/bee-taxon-nav.ts` does not exist
- [x] `src/species/url-state.ts` does not exist
- [x] `src/styles/species.css` does not exist
- [x] `_includes/taxon-tree.njk` does not exist
- [x] `src/tests/bee-species-page.test.ts` does not exist
- [x] `src/tests/bee-species-filter.test.ts` does not exist
- [x] `src/tests/bee-species-card.test.ts` does not exist
- [x] `src/tests/bee-taxon-nav.test.ts` does not exist
- [x] `src/tests/species-url-state.test.ts` does not exist
- [x] `src/species/tests/a11y.test.ts` does not exist
- [x] `src/species/seasonality-viz.ts` exists (kept)
- [x] `src/species/seasonality-cache.ts` exists (kept)
- [x] `src/tests/seasonality-viz.test.ts` exists (kept)
- [x] `src/tests/arch.test.ts` has 3 describe blocks
- [x] Task 1 commit `994067c` exists
- [x] Task 2 commit `1b3ba68` exists
- [x] Task 3 commit `bf74330` exists

## Self-Check: PASSED

---
*Phase: 96-index-page-replacement*
*Completed: 2026-05-16*
