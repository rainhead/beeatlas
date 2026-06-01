---
phase: 126-taxon-ids
verified: 2026-06-01T06:30:00Z
status: passed  # was gaps_found; TID-02 gap closed by Phase 128 (see resolution) — milestone requirement now satisfied
score: 3/4  # historical: 126 alone delivered TID-01/TID-03 + species-level TID-02; the genus-level 4th was closed downstream
overrides_applied: 0
re_verification: false
overrides: []  # TID-02 NOT accepted as deviation — re-scoped + closure delegated to Phase 128 (see human_decision)
resolution:
  date: 2026-06-01
  closed_by: Phase 128 (occurrence-finest-rank-taxon-backfill), 128-VERIFICATION.md status=passed 9/9
  detail: >
    The re-scoped TID-02 (every IDENTIFIED occurrence row carries its finest-rank taxon_id) was
    satisfied by Phase 128: the genus-rank backfill drove occurrences.parquet NULL taxon_id from
    34,354 to 21,680 (12,674 genus rows now non-null; remaining NULLs are no-name specimens + the 3
    unresolvable ecdysis species). TID-02 is marked Complete in REQUIREMENTS.md. This phase's status is
    therefore promoted from gaps_found to passed at milestone-close time; the 3/4 score is retained as
    the historical record of what Phase 126 alone delivered.
human_decision:
  date: 2026-06-01
  decided_by: Peter Abrahamsen
  requirement: TID-02
  decision: "real_gap — re-scope + closure phase"
  detail: >
    Human reviewed the live decomposition of the 34,354 NULL-taxon_id occurrence rows
    (genus-level IDs: 12,674 across 29 genera, all resolvable to a genus taxon_id;
    truly-unidentified specimens: 21,179 with no rank at all; 3 unresolvable ecdysis
    species: 33 rows). Rejected the species-rollup-only deviation. TID-02 is RE-SCOPED to
    "non-null taxon_id for every IDENTIFIED occurrence row" — i.e. each occurrence carries
    the taxon_id of its FINEST identified rank (species → genus → subgenus/tribe/family).
    Closure of the genus-rank backfill is delegated to NEW Phase 128. Truly-unidentified
    specimens (no taxonomic rank in any field) legitimately remain NULL.
  status_after_phase_128: "TID-02 expected to flip to SATISFIED once Phase 128 backfills finest-rank taxon_id and the occurrences not_null data_test is rescoped to all rows with any identification."
---

# Phase 126: Taxon IDs — Verification Report

**Phase Goal:** Surface the iNat taxon ID (already produced by existing resolution machinery) as a non-null `taxon_id INTEGER` column on both `species.parquet` (TID-01) and `occurrences.parquet` (TID-02), and link taxon pages to `https://www.inaturalist.org/taxa/{taxon_id}` (TID-03).
**Verified:** 2026-06-01T06:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `species.parquet` has a non-null `taxon_id` INTEGER column for every species row (TID-01) | ✓ VERIFIED | `schema.yml:134-137` declares `taxon_id` `data_type: integer` with strict `constraints: - type: not_null` on the species mart. `species.sql:36` selects `taxon_id`; `int_species_universe.sql:128` surfaces `ctt.taxon_id::INTEGER`. Live: `species.parquet` = 596 rows, **0 null** taxon_id, 21 cols; `public/data/species.json` = 603/603 rows non-null. `test_species_taxon_id_non_null` PASSED. |
| 2 | `occurrences.parquet` has a non-null `taxon_id` INTEGER column for **every** occurrence row (TID-02) | ✗ FAILED (as written) — deviation documented & intentional | Column exists and is wired (37 cols incl. `taxon_id` INTEGER). BUT live `occurrences.parquet` has **38,939/77,749 rows with NULL taxon_id** (17,254 genus-only, 21,652 NULL canonical_name, 33 from 3 unresolvable ecdysis species). `schema.yml:81-87` uses `data_tests: not_null` at `severity: warn` with `where: "canonical_name like '% %'"` — NOT a strict not_null. This is the documented D-01 relaxation (126-01-SUMMARY deviation 3): genus-only and NULL-name occurrences have no species-level iNat taxon. Routed to human decision (see below). |
| 3 | Taxon pages link to `https://www.inaturalist.org/taxa/{taxon_id}` (TID-03 + D-06: species/genus/subgenus/tribe) | ✓ VERIFIED | All four templates render a null-guarded link: `species-detail.njk:48-49`, `genus.njk:38-39`, `subgenus.njk:40-41`, `tribe.njk:31-32` — each `{%- if X.taxon_id -%}` then `<a class="taxon-action" href="https://www.inaturalist.org/taxa/{{ X.taxon_id }}">View on iNaturalist →</a>` (D-05 label verbatim). `.taxon-page .taxon-action` rule present at `taxon-pages.css:115`. |
| 4 | `occurrences.taxon_id == species.taxon_id` for the same species (D-03 rollup invariant) | ✓ VERIFIED | Live join across 32,402 joinable occurrence rows: **0 mismatches** (`o.taxon_id != s.taxon_id`). `test_taxon_id_consistency` PASSED. All three `int_combined` ARMs and `int_species_universe` join the same `stg_inat__canonical_to_taxon_id` bridge on post-synonymy canonical_name (RD-01 satisfied). |

**Score:** 3/4 truths verified (TID-02 is WIRED but literally unsatisfied — awaits human acceptance of the documented species-rollup deviation).

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/marts/schema.yml` | `taxon_id` not_null on both marts; 37 occ cols, 21 species cols | ⚠️ PARTIAL | species: strict `not_null` constraint (line 137). occurrences: `severity: warn` + WHERE filter (lines 83-87), NOT strict — deliberate D-01 relaxation. |
| `data/dbt/models/marts/species.sql` | `taxon_id` selected | ✓ VERIFIED | Line 36 selects `taxon_id` from `int_species_universe`; header updated to 21-column. |
| `data/dbt/models/marts/occurrences.sql` | `taxon_id` selected | ✓ VERIFIED | Line 94 `j.taxon_id` in final SELECT; 37 cols live. |
| `data/dbt/models/intermediate/int_species_universe.sql` | surface `ctt.taxon_id` | ✓ VERIFIED | Line 128 `ctt.taxon_id::INTEGER AS taxon_id`; bridge LEFT JOIN at 131-132 on `COALESCE(c.canonical_name, oa.canonical_name)`. |
| `data/dbt/models/intermediate/int_combined.sql` | taxon_id join in all 3 ARMs (post-synonymy); WABA derivation + KNOWN_NON_BEES | ✓ VERIFIED | ARM1 `ctt` (line 46, post-synonymy via `int_synonyms`), ARM2/WABA `ctt_w` (line 100, two-token derivation), ARM3 `ctt_io` (line 164). All `::INTEGER` cast. KNOWN_NON_BEES (`cicindela pugetana`, `cleridae`, `encopognathus`) excluded via WHERE in ARM2 (D-09). |
| `data/resolve_taxon_ids.py` | pre-build `check_resolution_gate()` (D-02) + KNOWN_NON_BEES | ✓ VERIFIED | `check_resolution_gate()` at line 60: reads `lineage_unresolved.csv`, `sys.exit` on any blocking bee name, reports KNOWN_NON_BEES excluded count. `KNOWN_NON_BEES` constant at line 37. |
| `data/run.py` | resolution-gate wired into STEPS | ✓ VERIFIED | Import at line 37; STEPS entry `("resolution-gate", check_resolution_gate)` at line 94 (after resolve-taxon-ids, before taxa-download). |
| `data/species_export.py` | `taxon_id` in SPECIES_COLUMNS + int32 schema; `higher_rank_taxon_ids.json` | ✓ VERIFIED | `'taxon_id'` in SPECIES_COLUMNS (line 57) before slug; `('taxon_id', pa.int32())` (line 198); `_build_higher_rank_taxon_ids` (line 85) writes the sidecar JSON for genus/subgenus/tribe (D-06). |
| `_data/species.js` | thread taxon_id to genus/subgenus/tribe lists | ✓ VERIFIED | Reads `higher_rank_taxon_ids.json` (line 21); attaches `taxon_id ?? null` to genusList (154), subgenusList (223), tribeList (262); speciesList carries it from species.json. |
| `public/data/species.json` | non-null taxon_id every row | ✓ VERIFIED | 603/603 rows non-null integer; sample `taxon_id=50086`. |
| `public/data/higher_rank_taxon_ids.json` | genus/subgenus/tribe name → taxon_id | ✓ VERIFIED | Present (4.1 MB); populated per SUMMARY (141,490 genera / 6,799 subgenera / 6,041 tribes). |
| `src/styles/taxon-pages.css` | `.taxon-action` block rule | ✓ VERIFIED | `.taxon-page .taxon-action` at line 115 (display:block / width:fit-content). |
| `CLAUDE.md` | stale contract note corrected to 37 (D-08) | ✓ VERIFIED | Line 57: "dbt 37-column contract on `marts/occurrences`". |
| Tests | non-null + consistency + gate assertions | ✓ VERIFIED | `test_species_taxon_id_non_null`, `test_occurrences_taxon_id_non_null` (excludes genus-only + 3 ecdysis names), `test_taxon_id_consistency`, `test_species_export::test_taxon_id`, `test_resolution_gate` ×2 — all PASS. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `int_species_universe / int_combined` | `stg_inat__canonical_to_taxon_id` | LEFT JOIN on post-synonymy canonical_name | WIRED | 4 join sites (`ctt`, `ctt_w`, `ctt_io`, species-universe `ctt`); all use synonymized `canonical_name` (RD-01 confirmed). |
| `species.sql / occurrences.sql` | int models | `taxon_id::INTEGER` SELECT | WIRED | species.sql:36, occurrences.sql:94. |
| `data/run.py STEPS` | `check_resolution_gate` | import + STEPS tuple (line 94) | WIRED | Gate sits between resolve-taxon-ids and taxa-download. `lineage_unresolved.csv` currently header-only (0 unresolved → gate passes today). |
| `species_export.py` | `species.json` / `higher_rank_taxon_ids.json` | parquet read + sidecar write | WIRED | taxon_id passes through to species.json; sidecar built from taxa.csv.gz with non-empty asserts. |
| `_data/species.js` | template lists | `?? null` attach from sidecar JSON | WIRED | genus/subgenus/tribe lists get taxon_id; speciesList from species.json. |
| 4 `.njk` templates | `inaturalist.org/taxa/{taxon_id}` | null-guarded `<a>` | WIRED | All four render the link; null guard suppresses it when taxon_id absent. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `species.parquet` | `taxon_id` | bridge LEFT JOIN in int_species_universe | 596/596 non-null live | ✓ FLOWING |
| `occurrences.parquet` | `taxon_id` | bridge LEFT JOIN in 3 int_combined ARMs | Non-null for 38,810 species-level rows; NULL for 38,939 genus-only/NULL-name/unresolvable rows | ⚠️ PARTIAL (by design — see TID-02 deviation) |
| `species.json` | `taxon_id` | species.parquet → export | 603/603 non-null | ✓ FLOWING |
| njk `View on iNaturalist` link | `taxon_id` | species.js ← JSON | Real iNat IDs (e.g. 50086) flow into href | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| species.parquet taxon_id all non-null | duckdb count NULL | 0 nulls / 596 rows, 21 cols | ✓ PASS |
| occurrences.parquet has taxon_id INTEGER | duckdb schema | present, 37 cols | ✓ PASS |
| occurrences species-level rows non-null | test_occurrences_taxon_id_non_null | 0 species-level nulls (excl. 3 ecdysis) | ✓ PASS |
| D-03 consistency occ==species | duckdb join mismatch count | 0 / 32,402 joinable | ✓ PASS |
| species.json taxon_id every row | python json scan | 603/603 non-null | ✓ PASS |
| taxon_id test suite | `pytest -k taxon_id + resolution_gate` | 6 passed | ✓ PASS |
| occurrences.parquet whole-column non-null | duckdb count NULL | **38,939 NULL / 77,749** | ✗ FAIL (TID-02 as written) |

---

## Probe Execution

No probe scripts declared or discovered for this phase (`find scripts -path '*/tests/probe-*.sh'` returns nothing). Behavioral spot-checks substituted (above).

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TID-01 | 126-01 | species.parquet non-null taxon_id every species row | ✓ SATISFIED | Strict not_null contract; 603/603 non-null live. |
| TID-02 | 126-01 | occurrences.parquet non-null taxon_id every occurrence row | ⚠️ GAP → re-scoped, delegated to Phase 128 | Column wired; non-null for all species-level rows + D-03 consistency holds. Human (2026-06-01) rejected the species-rollup-only deviation. TID-02 RE-SCOPED to "every IDENTIFIED occurrence row" (finest-rank taxon_id). Genus-rank backfill of 12,674 rows (29 genera, all resolvable) delegated to **Phase 128**; ~21k truly-unidentified specimens legitimately stay NULL. See frontmatter `human_decision`. |
| TID-03 | 126-03 | Species pages link to inaturalist.org/taxa/{taxon_id} (+ D-06 genus/subgenus/tribe) | ✓ SATISFIED | All four templates wired with verbatim "View on iNaturalist →" link. |

No orphaned requirements — all three TID IDs map to Phase 126 plans.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX in any of the 14 modified files | — | — |

The genus-only/NULL-name NULL taxon_id values in occurrences are NOT stubs — they are semantically correct (a genus-only occurrence has no species-level iNat taxon). The 3 ecdysis species (`anthidiellum robertsoni`, `lasioglossum aspilurus`, `osmia phaceliae`) are pre-existing data-quality issues documented in the test WHERE clause and `lineage_unresolved.csv`.

---

## Human Verification Required

### 1. Accept or amend the TID-02 scope deviation

**Test:** Review whether `occurrences.parquet`'s as-built guarantee fulfills TID-02. The column exists, is INTEGER, and is non-null for every species-level row, with `occurrences.taxon_id == species.taxon_id` proven (0 mismatches across 32,402 rows). However, 38,939/77,749 rows are NULL: 17,254 genus-only (no species epithet → no species taxon), 21,652 NULL canonical_name, and 33 from 3 unresolvable ecdysis names.

**Expected:** A decision on whether the species-rollup semantics (D-03) satisfies the intent of TID-02 ("non-null taxon_id column for every occurrence row"), or whether the requirement must be re-scoped/the data fixed. The dbt enforcement deliberately uses `severity: warn` + `where: "canonical_name like '% %'"` rather than a strict constraint (126-01-SUMMARY deviation 3).

**Why human:** "Every occurrence row" is literally false for genus-only/NULL-name occurrences that have no species-level iNat taxon to reference. Whether that is acceptable is a product/scope judgment, not a code-correctness fact.

**This looks intentional.** To accept this deviation, add to this VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "occurrences.parquet includes a non-null taxon_id INTEGER column for every occurrence row (TID-02)"
    reason: "Genus-only and NULL-canonical-name occurrences have no species-level iNat taxon; occurrences.taxon_id is the species-rollup taxon (D-03) and is non-null for every species-level row, with occurrences.taxon_id == species.taxon_id proven (0 mismatches). dbt enforces not_null at severity:warn scoped to two-token canonical_names; the resolution gate (D-02) blocks the pipeline on any unresolvable bee species name. This is the documented, accepted data-reality scope (126-01-SUMMARY deviation 3)."
    accepted_by: "<your-name>"
    accepted_at: "<ISO timestamp>"
```

Adding the override flips TID-02 to PASSED (override) and the phase status to `passed` (4/4).

---

## Gaps Summary

TID-01, TID-03, and the D-03 rollup invariant are fully VERIFIED in live code and data. The complete data-flow (bridge → int models → marts → parquet → species.json / higher_rank_taxon_ids.json → species.js → 4 njk templates → iNat link) is wired and carries real taxon IDs. The resolution gate (D-02) and KNOWN_NON_BEES exclusion (D-09) are installed and tested.

The single open item is **TID-02 as literally written**: `occurrences.parquet` does not have a non-null taxon_id for *every* row — half the rows (genus-only, NULL-name, and 3 unresolvable ecdysis species) are NULL because they have no species-level iNat taxon. This is not a bug or a stub; it is the deliberate species-rollup semantics (D-03) with the dbt not_null test relaxed to `severity: warn` scoped to species-level rows. The implementation achieves the *intent* (every occurrence that maps to a species carries that species' taxon_id, consistently with the species mart) but not the *letter* of "every occurrence row." This requires a human to either accept the deviation via the suggested override (→ phase passes 4/4) or re-scope/amend TID-02.

---

_Verified: 2026-06-01T06:30:00Z_
_Verifier: Claude (gsd-verifier)_
