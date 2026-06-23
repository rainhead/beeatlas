---
phase: 160-overlap-capable-place-model-many-to-many-membership
reviewed: 2026-06-23T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - data/dbt/models/marts/occurrence_places.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
  - data/places_validation.py
  - data/places_export.py
  - data/places_maps.py
  - data/sqlite_export.py
  - data/run.py
  - scripts/make-local-manifest.js
  - scripts/validate-db.mjs
  - src/filter.ts
  - src/bee-atlas.ts
  - src/bee-pane.ts
  - src/bee-occurrence-detail.ts
  - data/tests/test_sqlite_export.py
  - data/tests/test_places_maps.py
  - src/tests/bee-occurrence-detail.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues
---

# Phase 160: Code Review Report

**Reviewed:** 2026-06-23
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 160 replaces the scalar `place_slug` column on the `occurrences` mart with a
many-to-many `occurrence_places` bridge, enabling overlapping place polygons. The
core mechanics are sound:

- **occ_id CASE drift (focus #1):** The four copies of the synthetic occ_id CASE
  (`src/occurrence.ts:23-30`, `occurrence_places.sql:42-47`, `places_export.py:72-77`,
  `places_maps.py:75-80`, and the `OCC_ID_SQL_CASE` constant in `filter.ts:106-112`)
  are byte-for-byte identical in priority order: `ecdysis: → inat:(observation_id) →
  inat_obs:(specimen_observation_id) → checklist:`. **No drift found.**
- **Bridge join semantics (focus #2):** `occurrence_places.sql` correctly uses INNER
  JOIN (occurrences in no place get zero bridge rows), and `occurrences.sql` is NOT
  filtered by place membership. NULL occ_id rows (no matching CASE arm) cannot
  spuriously join because SQL `NULL = x` is never true; the contract also enforces
  `occ_id not_null` on the bridge.
- **State-ownership invariant (focus #5):** The D-04 membership fetch
  (`getOccurrencePlaceSlugs`, `_ensurePlaceNameBySlug`, `_resolvePlaceNames`) lives
  entirely in `<bee-atlas>` (the state owner). `<bee-pane>` and
  `<bee-occurrence-detail>` are pure presenters — verified they read only the
  passed-down `placeNames` property and never query wa-sqlite. A unit test asserts
  this.
- **Contract/whitelist consistency (focus #4):** `occurrences` is 36 columns
  (place_slug removed), `occurrence_places` carries a 2-col enforced contract, and
  both JS whitelists (`make-local-manifest.js`, `validate-db.mjs`) include
  `occurrence_places`. Consistent.
- **SQL injection (focus #1):** The frontend slug — the one user-influenced value —
  retains `'`→`''` escaping in both `filter.ts:315` (EXISTS clause) and
  `filter.ts:502` (`getOccurrencePlaceSlugs`). Good.

The findings below are latent correctness/robustness concerns the green test suites
do not exercise, plus documentation/consistency defects.

## Warnings

### WR-01: Bridge JOIN can inflate per-place counts/points if occ_id is non-unique

**File:** `data/places_export.py:88`, `data/places_maps.py:84`, `data/dbt/models/marts/occurrence_places.sql:41-51`
**Issue:** `_query_counts` and `generate_place_maps` both compute the synthetic
`occ_id` over `occurrences.parquet` (CTE `occ`) and then `JOIN read_parquet(...) b ON
b.occ_id = occ.occ_id`. Neither `occurrences.parquet` nor the `occurrence_places`
bridge has a uniqueness guarantee on `occ_id` / `(occ_id, place_slug)` — the bridge
mart deliberately drops the `DISTINCT ON` collapse, and both marts derive from
`int_combined` (a 4-arm UNION ALL) with no de-dup. If two distinct `int_combined`
rows ever resolve to the **same** occ_id and fall inside the **same** place, the
bridge gets two identical `(occ_id, place_slug)` rows; the occ↔bridge join then fans
out and `COUNT(CASE WHEN ecdysis_id ...)` (specimen_count) and the per-place point
list are inflated *within a single place* — which is explicitly the thing D-05 says
must NOT happen (double-count is intended *across* places only). The frontend EXISTS
clause is immune (it only needs ≥1 match), so this is silent and tests-green.

`sample_count` is protected by `COUNT(DISTINCT sample_id)`, but `specimen_count` (a
bare `COUNT(CASE ...)`) and the `places_maps` point list are not.

**Fix:** Make the invariant structural rather than assumed. Either (a) add a dbt
`dbt_utils.unique_combination_of_columns` test on `(occ_id, place_slug)` in
`schema.yml` so a collision fails the nightly gate loudly, or (b) defend the
aggregation against fan-out — e.g. count distinct occurrence identity per place:
```sql
COUNT(DISTINCT CASE WHEN occ.ecdysis_id IS NOT NULL THEN occ.occ_id END) AS specimen_count
```
and `SELECT DISTINCT b.place_slug, occ.lon, occ.lat` in `places_maps.py`. Option (a)
is the cleaner enforcement and matches the existing "dbt contract is the gate"
culture (CLAUDE.md).

### WR-02: `_resolvePlaceNames` has no stale-result guard — out-of-order list queries can show wrong place names

**File:** `src/bee-atlas.ts:1035`, `src/bee-atlas.ts:1063-1074`
**Issue:** `_runListQuery` wraps its query in `_listGuard` (stale-discard), but then
fires `void this._resolvePlaceNames(this._listRows)` *unguarded* after the guard
commits. `_resolvePlaceNames` itself awaits `_ensurePlaceNameBySlug()` (a `fetch`)
and `Promise.all(getOccurrencePlaceSlugs(...))`. If the user changes the place/filter
rapidly, two `_resolvePlaceNames` invocations can be in flight; whichever
`Promise.all` settles **last** wins and assigns `_placeNamesByOccId`, regardless of
which list query it corresponds to. The result is the detail pane briefly (or
persistently, if the slower one resolves last) showing member-place chips for a
superseded row set. This contradicts the project's filter-race-guard invariant
(CLAUDE.md: "Async results must be discarded if the counter has advanced").

**Fix:** Thread a generation counter (or reuse `makeStaleGuard`) around
`_resolvePlaceNames` so a superseded resolution does not overwrite
`_placeNamesByOccId`:
```ts
const myGen = ++this._placeNamesGeneration;
// ... after Promise.all ...
if (myGen !== this._placeNamesGeneration) return; // superseded
this._placeNamesByOccId = byOccId;
```

### WR-03: `generate_sqlite` reads the bridge parquet with no FileNotFoundError guard (inconsistent with sibling exporters)

**File:** `data/sqlite_export.py:441-444`
**Issue:** `generate_sqlite` does an unconditional
`CREATE TABLE out.occurrence_places AS SELECT * FROM read_parquet('{bridge_parquet}')`.
If the bridge parquet is absent, DuckDB raises a raw `IOException` with no
actionable "run dbt before X" hint. Both sibling exporters touched in this phase
(`places_export._query_counts:62-65` and `places_maps:56-60`) DO guard the same file
with a friendly `FileNotFoundError`. This is an inconsistency that will produce a
cryptic failure if the pipeline ordering ever changes or a partial sandbox is used.
Additionally, `_create_taxa_indexes` unconditionally creates `idx_occ_places` on
`occurrence_places` — if a future change makes the bridge table conditional, that
index DDL would fail.

**Fix:** Add the same pre-check used by the siblings before the CREATE TABLE:
```python
bridge_parquet = src_parquet.parent / "occurrence_places.parquet"
if not bridge_parquet.exists():
    raise FileNotFoundError(
        f"{bridge_parquet} not found — run dbt before generate-sqlite"
    )
```

## Info

### IN-01: `places_maps.py` interpolates parquet paths into SQL via f-string while `places_export.py` parameterizes them

**File:** `data/places_maps.py:81`, `data/places_maps.py:84`
**Issue:** `generate_place_maps` builds its query with f-string interpolation of
`occurrences_parquet` / `bridge_parquet` directly into the SQL text, whereas the
analogous `_query_counts` in `places_export.py:78,88` binds them as `?` parameters.
The paths are internal (derived from `ASSETS_DIR`, not user input), so this is not an
injection vulnerability today — but it is an inconsistent pattern, and a path
containing a single quote (unlikely but possible via `EXPORT_DIR`) would break the
query.
**Fix:** Use parameter binding for symmetry with `places_export.py`:
`con.execute("... read_parquet(?) ... read_parquet(?) b ...", [str(occurrences_parquet), str(bridge_parquet)])`.

### IN-02: `validate_places` docstring still claims it raises on "overlap"

**File:** `data/places_validation.py:31-33`
**Issue:** The D-03 change removed the pairwise `ST_Overlaps` rejection (correctly —
the module header at lines 14-16 documents this). But the `validate_places` docstring
still reads: "Raises ValueError(...) for the first violation found in each category
(slug, geometry, **overlap**)." Stale documentation — overlap is no longer a category.
**Fix:** Change "(slug, geometry, overlap)" to "(slug, geometry/WGS84, permit)" to
match the actual checks.

### IN-03: `validate_places` numbered comments are off-by-one vs the docstring

**File:** `data/places_validation.py:81,93`
**Issue:** The module docstring lists 5 checks (1 slug, 2 dup, 3 permit, 4 WKT, 5
WGS84), but the inline comments label the WKT check "# 3. WKT validity" (line 81) and
the bounds check "# 4. WGS84 bounds" (line 93), while the section banner above them
says "# 4 + 5 — Geometry validity and WGS84 bounds". The inline numbers drifted when
the permit check (now #3) was inserted. Cosmetic, but mildly confusing when tracing
checks.
**Fix:** Renumber the inline comments to `# 4. WKT validity` and `# 5. WGS84 bounds`.

### IN-04: Bridge mart header cites `occurrences.sql:73-78` for the ST_Within join, but that range no longer matches

**File:** `data/dbt/models/marts/occurrence_places.sql:4-5`
**Issue:** The header says the bridge is sourced from "the SAME ST_Within join
occurrences.sql used (occurrences.sql:73-78)". After this phase dropped the
`with_place`/`place_dedup` CTEs from `occurrences.sql`, lines 73-78 of that file are
now the place_slug-dropped comment and the start of the final SELECT — the ST_Within
place join no longer exists there at all (it moved into this bridge file). The line
reference is stale and will mislead a future reader trying to cross-check.
**Fix:** Update the comment to note the place ST_Within join now lives only in this
bridge file; drop the dangling `occurrences.sql:73-78` citation.

## CODE REVIEW COMPLETE
