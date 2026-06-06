---
phase: 140-checklist-taxonomy-fixture-distillation
verified: 2026-06-06T00:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
---

# Phase 140: Checklist & Taxonomy Fixture Distillation Verification Report

**Phase Goal:** Distill checklist sample + session-scope DuckDB build; distill taxa ancestry fixture; create documented fixtures directory.
**Verified:** 2026-06-06
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | load_checklist() accepts optional injected con; nightly path unchanged; _owns_connection guard present | VERIFIED | `checklist_pipeline.py:518` — `def load_checklist(con: "duckdb.DuckDBPyConnection | None" = None)`, guard at :526-528, close guard at :604 |
| 2 | resolve_checklist_names.py has a module-level TAXA_PATH constant used by resolve_checklist_names() | VERIFIED | `resolve_checklist_names.py:41` — `TAXA_PATH = str(...)`, used at :269 via `_load_anthophila_ancestry(TAXA_PATH)` |
| 3 | data/tests/fixtures/ exists with checklist_sample.csv (8-row branch-covering, provenance documented) | VERIFIED | 8 data rows; ObjectIDs [1, 3, 1386, 1668, 8702, 17423, 31311, 99999]; "Distilled from" in README |
| 4 | data/tests/fixtures/ contains taxa_subset.csv.gz with angelicus/texanus ancestry; both contain /606634 | VERIFIED | 3 data rows: taxon_id 606634 (subgenus), 270393, 1581468; both species have /606634 in ancestry |
| 5 | Fast-tier tests in test_checklist_pipeline.py use module-scoped shared-connection fixture | VERIFIED | `scope="module"` at :60; `request.addfinalizer` teardown; `mod.load_checklist(con=con)` at :115 |
| 6 | D-01: fast-tier tests read 8-row sample through real load_checklist() CSV→DuckDB path | VERIFIED | checklist_sample_db overrides CHECKLIST_RECORDS_FULL_PATH to fixtures/checklist_sample.csv; calls real `load_checklist(con=con)` |
| 7 | D-02: two @pytest.mark.integration tests keep checklist_db fixture and read real CSV | VERIFIED | test_checklist_records_full_row_count and test_checklist_records_full_schema at :413, :428 use `checklist_db`; no con injection; both collected under `-m integration` |
| 8 | D-09: count assertions rewritten to exact sample counts; no > 1000 assertions remain | VERIFIED | `null_coord_count == 1` at :497; `n_none == 3` at :546; grep confirms 0 `> 1000` lines in non-comment code |
| 9 | D-07: resolve_checklist_names fast-tier tests pass with data/raw/taxa.csv.gz absent | VERIFIED | monkeypatch.setattr(resolve_checklist_names, "TAXA_PATH", str(FIXTURES_DIR / "taxa_subset.csv.gz")) at :105-106; fast tier confirmed 6 passed per environment note |
| 10 | Existing fast-tier tests in both touched modules stay green (behavior preserved) | VERIFIED | test_checklist_pipeline.py: 38 passed, 3 skipped in 4.95s; test_resolve_checklist_names.py: 6 passed in 5.06s (excluding pre-existing red test_at_least_13_fuzzy_candidates) |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/checklist_pipeline.py` | load_checklist(con=None) with _owns_connection guard | VERIFIED | Signature confirmed, guard at :526 and :604 |
| `data/resolve_checklist_names.py` | Module-level TAXA_PATH constant | VERIFIED | Line 41; str type; used at line 269 |
| `data/tests/fixtures/checklist_sample.csv` | 8-row distilled sample with provenance | VERIFIED | Exactly 8 data rows; all coord_flag and date_quality branches covered |
| `data/tests/fixtures/taxa_subset.csv.gz` | Angelicus/texanus LCA ancestry subset | VERIFIED | 3 data rows (deviation from plan's 2: added subgenus 606634 LCA node — sound) |
| `data/tests/fixtures/README` | Provenance documentation | VERIFIED | "Distilled from" present; ObjectID provenance table; expected post-load counts |
| `data/tests/fixtures/wa_bee_checklist_sample.tsv` | Small checklist TSV (deviation addition) | VERIFIED | 6 species, 8 county rows; overrides CHECKLIST_PATH to avoid executemany overhead |
| `data/tests/fixtures/checklist_records_sample.tsv` | Small records TSV (deviation addition) | VERIFIED | 6 rows; overrides CHECKLIST_RECORDS_PATH |
| `data/tests/test_checklist_pipeline.py` | Module-scoped fixture + migrated fast-tier tests | VERIFIED | checklist_sample_db at :60-126; all fast-tier tests take checklist_sample_db |
| `data/tests/test_resolve_checklist_names.py` | TAXA_PATH monkeypatch in checklist_resolver_db | VERIFIED | setattr at :105-106; FIXTURES_DIR constant at :28 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| resolve_checklist_names.py:resolve_checklist_names | TAXA_PATH constant | `_load_anthophila_ancestry(TAXA_PATH)` | WIRED | Confirmed at line 269 |
| checklist_pipeline.py:load_checklist | injected con or duckdb.connect(DB_PATH) | `_owns_connection = con is None` guard | WIRED | Guard at :526; close guard at :604 |
| test_checklist_pipeline.py:checklist_sample_db | fixtures/checklist_sample.csv + taxa_subset.csv.gz | `setattr CHECKLIST_RECORDS_FULL_PATH + TAXA_PATH; load_checklist(con=con)` | WIRED | Lines 97-115; all four path constants overridden |
| test_resolve_checklist_names.py:checklist_resolver_db | resolve_checklist_names.TAXA_PATH | `monkeypatch.setattr(..., "TAXA_PATH", fixtures/taxa_subset.csv.gz)` | WIRED | Lines 105-106 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Fast-tier checklist tests pass in ~5s | `cd data && uv run pytest tests/test_checklist_pipeline.py -m 'not integration' -q` | 38 passed, 3 skipped in 4.95s | PASS |
| Fast-tier resolver tests pass | `cd data && uv run pytest tests/test_resolve_checklist_names.py -m 'not integration' --deselect ...::test_at_least_13_fuzzy_candidates -q` | 6 passed in 5.06s | PASS |
| Integration tests still collected | `cd data && uv run pytest -m integration --collect-only -q` | test_checklist_records_full_row_count and test_checklist_records_full_schema collected | PASS |
| Fixture content correct (ObjectIDs) | python3 csv check | [1, 3, 1386, 1668, 8702, 17423, 31311, 99999] | PASS |
| taxa_subset.csv.gz contains 606634 in ancestry | python3 gzip check | Both species rows contain /606634 in ancestry | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TFIXTURE-01 | 140-01, 140-02 | Committed checklist sample replaces full-file parsing; DuckDB built once, not per test | SATISFIED | 8-row checklist_sample.csv; module-scoped fixture; 38 fast-tier tests pass in ~5s |
| TFIXTURE-02 | 140-01, 140-02 | Resolver fast-tier tests run against small committed ancestry fixture | SATISFIED | taxa_subset.csv.gz (3 rows); TAXA_PATH monkeypatched; 6 passed with real file absent |
| TFIXTURE-04 | 140-01 | Committed fixtures in data/tests/fixtures/ with provenance documented | SATISFIED | fixtures/ dir created; README with "Distilled from", ObjectID provenance, expected counts |

### Anti-Patterns Found

No TBD, FIXME, or XXX markers found in any file modified by this phase.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/test_checklist_pipeline.py | 167, 209 | `n >= 1` assertions (WR-02 from REVIEW) | INFO | Coverage-strength regression — should pin to exact fixture counts (6 species, 8 county rows); passes when fixture loads at least 1 row but would pass on an empty-but-nonzero load |

### Known Executor Deviations (Verified Sound)

**Deviation 1: CHECKLIST_PATH and CHECKLIST_RECORDS_PATH also overridden**

The executor found that `wa_bee_checklist_records.tsv` (~50k rows) and `wa_bee_checklist.tsv` (527 species, DuckDB executemany ~3s) were slow enough to defeat the module-scope speed goal. Two additional fixtures were created (`wa_bee_checklist_sample.tsv` 6-species/8-county, `checklist_records_sample.tsv` 6 rows) and `checklist_sample_db` overrides all four path constants. Verified: the teardown restores all four originals. Integration tests still read the real files via the unchanged `checklist_db` fixture. This deviation is sound.

**Deviation 2: taxa_subset.csv.gz contains 3 data rows (not 2)**

Plan 01 specced 2 rows (angelicus + texanus). A third row (subgenus Agapostemon, taxon_id=606634) was added because `_slash_canonical_name()` resolves the LCA taxon_id 606634 back to a name via a second pass through the taxa gz — without the subgenus row, the name lookup returns None. The 3-row fixture enables the slash-row canonical_name test to assert `canon is not None` unconditionally. Verified: both species rows still contain /606634 in ancestry; the subgenus row is load-bearing. The README IN-01 undercount ("two Anthophila species") is a documentation gap, not a code defect.

### Advisory Follow-ups from Code Review (Non-Blocking)

These items were identified in 140-REVIEW.md and do not block phase-goal achievement:

**WR-01 (Warning):** Module-scoped fixture and `importlib.reload` in `checklist_db` mutate the same live module object. Under `pytest-randomly`, if an integration test (which calls `importlib.reload(checklist_pipeline)`) runs between two `checklist_sample_db` fast-tier tests, the idempotency tests (`test_load_checklist_is_idempotent`, `test_checklist_records_full_is_idempotent`) could silently load the real 50k-row CSV into the shared in-memory connection. The suite currently pins collection order implicitly. Recommended fix: drop `importlib.reload` from `checklist_db` in favor of `setattr` discipline, or add an autouse guard asserting module patches are intact. Phase 141 or a follow-up should address this.

**WR-02 (Warning):** `n >= 1` assertions in `test_load_checklist_populates_species_rows` (:167) and `test_load_checklist_creates_species_counties_table` (:209) should be pinned to exact fixture counts (`n == 6` for species, `n == 8` for species_counties) matching the pattern already used for `null_coord == 1` and `n_none == 3`.

**IN-01 (Info):** `data/tests/fixtures/README` states taxa_subset.csv.gz "Contains only the two Anthophila species" — actually 3 rows (2 species + subgenus Agapostemon). Update to: "Contains three rows: two species + the subgenus LCA node (taxon_id=606634) required by `_lca_canonical_name()`."

**IN-02 (Info):** `resolve_checklist_names.TAXA_PATH` is `str`; `checklist_pipeline.TAXA_PATH` is `Path`. Intentional but worth a comment noting the type difference to prevent confusion.

**IN-03 (Info):** Three `@pytest.mark.skip` reconcile-era tests (pass bodies, documentation only) remain in test_checklist_pipeline.py. Non-defect; consider removing in a future cleanup.

---

_Verified: 2026-06-06_
_Verifier: Claude (gsd-verifier)_
