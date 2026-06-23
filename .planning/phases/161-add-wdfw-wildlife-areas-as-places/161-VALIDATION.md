---
phase: 161
slug: add-wdfw-wildlife-areas-as-places
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 161 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `161-RESEARCH.md` § Validation Architecture. The validation gate
> for this phase is `data/places_validation.py` (the 6 checks) plus the three
> existing place contract tests; the phase gate is a green `data/run.py`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 (data side); Vitest exists for frontend but is NOT exercised here |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` (`testpaths=["tests"]`, `-m 'not integration'`) |
| **Quick run command** | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py` |
| **Full suite command** | `cd data && uv run python run.py` (full place pipeline: validation → load → dbt-build → export → maps) |
| **Estimated runtime** | quick ~10–20s; full pipeline several minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick command (three place tests).
- **Pre-commit of `content/places.toml`:** Run `validate_places_step()` directly —
  `cd data && uv run python -c "from places_validation import validate_places_step; validate_places_step()"`.
  This is where any residual `ST_Overlaps` rejection would fire (must NOT fire post-Phase-160).
- **After every plan wave:** Run the full pipeline (`run.py`).
- **Before `/gsd-verify-work`:** Full `run.py` green AND measured `public/data/places.geojson`
  size reported (before/after delta + chosen simplification tolerance).
- **Max feedback latency:** ~20 seconds (quick); full pipeline reserved for wave/phase gates.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | — | — | WLA-VALID | — | N/A (static curation, no runtime input) | integration | `uv run python -c "from places_validation import validate_places_step; validate_places_step()"` | ✅ existing gate | ⬜ pending |
| (planner fills) | — | — | WLA-DISSOLVE | — | N/A | unit | `uv run pytest tests/test_places_load.py` | ✅ existing | ⬜ pending |
| (planner fills) | — | — | WLA-WEIGHT | — | N/A | unit | `uv run pytest tests/test_places_export.py` | ✅ existing | ⬜ pending |
| (planner fills) | — | — | curation-script | — | N/A | unit (recommended) | golden-fixture test that script emits 33 valid `MULTIPOLYGON` WKT blocks | ❌ W0 (new, optional) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- The downstream pipeline already has contract tests (`test_places_validation.py`,
  `test_places_load.py`, `test_places_export.py`) — no Wave 0 work needed for it.
- **Recommended (optional):** a light test for the NEW curation script
  `data/add_wdfw_wildlife_areas.py` asserting it emits 33 valid `MULTIPOLYGON`
  WKT blocks (golden-fixture). Given slugs are immutable after first publish,
  this guards against a malformed first publish.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| New WDFW areas selectable as place filter on the map; boundaries render | Success Criterion 4 | Frontend auto-exposes new entries (no code change); visual confirmation only | Load `/app`, open Regions, confirm WDFW areas listed and boundaries draw |
| `places.geojson` weight stays ≤ ~1 MB | Success Criterion 3 / D-05 | Threshold judgement on a shipped artifact | Report `public/data/places.geojson` size before/after + chosen tolerance |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or are listed as manual-only above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none required; one optional)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (quick command)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
