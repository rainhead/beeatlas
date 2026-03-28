---
phase: 20
slug: pipeline-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — tests/ directory is being deleted; no test framework required |
| **Config file** | N/A |
| **Quick run command** | `cd data && uv run python -c "import dlt, duckdb, requests, bs4, geopandas; print('imports ok')"` |
| **Full suite command** | Run all five pipelines in order (requires internet; 8–30+ minutes on first run) |
| **Estimated runtime** | ~5 seconds (structural checks); ~30+ minutes (full pipeline run) |

---

## Sampling Rate

- **After every task commit:** Run structural inline checks (instant; no network)
- **After every plan wave:** Run import smoke test (`uv run python -c "import dlt, duckdb, ..."`)
- **Before `/gsd:verify-work`:** All five pipelines must produce non-zero row counts in DuckDB
- **Max feedback latency:** <5 seconds for structural checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | PIPE-08 | structural | `ls data/inaturalist_pipeline.py data/ecdysis_pipeline.py data/geographies_pipeline.py data/projects_pipeline.py data/anti_entropy_pipeline.py` | N/A — shell check | ⬜ pending |
| 20-01-02 | 01 | 1 | PIPE-08 | structural | `! ls data/ecdysis/ data/inat/ data/links/ data/scripts/ data/spatial.py 2>/dev/null` | N/A — shell check | ⬜ pending |
| 20-01-03 | 01 | 1 | PIPE-08 | structural | `cd data && python3 -c "import tomllib; t=tomllib.loads(open('pyproject.toml').read()); deps=''.join(t['project']['dependencies']); assert 'pyinaturalist' not in deps and 'dlt' in deps, deps"` | N/A — inline | ⬜ pending |
| 20-02-01 | 01 | 1 | PIPE-09 | structural | `cd data && python3 -c "import tomllib; t=tomllib.loads(open('.dlt/config.toml').read()); assert t['sources']['inaturalist']['project_id']==166376; assert t['sources']['ecdysis']['dataset_id']==44; v=t['sources']['ecdysis_links']['html_cache_dir']; assert not v.startswith('/'), v"` | N/A — inline | ⬜ pending |
| 20-03-01 | 01 | 2 | PIPE-10 | integration | `cd data && uv run python inaturalist_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.observations"` | N/A — live network | ⬜ pending |
| 20-03-02 | 01 | 2 | PIPE-10 | integration | `cd data && uv run python ecdysis_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM ecdysis_data.occurrences"` | N/A — live network | ⬜ pending |
| 20-03-03 | 01 | 2 | PIPE-10 | integration | `cd data && uv run python geographies_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM geographies.ecoregions"` | N/A — live download | ⬜ pending |
| 20-03-04 | 01 | 2 | PIPE-10 | integration | `cd data && uv run python projects_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.projects"` | N/A — requires inat first | ⬜ pending |
| 20-03-05 | 01 | 2 | PIPE-10 | integration | `cd data && uv run python anti_entropy_pipeline.py && echo "anti-entropy ok"` | N/A — requires inat first | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — this phase has no test framework to install and no stubs to create. All verification is structural (file existence, config content checks) or integration (run the pipeline live). The deleted `data/tests/` files tested code being removed and are not replaced.

*Existing infrastructure covers all phase requirements (structural shell checks require no setup).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| geographies pipeline writes rows | PIPE-10 | ~8-9 min download on first run; large network dependency | `cd data && uv run python geographies_pipeline.py` then verify `SELECT COUNT(*) FROM geographies.ecoregions` > 0 in DuckDB |
| All five pipelines run in sequence | PIPE-10 | Network + time; order matters | Run in order: geographies → inat → ecdysis → projects → anti-entropy |

---

## Pipeline Execution Order (for PIPE-10)

1. `geographies_pipeline.py` — no data dependencies
2. `inaturalist_pipeline.py` — no data dependencies
3. `ecdysis_pipeline.py` — no data dependencies
4. `projects_pipeline.py` — reads `inaturalist_data.observations__observation_projects` (inat must run first)
5. `anti_entropy_pipeline.py` — reads `inaturalist_data.observations` (inat must run first)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s for structural checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
