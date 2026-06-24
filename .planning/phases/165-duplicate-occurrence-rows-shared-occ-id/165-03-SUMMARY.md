---
phase: 165-duplicate-occurrence-rows-shared-occ-id
plan: "03"
subsystem: ui
tags: [source-filter, SourceKey, waba_specimen, bee-pane, bee-occurrence-detail, url-state, filter]
dependency_graph:
  requires:
    - 165-01 (occurrence.test.ts test infrastructure)
    - 165-02 (waba_specimen source value in data layer; obs_url on waba_specimen rows)
  provides:
    - src/url-state.ts ('waba_specimen' in SourceKey union + VALID_SOURCES Set)
    - src/filter.ts ('waba_specimen' in OccurrenceRow.source union + source-filter VALID_SOURCES array)
    - src/bee-pane.ts (5th source toggle for waba_specimen; waba_sample copy corrected to 'Provisional samples'; all-off guard 4->5)
    - src/bee-occurrence-detail.ts (_renderWabaSpecimen branch; dispatch updated before inat_obs)
  affects:
    - Any phase touching SourceKey union or VALID_SOURCES (must add to both url-state.ts and filter.ts)
    - Any phase touching bee-pane.ts source toggles (all-off count is now 5)
tech-stack:
  added: []
  patterns:
    - "Split VALID_SOURCES pattern: url-state.ts Set for parse/build; filter.ts array for SQL IN clause — keep both in sync when adding a source"
    - "Source dispatch in bee-occurrence-detail.ts render(): explicit source === 'X' branches before generic fallbacks"
key-files:
  created: []
  modified:
    - src/url-state.ts
    - src/filter.ts
    - src/bee-pane.ts
    - src/bee-occurrence-detail.ts
    - src/tests/url-state.test.ts
    - src/tests/filter.test.ts
key-decisions:
  - "waba_specimen placed adjacent to waba_sample in both VALID_SOURCES declarations to keep the waba_* family grouped"
  - "waba_specimen dispatch inserted before inat_obs in render() — both are non-provisional/non-checklist; explicit source-based routing avoids predicate ambiguity"
  - "_renderWabaSpecimen reuses _renderInatObs structure (taxon display via taxonCache, quality badge, obs_url link) with 'Awaiting Ecdysis catalogue entry' hint added — no new CSS classes"
  - "Test updates are Rule 1 auto-fix (tests encoding 4-source universe become incorrect with 5 sources; updated to 5-source universe)"
patterns-established:
  - "When adding a new SourceKey: update SourceKey union in url-state.ts, VALID_SOURCES Set in url-state.ts, OccurrenceRow.source union in filter.ts, VALID_SOURCES array in filter.ts, layers array in bee-pane.ts _renderSources, all-off guard count in bee-pane.ts, dispatch in bee-occurrence-detail.ts render(), test expectations for source counts"
requirements-completed: []
duration: ~8min
completed: "2026-06-24"
---

# Phase 165 Plan 03: Frontend waba_specimen Source Wiring Summary

**waba_specimen SourceKey wired end-to-end: url-state VALID_SOURCES, filter SQL builder, 5th source toggle ('WABA specimens'), occurrence-detail _renderWabaSpecimen branch; waba_sample toggle copy corrected to 'Provisional samples'**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-24T14:43:00Z
- **Completed:** 2026-06-24T14:51:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `'waba_specimen'` added to `SourceKey` union and `VALID_SOURCES` in `url-state.ts`; existing src= parse/build logic picks up the 5th value automatically (no logic changes needed)
- `OccurrenceRow.source` union and source-filter `VALID_SOURCES` array updated in `filter.ts`; SQL IN clause now includes `waba_specimen` as a valid, hardcoded (non-user-input) token (T-165-04/T-165-05 mitigated)
- 5th source toggle added to `bee-pane.ts` `_renderSources()` `layers` array; `waba_sample` label/tooltip corrected from 'Provisional WABA' to 'Provisional samples' per D-11; all-off guard updated 4 → 5
- `_renderWabaSpecimen` method added to `bee-occurrence-detail.ts`, dispatched before `inat_obs` branch; renders taxon name (via taxonCache), `specimen_inat_quality_grade` badge, date, observer, `obs_url` iNat link, and 'Awaiting Ecdysis catalogue entry' hint — all reusing existing CSS classes
- `occIdFromRow`, `parseOccId`, `OCC_ID_SQL_CASE` remain UNCHANGED; positional coupling with occurrence_places.sql intact

## Task Commits

1. **Task 1: Add waba_specimen to SourceKey + VALID_SOURCES** - `1d7bd751` (feat)
2. **Task 2: Add waba_specimen toggle + occurrence-detail branch** - `9cd8af75` (feat)

## Files Created/Modified

- `src/url-state.ts` - SourceKey union + VALID_SOURCES Set: added 'waba_specimen' adjacent to 'waba_sample'
- `src/filter.ts` - OccurrenceRow.source union + VALID_SOURCES array in source-filter builder: added 'waba_specimen'
- `src/bee-pane.ts` - 5th entry in layers array (waba_specimen toggle); waba_sample copy corrected; all-off guard === 4 → === 5
- `src/bee-occurrence-detail.ts` - _renderWabaSpecimen method + dispatch in render()
- `src/tests/url-state.test.ts` - Updated 8 test expectations from 4-source to 5-source universe
- `src/tests/filter.test.ts` - Updated 2 test expectations from 4-source to 5-source universe

## Decisions Made

- `_renderWabaSpecimen` uses `taxonCache` for display name (same as `_renderInatObs`) and falls back to `row.display_name` — waba_specimen rows carry `display_name` from the mart (same `canonical_name` derivation), so both paths resolve
- Dispatch order: `isProvisional` → `checklist` → `waba_specimen` → `inat_obs` → `_renderSampleOnly`; waba_specimen before inat_obs prevents future ambiguity if both have iNat links

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 10 test expectations from 4-source to 5-source universe**
- **Found during:** Task 2 verification (`npm test` after bee-pane.ts + bee-occurrence-detail.ts changes)
- **Issue:** `src/tests/url-state.test.ts` and `src/tests/filter.test.ts` had 10 tests encoding the prior 4-source universe (exact Set members, complement sizes, IN clause strings). Adding waba_specimen to VALID_SOURCES changed the complement of any partial visible set, making those assertions incorrect.
- **Fix:** Updated all 10 affected tests to the 5-source universe: complement of `{ecdysis}` is now 4 sources (not 3); `src=none` round-trip produces 5-element Set; all-hidden test passes 5 sources; filter IN clause for `hiddenSources={ecdysis}` now lists 4 values.
- **Files modified:** `src/tests/url-state.test.ts`, `src/tests/filter.test.ts`
- **Verification:** `npm test` — 865 passed, 0 failed
- **Committed in:** `9cd8af75` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test expectations encoding stale 4-source universe)
**Impact on plan:** Test updates are a direct consequence of adding the 5th source; they correctly encode the new invariant. No scope creep.

## Issues Encountered

None — all changes were straightforward additive extensions of the existing patterns.

## Known Stubs

None. waba_specimen source is fully wired: validated in URL parsing, included in SQL filter, displayed in toggle UI, rendered in occurrence-detail card with real data (obs_url from Plan 02).

## Threat Flags

No new security-relevant surface. `waba_specimen` token validated via the same VALID_SOURCES allowlist as the 4 prior tokens (T-165-04 mitigated); SQL IN clause values come from the hardcoded VALID_SOURCES array, not user input (T-165-05 mitigated). `obs_url` in `_renderWabaSpecimen` is a public iNaturalist URL from the data layer, same pattern as existing inat_obs rows.

## Next Phase Readiness

- Phase 165 is complete: data-model correction (Plans 01+02) + frontend wiring (Plan 03) fully shipped
- Manual UAT deferred (per VALIDATION.md): verify waba_specimen toggle shows/hides the 33 points; waba_sample toggle controls provisional samples; occurrence-detail renders badge correctly
- Shape C OFV fan-out (ecdysis:6317352, ecdysis:6317353) remains at severity:warn — backlog item recommended (see 165-02-SUMMARY.md)

## Self-Check: PASSED

- `src/url-state.ts` — exists, contains 'waba_specimen' in SourceKey and VALID_SOURCES (grep -c waba_specimen = 2)
- `src/filter.ts` — exists, contains 'waba_specimen' in OccurrenceRow.source and VALID_SOURCES (grep -c waba_specimen = 2)
- `src/bee-pane.ts` — exists, waba_specimen toggle present, 'Provisional samples' label, size === 5
- `src/bee-occurrence-detail.ts` — exists, _renderWabaSpecimen method, dispatch updated
- `1d7bd751` — found in git log
- `9cd8af75` — found in git log
- `tsc --noEmit` — exit 0
- `npm test` — 865 passed, 0 failed

---
*Phase: 165-duplicate-occurrence-rows-shared-occ-id*
*Completed: 2026-06-24*
