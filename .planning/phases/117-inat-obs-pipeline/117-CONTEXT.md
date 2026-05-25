# Phase 117: iNat Obs Pipeline - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Ingest the committed iNat expert observation CSV export into a verified `inat_obs.parquet` (12 columns), deduplicated against existing Ecdysis-linked `specimen_observation_id`s, and upload it to CloudFront via the hashed-upload pattern in `nightly.sh`. No dbt changes, no frontend changes, no map rendering — this phase is purely the pipeline and S3 publishing step.

</domain>

<decisions>
## Implementation Decisions

### CSV File Management
- **D-01:** The iNat export CSV lives at `data/raw/inat_expert_obs.csv`, committed to git with a **fixed filename**. When the export is refreshed, the file is overwritten in place. No S3 management for this file — the git log is the version history.

### Output Schema
- **D-02:** `inat_obs.parquet` stores **12 columns**: the 10 required by PIPE-01 (`obs_id`, `observed_on`, `lat`, `lon`, `canonical_name`, `scientific_name`, `user_login`, `image_url`, `license`, `floral_host`) plus two extras:
  - `quality_grade` — stored now for future MAP-F02 quality-grade filter; values are `'research'`, `'needs_id'`, `'casual'`
  - `obs_url` — the full iNat observation URL, named `obs_url` (consistent with `image_url` suffix convention); constructible from obs_id as `https://www.inaturalist.org/observations/{obs_id}` but stored for convenience

### Claude's Discretion
- **Pipeline module**: Create a new `data/inat_obs_pipeline.py` (do NOT extend `inaturalist_pipeline.py`, which handles WABA enrichment via iNat API — a different concern). Follow the `checklist_pipeline.py` pattern: read file, transform, write output.
- **Step placement in run.py**: Add an `"inat-obs"` step to the STEPS list. Must run after `"ecdysis"` (to access `specimen_observation_id` for dedup) and before `"dbt-build"` (so Phase 118's dbt models can reference the data if needed). Exact position within that window is planner's call.
- **Dedup data source**: Exclude rows where `obs_id` matches any `specimen_observation_id` in the Ecdysis DuckDB tables. Planner must identify the exact table/column in DuckDB (e.g., `ecdysis_data.occurrences.specimen_observation_id`). The 821 known overlaps are a benchmark — dedup logic must exclude them.
- **nightly.sh / manifest**: Add `inat_obs.parquet` to the hashed-upload block and `manifest.json` using manifest key `"inat_obs"` (consistent with `"checklist"`, `"occurrences"` etc.). This is required by PIPE-05 (available via CloudFront) and belongs in Phase 117.
- **Tests**: Add pytest integration tests covering at minimum: (a) output schema has all 12 columns, (b) dedup correctly excludes a row whose obs_id matches a known Ecdysis specimen_observation_id, (c) `canonical_name` is non-null for valid rows.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and Roadmap
- `.planning/ROADMAP.md` §Phase 117 — goal, success criteria (SC-1 through SC-5); these are the acceptance gate
- `.planning/REQUIREMENTS.md` §PIPE-01..05 — formal requirements for this phase

### Canonicalization Algorithm
- `data/canonical_name.py` — D-04 5-step canonicalization; import `canonicalize()` directly and apply to `scientific_name` column; do NOT reimplement or modify the algorithm

### Pipeline Orchestration
- `data/run.py` — STEPS list; add `"inat-obs"` step here; read module docstring for step ordering constraints
- `data/nightly.sh` — hashed-upload pattern (`_upload_hashed`), manifest.json construction, CloudFront invalidation; inat_obs.parquet must follow this pattern (PIPE-05)

### Closest Analog Pipeline Steps
- `data/checklist_pipeline.py` — best pattern for a file-based ingest pipeline step (read CSV/parquet → transform → load); follow this structure
- `data/inaturalist_pipeline.py` — **do NOT extend** this file; it handles iNat API calls for WABA enrichment; different concern entirely

### Data Model
- `data/dbt/models/marts/occurrences.sql` — current occurrences mart; planner needs the `specimen_observation_id` column source to identify the dedup table in DuckDB
- `data/dbt/models/schema.yml` — 31-column contract on `marts/occurrences`; Phase 117 does NOT change this (dbt changes are Phase 118)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/canonical_name.py` `canonicalize()` — import directly; apply element-wise to `scientific_name` column; handles None inputs and returns None for invalid input
- `data/nightly.sh` `_upload_hashed()` bash function — copy the pattern verbatim for `inat_obs.parquet`; add `inat_obs_name` variable and manifest entry

### Established Patterns
- File-based pipeline step structure (from `checklist_pipeline.py`): read source file, apply transforms, write to DuckDB staging table or EXPORT_DIR; step function registered in STEPS list
- Dedup via SQL `NOT IN` or `LEFT JOIN / IS NULL` against a DuckDB staging table — follow existing anti-entropy pattern
- `manifest.json` key naming: lowercase snake_case, matches the parquet filename stem (e.g., `"checklist"` → `checklist-<hash>.parquet`)

### Integration Points
- `data/run.py` STEPS list — new `"inat-obs"` step registered here; callable must be importable from the new `inat_obs_pipeline.py` module
- `data/nightly.sh` upload block — add `inat_obs_name=$(_upload_hashed "$EXPORT_DIR/inat_obs.parquet" "inat_obs")` and include in `manifest.json` heredoc
- EXPORT_DIR (`/tmp/beeatlas-export` in nightly, `public/data/` locally) — final parquet written here for S3 upload

</code_context>

<specifics>
## Specific Ideas

- First export contains 45,354 rows (2011–2026); 821 rows overlap with existing Ecdysis `specimen_observation_id`s and must be excluded
- iNat observation URL pattern: `https://www.inaturalist.org/observations/{obs_id}` (integer obs_id)
- floral_host source field: `"field:associated species with names lookup"` in the raw iNat CSV; store raw value, NULL when absent
- quality_grade values in this export: `'research'`, `'needs_id'`, `'casual'` — all kept (quality_grade=any was used in the export query; expert identification is the quality gate, not community consensus)
- Canonical refs accumulation note: no external docs or ADRs were referenced during discussion beyond what's already in ROADMAP.md / REQUIREMENTS.md

</specifics>

<deferred>
## Deferred Ideas

- **Pytest test coverage** — user opted not to discuss; planner should add integration tests per established pattern (dedup correctness, schema validation)
- **quality_grade filter UI (MAP-F02)** — quality_grade is now stored in inat_obs.parquet; filter UI is a future milestone requirement
- **Auto-refresh via nightly export query (PIPE-F01)** — manual periodic export is the deliberate v4.2 design; auto-refresh is a future milestone item
- **Floral host taxonomy resolution (PIPE-F02)** — raw `floral_host` value stored as-is; canonicalization to a plant `canonical_name` is future work

</deferred>

---

*Phase: 117-inat-obs-pipeline*
*Context gathered: 2026-05-25*
