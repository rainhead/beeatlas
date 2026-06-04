# Architecture Research

**Domain:** BeeAtlas v4.7 — Checklist Records as Point Data (integration into existing pipeline)
**Researched:** 2026-06-03
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Build-Order DAG

```
[existing] checklist step
    data/checklist_pipeline.py::load_checklist()
    [MODIFIED] load full-fidelity TSV (lat/lon/date/recordedBy/locality)
               into checklist_data.checklist_records_full
               (existing checklist_records 4-col table preserved for county-fill mart)
                 ↓
[new optional] checklist-itis-reconcile step
    data/checklist_itis_reconcile.py  (run on demand, not nightly)
    writes reconciled entries to data/dbt/seeds/occurrence_synonyms.csv
    (baked + committed for offline reproducibility)
                 ↓
[existing] resolve-taxon-ids step
    data/resolve_taxon_ids.py::resolve_taxon_ids()
    _names_to_resolve() already UNIONs checklist_data.species — NO CHANGE
    new checklist_records_full canonical_names added to this union
                 ↓
[existing] resolution-gate  →  inactive-remap  →  inactive-gate
    No changes
                 ↓
[existing] dbt-build step
    data/dbt/run.sh build
    ├── [unchanged] stg_checklist__species
    │       (county-fill mart input; already applies int_synonyms)
    ├── [NEW] stg_checklist__records_full.sql
    │       reads checklist_data.checklist_records_full
    │       applies int_synonyms synonym JOIN
    │       joins stg_inat__canonical_to_taxon_id for taxon_id
    │       excludes ~9% no-coord rows (WHERE lat IS NOT NULL AND lon IS NOT NULL)
    │       emits verbatim fields: recordedBy, locality, date, year, month
    ├── [NEW] int_checklist_dedup.sql
    │       LEFT JOIN against int_ecdysis_base on fuzzy key
    │       (ROUND(lat,2), ROUND(lon,2), year, month, canonical_name, lower(recordedBy))
    │       emits only non-duplicate checklist rows
    ├── [MODIFIED] int_combined.sql
    │       adds ARM 4: UNION ALL from int_checklist_dedup
    │       must emit every existing column + new checklist_id column (see ID section)
    ├── [unchanged] occurrences.sql mart
    │       spatial joins (county/ecoregion/place) run unchanged over extended int_combined
    └── [unchanged] checklist.sql mart
            county-fill mart stays; reads checklist_records (4-col) and species_counties
                 ↓
[existing] generate-sqlite step
    data/sqlite_export.py::generate_sqlite()
    [MODIFIED] _GEO_COLS: add checklist_id as slot 7 (after source)
    schema derives from parquet — checklist rows flow through automatically
    _assert_no_orphan_taxon_ids validates checklist taxon_ids (auto-covered)
    taxa hierarchy build already seeds checklist.parquet taxon_ids; checklist
    occurrences now also flow through out.occurrences for the same seeding
                 ↓
[frontend] source key extension
    src/url-state.ts: add 'checklist' to SourceKey + VALID_SOURCES
    src/filter.ts: add 'checklist' to OccurrenceRow.source union
    src/features.ts: add checklist_id decode at row[7]; emit checklist:<N> occId
    src/occurrence.ts: parseOccId recognizes 'checklist' prefix
    src/bee-occurrence-detail.ts: new source='checklist' detail branch
```

---

## Name Reconciliation: Unifying Two Disjoint Paths

### The Problem

Two parallel synonym paths exist today and must be converged for v4.7:

**Path 1 — dbt path (authoritative for occurrences):**
`occurrence_synonyms.csv` + `auto_synonyms.csv` → `int_synonyms` → LEFT JOIN in `int_combined`
ARMs 1 and 3. Also applied in `stg_checklist__species`. This is the single source of truth for
occurrence records flowing into `occurrences.parquet`.

**Path 2 — Python path (county-fill mart only):**
`data/checklist_synonyms.csv` → `checklist_pipeline.py::reconcile()` → direct UPDATE on
`checklist_data.species.canonical_name`. Used only by the county-fill mart. Completely
disjoint from `int_synonyms`.

### Resolution Design

ARM 4 (checklist occurrence points) **uses the dbt path only** — the same `LEFT JOIN int_synonyms`
pattern as ARMs 1 and 3. Specifically:

```sql
-- stg_checklist__records_full.sql (mirrors stg_checklist__species synonym JOIN)
SELECT
    COALESCE(syn.accepted_name, cr.canonical_name) AS canonical_name,
    cr.lat, cr.lon, cr.date, cr.year, cr.month,
    cr.recordedBy, cr.locality,
    -- ... other fields
FROM checklist_data.checklist_records_full cr
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = cr.canonical_name
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn.accepted_name, cr.canonical_name)
WHERE cr.lat IS NOT NULL AND cr.lon IS NOT NULL
  AND cr.lat != 0 AND cr.lon != 0
```

- `checklist_synonyms.csv` and `reconcile()` are **not changed** — they remain as the county-fill
  mart's synonym path (OK for a parallel, narrower purpose).
- Any checklist-specific synonym entries needed for point records go into
  `data/dbt/seeds/occurrence_synonyms.csv`, not `checklist_synonyms.csv`.
- `int_synonyms` already gives manual entries precedence over auto-generated ones (anti-join
  pattern in the view). No structural change needed.

### Build-Time ITIS/GBIF External Authority

For multi-class name reconciliation (authority-strip, misspelling, gender-agreement), the
recommended approach:

1. New optional script `data/checklist_itis_reconcile.py` — called **on demand** (not nightly).
2. Consults ITIS API or GBIF Backbone for verbatim checklist names that don't resolve via the
   existing synonym paths.
3. Writes discovered mappings to `data/dbt/seeds/occurrence_synonyms.csv` (or a separate
   `data/dbt/seeds/checklist_authority_synonyms.csv` that `int_synonyms` reads via a second
   UNION arm).
4. Results committed to git — offline builds reproduce without hitting ITIS.

**run.py insertion point** (between existing `checklist` and `inat-obs` steps):
```python
("checklist", load_checklist),
("checklist-itis-reconcile", reconcile_checklist_itis),  # NEW: optional, skippable with env flag
("inat-obs", load_inat_obs),
```

---

## Column Conformance: 33-Column dbt Contract + checklist_id Extension

The current occurrences contract is 33 columns (post v4.6 normalization: dropped
`scientificName`, `genus`, `family`, `specimen_inat_taxon_name`; `canonical_name` retained).
The spatial join adds `county`, `ecoregion_l3`, `place_slug` (= 33 in `occurrences.parquet`).

**ARM 4 must emit every int_combined column plus `checklist_id`:**

| Column | ARM 4 Value | Notes |
|--------|-------------|-------|
| `ecdysis_id` | NULL BIGINT | |
| `catalog_number` | NULL VARCHAR | |
| `lon` | checklist lon DOUBLE | Full-fidelity source |
| `lat` | checklist lat DOUBLE | Full-fidelity source |
| `date` | ISO date VARCHAR | Normalized in Python pre-load from mixed formats |
| `year` | YEAR(date) INTEGER | Computed in dbt |
| `month` | MONTH(date) INTEGER | Computed in dbt; NULL for range dates |
| `recordedBy` | collector VARCHAR | From full-fidelity TSV |
| `fieldNumber` | NULL VARCHAR | Checklist records have no field numbers |
| `floralHost` | NULL VARCHAR | Not in checklist data |
| `host_observation_id` | NULL BIGINT | |
| `inat_host` | NULL VARCHAR | |
| `inat_quality_grade` | NULL VARCHAR | |
| `modified` | NULL VARCHAR | |
| `specimen_observation_id` | NULL BIGINT | NOT used as synthetic ID (see below) |
| `elevation_m` | NULL INTEGER | |
| `observation_id` | NULL BIGINT | |
| `host_inat_login` | NULL VARCHAR | |
| `specimen_count` | NULL INTEGER | |
| `sample_id` | NULL INTEGER | |
| `sample_host` | NULL VARCHAR | |
| `specimen_inat_quality_grade` | NULL VARCHAR | |
| `is_provisional` | FALSE BOOLEAN | Verified checklist records |
| `canonical_name` | accepted name VARCHAR | Post-synonymy via int_synonyms |
| `taxon_id` | INTEGER from bridge | Via stg_inat__canonical_to_taxon_id; genus backfill via stg_inat__genus_taxon_ids |
| `source` | `'checklist'` | Literal |
| `image_url` | NULL VARCHAR | |
| `obs_url` | NULL VARCHAR | |
| `user_login` | NULL VARCHAR | |
| `license` | NULL VARCHAR | |
| `checklist_id` | ROW_NUMBER() over checklist_records_full | **NEW column — contract bump to 34** |

**Contract bump**: Adding `checklist_id` bumps the contract from 33 to 34 columns
(plus 3 spatial = 37 in `occurrences.parquet`). This is additive — all existing columns
are present and unmodified. `sqlite_export.py` derives schema from the parquet at export
time (no hardcoded DDL), so the bump is automatically handled.

**What about `locality`?** A `locality` VARCHAR column (from the full-fidelity TSV) can
optionally be added to the detail card display. If added, it bumps the contract to 35. Given
that `locality` is checklist-source-only and not used by any other arm, it could instead be
exposed only via the occurrence detail query (a second SQL lookup on a supplementary table).
Decision deferred to the phase implementing the detail card.

---

## The occId Problem: Why checklist_id Is Required

The current `features.ts::_buildGeoJSONFromRaw()` constructs occIds:
```typescript
if (ecdysis_id != null)              occId = `ecdysis:${ecdysis_id}`;
else if (observation_id != null)     occId = `inat:${observation_id}`;
else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
if (occId == null) continue;  // ← silently drops the row from the map
```

A checklist row with all three columns NULL would be **silently dropped** from all map
rendering. This is the highest-risk integration point.

**Fix**: Add `checklist_id INTEGER` as a sequential row number in `int_combined` ARM 4
(via `ROW_NUMBER() OVER () AS checklist_id` or a DuckDB sequence). Extend `_GEO_COLS`
in `sqlite_export.py` to include `checklist_id` at position 7 (after `source`). Extend
`_buildGeoJSONFromRaw` to emit `checklist:<N>` occIds.

**Why not reuse `specimen_observation_id`?** It is semantically an iNat WABA observation ID.
The detail card rendering in `bee-occurrence-detail.ts` uses this column to construct iNat
links. Reusing it for checklist records would produce broken iNat links.

---

## Dedup: Checklist vs. Ecdysis

### Why Dedup Is Needed

Both checklist records and Ecdysis records originate from museum specimen data (WSDA collection).
A physical bee may appear in both sources. Without dedup, the same specimen plots twice.

### Join Key Design

Exact coordinate match is insufficient due to GPS imprecision. Use a fuzzy spatial key:

```sql
ROUND(checklist.lat, 2) = ROUND(ecdysis.lat, 2)     -- ~1.1 km tolerance at WA latitudes
AND ROUND(checklist.lon, 2) = ROUND(ecdysis.lon, 2)
AND checklist.year = ecdysis.year
AND (checklist.month = ecdysis.month OR checklist.month IS NULL)
AND checklist.canonical_name = ecdysis.canonical_name  -- post-synonymy on both sides
AND lower(trim(checklist.recordedBy)) = lower(trim(ecdysis.recordedBy))
AND checklist.recordedBy IS NOT NULL                   -- never dedup on NULL collector
```

`ROUND(..., 2)` = ~1.1 km precision at 47° latitude. Month is included to avoid false
positives for different sampling trips to the same site in the same year. NULL collector
checklist rows are never deduplicated (too broad — multiple collectors share sites).

### Implementation: `int_checklist_dedup.sql`

```sql
-- data/dbt/models/intermediate/int_checklist_dedup.sql
{{ config(materialized='table') }}

WITH ecdysis_keys AS (
    SELECT
        ROUND(COALESCE(e.ecdysis_lat, s.sample_lat), 2) AS lat2,
        ROUND(COALESCE(e.ecdysis_lon, s.sample_lon), 2) AS lon2,
        COALESCE(e.year, YEAR(s.sample_date_raw))       AS year,
        COALESCE(e.month, MONTH(s.sample_date_raw))     AS month,
        COALESCE(syn.accepted_name, e.canonical_name)   AS canonical_name,
        lower(trim(e.recordedBy))                       AS collector
    FROM {{ ref('int_ecdysis_base') }} e
    FULL OUTER JOIN {{ ref('int_samples_base') }} s
        ON e.host_observation_id = s.observation_id
    LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = e.canonical_name
    WHERE COALESCE(e.ecdysis_lat, s.sample_lat) IS NOT NULL
),
deduped AS (
    SELECT
        cf.*,
        (ek.lat2 IS NOT NULL) AS ecdysis_duplicate
    FROM {{ ref('stg_checklist__records_full') }} cf
    LEFT JOIN ecdysis_keys ek
        ON  ek.lat2 = ROUND(cf.lat, 2)
        AND ek.lon2 = ROUND(cf.lon, 2)
        AND ek.year = cf.year
        AND (ek.month = cf.month OR cf.month IS NULL)
        AND ek.canonical_name = cf.canonical_name
        AND cf.recordedBy IS NOT NULL
        AND ek.collector = lower(trim(cf.recordedBy))
)
SELECT * EXCLUDE (ecdysis_duplicate)
FROM deduped
WHERE NOT ecdysis_duplicate
```

**Provenance**: The `ecdysis_duplicate` boolean is excluded from the output (not in the
33-col contract). A separate diagnostic step can log dropped counts:
`SELECT COUNT(*) FROM deduped WHERE ecdysis_duplicate` before the final SELECT.

**Placement**: `int_checklist_dedup` sits between `stg_checklist__records_full` and
`int_combined`. It reads `int_ecdysis_base` directly (not `int_combined`) to avoid a
circular dependency.

---

## `checklist.parquet` County-Fill Mart: Stays Unchanged

The county-fill mart (`data/dbt/models/marts/checklist.sql`) serves county-range presence
assertions for all 2,861 species-county pairs including no-coord records. Its inputs
(`checklist_data.checklist_records` 4-col table, `checklist_data.species_counties`) are
unchanged by v4.7. The existing county-fill toggle and `_checklistAllRows` frontend cache
remain the fallback for records without coordinates.

The two layers are complementary:
- `checklist.parquet` = "this species was documented in this county" (presence assertion)
- ARM 4 in `occurrences.parquet` = "here is the actual collection point" (~91% of records)

---

## occurrences.db Impact

`sqlite_export.py::generate_sqlite()` derives the occurrences table schema from the parquet
at export time — no hardcoded DDL. The changes required:

**`_GEO_COLS` update** (position-coupled to `features.ts` — must be atomic):
```python
# Current (7 columns, positions 0-6):
_GEO_COLS = ["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
             "year", "source"]

# After (8 columns, positions 0-7):
_GEO_COLS = ["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
             "year", "source", "checklist_id"]
```

**Taxa hierarchy build**: No change. `sqlite_export.py::_build_taxon_hierarchy()` already
seeds the taxa table from both `out.occurrences` (PASS 1 Anthophila + PASS 2 bycatch) AND
`checklist.parquet` canonical_names (lines 95-122). Checklist occurrence taxon_ids flow
into `out.occurrences` and are handled by the existing two-pass build.

**`_assert_no_orphan_taxon_ids`**: No change. Will automatically validate all non-null
checklist occurrence taxon_ids against the taxa table. Any unresolved checklist name that
produces a NULL taxon_id passes through without failing the gate (NULL is allowed).

---

## Frontend Integration

### `src/url-state.ts`

```typescript
// Current
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs']);

// After
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs', 'checklist']);
```

### `src/filter.ts`

```typescript
// OccurrenceRow.source union type:
source: 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist' | null;
```

The collector filter (`recordedBy IN (...)`) in `buildFilterSQL` already handles checklist
rows because checklist records carry a non-null `recordedBy` column using the same field
name as ecdysis. No filter SQL changes needed.

### `src/features.ts`

```typescript
// _buildGeoJSONFromRaw column layout update (positions 0-7):
const checklist_id = row[7];
// occId construction (new branch after existing three):
else if (checklist_id != null) occId = `checklist:${checklist_id}`;
```

### `src/occurrence.ts`

```typescript
// parseOccId extension:
if (parts[0] === 'checklist') return { source: 'checklist', numericId: n };

// occIdFromRow extension:
// checklist rows have all three existing ID columns null; use checklist_id
if (row.checklist_id != null) return `checklist:${row.checklist_id}`;
```

### `src/manifest.ts`

No change — manifest already has `checklist: string` key for `checklist.parquet` URL.
The `occurrences.db` key is unchanged.

### Sidebar / Detail Card (`src/bee-occurrence-detail.ts`)

New `source='checklist'` branch displays:
- `recordedBy` — already in `OccurrenceRow`; `collectorDisplay()` in `bee-table.ts` handles it
- `date` — already rendered for all sources
- Attribution: "Bartholomew et al. 2024, JHR 97" — hardcoded per source='checklist'
- `locality` — if added as a new column (optional decision)

No new Lit components required. Existing source-dispatch pattern extended.

---

## Phase Decomposition

### Phase A: Full-Fidelity TSV Extraction + Python Loader

**Files changed:**
- `data/checklists/wa_bee_checklist_records.tsv` — replace with full-fidelity (lat/lon/date/recordedBy/locality)
- `data/checklist_pipeline.py` — add `_load_checklist_records_full()`, populate `checklist_data.checklist_records_full`; preserve existing `_load_checklist_records()` for county-fill mart

**Integration points:** `load_checklist()` step in `run.py` — no STEPS ordering change.
The 4-column `checklist_records` table must survive intact for `checklist.sql` mart.

**Gate:** pytest: `checklist_data.checklist_records_full` row count ≈ 50,646; columns
lat/lon/date/recordedBy/locality present; NULL-coord rows ≈ 4,595 identified.

**Notes on date normalization:** The full-fidelity source has mixed date formats
(ISO, m/d/yyyy, ranges). Normalize to ISO date string in Python before loading. NULL for
unparseable dates (~13% of rows). Year/month extracted from the normalized date.

---

### Phase B: dbt Staging + Name Reconciliation

**Files changed:**
- `data/dbt/models/staging/stg_checklist__records_full.sql` — new model
- Optionally `data/checklist_itis_reconcile.py` + committed seed update (on-demand)

**Integration points:** `stg_checklist__records_full` joins `int_synonyms` and
`stg_inat__canonical_to_taxon_id`. Genus-rank taxon_id backfill via `stg_inat__genus_taxon_ids`
(same pattern as ARMs 1-3 in `int_combined`).

**Gate:** `dbt build --select stg_checklist__records_full` passes; row count ≈ 46,051
(50,646 minus ~4,595 no-coord); NULL taxon_id rate documented.

---

### Phase C: Dedup + int_combined ARM 4

**Files changed:**
- `data/dbt/models/intermediate/int_checklist_dedup.sql` — new model
- `data/dbt/models/intermediate/int_combined.sql` — add ARM 4 UNION ALL; add `checklist_id` column to all ARMs (NULL for ARMs 1-3, ROW_NUMBER() for ARM 4)
- `data/dbt/models/marts/schema.yml` — add `checklist_id` to occurrences contract (34 cols)

**Integration points:** NULL `checklist_id` must be explicitly cast in ARMs 1-3 to match
the ARM 4 INTEGER type. The UNION ALL column type alignment is the primary risk here.

**Gate:** Full `dbt build` passes; `occurrences.parquet` row count increases by ~46,051 minus
dedup drops; `source='checklist'` rows verified in output.

---

### Phase D: sqlite_export.py + geo_blob + Frontend occId

**Files changed (atomic — must deploy together):**
- `data/sqlite_export.py::_GEO_COLS` — add `checklist_id` at position 7
- `src/features.ts::_buildGeoJSONFromRaw` — decode checklist_id at row[7]; emit `checklist:<N>` occId
- `src/occurrence.ts::parseOccId` + `occIdFromRow` — recognize `checklist:` prefix
- `src/filter.ts::OccurrenceRow` — add `checklist_id: number | null` field

**Integration points:** The positional coupling between `_GEO_COLS` and `features.ts` is
explicitly documented in the source comment. This phase carries the highest deployment risk
— a mismatch produces silent data corruption (wrong values in wrong positions), not a
thrown error. Must be deployed as a single atomic pipeline + frontend change.

**Gate:** `generate_sqlite` completes; zero-orphan assertion passes; Vitest unit tests for
`_buildGeoJSONFromRaw` cover `checklist:N` path; browser inspection shows checklist point
markers on the map.

---

### Phase E: Source Toggle + Detail Card

**Files changed:**
- `src/url-state.ts` — add `'checklist'` to `SourceKey` + `VALID_SOURCES`
- `src/filter.ts` — add `'checklist'` to `OccurrenceRow.source` union
- `src/bee-pane.ts` — add checklist toggle in sources row (fourth checkbox)
- `src/bee-occurrence-detail.ts` — add `source='checklist'` branch

**Integration points:** `VALID_SOURCES` in `url-state.ts` must match the `source='checklist'`
rows in occurrences.db. The `src=` URL parameter round-trip must include checklist.

**Gate:** Vitest tests for `parseParams`/`buildParams` with `src=checklist`; manual
verification of toggle and detail card rendering; `src=ecdysis` URL excludes checklist
points from the map.

---

## Integration Points Summary

| Artifact | Change Type | Risk Level |
|----------|-------------|------------|
| `wa_bee_checklist_records.tsv` | Replace with full-fidelity TSV | Medium — column names must match parser |
| `checklist_data.checklist_records_full` | New DuckDB table; 4-col `checklist_records` preserved | Low |
| `stg_checklist__records_full.sql` | New staging model | Low |
| `int_checklist_dedup.sql` | New intermediate; dedup key correctness is main risk | Medium |
| `int_combined.sql` ARM 4 | UNION ALL + checklist_id column on all ARMs | Medium — NULL cast type alignment |
| `occurrences.sql` | No change (reads `int_combined` via `*`) | None |
| `checklist.sql` | No change | None |
| `schema.yml` occurrences contract | +1 column (checklist_id) = 34 cols | Low |
| `sqlite_export.py _GEO_COLS` | +1 slot, position-coupled to `features.ts` | **HIGH — atomic deploy required** |
| `features.ts _buildGeoJSONFromRaw` | New checklist_id branch; without it checklist rows silently dropped | **HIGH** |
| `url-state.ts VALID_SOURCES` | Add `'checklist'` | Low |
| `filter.ts OccurrenceRow.source` | Union type extension | Low |
| `checklist.parquet` county-fill mart | No change | None |
| `taxa` hierarchy build in `sqlite_export.py` | No change — checklist taxon_ids auto-handled | None |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reuse `specimen_observation_id` as the checklist synthetic ID

Using the semantically-wrong `specimen_observation_id` column to carry `checklist_id` breaks
the `inat_obs:` link construction in `bee-occurrence-detail.ts` for any rendering code that
inspects `specimen_observation_id` to build iNat URLs.

**Do this instead:** Add an explicit `checklist_id` INTEGER column to the contract.

### Anti-Pattern 2: Dedup in `occurrences.sql` after spatial joins

Dedup placed after the spatial joins processes duplicate rows through expensive `ST_Within`
operations before discarding them.

**Do this instead:** Dedup in `int_checklist_dedup.sql` before the UNION ALL; spatial joins
operate only on surviving rows.

### Anti-Pattern 3: Route ARM 4 synonyms through `checklist_synonyms.csv`

The Python `reconcile()` path applies overrides as direct UPDATEs to `checklist_data.species`,
which is a different table and resolution order than `int_synonyms`. Routing occurrence point
records through it produces inconsistent canonical_name values vs. ecdysis/inat_obs arms.

**Do this instead:** ARM 4 joins `int_synonyms` exclusively, same as ARMs 1 and 3.
Checklist-specific synonym entries go into `occurrence_synonyms.csv`.

### Anti-Pattern 4: Deploy `_GEO_COLS` and `_buildGeoJSONFromRaw` in separate commits

The positional coupling is NOT TypeScript-typed — a mismatch silently puts the wrong value
in the wrong column (e.g., `checklist_id` in the `source` position), corrupting the occId
for all rows. The existing comment in `features.ts` line 17 documents this dependency:
"Phase 131 NORM-02: dropped scientificName/genus/family; source moves from index 9 → 6.
sqlite_export.py _GEO_COLS updated in the same commit (positional coupling)."

**Do this instead:** Phase D is a single atomic commit touching both files simultaneously.

### Anti-Pattern 5: Excluding NULL-coord rows in `int_combined` rather than `stg_checklist__records_full`

ARMs 2 and 3 in `int_combined` have explicit `WHERE lat IS NOT NULL AND lon IS NOT NULL` guards.
The `occurrences.sql` spatial join calls `ST_Point(lon, lat)` — feeding it a NULL value causes
a DuckDB error or NULL geometry that breaks the spatial join. All coord filtering must happen
upstream.

**Do this instead:** Exclude `WHERE lat IS NOT NULL AND lon IS NOT NULL AND lat != 0 AND lon != 0`
in `stg_checklist__records_full.sql` — before the dedup model and ARM 4 union.

---

## Sources

- `data/dbt/models/intermediate/int_combined.sql` — ARM 1/2/3 pattern, column types
- `data/dbt/models/marts/checklist.sql` — county-fill mart (unchanged path)
- `data/dbt/models/intermediate/int_synonyms.sql` — unified synonym JOIN
- `data/dbt/models/staging/stg_checklist__species.sql` — synonym JOIN pattern for checklist
- `data/sqlite_export.py` — `_GEO_COLS`, positional coupling comment, taxa build
- `src/features.ts` — `_buildGeoJSONFromRaw`, occId construction, positional coupling note
- `src/url-state.ts` — `SourceKey`, `VALID_SOURCES`
- `src/filter.ts` — `OccurrenceRow`, `OCCURRENCE_COLUMNS`
- `src/occurrence.ts` — `parseOccId`, `occIdFromRow`
- `data/run.py` — STEPS ordering
- `data/checklist_pipeline.py` — `_load_checklist_records()`, `reconcile()`, `CHECKLIST_RECORDS_PATH`
- `data/resolve_taxon_ids.py` — `_names_to_resolve()` UNION already includes `checklist_data.species`
- `.planning/PROJECT.md` — v4.7 milestone goal, v4.6 contract history

---
*Architecture research for: BeeAtlas v4.7 Checklist Records as Point Data*
*Researched: 2026-06-03*
