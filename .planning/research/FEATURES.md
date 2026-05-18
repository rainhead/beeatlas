# Feature Landscape — v3.8 Conceptual Tidying

**Domain:** Domain model centralization for a multi-language citizen-science bee atlas (Python pipeline, dbt SQL models, TypeScript frontend)
**Researched:** 2026-05-18
**Confidence:** HIGH — findings are based on direct codebase inspection, not speculation. Every assertion maps to a specific file and line range.

> Scope: What domain logic to extract, where it is currently scattered, and what the boundaries of well-bounded modules look like for this codebase. This is a refactoring milestone, not a feature-addition milestone.

---

## The Actual Problem: Where Domain Intelligence Lives Today

### Occurrence ID Construction (SCATTERED, HIGH IMPACT)

The canonical occurrence ID is `"ecdysis:{ecdysis_id}"` for Ecdysis specimen rows and `"inat:{observation_id}"` for iNat-only sample rows. This construction appears in at least **six different places** in the TypeScript layer alone:

| Site | Pattern | File |
|------|---------|------|
| GeoJSON feature builder | `obj.ecdysis_id != null ? 'ecdysis:' + obj.ecdysis_id : 'inat:' + Number(obj.observation_id)` | `features.ts:46-48` |
| Table row ID helper | `if (row.ecdysis_id != null) return 'ecdysis:${row.ecdysis_id}'` | `bee-table.ts:39-41` |
| Bounds query results | `` r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}` `` | `bee-atlas.ts:748` |
| Cluster restore | same pattern | `bee-atlas.ts:1006, 1026` |
| ID parsing (ecdysis branch) | `id.slice('ecdysis:'.length)` | `bee-atlas.ts:474, 933-934` |
| ID parsing (inat branch) | `id.slice('inat:'.length)` | `bee-atlas.ts:476, 937-938` |
| Filter via visible IDs | same pattern | `filter.ts:322-324` |

And in `features.ts:81`, counting specimens uses `f.properties.occId.startsWith('ecdysis:')` — the prefix again.

**What a centralized module gives:** A single `occId(row)` function in `src/occurrence.ts`, a `parseOccId(id)` function returning `{source: 'ecdysis'|'inat', numericId: number}`, and an `isSpecimen(row)` predicate. Every caller imports from one place. The prefix strings become constants (`ECDYSIS_PREFIX`, `INAT_PREFIX`).

### Occurrence Type Discrimination (SCATTERED, HIGH IMPACT)

Three distinct occurrence sub-types are rendered differently but their classification logic is not centralized:

| Type | Discriminator | Used In |
|------|--------------|---------|
| Specimen-backed (Ecdysis row) | `r.ecdysis_id != null` | `bee-occurrence-detail.ts:247`, `filter.ts:288-297 (queryFilteredCounts)` |
| Sample-only (iNat observation without Ecdysis match) | `r.ecdysis_id == null && !r.is_provisional` | `bee-occurrence-detail.ts:248, 255` |
| Provisional WABA (iNat observation, no Ecdysis catalog match yet) | `r.is_provisional` | `bee-occurrence-detail.ts:256`, `int_combined.sql:50 (ARM 2)` |

The discriminators `ecdysis_id != null`, `ecdysis_id == null`, and `is_provisional` appear inline at render sites. `bee-occurrence-detail.ts:247-256` partitions rows into `specimenBacked` and `sampleOnly` then further branches on `is_provisional` — all at the render call site. In `bee-atlas.ts`, the `WHERE ecdysis_id IS NOT NULL` SQL appears three times (lines 356, 373, 426) for specimen-specific queries.

**What a centralized module gives:** Three named predicates: `isSpecimenBacked(row)`, `isSampleOnly(row)`, `isProvisional(row)`. The SQL fragment `ecdysis_id IS NOT NULL` becomes a constant `SPECIMEN_WHERE`. Callers no longer need to know the discriminating column.

### Floral Host URL Construction (SCATTERED, MEDIUM IMPACT)

External links to iNat observations are built inline at four sites:
- `bee-occurrence-detail.ts:185` — `https://www.inaturalist.org/observations/${row.host_observation_id}` (host plant)
- `bee-occurrence-detail.ts:188` — `https://www.inaturalist.org/observations/${row.specimen_observation_id}` (specimen photo)
- `bee-occurrence-detail.ts:218` — `https://www.inaturalist.org/observations/${row.observation_id}` (sample observation)
- `bee-occurrence-detail.ts:238` — same pattern (provisional WABA)
- `bee-table.ts:57-58` — same pattern
- `bee-table.ts:357-358` — `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}` (Ecdysis page)

**What a centralized module gives:** `inatObservationUrl(id)` and `ecdysisOccurrenceUrl(ecdysisId)` in `src/occurrence.ts`. If URL structure ever changes, one edit.

### Slug Construction (SPLIT ACROSS LANGUAGES, MEDIUM IMPACT)

The `_slugify` function in `data/feeds.py:132-148` (NFKD normalization → ASCII → lowercase → hyphens → strip) is used for collector and genus feed slugs. A separate slug pattern for species is in `data/species_export.py:143-147`: `"{genus}/{epithet}"` for binomial species, falling back to `_slugify(scientificName)` for genus-only rows. `data/feeds.py` exports `_slugify` (by import convention) and `data/species_export.py` imports it directly. There is no single `slug.py` module that owns all slug logic.

In the TypeScript layer, `buildCsvFilename` in `filter.ts:74-80` has its own local `slugify()` function that is NOT the same algorithm as the Python one (no NFKD normalization). These are separate use cases (filename segment vs. URL path) but the split is implicit.

**What a centralized module gives:** A `data/slugs.py` module holding both `general_slug(value)` (the NFKD-normalize-then-lowercase algorithm) and `taxon_slug(genus, epithet)` (the `{genus}/{epithet}` pattern). Everything that produces a URL-path slug imports from `slugs.py`.

### Bee Family Filter (IN ONE PLACE, GOOD)

`BEE_FAMILIES` tuple in `data/species_export.py:51-54` is the canonical list of bee families. It is only used in one place. This is already well-bounded and should stay where it is unless `species_export.py` grows large enough to warrant splitting.

### Name Canonicalization (WELL-BOUNDED, KEEP AS-IS)

`data/canonical_name.py` is an example of what a well-bounded domain module looks like: single file, single algorithm, clear docstring pinning the algorithm steps, idempotence property stated, imported by several pipeline modules. No changes needed here.

### `OccurrenceRow` Type and Column List (CENTRALIZED, ALREADY GOOD)

`OccurrenceRow` interface and `OCCURRENCE_COLUMNS` constant in `filter.ts:25-65` are already the single definition. `bee-occurrence-detail.ts`, `bee-table.ts`, and `bee-atlas.ts` all import from `filter.ts`. This is the right shape.

**One weakness:** `filter.ts` is named after its function (filter SQL building), but it also owns the occurrence data shape. This naming mismatch means new developers look for the type definition in the wrong file. Renaming or re-exporting from a more semantically appropriate file (`src/occurrence.ts`) would clarify intent without changing behavior.

### SQL Field Extraction Logic (IMPLICIT DUPLICATION ACROSS LAYERS)

The same semantic operation — "is this a plant taxon?" — appears in both dbt SQL and the pipeline:

- `int_ecdysis_base.sql:21`: `CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host`
- `int_samples_base.sql:12`: `CASE WHEN op.taxon__iconic_taxon_name = 'Plantae' THEN op.taxon__name ELSE NULL END AS sample_host`

The same CASE expression appears twice in two different intermediates. In dbt, this is addressable with a macro. A macro `is_plant_taxon(table_alias)` or just inlining the condition into a staging view `stg_inat__plant_obs` would eliminate the duplication.

---

## Table Stakes for This Refactoring Milestone

Features (conceptual moves) that must happen or the milestone fails its stated goal.

| Extraction | Why Required | Current Location | Target Location | Complexity |
|------------|-------------|-----------------|-----------------|------------|
| `occId(row)` constructor function | Used 6+ times inline; prefix strings scattered | `features.ts`, `bee-atlas.ts`, `bee-table.ts`, `filter.ts` | `src/occurrence.ts` | LOW |
| `parseOccId(id)` parser | ID splitting/prefix-stripping at 4+ sites | `bee-atlas.ts:473-478, 933-938` | `src/occurrence.ts` | LOW |
| `isSpecimenBacked`, `isSampleOnly`, `isProvisional` predicates | Discriminator logic at render and query sites | `bee-occurrence-detail.ts:247-256`, `bee-atlas.ts:356,373,426` | `src/occurrence.ts` | LOW |
| `inatObservationUrl`, `ecdysisOccurrenceUrl` | URL templates at 5+ sites | `bee-occurrence-detail.ts`, `bee-table.ts` | `src/occurrence.ts` | LOW |
| `data/slugs.py` module | `_slugify` used across pipeline; `taxon_slug` pattern in species_export | `feeds.py:132-148`, `species_export.py:143-147` | `data/slugs.py` | LOW |
| dbt `is_plant_taxon` macro | Same CASE expression in two SQL intermediates | `int_ecdysis_base.sql:21`, `int_samples_base.sql:12` | `data/dbt/macros/` | LOW |

---

## Differentiators (Worth Doing in v3.8 if Cheap)

Features that go beyond table stakes but would leave the codebase materially better.

| Extraction | Value | Complexity | Notes |
|------------|-------|------------|-------|
| `SPECIMEN_WHERE` SQL constant | Three occurrences of `ecdysis_id IS NOT NULL` in `bee-atlas.ts` | LOW | Could live in `filter.ts` or a new `src/sql-fragments.ts` |
| TypeScript `OccurrenceRow` import consolidation | The type is already in `filter.ts` but the module name misleads; re-export from a stable `occurrence.ts` | LOW | `filter.ts` stays; `occurrence.ts` re-exports `OccurrenceRow` and adds behavior |
| `canonicalize()` Python — move from `canonical_name.py` to `taxon.py` | The module correctly centralizes canonicalization but is not explicitly a "taxon" module; a `taxon.py` with `canonicalize`, `BEE_FAMILIES`, `taxon_slug` would be the correct boundary | LOW–MEDIUM | Requires updating ~4 importers |

---

## Anti-Features (Explicitly Do Not Build)

| Anti-Feature | Why Tempting | Why Wrong | What to Do Instead |
|--------------|-------------|-----------|-------------------|
| `OccurrenceRow` class with methods | OOP feels natural for entity logic | wa-sqlite returns plain dicts; wrapping would require a conversion step everywhere rows are fetched; adds allocations and complexity | Keep `OccurrenceRow` as a plain interface; put functions in a module that takes `OccurrenceRow` as a parameter |
| Abstract base class / dataclass for Occurrence in Python | Seem to mirror TypeScript interface | Pipeline rows are DuckDB result tuples; a class hierarchy would require wrapping at the DuckDB boundary; DuckDB structs / Polars DataFrames don't need wrapping | Pure functions taking dict/tuple are the right level of abstraction |
| Shared schema contract file (JSON Schema or protobuf) across Python and TypeScript | Seems like "one source of truth" | The dbt 31-column contract already enforces schema at build time; adding a separate schema definition layer creates a third point of truth, not fewer | dbt contract IS the schema; the TypeScript `OCCURRENCE_COLUMNS` array MUST match it; document this explicitly, enforce with a test |
| Domain object layer in dbt (e.g., a "specimen" and "sample" mart as separate tables) | Clean separation at the SQL level | The unified `occurrences` mart is already the correct shape for the frontend's flat query model; splitting it would force a UNION ALL at query time on every client request | The discriminating columns (`ecdysis_id`, `is_provisional`) remain in the unified mart; classification happens in consumer code |
| Moving `buildFilterSQL` to a separate domain module | "Separation of concerns" | Filter SQL construction IS domain logic, but it is already well-bounded in `filter.ts`; moving it adds indirection without clarity | Keep `buildFilterSQL` in `filter.ts`; extract the `SPECIMEN_WHERE` constant from it |

---

## Feature Dependencies

```
src/occurrence.ts (new module)
    provides --> occId(), parseOccId(), isSpecimenBacked(), isSampleOnly(), isProvisional()
    provides --> inatObservationUrl(), ecdysisOccurrenceUrl()
    re-exports --> OccurrenceRow (source remains filter.ts)
    consumed by --> bee-atlas.ts, bee-occurrence-detail.ts, bee-table.ts, features.ts, filter.ts

data/slugs.py (new module)
    provides --> general_slug(), taxon_slug()
    consumed by --> feeds.py, species_export.py, (and any future slug-producing pipeline code)

data/dbt/macros/is_plant_taxon.sql (new macro)
    consumed by --> int_ecdysis_base.sql, int_samples_base.sql
```

No cross-language dependencies. Each module is internal to its runtime (TypeScript, Python, SQL).

---

## Extraction Impact Ranking

Which kinds of extraction are most impactful for this codebase?

### 1. Predicates and classifiers — highest ROI

The occurrence type discriminators (`isSpecimenBacked`, `isSampleOnly`, `isProvisional`) are the most impactful extraction because:
- They are consulted at both render time and query time
- The inline conditions (`ecdysis_id != null`, `is_provisional`) require readers to understand the data model from context; named predicates make intent explicit
- Tests for predicates are trivially short and do not require DOM or DuckDB setup

### 2. Constructor/formatter functions — medium ROI

`occId(row)` and URL builders eliminate concrete duplication and make the prefix strings refactorable. Medium ROI because the existing duplication is copy-pasteable and has not caused bugs. But the `Number(obj.observation_id)` cast in `features.ts:48` is absent in `bee-table.ts:41` — a real inconsistency that a single function would prevent.

### 3. Field-mapping centralization — medium ROI across the pipeline boundary

The `_slugify` duplication across Python modules is the clearest cross-file field-mapping problem. The SQL `is_plant_taxon` CASE expression duplication is smaller but equally obvious.

### 4. Module renaming / re-export — lowest ROI, but worth doing

`filter.ts` owning `OccurrenceRow` type is not causing bugs, but it creates discoverability friction. A re-export from `occurrence.ts` fixes the naming without a migration cost.

---

## The Right Shape of a Well-Bounded Domain Module (for This Project)

Based on `canonical_name.py` as the working example:

**Attributes of a good domain module in this codebase:**
1. Single file with a docstring that states its purpose and the invariants it enforces
2. Pure functions only — no database connections, no I/O, no side effects
3. Input types are primitives or the project's plain-dict/plain-interface types
4. Tests are unit tests that require no fixtures, mocks, or async setup
5. Every function that embeds a domain assumption (string comparison, column name, URL template) lives here and nowhere else

**In TypeScript:** A module like `src/occurrence.ts` exports named functions and constants. It does NOT import from `filter.ts`, `features.ts`, or any Lit component. Lit components and `filter.ts` import from it.

**In Python:** A module like `data/slugs.py` or `data/taxon.py` exports named functions. It does NOT import from `duckdb`, `requests`, or any pipeline module. Pipeline modules import from it.

**In SQL (dbt):** A macro in `data/dbt/macros/` encapsulates a repeating SQL fragment. Intermediate models reference the macro by name rather than duplicating the expression.

---

## MVP Definition for v3.8

### Must Do

1. **`src/occurrence.ts`** — new TypeScript module with:
   - `ECDYSIS_PREFIX`, `INAT_PREFIX` constants
   - `occId(row: OccurrenceRow): string` — builds `"ecdysis:N"` or `"inat:N"`
   - `parseOccId(id: string): {source: 'ecdysis'|'inat', numericId: number} | null`
   - `isSpecimenBacked(row: OccurrenceRow): boolean` — `row.ecdysis_id != null`
   - `isSampleOnly(row: OccurrenceRow): boolean` — `!isSpecimenBacked(row) && !row.is_provisional`
   - `isProvisional(row: OccurrenceRow): boolean` — `row.is_provisional === true`
   - `inatObservationUrl(id: number): string`
   - `ecdysisOccurrenceUrl(ecdysisId: number): string`

2. **Callers updated** — `features.ts`, `bee-atlas.ts`, `bee-occurrence-detail.ts`, `bee-table.ts`, `filter.ts` all import the above from `src/occurrence.ts`

3. **`data/slugs.py`** — new Python module with:
   - `general_slug(value: str) -> str` — the NFKD algorithm from `feeds.py:132-148`
   - `taxon_slug(genus: str, epithet: str | None) -> str` — `"{genus}/{epithet}"` or genus-only fallback

4. **`feeds.py` and `species_export.py`** — import from `slugs.py`; remove their local slug definitions

5. **dbt macro `is_plant_taxon`** or inline staging view — eliminate the duplicated CASE expression

### Should Do (if straightforward)

6. **`SPECIMEN_WHERE`** SQL constant extracted from `filter.ts` — or at minimum documented as a constant string rather than a repeated literal
7. **`OccurrenceRow` re-export** from `src/occurrence.ts` with `filter.ts` as the authoritative definition (avoids migration cost)

### Defer

- Any changes to the `OccurrenceRow` interface shape (milestone: taxon ID refactor, per MEMORY.md)
- Adding taxon predicates (`isGenus`, `isSubgenus`) — different concern from occurrence typing
- Changes to the dbt mart schema — separate milestone boundary

---

## Sources

All findings are from direct inspection of:
- `/Users/rainhead/dev/beeatlas/src/features.ts` — occurrence ID construction
- `/Users/rainhead/dev/beeatlas/src/filter.ts` — `OccurrenceRow`, `OCCURRENCE_COLUMNS`, `buildFilterSQL`, `isFilterActive`
- `/Users/rainhead/dev/beeatlas/src/url-state.ts` — occurrence ID parsing in `parseParams`
- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts` — inline discriminators at lines 356, 373, 426, 473-478, 748, 933-938, 1006, 1026
- `/Users/rainhead/dev/beeatlas/src/bee-occurrence-detail.ts` — occurrence type branching at render time
- `/Users/rainhead/dev/beeatlas/src/bee-table.ts` — `rowOccId` and URL construction
- `/Users/rainhead/dev/beeatlas/src/style.ts` — `recencyTier` predicate (already well-bounded)
- `/Users/rainhead/dev/beeatlas/data/canonical_name.py` — reference example of a well-bounded module
- `/Users/rainhead/dev/beeatlas/data/feeds.py` — `_slugify` definition
- `/Users/rainhead/dev/beeatlas/data/species_export.py` — `BEE_FAMILIES`, `taxon_slug` pattern, `_slugify` import
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_ecdysis_base.sql` — duplicated `is_plant_taxon` CASE
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_samples_base.sql` — same CASE expression
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql` — unified occurrence mart structure

*Feature research for: v3.8 Conceptual Tidying*
*Researched: 2026-05-18*
