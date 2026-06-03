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
  - "Human-verify APPROVED 2026-06-03; dev-mode timing (658 ms boot / 1150 ms data-loaded) recorded as not comparable to ~250 ms v4.3 prod baseline; change structurally cannot regress boot path (D-08)"
  - "Bug found at human-verify gate: ambiguous taxon_id after taxa JOIN; fixed in 01acf1e with execution-level test (filter-join-execution.test.ts)"
metrics:
  duration: "~15 minutes (plan) + human-verify cycle (bug fix)"
  completed_date: "2026-06-03"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
requirements_completed: [NORM-02]
---

# Phase 131 Plan 04: NORM-02 Measurement + Phase Gate Summary

**One-liner:** Recorded 14.2% DB-size and 9.5% gzip-weight reduction from dropping 4 denormalized rank columns, confirmed grep audit clean, phase gate green, human-verify APPROVED; the verify gate caught and fixed an ambiguous-`taxon_id` runtime regression (commit `01acf1e`).

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

Task 2 (checkpoint:human-verify): **APPROVED** by the human reviewer (2026-06-03). The reviewer
confirmed the DB-size win, recorded dev-mode load timing, and verified table/list/detail/map
rendering with a taxon filter active. The verify gate also caught a runtime regression that the
string-only unit tests missed (ambiguous `taxon_id` after the taxa JOIN) — fixed before approval
in commit `01acf1e` (see "Bug Found & Fixed at the Verify Gate" below).

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

## Human-Verify Outcome

**Verdict: APPROVED** (2026-06-03). Visual/functional checks all PASS:

- Table & list views render with a taxon filter active; Species column shows resolved names /
  "No Determination" (never blank).
- Provisional detail card shows the taxon name.
- Map renders points with correct recency styling + source badges — confirms the geo_blob
  source-at-index-6 decode (T-131-06 mitigated, Pitfall 1).

**Timing:** observed `worker boot (main-thread wall time) = 658 ms` and end-to-end
`data-loaded (loading screen lifted) = 1150 ms`, both in the **dev** build. Dev-mode timing is
NOT comparable to the ~250 ms v4.3 production baseline (Vite dev middleware + cold WASM compile +
uncompressed serving inflate it). The change structurally cannot regress `tablesReady`: the
occurrences.db is smaller (26.7 → 22.9 MB) and the taxa JOIN + lazy taxa-cache are off the boot
path (D-08). The production apples-to-apples figure was not captured — flagged as an optional,
non-blocking follow-up.

---

## Bug Found & Fixed at the Verify Gate

The human-verify checkpoint caught a runtime regression invisible to the string-only unit tests:

```
List query failed: Error: ambiguous column name: taxon_id
```

**Root cause:** Plan 131-02's `LEFT JOIN taxa t` put `taxon_id` in scope from both `occurrences`
and `taxa`, so the shared `buildFilterSQL` clause's unqualified `taxon_id` was ambiguous in the
list/table/CSV queries whenever a taxon filter was active. The string-only unit tests never
execute against a two-table schema, so they missed it.

**Fix (commit `01acf1e`):** `buildFilterSQL` now emits `o.taxon_id` (documented "occurrences AS o"
consumer invariant) and the four non-JOIN consumers alias `occurrences o`. Added
`src/tests/filter-join-execution.test.ts`, which runs the real query functions against a
`node:sqlite` engine seeded with both tables — closing the gap the string-only tests left.

**Post-fix gates:** `npm test` 574 pass · `npm run typecheck` exit 0 · `bash data/dbt/run.sh build` exit 0.

---

## Deviations from Plan

None on Task 1. The pre-change baseline was available in `public/data/occurrences.db` as stated
in the wave context — it had been generated before the Plan 03 dbt changes landed. No
reconstruction from git was needed. On Task 2, the verify gate surfaced a runtime bug in
prior-plan code (131-02), fixed under deviation Rule 1 (auto-fix bug) before approval — see above.

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
| `npm test` | PASS — 574 tests, 24 files (post-fix; +4 from filter-join-execution suite) |
| `npm run typecheck` | PASS — exits 0 |
| `bash data/dbt/run.sh build` | PASS — exits 0 |

---

## Known Stubs

None. The former `tablesReady` placeholder row in VERIFICATION.md is now filled with the observed
dev figures (658 ms boot / 1150 ms data-loaded) and an explicit note on why dev timing is not
comparable to the v4.3 prod baseline.

---

## Threat Flags

None. This plan only measures artifacts and writes a documentation file. No new runtime surface.

---

## Self-Check: PASSED

- [x] `.planning/phases/131-occurrence-normalization/131-VERIFICATION.md` exists
- [x] Commit `66b327d` exists (Task 1 measurement)
- [x] Commit `01acf1e` exists (Task 2 verify-gate bug fix)
- [x] `src/tests/filter-join-execution.test.ts` exists
- [x] VERIFICATION.md contains "occurrences.db" and reduction/delta/smaller language
- [x] VERIFICATION.md records the human-verify APPROVED verdict and the bug-found-and-fixed note
- [x] Post-fix gates re-run: `npm test` 574 pass
