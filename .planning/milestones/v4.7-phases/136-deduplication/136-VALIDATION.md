---
phase: 136
slug: deduplication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 136 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest ≥9.0.2 (data/pyproject.toml `[tool.pytest.ini_options]`) |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest tests/test_checklist_dedup.py -x` |
| **Full suite command** | `cd data && uv run pytest -m 'not integration'` |
| **Estimated runtime** | ~seconds (fast tier — isolated DuckDB, no real CSV / no dbt build) |

**Test tier discipline** (project memory + conftest.py):
- Fast tier (`-m 'not integration'`): pure-Python unit tests + isolated in-memory/temp DuckDB; runs in seconds.
- Integration tier (`-m integration`): reads real built artifacts; maderas host SIGKILLs long suites — run scoped per-file, never the whole integration suite.

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_checklist_dedup.py -x`
- **After every plan wave:** Run `cd data && uv run pytest -m 'not integration'`
- **Before `/gsd:verify-work`:** Full fast suite must be green
- **Max feedback latency:** ~30 seconds (fast tier)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| DUP-01 | No exact-duplicate tuples remain after collapse | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_no_exact_duplicates_after_collapse -x` | ❌ W0 | ⬜ pending |
| DUP-01 | `collapsed_count` = group size | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_collapsed_count_correct -x` | ❌ W0 | ⬜ pending |
| DUP-01 | Lowest `ObjectID` survives within each group | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_lowest_objectid_survives -x` | ❌ W0 | ⬜ pending |
| DUP-02 | NULL-date rows never appear in candidates | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_null_date_excluded_from_candidates -x` | ❌ W0 | ⬜ pending |
| DUP-02 | NULL-coord rows never appear in candidates | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_null_coord_excluded_from_candidates -x` | ❌ W0 | ⬜ pending |
| DUP-02 | `dedup_candidate_pairs.csv` produced with correct columns | unit | `pytest tests/test_checklist_dedup.py::test_candidate_csv_written -x` | ❌ W0 | ⬜ pending |
| DUP-02 | Token-set + initials collector match | unit (Python) | `pytest tests/test_checklist_dedup.py::test_collector_normalization -x` | ❌ W0 | ⬜ pending |
| DUP-02 | Coordinate proximity uses 1.0 km via lat-first `ST_Distance_Sphere` | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_distance_1km_window -x` | ❌ W0 | ⬜ pending |
| DUP-03 | Unreviewed pair does not suppress point | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_unreviewed_pair_not_suppressed -x` | ❌ W0 | ⬜ pending |
| DUP-03 | `confirmed` pair sets `dedup_status='confirmed'` | unit | `pytest tests/test_checklist_dedup.py::test_confirmed_pair_suppressed -x` | ❌ W0 | ⬜ pending |
| DUP-03 | Gate asserts no orphaned confirmed pair_keys | unit | `pytest tests/test_checklist_dedup.py::test_dedup_gate -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_checklist_dedup.py` — all 11 tests above (RED stubs)
- [ ] `data/checklist_dedup.py` — module under test (candidate CSV writer + `check_dedup_gate()`)
- [ ] `data/dbt/models/intermediate/int_checklist_collapsed.sql` — DUP-01 collapse
- [ ] `data/dbt/models/intermediate/int_dedup_candidates.sql` — DUP-02 spatial+date+name candidate filter
- [ ] `data/dbt/models/intermediate/int_checklist_dedup_status.sql` — DUP-03 decisions LEFT JOIN
- [ ] `data/dbt/seeds/dedup_decisions.csv` — header-only initial commit (`pair_key,dedup_status`)
- [ ] `data/dbt/seeds/schema.yml` — entry for `dedup_decisions`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Curator reviews `dedup_candidate_pairs.csv` and promotes confirmations into `dedup_decisions.csv` | DUP-03 (HUMAN-REVIEW GATE) | Requires human judgment; this is the gate blocking Phase 137 | After build, open `dedup_candidate_pairs.csv`, mark true duplicates, copy their `pair_key` into `dedup_decisions.csv` with `dedup_status=confirmed`, rebuild |

---

## Notes

- **Axis-order pitfall (load-bearing):** DuckDB spatial `ST_Distance_Sphere` expects `ST_Point(lat, lon)` (latitude first) — the opposite of the codebase's `ST_Point(lon, lat)` for `ST_Within`. Every dedup SQL file using `ST_Distance_Sphere` must carry a comment and a test guards the 1 km window.
- **pair_key stability:** Collapse (lowest ObjectID) MUST run before candidate generation so the surviving ObjectID is the one a curator confirmed against.
