---
phase: 162
slug: add-specific-hikes-as-places
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 162 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `162-RESEARCH.md` § Validation Architecture. The gate is
> `data/places_validation.py` (5 checks) plus the existing place contract tests;
> the new curation script needs a golden-fixture buffer test (Wave 0).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data side); Vitest exists for frontend but NOT exercised here |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` (`testpaths=["tests"]`) |
| **Quick run command** | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py tests/test_add_hikes_as_places.py` |
| **Full suite command** | `cd data && uv run python run.py` (full place pipeline) |
| **Estimated runtime** | quick ~10–20s; full pipeline several minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick command (place contract tests + new hike-script test).
- **Pre-commit of `content/places.toml`:** `cd data && uv run python -c "from places_validation import validate_places_step; validate_places_step()"` (5 checks; no overlap check since Phase 160).
- **After every plan wave:** Full pipeline (`run.py`).
- **Before `/gsd-verify-work`:** Full `run.py` green AND measured `public/data/places.geojson` byte delta reported (baseline ~896 KB post-161; ~1 MB guard).
- **Max feedback latency:** ~20 seconds (quick command).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | — | 0 | HKE-BUFFER | — | N/A | unit | `uv run pytest tests/test_add_hikes_as_places.py` | ❌ W0 (new) | ⬜ pending |
| (planner fills) | — | 0 | HKE-SLUG | — | N/A | unit | `uv run pytest tests/test_add_hikes_as_places.py::test_slugs` | ❌ W0 (new) | ⬜ pending |
| (planner fills) | — | 0 | HKE-NONETWORK | — | N/A | unit | pytest fixture LineString, no Overpass call | ❌ W0 (new) | ⬜ pending |
| (planner fills) | — | — | HKE-VALID | — | N/A | integration | `uv run python -c "from places_validation import validate_places_step; validate_places_step()"` | ✅ existing | ⬜ pending |
| (planner fills) | — | — | HKE-LOAD | — | N/A | unit | `uv run pytest tests/test_places_load.py` | ✅ existing | ⬜ pending |
| (planner fills) | — | — | HKE-WEIGHT | — | N/A | unit | `uv run pytest tests/test_places_export.py` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/add_hikes_as_places.py` — curation script scaffold: list-driven input,
  pure `linestring_to_corridor_wkt(wkt, buffer_m, tol_deg)` function (the buffer
  chain with `ST_Transform(..., true)` / `always_xy`), `toml_block()` reuse.
- [ ] `data/tests/test_add_hikes_as_places.py` — golden-fixture buffer test:
  passes a fixed WGS84 `LINESTRING`, asserts result starts `MULTIPOLYGON`,
  `ST_IsValid` true, bbox within ~500 m of input centroid, area in the expected
  range for a 250 m buffer; slug-charset/`-trail`-suffix test; NO network.
- Existing place pipeline tests cover HKE-VALID/LOAD/WEIGHT once TOML is committed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hikes selectable as place filter; corridor boundaries render on map | Success Criterion 1 (UI portion) | Frontend auto-exposes new entries; visual confirmation only | Load `/app`, open Regions, confirm hikes listed; select one, confirm corridor draws + occurrences filter. NOTE: regenerate local `occurrences.db` first ([[project_local_uat_stale_occurrences_db]]). |
| 2 OSM-gap hikes (Snoqualmie–Olallie, Geyser Valley) sourced correctly | D-01 completeness | OSM may lack a clean named entity; may need hand-traced GPX (human step) | Confirm those 2 corridors exist + look right, or are explicitly deferred with a note |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or are listed as manual-only above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the new curation-script tests
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (quick command)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
