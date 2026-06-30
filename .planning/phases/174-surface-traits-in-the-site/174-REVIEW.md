---
phase: 174-surface-traits-in-the-site
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - data/dbt/models/marts/species_traits.sql
  - data/species_export.py
  - data/tests/test_species_export.py
  - data/tests/fixtures/species_traits_fixture.csv
  - _data/species.js
  - src/styles/taxon-pages.css
  - src/tests/data-species.test.ts
  - _pages/species-detail.njk
  - _pages/species.njk
  - _pages/genus.njk
  - _pages/subgenus.njk
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 174: Code Review Report

**Reviewed:** 2026-06-29
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 174 surfaces the `species_traits` dbt mart onto the static site via Path B (trait fields injected into `species.json` without touching `SPECIES_COLUMNS` or the parquet schema). The implementation is structurally sound: the Path B invariant is correctly maintained, no `| safe` filter is applied to any trait or host-bee value, and the graceful-degradation path (warn-and-null-fill when `species_traits.parquet` is absent) is in place and exercised by a test. Host-bee href construction in `resolveHostBees` uses only atlas-resolved slugs and genus names from the live index, never raw strings — correct per the security contract.

Four warnings were found. The most substantive is a non-determinism risk in `species_traits.sql` QUALIFY clauses that could produce inconsistent trait values across builds when synonymy merges conflicting rows. Three test coverage gaps leave the graceful-degradation path and trait-merge merge path incompletely verified. No blockers.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Non-deterministic QUALIFY row selection in `species_traits.sql`

**File:** `data/dbt/models/marts/species_traits.sql:49-51` and `64-65`
**Issue:** Both the `beegap` and `specialist` CTEs use `QUALIFY ROW_NUMBER() OVER (PARTITION BY canonical_name ORDER BY ...)` with no stable tiebreaker column. The ORDER BY expressions rank rows by whether each field is non-empty (`(sociality <> '') DESC`, etc.), but when two rows have the same emptiness profile yet different trait values — a realistic outcome when `int_synonyms` merges two Bee-Gap spellings that carry conflicting sociality or nesting labels — the winner is chosen by table-scan order, which is not deterministic across DuckDB executions. The same source data can produce different `species_traits.parquet` on different days.

**Fix:**
```sql
-- beegap CTE: add canonical_name as stable tiebreaker
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY canonical_name
    ORDER BY (sociality <> '') DESC, (nesting <> '') DESC, (foraging <> '') DESC,
             canonical_name  -- stable tiebreaker for equal-priority rows
) = 1

-- specialist CTE: same pattern
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY canonical_name ORDER BY (host_plant_family <> '') DESC, canonical_name
) = 1
```

Adding a stable text tiebreaker makes the selection deterministic and reproducible. If conflicting rows do appear, the note in the CTE comment should flag them for data-quality investigation via a separate dbt test.

---

### WR-02: Graceful-degradation test checks only `sociality`, leaving 10 `_TRAIT_FIELDS` uncovered

**File:** `data/tests/test_species_export.py:347-358`
**Issue:** `test_trait_fields_absent_gracefully` asserts `row.get('sociality') is None` for every row, but does not check the remaining 10 entries in `_TRAIT_FIELDS` (`nesting`, `nesting_source`, `diet_breadth`, `diet_breadth_source`, `host_plant_family`, `host_plant_detail`, `native_status`, `host_bees`, `host_bee_count`). A bug that corrupted or omitted the null-fill for any of those fields would be invisible to this test.

**Fix:**
```python
def test_trait_fields_absent_gracefully(tmp_path, monkeypatch, sandbox_parquet):
    (sandbox_parquet / 'species_traits.parquet').unlink()
    con = duckdb.connect()
    export_species_parquet(con)
    rows = json.loads((tmp_path / 'species.json').read_text())
    assert rows, "species.json must be non-empty"
    for row in rows:
        for field in se_mod._TRAIT_FIELDS:
            assert row.get(field) is None, (
                f"Expected {field}=None when traits absent, got {row.get(field)!r}"
            )
```

---

### WR-03: Trait-merge presence test checks only `sociality`

**File:** `data/tests/test_species_export.py:335-344`
**Issue:** `test_trait_fields_in_species_json` confirms only that at least one row has a non-null `sociality`. It does not verify that the other 10 trait fields appear in the merged JSON at all. A bug that merged only `sociality` and left the rest absent would not be caught. The fixture has `host_bees`, `host_bee_count`, and `nesting` populated for `bombus mixtus` and could support broader assertions cheaply.

**Fix:**
```python
def test_trait_fields_in_species_json(tmp_path, monkeypatch, sandbox_parquet):
    con = duckdb.connect()
    export_species_parquet(con)
    rows = json.loads((tmp_path / 'species.json').read_text())
    assert rows, "species.json must be non-empty"
    # All _TRAIT_FIELDS must be present as keys in every row
    for row in rows:
        for field in se_mod._TRAIT_FIELDS:
            assert field in row, f"Trait field '{field}' missing from species.json row"
    # At least one row must have a non-null sociality (bombus mixtus in the fixture)
    assert any(r.get('sociality') is not None for r in rows), (
        "Expected at least one species.json row with non-null sociality"
    )
```

---

### WR-04: `host_plant_detail` emitted without `NULLIF` — inconsistent with `host_plant_family`

**File:** `data/dbt/models/marts/species_traits.sql:111-112`
**Issue:** `host_plant_family` is wrapped with `NULLIF(sp.host_plant_family, '')` to convert empty strings to NULL, but the adjacent `host_plant_detail` column is emitted raw:
```sql
NULLIF(sp.host_plant_family, '') AS host_plant_family,
sp.host_plant_detail,                                   -- no NULLIF
```
Any empty-string `host_plant_detail` values in the Fowler seed would flow into `species_traits.parquet` and then into `species.json` as `""` rather than `null`. No template currently renders this field, so there is no visible regression today, but future consumers of `species.json` that distinguish `null` from `""` would observe inconsistent nullability across the two related plant-host columns.

**Fix:**
```sql
NULLIF(sp.host_plant_family, '') AS host_plant_family,
NULLIF(sp.host_plant_detail, '') AS host_plant_detail,
```

---

## Info

### IN-01: Fixture `host_bee_count = 0` for non-parasitic `bombus mixtus` does not match SQL behaviour

**File:** `data/tests/fixtures/species_traits_fixture.csv:3`
**Issue:** The SQL produces `host_bee_count = NULL` for non-parasitic species (the `parasite` CTE LEFT JOIN returns no row, so the outer `ph.host_bee_count` is NULL). The fixture stores `0` for `bombus mixtus`, which is not a parasite. Consequently any future test that asserts `host_bee_count IS NULL` for non-parasites would fail against this fixture, and the fixture-derived parquet records `0` where production records `NULL`.

**Fix:** Change the last field in the `bombus mixtus` fixture row from `0` to empty:
```csv
bombus mixtus,Social,genus-backbone,Ground,genus-backbone,,,,,Native,,
```

---

### IN-02: `host_plant_detail` is exported to `species.json` but never rendered

**File:** `data/species_export.py:74`, `_pages/species-detail.njk`, `_pages/genus.njk`, `_pages/subgenus.njk`
**Issue:** `host_plant_detail` is included in `_TRAIT_FIELDS` and therefore appears in `species.json`, but no template in the reviewed set renders it. The detail string (Fowler host-plant notes beyond family level) is more specific than `host_plant_family` and would complement the diet breadth display. Its presence in the export without a render target makes it invisible to site visitors. If the field is intentionally reserved for a future enhancement, a comment to that effect would clarify intent.

**Fix:** Either render the field in `species-detail.njk` alongside `host_plant_family` when present, or add a comment in `_TRAIT_FIELDS` marking it as reserved:
```python
_TRAIT_FIELDS = [
    ...
    'host_plant_family', 'host_plant_detail',  # detail reserved for future fine-grained display
    ...
]
```

---

### IN-03: Species-badge markup duplicated three times in `genus.njk`

**File:** `_pages/genus.njk:34-43`, `63-72`, `90-99`
**Issue:** The identical sociality + diet-breadth badge block (`if sp.sociality`, `if sp.diet_breadth === 'specialist'`) appears verbatim in three species-list contexts within the same template: the subgenus-grouped section, the ungrouped trailing section, and the D-05 fallback flat list. Adding or changing a badge field requires updating three separate blocks.

**Fix:** Extract to a Nunjucks macro defined at the top of the file:
```njk
{%- macro speciesBadges(sp) -%}
{%- if sp.sociality -%}
<span class="node-badge" tabindex="0" title="...">...</span>
{%- endif -%}
{%- if sp.diet_breadth === 'specialist' -%}
<span class="node-badge node-badge--specialist" tabindex="0" title="...">Specialist</span>
{%- endif -%}
{%- endmacro -%}
```
Then call `{{ speciesBadges(sp) }}` in each list.

---

### IN-04: `traits_by_name` dict comprehension materialises each row twice

**File:** `data/species_export.py:261-264`
**Issue:** The comprehension builds each row dict twice — once to extract the `canonical_name` key and once for the value:
```python
traits_by_name = {
    dict(zip(trait_cols, r))['canonical_name']: dict(zip(trait_cols, r))
    for r in trait_rows
}
```
Each iteration allocates and discards one dict object. At production scale (~500 species) the overhead is negligible, but the pattern is harder to read than necessary.

**Fix:**
```python
trait_dicts = [dict(zip(trait_cols, r)) for r in trait_rows]
traits_by_name = {t['canonical_name']: t for t in trait_dicts}
```

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
