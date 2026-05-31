---
phase: 125-species-visibility
verified: 2026-05-30T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification_completed:
  - test: "Open _site/species/Halictus/rubicundus/index.html in a browser and confirm capitalized scientific name in h1 and rendered SVG"
    result: "Approved — capitalized scientific name and rendered SVG confirmed"
    approved_by: rainhead
    approved_at: "2026-05-30"
  - test: "Spot-check one more previously-invisible off-checklist species page (e.g. Andrena pertristis)"
    result: "Approved — page renders with capitalized scientific name and SVG occurrence map"
    approved_by: rainhead
    approved_at: "2026-05-30"
  - test: "Regression spot-check: open Bombus/vosnesenskii/ in browser and confirm no regression"
    result: "Approved — page loads, SVG renders, no regression"
    approved_by: rainhead
    approved_at: "2026-05-30"
---

# Phase 125: Species Visibility Verification Report

**Phase Goal:** All species with occurrence_count > 0 appear in species.json and the species tree, regardless of WA checklist membership; each has a static page and SVG occurrence map
**Verified:** 2026-05-30
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All two-token off-checklist species with occurrence_count > 0 have non-null specific_epithet in species.parquet | VERIFIED | `SELECT COUNT(*) ... WHERE ... specific_epithet IS NULL` returns 0; pytest test_off_checklist_species_with_occurrences_have_specific_epithet PASSED |
| 2 | All off-checklist species with two-token canonical names have capitalized scientificName in species.parquet | VERIFIED | pytest test_off_checklist_species_scientificname_capitalized PASSED; count of violators = 0 |
| 3 | Static page exists at _site/species/Halictus/rubicundus/index.html (SPV-02) | VERIFIED | `test -f` exits 0; grep finds "Halictus rubicundus" 3 times, 0 lowercase occurrences; visual render confirmed by human UAT |
| 4 | SVG occurrence map exists at public/data/species-maps/Halictus/rubicundus.svg; total SVG count >= 585 (SPV-03) | VERIFIED | File exists at public/data/species-maps/Halictus/rubicundus.svg; total SVG count = 758 (>= 585) |
| 5 | No regression: test_checklist_no_null_specific_epithet passes; species.parquet row count = 629 | VERIFIED | All 17 test_dbt_scaffold.py tests pass; parquet row count = 629 confirmed via duckdb query; Bombus vosnesenskii regression confirmed clean by human UAT |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/intermediate/int_species_universe.sql` | COALESCE derivation for specific_epithet + capitalized scientificName | VERIFIED | NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '') at line 96; upper(left(...)) || substring(...) at lines 81-82 |
| `data/tests/test_dbt_scaffold.py` | Two pytest regression tests for SPV-01 | VERIFIED | test_off_checklist_species_with_occurrences_have_specific_epithet at line 262; test_off_checklist_species_scientificname_capitalized at line 278; _SPECIES_GUARD defined at line 255 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| int_species_universe.sql | sandbox/species.parquet | dbt build | VERIFIED | 629 rows, 592 with non-null specific_epithet (up from 527); off-checklist null count = 0 |
| sandbox/species.parquet | public/data/species-maps/{Genus}/{epithet}.svg | species_maps.py | VERIFIED | 758 SVGs at public/data/species-maps/ (not sandbox path as plan stated — documented plan inaccuracy); Halictus/rubicundus.svg confirmed present |
| sandbox/species.parquet | _site/species/{Genus}/{epithet}/index.html | _data/species.js + species-detail.njk | VERIFIED | 724 species-level index.html files; _site/species/Halictus/rubicundus/index.html confirmed present with "Halictus rubicundus" text |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| int_species_universe.sql specific_epithet | NULLIF(split_part(COALESCE(...), ' ', 2), '') | stg_checklist__species + occ_agg FULL OUTER JOIN | Yes — derives from canonical_name stored in duckdb tables | FLOWING |
| species.parquet -> species-maps | specific_epithet IS NOT NULL filter | dbt build output | Yes — 592 non-null rows produce 758 SVGs | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SPV-01 tests pass | `cd data && uv run pytest tests/test_dbt_scaffold.py -x -k "off_checklist or capitalized"` | 2 passed in 0.39s | PASS |
| Full dbt_scaffold suite | `cd data && uv run pytest tests/test_dbt_scaffold.py -x` | 17 passed in 0.46s | PASS |
| species.parquet row count = 629 | `duckdb -c "SELECT COUNT(*) FROM read_parquet('.../species.parquet')"` | 629 | PASS |
| specific_epithet non-null count >= 592 | `duckdb -c "SELECT COUNT(*) ... WHERE specific_epithet IS NOT NULL"` | 592 | PASS |
| Off-checklist null epithet count = 0 | `duckdb -c "SELECT COUNT(*) ... WHERE ... specific_epithet IS NULL"` | 0 | PASS |
| SVG count >= 585 | `find public/data/species-maps -name '*.svg' \| wc -l` | 758 | PASS |
| Static page count >= 585 | `find _site/species -mindepth 3 -name 'index.html' \| wc -l` | 724 | PASS |
| Halictus rubicundus page exists | `test -f _site/species/Halictus/rubicundus/index.html` | exits 0 | PASS |
| Halictus rubicundus SVG exists | `test -f public/data/species-maps/Halictus/rubicundus.svg` | exits 0 | PASS |
| Capitalized name in HTML | `grep -c "Halictus rubicundus" _site/species/Halictus/rubicundus/index.html` | 3 | PASS |
| No lowercase in HTML | `grep -c "halictus rubicundus" _site/species/Halictus/rubicundus/index.html` | 0 | PASS |
| Regression: Bombus vosnesenskii page | `test -f _site/species/Bombus/vosnesenskii/index.html` | exits 0 | PASS |
| DISTINCT ON guard intact | `grep -c "DISTINCT ON (canonical_name)" int_species_universe.sql` | 1 | PASS |
| Bare specific_epithet assignment gone | `grep -v '^--' ... \| grep -c "c.specific_epithet AS specific_epithet"` | 0 | PASS |
| Bare 2-arg scientificName COALESCE gone | `grep -v '^--' ... \| grep -c "COALESCE(c.scientificName, oa.canonical_name) AS scientificName"` | 0 | PASS |

### Human Verification (Completed)

All three human visual-rendering checks were performed during Task 3 checkpoint execution. User confirmed approval by typing `approved` in the browser session.

#### 1. Visual render of Halictus rubicundus species page — APPROVED

Capitalized "Halictus rubicundus" confirmed in h1; SVG occurrence map rendered correctly; breadcrumb path resolved correctly.

#### 2. Spot-check of Andrena pertristis (off-checklist species) — APPROVED

Page rendered with capitalized scientific name in h1 and a rendered SVG occurrence map, confirming the fix generalizes beyond the single example species.

#### 3. Regression spot-check of Bombus vosnesenskii — APPROVED

Page loaded correctly; SVG occurrence map rendered; no visual regression observed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SPV-01 | 125-01-PLAN.md | Off-checklist species with occurrence_count > 0 have non-null specific_epithet and capitalized scientificName | SATISFIED | Two pytest guards pass; duckdb queries confirm 0 violators |
| SPV-02 | 125-01-PLAN.md | Static page at _site/species/Halictus/rubicundus/index.html | SATISFIED | File exists; contains "Halictus rubicundus" x3; visual render confirmed by human UAT |
| SPV-03 | 125-01-PLAN.md | SVG occurrence map at species-maps/Halictus/rubicundus.svg; count >= 585 | SATISFIED | SVG exists at public/data path; 758 total SVGs |

### Anti-Patterns Found

No TBD, FIXME, XXX, or placeholder markers found in modified files. No stub implementations detected.

**Note on SVG path discrepancy:** The plan acceptance criteria for Task 3 referenced `data/dbt/target/sandbox/species-maps/` as the SVG output directory. The actual output is `public/data/species-maps/` (ASSETS_DIR default in species_maps.py). The sandbox directory has 0 SVGs; the correct output directory has 758. The SUMMARY correctly documents this as a plan inaccuracy, not a code bug. The acceptance criteria for SPV-03 are fully met at the actual output path.

### Gaps Summary

No gaps. All automated and human verification criteria are satisfied:

- NULLIF(split_part(COALESCE(...), ' ', 2), '') expression present in int_species_universe.sql (count: 1)
- upper(left(COALESCE(...), 1)) expression present (count: 1)
- species.parquet: 629 rows (unchanged), 592 non-null specific_epithet (up from 527), 0 off-checklist two-token nulls
- SVG count: 758 (>= 585 threshold)
- Static page count: 724 (>= 585 threshold)
- Halictus rubicundus: page and SVG both exist; "Halictus rubicundus" appears 3x in HTML with 0 lowercase occurrences
- All 17 pytest tests in test_dbt_scaffold.py pass, including test_checklist_no_null_specific_epithet (regression guard)
- Commits 04e355f (RED tests) and eefe2aa (GREEN SQL fix) landed in git history
- Human UAT: all three visual browser checks approved during Task 3 checkpoint (Halictus rubicundus, Andrena pertristis, Bombus vosnesenskii)

---

_Verified: 2026-05-30_
_Verifier: Claude (gsd-verifier)_
