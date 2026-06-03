---
phase: 132-page-rebuild-subfamily-pages
verified: 2026-06-03T18:14:00Z
status: passed
score: 6/6
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Subfamily pages show specimen/observation counts per genus consistent with the existing genus/tribe page format (SC-2)"
  gaps_remaining: []
  regressions: []
---

# Phase 132: Page Rebuild & Subfamily Pages — Verification Report

**Phase Goal:** All taxon static pages (genus, subgenus, tribe, and new subfamily) compute occurrence totals from the hierarchy; new subfamily pages are live at `/species/subfamily/{Name}/`; no slug collisions exist.
**Verified:** 2026-06-03T18:14:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Genus/tribe/subgenus totals derive from hierarchy-keyed rollups (not string grouping) | VERIFIED | `higher_taxa.sql` uses `GROUP BY ancestor_taxon_id` after name-match joins; `_data/species.js` reads `higher_taxa.json`; 41 pytest assertions pass; 585 vitest pass |
| 2 | Subfamily pages show specimen/observation counts per genus consistent with the existing genus/tribe page format (SC-2) | VERIFIED | `occurrence_count` now forwarded in both genus entry mappings (species.js); `subfamily.njk` guard removed; Apinae page shows 0 occurrences of "0 records"; Bombus line reads "1768 specimens · 7763 community observations"; 3 checklist-only genera correctly render "0 specimens · 0 community observations" |
| 3 | Pre-generation slug-collision check hard-fails on cross-rank collisions | VERIFIED | `_check_slug_collisions` in `species_export.py` keyed on full URL paths; wired at `export_species_parquet` line 372; passes clean on real data; 3 unit tests including synthetic-collision and Bombus non-collision |
| 4 | Checklist-only species preserved; pages keyed on taxon_id internally; public slugs name-based | VERIFIED | `test_checklist_only_species_in_membership` passes; `subfamilyList` sourced entirely from `higher_taxa.json` (rollup); every entry has integer `taxon_id`; public URL scheme uses raw capitalized names |
| 5 | Exactly 12 bee subfamilies; Eumeninae absent (D-08) | VERIFIED | `higher_taxa.json`: 12 subfamily rows, no Eumeninae; `ls _site/species/subfamily/` = 12 dirs, no Eumeninae; pytest + vitest both pass |
| 6 | New artifact (`higher_taxa.json`) wired into nightly.sh, fetch-data.sh, make-local-manifest.js; `higher_rank_taxon_ids` retired | VERIFIED | `grep -c higher_rank_taxon_ids nightly.sh` = 0; `grep -c higher_taxa nightly.sh` = 2; `make-local-manifest.js` and `fetch-data.sh` include `higher_taxa.json`; `grep -c higher_rank_taxon_ids _data/species.js` = 0 |

**Score:** 6/6 truths verified

### Gap Closure: Genus Counts on Subfamily Pages

**Previously failed.** Root cause was: genus entries in `subfamilyList` (both nested-tribe and flat-genus paths in `_data/species.js`) omitted `occurrence_count`, and `_pages/subfamily.njk` gated the specimen/obs span on `g.occurrence_count > 0`, causing every genus to fall to the "0 records" else branch.

**Fix applied (committed to main):**

1. `_data/species.js` — both genus entry mappings now include `occurrence_count: g.occurrence_count`.
2. `_pages/subfamily.njk` — per-genus count line is now unconditional (`{{ g.specimen_count | quantify("specimen") }} · {{ g.inat_obs_count | quantify("community observation") }}`), matching the `tribe.njk` analog. The 3 checklist-only genera (Macropis, Oreopasites, Zacosmia) intentionally render "0 specimens · 0 community observations".
3. Vitest regression guard added: 33 tests pass, including assertions that subfamily genus entries carry numeric specimen/inat/occurrence counts.

**Re-verification results (2026-06-03):**

- `grep -c "0 records" _site/species/subfamily/Apinae/index.html` → **0** (expected 0)
- Bombus count line → **"1768 specimens · 7763 community observations"** (expected match)
- `npm test -- data-species` → **33 passed** (up from 32 — new regression guard)
- `ls _site/species/subfamily/ | wc -l` → **12**, no Eumeninae

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql` | name→taxon_id for subfamily/tribe/subgenus among Anthophila | VERIFIED | Contains `630955`, `rank IN ('subfamily', 'tribe', 'subgenus')`, `list_contains(string_split(ancestry, '/'), '630955')` |
| `data/dbt/models/marts/higher_taxa.sql` | 4-rank UNION ALL rollup, member_taxon_ids, GROUP BY ancestor_taxon_id | VERIFIED | Correct structure; `to_json(list(DISTINCT ...))::VARCHAR` for member_taxon_ids; no fan-out join |
| `data/dbt/models/marts/schema.yml` | Enforced contract for higher_taxa, 13 columns including member_taxon_ids | VERIFIED | All 13 columns declared; `contract.enforced: true`; `member_taxon_ids` declared as varchar |
| `data/tests/test_higher_taxa.py` | 16 tests covering baselines, D-08, PAGE-04, fan-out guard | VERIFIED | 16 sandbox-gated tests; all pass against local mart |
| `data/species_export.py` | `_build_higher_taxa`, `_check_slug_collisions`; `_build_higher_rank_taxon_ids` removed | VERIFIED | Both functions present and wired; old function absent (one docstring mention only) |
| `data/nightly.sh` | higher_taxa hashed upload + manifest key | VERIFIED | `higher_taxa_name=$(_upload_hashed ... "higher_taxa")` on line 178; manifest key `"higher_taxa"` on line 193 |
| `scripts/make-local-manifest.js` | `higher_taxa: 'higher_taxa.json'` in manifest | VERIFIED | Present at line 22 |
| `scripts/fetch-data.sh` | `higher_taxa.json` in download loop | VERIFIED | Present on line 22 |
| `data/species_maps.py` | Subfamily group-map pass (color-by-genus) | VERIFIED | Fourth pass after tribe; `subfamily_members` dict; `_group_colors(sorted unique genera)` per subfamily |
| `public/data/species-maps/subfamily/` | 12 SVGs, no Eumeninae | VERIFIED | 12 files: Andreninae.svg through Xylocopinae.svg; no Eumeninae.svg |
| `_data/species.js` | reads higher_taxa.json; subfamilyList exported; 0 higher_rank_taxon_ids refs; genus entries carry occurrence_count | VERIFIED | All fields now mapped; re-verification confirms count lines render correctly |
| `_pages/subfamily.njk` | 12 pages at /species/subfamily/{Name}/, nested/flat layout, SVG map, iNat link, genus counts unconditional | VERIFIED | Pages build; layout correct; SVG wired; genus counts display real data after fix |
| `src/tests/data-species.test.ts` | subfamilyList length/Eumeninae/taxon_id + rollup assertions + occurrence_count regression guard | VERIFIED | 33 tests; all pass including new occurrence_count assertion |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/dbt/models/marts/higher_taxa.sql` | `stg_inat__higher_rank_taxon_ids.sql` | `ref('stg_inat__higher_rank_taxon_ids')` | WIRED | 3 ref() calls in subgenus/tribe/subfamily CTEs |
| `data/dbt/models/marts/higher_taxa.sql` | `data/dbt/models/marts/species.sql` | `ref('species')` | WIRED | Present in all 4 rank CTEs |
| `data/species_export.py` | `target/sandbox/higher_taxa.parquet` | `read_parquet` in `_build_higher_taxa` | WIRED | `DBT_SANDBOX_DIR / 'higher_taxa.parquet'` at line 145 |
| `data/species_export.py` | `public/data/higher_taxa.json` | `json write` | WIRED | `ASSETS_DIR / "higher_taxa.json"` at line 157 |
| `_data/species.js` | `public/data/higher_taxa.json` | `readFileSync` | WIRED | `higherTaxaPath = join(repoRoot, 'public/data/higher_taxa.json')` at line 21 |
| `_pages/subfamily.njk` | `/data/species-maps/subfamily/` | `img src` | WIRED | `src="/data/species-maps/subfamily/{{ subfamily.subfamily }}.svg"` at line 21 |
| `_data/species.js subfamilyList genus entry` | `g.specimen_count / g.inat_obs_count` in `_pages/subfamily.njk` | property access (unconditional) | WIRED | genus entries map all fields including `occurrence_count`; template renders counts unconditionally |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `_pages/subfamily.njk` genus count spans | `g.specimen_count`, `g.inat_obs_count` | `subfamilyList[].tribes[].genera[]` / flat `genera[]` | Yes — unconditional render after fix | FLOWING — Bombus: "1768 specimens · 7763 community observations" |
| `_pages/subfamily.njk` metadata line | `subfamily.totalOccurrences` | `sfRow.occurrence_count` from higher_taxa.json | Yes | FLOWING — 3676 records for Apinae; 669 for Colletinae |
| `_pages/subfamily.njk` SVG map | `subfamily.subfamily` | rollup row name | Yes | FLOWING |
| `_data/species.js` genusList taxon_id | `higherTaxaByRankName['genus'][name].taxon_id` | higher_taxa.json | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 12 subfamily directories built | `ls _site/species/subfamily/ \| wc -l` | 12 | PASS |
| No Eumeninae page | `ls _site/species/subfamily/Eumeninae 2>/dev/null` | absent | PASS |
| No "0 records" on Apinae page | `grep -c "0 records" _site/species/subfamily/Apinae/index.html` | 0 | PASS |
| Bombus genus count on Apinae page | `grep -A2 "Bombus" ... \| grep "count"` | "1768 specimens · 7763 community observations" | PASS |
| All vitest data-species pass (33) | `npm test -- data-species` | 33 passed | PASS |
| nightly.sh syntax | `bash -n data/nightly.sh` | exit 0 | PASS |
| No higher_rank_taxon_ids in nightly.sh | `grep -c higher_rank_taxon_ids data/nightly.sh` | 0 | PASS |
| No higher_rank_taxon_ids in species.js | `grep -c higher_rank_taxon_ids _data/species.js` | 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PAGE-01 | 132-01, 132-04 | Genus/subgenus/tribe totals from hierarchy rollup | SATISFIED | `higher_taxa.sql` groups by ancestor `taxon_id`; all 16 pytest assertions pass; `genusList`/`tribeList`/`subgenusList` taxon_ids from `higherTaxaByRankName` |
| PAGE-02 | 132-03, 132-04 | Subfamily pages with SVG map + per-genus counts | SATISFIED | 12 pages exist with SVG maps; per-genus specimen/obs counts now display correctly after gap fix; SC-2 fully met |
| PAGE-03 | 132-02 | Pre-generation slug-collision HARD-FAIL; no auto-suffix | SATISFIED | `_check_slug_collisions` implemented, unit-tested (synthetic collision, Bombus non-collision, real data clean), wired in export |
| PAGE-04 | 132-01, 132-04 | Checklist-only species present; pages keyed on taxon_id | SATISFIED | `test_checklist_only_species_in_membership` passes; subfamilyList entries have integer taxon_id; public slugs name-based |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `_data/species.js` | 8 | "placeholder shape" comment (pre-existing Phase 81 item) | INFO | Pre-existing; not Phase 132 work; no issue |

No `TBD`, `FIXME`, or `XXX` markers found in any Phase 132-modified files.

### Human Verification Required

None.

### Gaps Summary

All gaps closed. The single gap from initial verification — genus counts showing "0 records" on subfamily pages — was fixed by forwarding `occurrence_count` in both genus entry mappings in `_data/species.js` and removing the conditional guard in `_pages/subfamily.njk`. The fix is confirmed by: 0 occurrences of "0 records" on the Apinae page, Bombus rendering "1768 specimens · 7763 community observations", 33 vitest passing (including new regression guard), and 12 subfamily directories with no Eumeninae.

---

_Verified: 2026-06-03T18:14:00Z_
_Verifier: Claude (gsd-verifier)_
