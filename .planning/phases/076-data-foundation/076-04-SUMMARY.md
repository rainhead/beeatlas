---
phase: 076-data-foundation
plan: 04
subsystem: data-pipeline

tags: [data-pipeline, taxonomy, inat-api, duckdb, ancestor-walk]

requires:
  - phase: 076-data-foundation
    provides: "inaturalist_data.observations + inaturalist_waba_data.observations populated by Plans 02 (Wave 1) and prior phases — the UNION source for the new ancestor walk"
provides:
  - "enrich_taxon_lineage_extended() in data/inaturalist_pipeline.py: full iNat ancestor walk over the UNION of inaturalist_data and inaturalist_waba_data taxon IDs"
  - "inaturalist_data.taxon_lineage_extended table (6 cols: taxon_id BIGINT PK, family, subfamily, tribe, genus, subgenus)"
  - "STEPS slot ('taxon-lineage-extended', enrich_taxon_lineage_extended) in data/run.py, sequenced AFTER waba and BEFORE projects/anti-entropy/checklist"
affects: [phase-077-species-aggregation, phase-080-nav]

tech-stack:
  added: []
  patterns:
    - "Standalone STEP-style enrichment callback (single-arg db_path, defaults to module DB_PATH)"
    - "iNat v2 /v2/taxa/{ids} batched ancestor lookup with batch_size=30 (mirrors waba_pipeline.py:131-136)"
    - "TARGET_RANKS set membership filter on JSON-derived rank values to constrain dict keys (T-76-07 mitigation)"

key-files:
  created:
    - data/tests/test_taxon_lineage_extended.py
  modified:
    - data/inaturalist_pipeline.py
    - data/run.py

key-decisions:
  - "Function lives in inaturalist_pipeline.py per D-03; call site is a standalone STEP in run.py (not invoked from inside load_observations) so it runs AFTER waba per RESEARCH.md ASCII diagram"
  - "NULL emitted for absent ranks (no '(no subgenus)' sentinel) — TAX-03 phantom-node guard"
  - "Existing waba_pipeline.py:enrich_taxon_lineage left byte-identical; the narrower inaturalist_waba_data.taxon_lineage table coexists with the new wider table (consolidation deferred to v3.3+ per CONTEXT.md deferred ideas)"

patterns-established:
  - "Pattern: enrichment functions accept optional db_path that defaults to module-level DB_PATH so they are STEPS-callable (no args)"
  - "Pattern: rank-keyed dict constructed from {r: None for r in TARGET_RANKS} before walking ancestors guarantees NULL for absent ranks without conditional sentinel logic"

requirements-completed: [TAX-01, TAX-02, TAX-03]

duration: 4m
completed: 2026-05-03
---

# Phase 076 Plan 04: enrich_taxon_lineage_extended Summary

**Full iNat ancestor walk into a 6-column inaturalist_data.taxon_lineage_extended table, sourced from the DISTINCT NOT NULL UNION of both observation tables and slotted into run.py STEPS immediately after waba.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-03T05:48:53Z
- **Completed:** 2026-05-03T05:52:39Z
- **Tasks:** 2 (Task 1 split into TDD red+green commits)
- **Files modified:** 2 (+ 1 new test file)

## Accomplishments

- New `enrich_taxon_lineage_extended(db_path=None)` function in `data/inaturalist_pipeline.py` writes the 6-column extended-lineage table demanded by TAX-01.
- Source taxon IDs are the **DISTINCT NOT NULL UNION** of `inaturalist_data.observations.taxon__id` and `inaturalist_waba_data.observations.taxon__id` per D-03.
- STEPS list in `data/run.py` now contains `("taxon-lineage-extended", enrich_taxon_lineage_extended)` immediately after `("waba", load_waba_observations)` — the load-bearing ordering constraint from RESEARCH.md lines 127–137.
- 8 mock-based unit tests (`tests/test_taxon_lineage_extended.py`) cover schema, UNION semantics, NULL-vs-sentinel for missing ranks, PRIMARY KEY rejection, idempotency, no-op-on-empty path, and "taxon's own rank is target" branch.

## Task Commits

1. **Task 1 RED:** `4629017` (test) — `test(076-04): add failing tests for enrich_taxon_lineage_extended`
2. **Task 1 GREEN:** `ac9d151` (feat) — `feat(076-04): add enrich_taxon_lineage_extended to inaturalist_pipeline`
3. **Task 2:** `709ac2c` (feat) — `feat(076-04): wire taxon-lineage-extended STEP into run.py after waba`

## Files Created/Modified

- `data/inaturalist_pipeline.py` (modified) — added `import duckdb`, `import requests`, `TARGET_RANKS = {family, subfamily, tribe, genus, subgenus}`, and `enrich_taxon_lineage_extended()` (~85 LOC). `load_observations()` and `inaturalist_source()` are byte-identical to their pre-Plan-04 state.
- `data/run.py` (modified) — added one import line and one STEPS tuple. No changes to `_apply_migrations()` or any other existing line.
- `data/tests/test_taxon_lineage_extended.py` (created) — 8 mock-based tests, isolated tmp_path DuckDB, no real iNat API calls.

## Final Pipeline Ordering

After this plan + Plan 03 (already landed in Wave 2), `data/run.py` STEPS contains 10 entries:

```
ecdysis → ecdysis-links → inaturalist → waba → taxon-lineage-extended
       → projects → anti-entropy → checklist → export → feeds
```

Invariant satisfied: `taxon-lineage-extended` immediately follows `waba`, so the UNION query observes taxa from both pipelines.

## Verification Notes

- Test command: `cd data && uv run pytest` — **60/60 passed** (all 8 new tests + 52 pre-existing).
- `cd data && uv run python -c "from inaturalist_pipeline import enrich_taxon_lineage_extended, TARGET_RANKS; assert TARGET_RANKS == {'family', 'subfamily', 'tribe', 'genus', 'subgenus'}"` exits 0.
- `cd data && uv run python -c "import run; names=[s[0] for s in run.STEPS]; assert names[names.index('taxon-lineage-extended')-1] == 'waba'"` exits 0.
- **No real run executed** in this worktree: a real `cd data && uv run python run.py` against the production DuckDB requires fresh iNat API access and a populated DB — the nightly cron on maderas will produce the first row count post-merge. Mock-based tests confirm the function shape and behavior; the v2 endpoint shape and batch_size are byte-for-byte mirrors of the proven `waba_pipeline.py:enrich_taxon_lineage` (which already runs successfully in production).
- `git diff` shows `data/waba_pipeline.py` is **byte-identical** to its pre-Plan-04 state (D-03 invariant satisfied).
- `git diff` shows `data/inaturalist_pipeline.py::load_observations()` is unchanged (only imports and a new function appended before `if __name__ == "__main__":`).

## Decisions Made

- **STEPS-callable signature.** `enrich_taxon_lineage_extended(db_path: str | None = None)` — the optional default lets `run.py` register it as a zero-arg STEPS callback while still permitting tests to inject a tmp_path DB.
- **Standalone STEP, not load_observations call site.** Resolves the ordering tension flagged by pattern-mapper: D-03 says "function lives in inaturalist_pipeline.py" and "must run after WABA". Calling it from inside `load_observations()` would run it BEFORE WABA (because `inaturalist` STEP precedes `waba`). Resolution is to keep the function definition in `inaturalist_pipeline.py` per D-03 and slot the call as a separate STEP after `waba`. `load_observations()` semantics unchanged.
- **NULL emission via dict prefill.** `row = {r: None for r in TARGET_RANKS}` then conditional fill from ancestor walk avoids any branch that could substitute a sentinel string. This is the literal TAX-03 guard.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The standalone-STEP resolution caused no unexpected breakage — all 60 pre-existing + new tests pass, `import run` succeeds, and STEPS ordering is verifiable by introspection.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 77 species aggregation** (downstream consumer) can now COALESCE `inaturalist_data.taxon_lineage_extended` with `checklist_data.species` (Plan 03's table) on the canonical_name JOIN key per TAX-02.
- **Phase 80 NAV-02** can render only populated rank levels because NULL is faithfully emitted (TAX-03).
- **Open follow-up (deferred to v3.3+):** consolidate the two lineage tables — `inaturalist_waba_data.taxon_lineage` (narrow, consumed by `export.py:116`) and the new `inaturalist_data.taxon_lineage_extended` (wide). Migration of `export.py:116` to read from the wide table is out of scope for Phase 76 per CONTEXT.md.

## Self-Check: PASSED

- File `data/inaturalist_pipeline.py` exists and contains `def enrich_taxon_lineage_extended` (1 occurrence).
- File `data/run.py` exists and contains both the import and the STEPS tuple.
- File `data/tests/test_taxon_lineage_extended.py` exists with 8 tests (all passing).
- Commits `4629017`, `ac9d151`, `709ac2c` all present in `git log --oneline -5`.
- `git diff data/waba_pipeline.py` is empty — D-03 invariant verified.

---
*Phase: 076-data-foundation*
*Completed: 2026-05-03*
