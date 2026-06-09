---
title: Phase 144 code-review deferred items (WR-04 CSV-export headers + 3 info)
priority: low
source: phase-144-code-review
created: 2026-06-09
---

Deferred, non-blocking findings from the Phase 144 code review
(`.planning/phases/144-map-init-readiness/144-REVIEW.md`). The critical (CR-01) and the
`_filterResolving` reactivity cluster (WR-01/02/03) were fixed at phase close in commit
`01760e5`. These remaining items are pre-existing or cosmetic and out of Phase 144's scope.

## WR-04 — CSV export headers derived from `rows[0]`

`src/bee-atlas.ts` (CSV export path): column headers are taken from the first row's keys.
If `rows[0]` is missing a nullable column that later rows carry (or vice versa), the export
header set is incomplete/misaligned. Latent data-integrity issue in a file Phase 144 touched
but did not introduce. Fix: derive the header set from a fixed column contract, not `rows[0]`.

## Info items

- **Dead `_selectionDrawnGeneration` counter** in `src/bee-atlas.ts` — declared/incremented
  but never read. Remove.
- **Duplicated county/ecoregion DISTINCT queries** run twice per boot (once in
  `_loadSummaryFromSQLite`, once elsewhere on the data-load path). Consolidate to one.
- **`[BENCHMARK]` `console.log`** left on the boot path. Remove or gate behind a debug flag.

See `144-REVIEW.md` for full finding detail (CR-01 / WR-01..04 / info), now marked
`status: resolved` with these four carried here.
