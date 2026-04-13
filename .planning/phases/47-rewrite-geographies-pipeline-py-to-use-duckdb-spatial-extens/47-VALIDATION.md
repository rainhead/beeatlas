---
phase: 47
slug: rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | — | — | N/A | unit | `cd data && uv run pytest tests/test_geographies.py -x -q` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | — | — | N/A | integration | `cd data && uv run pytest tests/ -x -q` | ✅ | ⬜ pending |
| 47-01-03 | 01 | 2 | — | — | N/A | integration | `cd data && uv run pytest tests/test_export.py -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_geographies.py` — stubs for new pipeline: schema shape, GEOMETRY column type, row counts, coordinate bounds (WGS84 check)
- [ ] Update `data/tests/conftest.py` — change geographies fixture DDL from `geometry_wkt VARCHAR` to `geom GEOMETRY`; drop `_dlt_load_id`/`_dlt_id` columns; update seed inserts to `ST_GeomFromText(?)`

*Existing pytest infrastructure covers export and feeds; only geographies fixture needs migration.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CRS transform correctness | D-01 | Requires downloading live shapefiles | Run `load_geographies()`, then query `SELECT ST_X(ST_Centroid(geom)) AS lon, ST_Y(ST_Centroid(geom)) AS lat FROM geographies.ecoregions LIMIT 5` — verify lon is in [-180, 180] and lat in [-90, 90] |
| OOM regression | — | Requires 5 large zip downloads | Run `load_geographies()` end-to-end on a machine with ≤2GB RAM and confirm no MemoryError |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
