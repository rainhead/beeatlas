# Phase 62: Pipeline Join - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

`export.py` produces a single `occurrences.parquet` from a full outer join of ecdysis specimens and iNat samples. `ecdysis.parquet` and `samples.parquet` are removed from pipeline output in this same phase. `validate-schema.mjs` is updated to gate on `occurrences.parquet` in the same commit.

This phase is data pipeline only — the frontend still has two layers and two SQLite tables until Phases 63–65.

</domain>

<decisions>
## Implementation Decisions

### Old File Handling
- **D-01:** `export_ecdysis_parquet()` and `export_samples_parquet()` are deleted; `ecdysis.parquet` and `samples.parquet` are no longer produced after this phase.
- **D-02:** `validate-schema.mjs` is updated in Phase 62 (same commit) to validate `occurrences.parquet` and remove the old `ecdysis.parquet`/`samples.parquet` entries. CI gate stays in sync with the pipeline change.

### Spatial Join Structure
- **D-03:** The full outer join and spatial joins (county, ecoregion) are expressed as a single SQL query in one `COPY ... TO` call. No Python helper for SQL fragments — single-pass, county/ecoregion CTEs run once over the unified coordinate set.
- **D-04:** Join key: `ecdysis.host_observation_id = samples.observation_id` (full outer join). Specimens without a linked sample row and samples without a linked specimen row each appear as their own row with nulls on the other side.
- **D-05:** Coordinate precedence for joined rows: `COALESCE(ecdysis.longitude, samples.lon)` → `lat`, `COALESCE(ecdysis.latitude, samples.lat)` → `lon`. Ecdysis coordinates are preferred as the more authoritative source.

### Verification
- **D-06:** Post-export assertions match existing pattern: zero null county, zero null ecoregion_l3. Print row count, null counts, and file size.

### Claude's Discretion
- Complete column list for `occurrences.parquet` (all ecdysis-only columns null for sample-only rows; all sample-only columns null for specimen-only rows; `year`/`month` handling)
- Whether to compute `year`/`month` for sample rows from `date`
- Exact SQL CTE structure within the single-query constraint

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Source Files
- `data/export.py` — current two-export implementation to be replaced
- `scripts/validate-schema.mjs` — schema gate to be updated

### Requirements
- `.planning/REQUIREMENTS.md` §OCC-01, §OCC-03 — full outer join spec, coordinate/date unification

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `export_ecdysis_parquet()` (data/export.py:24) — 21-column ecdysis export with spatial join CTEs; output columns are the specimen-side of the unified schema
- `export_samples_parquet()` (data/export.py:158) — 10-column sample export with duplicate spatial join CTEs; output columns are the sample-side of the unified schema
- Both functions have identical county/ecoregion spatial join logic (~50 lines of CTEs each) — this duplication is eliminated by the unified query

### Established Patterns
- Both exports use `COPY (...) TO '{out}' (FORMAT PARQUET)` pattern
- Post-export verification uses `read_parquet()` in a separate DuckDB query to count nulls
- File size is printed from `Path.stat().st_size`

### Integration Points
- `validate-schema.mjs` EXPECTED dict must add `occurrences.parquet` key and remove `ecdysis.parquet` and `samples.parquet` keys
- `data/run.py` calls `export.main()` — no changes needed there
- `data/nightly.sh` on maderas runs `data/run.py` — no changes needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the single-query constraint.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 62-pipeline-join*
*Context gathered: 2026-04-17*
