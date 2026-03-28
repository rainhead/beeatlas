---
phase: 21
slug: parquet-and-geojson-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | EXP-01 | integration | `cd data && uv run python export.py && python -c "import pyarrow.parquet as pq; t=pq.read_table('data/ecdysis.parquet' if False else '../frontend/src/assets/ecdysis.parquet'); assert 'inat_observation_id' in t.schema.names"` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 2 | EXP-02 | integration | `cd data && uv run python export.py && python -c "import pyarrow.parquet as pq; t=pq.read_table('../frontend/src/assets/ecdysis.parquet'); assert t.column('county').null_count == 0 and t.column('ecoregion_l3').null_count == 0"` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 2 | EXP-03 | integration | `cd data && uv run python export.py && python -c "import pyarrow.parquet as pq; t=pq.read_table('../frontend/src/assets/samples.parquet'); assert 'specimen_count' in t.schema.names"` | ❌ W0 | ⬜ pending |
| 21-01-04 | 01 | 3 | EXP-04 | cli | `npm run validate-schema` | ✅ | ⬜ pending |
| 21-01-05 | 01 | 3 | GEO-01 | integration | `node -e "const g=JSON.parse(require('fs').readFileSync('frontend/src/assets/counties.geojson','utf8')); console.assert(g.type==='FeatureCollection'); console.assert(g.features.some(f=>f.properties.NAME))"` | ❌ W0 | ⬜ pending |
| 21-01-06 | 01 | 3 | GEO-02 | integration | `node -e "const g=JSON.parse(require('fs').readFileSync('frontend/src/assets/ecoregions.geojson','utf8')); console.assert(g.type==='FeatureCollection'); console.assert(g.features.some(f=>f.properties.NA_L3NAME))"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_export.py` — stubs for EXP-01 through EXP-04 and GEO-01/GEO-02

*Note: tests/ directory exists in data/ but may need test_export.py added.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GeoJSON renders correctly on map | GEO-01, GEO-02 | Visual verification of polygon shapes | Load frontend, toggle boundary layer, confirm counties and ecoregions display correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
