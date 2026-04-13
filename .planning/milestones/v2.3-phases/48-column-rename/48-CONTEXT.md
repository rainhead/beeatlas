# Phase 48: Column Rename - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename `inat_observation_id` (Python/SQL) and `inatObservationId` (TypeScript) to `host_observation_id` / `hostObservationId` atomically across all 14 touch points: pipeline yield, export SQL, schema gate, frontend SQL queries, frontend TS interfaces, feature property mappings, sidebar render, and all test fixtures. No new capabilities — pure rename.

</domain>

<decisions>
## Implementation Decisions

### DuckDB Physical Column Migration
- **D-01:** Use `ALTER TABLE ecdysis_data.occurrence_links RENAME COLUMN inat_observation_id TO host_observation_id` — fast, in-place, no re-scraping required. The planner should include this as an explicit step (either a migration script or documented manual step).

### Deployment Sequencing
- **D-02:** Run `data/run.py` locally with the renamed code in place (so export.py produces `host_observation_id`) before pushing. Upload the regenerated parquet to S3, then push the code commit. This ensures CI's schema gate sees `host_observation_id` in both the code and the S3 parquet simultaneously — no CI break window.

### Claude's Discretion
- Commit granularity: single atomic commit or per-layer commits — planner decides what makes review cleaner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above and in REQUIREMENTS.md.

### Touch points inventory (actual file locations confirmed by grep)
- `data/ecdysis_pipeline.py` — yield key (line ~175) and docstring (line ~115)
- `data/export.py` — SELECT clause (line ~108) and JOIN condition (line ~116)
- `data/tests/conftest.py` — DDL `inat_observation_id BIGINT` (line ~63)
- `data/tests/test_export.py` — expected columns list (line ~19)
- `frontend/src/bee-atlas.ts` — SQL JOIN clauses (lines ~372, ~401) and property mapping (line ~789); also SELECT clause (line ~769)
- `frontend/src/bee-map.ts` — `f.get('inat_observation_id')` and `inatObservationId` (lines ~43, ~47)
- `frontend/src/bee-sidebar.ts` — interface field `inatObservationId?: number | null` (line ~20)
- `frontend/src/bee-specimen-detail.ts` — render with `inatObservationId` (lines ~119–120)
- `frontend/src/features.ts` — SQL SELECT and property mapping (lines ~21, ~42)
- `frontend/src/filter.ts` — SQL `inat_observation_id` in URL generation (line ~144)
- `frontend/src/tests/bee-sidebar.test.ts` — test fixtures (lines ~199, ~200, ~239, ~240)
- `scripts/validate-schema.mjs` — expected columns list (line ~28)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- DuckDB ALTER TABLE: standard DuckDB SQL, no migration framework needed
- `data/run.py`: existing runner that sequences all pipeline steps; use this for the local regeneration step

### Established Patterns
- TypeScript convention: SQL column names stay snake_case; TS property names go camelCase — both need renaming
- The parquet column name is determined by export.py SELECT output; the TS property name is set in features.ts mapping

### Integration Points
- `ecdysis_data.occurrence_links` physical column → renamed via ALTER TABLE before running export
- S3 parquet upload: use the existing nightly.sh / run.py upload mechanism after local regeneration

</code_context>

<specifics>
## Specific Ideas

- The planner should order steps: (1) ALTER TABLE on local DuckDB, (2) rename all source files, (3) run data/run.py to regenerate and upload parquet, (4) commit and push code.
- Verify with `pytest` and `npm test` locally before pushing.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 48-column-rename*
*Context gathered: 2026-04-12*
