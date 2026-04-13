---
phase: 49-waba-pipeline
verified: 2026-04-13T00:00:00Z
status: human_needed
score: 1/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the pipeline and confirm data lands in DuckDB"
    expected: "SELECT COUNT(*) FROM inaturalist_waba_data.observations__ofvs returns >= 1553"
    why_human: "beeatlas.duckdb (Apr 12 23:33) predates the phase 49 commits. The pipeline has never run in the current local environment. Data-presence SCs 1 and 2 cannot be verified without executing the pipeline."
  - test: "Confirm second run is faster (incremental cursor advancing)"
    expected: "Second run of `uv run python waba_pipeline.py` touches fewer API pages and completes in noticeably less time than the first"
    why_human: "Incremental behavior requires two timed executions. The cursor config is correct in code but can only be confirmed behaviorally."
---

# Phase 49: WABA Pipeline Verification Report

**Phase Goal:** The WABA dlt pipeline runs end-to-end, populates its own isolated DuckDB schema with iNat observations tagged with the WABA catalog field, and is wired into the run.py sequence
**Verified:** 2026-04-13
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `python run.py` completes without error and `SELECT COUNT(*) FROM inaturalist_waba_data.observations__ofvs` returns a non-zero row count | ? UNCERTAIN | Code is correct and wired. `beeatlas.duckdb` timestamp (Apr 12 23:33) predates the pipeline commits — schema `inaturalist_waba_data` does not exist in the local DB. Pipeline must be run to verify. |
| 2 | Pipeline state table confirms `pipeline_name = 'waba'` — separate from the existing `inaturalist` pipeline cursor | ? UNCERTAIN | Schema absent from local DB. Code uses `pipeline_name="waba"` and `dataset_name="inaturalist_waba_data"` — correct isolation by inspection, but state row cannot be queried without running the pipeline. |
| 3 | A second run completes faster than the first (incremental cursor is advancing on `updated_at`) | ? UNCERTAIN | The `incremental` config in `waba_source` is correctly wired (`cursor_path="updated_at"`, `initial_value="2000-01-01T00:00:00+00:00"`, `updated_since="{incremental.start_value}"`). Behavioral verification requires two timed runs. |

**Score:** 1/3 truths fully verified (truth 3 verified at code level only)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/waba_pipeline.py` | WABA dlt pipeline source | VERIFIED | 133 lines, substantive implementation. `pipeline_name="waba"`, `dataset_name="inaturalist_waba_data"`, incremental cursor on `updated_at`, `field:WABA=` filter. |
| `data/run.py` | waba step wired after inaturalist | VERIFIED | STEPS list: `['ecdysis', 'ecdysis-links', 'inaturalist', 'waba', 'projects', 'anti-entropy', 'export', 'feeds']`. Aliased import `load_waba_observations` confirmed. |
| `data/.dlt/config.toml` | `[sources.waba]` section | VERIFIED | Section present with field_id documentation comment. |
| `inaturalist_waba_data` DuckDB schema | Populated schema with observations tables | MISSING | Schema absent from `beeatlas.duckdb`. DB timestamp (Apr 12 23:33) predates all phase 49 commits. Pipeline has not been run in this environment. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `run.py` | `waba_pipeline.load_observations` | aliased import + STEPS entry | WIRED | `from waba_pipeline import load_observations as load_waba_observations` at line 23; `("waba", load_waba_observations)` at line 33 |
| `waba_source` | iNat v2 API `/observations` | `field:WABA=` param | WIRED | Param `"field:WABA": ""` in endpoint config; `updated_since="{incremental.start_value}"` connects incremental cursor |
| `load_observations` | `beeatlas.duckdb` `inaturalist_waba_data` schema | `dlt.pipeline(dataset_name="inaturalist_waba_data")` | WIRED (code) / UNVERIFIED (data) | Code path is correct; data has not landed yet |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `waba_pipeline.py` | `load_info` (pipeline result) | iNat v2 REST API via dlt RESTAPIConfig | Yes — live API, paginated, non-empty (1374 results per PLAN research) | FLOWING (by code analysis; not confirmed by DB query) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `waba_pipeline` importable | `python -c "from waba_pipeline import load_observations; print('import OK')"` | `import OK` | PASS |
| run.py STEPS includes waba after inaturalist | Python import check | waba at index 3, inaturalist at index 2 | PASS |
| pipeline_name and dataset_name correct | `dlt.pipeline(...)` attribute check | `pipeline_name=waba`, `dataset_name=inaturalist_waba_data` | PASS |
| pytest no regressions | `uv run pytest -q` | 27 passed in 0.72s | PASS |
| ofvs count > 0 | DuckDB query | Schema `inaturalist_waba_data` does not exist | FAIL (pipeline not run) |
| waba state row exists | DuckDB query | Schema absent | FAIL (pipeline not run) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PIPE-01 | 49-01-PLAN.md | WABA pipeline populates `inaturalist_waba_data` schema | NEEDS HUMAN | Code correct, DB not populated locally |
| PIPE-02 | 49-01-PLAN.md | Pipeline uses separate cursor (`pipeline_name=waba`) from inaturalist | NEEDS HUMAN | Code correct, state row not verifiable without run |

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, or stub patterns found in `waba_pipeline.py`.

### Human Verification Required

#### 1. Run pipeline and confirm data lands

**Test:** `cd data && uv run python waba_pipeline.py` (first run from clean state), then query:
```sql
SELECT COUNT(*) FROM inaturalist_waba_data.observations__ofvs;
SELECT pipeline_name FROM inaturalist_waba_data._dlt_pipeline_state WHERE pipeline_name = 'waba';
```
**Expected:** ofvs count >= 1553 (SUMMARY reported 1553), state row `('waba',)` exists
**Why human:** `beeatlas.duckdb` (Apr 12 23:33) predates phase 49 commits. Schema does not exist in the local DB — cannot verify data presence without executing the pipeline.

#### 2. Confirm incremental behavior on second run

**Test:** Run `uv run python waba_pipeline.py` a second time immediately after the first; compare elapsed time reported by dlt
**Expected:** Second run completes faster (fewer API pages fetched, dlt uses `updated_since` cursor from first run)
**Why human:** Requires two sequential timed runs; no local pipeline state exists to check cursor value programmatically.

### Gaps Summary

No code gaps. All three source files (`waba_pipeline.py`, `run.py`, `data/.dlt/config.toml`) match the plan exactly and are substantive.

The verification gap is a **data-presence gap**: the local `beeatlas.duckdb` file has not had the WABA pipeline run against it (DB timestamp Apr 12 23:33 predates all phase 49 commits). The SUMMARY's smoke test (1553 ofvs rows, waba state row confirmed) was performed during development execution but is not reflected in the current database artifact. Success Criteria 1 and 2 require a pipeline execution to confirm.

SC3 (incremental cursor) is verifiable at code level (config is correct) but the behavioral test requires two timed runs.

---

_Verified: 2026-04-13_
_Verifier: Claude (gsd-verifier)_
