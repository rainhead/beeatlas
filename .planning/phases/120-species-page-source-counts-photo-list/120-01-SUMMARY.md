---
phase: 120-species-page-source-counts-photo-list
plan: "01"
subsystem: ui
tags: [nunjucks, eleventy, species-page, occurrence-counts, data-module]

# Dependency graph
requires:
  - phase: 113-species-page-expansion
    provides: species-detail metadata line format; genusList checklist-only branch pattern
provides:
  - Source-aware count labels on species-detail, genus, subgenus, and tribe pages
  - Extended tribeMap accumulator with specimen_count and inat_obs_count per genus
affects:
  - 120-02 (photos.json pipeline step)
  - Any future phase reading tribeList genus objects

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nunjucks inline arithmetic: {{ a + b }} for summing occurrence_count + inat_obs_count"
    - "tribeMap generaMap stores object {occurrence_count, specimen_count, inat_obs_count} instead of bare int"
    - "Synthetic 'Genus sp.' entries carry specimen_count/inat_obs_count from unresolved members"

key-files:
  created: []
  modified:
    - _pages/species-detail.njk
    - _pages/genus.njk
    - _pages/subgenus.njk
    - _pages/tribe.njk
    - _data/species.js
    - src/tests/build-output.test.ts

key-decisions:
  - "Use Nunjucks inline arithmetic (occurrence_count + inat_obs_count) for atlas link total — no pre-computed field needed"
  - "Synthetic 'Genus sp.' and 'Subgenus sp.' entries extended with specimen_count/inat_obs_count from unresolved (null specific_epithet) members"
  - "tribeMap generaMap switches from bare int to object, using spread in .map() to flatten into genus entries"

patterns-established:
  - "Count label format: 'N specimens · N community observations' (middot separator, matches existing metadata line style)"
  - "Occurrence-branch guard stays occurrence_count > 0; inat_obs_count is displayed but not used as guard condition"

requirements-completed: [SPE-01, SPE-02]

# Metrics
duration: 15min
completed: 2026-05-26
---

# Phase 120 Plan 01: Species Page Source Counts Summary

**Source-aware 'N specimens · N community observations' labels replace single 'N records' across species-detail, genus, subgenus, and tribe pages; tribeMap accumulator extended to carry per-genus specimen and iNat obs sums**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-26T18:04:00Z
- **Completed:** 2026-05-26T18:19:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Species-detail pages now show "N specimens · N community observations · N counties · N ecoregions" replacing single "N records"
- Atlas link text updated to "View N records on the atlas" where N sums occurrence_count + inat_obs_count
- Genus and subgenus pages show source-aware breakdown in the occurrence_count > 0 branch; checklist-only and zero branches untouched
- Tribe pages show "N specimens · N community observations" per genus entry using new tribeMap fields
- Synthetic "Genus sp." and "Subgenus sp." entries (grey unresolved-records rows) correctly carry specimen_count/inat_obs_count derived from unresolved members

## Task Commits

1. **Task 1: Update species-detail.njk count label and atlas link** - `9963f49` (feat)
2. **Task 2: Update genus/subgenus/tribe templates and extend tribeMap accumulator** - `c26b891` (feat)

## Files Created/Modified

- `_pages/species-detail.njk` - Metadata line updated to show specimen_count/inat_obs_count; atlas link uses arithmetic sum and "records" wording
- `_pages/genus.njk` - Occurrence branch span updated to source-aware breakdown
- `_pages/subgenus.njk` - Same change as genus.njk
- `_pages/tribe.njk` - Per-genus count span updated to source-aware breakdown
- `_data/species.js` - tribeMap generaMap: bare int → object; filter/map updated; synthetic sp. entries extended with specimen_count/inat_obs_count
- `src/tests/build-output.test.ts` - Atlas link assertion updated to match "records" wording

## Decisions Made

- Used inline Nunjucks arithmetic `{{ sp.occurrence_count + sp.inat_obs_count }}` for atlas link total; no pre-computed field added to _data/species.js
- Extended tribeMap generaMap value from bare `int` to `{ occurrence_count, specimen_count, inat_obs_count }` object and used spread `...counts` in `.map()` to maintain forward-compatibility
- Computed unresolvedSpecimenCount and unresolvedInatObsCount for synthetic sp. entries from the same `unresolvedMembers` filter used for unresolvedOccurrences

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended synthetic "Genus sp." / "Subgenus sp." entries with specimen_count/inat_obs_count**
- **Found during:** Task 2 verification (genus page build output review)
- **Issue:** The synthetic `{ scientificName: 'Genus sp.', occurrence_count, slug: null }` entry created on line 142 of `_data/species.js` had no `specimen_count` or `inat_obs_count` fields. With the template now rendering those fields in the `occurrence_count > 0` branch, the sp. entry displayed " specimens ·  community observations" (blank values)
- **Fix:** Compute `unresolvedSpecimenCount` and `unresolvedInatObsCount` from the unresolved members reduce, include them in the pushed sp. object. Same fix applied to the analogous subgenusList block
- **Files modified:** `_data/species.js`
- **Verification:** Built genus page shows "358 specimens · 1717 community observations" for Agapostemon sp. entry
- **Committed in:** c26b891 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — blank count display for unresolved sp. entries)
**Impact on plan:** Fix was necessary for correct display. No scope creep; all changes within _data/species.js which was already a Task 2 file.

## Issues Encountered

- Existing build-output.test.ts test (line 91) asserted `/View \d+ occurrences on the atlas/` — the intentional rename to "records" caused a test failure. Updated the regex to `/View \d+ records on the atlas/` as a direct consequence of D-11.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five target files updated; build and test suite pass clean (525/525)
- tribeList genus objects now expose `specimen_count` and `inat_obs_count` for any future tribe-page enhancements
- Phase 120-02 (photos.json pipeline step) can proceed independently

---
*Phase: 120-species-page-source-counts-photo-list*
*Completed: 2026-05-26*
