---
phase: 113
slug: species-page-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **JS/TS Framework** | Vitest ^4.1.2 |
| **Python Framework** | pytest (via `uv run pytest`) |
| **Config file** | `vitest.config.ts` / `data/pyproject.toml` |
| **Quick run command (JS)** | `npm test` |
| **Full suite command (JS)** | `VITEST_SKIP_BUILD=0 npm test` |
| **Quick run command (Py)** | `cd data && uv run pytest tests/test_species_maps.py -x` |
| **Full Python suite** | `cd data && uv run pytest` |
| **Estimated runtime (JS fast)** | ~15 seconds |
| **Estimated runtime (JS full)** | ~60 seconds (includes Eleventy build) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every Python change:** Run `cd data && uv run pytest`
- **After every plan wave:** Run `VITEST_SKIP_BUILD=0 npm test` + full pytest suite
- **Before `/gsd-verify-work`:** Both full suites must be green
- **Max feedback latency:** 60 seconds (JS), 30 seconds (Python)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| Wave 0 tests | 01 | 0 | SPEC-01..05 | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| dbt histogram merge | 01 | 1 | SPEC-05 | N/A | Python integration | `cd data && uv run pytest tests/test_species_export.py -x` | Partial | ⬜ pending |
| checklist_count in species.parquet | 01 | 1 | SPEC-04 | N/A | Python unit | `cd data && uv run pytest` | No | ⬜ pending |
| SVG county fills | 02 | 1 | SPEC-03 | N/A | Python unit | `cd data && uv run pytest tests/test_species_maps.py -x` | Partial | ⬜ pending |
| genusList/subgenusList expansion | 03 | 2 | SPEC-01, SPEC-02 | N/A | unit | `npm test -- src/tests/data-species.test.ts` | Yes — extend | ⬜ pending |
| seasonality-viz note | 03 | 2 | SPEC-05 | N/A | unit | `npm test -- src/tests/seasonality-viz.test.ts` | No | ⬜ pending |
| Template changes | 04 | 3 | SPEC-01..05 | N/A | build output | `VITEST_SKIP_BUILD=0 npm test` | Yes — extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/seasonality-viz.test.ts` — add test: `onChecklist=true, total=0` → renders "Monthly phenology not recorded"
- [ ] `src/tests/data-species.test.ts` — add test: `genusList` contains at least one `on_checklist` species with `occurrence_count === 0`
- [ ] `src/tests/data-species.test.ts` — add test: `speciesList.length >= 565`
- [ ] `src/tests/build-output.test.ts` — add assertion for a known checklist-only species page (at least one species page generated for species with zero WABA records)
- [ ] `data/tests/test_species_maps.py` — add tests for county fill rendering in SVGs (checklist-county class, correct counties)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| County fill visual color (#b0cfe8) distinct from occurrence dots (#c44) on SVG map | SPEC-03 | Visual judgment | Open a checklist species SVG file; confirm county fills are light blue and distinct from red dots |
| Attribution link opens correct URL | SPEC-04 | Link validity | Open a checklist species page; confirm "Bartholomew et al. 2024" links to `https://jhr.pensoft.net/article/129013/` |
| Checklist-only badge in species index | SPEC-01 | Visual judgment | Open `/species/` index; find a checklist-only species; confirm "checklist only" badge instead of "0 records" |
| Atlas link hidden for checklist-only species | SPEC-01 | Template render | Open a checklist-only species detail page; confirm "View N occurrences on the atlas →" is absent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
