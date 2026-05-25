---
phase: 113-species-page-expansion
plan: "04"
subsystem: js-data-layer
tags: [tdd, green, wave-2, vitest, genusList, subgenusList, seasonality-viz, checklist]
nyquist_compliant: true

dependency_graph:
  requires:
    - "113-01 (RED test gates)"
    - "113-02 (checklist_count in species.json)"
  provides:
    - "genusList includes checklist-only species with hexColor '#cccccc' (SPEC-02, D-03)"
    - "subgenusList includes checklist-only species with checklistCount field (SPEC-02, Pitfall 7)"
    - "seasonality-viz onChecklist property and Monthly-phenology-not-recorded fallback (SPEC-05, D-13)"
    - "Plan 01 JS RED test gates: genusList D-03 GREEN, subgenusList checklistCount GREEN, VIZ-02 onChecklist GREEN"
  affects:
    - "_data/species.js"
    - "src/species/seasonality-viz.ts"
    - "src/tests/data-species.test.ts"

tech_stack:
  added: []
  patterns:
    - "Checklist-only species appended AFTER WABA species to preserve color index assignments (Pitfall 3)"
    - "Two-part species list: WABA species (hue colors) + checklist-only species ('#cccccc') in genusList and subgenusList"
    - "checklistCount = sum of checklist_count over checklist-only members; used in subgenusList trailing filter"
    - "onChecklist Lit @property triggers early return in total===0 branch of render()"

key_files:
  created: []
  modified:
    - path: "_data/species.js"
      changes: "Added checklistOnly filter + map in genusList and subgenusList callbacks; added checklistCount field to subgenusList; updated trailing filter to totalOccurrences > 0 || checklistCount > 0"
    - path: "src/species/seasonality-viz.ts"
      changes: "Added @property onChecklist = false; added early return in if(total < 5) for total===0 && this.onChecklist rendering 'Monthly phenology not recorded'"
    - path: "src/tests/data-species.test.ts"
      changes: "Updated sort and hexColor algorithm tests to exclude checklist-only species (occurrence_count === 0) from WABA-specific assertions"

decisions:
  - "Used '#cccccc' for checklist-only hexColor (matches pre-existing test at data-species.test.ts:105 and PATTERNS.md guidance; NOT '#aaaaaa' which is reserved for unresolved 'Genus sp.' entries)"
  - "Checklist-only species appended AFTER speciesOnly block (not inserted by alpha order) to guarantee color index computation over withOcc is unchanged — Pitfall 3 compliance"
  - "Sort and hexColor tests updated to filter WABA species only for those assertions — checklist-only species are separately verified by the D-03 test"
  - "subgenusList display list excludes unresolved records test passes — checklist-only species all have specific_epithet !== null"

metrics:
  duration: "~3 minutes"
  completed_date: "2026-05-25"
  tasks_completed: 2
  files_modified: 3
  commits: 2
---

# Phase 113 Plan 04: JS Data Layer and Seasonality-Viz Checklist Integration

**One-liner:** genusList/subgenusList extended with 178 checklist-only species (hexColor '#cccccc') and a checklistCount field; seasonality-viz gains an onChecklist property triggering the "Monthly phenology not recorded" fallback.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend genusList and subgenusList in _data/species.js to include checklist-only species | c64851a | _data/species.js, src/tests/data-species.test.ts |
| 2 | Add onChecklist property and Monthly-phenology-not-recorded fallback to seasonality-viz | f67951c | src/species/seasonality-viz.ts |

## Data Counts

| Metric | Value |
|--------|-------|
| Checklist-only species in species.json | 178 (occurrence_count === 0, on_checklist === true) |
| Subgenus groups that previously required totalOccurrences > 0 | All previously had totalOccurrences > 0; checklistCount now also gates inclusion |
| Total data-species tests | 23 (all GREEN) |
| Total seasonality-viz tests | 16 (all GREEN) |
| Pre-existing tests that required updating | 4 (2 sort tests, 2 hexColor algorithm tests — skip checklist-only species) |

## Plan 01 RED Tests Now GREEN

| Test | File | Status |
|------|------|--------|
| genusList contains at least one species with occurrence_count === 0 and on_checklist (D-03) | data-species.test.ts | GREEN |
| subgenusList.every(g => g.totalOccurrences > 0 || g.checklistCount > 0) | data-species.test.ts | GREEN |
| VIZ-02 checklist fallback: total=0 + onChecklist=true renders "Monthly phenology not recorded" | seasonality-viz.test.ts | GREEN |
| VIZ-02 checklist fallback: total=0 + onChecklist=false renders "0 records" | seasonality-viz.test.ts | GREEN (was already green) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated color algorithm and sort tests to skip checklist-only species**
- **Found during:** Task 1 verification
- **Issue:** Four existing tests failed after adding checklist-only species to genusList/subgenusList: (a) "genusList species sorted alphabetically" — expected full alpha order but WABA+checklist is two separate sorted blocks; (b) "genusList hexColors match Python _group_colors" — iterated all species including checklist-only whose `colorByCanon[canonical_name]` is `undefined`; same two tests for subgenusList.
- **Fix:** Updated the four tests to filter only WABA species (occurrence_count > 0, slug !== null) for sort assertions; added `if (sp.occurrence_count === 0) continue` to hexColor algorithm assertions with comments explaining checklist-only species are separately verified by the D-03 test.
- **Files modified:** `src/tests/data-species.test.ts`
- **Commit:** c64851a

### Data Files

`public/data/species.json` and `public/data/seasonality.json` were not present in the worktree (spawned before Plan 02 committed them to main). Copied from `/Users/rainhead/dev/beeatlas/public/data/` to enable test execution. These files are not tracked by git in the worktree.

## Known Stubs

None — all production code is wired correctly. The `onChecklist` property will be set by the template in Plan 05.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Both changes are pure UI logic in build-time JS and a Lit component.

## Self-Check

### Files exist:
- `_data/species.js` — FOUND (modified)
- `src/species/seasonality-viz.ts` — FOUND (modified)
- `src/tests/data-species.test.ts` — FOUND (modified)

### Commits exist:
- `c64851a` — FOUND (Task 1)
- `f67951c` — FOUND (Task 2)

### Verification commands:
- `grep -c "occurrence_count === 0 && sp.on_checklist" _data/species.js` → 2 ✓
- `grep -c "'#cccccc'" _data/species.js` → 2 ✓
- `grep -c "checklistCount" _data/species.js` → 3 ✓
- `grep -E "filter\(g => g\.totalOccurrences > 0 \|\| g\.checklistCount > 0\)" _data/species.js` → 1 ✓
- `grep -c "onChecklist" src/species/seasonality-viz.ts` → 2 ✓
- `grep -c "Monthly phenology not recorded" src/species/seasonality-viz.ts` → 1 ✓
- `npm test -- data-species.test.ts seasonality-viz.test.ts` → 39 passed ✓

## Self-Check: PASSED
