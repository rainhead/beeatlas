---
phase: 126
slug: taxon-ids
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
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
| 126-XX-XX | TBD | TBD | TID-01 | — | species.parquet has non-null taxon_id for every row | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_species_taxon_id -x` | ❌ W0 | ⬜ pending |
| 126-XX-XX | TBD | TBD | TID-02 | — | occurrences.parquet has non-null taxon_id for every row | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_occurrences_taxon_id -x` | ❌ W0 | ⬜ pending |
| 126-XX-XX | TBD | TBD | TID-02 | — | occurrences.taxon_id == species.taxon_id for matching canonical_name (D-03) | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_taxon_id_consistency -x` | ❌ W0 | ⬜ pending |
| 126-XX-XX | TBD | TBD | TID-03 | — | species.json includes taxon_id field per species | unit | `uv run --project data pytest data/tests/test_species_export.py -k test_taxon_id -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Task IDs finalized by planner.*

---

## Wave 0 Requirements

New test functions, following the `_SPECIES_GUARD` / `skipif(not parquet.exists())` pattern from Phase 125:

- [ ] `data/tests/test_dbt_scaffold.py::test_species_taxon_id_non_null` — TID-01 (zero null taxon_id rows in species.parquet)
- [ ] `data/tests/test_dbt_scaffold.py::test_occurrences_taxon_id_non_null` — TID-02 (zero null taxon_id rows in occurrences.parquet)
- [ ] `data/tests/test_dbt_scaffold.py::test_taxon_id_consistency` — D-03 (occurrences.taxon_id == species.taxon_id for matching canonical_name)
- [ ] `data/tests/test_species_export.py::test_taxon_id` — TID-03 (species.json carries taxon_id)
- [ ] Pre-build resolution gate: a test asserting the gate exits non-zero when an unresolved bee name is present and reports (does not silently drop) `KNOWN_NON_BEES` exclusions (D-02 / D-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "View on iNaturalist →" link renders and targets `https://www.inaturalist.org/taxa/{taxon_id}` on species + genus/subgenus/tribe pages | TID-03 / D-05 / D-06 | Rendered Eleventy output; visual placement as sibling to atlas link | `npm run build`, open a species/genus/subgenus/tribe page, confirm link href + label |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
