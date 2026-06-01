---
phase: 128-occurrence-finest-rank-taxon-backfill
verified: 2026-06-01T20:30:00Z
status: passed
score: 9/9
overrides_applied: 0
re_verification: false
---

# Phase 128: Occurrence Finest-Rank Taxon Backfill — Verification Report

**Phase Goal:** Close the re-scoped TID-02 gap — every IDENTIFIED occurrence row in `occurrences.parquet` carries a non-null `taxon_id` at its finest identified rank; backfill single-token (genus) rows with the genus self-row taxon_id from `taxa.csv.gz` (Animalia disambiguation), while truly-unidentified specimens and the 3 unresolvable ecdysis species legitimately stay NULL. Surfacing change only — no new column, no iNat API calls, 37-col contract intact.
**Verified:** 2026-06-01T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every single-token (genus) `canonical_name` row carries a non-null `taxon_id` (bee AND non-bee aculeate — Animalia rule) | VERIFIED | Live duckdb: 0 rows where `canonical_name NOT LIKE '% %' AND <> '' AND taxon_id IS NULL`. 25,606 single-token named rows across 149 distinct genera carry taxon_id |
| 2 | Truly-unidentified rows (NULL/empty `canonical_name`) stay NULL | VERIFIED | Live duckdb: 0 rows where `(canonical_name IS NULL OR ='') AND taxon_id IS NOT NULL` |
| 3 | The 3 unresolvable ecdysis species stay NULL (not regressed) | VERIFIED | Live duckdb: `anthidiellum robertsoni` (11 rows), `lasioglossum aspilurus` (11), `osmia phaceliae` (11) — all taxon_id NULL. `_KNOWN_UNRESOLVABLE` exclusion retained in test (test_dbt_scaffold.py:319) |
| 4 | `stelis` resolves to bee 127831, NOT plant 141523 (Animalia disambiguation) | VERIFIED | Live duckdb: `SELECT DISTINCT taxon_id WHERE canonical_name='stelis'` → [127831]. Also bembix→53067, lasioglossum→57678 confirmed |
| 5 | Genus map unique by name — dbt unique test on `stg_inat__genus_taxon_ids.genus_name` passes (D-02b) | VERIFIED | Build log: `unique_stg_inat__genus_taxon_ids_genus_name … PASS`. Model dedups via `GROUP BY genus_name HAVING COUNT(*)=1` |
| 6 | Species-level rows: 0 mismatches `occ.taxon_id` vs `species.taxon_id` (D-06 scoping holds) | VERIFIED | Live duckdb join scoped `WHERE o.canonical_name LIKE '% %'` → 0 mismatches. test_taxon_id_consistency green |
| 7 | `occurrences.parquet` still has exactly 37 columns; `taxon_id` stays INTEGER | VERIFIED | Live `DESCRIBE`: 37 columns, `taxon_id` = INTEGER. 37-col contract enforced at build (occurrences external model created, ERROR=0) |
| 8 | Whole-column NULL taxon_id drops to ~21,680 (genus rows backfilled) | VERIFIED | Live duckdb: NULL taxon_id = 21,680 (exact); total 77,744 rows. Residual = no-name rows + 3-species (33 rows) by design |
| 9 | Re-scoped tests green; build passes with 37-col contract + no non-bee carve-out | VERIFIED | `pytest -k taxon_id` → 3 passed. Build PASS=61 WARN=1 ERROR=0 (sole WARN is pre-existing `test_lin05_lineage_coverage`, unrelated to taxon_id). `_NON_BEE_GENERA`=0, `630955`=0 |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` | Animalia genus map from `taxa.csv.gz` (genus_name → taxon_id INTEGER), unique by name | VERIFIED | `read_csv('../raw/taxa.csv.gz', delim=chr(9), …)`; filters `rank='genus' AND active='true' AND list_contains(string_split(ancestry,'/'),'1')`; `taxon_id::INTEGER`; dedup `GROUP BY genus_name HAVING COUNT(*)=1`. No `630955`, no `_NON_BEE_GENERA` |
| `data/dbt/models/staging/schema.yml` | `unique` + `not_null` on `genus_taxon_ids.genus_name` (D-02b) | VERIFIED | `stg_inat__genus_taxon_ids` entry with `not_null` + `unique` on `genus_name` (lines 44-55); both pass at build |
| `data/dbt/models/intermediate/int_combined.sql` | Per-ARM `COALESCE(<bridge>.taxon_id, g.taxon_id)::INTEGER` across all 3 ARMs, guarded | VERIFIED | `grep -c stg_inat__genus_taxon_ids` = 3 (g_e/g_w/g_io). All 3 joins guarded by `taxon_id IS NULL AND position(' ' IN …)=0`. COALESCE at lines 46/106/189 |
| `data/dbt/models/marts/schema.yml` | Re-scoped `taxon_id` not_null `where:` (every named row, minus 3 species), `severity: warn` | VERIFIED | `where: "canonical_name is not null and canonical_name <> '' and canonical_name not in ('anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae')"`, `severity: warn` (lines 90-93). No longer `like '% %'` |
| `data/tests/test_dbt_scaffold.py` | Re-scoped `test_occurrences_taxon_id_non_null` (non-empty canonical_name, no `_NON_BEE_GENERA`) + scoped `test_taxon_id_consistency` | VERIFIED | non_null test uses `canonical_name IS NOT NULL AND <> ''` + `_KNOWN_UNRESOLVABLE` (lines 322-328); consistency test scoped `WHERE o.canonical_name LIKE '% %'` (line 346). `_NON_BEE_GENERA` grep = 0 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `int_combined.sql` (×3 ARMs) | `stg_inat__genus_taxon_ids` | `LEFT JOIN ref(...)` guarded by `taxon_id IS NULL` + single-token | WIRED | 3 refs (g_e/g_w/g_io); each `ON ctt*.taxon_id IS NULL AND position(' ' IN <key>)=0 AND g*.genus_name = lower(<key>)`. ARM 2 reuses the inline `lower(trim(CASE…))` key |
| `stg_inat__genus_taxon_ids.sql` | `data/raw/taxa.csv.gz` | `read_csv` with Animalia ancestry filter | WIRED | `list_contains(string_split(ancestry,'/'),'1')`; build reads file successfully (model + unique test created/passed) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `occurrences.taxon_id` | genus backfill | `stg_inat__genus_taxon_ids` ← `taxa.csv.gz` Animalia genera | 25,606 single-token rows now carry taxon_id; NULL count 34,354 → 21,680 | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| dbt build (37-col contract enforced) | `DB_PATH=…/beeatlas.duckdb bash data/dbt/run.sh build` | PASS=61 WARN=1 ERROR=0 | PASS |
| taxon_id pytest suite | `uv run pytest tests/test_dbt_scaffold.py -k taxon_id -x` | 3 passed | PASS |
| Whole-column NULL taxon_id | duckdb count | 21,680 | PASS |
| stelis Animalia disambiguation | duckdb DISTINCT taxon_id | 127831 (not 141523) | PASS |
| Genus unique test (D-02b) | build log | `unique_stg_inat__genus_taxon_ids_genus_name PASS` | PASS |

---

## Probe Execution

No probe scripts declared or discovered for this phase (`find scripts -path '*/tests/probe-*.sh'` returns nothing). dbt build + pytest + live duckdb assertions substituted.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TID-02 (re-scoped 2026-06-01) | Plan 01 | Non-null taxon_id for every IDENTIFIED (named) occurrence row — finest identified rank | SATISFIED | 0 single-token named NULL rows; 21,680 residual = no-name + 3 unresolvable species (all by design). species-level consistency 0 mismatches. 37-col contract intact |

No orphaned requirements for Phase 128.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX in any modified file | — | — |

No blocking debt markers. The `HAVING COUNT(*)=1` homonym dedup (auto-fixed during execution) tightens correctness — it is a fail-safe (ambiguous names dropped → surfaced NULL, never silently mis-linked), not a stub.

---

## Deferred Infra Item (not a Phase 128 gap)

`DEF-128-01` — `bash data/dbt/run.sh build` with the default relative `DB_PATH` fails the two seeds (dbt-duckdb resolves seed CSV paths relative to the DuckDB file's directory). The nightly avoids this with an absolute `DB_PATH`; the build was validated with the equivalent absolute path. Pre-existing dbt-duckdb ergonomics gap, logged to `deferred-items.md` — out of scope for TID-02, NOT a Phase 128 regression. The sole build WARN (`test_lin05_lineage_coverage`) is likewise pre-existing and unrelated to taxon_id.

---

## Human Verification Required

None. All truths verified from live code, build output, and duckdb assertions against the freshly-rebuilt `occurrences.parquet`.

---

## Gaps Summary

No gaps. All 9 observable truths verified against live data. The staging model, per-ARM COALESCE wiring, re-scoped tests, and marts `where:` clause all exist, are substantive, and are wired. Build passes with the 37-column contract enforced (ERROR=0), the genus_name unique test green, and taxon_id remaining INTEGER. Live `occurrences.parquet`: NULL taxon_id dropped to exactly 21,680, 0 single-token named rows remain NULL, the 3 unresolvable ecdysis species and all no-name rows correctly stay NULL, and Animalia disambiguation resolves stelis→127831 (bee, not plant). TID-02 (re-scoped) is closed — the final v4.5 milestone blocker is satisfied.

**Verdict:** PASS (9/9) — TID-02 re-scoped gap closed; every named occurrence row carries its finest-rank taxon_id, 37-col contract intact, genus map Animalia-disambiguated and unique.

---

_Verified: 2026-06-01T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
