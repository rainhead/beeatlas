# Phase 117: iNat Obs Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 117-inat-obs-pipeline
**Areas discussed:** CSV storage, Output schema scope

---

## CSV Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Committed to git (data/raw/) | File at data/raw/inat_expert_obs.csv; versioned with the repo; updated by hand; ~4-8MB acceptable | ✓ |
| S3-managed, not in git | Stored in S3; pulled by nightly.sh like taxa.csv.gz; more infrastructure to maintain | |

**Follow-up — naming convention:**

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed name: inat_expert_obs.csv | Always overwrite on refresh; git log shows history | ✓ |
| Dated: inat_expert_obs_YYYY-MM-DD.csv | Each export a distinct file; old files accumulate | |

**User's choice:** Committed to `data/raw/inat_expert_obs.csv`, fixed name, overwritten on refresh.
**Notes:** Simplicity preferred; S3 management unnecessary for a file updated manually at low frequency.

---

## Output Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly 10 required columns (PIPE-01 only) | Minimal schema; future columns added in their own phase | |
| Add quality_grade now | One extra: quality_grade for future MAP-F02 quality-grade filter | |
| Add quality_grade + obs_url | Two extras: quality_grade (future filter) + obs_url (canonical iNat URL) | ✓ |

**Follow-up — obs_url column name:**

| Option | Description | Selected |
|--------|-------------|----------|
| obs_url | Matches _url suffix convention (same as image_url) | ✓ |
| url | Matches raw iNat CSV column name; no rename step | |

**User's choice:** 12 columns — 10 required + quality_grade + obs_url.
**Notes:** Storing extras now avoids schema migration later; quality_grade is in the raw CSV regardless; obs_url is always constructible from obs_id but convenience justifies storing it.

---

## Claude's Discretion

- **New pipeline module**: Create `data/inat_obs_pipeline.py` (separate from `inaturalist_pipeline.py`)
- **Step placement in run.py**: After `"ecdysis"`, before `"dbt-build"`; exact position within that window is planner's call
- **Dedup data source**: Planner identifies correct DuckDB table for `specimen_observation_id` lookup
- **nightly.sh / manifest**: Add hashed upload + manifest key `"inat_obs"` in Phase 117 (required by PIPE-05)
- **Tests**: Planner adds integration tests per established pattern (schema, dedup correctness, canonical_name non-null)

## Deferred Ideas

- quality_grade filter UI (MAP-F02) — future milestone
- Auto-refresh via nightly export query (PIPE-F01) — future milestone
- Floral host taxonomy resolution (PIPE-F02) — future milestone
- Test coverage decision — deferred to planner (user opted not to discuss this area)
