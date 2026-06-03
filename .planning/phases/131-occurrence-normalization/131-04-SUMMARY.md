---
phase: 131-occurrence-normalization
plan: "04"
subsystem: data/pipeline/measurement
tags: [norm-02, verification, measurement, grep-audit, phase-gate]
dependency_graph:
  requires: [131-03]
  provides: [NORM-02 measurement record, phase-gate green confirmation]
  affects: [131-VERIFICATION.md]
tech_stack:
  added: []
  patterns: [record-only measurement, grep audit, phase gate]
key_files:
  created:
    - .planning/phases/131-occurrence-normalization/131-VERIFICATION.md
  modified: []
decisions:
  - "D-05 honored: no automated size gate added; measurement recorded manually in VERIFICATION.md"
  - "Pre-change baseline confirmed from pre-existing public/data/occurrences.db (modified 12:50 PDT, before 18:33 PDT dbt column-drop commits)"
  - "Post-change occurrences.db regenerated via dbt build (PASS=61) + sqlite_export"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-06-02"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
requirements_completed: [NORM-02]
---

# Phase 131 Plan 04: NORM-02 Measurement + Phase Gate Summary

**One-liner:** Recorded 14.2% DB-size and 9.5% gzip-weight reduction from dropping 4 denormalized rank columns, confirmed grep audit clean, phase gate green; human verification pending for tablesReady timing.

---

## What Was Built

Task 1 (auto): Regenerated `occurrences.db` with the 33-column post-change schema and captured
the before/after measurements in `131-VERIFICATION.md`. The pre-change baseline was the file
already present in `public/data/` (modified before the dbt column-drop commits). The post-change
artifact was produced by running `bash data/dbt/run.sh build` followed by the sqlite export step.

The grep audit confirms zero live occurrences-mart readers of the 4 dropped column names
(`scientificName`, `genus`, `family`, `specimen_inat_taxon_name`) remain in non-test `src/`.
All remaining matches are: comments, checklist.parquet reads (out-of-scope), rank label constants,
or CSS class names.

Phase gate confirmed green: `npm test` (570 tests), `npm run typecheck`, and
`bash data/dbt/run.sh build` (PASS=61 WARN=1 ERROR=0) all exit 0.

Task 2 (checkpoint:human-verify): Awaiting human browser verification of tablesReady timing,
Species column name rendering, provisional name rendering, and map source/recency badges.

---

## Measurements Recorded

| Metric | Pre-change | Post-change | Reduction |
|--------|-----------|-------------|-----------|
| DB byte size | 28,024,832 bytes | 24,043,520 bytes | 3,981,312 bytes (14.2%) |
| Gzip transfer weight | 4,494,687 bytes | 4,069,006 bytes | 425,681 bytes (9.5%) |
| `occurrences` table columns | 37 | 33 | 4 dropped |
| `geo_blob` fields per row | 10 | 7 | 3 strings dropped |
| Row count | 77,744 | 77,744 | unchanged |

---

## Deviations from Plan

None. The pre-change baseline was available in `public/data/occurrences.db` as stated in the
wave context — it had been generated before the Plan 03 dbt changes landed. No reconstruction
from git was needed. Measurement was taken directly per the RESEARCH.md procedure.

---

## Baseline Method (per VERIFICATION.md honesty requirement)

The pre-change `occurrences.db` was present in `public/data/` with timestamp 2026-06-02 12:50
PDT. The dbt column-drop commit (`abe60fa`) landed at 18:33 PDT the same day. The file was
therefore definitively pre-change: its schema shows 37 columns including `scientificName`,
`genus`, `family`, and `specimen_inat_taxon_name`.

---

## Grep Audit Summary

Zero live occurrences-mart readers of the 4 dropped column names remain. All remaining matches
in non-test `src/` are documented and expected:
- `bee-map.ts` lines 733–744: `checklist.parquet` reads (separate artifact, out-of-scope per RESEARCH.md)
- `features.ts:16`: Phase 131 change documentation comment
- `url-state.ts:7`: comment documenting legacy URL format
- `spa-link.ts:17,25`: function parameter name for URL link generation

---

## Phase Gate

| Check | Result |
|-------|--------|
| `npm test` | PASS — 570 tests, 23 files |
| `npm run typecheck` | PASS — exits 0 |
| `bash data/dbt/run.sh build` | PASS — PASS=61 WARN=1 ERROR=0 |

---

## Known Stubs

None. VERIFICATION.md has a placeholder row for the human-supplied `tablesReady` value —
this is intentional design (it requires a browser measurement) and is documented as pending
in the checkpoint task.

---

## Threat Flags

None. This plan only measures artifacts and writes a documentation file. No new runtime surface.

---

## Self-Check: PASSED

- [x] `.planning/phases/131-occurrence-normalization/131-VERIFICATION.md` exists
- [x] Commit `66b327d` exists
- [x] VERIFICATION.md contains "occurrences.db"
- [x] VERIFICATION.md contains reduction/delta/smaller language
- [x] Automated verify: `test -f ... && grep -q "occurrences.db" ... && grep -qiE "reduction|smaller|delta" ...` → PASSED
