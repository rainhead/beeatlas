---
phase: 138-frontend-points-detail-card
plan: "04"
subsystem: frontend
tags: [checklist, detail-card, roman-date, det-annotation, occurrence-row]
dependency_graph:
  requires: [138-01, 138-02]
  provides: [checklist-detail-card, formatRomanDate-precision, checklist-selection-routing]
  affects: [src/filter.ts, src/bee-occurrence-detail.ts, src/occurrence.ts, src/bee-atlas.ts]
tech_stack:
  added: []
  patterns:
    - source-dispatch render branch mirroring _renderInatObs/_renderSampleOnly
    - precision-from-string-length date formatting (no date_quality column)
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-occurrence-detail.ts
    - src/occurrence.ts
    - src/bee-atlas.ts
    - src/tests/occurrence.test.ts
decisions:
  - "formatRomanDate signature widened to (string | null); precision inferred from string length (10/7/4), null/empty -> '' (D-08)"
  - "det. annotation `{accepted} (det. as {verbatim})` only when verbatim differs from accepted and verbatim exists (D-05)"
  - "checklist selection routing fixed at checkpoint: parseOccId + list/table query path now handle checklist:N (UIX-01 click-to-sidebar)"
metrics:
  duration: "~10 minutes + checkpoint fix"
  completed: "2026-06-08"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 5
---

# Phase 138 Plan 04: Checklist Detail Card Summary

Clicking a checklist point opens a detail card showing the accepted name with an inline `(det. as {verbatim})` annotation, collector, precision-aware Roman-numeral date, locality, collapsed-count, and a muted "Bartholomew et al. 2024" attribution. The three promoted columns are read straight off the occurrence row.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add 3 promoted columns to OccurrenceRow + OCCURRENCE_COLUMNS | cf01faf | src/filter.ts, src/tests/occurrence.test.ts |
| 2 | Extend formatRomanDate + add _renderChecklist + render() dispatch | 6463356 | src/bee-occurrence-detail.ts |
| 3 | Human-verify checklist points + detail card (visual) — APPROVED | 6d6c715 (checkpoint fix) | src/occurrence.ts, src/filter.ts, src/bee-atlas.ts |

## What Was Built

**Task 1 — promoted columns into the frontend row contract:**
- `OccurrenceRow` gains `verbatim_name: string | null`, `locality: string | null`, `collapsed_count: number | null`
- `OCCURRENCE_COLUMNS` includes all three so every occurrence query (list/table/byOccIds) fetches them — no new fetch path

**Task 2 — formatRomanDate + _renderChecklist:**
- `formatRomanDate(dateStr: string | null)`: length-10 full → `15 VI 2019`; length-7 month → `VI 2019`; length-4 year → `2019`; null/empty → `''` (turned the 3 RED Plan-01 cases GREEN)
- `_renderChecklist(row)`: accepted name (`taxonCache.get(taxon_id)`/`canonical_name`) + `(det. as {verbatim})` only when names differ → collector → Roman date → locality (omitted when null) → "Represents N collapsed records" (only N>1) → muted `Bartholomew et al. 2024` line
- `render()` routes `source === 'checklist'` rows to `_renderChecklist`

**Task 3 — human-verify checkpoint (approved) + fix:**
- Visual verification surfaced a real defect: clicking a checklist point did not populate the sidebar. Root cause: `parseOccId` had no `checklist` case (returned null), so `bee-atlas`'s selection loops dropped `checklist:N`, and the list/table query signatures had no checklist parameter. This path was never exercised before Phase 138 (checklist used the now-removed county-fill click handler).
- Fix: `parseOccId` handles `checklist:N`; `queryListPage`/`queryTablePage` accept `selectedChecklistIds` and emit a `checklist_id IN (...)` selection clause; `_runListQuery`/`_runTableQuery` collect checklist ids explicitly and count them in `hasSelection`; regression test added in occurrence.test.ts.

## Deviations from Plan

### Auto-fixed Issues
- **Task 1:** `src/tests/occurrence.test.ts` `BASE_ROW` fixture updated to include the 3 new nullable fields so the strict type check passes (no behavior change).

### Checkpoint-Surfaced Fix (Task 3)
The human-verify gate caught a click-to-sidebar regression that all automated checks had passed (it was a wiring gap, not a unit-testable contract). Fixed in commit 6d6c715 with a `parseOccId('checklist:N')` regression test. See above.

## Verification Results

- `npx tsc --noEmit`: **clean**
- `npm test -- --run src/tests/bee-occurrence-detail.test.ts`: formatRomanDate cases **GREEN**
- `npm test -- --run src/tests/occurrence.test.ts src/tests/filter.test.ts src/tests/filter-join-execution.test.ts src/tests/bee-atlas.test.ts`: **209/209 PASS**
- Human visual verification: **APPROVED** (green points render + cluster; county-fill gone; detail card layout + det. annotation correct; source toggle works; click-to-sidebar fixed and confirmed)

## Known Stubs

None.

## Threat Flags

None. Promoted columns (`verbatim_name`/`locality`) are rendered via Lit interpolation (auto-escaped); no `unsafeHTML`. No new endpoints, auth, or inputs.

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit cf01faf: FOUND (Task 1)
- Commit 6463356: FOUND (Task 2)
- Commit 6d6c715: FOUND (Task 3 checkpoint fix)
- 209 tests passing; tsc --noEmit clean
- Human-verify checkpoint: APPROVED
