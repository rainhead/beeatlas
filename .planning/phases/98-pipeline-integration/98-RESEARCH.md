# Phase 98: Pipeline Integration — Research

**Researched:** 2026-05-17
**Domain:** DuckDB pipeline, dbt SQL mart extension, GeoJSON export, SVG map generation, git integration
**Confidence:** HIGH

---

## Summary

Phase 98 wires the place data model from Phase 97 into the full pipeline. It has six distinct
deliverables, all of which follow clear patterns already established in the codebase:

1. **places_load step** — load `content/places.toml` into `geographies.places` DuckDB table
   before `dbt-build`. This mirrors the pattern in `geographies_pipeline.py` (CREATE OR REPLACE
   TABLE in the geographies schema) but sources from TOML rather than shapefiles.

2. **occurrences.sql + schema.yml update** — add `place_slug VARCHAR` column via a LEFT JOIN
   `ST_Within` against `geographies.places`. Explicitly no fallback. The county/ecoregion join
   pattern is the template, minus the fallback CTEs. Must be a single atomic commit with
   schema.yml to keep the 31-column dbt contract in sync.

3. **places GeoJSON export** — two artifacts produced from the `geographies.places` table in
   Python (not via a new dbt mart, because places.toml is nightly-loaded and the export
   requires metadata+counts). `places.geojson` uses `emit_feature_collection`-style structure
   but is written from Python to match the metadata requirements. `places.json` is a flat JSON
   array with counts joined from `occurrences.parquet`.

4. **places_maps.py** — per-place SVG maps following `species_maps.py` pattern exactly:
   county backdrop from `geographies.us_counties`, occurrence dots from `occurrences.parquet`
   WHERE `place_slug = '{slug}'`, byte-stable attribute sorting.

5. **git commit for CI** — `public/data/places.geojson` and `public/data/places.json` are
   committed to git so `npm run build` succeeds without running the pipeline. The
   `public/data/` directory is currently in `.gitignore`; these two files need a force-add
   exception (or a `.gitignore` negation rule).

6. **Testing** — pytest covering: `places_load` inserts correct row count and geometry;
   `occurrences.sql` spatial join assigns slug correctly and NULL for out-of-place occurrences;
   output file correctness spot-checks.

**Primary recommendation:** Implement as three plans: (1) places_load step + occurrences.sql/schema.yml dbt changes; (2) places_export + places_maps steps + STEPS wiring; (3) .gitignore negation + git commit of seed artifacts.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load places.toml into DuckDB | Python pipeline step | — | Follows geographies_pipeline.py pattern; TOML source not shapefile |
| ST_Within place spatial join | dbt mart (occurrences.sql) | — | All occurrence spatial joins live in the dbt mart; consistent with county/ecoregion |
| places.geojson export (slim) | Python pipeline step | — | Must join to occurrences for counts; dbt macro only handles simple property+geom pattern |
| places.json export (rich) | Python pipeline step | — | Eleventy _data consumer; requires metadata+counts; not a dbt output |
| Per-place SVG maps | Python pipeline step | — | Matches species_maps.py pattern exactly; occurrence dots from occurrences.parquet |
| places.geojson CI availability | git-committed file | — | PPIPE-05: CI must succeed without pipeline run; static file solution |
| dbt 31-column contract | dbt schema.yml | occurrences.sql | Enforced at every `bash data/dbt/run.sh build` |

---

## Standard Stack

No new packages. All required libraries are already in the project environment.

| Library | Purpose | Availability |
|---------|---------|-------------|
| `duckdb` | DuckDB spatial join + query | Already in `data/pyproject.toml` [ASSUMED] |
| `tomllib` | TOML parsing (stdlib, Python 3.11+) | Python stdlib; already used in places_validation.py |
| `json` | JSON export | stdlib |
| `xml.etree.ElementTree` | SVG generation | stdlib; already used in species_maps.py |
| `pathlib` | Path manipulation | stdlib |
| `pyarrow` | Parquet read/write if needed | Already used in species_export.py [ASSUMED] |
| `shutil` | Directory wipe for idempotent SVG output | stdlib; already used in species_maps.py |

**No new pip installs required for this phase.** [VERIFIED: codebase grep]

---

## Package Legitimacy Audit

No new external packages are introduced in this phase. All dependencies are stdlib or already
installed in the project environment.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### Key File Relationships

```
content/places.toml
    |
    v
data/places_load.py          (NEW — Step 1)
    |  loads into geographies.places DuckDB table
    v
data/dbt/models/marts/occurrences.sql   (MODIFIED — add place_slug CTE)
data/dbt/models/marts/schema.yml        (MODIFIED — 30 → 31 columns)
    |  dbt-build produces occurrences.parquet with place_slug
    v
data/places_export.py        (NEW — Step 2)
    |  reads geographies.places + occurrences.parquet
    |  writes public/data/places.geojson (slim)
    |          public/data/places.json   (rich)
    v
data/places_maps.py          (NEW — Step 3)
    |  reads geographies.us_counties + occurrences.parquet
    |  writes public/data/place-maps/{slug}.svg
    v
public/data/places.geojson   (committed to git)
public/data/places.json      (committed to git)
```

### STEPS insertion order (run.py)

Current order: `places-validation → dbt-build → topology-postprocess → species-export → species-maps → feeds`

Required order after Phase 98:
```
places-validation → places-load → dbt-build → topology-postprocess →
species-export → species-maps → places-export → places-maps → feeds
```

- `places-load` MUST come after `places-validation` (table populated from validated TOML)
- `places-load` MUST come before `dbt-build` (dbt occurrences mart reads `geographies.places`)
- `places-export` MUST come after `dbt-build` (reads occurrences.parquet for counts)
- `places-maps` MUST come after `dbt-build` (reads occurrences.parquet for dots)
- `places-export` and `places-maps` can be in either order relative to each other

### Pattern 1: places_load step

**What:** Create `geographies.places` in DuckDB from TOML, using `CREATE OR REPLACE TABLE` so
the step is idempotent. [VERIFIED: codebase pattern from geographies_pipeline.py]

**Schema needed:** `slug VARCHAR, name VARCHAR, land_owner VARCHAR, geom GEOMETRY, permits_json VARCHAR`

The `permits` array can be stored as JSON text for the table (the export step reads from TOML
directly anyway), but `geom` must be a proper `GEOMETRY` column for `ST_Within` to work in dbt.

**Critical:** `LOAD spatial` (not `INSTALL spatial`) per STATE.md decision 97-01.

```python
# Source: codebase — geographies_pipeline.py pattern adapted for TOML source
def load_places_step() -> None:
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    places = data.get("places", [])

    db_path = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.places (
            slug VARCHAR,
            name VARCHAR,
            land_owner VARCHAR,
            geom GEOMETRY
        )
    """)
    for p in places:
        con.execute(
            "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
            [p["slug"], p["name"], p["land_owner"], p["geometry_wkt"].strip()]
        )
    con.close()
```

**Note:** `permits` metadata is NOT stored in DuckDB (it's not needed for spatial joins or
specimen counts). The export step reads permits directly from TOML. This keeps the DuckDB
schema minimal.

### Pattern 2: occurrences.sql place_slug CTE

**What:** Add `with_place` CTE using `ST_Within` LEFT JOIN against `geographies.places`,
no fallback CTE. Append `fp.place_slug` to the final SELECT. [VERIFIED: codebase occurrences.sql]

**Critical invariants:**
- No county_fallback-equivalent for places — `place_slug IS NULL` is semantically correct
- `fp.place_slug` is the only new column in the final SELECT
- The dbt source `geographies.places` must be declared in `sources.yml`

**Current final SELECT ends with:** `fc.county, fe.ecoregion_l3`
**New final SELECT ends with:** `fc.county, fe.ecoregion_l3, fp.place_slug`

**CTE to add (between `final_eco` and the final SELECT):**

```sql
-- Source: adapted from with_county CTE in occurrences.sql
wa_places AS (SELECT * FROM {{ source('geographies', 'places') }}),
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    LEFT JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)
),
```

**No dedup CTE needed** — each occurrence point can only be in one place (non-overlapping
constraint from PLC-04). However, a `DISTINCT ON (_row_id)` guard is safe insurance.

**JOIN in final SELECT:**

```sql
LEFT JOIN with_place fp ON fp._row_id = j._row_id
```

Note: use `LEFT JOIN` (not `JOIN`) to allow rows with no place match (fp.place_slug = NULL).

### Pattern 3: sources.yml addition

Add `places` to the geographies source in `data/dbt/models/sources.yml`:

```yaml
  - name: geographies
    schema: geographies
    tables:
      - name: us_counties
      - name: us_states
      - name: ecoregions
      - name: places          # ADD
```

[VERIFIED: codebase sources.yml]

### Pattern 4: schema.yml 31-column update

Append to the `occurrences` model columns list in `data/dbt/models/marts/schema.yml`:

```yaml
      - name: place_slug
        data_type: varchar
```

This brings the count from 30 to 31. Must be in the same commit as `occurrences.sql`.
[VERIFIED: codebase schema.yml — 30 columns currently: ecdysis_id through ecoregion_l3]

**Current column 30 (last):** `ecoregion_l3`
**New column 31:** `place_slug`

### Pattern 5: places.geojson export (slim)

**What:** GeoJSON FeatureCollection with `slug` property + geometry. For Mapbox `promoteId: 'slug'`.

Two options considered:
- **Option A:** Add a new dbt mart `places_geo.sql` using `emit_feature_collection` macro
- **Option B:** Write from Python in a `places_export.py` step

**Recommendation: Option B (Python).** The export requires specimen/sample counts for
`places.json`, and the counts require querying `occurrences.parquet` after dbt runs.
Keeping both exports in one Python step (places_export.py) avoids adding a dbt mart that
would need to run before the Python export anyway, while places.json needs post-dbt data.
[ASSUMED — neither approach is explicitly locked in CONTEXT.md]

**places.geojson structure:**
```json
{"type":"FeatureCollection","features":[
  {"type":"Feature","properties":{"slug":"rattlesnake-ledge"},"geometry":{...}},
  ...
]}
```

Read geometry from `geographies.places` via DuckDB `ST_AsGeoJSON`. Follow the
`emit_feature_collection` macro structure exactly for byte-stability.

### Pattern 6: places.json export (rich)

**What:** Flat JSON array with all metadata + specimen/sample counts. No geometry.

```json
[
  {
    "slug": "rattlesnake-ledge",
    "name": "Rattlesnake Ledge Recreation Area",
    "land_owner": "Washington Department of Natural Resources",
    "permits": [...],
    "specimen_count": 42,
    "sample_count": 7
  },
  ...
]
```

**Counts query** — from `occurrences.parquet` after dbt-build:
- `specimen_count`: `COUNT(CASE WHEN is_provisional = false THEN 1 END) WHERE place_slug = ?`
- `sample_count`: `COUNT(DISTINCT sample_id) WHERE place_slug = ? AND sample_id IS NOT NULL`

Metadata (name, land_owner, permits) comes from TOML, not DuckDB. This ensures permit details
are always current and avoids storing JSON in DuckDB.

**Key insight for counts:** Read from `EXPORT_DIR/occurrences.parquet` (the copied artifact),
not `DBT_SANDBOX_DIR/occurrences.parquet`, because by the time `places-export` runs, the copy
has already happened in `_run_dbt_build()`. [VERIFIED: codebase run.py `_run_dbt_build`]

### Pattern 7: places_maps.py

**What:** Per-place SVG occurrence maps. Follows `species_maps.py` exactly.

Key differences from species_maps.py:
- No wipe-and-rewrite of the whole directory (only new files per place, not replacing a set)
- Query filter: `WHERE place_slug = ?` (not `WHERE canonical_name IS NOT NULL`)
- Output directory: `ASSETS_DIR / "place-maps"` (not `species-maps`)
- No multi-color/group maps — single `class="occ"` color only
- No slug from species.parquet — slugs come from TOML

**Implementation steps:**
1. Reuse `_load_county_geojsons`, `_build_county_backdrop`, `_project`, `_in_bbox`,
   `_ring_to_path`, `_write_species_svg` from species_maps.py (or import them)
2. For each place slug, query `occurrences.parquet` WHERE `place_slug = '{slug}'`
3. Call `_write_species_svg(slug, points, backdrop, place_maps_dir)` (exact reuse)

**Byte-stability** is inherited from `_write_species_svg`'s attribute sorting pattern.
[VERIFIED: codebase species_maps.py lines 194-196]

**Options for code reuse:**
- Import `_write_species_svg` and helpers from `species_maps` (but these are module-private)
- Copy the helpers into `places_maps.py` (duplication but clearer ownership)
- Refactor to a shared `map_utils.py` (more work, clean separation)

**Recommendation:** Import from `species_maps` with leading underscore acceptable since
`places_maps` is tightly coupled to the same patterns. [ASSUMED]

### Pattern 8: .gitignore negation for CI files

**Current .gitignore:** `/public/data/` (line 141 — entire directory is ignored)
[VERIFIED: codebase .gitignore]

**Required:** `places.geojson` and `places.json` must be committed to git for PPIPE-05.

**Two options:**
- **Option A:** Add negation rules after the blanket ignore:
  ```
  !/public/data/places.geojson
  !/public/data/places.json
  ```
- **Option B:** `git add -f public/data/places.geojson public/data/places.json` at commit time

**Recommendation: Option A (negation rules).** Negation rules make the exception explicit in
the repo history and prevent the files from accidentally being dropped by a future `git clean`.
Option B requires a human to remember to force-add after each pipeline run. [ASSUMED]

**Note:** Other static artifacts that are currently committed to git (`counties.geojson`,
`ecoregions.geojson`, `species.json`) should also be checked — but these are currently NOT
committed (git ls-files returns empty for public/data/). PPIPE-05 is the first requirement
for committing any artifact from this directory. [VERIFIED: `git ls-files public/data/` = empty]

### Anti-Patterns to Avoid

- **Nearest-polygon fallback for places:** The county/ecoregion join CTEs both have fallback
  logic. Do NOT copy this for places. `place_slug IS NULL` is correct for unlocked occurrences.
  [VERIFIED: STATE.md "No nearest-polygon fallback"]

- **INSTALL spatial in places_load.py:** Only `LOAD spatial` per decision 97-01.
  `geographies_pipeline.py` uses `INSTALL spatial; LOAD spatial;` — do not copy this pattern.
  [VERIFIED: places_validation.py uses LOAD only]

- **Storing permits in DuckDB:** TOML is the source of truth for permit metadata. Do not add
  a `permits` column to `geographies.places`. Permits are not needed for dbt spatial joins.

- **Using generateId: true in Mapbox:** `promoteId: 'slug'` is locked per STATE.md.
  [VERIFIED: STATE.md]

- **Writing places.geojson from a dbt mart:** The `emit_feature_collection` macro only supports
  a simple `(name, geom)` property pattern. `places.geojson` needs `slug` as property name,
  not `name`. Using the macro would require renaming or a new macro variant — Python is simpler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG county backdrop | Custom WA outline | `_build_county_backdrop` from species_maps.py | Already correct WA bbox, styling, clipping |
| Byte-stable SVG attributes | Custom sort | `elem.attrib = dict(sorted(elem.attrib.items()))` | Established pattern, already tested |
| GeoJSON FeatureCollection | Custom JSON builder | `json_object('type', 'FeatureCollection', 'features', ...)` via DuckDB | Proven pattern in emit_feature_collection macro |
| Spatial join | Manual lat/lon arithmetic | DuckDB `ST_Within(ST_Point(lon, lat), geom)` | Already used in occurrences.sql |

---

## Runtime State Inventory

> This is not a rename/refactor phase — no runtime state inventory needed. However, note:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `geographies.places` table does not exist yet in beeatlas.duckdb | `places-load` step creates it nightly with CREATE OR REPLACE |
| Live service config | nightly.sh on maderas — no changes needed (run.py orchestrates STEPS) | none |
| OS-registered state | None | none |
| Secrets/env vars | `DB_PATH` / `EXPORT_DIR` — places_load.py and places_export.py inherit these | code edit only |
| Build artifacts | `.gitignore` blocks `/public/data/` — needs negation for 2 files | .gitignore edit |

---

## Common Pitfalls

### Pitfall 1: `JOIN` instead of `LEFT JOIN` in with_place CTE
**What goes wrong:** Using `JOIN with_place` instead of `LEFT JOIN with_place` in the final
SELECT silently drops all occurrences that don't match any place polygon.
**Why it happens:** The county CTE uses `JOIN final_county` (because county has fallback, every
row matches). Places have no fallback — rows outside all polygons must survive as NULL.
**How to avoid:** Use `LEFT JOIN with_place fp ON fp._row_id = j._row_id` in the final SELECT.
**Warning signs:** `occurrences.parquet` row count drops after adding place_slug column.

### Pitfall 2: DISTINCT needed if polygon edges share points
**What goes wrong:** `ST_Within` can return multiple matches at polygon boundaries, causing
duplicate `_row_id` values in `with_place`, which then causes duplicate output rows.
**Why it happens:** PLC-04 validates that polygons don't overlap (ST_Intersects), but boundary
contact may still cause double matches.
**How to avoid:** Add `DISTINCT ON (_row_id)` dedup CTE, analogous to `eco_dedup`.
**Warning signs:** More rows in final output than in `int_combined`.

### Pitfall 3: places table not populated before dbt runs
**What goes wrong:** `dbt build` fails with "Table not found: geographies.places" if
`places-load` runs after `dbt-build` or not at all.
**Why it happens:** run.py STEPS ordering error, or places-load omitted from STEPS.
**How to avoid:** Verify STEPS list: `places-load` must appear before `dbt-build`.
**Warning signs:** `dbt build` error on `source('geographies', 'places')` not found.

### Pitfall 4: .gitignore negation order matters
**What goes wrong:** Negation rules placed BEFORE the blanket `/public/data/` rule don't work.
Git processes .gitignore rules top-to-bottom; a later rule can override an earlier one, but
an earlier negation doesn't override a later blanket ignore.
**How to avoid:** Place `!/public/data/places.geojson` and `!/public/data/places.json` AFTER
the `/public/data/` line in .gitignore.
**Warning signs:** `git status` still shows places.geojson as ignored after adding negation.

### Pitfall 5: occurrences.parquet read path in places_export.py
**What goes wrong:** Reading from `DBT_SANDBOX_DIR/occurrences.parquet` instead of
`EXPORT_DIR/occurrences.parquet` — in production they're different paths, and the sandbox
file is overwritten on the next run.
**Why it happens:** species_export.py reads from sandbox; places_export.py should read from
EXPORT_DIR since it runs AFTER the copy step in `_run_dbt_build()`.
**How to avoid:** Use `ASSETS_DIR / "occurrences.parquet"` (matches `EXPORT_DIR`) in
places_export.py, not `DBT_SANDBOX_DIR`.
**Warning signs:** Zero counts for all places in places.json.

### Pitfall 6: SVG output directory naming conflict
**What goes wrong:** Using `species-maps/` as the output directory for place maps would
collide with existing species SVGs and risk a wipe-and-rewrite clearing them.
**How to avoid:** Use a separate directory `place-maps/` (or `places-maps/`). Do NOT share
the species-maps directory.

### Pitfall 7: dbt schema.yml + occurrences.sql must be in the same commit
**What goes wrong:** If `occurrences.sql` adds `place_slug` but `schema.yml` is not updated,
`dbt build` fails immediately with contract violation. If `schema.yml` is updated first, the
30th column contract fails before the SQL is updated.
**How to avoid:** Edit both files in a single task and commit together. The plan must not
split these into separate commits.

---

## Code Examples

### places_load.py main body pattern

```python
# Source: adapted from data/geographies_pipeline.py load_geographies() pattern
# + data/places_validation.py TOML loading pattern
import duckdb, tomllib, os
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

def load_places() -> None:
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    with open(toml_path, "rb") as f:
        data = tomllib.load(f)
    places = data.get("places", [])

    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.places (
            slug VARCHAR,
            name VARCHAR,
            land_owner VARCHAR,
            geom GEOMETRY
        )
    """)
    for p in places:
        con.execute(
            "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
            [p["slug"], p["name"], p["land_owner"], p["geometry_wkt"].strip()],
        )
    print(f"  geographies.places: {len(places)} row(s) loaded")
    con.close()

def load_places_step() -> None:
    load_places()
```

### with_place CTE for occurrences.sql

```sql
-- Source: adapted from with_county CTE in data/dbt/models/marts/occurrences.sql
-- No fallback — place_slug IS NULL is correct for occurrences outside all named places.
wa_places AS (SELECT * FROM {{ source('geographies', 'places') }}),
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    LEFT JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)
),
place_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, place_slug
    FROM with_place
),
```

Then in final SELECT, add after `fe.ecoregion_l3`:

```sql
LEFT JOIN place_dedup fp ON fp._row_id = j._row_id
```

And in the column list, add at end:
```sql
    fp.place_slug
```

### places.geojson write pattern

```python
# Source: adapted from emit_feature_collection macro in data/dbt/macros/
import json, duckdb

def _write_places_geojson(con, places_data, out_path):
    rows = con.execute(
        "SELECT slug, ST_AsGeoJSON(geom) FROM geographies.places ORDER BY slug"
    ).fetchall()
    features = [
        {
            "type": "Feature",
            "properties": {"slug": slug},
            "geometry": json.loads(geom_json),
        }
        for slug, geom_json in rows
    ]
    fc = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(fc, separators=(',', ':')), encoding="utf-8")
```

### Specimen/sample count query pattern

```python
# Source: adapted from species_export.py seasonality query pattern
occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
counts = con.execute(f"""
    SELECT
        place_slug,
        COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
        COUNT(DISTINCT CASE WHEN sample_id IS NOT NULL THEN sample_id END) AS sample_count
    FROM read_parquet('{occurrences_parquet}')
    WHERE place_slug IS NOT NULL
    GROUP BY place_slug
""").fetchall()
count_by_slug = {row[0]: {"specimen_count": row[1], "sample_count": row[2]} for row in counts}
```

### per-place SVG write pattern

```python
# Source: adapted from species_maps.py _write_species_svg + main loop
from species_maps import (
    _load_county_geojsons, _build_county_backdrop,
    _in_bbox, _project, _write_species_svg,
)

def generate_place_maps(con) -> None:
    maps_dir = ASSETS_DIR / "place-maps"
    maps_dir.mkdir(parents=True, exist_ok=True)

    county_geojsons = _load_county_geojsons(con)
    backdrop = _build_county_backdrop(county_geojsons)

    occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
    slug_points = con.execute(f"""
        SELECT place_slug, lon, lat
        FROM read_parquet('{occurrences_parquet}')
        WHERE place_slug IS NOT NULL AND lon IS NOT NULL AND lat IS NOT NULL
    """).fetchall()

    from collections import defaultdict
    by_slug = defaultdict(list)
    for slug, lon, lat in slug_points:
        by_slug[slug].append((lon, lat))

    for slug, points in sorted(by_slug.items()):
        clipped = _write_species_svg(slug, points, backdrop, maps_dir)
        if clipped:
            print(f"  place-maps/{slug}.svg: {clipped} points clipped")
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `export.py` Python transforms | `dbt build` + post-Python steps | All new SQL goes into dbt models; Python only for non-SQL transforms |
| `INSTALL spatial` in modules | `LOAD spatial` only (spatial pre-installed) | Decision 97-01 — don't re-install in nightly modules |
| `generateId: true` in Mapbox | `promoteId: 'slug'` | Stable feature IDs across source reloads — locked in STATE.md |

**Current dbt column count:** 30 columns (`ecdysis_id` through `ecoregion_l3`)
**After Phase 98:** 31 columns (+ `place_slug VARCHAR`)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `places_export.py` should be a Python step (not a dbt mart) | Architecture Patterns §Pattern 5 | If dbt mart is preferred, a new `emit_feature_collection` variant would be needed |
| A2 | `.gitignore` negation rules are the right mechanism for PPIPE-05 | Anti-Patterns | If negation doesn't work as expected, `git add -f` at each pipeline run is the fallback |
| A3 | Importing `_load_county_geojsons` and other helpers from `species_maps` is acceptable | Architecture Patterns §Pattern 7 | If leading-underscore imports are forbidden, helpers must be copied to `places_maps.py` |
| A4 | `place-maps/` is the correct output directory name (not `place_maps/` or `places-maps/`) | Architecture Patterns | Any naming is fine; planner should pick and be consistent |
| A5 | `specimen_count` counts non-provisional occurrences; `sample_count` counts distinct sample_ids | Code Examples | If different count semantics are needed (e.g., count all occurrences), query changes |
| A6 | `pyproject.toml` / `uv` dependencies already include all needed packages (duckdb, pyarrow) | Standard Stack | If places_load.py needs a package not in pyproject.toml, a `uv add` step is needed |

---

## Open Questions

1. **should places_export.py read permits from TOML or store them in DuckDB?**
   - What we know: permits data is already in TOML; the DuckDB table schema for places doesn't include permits; places.json must include permits for Eleventy
   - What's unclear: whether there's a preference for one authoritative source
   - Recommendation: Read permits directly from TOML in places_export.py (avoids JSON-in-DuckDB complexity and keeps TOML as single source of truth)

2. **Import helpers from species_maps.py vs. duplicate them?**
   - What we know: `species_maps.py` contains all needed SVG helpers as private functions
   - What's unclear: whether places_maps.py should import from species_maps (tight coupling) or duplicate
   - Recommendation: Import from species_maps for now; if divergence happens later, split into map_utils.py

3. **Should places.geojson use compact JSON (no spaces) or pretty-printed?**
   - What we know: `emit_feature_collection` uses compact JSON; `species.json` uses `indent=2`; `counties.geojson` and `ecoregions.geojson` are compact
   - Recommendation: Match counties.geojson format — compact JSON (`separators=(',', ':')`) for places.geojson, since it's a Mapbox source

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | data pipeline | ✓ | CLAUDE.md specifies 3.14+ | — |
| DuckDB with spatial | places_load, dbt, places_export | ✓ | Already in use | — |
| `uv` | pipeline execution | ✓ | Used in run.sh | — |
| `tomllib` | places_load, places_export | ✓ | stdlib (Python 3.11+) | — |
| `content/places.toml` | places_load | ✓ | Created in Phase 97 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (uv run pytest) |
| Config file | `data/pyproject.toml` (pytest config) |
| Quick run command | `cd data && uv run pytest tests/test_places_pipeline.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PPIPE-01 | places_load step creates geographies.places with correct schema + row count | unit | `uv run pytest tests/test_places_pipeline.py::test_load_creates_table -x` | ❌ Wave 0 |
| PPIPE-01 | geographies.places rows have valid GEOMETRY column (ST_Within works) | unit | `uv run pytest tests/test_places_pipeline.py::test_places_geometry_usable -x` | ❌ Wave 0 |
| PPIPE-02 | occurrences.parquet place_slug is non-null for occurrence inside known polygon | integration | `uv run pytest tests/test_places_pipeline.py::test_occurrence_inside_place_gets_slug -x` | ❌ Wave 0 |
| PPIPE-02 | occurrences.parquet place_slug is null for occurrence outside all polygons | integration | `uv run pytest tests/test_places_pipeline.py::test_occurrence_outside_places_is_null -x` | ❌ Wave 0 |
| PPIPE-03 | dbt build exits 0 with 31-column contract | integration (manual/CI) | `bash data/dbt/run.sh build` | — |
| PPIPE-04 | places.geojson is valid GeoJSON FeatureCollection with slug property | unit | `uv run pytest tests/test_places_pipeline.py::test_places_geojson_structure -x` | ❌ Wave 0 |
| PPIPE-04 | places.json is valid JSON array with required keys + counts | unit | `uv run pytest tests/test_places_pipeline.py::test_places_json_structure -x` | ❌ Wave 0 |
| PPIPE-05 | places.geojson and places.json tracked in git | manual | `git ls-files public/data/places.geojson public/data/places.json` | — |
| PPAGE-03 | per-place SVG files exist for each slug in places.toml | unit | `uv run pytest tests/test_places_pipeline.py::test_place_svg_files_exist -x` | ❌ Wave 0 |
| PPAGE-03 | per-place SVG files are byte-stable across two runs | unit | `uv run pytest tests/test_places_pipeline.py::test_place_svg_byte_stable -x` | ❌ Wave 0 |

### Test architecture for integration tests (PPIPE-01, PPIPE-02)

The existing `fixture_db` (conftest.py) creates an in-memory DuckDB with geographies schema.
Phase 98 tests need:

1. **`fixture_db` extension:** Add `geographies.places` table with at least 1 test polygon
   (covering a known test occurrence lat/lon). This can be a new fixture or extension to
   `_create_tables` + `_seed_data`. Adding a test polygon that covers the existing Chelan
   occurrence point (lat=47.608, lon=-120.912) would make integration testing clean.

2. **places_load unit test:** Call `load_places()` with a temp TOML file against a temp DB,
   then verify `SELECT COUNT(*) FROM geographies.places` returns expected count.

3. **PPIPE-02 integration test:** Requires running `dbt build` against `fixture_db` with
   `geographies.places` populated — this is a heavy integration test. Alternatively, test
   the SQL CTE logic directly without dbt by running the occurrences.sql SELECT in Python.

### Wave 0 Gaps

- [ ] `data/tests/test_places_pipeline.py` — covers all PPIPE-0x and PPAGE-03 test cases
- [ ] `data/tests/conftest.py` extension — add `geographies.places` table + seed row covering
  test occurrence coordinate (lat=47.608, lon=-120.912 is in Chelan County, must add a
  place polygon that includes it for integration testing)

---

## Security Domain

> `security_enforcement` not explicitly set to false in `.planning/config.json` → included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — pipeline runs as cron, no auth surface |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a — pipeline output is public read-only data |
| V5 Input Validation | yes (partial) | `places_validation.py` (Phase 97) validates TOML before load; DuckDB parameterized queries for all inserts |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| WKT injection via geometry_wkt | Tampering | Parameterized DuckDB INSERT (`?` placeholders); validated by Phase 97 before load |
| Stale geographies.places from aborted pipeline | Tampering | `CREATE OR REPLACE TABLE` makes each run idempotent |
| places.geojson committed with wrong geometry | Information Disclosure | pytest structure check + visual inspection at merge |

---

## Sources

### Primary (HIGH confidence)
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql` — spatial join pattern, CTE structure, final SELECT column list
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml` — current 30-column contract, how to add column 31
- `/Users/rainhead/dev/beeatlas/data/dbt/models/sources.yml` — geographies source declaration, where to add `places`
- `/Users/rainhead/dev/beeatlas/data/dbt/macros/emit_feature_collection.sql` — GeoJSON export structure, FORMAT CSV workaround rationale
- `/Users/rainhead/dev/beeatlas/data/species_maps.py` — SVG pattern: county backdrop, occurrence dots, byte-stable attributes, WA bbox, `_write_species_svg`
- `/Users/rainhead/dev/beeatlas/data/geographies_pipeline.py` — `CREATE OR REPLACE TABLE geographies.*` pattern, DuckDB connect + LOAD spatial
- `/Users/rainhead/dev/beeatlas/data/places_validation.py` — `LOAD spatial` (not INSTALL) for nightly modules
- `/Users/rainhead/dev/beeatlas/data/run.py` — STEPS list ordering, `_run_dbt_build` artifact copy pattern, `EXPORT_DIR`
- `/Users/rainhead/dev/beeatlas/.planning/STATE.md` — locked decisions: no fallback, promoteId: slug, LOAD spatial only, two export artifacts

### Secondary (MEDIUM confidence)
- `/Users/rainhead/dev/beeatlas/data/species_export.py` — `EXPORT_DIR` vs `DBT_SANDBOX_DIR` distinction, count query patterns
- `/Users/rainhead/dev/beeatlas/data/tests/conftest.py` — fixture_db pattern for integration tests; geographies schema structure
- `/Users/rainhead/dev/beeatlas/.gitignore` — `/public/data/` blanket ignore; `git ls-files public/data/` returning empty

---

## Metadata

**Confidence breakdown:**
- places_load step: HIGH — direct pattern from geographies_pipeline.py, TOML loading from places_validation.py
- occurrences.sql CTE: HIGH — existing county CTE is the exact template; no-fallback is explicit in requirements
- schema.yml update: HIGH — mechanical addition of one row; enforcement mechanism understood
- places_export (Python): HIGH — standard DuckDB + JSON pattern; read path understood
- places_maps.py: HIGH — species_maps.py is the exact pattern; only minor adaptation needed
- .gitignore negation for CI: MEDIUM — mechanism is standard git, but git ls-files confirmed no files currently tracked; need to verify negation rule works correctly
- Test architecture: HIGH — fixture_db pattern well understood; gaps documented

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (stable pipeline codebase; no fast-moving dependencies)
