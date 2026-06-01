---
phase: 128
slug: occurrence-finest-rank-taxon-backfill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 128 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 128-RESEARCH.md "## Validation Architecture". Per-task rows finalized at planning.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (`uv run pytest`) — `data/tests/` |
| **dbt enforcement** | `schema.yml` contract + `data_tests` at every `bash data/dbt/run.sh build` |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_scaffold.py -k "taxon_id" -x` |
| **Full suite command** | `cd data && uv run pytest && bash data/dbt/run.sh build` |
| **Estimated runtime** | ~30–90s quick; dbt build a few min |

---

## Sampling Rate

- **After every task commit:** Run quick command (`pytest -k taxon_id -x`)
- **After every plan wave:** Run full suite (`pytest && dbt run.sh build`)
- **Before `/gsd:verify-work`:** Full suite green + dbt build passes 37-col contract
- **Max feedback latency:** ~90 seconds (quick); build for whole-pipeline truths

---

## Per-Task Verification Map

> Finalized by the planner. Seeded from the Observable-Truths map below.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 128-01-* | 01 | 1 | TID-02 | unit/contract | `pytest tests/test_dbt_scaffold.py -k taxon_id -x` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Observable Truths → Test Map

| Truth | Mechanism | Automated Command |
|-------|-----------|-------------------|
| EVERY single-token (genus) canonical_name non-null in `occurrences.parquet` (bee AND non-bee aculeate genera — Animalia rule) | duckdb: single-token canonical rows with NULL taxon_id (excl. 3 known species) → 0 | `pytest tests/test_dbt_scaffold.py::test_occurrences_taxon_id_non_null -x` (re-scoped) |
| Genus rows newly non-null; whole-column NULL count drops to ~21,680 | duckdb `COUNT(*) FILTER(taxon_id IS NULL)` snapshot before/after | row-count duckdb snippet (executor records actual) |
| Truly-unidentified rows (NULL/empty canonical_name) still NULL | duckdb: `COUNT(*) WHERE canonical_name IS NULL AND taxon_id IS NOT NULL` == 0 | duckdb assertion |
| 3 unresolvable ecdysis species still NULL (not regressed) | `_KNOWN_UNRESOLVABLE` exclusion retained in test | re-scoped not_null test |
| Genus map is unique by name (no homonym fan-out) | dbt `unique` test on `stg_inat__genus_taxon_ids.genus_name` (D-02b) | `bash data/dbt/run.sh build` (fails loudly on future collision) |
| Species-level consistency: 0 mismatches `occ.taxon_id == species.taxon_id` | scoped join `WHERE o.canonical_name LIKE '% %'` (D-06) | `pytest ::test_taxon_id_consistency -x` (scoped) |
| Genus taxon_id correct, no plant collision (Animalia disambiguation) | spot-check `stelis`→127831 (bee, not plant 141523), `lasioglossum`→57678, `bembix`→53067 | duckdb spot-check query |
| 37-column occurrences contract still passes | dbt contract enforcement (column count must not drift) | `bash data/dbt/run.sh build` |
| `taxon_id` stays INTEGER (no BIGINT leak from taxa.csv.gz) | parquet schema | `DESCRIBE SELECT * FROM read_parquet(occurrences.parquet)` → `taxon_id INTEGER` |

---

## Wave 0 Requirements

- [ ] `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` — new staging model reading `../raw/taxa.csv.gz` (`rank='genus' AND active='true'`, **Animalia** ancestry `('/'||ancestry||'/') LIKE '%/1/%'`, BIGINT→INTEGER cast) — must exist before the `int_combined` edit
- [ ] dbt `unique` test on `stg_inat__genus_taxon_ids.genus_name` (D-02b — fail-loud safety net)
- [ ] Re-scope `test_occurrences_taxon_id_non_null` (D-04/D-05 — keep `_KNOWN_UNRESOLVABLE` 3-species exclusion; NO non-bee-genera exclusion) + matching `schema.yml` `where:` clause
- [ ] Scope `test_taxon_id_consistency` to `canonical_name LIKE '% %'` (D-06)
- [ ] (optional) `test_genus_backfill_resolved` — assert representative genera resolve to expected taxon_ids (stelis→127831, lasioglossum→57678, bembix→53067)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | TID-02 | All truths have automated duckdb/pytest/contract coverage | — |

*All phase behaviors have automated verification.*

---

## Security Domain

Not applicable. No auth, input-validation, network, session, or crypto surface. Inputs are a trusted
local taxonomy dump (`taxa.csv.gz`, already ingested from iNat Open Data) and an internal DuckDB file.
The only integrity concern — plant-vs-bee taxon_id collision (e.g. Stelis) — is addressed by the
Anthophila ancestry filter and is a data-correctness control, not a security one.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
