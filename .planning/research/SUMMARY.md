# Project Research Summary

**Project:** BeeAtlas v2.3 — Specimen iNat Observation Links
**Domain:** Incremental iNat API pipeline + cross-stack column rename
**Researched:** 2026-04-12
**Confidence:** HIGH

## Executive Summary

BeeAtlas v2.3 adds a specimen photo link to the sidebar by querying the iNaturalist WABA observation field (field_id=18116, confirmed 1,374 observations) and joining the results to Ecdysis specimen records via catalog number. The work spans three layers: a new dlt pipeline (`waba_pipeline.py`) fetching from the iNat v2 API, a modified export join in `export.py` that matches WABA field values to Ecdysis `catalog_number` via `split_part`, and frontend changes that render a new specimen photo link in `bee-specimen-detail.ts` alongside the existing host plant link.

The recommended approach mirrors the existing `inaturalist_pipeline.py` exactly — same incremental cursor (`updated_since`), same paginator, same `per_page=200` — with only the filter parameter changed. The new pipeline must use a distinct `pipeline_name="waba"` and `dataset_name="inaturalist_waba_data"` for complete isolation from the existing pipeline. A prerequisite rename of `inat_observation_id` to `host_observation_id` throughout the stack must land atomically before the new column is added, to prevent an ambiguous two-iNat-column state.

The dominant risk is the column rename: it crosses a snake_case/camelCase boundary at 14 distinct touch points across Python, SQL, TypeScript, test fixtures, and the CI schema gate. Missing any one produces silent nulls rather than compilation errors. The second risk is the iNat API filter parameter name for the v2 endpoint — `field_id=18116` has medium confidence; verify with a live curl before implementing the pipeline. Both risks are well-understood and fully addressable with the checklists in PITFALLS.md.

## Key Findings

### Recommended Stack

No new stack dependencies are introduced for v2.3. All additions use existing tools: dlt's `RESTAPIConfig` pattern (already used by `inaturalist_pipeline.py`), DuckDB SQL in `export.py`, and Lit template rendering in `bee-specimen-detail.ts`. The iNat v2 API endpoint and `asyncBufferFromUrl` are already established. This milestone is implementation-only against a proven stack.

For context, STACK.md also covers v1.7 Lambda/EFS infrastructure (Lambda container image, EFS-backed DuckDB, EventBridge Scheduler). That work is a separate milestone and does not block v2.3.

**Core technologies for v2.3 (all pre-existing):**
- `dlt` RESTAPIConfig — incremental pipeline, `pipeline_name="waba"` / `dataset_name="inaturalist_waba_data"` for isolation
- DuckDB `split_part` + `DISTINCT ON` — catalog number suffix join with deduplication in `export.py`
- Lit `bee-specimen-detail.ts` — new conditional link block, mirrors existing `inatObservationId` pattern
- `validate-schema.mjs` — CI schema gate; must be updated atomically with export SQL

### Expected Features

The feature scope for v2.3 is well-defined and small. The MVP is complete with four deliverables: the new pipeline, the export join, the schema gate update, and the frontend link. Two enhancements (observer login, quality grade badge) are low-cost additions that depend on data already stored by the pipeline and can follow validation.

**Must have (table stakes for v2.3):**
- Specimen photo link in sidebar — closes the gap where a linked specimen has no photo link; pattern already exists for host links
- Rename `inat_observation_id` to `host_observation_id` throughout — prerequisite for adding a second iNat column without ambiguity

**Should have (add after MVP validation):**
- Observer login next to specimen photo link — low cost; pipeline stores it
- Quality grade badge — CSS already exists; adds community ID confidence signal

**Defer (v3+):**
- Inline photo thumbnail — CORS uncertainty, static-hosting constraint, parquet bloat; a text link with "specimen photo" label is the correct MVP

### Architecture Approach

The architecture is a new pipeline feeding an existing export join. `waba_pipeline.py` writes to an isolated `inaturalist_waba_data` DuckDB schema; `export.py` gains a `waba_link` CTE that joins that schema to `ecdysis_data.occurrences` via `split_part(catalog_number, '_', 2)`. The new `specimen_observation_id` column flows into `ecdysis.parquet` and from there into the frontend `Specimen` interface. The data flow is entirely additive except for the `host_observation_id` rename.

**Major components:**
1. `waba_pipeline.py` (NEW) — dlt source, `field_id=18116`, `pipeline_name="waba"`, `dataset_name="inaturalist_waba_data"`, incremental `updated_since` cursor
2. `export.py` (MODIFIED) — `waba_link` CTE with `DISTINCT ON (ofv.value)` deduplication; LEFT JOIN on `split_part`; `specimen_observation_id` in SELECT; `inat_observation_id` renamed to `host_observation_id`
3. Frontend (MODIFIED) — `bee-sidebar.ts` interface, `bee-atlas.ts` query, `bee-specimen-detail.ts` template, `bee-map.ts` feature access, `filter.ts` SQL string; two-pass rename (snake_case then camelCase)

### Critical Pitfalls

1. **Shared `pipeline_name="inaturalist"` corrupts incremental cursors** — use `pipeline_name="waba"`; verify isolation via `SELECT pipeline_name FROM _dlt_pipeline_state` after first run
2. **Column rename has 14 independent touch points across two naming conventions** — treat as a two-pass atomic rename: snake_case layer first (Python, SQL), camelCase layer second (TypeScript); run `pytest` + `npm test` + `validate-schema.mjs` before merging
3. **iNat API field filter parameter name unconfirmed for integer form** — `field:WABA=` is confirmed working on v2; `field_id=18116` is MEDIUM confidence; verify with curl before writing the pipeline
4. **Catalog number join produces zero matches if normalization is wrong** — use `split_part(o.catalog_number, '_', 2) = ofv.value` (VARCHAR, no integer cast); verify with `SELECT COUNT(*) FROM ecdysis.parquet WHERE specimen_observation_id IS NOT NULL`
5. **`waba_link` CTE without deduplication produces duplicate specimen rows** — use `DISTINCT ON (ofv.value) ORDER BY ofv.value, obs.id ASC`

## Implications for Roadmap

Based on research, the work naturally falls into four phases with a mandatory ordering:

### Phase 1: Column Rename (inat_observation_id to host_observation_id)
**Rationale:** The rename must be atomic and complete before any new iNat column is added. An intermediate state with both the old and new names is confusing and risks silent nulls in production.
**Delivers:** Clean schema foundation; `host_observation_id` in parquet, SQL, TypeScript interfaces, test fixtures, CI gate
**Addresses:** Naming sanity prerequisite from FEATURES.md
**Avoids:** Pitfall 3 (14-point rename with two naming conventions; risks silent production regression if split across phases)

### Phase 2: WABA Pipeline
**Rationale:** The pipeline populates the DuckDB data that the export phase depends on. It can be implemented and verified independently before touching `export.py`.
**Delivers:** `inaturalist_waba_data.observations` and `.observations__ofvs` populated in `beeatlas.duckdb` with incremental cursor isolated from existing iNat pipeline
**Uses:** dlt RESTAPIConfig pattern from `inaturalist_pipeline.py`; `pipeline_name="waba"`, `dataset_name="inaturalist_waba_data"`
**Avoids:** Pitfall 1 (cursor collision), Pitfall 4 (wrong API filter parameter — verify live before writing)

### Phase 3: Export Join + Schema Gate
**Rationale:** Depends on Phase 2 data existing in DuckDB. The `waba_link` CTE and new parquet column can be developed and tested in isolation before the frontend is touched.
**Delivers:** `specimen_observation_id` (nullable BIGINT) in `ecdysis.parquet`; `validate-schema.mjs` updated; `test_export.py` passing
**Implements:** `waba_link` CTE with `DISTINCT ON` deduplication; `split_part` catalog suffix join
**Avoids:** Pitfall 2 (zero-match join from type mismatch), Pitfall 5 (semantic confusion between specimen and host observation IDs)

### Phase 4: Frontend Link Rendering
**Rationale:** Depends on Phase 3 delivering the new parquet column. Purely additive to `bee-specimen-detail.ts`; the template pattern is already established by the existing host link block.
**Delivers:** Specimen photo link visible in sidebar for specimens with WABA catalog field entries; graceful absent state for unlinked specimens
**Addresses:** Table-stakes feature from FEATURES.md; pattern mirrors existing `inatObservationId` block

### Phase Ordering Rationale

- The rename (Phase 1) before the new column (Phases 3-4) prevents any overlap of old and new column names in any intermediate deploy state.
- The pipeline (Phase 2) before the export (Phase 3) ensures data exists to test the join locally before changing `export.py`.
- The export (Phase 3) before the frontend (Phase 4) ensures the parquet schema is verified by `validate-schema.mjs` before frontend code reads it.
- Each phase has a clean, independently verifiable success state (`pytest`/`npm test`/`validate-schema.mjs`/visual sidebar check), reducing integration risk.

### Research Flags

Phases likely needing verification during implementation:
- **Phase 2 (WABA Pipeline):** The iNat v2 API integer filter parameter form (`field_id=18116`) is MEDIUM confidence. The confirmed-working form from STACK.md is `field:WABA=` (verified by live call). Verify which form to use in dlt RESTAPIConfig params before writing `waba_pipeline.py`, and whether dlt URL-encodes colons in param keys.

Phases with standard patterns (no additional research needed):
- **Phase 1 (Column Rename):** Pure find-and-replace with a known checklist from PITFALLS.md; no external uncertainty.
- **Phase 3 (Export Join):** DuckDB `split_part` and `DISTINCT ON` are standard SQL; join logic is fully worked out in ARCHITECTURE.md with verified sample data.
- **Phase 4 (Frontend):** Lit template pattern is a direct mirror of the existing host link rendering; no new patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies pre-existing and proven in codebase; no new dependencies |
| Features | HIGH | Scope verified against live codebase; iNat API response shape confirmed by live call |
| Architecture | HIGH | Code read directly; join logic verified with real WABA observation data (3 sample rows confirmed) |
| Pitfalls | HIGH | Derived from live codebase inspection; all 14 rename touch points enumerated from actual files |

**Overall confidence:** HIGH

### Gaps to Address

- **iNat v2 filter parameter form:** STACK.md confirmed `field:WABA=` works on v2 (live call, 1,374 results). ARCHITECTURE.md uses `field_id=18116` (MEDIUM confidence). These are different parameter forms. Verify before writing `waba_pipeline.py`. If `field_id` does not work, fall back to `"field:WABA": ""` in the params dict (or `"field%3AWABA": ""` if dlt does not encode colons).
- **dlt param key URL encoding:** Test whether dlt's REST API source URL-encodes colons in param keys. This determines whether to pass `"field:WABA"` or `"field%3AWABA"` as the key in RESTAPIConfig `params`.
- **DuckDB `occurrence_links` migration approach:** ALTER TABLE migration (preferred for speed) vs. `--full-reload` on the ecdysis-links step. Either is acceptable; decide at implementation time based on whether the Ecdysis HTML disk cache is still intact.

## Sources

### Primary (HIGH confidence)
- Live iNat API calls — field_id=18116 confirmed 1,374 observations; `field:WABA=` filter verified on both v1 and v2; join key confirmed with 3 sample specimens
- Direct codebase inspection — `inaturalist_pipeline.py`, `export.py`, `run.py`, `ecdysis_pipeline.py`, all frontend TypeScript files; all pitfall enumeration derived from live code

### Secondary (MEDIUM confidence)
- iNaturalist API forum — `field:WABA=` syntax community-confirmed; `field_id` integer parameter form inferred from `ofvs.field_id` usage in export.py
- dlt incremental loading docs — cursor keyed by `pipeline_name` + source + resource; behavior under shared names

### Tertiary
- NAT gateway vs VPC endpoint cost analysis (third-party) — relevant to v1.7 Lambda infrastructure, not v2.3

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
