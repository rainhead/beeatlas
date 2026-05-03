---
phase: 076-data-foundation
plan: 01
subsystem: data-pipeline
tags: [checklist, provenance, requirements-amendment, csv-schema]

# Dependency graph
requires: []
provides:
  - data/checklists/wa_bee_checklist.tsv (verbatim Bartholomew et al. 2024 WA bee checklist; 1 header + 2,861 (species, county) rows)
  - data/checklists/README.md (provenance + format documentation)
  - data/checklist_synonyms.csv (header-only D-05 override table; checklist_name,canonical_name,source)
  - REQUIREMENTS.md amendments: CHECK-01 (.csv → .tsv) and CHECK-03 (status enum footnote)
affects: [076-03 (load_checklist reads the TSV), 076-05 (reconcile reads synonyms.csv), 076-06 (integration tests load the TSV via fixtures), 077 species aggregation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checklist source data committed verbatim with sibling README documenting provenance, format, and load contract"
    - "Header-only seed CSV pattern for reviewer-curated override tables"

key-files:
  created:
    - data/checklists/wa_bee_checklist.tsv
    - data/checklists/README.md
    - data/checklist_synonyms.csv
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Honored D-01 verbatim-copy rule even when actual line count (2,862 = 1 header + 2,861 data) differed from plan's verify command (2,863). Source data is authoritative."

patterns-established:
  - "Static-asset provenance README: cite (author, year, journal, DOI) inline + document file format + name the loader function + record any conventions (status enum policy)"
  - "Header-only seed for reviewer-curated CSVs: ship one line, no example/comment rows, no BOM, trailing newline"

requirements-completed: [CHECK-01]

# Metrics
duration: ~10min
completed: 2026-05-03
---

# Phase 076 Plan 01: Data Foundation Static Assets Summary

**Committed Bartholomew 2024 WA bee checklist TSV verbatim (2,861 county-records) with provenance README, seeded the D-05 synonyms.csv override table header-only, and amended REQUIREMENTS.md to ratify Phase 76 decisions D-01 (.csv→.tsv) and D-02 (status-enum footnote).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-03T05:24:xxZ (worktree start)
- **Completed:** 2026-05-03T05:33:38Z
- **Tasks:** 4
- **Files modified:** 4 (3 created, 1 amended)

## Accomplishments

- Source data landed: `data/checklists/wa_bee_checklist.tsv` (1 header + 2,861 data rows; 527 unique species; 39 unique counties; tab-delimited; bare binomials).
- Provenance documented with full citation, DOI, file format table, manual-extraction note, loader contract, and v3.2 status convention.
- Reviewer override surface ready: `data/checklist_synonyms.csv` matches the D-05 three-column schema, header-only.
- REQUIREMENTS.md kept in sync with locked Phase 76 decisions (CHECK-01 path corrected; CHECK-03 status footnote added; total requirement count unchanged at 67).

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit checklist TSV verbatim** — `234a513` (feat)
2. **Task 2: Write data/checklists/README.md (provenance)** — `a4fe855` (docs)
3. **Task 3: Seed checklist_synonyms.csv (header-only)** — `d28f6de` (feat)
4. **Task 4: Amend REQUIREMENTS.md (D-01, D-02)** — `97c7901` (docs)

## Files Created/Modified

- `data/checklists/wa_bee_checklist.tsv` — verbatim copy of `~/Downloads/washington_bees(3).tsv`; the WA bee checklist source data consumed by Plan 076-03's `load_checklist()`.
- `data/checklists/README.md` — provenance, format table, manual-extraction note, loader contract (`data/checklist_pipeline.py::load_checklist()`), and v3.2 status convention (`verified` only per D-02).
- `data/checklist_synonyms.csv` — header-only override table for checklist↔occurrence name reconciliation (read by Plan 076-05's `reconcile()`).
- `.planning/REQUIREMENTS.md` — CHECK-01 path: `.csv` → `.tsv` (D-01); CHECK-03 status enum: footnote noting v3.2 only populates `verified` (D-02).

## Decisions Made

- **Verbatim source over plan numerology.** D-01 mandates a byte-identical copy of the upstream TSV. The plan's verify command anticipated `wc -l = 2863` (1 header + 2,862 data); the actual source has `wc -l = 2862` (1 header + 2,861 data). Per D-01 the source data is authoritative; the README and SUMMARY accurately report 2,861 data rows. The plan's expected count was an off-by-one anticipation, not an upstream defect — the file is committed verbatim. This is documented as Rule 1 below.
- README's `## File format` table includes both "Total lines" (2,862) and "Data rows" (2,861) so future readers can reconcile either count quickly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan/Source Discrepancy] Source TSV has 2,862 total lines, not 2,863 as plan verify expected**
- **Found during:** Task 1 (Commit checklist TSV verbatim)
- **Issue:** Plan's `<verify><automated>` asserted `wc -l = 2863` and acceptance criteria expected "1 header + 2,862 data rows". The actual source file `~/Downloads/washington_bees(3).tsv` has 2,862 total lines (1 header + 2,861 data rows; 527 unique species; 39 counties — all other shape assertions match exactly).
- **Fix:** Honored D-01 ("commit verbatim, byte-identical to source"); did NOT add a row to fake the count. README accurately reports both totals (2,862 lines / 2,861 data rows). Documented in commit message and here.
- **Files modified:** data/checklists/wa_bee_checklist.tsv (committed verbatim, no edits), data/checklists/README.md (reports actual counts).
- **Verification:** `wc -l data/checklists/wa_bee_checklist.tsv` → 2,862; `awk -F'\t' 'NR==2 {print NF}'` → 2; first line is `species\tcounty`; unique species 527; unique counties 39.
- **Committed in:** `234a513` (Task 1) and `a4fe855` (Task 2 README reflects actual numbers)

---

**Total deviations:** 1 auto-fixed (Rule 1 plan/source numerology drift)
**Impact on plan:** Cosmetic only — the verbatim file is the single source of truth per D-01, downstream consumers (Plans 03/05/06) load by row, not by hardcoded count. No scope creep; no functional impact.

## Issues Encountered

None beyond the documented Rule 1 deviation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 076-02 (TDD canonicalize()):** Independent — runs in parallel in Wave 1. No dependency on this plan.
- **Plan 076-03 (`checklist_pipeline.py::load_checklist`):** Reads `data/checklists/wa_bee_checklist.tsv`. Source file is now committed.
- **Plan 076-05 (`reconcile`):** Reads `data/checklist_synonyms.csv`. Header-only seed is now committed; reviewer additions land in subsequent commits.
- **Plan 076-06 (integration tests):** Will fixture-load the committed TSV.

No blockers. All Wave-1 deliverables for Plan 01 are in place.

## Self-Check: PASSED

Verified:

- `data/checklists/wa_bee_checklist.tsv` exists (2,862 lines, header `species\tcounty`, 2 columns).
- `data/checklists/README.md` exists; contains "Bartholomew", DOI `10.3897/jhr.97.129013`, "2,862", "verified", "likely-to-occur"; all five required H2 sections present.
- `data/checklist_synonyms.csv` exists; exactly 1 line; header `checklist_name,canonical_name,source`; ASCII (no BOM).
- `.planning/REQUIREMENTS.md` contains `wa_bee_checklist.tsv` (1 occurrence), zero occurrences of `wa_bee_checklist.csv`, and both halves of the D-02 footnote on CHECK-03; total requirement count unchanged at 67.
- All four task commits found in `git log`: `234a513`, `a4fe855`, `d28f6de`, `97c7901`.

---
*Phase: 076-data-foundation*
*Plan: 01*
*Completed: 2026-05-03*
