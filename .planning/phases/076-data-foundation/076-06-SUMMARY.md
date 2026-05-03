---
phase: 076-data-foundation
plan: 06
subsystem: testing
tags: [pytest, duckdb, integration-tests, fixtures, monkeypatch, canonical-name, taxon-lineage]

requires:
  - phase: 076-data-foundation/02
    provides: canonical_name.canonicalize() and TARGET_RANKS contract
  - phase: 076-data-foundation/03
    provides: checklist_pipeline.load_checklist() + species table shape
  - phase: 076-data-foundation/04
    provides: enrich_taxon_lineage_extended(db_path) locked signature
  - phase: 076-data-foundation/05
    provides: _update_occurrences_canonical_name() + reconcile() + synonyms.csv/unmatched.csv flow
provides:
  - 6 integration tests covering the full checklist↔occurrences canonical_name JOIN against the seeded fixture
  - 6 integration tests for enrich_taxon_lineage_extended() with stdlib monkeypatched requests.get
  - Extended programmatic DuckDB fixture with checklist schema, taxon_lineage_extended table, taxon__id column on inaturalist_data.observations, canonical_name column on ecdysis_data.occurrences, and the disagreement seed rows (TAX-04, PITFALLS.md #1, #2)
affects: phase-077-species-aggregation, phase-080-species-page-nav

tech-stack:
  added: []
  patterns:
    - "Snapshot+restore around session-scoped fixture mutations: _snapshot_obs_state / _restore_obs_state pattern in test_taxon_lineage.py protects test_export and test_feeds from cross-file ordering hazards."
    - "Explicit column lists on fixture INSERTs: positional-VALUES inserts replaced with named-column INSERTs in conftest.py so column additions don't silently break existing seeds."

key-files:
  created:
    - data/tests/test_taxon_lineage.py
  modified:
    - data/tests/conftest.py
    - data/tests/test_checklist_pipeline.py

key-decisions:
  - "Reuse the existing test_checklist_pipeline.py file (Plan 03 created it) by APPENDING the 6 plan-required tests rather than overwriting. The new tests exercise fixture_con; the existing tests exercise the per-test checklist_db fixture. Both fixtures coexist."
  - "Snapshot/restore observation+lineage state in test_taxon_lineage.py instead of relying on alphabetical pytest collection order. This makes the tests safe regardless of which other test file runs before/after them."
  - "Use numeric-string IDs (`'7600001'`, `'7600002'`) for the new ecdysis fixture rows because export.py CASTs id to INTEGER. The plan's suggested `'p76-001'` would have broken test_occurrences_parquet_schema."
  - "Convert the existing INSERTs into ecdysis_data.occurrences and inaturalist_data.observations to use explicit column lists. Keeps positional inserts stable as new columns (canonical_name, taxon__id) are appended."

patterns-established:
  - "Snapshot/restore wrappers for tests that mutate session-scoped fixture state — finally-block restores keep cross-file pytest ordering safe without sacrificing per-test determinism."

requirements-completed: [TAX-04]

duration: ~25min
completed: 2026-05-02
---

# Phase 076 Plan 06: Integration Tests for Phase 76 Foundation Summary

**End-to-end pytest coverage of the canonical_name JOIN, synonym override flow, unmatched.csv writeback, and the iNat ancestor-walk lineage enrichment — including the load-bearing `Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum` disagreement fixture that proves TAX-04.**

## Performance

- **Duration:** ~25 minutes
- **Started:** 2026-05-03T05:50:00Z (approximately)
- **Completed:** 2026-05-03T06:14:00Z
- **Tasks:** 3 of 3 complete
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- TAX-04 satisfied — the disagreement fixture (occurrence "Lasioglossum (Dialictus) zonulum" + checklist "Lasioglossum zonulum") JOINs via canonical_name and is asserted in test_disagreement_fixture_canonical_join.
- PITFALLS.md #1 (authority strings) and #2 (trinomial fold) covered with dedicated regression tests.
- enrich_taxon_lineage_extended() integration-tested against the existing session-scoped `fixture_db` path string — Plan 04's locked `def enrich_taxon_lineage_extended(db_path: str | None = None) -> None` signature is unchanged.
- Full pytest suite green: 80 passed (was 68 before this plan).
- Locked phase-test command exits 0: `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py` → 20 passed.

## Task Commits

1. **Task 1: extend conftest.py with checklist + extended-lineage fixtures** — `cfb0188` (test)
2. **Task 2: add disagreement + reconcile integration tests** — `6e57d05` (test)
3. **Task 3: add enrich_taxon_lineage_extended integration tests** — `a206183` (test)

## Files Created / Modified

- `data/tests/conftest.py` — Added `checklist_data` schema; new tables `checklist_data.species`, `checklist_data.species_counties`, `inaturalist_data.taxon_lineage_extended`; `taxon__id BIGINT` on `inaturalist_data.observations`; `canonical_name VARCHAR` on `ecdysis_data.occurrences`; converted two existing INSERTs to explicit-column form; seeded the disagreement fixtures (TAX-04, PITFALLS.md #1 and #2) plus 2 extended-lineage rows (one fully populated, one NULL subgenus for TAX-03).
- `data/tests/test_checklist_pipeline.py` — Appended 6 integration tests covering TAX-04, PITFALLS.md #1, #2, CHECK-05 (synonym override + unmatched), and D-05 (warn-only + header). The 8 prior Plan-03 tests still run unchanged.
- `data/tests/test_taxon_lineage.py` — NEW. 6 tests covering TAX-01 (5-rank harvest), TAX-03 (NULL emission, no sentinel), D-03 (UNION over both observation tables), the empty-input short-circuit, and the batch_size=30 invariant. Uses `monkeypatch.setattr(requests, 'get', stub)` — no pytest-mock dependency.

## Decisions Made

- **Coexist with the Plan 03 test_checklist_pipeline.py file** rather than overwrite — both the existing `checklist_db`-scoped tests and the new `fixture_con`-scoped tests run together (14 total tests in that file).
- **Snapshot+restore around fixture mutations** in test_taxon_lineage.py so the tests are insensitive to pytest collection order. The session-scoped `fixture_con` and `fixture_db` share the same DB file; the function under test issues `CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended`, which would otherwise mutate the schema visible to other test files. The restore code drops and rebuilds the table to its seeded shape and reinserts the original rows.
- **Numeric-string IDs (`'7600001'`, `'7600002'`)** instead of the plan's suggested `'p76-001'` for the new ecdysis fixture rows. `export.py:59` does `CAST(o.id AS INTEGER)` and would otherwise raise a ConversionException on the export-suite tests (caught immediately by the regression run; documented as a Rule 1 deviation below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-numeric ecdysis fixture IDs broke test_export**

- **Found during:** Task 1 (extend conftest.py)
- **Issue:** The plan suggested `id = 'p76-001'` and `'p76-002'` for the new `ecdysis_data.occurrences` rows. test_occurrences_parquet_schema (test_export.py) failed with `_duckdb.ConversionException: Could not convert string 'p76-001' to INT32 when casting from source column id` because `export.py:59` casts `o.id` to INTEGER.
- **Fix:** Changed the IDs to numeric strings (`'7600001'`, `'7600002'`) — still in the per-task `p76-*` namespace via the catalog_number values (`'CAT-p76-1'`, `'CAT-p76-2'`) and the `_dlt_load_id`/`_dlt_id` (`'load-p76'`, `'dlt-p76-1'`). PRIMARY-KEY collisions with existing test_export rows verified absent (existing IDs: `'5594569'`).
- **Files modified:** data/tests/conftest.py
- **Verification:** Re-ran `uv run pytest tests/` — all 68 baseline tests passed.
- **Committed in:** cfb0188 (Task 1 commit)

**2. [Rule 2 - Critical functionality] Snapshot+restore around session-scoped fixture mutations**

- **Found during:** Task 3 design
- **Issue:** The plan said "Each test should DELETE+INSERT in `inaturalist_data.observations` / `inaturalist_waba_data.observations`". Doing so without restore would silently break test_export and test_feeds (both depend on the seeded iNat observation row 999999 / WABA observation 777777) whenever pytest collection order placed test_taxon_lineage.py before them.
- **Fix:** Added `_snapshot_obs_state` / `_restore_obs_state` helpers and wrapped every test that mutates state in `try/finally`. The restore drops and rebuilds `inaturalist_data.taxon_lineage_extended` to its seeded shape because the function under test issues `CREATE OR REPLACE TABLE`, which would otherwise persist a different (PRIMARY-KEY-bearing) shape across the session.
- **Files modified:** data/tests/test_taxon_lineage.py
- **Verification:** Full suite green — 80 passed in 13.45s, including all of test_export.py and test_feeds.py.
- **Committed in:** a206183 (Task 3 commit)

**3. [Rule 1 - Bug] `fixture_db_path` substring leaked into the docstring**

- **Found during:** Task 3 acceptance-criteria check
- **Issue:** The acceptance criterion `grep -c fixture_db_path data/tests/test_taxon_lineage.py` must return 0; the initial docstring referenced the forbidden name when explaining why we don't introduce it.
- **Fix:** Reworded the docstring to describe what we do (use `fixture_db` directly) instead of what we don't do.
- **Files modified:** data/tests/test_taxon_lineage.py
- **Verification:** `grep -c fixture_db_path data/tests/test_taxon_lineage.py` → 0.
- **Committed in:** a206183 (Task 3 commit, applied before commit was finalized)

## Authentication Gates

None.

## Verification

### Automated

- `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py -v` → **20 passed in 14.01s**
- `cd data && uv run pytest tests/` → **80 passed in 13.45s** (was 68 before this plan).
- `grep -c fixture_db_path data/tests/test_taxon_lineage.py` → **0** ✅
- `grep -c "fixture_db" data/tests/test_taxon_lineage.py` → **12** ✅ (≥ 5 required)
- `grep -c "enrich_taxon_lineage_extended(db_path=fixture_db)" data/tests/test_taxon_lineage.py` → **5** ✅ (≥ 4 required)
- `git diff data/inaturalist_pipeline.py` → empty ✅ (Plan 04's signature unchanged)

### Locked test command output (verbatim, condensed)

```
============================= test session starts ==============================
collecting ... collected 20 items

tests/test_checklist_pipeline.py::test_load_checklist_creates_species_table_with_expected_schema PASSED [  5%]
tests/test_checklist_pipeline.py::test_load_checklist_populates_species_rows PASSED [ 10%]
tests/test_checklist_pipeline.py::test_load_checklist_canonical_name_matches_canonicalize PASSED [ 15%]
tests/test_checklist_pipeline.py::test_load_checklist_genus_and_specific_epithet_split PASSED [ 20%]
tests/test_checklist_pipeline.py::test_load_checklist_creates_species_counties_table PASSED [ 25%]
tests/test_checklist_pipeline.py::test_load_checklist_source_citation_set PASSED [ 30%]
tests/test_checklist_pipeline.py::test_load_checklist_is_idempotent PASSED [ 35%]
tests/test_checklist_pipeline.py::test_load_checklist_unset_columns_are_null PASSED [ 40%]
tests/test_checklist_pipeline.py::test_disagreement_fixture_canonical_join PASSED [ 45%]
tests/test_checklist_pipeline.py::test_authority_bearing_canonicalizes_to_binomial PASSED [ 50%]
tests/test_checklist_pipeline.py::test_trinomial_subspecies_folds_to_binomial PASSED [ 55%]
tests/test_checklist_pipeline.py::test_reconcile_synonym_override_updates_checklist PASSED [ 60%]
tests/test_checklist_pipeline.py::test_reconcile_unmatched_warn_only PASSED [ 65%]
tests/test_checklist_pipeline.py::test_reconcile_unmatched_csv_header PASSED [ 70%]
tests/test_taxon_lineage.py::test_target_ranks_constant PASSED           [ 75%]
tests/test_taxon_lineage.py::test_enrich_writes_all_five_ranks PASSED    [ 80%]
tests/test_taxon_lineage.py::test_enrich_emits_null_subgenus_not_sentinel PASSED [ 85%]
tests/test_taxon_lineage.py::test_enrich_unions_inat_and_waba_taxa PASSED [ 90%]
tests/test_taxon_lineage.py::test_enrich_handles_no_taxa PASSED          [ 95%]
tests/test_taxon_lineage.py::test_enrich_batches_at_30 PASSED            [100%]

============================= 20 passed in 14.01s ==============================
```

### Plan-required confirmations

- The existing `fixture_db` fixture (path string from `tmp_path_factory`) is used directly in test_taxon_lineage.py — no parallel `fixture_db_path` fixture is introduced.
- `data/inaturalist_pipeline.py` is NOT modified by this plan (`git diff data/inaturalist_pipeline.py` is empty). Plan 04's `enrich_taxon_lineage_extended(db_path: str | None = None) -> None` signature is preserved.
- `taxon__id BIGINT` was added to the existing `inaturalist_data.observations` CREATE TABLE block in conftest.py (line ~78) so Plan 04's UNION query compiles against the fixture. The waba sibling table already had `taxon__id BIGINT`; this brings the inat table to parity.
- Existing tests required modification ONLY to use explicit column lists in their INSERT statements (zero behavior change, just keeps positional inserts stable as columns are added). Two INSERT statements were converted: `ecdysis_data.occurrences` (lines ~143 area) and `inaturalist_data.observations` (lines ~166 area).
- No fixture seed row collided with existing test_export PRIMARY KEY values (`scientificName` PK on checklist_data.species: existing rows are NONE; new rows: `'Lasioglossum zonulum'`, `'Andrena fulva (Müller, 1766)'`, `'Bombus melanopygus'` — no collision possible). Existing ecdysis seed: id `'5594569'`; new rows: id `'7600001'`, `'7600002'` — no collision.

## Final Test Counts

| File | Tests | Notes |
|------|-------|-------|
| data/tests/test_checklist_pipeline.py | 14 | 8 from Plan 03 + 6 added in this plan |
| data/tests/test_taxon_lineage.py | 6 | All new in this plan |
| data/tests/conftest.py | n/a | Extended (no test functions) |
| **Total Phase 76 tests added by this plan** | **12** | |
| Full data suite total | 80 | Was 68 before this plan |

## Self-Check: PASSED

- File created: `data/tests/test_taxon_lineage.py` — FOUND
- File modified: `data/tests/conftest.py` — present in commit cfb0188
- File modified: `data/tests/test_checklist_pipeline.py` — present in commit 6e57d05
- Commit cfb0188: FOUND
- Commit 6e57d05: FOUND
- Commit a206183: FOUND
- Locked test command exit 0: VERIFIED
- Full pytest suite green: VERIFIED
- `git diff data/inaturalist_pipeline.py` empty: VERIFIED
- `grep -c fixture_db_path data/tests/test_taxon_lineage.py` == 0: VERIFIED
