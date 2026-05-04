---
phase: 78
slug: pipeline-outputs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Mirrors Phase 76 (data-foundation) infrastructure. Source: `078-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data/) — managed via `uv` per `data/pyproject.toml` |
| **Config file** | `data/pyproject.toml` (`testpaths = ["tests"]`) |
| **Quick run command** | `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~30 seconds (programmatic DuckDB fixtures, no network, no real iNat) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite green + `node scripts/validate-schema.mjs` green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs are placeholders — populated by the planner once PLAN.md(s) are written. Wave column reflects the canonical Wave 0 (test scaffolding) → Wave 1 (export) → Wave 2 (maps) → Wave 3 (wiring/idempotency) layout proposed in RESEARCH.md.

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| AGG-01 | FULL OUTER JOIN preserves checklist-only AND occurrence-only species | unit (fixture) | `cd data && uv run pytest tests/test_species_export.py::test_full_outer_three_arms -x` | ❌ W0 |
| AGG-02 | `species.parquet` has all required columns including `month_histogram INT[12]` | unit (schema) | `cd data && uv run pytest tests/test_species_export.py::test_species_parquet_schema -x` | ❌ W0 |
| AGG-03 | `_slugify(canonical_name)` matches the `slug` column byte-for-byte for every row | unit (invariant) | `cd data && uv run pytest tests/test_species_export.py::test_slug_invariant -x` | ❌ W0 |
| AGG-04 | `species.json` is a flat array; row[0] has expected keys | unit (shape) | `cd data && uv run pytest tests/test_species_export.py::test_species_json_shape -x` | ❌ W0 |
| AGG-05 | `seasonality.json` keys species → bucket → 12-int array; size < 6 MB | unit (shape + budget) | `cd data && uv run pytest tests/test_species_export.py::test_seasonality_shape_and_budget -x` | ❌ W0 |
| AGG-06 | `validate-schema.mjs` passes with new column expectations | integration | `node scripts/validate-schema.mjs` | ✅ (extended in plan) |
| AGG-07 | FULL OUTER fixture produces correct card counts (matched / checklist-only / occurrence-only) | unit (fixture) | `cd data && uv run pytest tests/test_species_export.py::test_full_outer_card_counts -x` | ❌ W0 |
| MAP-01 | One SVG per species with `occurrence_count > 0`; zero SVG for zero-count | integration | `cd data && uv run pytest tests/test_species_maps.py::test_one_svg_per_nonzero_species -x` | ❌ W0 |
| MAP-02 | `viewBox="0 0 600 320"`; styling lives inside SVG (single `<style>` block per D-03); renders via `<img src=".svg">` | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_inline_styling_and_viewbox -x` | ❌ W0 |
| MAP-03 | County path count == 39; per-occurrence `<circle>` count matches in-bbox occurrences | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_county_paths_and_circles -x` | ❌ W0 |
| MAP-04 | Off-WA points clipped silently; clipped count is logged; no exception | unit (capsys) | `cd data && uv run pytest tests/test_species_maps.py::test_off_bbox_clipping -x` | ❌ W0 |
| MAP-05 | `STEPS` contains `species-export` then `species-maps` between `export` and `feeds` | unit (import) | `cd data && uv run python -c "import run; n=[s[0] for s in run.STEPS]; i=n.index('export'); assert n[i+1]=='species-export' and n[i+2]=='species-maps' and n[i+3]=='feeds', n"` | ✅ |
| MAP-06 | All emitted SVGs parse as valid XML | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_all_svgs_parse -x` | ❌ W0 |
| Idempotency (success crit 4) | Two consecutive runs produce identical artifact bytes | integration | `cd data && uv run pytest tests/test_species_export.py::test_idempotency_two_runs -x` | ❌ W0 |
| Slug agreement (success crit 3) | SVG filename · `slug` column · `_slugify(canonical_name)` agree byte-for-byte | unit (cross-artifact) | `cd data && uv run pytest tests/test_species_maps.py::test_svg_filename_matches_slug_column -x` | ❌ W0 |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_species_export.py` — covers AGG-01..05, AGG-07, idempotency
- [ ] `data/tests/test_species_maps.py` — covers MAP-01..04, MAP-06, slug-agreement
- [ ] `data/tests/conftest.py` extension — third FULL OUTER arm (occurrence-only species with no checklist row), one off-bbox occurrence point on a fixture species (simplified WA county polygon already present from Phase 76)
- [ ] `scripts/validate-schema.mjs` extension — add `EXPECTED['species.parquet']` column set + `species.json` top-level shape check
- [ ] `data/export.py` extension — materialize `canonical_name` on `occurrences.parquet` (load-bearing for per-species `county_count` / `ecoregion_count` joins; Pitfall #6 / A6 in RESEARCH.md)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Linear lon/lat → SVG projection looks visually acceptable at 600×320 for the WA bbox | Implicit in MAP-02 viewBox + Tertiary source A4 | Subjective rendering quality cannot be asserted automatically | Open 5 random `public/data/species-maps/*.svg` in a browser; counties recognizable, occurrence dots fall on land (or clipped) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
