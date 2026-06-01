---
phase: 126
slug: taxon-ids
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-31
validated: 2026-05-31
---

# Phase 126 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `126-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.3 |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` |
| **Full suite command** | `uv run --project data pytest data/tests/ -x` |
| **Estimated runtime** | ~30 seconds (scaffold subset); full suite longer |

---

## Sampling Rate

- **After every task commit:** Run `uv run --project data pytest data/tests/test_dbt_scaffold.py -x`
- **After every plan wave:** Run `uv run --project data pytest data/tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 126-01-1 | 126-01 | W0 | TID-01 | — | species.parquet has non-null taxon_id for every row | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_species_taxon_id_non_null -x` | ✅ | ✅ green |
| 126-01-1 | 126-01 | W0 | TID-02 | — | occurrences.parquet has non-null taxon_id for every species-level row | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_occurrences_taxon_id_non_null -x` | ✅ | ✅ green |
| 126-01-1 | 126-01 | W0 | D-03 | — | occurrences.taxon_id == species.taxon_id for matching canonical_name | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_taxon_id_consistency -x` | ✅ | ✅ green |
| 126-01-1b | 126-01 | W0 | D-02 | T-126-02 | resolution gate exits non-zero (SystemExit) naming an unresolved bee | unit | `uv run --project data pytest data/tests/test_resolution_gate.py -k test_gate_blocks_unresolved_bee -x` | ✅ | ✅ green |
| 126-01-1b | 126-01 | W0 | D-09 | — | gate allows KNOWN_NON_BEES-only CSV and reports excluded count (no silent drop) | unit | `uv run --project data pytest data/tests/test_resolution_gate.py -k test_gate_allows_known_non_bees_only -x` | ✅ | ✅ green |
| 126-02-1 | 126-02 | W0 | TID-03 | — | species.json includes a non-null integer taxon_id field per species | unit | `uv run --project data pytest data/tests/test_species_export.py -k test_taxon_id -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.*

---

## Wave 0 Requirements

New test functions, following the `_SPECIES_GUARD` / `skipif(not parquet.exists())` pattern from Phase 125:

- [x] `data/tests/test_dbt_scaffold.py::test_species_taxon_id_non_null` — TID-01 (zero null taxon_id rows in species.parquet)
- [x] `data/tests/test_dbt_scaffold.py::test_occurrences_taxon_id_non_null` — TID-02 (zero null taxon_id rows in occurrences.parquet, species-level)
- [x] `data/tests/test_dbt_scaffold.py::test_taxon_id_consistency` — D-03 (occurrences.taxon_id == species.taxon_id for matching canonical_name)
- [x] `data/tests/test_species_export.py::test_taxon_id` — TID-03 (species.json carries non-null integer taxon_id)
- [x] Pre-build resolution gate (`data/tests/test_resolution_gate.py`): `test_gate_blocks_unresolved_bee` asserts SystemExit naming the unresolved bee (D-02); `test_gate_allows_known_non_bees_only` asserts `KNOWN_NON_BEES`-only input is allowed with a reported excluded count, not silently dropped (D-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "View on iNaturalist →" link renders and targets `https://www.inaturalist.org/taxa/{taxon_id}` on species + genus/subgenus/tribe pages | TID-03 / D-05 / D-06 | Rendered Eleventy output; visual placement as sibling to atlas link | `npm run build`, open a species/genus/subgenus/tribe page, confirm link href + label |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick command runs in ~0.8s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-05-31 — all 6 automated verifications green; only the rendered iNat link (D-05/D-06) remains manual-only by design.

---

## Validation Audit 2026-05-31

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All four planned Wave-0 requirements plus the resolution-gate failure paths (D-02/D-09) were implemented during execution and confirmed green:

- `test_dbt_scaffold.py`: `test_species_taxon_id_non_null`, `test_occurrences_taxon_id_non_null`, `test_taxon_id_consistency` — 3 passed
- `test_resolution_gate.py`: `test_gate_blocks_unresolved_bee`, `test_gate_allows_known_non_bees_only` — 2 passed
- `test_species_export.py`: `test_taxon_id` — 1 passed

No auditor spawn was required. The phase is Nyquist-compliant.
