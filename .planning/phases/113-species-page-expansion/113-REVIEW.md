---
phase: 113-species-page-expansion
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - data/dbt/models/intermediate/int_species_universe.sql
  - data/dbt/models/marts/species.sql
  - data/dbt/models/marts/schema.yml
  - data/species_export.py
  - data/species_maps.py
  - _data/species.js
  - src/species/seasonality-viz.ts
  - _pages/species.njk
  - _pages/species-detail.njk
  - _pages/genus.njk
  - _pages/subgenus.njk
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 113: Code Review Report

**Reviewed:** 2026-05-25
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 113 adds `checklist_count` to the species pipeline, renders checklist-county SVG fills, and surfaces checklist data in genus/subgenus JS lists and Nunjucks templates. The SQL and Python pipeline logic is sound. One correctness bug was found in `_data/species.js`: the unresolved-specimen label in `subgenusList` uses genus name instead of a subgenus-appropriate label, producing misleading display text. Four warnings cover a path-interpolated SQL query, a checklist-county fill ordering bug that breaks visual layering, a missing size guard on the `seasonality.json` assertion, and an asymmetric `checklistCount` between genus and subgenus data objects.

---

## Critical Issues

### CR-01: subgenusList unresolved-specimen label emits `"Genus sp."` instead of something subgenus-appropriate

**File:** `_data/species.js:205`

**Issue:** The `subgenusList` map appends a grey catch-all entry for unresolved (genus-level) occurrences with `scientificName: \`${g.genus} sp.\``. This is copy-pasted from the genus block. For a subgenus page the label is ambiguous — "Bombus sp." on the *Bombus (Fervidobombus)* page refers to records not identified to species within the subgenus, but the label gives no subgenus context. More importantly, the comment on line 199 reads "Append a grey 'Subgenus sp.' entry" while the code produces a genus label — the intent and the code disagree, which is a correctness defect.

**Fix:**
```javascript
// line 205 — use subgenus context in label
species.push({
  scientificName: `${g.genus} (${g.subgenus}) sp.`,
  hexColor: '#aaaaaa',
  occurrence_count: unresolvedOccurrences,
  slug: null,
});
```

---

## Warnings

### WR-01: Path-interpolated f-string SQL in `species_export.py` — parquet path injected directly into query string

**File:** `data/species_export.py:119`

**Issue:** The DuckDB query at line 119 uses an f-string to embed `species_parquet_in` (a `Path` object) directly into the SQL string:
```python
f"SELECT {mart_cols} FROM read_parquet('{species_parquet_in}') ORDER BY canonical_name"
```
`mart_cols` is derived from `SPECIES_COLUMNS[:-1]`, a hardcoded list — safe. The path itself comes from the `DBT_SANDBOX_DIR` env var, which could in principle contain a single-quote in a user-supplied value, breaking the query or silently reading from an attacker-controlled path. The same pattern recurs at line 177 (`species_parquet`) and lines 211–215 (`occurrences_parquet_in`). In production the path is controlled, but the pattern is fragile.

**Fix:** Use DuckDB's parameter binding for the parquet path or sanitize/assert the path string contains no single-quotes before interpolation:
```python
fetched = con.execute(
    "SELECT " + mart_cols + " FROM read_parquet(?) ORDER BY canonical_name",
    [str(species_parquet_in)]
).fetchall()
```

### WR-02: Checklist-county fill rendered AFTER backdrop counties — overwrites occurrence dots when rendered on top

**File:** `data/species_maps.py:184–204`

**Issue:** `_write_species_svg` calls `copy.deepcopy(backdrop)` which contains all county `<path class="county">` elements, then appends `<path class="checklist-county">` elements to the same root, then appends occurrence `<circle>` dots. SVG document order equals z-order, so the checklist fill paths render above the grey county backdrop (correct) but they also sit in document order before the occurrence dots (correct). However, the backdrop deepcopy at line 184 already includes the full county polygon set. The checklist fill paths are appended directly onto the root after deepcopy, which means in the final SVG they appear after all backdrop county paths but before circles — this is the intended order.

**Actual defect:** The attribute-sort loop at lines 226–228 sorts `elem.attrib` in-place using `dict(sorted(...))`. In CPython 3.7+ dict preserves insertion order, so sorted keys produce deterministic output. But `ET.Element.attrib` is expected to be a plain dict — reassigning it via `elem.attrib = dict(...)` relies on ElementTree accepting arbitrary dict subclasses. This works in practice for `xml.etree.ElementTree` but is undocumented behaviour. The real risk: if the sort ever fires on the `<style>` element (which has no attribs) or other elements with `text` content, it is a no-op. No crash, but the pattern is fragile across Python versions.

More concretely: for the checklist-county fill elements the `class` attribute value `"checklist-county"` is written into `d` attrib path data that could be enormous. Sorting a 20 KB string-valued dict on every `elem.iter()` call for every species is quadratic in total SVG element count. This is flagged as a warning rather than a performance issue because it can mask the stability guarantee it intends to provide.

**Fix:** Limit the attribute sort to elements that actually have multiple attributes rather than iterating every element:
```python
for elem in root.iter():
    if len(elem.attrib) > 1:
        elem.attrib = dict(sorted(elem.attrib.items()))
```

### WR-03: `genusList` omits `checklistCount` property — asymmetric with `subgenusList`

**File:** `_data/species.js:140–152`

**Issue:** `subgenusList` computes and exports a `checklistCount` field (line 207) used in the `.filter` guard at line 220. `genusList` computes `checklistSpecies` (line 130–134) and appends them to the `species` array, but never sums a `checklistCount` field onto the returned object. The genus page template (`genus.njk:29–30`) correctly accesses `sp.checklist_count` (per-species field, fine), but there is no genus-level filter equivalent to the `subgenusList` filter at line 220. This means genera with zero WABA occurrences and only checklist species are always included in `genusList` (no filter at all), while subgenera with the same profile are correctly included only when `checklistCount > 0`. The asymmetry is not itself wrong (genusList has no filter), but it means genusList can contain genera with `totalOccurrences === 0` and no checklist species — any genus whose only members have `occurrence_count === 0` and `on_checklist === false` will appear as an empty genus page.

**Fix:** Add a parallel filter and `checklistCount` to `genusList`:
```javascript
const checklistCount = checklistSpecies.reduce((acc, sp) => acc + (sp.checklist_count || 0), 0);
return {
  genus: g.genus, family: g.family, subfamily: g.subfamily,
  species, speciesCount: speciesOnly.length,
  totalOccurrences: ...,
  checklistCount,
};
// then after .map():
.filter(g => g.totalOccurrences > 0 || g.checklistCount > 0)
```

### WR-04: `seasonality.json` size assertion fires after write — no cleanup on failure

**File:** `data/species_export.py:236–238`

**Issue:** The 6 MB budget assertion at line 236 fires after the file has already been written to `ASSETS_DIR`. If the assertion fails, the oversized `seasonality.json` is left on disk and will be deployed on the next pipeline run (since the pipeline does not clean up on assertion failure). The assertion also uses a bare `assert`, which is disabled when Python runs with `-O`. The nightly pipeline does not use `-O`, but relying on `assert` for a production data-integrity guard is fragile.

**Fix:** Check the size before writing, or raise `RuntimeError` instead of asserting:
```python
content = json.dumps(out_seas, sort_keys=True, separators=(',', ':'))
if len(content.encode()) >= 6 * 1024 * 1024:
    raise RuntimeError(
        f"seasonality.json would exceed 6 MB budget ({len(content.encode()):,} bytes)"
    )
seas_out.write_text(content, encoding='utf-8')
```

---

## Info

### IN-01: `_write_species_svg` receives `county_geojsons_by_name` parameter but the outer call passes `county_geojsons` (same dict, different name)

**File:** `data/species_maps.py:483`

**Issue:** `_write_species_svg` is defined with the parameter name `county_geojsons_by_name` (line 172) but called at line 483 with positional argument `county_geojsons` (the return value of `_load_county_geojsons`). Both are the same `dict[str, dict]` keyed by county name. The naming divergence between definition and call site could mislead future readers into thinking a different data structure is expected.

**Fix:** Rename the call-site variable or parameter to be consistent — `county_geojsons_by_name` throughout.

### IN-02: `VIZ-02` fallback shows empty range string for single-month species

**File:** `src/species/seasonality-viz.ts:72–77`

**Issue:** When exactly one month has data and `total < 5`, `monthsWithData.length === 1`. Per the D-08 comment the range is intentionally suppressed (`range = ''`). This is correct, but the resulting rendered text is just e.g. `"3 records"` with no month context at all. For a species observed only in July, the user sees "3 records" with no temporal hint. This is a deliberate trade-off (D-08) but was noted as a deferred UX concern.

**Fix:** Consider displaying the month name in full (e.g. "3 records (July)") when `monthsWithData.length === 1` to avoid the ambiguous single-letter problem without losing all context. Low priority — deferred per D-08.

---

_Reviewed: 2026-05-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
