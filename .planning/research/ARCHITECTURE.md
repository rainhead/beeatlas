# Architecture Audit — Domain Logic Scatter (v3.8 Conceptual Tidying)

**Domain:** Washington Bee Atlas — occurrence data pipeline + static SPA
**Audited:** 2026-05-18
**Confidence:** HIGH — all referenced files read end-to-end; scatter evidence is cited with file and line numbers

---

## Overview

This audit traces domain intelligence (predicates, entity construction, field-mapping) across five layers:

- `data/dbt/models/` — SQL staging views and mart models
- `data/*.py` — Python pipeline modules
- `src/sqlite.ts` — SQLite table DDL (inline schema definition)
- `src/filter.ts` — TypeScript OccurrenceRow type + OCCURRENCE_COLUMNS + buildFilterSQL
- `src/bee-occurrence-detail.ts`, `src/bee-atlas.ts`, `src/bee-table.ts`, `src/features.ts` — rendering and coordination

The five domain entities to trace are: **Specimen**, **Sample**, **Occurrence**, **Place**, **Taxon**.

---

## Refactoring Target 1 (Highest Impact): occId Construction Inline at Every Call Site

### What is scattered

The logic for constructing an occurrence ID string (`"ecdysis:<N>"` vs `"inat:<N>"`) — the discriminant predicate for the entire Occurrence entity — is repeated inline at **six separate call sites** across the TypeScript layer, with no named function.

| File | Line(s) | Pattern |
|------|---------|---------|
| `src/features.ts` | 46–48 | `obj.ecdysis_id != null ? 'ecdysis:' + obj.ecdysis_id : 'inat:' + Number(obj.observation_id)` |
| `src/features.ts` | 81 | `f.properties.occId.startsWith('ecdysis:')` (totalSpecimens count) |
| `src/bee-atlas.ts` | 748 | `r.ecdysis_id != null ? \`ecdysis:${r.ecdysis_id}\` : \`inat:${Number(r.observation_id)}\`` |
| `src/bee-atlas.ts` | 1006 | identical construction |
| `src/bee-atlas.ts` | 1026 | identical construction |
| `src/bee-table.ts` | 40–41 | `rowOccId()` function — but defined locally and not exported |
| `src/bee-atlas.ts` | 473–477 | Inverse: parse `"ecdysis:"` prefix to extract integer ID |
| `src/bee-atlas.ts` | 933–938 | Inverse: split `_selectedOccIds` by prefix into ecdysis/inat int arrays |
| `src/url-state.ts` | 192 | Validation: `.startsWith('ecdysis:') || .startsWith('inat:')` |
| `src/bee-map.ts` | 966 | `f.properties.occId.startsWith('ecdysis:')` |

The entity predicate "is this a specimen-backed occurrence vs. sample-only?" is expressed in three different forms:
- `ecdysis_id != null` (SQL/TS row field test)
- `occId.startsWith('ecdysis:')` (string prefix test on the derived ID)
- `is_provisional === true` (a third path for WABA provisional rows with no ecdysis_id AND no sample observation_id in the iNat collection arm)

The three-way classification (specimen / sample-only / provisional) is reasoned about in `bee-occurrence-detail.ts` render() (lines 247–259) and implicitly in `queryFilteredCounts` (filter.ts line 297: `WHERE ecdysis_id IS NOT NULL`), but neither place defines it with a name.

### Why this matters

Adding a new occurrence arm (e.g., a future data source) currently requires hunting down and updating all six construction sites and every predicate. A named pair of functions — `occIdFromRow(row)` and `parseOccId(id)` — in `filter.ts` (where `OccurrenceRow` is already defined) would be the single source of truth.

### What the fix looks like

```typescript
// In filter.ts (alongside OccurrenceRow)
export function occIdFromRow(row: Pick<OccurrenceRow, 'ecdysis_id' | 'observation_id'>): string {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  return `inat:${Number(row.observation_id)}`;
}

export function parseOccId(id: string): { source: 'ecdysis'; id: number } | { source: 'inat'; id: number } | null {
  if (id.startsWith('ecdysis:')) { const n = parseInt(id.slice(8), 10); return isNaN(n) ? null : { source: 'ecdysis', id: n }; }
  if (id.startsWith('inat:'))    { const n = parseInt(id.slice(5),  10); return isNaN(n) ? null : { source: 'inat',    id: n }; }
  return null;
}

export type OccurrenceKind = 'specimen' | 'sample-only' | 'provisional';

export function occurrenceKind(row: Pick<OccurrenceRow, 'ecdysis_id' | 'is_provisional'>): OccurrenceKind {
  if (row.ecdysis_id != null)  return 'specimen';
  if (row.is_provisional)      return 'provisional';
  return 'sample-only';
}
```

---

## Refactoring Target 2 (High Impact): Occurrence Schema Defined in Three Places

### What is scattered

The canonical column list for an occurrence row is written out three times, in three languages, with slightly different names and types:

| Location | Form | Lines |
|----------|------|-------|
| `data/dbt/models/marts/schema.yml` | YAML dbt contract (31 columns) | 9–70 |
| `src/sqlite.ts` `CREATE TABLE occurrences` | SQL DDL string literal | 67–99 |
| `src/filter.ts` `OCCURRENCE_COLUMNS` const | TypeScript `as const` string array | 58–65 |
| `src/filter.ts` `OccurrenceRow` interface | TypeScript interface with types | 25–56 |

These four definitions must be kept in sync manually. The dbt contract is the authoritative schema gate for the parquet file; the SQLite DDL is a load-time materialization of the same schema in the browser; `OCCURRENCE_COLUMNS` is an ordered projection list; `OccurrenceRow` adds TypeScript types.

**Drift already present:**
- `is_provisional` is `BOOLEAN` in dbt schema.yml (line 62) but `INTEGER` in `sqlite.ts` (line 91), because SQLite has no boolean. The mapping is implicit.
- `year` and `month` are `BIGINT` in dbt (from DuckDB arithmetic) but `INTEGER` in SQLite — mapping is implicit.
- `host_observation_id`, `observation_id`, `specimen_observation_id`, `sample_id` are `BIGINT` in dbt but `INTEGER` in SQLite — acceptable coercion but undocumented.
- `OCCURRENCE_COLUMNS` (filter.ts:58–65) lists 30 column names, but `OccurrenceRow` (filter.ts:25–56) has 31 fields including `canonical_name` which is NOT in OCCURRENCE_COLUMNS. This means `canonical_name` is loaded into the SQLite table but never SELECT'd by any filter query — it exists as dead weight.

### Why this matters

Every time a new column is added to the dbt mart (e.g., `place_slug` in v3.7), three other files must be updated by hand: `sqlite.ts`, `OCCURRENCE_COLUMNS`, and `OccurrenceRow`. This is the most common source of "31-column contract" work and the most likely source of subtle bugs from omission.

### What the fix looks like

A TypeScript module `src/occurrence-schema.ts` that is the single source of truth for the column list, the SQLite DDL fragment, and the TypeScript type. The dbt contract (YAML) necessarily stays separate — it lives in the Python/SQL layer — but the three TypeScript definitions can be collapsed. The DDL generation can be driven from the column list: `OCCURRENCE_COLUMNS.map(col => `${col} ${SQL_TYPE[col]}`).join(', ')`.

This is medium-complexity refactoring (touching sqlite.ts, filter.ts, and any tests that inspect the DDL), but the payoff is that future column additions require one edit instead of four.

---

## Refactoring Target 3 (High Impact): `BEE_FAMILIES` List Duplicated Between Python and SQL

### What is scattered

The canonical set of seven bee families (the Anthophila predicate) is defined independently in two places:

| Location | Form | Lines |
|----------|------|-------|
| `data/species_export.py` | Python tuple `BEE_FAMILIES` | 51–54 |
| `data/dbt/models/intermediate/int_species_universe.sql` | SQL `WHERE family IN (...)` literal | 73–75 |

```python
# species_export.py:51
BEE_FAMILIES = (
    'Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
    'Megachilidae', 'Melittidae', 'Stenotritidae',
)
```

```sql
-- int_species_universe.sql:73
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
```

`species_export.py` actually does not use `BEE_FAMILIES` to filter — it is defined as a comment/documentation constant (the actual filter is in the SQL). This means the Python constant is currently dead code, and the SQL literal is the only live gate.

**Consequence:** If a taxonomist recognizes a new bee family (rare, but happens — Melittidae has been split historically), the SQL is the only place that needs updating today, and the Python constant silently diverges.

### Why this matters

The bee-vs-non-bee predicate determines what appears in the species tree and what is excluded. A silent drift between the two definitions would produce a species tree that disagrees with the occurrence map for edge-case taxa.

### What the fix looks like

A dbt macro `bee_families()` that returns the SQL-safe IN-list string, used in `int_species_universe.sql`. The Python constant either becomes a reference import from a shared `domain.py` module (if the filter is ever needed in Python) or is deleted (since the SQL is the only gate). The recommended approach for this codebase: keep the predicate in SQL (where it is enforced), delete the dead Python constant, and add a comment in `int_species_universe.sql` that this list is the sole definition.

---

## Refactoring Target 4 (Medium Impact): iNat Field-ID Constants Inline in SQL, No Named Home

### What is scattered

iNaturalist observation field IDs are magic integers embedded directly in SQL JOINs across three dbt models. There is no named constant file or macro:

| field_id | Meaning | Location |
|---------|---------|---------|
| `8338` | Specimen count (number of bees collected) | `int_samples_base.sql:15` |
| `9963` | Sample ID (sequential per-person-per-day) | `int_samples_base.sql:17` |
| `18116` | Ecdysis catalog suffix (links WABA obs → specimen) | `int_waba_link.sql:9` |
| `1718` | Host observation URL (WABA → iNat collection obs) | `int_combined.sql:83` |

The only documentation for these values lives in inline SQL comments. The `waba_pipeline.py` file (line 54) mentions `field_id=18116` in a docstring but does not define a named constant.

The semantics of field 8338 are particularly load-bearing: v1.2 Key Decisions notes "Match iNat ofvs by field_id not name — Field renamed ... name matching drops ~40% of historical data." The field ID is the stable identifier, and there is exactly one place to change it if iNat ever retires it — but that one place is an anonymous integer in a SQL JOIN condition.

### Why this matters

If any field_id needs updating, a grep for the integer is the only discovery mechanism. There is no index of "these are the iNat field IDs this project depends on." This is a documentation and maintenance hazard, not a correctness hazard today.

### What the fix looks like

A dbt variables file (`dbt_project.yml` `vars:` block) or a `macros/inat_field_ids.sql` macro that defines named references:

```sql
-- macros/inat_field_ids.sql
{% macro inat_field_specimen_count() %}8338{% endmacro %}
{% macro inat_field_sample_id() %}9963{% endmacro %}
{% macro inat_field_ecdysis_catalog_suffix() %}18116{% endmacro %}
{% macro inat_field_waba_host_obs_url() %}1718{% endmacro %}
```

Then `int_samples_base.sql:15` becomes `AND sc.field_id = {{ inat_field_specimen_count() }}`. This is low-risk, purely additive, and makes future field_id changes one-touch.

---

## Refactoring Target 5 (Medium Impact): `_slugify` / `slugify` Duplicated Between Python and TypeScript

### What is scattered

A URL-safe slug function exists in two languages with slightly different behavior:

| Location | Function | Lines | Behavior |
|----------|----------|-------|---------|
| `data/feeds.py` | `_slugify(value)` | 132–148 | Unicode NFKD normalize → ASCII → lowercase → spaces/dots → hyphens → strip non-alphanum → collapse hyphens; fallback `'unknown'` |
| `src/filter.ts` | `slugify(s)` (unexported) | 74–81 | lowercase → collapse whitespace → strip non-`a-z0-9-` → collapse hyphens → strip leading/trailing → slice to 20 chars |

`species_export.py` imports `_slugify` from `feeds.py` (line 30) for the species slug, establishing `feeds._slugify` as the Python canonical. The TypeScript `slugify` in `filter.ts` is used only for `buildCsvFilename` (the export filename), not for any URL-path slug. The two functions are not byte-for-byte identical: Python does Unicode normalization; TypeScript does not. TypeScript truncates to 20 characters; Python does not.

**Impact:** Low for correctness today (the TypeScript version is only used for CSV filenames, never for URL paths that must round-trip with Python). The divergence becomes a problem if `slugify` is ever needed for URL generation on the TypeScript side, because species page slugs (`/species/Genus/epithet/`) are built by Python `_slugify` and the TypeScript implementation would not produce the same output for accented names.

**Separate issue:** `_slugify` lives in `feeds.py`, which is primarily an Atom feed generator. `species_export.py` imports it from there solely because that is where it was first defined. This is an implicit coupling between two unrelated concerns: slug canonicalization and feed generation.

### What the fix looks like

Extract `_slugify` from `feeds.py` into a new `data/domain.py` module. Both `feeds.py` and `species_export.py` import from `domain.py`. This also provides a home for `BEE_FAMILIES` (Target 3) and the iNat field ID constants if they are moved to Python rather than dbt macros. The TypeScript `slugify` in `filter.ts` is not worth unifying across languages — keep it local and document that it is only for CSV filenames.

---

## Refactoring Target 6 (Lower Impact): "Plantae" Host Detection Written Twice in SQL

### What is scattered

The predicate "is this iNat observation a plant?" — used to derive the display name of the floral host — appears as an identical `CASE` expression in two separate dbt intermediate models:

| Location | Expression | Lines |
|----------|-----------|-------|
| `int_ecdysis_base.sql` | `CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host` | 21 |
| `int_samples_base.sql` | `CASE WHEN op.taxon__iconic_taxon_name = 'Plantae' THEN op.taxon__name ELSE NULL END AS sample_host` | 12 |

The two expressions are semantically identical but applied to different source columns (`inat.taxon__name` vs. `op.taxon__name`) and produce different output column names (`inat_host` vs. `sample_host`). A macro or Jinja expression `{{ is_plant_host('obs') }}` could encapsulate the predicate while allowing the alias to differ.

**Impact:** Very low today. The two call sites are easy to find and update together. Worth doing as part of a broader macro cleanup rather than standalone.

---

## Secondary Scatter Findings (Not Top-5, But Documented)

### Year-Bucket Logic in `bee-filter-panel.ts`

The functions `yearBucketsToFilter` and `filterToYearBuckets` (lines 13–36) encode the business rule "thisYear = current calendar year, lastYear = CY−1, earlier = everything before." This is domain logic (recency bucketing) embedded in a Lit component. It references `CY` / `PY` which mirror the `recencyTier` logic in `style.ts` (lines 10–13). The two definitions use the same concept but are not connected: `style.ts` computes `_thisYear` and `_lastYear` as module-level constants; `bee-filter-panel.ts` computes `CY` and `PY` independently. These could share a single `CURRENT_YEAR` / `PREVIOUS_YEAR` export from `style.ts`.

### `is_provisional` Predicate in `places_export.py`

`places_export.py` (line 54) contains:
```sql
COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count
```

This is a definition of "what counts as a specimen for place statistics" — a domain predicate embedded in a one-off SQL string inside a Python function. The same question is answered differently in `filter.ts` (line 297):
```sql
WHERE ecdysis_id IS NOT NULL AND ${occurrenceWhere}
```

These two predicates are not the same: `ecdysis_id IS NOT NULL` is a tighter constraint (only Ecdysis-backed rows) while `is_provisional = false` admits sample-linked iNat rows that have an Ecdysis record via the ARM 1 full-outer-join. The intent is probably the same (count confirmed specimens, not provisional WABA-only rows), but the expressions diverge. This is a subtle semantic inconsistency hiding behind two independent inline SQL fragments.

### `sample_host` and `inat_host` as Parallel Columns

The occurrence mart has both `floralHost` (from Ecdysis `associated_taxa` regex extraction) and `inat_host` (from iNat observation Plantae check) for the ARM 1 ecdysis rows, and `sample_host` (from iNat observation Plantae check) for the iNat-only arm. The frontend `_renderHostInfo` in `bee-occurrence-detail.ts` (lines 157–167) knows about this three-way structure and resolves display priority: Ecdysis floralHost > iNat host, with conflict display if they disagree. This host-resolution logic is a domain rule embedded in a render method.

---

## Architecture Layer Map

```
dbt SQL models                Python pipeline               TypeScript frontend
──────────────────────        ──────────────────────        ──────────────────────
int_ecdysis_base.sql          canonical_name.py             filter.ts
  floralHost (regex)            canonicalize()                OccurrenceRow (type)
  inat_host (Plantae CASE)                                    OCCURRENCE_COLUMNS
  elevation_m (TRY_CAST)      feeds.py                        buildFilterSQL()
                                _slugify()                    occIdFromRow (MISSING)
int_samples_base.sql                                          isFilterActive()
  sample_host (Plantae CASE)  species_export.py
  field_id 8338, 9963           BEE_FAMILIES (dead const)   sqlite.ts
                                _slugify (imported)           CREATE TABLE occurrences
int_combined.sql                                              (31 columns, inline DDL)
  is_provisional = TRUE/FALSE   [no shared domain module]
  field_id 18116, 1718                                      features.ts
                              [field_ids as bare integers     occIdFromRow (inline)
int_specimen_obs_base.sql      in SQL, no Python names]       isSpecimen (inline)
  Plantae check ABSENT
  (taxon__name passes through)                              bee-occurrence-detail.ts
                                                              occurrenceKind (inline)
occurrences.sql (mart)                                        hostDisplay (inline)
  31-column SELECT                                            is_provisional branch

                                                            bee-atlas.ts
schema.yml (dbt contract)                                     occIdFromRow (×3 inline)
  31 YAML column entries                                      parseOccId (×4 inline)
```

---

## Ranking by Impact

| Rank | Target | Files Touched | Risk of Fix |
|------|--------|--------------|-------------|
| 1 | `occIdFromRow` / `parseOccId` / `occurrenceKind` — extract named functions | `filter.ts`, `features.ts`, `bee-atlas.ts`, `bee-table.ts`, `bee-map.ts`, `url-state.ts` | LOW — pure refactor, no behavior change |
| 2 | Occurrence schema single source — `occurrence-schema.ts` | `sqlite.ts`, `filter.ts`, tests | MEDIUM — touches DDL generation |
| 3 | `BEE_FAMILIES` dead constant + SQL duplicate | `species_export.py`, `int_species_universe.sql` | LOW — delete Python constant; SQL unchanged |
| 4 | iNat field_id constants as named dbt macros | `int_samples_base.sql`, `int_waba_link.sql`, `int_combined.sql`, `macros/` | LOW — purely additive, no logic change |
| 5 | `_slugify` moved to `data/domain.py` | `feeds.py`, `species_export.py`, new `domain.py` | LOW — import path change only |
| 6 | `is_provisional` predicate inconsistency (places_export vs filter.ts) | `places_export.py`, `filter.ts` | MEDIUM — requires semantic decision |
| 7 | Year-bucket / recency-tier constants shared | `style.ts`, `bee-filter-panel.ts` | LOW — trivially extractable |
| 8 | Plantae host CASE → dbt macro | `int_ecdysis_base.sql`, `int_samples_base.sql`, new macro | LOW — cosmetic, no behavior change |

---

## Sources (all read end-to-end)

- `/Users/rainhead/dev/beeatlas/src/filter.ts` — OccurrenceRow, OCCURRENCE_COLUMNS, buildFilterSQL, occIdFromRow scatter
- `/Users/rainhead/dev/beeatlas/src/features.ts` — occId construction + isSpecimen inline
- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts` — occId construction ×3, parseOccId ×2, 1073 lines
- `/Users/rainhead/dev/beeatlas/src/bee-table.ts` — rowOccId local function (lines 39–43)
- `/Users/rainhead/dev/beeatlas/src/bee-occurrence-detail.ts` — occurrenceKind inline (lines 247–259), hostDisplay
- `/Users/rainhead/dev/beeatlas/src/bee-filter-panel.ts` — yearBuckets domain logic
- `/Users/rainhead/dev/beeatlas/src/sqlite.ts` — CREATE TABLE occurrences DDL (lines 67–99)
- `/Users/rainhead/dev/beeatlas/src/style.ts` — recencyTier, CY/PY constants
- `/Users/rainhead/dev/beeatlas/src/url-state.ts` — occId prefix validation (line 192)
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql` — 31-column SELECT
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml` — dbt enforced contract (31 columns)
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_combined.sql` — is_provisional arms, field_id 1718/18116
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_ecdysis_base.sql` — floralHost regex, inat_host Plantae CASE
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_samples_base.sql` — sample_host Plantae CASE, field_id 8338/9963
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_waba_link.sql` — field_id 18116
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_species_universe.sql` — BEE_FAMILIES SQL literal (lines 73–75)
- `/Users/rainhead/dev/beeatlas/data/species_export.py` — BEE_FAMILIES Python const (lines 51–54), _slugify import
- `/Users/rainhead/dev/beeatlas/data/feeds.py` — _slugify definition (lines 132–148)
- `/Users/rainhead/dev/beeatlas/data/canonical_name.py` — canonicalize() — a well-structured single-source-of-truth example
- `/Users/rainhead/dev/beeatlas/data/places_export.py` — is_provisional predicate (line 54)

---
*Audit for: v3.8 Conceptual Tidying milestone*
*Audited: 2026-05-18*
