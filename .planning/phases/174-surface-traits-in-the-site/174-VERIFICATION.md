---
phase: 174-surface-traits-in-the-site
verified: 2026-06-30T02:26:53Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
post_merge_operator_action:
  description: "One-time SKIP_INTEGRATION_GATE=1 bash data/nightly.sh on maderas (174-01 Task 3 checkpoint:human-action)"
  why_not_a_gap: "Frontend degrades gracefully without it (trait fields null). Code deliverables are complete. This is a tracked release-sequencing step, not a missing implementation."
  trigger: "First nightly after branch merges to maderas — refreshes S3 species.json baseline with trait fields so test_species_json_matches (@integration) stops failing."
---

# Phase 174: Surface Traits in the Site — Verification Report

**Phase Goal:** A site visitor can see a species' ecological traits — with each label's source — on both the species list/index and the species detail page.
**Verified:** 2026-06-30T02:26:53Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                               | Status     | Evidence                                                                                                  |
|----|-----------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 1  | Species detail page renders a Traits section with present rows only; whole section omitted when all traits absent (TRAIT-UI-01) | ✓ VERIFIED | `species-detail.njk` lines 50–76: outer `{%- if hasSociality or hasDiet or hasNesting or hasNative or hasHostBees -%}` guard + per-row guards; `class="traits-dl"` confirmed (`grep -c` = 1) |
| 2  | Cleptoparasitic species show host bee(s) on the detail page, linked where resolved (TRAIT-UI-02)     | ✓ VERIFIED | `_data/species.js` lines 61–75: `resolveHostBees()` produces typed `{type:'species'/'genus'/'text'}` targets; `species-detail.njk` line 72: loops over `sp.resolvedHostBees`, renders `<a href="/species/{{ hb.slug }}/...">` or `<a href="/species/{{ hb.genusName }}/...">` or bare `<em>` |
| 3  | Species rows on the index tree, genus pages, and subgenus pages show sociality and Specialist badges; tribe excluded (TRAIT-UI-03) | ✓ VERIFIED | `species.njk` (2 badge spans, `data-name` unchanged); `genus.njk` (6 badge spans across 3 loops — `sg.species`, `ungroupedSpecies`, fallback `genus.species`); `subgenus.njk` (2 badge spans); `tribe.njk` = 0. `makeSpeciesNode` carries `sociality`, `sociality_source`, `diet_breadth`, `diet_breadth_source`, `host_plant_family` |
| 4  | Every trait row and badge exposes provenance via a `title=` tooltip on a keyboard-focusable element (TRAIT-UI-04) | ✓ VERIFIED | `species-detail.njk`: 5 `<dt tabindex="0" title="Source: …">` rows (Sociality, Diet, Nesting, Native status, Host bees); `species.njk`, `genus.njk`, `subgenus.njk`: both badge spans carry `tabindex="0"` and `title="Sociality:…"` / `title="Diet:…"` provenance strings |
| 5  | Trait fields reach the frontend via the `species.json` fetch-at-build pattern — no committed pipeline artifacts, static hosting preserved (TRAIT-UI-05) | ✓ VERIFIED | `species_traits.sql`: `materialized='external'`, `location='target/sandbox/species_traits.parquet'`, absent from `schema.yml`; `species_export.py`: `_TRAIT_FIELDS` (11 fields), merge step reads parquet by path, graceful degradation on absence; `SPECIES_COLUMNS` = 22, pyarrow schema = 22 (Path B invariant held); no new manifest key; no new `deploy.yml` fetch line |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/marts/species_traits.sql` | External parquet emission with `materialized='external'` | ✓ VERIFIED | `grep -c "materialized='external'"` = 1; `location='target/sandbox/species_traits.parquet'` present; no `species_traits` entry in `schema.yml` (grep = 0) |
| `data/species_export.py` | Python-side trait merge; `_TRAIT_FIELDS` list; graceful degradation | ✓ VERIFIED | `_TRAIT_FIELDS` (11 fields, `grep -c` = 3 across definitions/reference); `species_traits.parquet` read by path (4 references); else-branch warning + null-fill present |
| `data/tests/fixtures/species_traits_fixture.csv` | Minimal trait fixture with `canonical_name` + 11 fields, including a `bombus mixtus` row with non-null sociality | ✓ VERIFIED | File exists; header: `canonical_name,sociality,sociality_source,nesting,nesting_source,diet_breadth,diet_breadth_source,host_plant_family,host_plant_detail,native_status,host_bees,host_bee_count`; row `bombus mixtus,Social,genus-backbone,Ground,genus-backbone,…,Native,,0` |
| `data/tests/test_species_export.py` | `test_trait_fields_in_species_json` + `test_trait_fields_absent_gracefully` | ✓ VERIFIED | Both functions present; `pytest -m "not integration"`: 10 passed |
| `_data/species.js` | `resolveHostBees()` + `sp.resolvedHostBees` loop + `makeSpeciesNode` badge fields + `dietHostLabel`/`sp.dietHost` (gap closure) | ✓ VERIFIED | `function resolveHostBees` = 1; `sp.resolvedHostBees = resolveHostBees(sp.host_bees)` = 1 (before `speciesList`); `sociality: sp.sociality` in `makeSpeciesNode` = 1; `dietHostLabel` function + `sp.dietHost` assignment present |
| `src/styles/taxon-pages.css` | `.traits`, `.traits-heading`, `.traits-dl`, `.traits-dl dt`, `.traits-dl dd`, `.node-badge`, `.node-badge--specialist`; `.node-badge` NOT scoped to `.species-index` | ✓ VERIFIED | `grep -c "\.traits\b\|…\|\.node-badge--specialist"` = 11; `grep -c ".species-index .node-badge"` = 0 |
| `_pages/species-detail.njk` | `<section class="traits">` with `<dl class="traits-dl">`, 5 `<dt>` terms, outer + per-row guards, host-bee link loop, `dietHost` usage | ✓ VERIFIED | `class="traits-dl"` present; outer guard at line 50; 5 `<dt>` terms (Sociality, Diet, Nesting, Native status, Host bees); `Cleptoparasitic` at line 56; `sp.dietHost` at line 60; no new `| safe` on trait values (2 pre-existing: `month_histogram | dump | safe` and `on_checklist | dump | safe`) |
| `_pages/species.njk` | Sociality + Specialist badges in species-leaf branch; `data-name` unchanged | ✓ VERIFIED | `node-badge` = 2; `node-badge--specialist` = 1; `data-name="{{ node.scientificName | lower }}"` at line 8 unmodified |
| `_pages/genus.njk` | Badges in all 3 species-list loops | ✓ VERIFIED | `node-badge` = 6 (2 per loop × 3 loops); `node-badge--specialist` = 3 |
| `_pages/subgenus.njk` | Badges in `subgenus.species` loop | ✓ VERIFIED | `node-badge` = 2; `node-badge--specialist` = 1 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `species_traits.sql` | `target/sandbox/species_traits.parquet` | `materialized='external'` dbt config | ✓ WIRED | Config block lines 27–32 with exact path literal |
| `species_export.py _TRAIT_FIELDS` | `species.json` rows | `read_parquet(traits_parquet)` → `traits_by_name` dict → per-field assignment → `_jsonify_rows()` | ✓ WIRED | Lines 255–273: parquet read, dict keyed by `canonical_name`, `r[field] = t.get(field)` for each of 11 fields; `_jsonify_rows` serializes all dict keys |
| `_data/species.js resolveHostBees` | `byScientificName` / `higherTaxaByRankName['genus']` | name → slug/genusName resolution at build time | ✓ WIRED | `higherTaxaByRankName['genus']?.[trimmed]` at line 69; placed after `byScientificName` definition (line 53), before `speciesList` (line 142) |
| `_data/species.js makeSpeciesNode` | `sp.sociality`, `sp.diet_breadth`, `sp.host_plant_family`, `sp.sociality_source`, `sp.diet_breadth_source` | Explicit field list in node builder | ✓ WIRED | Lines 458–464: 5 badge fields with `?? null` null-coalescing |
| `species-detail.njk` | `sp.resolvedHostBees` / `sp.sociality` / `sp.diet_breadth` / `sp.dietHost` | Nunjucks conditional rows + host-bee link loop | ✓ WIRED | Lines 45–76: all trait fields consumed |
| `species.njk` | `node.sociality` / `node.diet_breadth` | `renderNode` species-leaf badge spans | ✓ WIRED | Lines 10–19: two badge spans conditional on `node.sociality` / `node.diet_breadth === 'specialist'` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `species-detail.njk` traits section | `sp.sociality`, `sp.diet_breadth`, `sp.nesting`, `sp.native_status`, `sp.resolvedHostBees`, `sp.dietHost` | `species.json` (from `species_traits.parquet` merged by `species_export.py`) | Yes — `species_traits.sql` queries 4 committed seeds via dbt; `_jsonify_rows` serializes all dict keys including trait fields | ✓ FLOWING |
| `species.njk` badge spans | `node.sociality`, `node.diet_breadth` | `makeSpeciesNode()` reading from `flat` (which carries merged trait fields from `species.json`) | Yes — 11 trait fields in `flat` rows; `makeSpeciesNode` explicitly copies 5 badge fields | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Eleventy templates compile without error | `npx @11ty/eleventy --dryrun --quiet` | exit 0, "Wrote 0 files in 2.12 seconds" | ✓ PASS |
| JS test suite green (inc. trait threading tests) | `npm test` | 902 passed (33 test files) | ✓ PASS |
| Python trait merge + graceful-degradation tests | `cd data && uv run pytest tests/test_species_export.py -m "not integration" -x` | 10 passed, 2 deselected | ✓ PASS |

---

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| N/A — no conventional `scripts/*/tests/probe-*.sh` found for this phase | — | — | SKIPPED |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRAIT-UI-01 | 174-03 | Detail page shows available traits; omits traits with no data | ✓ SATISFIED | `species-detail.njk` outer + per-row guards; section hidden when all traits absent |
| TRAIT-UI-02 | 174-03 | Cleptoparasites show recorded host bee(s) on detail page | ✓ SATISFIED | `resolveHostBees()` → `sp.resolvedHostBees` → host-bee loop in `species-detail.njk` with typed links |
| TRAIT-UI-03 | 174-02, 174-03 | Species list/index surfaces trait labels (badges) for scannability | ✓ SATISFIED | `node-badge` / `node-badge--specialist` in `species.njk`, `genus.njk` (3 loops), `subgenus.njk` |
| TRAIT-UI-04 | 174-03 | Each trait exposes provenance/source (tooltip) | ✓ SATISFIED | `tabindex="0"` + `title="Source:…"` on `<dt>` elements in detail page; `title="Sociality:…"` / `title="Diet:…"` on badge spans |
| TRAIT-UI-05 | 174-01 | Traits reach frontend via `species.json` fetch-at-build (no committed artifacts, static hosting preserved) | ✓ SATISFIED | `materialized='external'` in `species_traits.sql`; `_TRAIT_FIELDS` + `_jsonify_rows` in `species_export.py`; `SPECIES_COLUMNS` = 22 (unchanged); no `species_traits` in `schema.yml`; no new manifest key; no new `deploy.yml` line |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in any modified file. No stubs or empty implementations detected.

---

### Post-Merge Operator Action (Tracked — Not a Code Gap)

**174-01 Task 3** (`checkpoint:human-action`): After the branch merges and appears on maderas (`nightly.sh` does `git pull`), run once:

```
SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
```

This refreshes the S3 `species.json` baseline with the new trait-field shape so the subsequent normal nightly passes `test_species_json_matches` (`@integration`). Per memory `project_occurrences_contract_release_sequence`, this is the standard data-before-code release gate for JSON shape changes.

**Why this is not a gap:** The frontend degrades gracefully when `species_traits.parquet` is absent or the new species.json has not yet been deployed (all trait fields are `null`, no badges render, no Traits section appears). All code deliverables are complete; this is a scheduled release-sequencing step, not missing implementation.

---

### Human Verification Required

None. The operator UAT was approved prior to this verification. All automated gates pass.

---

## Gaps Summary

None. All 5/5 must-have truths are VERIFIED by codebase evidence:

- TRAIT-UI-01 through TRAIT-UI-04: Templates fully implement the Traits definition list, host-bee links, index/genus/subgenus badges, and provenance tooltips.
- TRAIT-UI-05: Data pipeline Path B (Python-side merge only, 22-column schema untouched) is in place with test coverage.
- Post-UAT gap closures (specialist `dietHost` label, alphabetical genus/subgenus species ordering) are both implemented and tested.
- 902 JS tests pass; 10 Python tests pass; Eleventy compiles without error.

---

_Verified: 2026-06-30T02:26:53Z_
_Verifier: Claude (gsd-verifier)_
