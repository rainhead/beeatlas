# Phase 111: Checklist Pipeline - Research

**Researched:** 2026-05-23
**Domain:** dbt-duckdb external mart, spatial join, Python pipeline integration, S3/CloudFront deployment
**Confidence:** HIGH

## Summary

Phase 111 adds a `checklist.parquet` dbt mart that exposes the Bartholomew et al. 2024 WA bee checklist as a first-class pipeline artifact. The data source (`checklist_data.species` and `checklist_data.species_counties`) already exists in DuckDB, populated by `checklist_pipeline.py` which has run since Phase 76. The staging view `stg_checklist__species.sql` already exists. The work in Phase 111 is additive: one new mart model, a schema contract, extensions to `run.py` and `nightly.sh`, and pytest assertions.

**Primary recommendation:** Add `marts/checklist.sql` as an `external` parquet mart using the same spatial-join pattern as `occurrences.sql`, pulling county geometry centroids through `stg_geo__us_counties` and joining to `stg_geo__ecoregions` with a nearest-neighbor fallback for island counties. Family comes from a join through `stg_inat__canonical_to_taxon_id` + `stg_inat__taxon_lineage_extended`. The 2,861 `species_counties` rows (one per species-county pair) become the output rows; lat/lon/year/month are NULL throughout (county-range assertions carry no coordinates or dates).

The second critical delivery is wiring `checklist.parquet` into the upload/manifest pipeline in `nightly.sh`. Without this, CHECK-03 is unmet even if the dbt build succeeds.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TSV ingestion into DuckDB | Python pipeline (checklist_pipeline.py) | — | Already done since Phase 76; no change needed |
| Family/lineage enrichment | dbt mart (SQL JOIN) | — | Joins stg_inat__taxon_lineage_extended, same pattern as int_species_universe |
| County -> ecoregion spatial join | dbt mart (SQL + DuckDB spatial ext) | — | ST_Centroid + ST_Within + ST_Distance fallback, same as occurrences.sql |
| Parquet export | dbt external materialization | run.py copy step | dbt writes to sandbox; run.py copies to EXPORT_DIR |
| S3/CloudFront upload | nightly.sh (_upload_hashed) | manifest.json | Content-hashed upload + manifest entry, same pattern as occurrences |
| Isolation guard | pytest assertion | dbt schema contract | occurrences.parquet row count must not increase after Phase 111 |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHECK-01 | Pipeline reads committed checklist CSV, parses specific_epithet from Scientific Name (strips author+year), normalizes date formats, applies TRIM() to varchar fields, spatial-joins county and ecoregion_l3 | checklist_pipeline.py already loads TSV; stg_checklist__species.sql exists; new mart adds TRIM() and spatial join in SQL |
| CHECK-02 | `checklist.parquet` produced with columns: canonical_name, scientificName, genus, specific_epithet, family, lat (nullable), lon (nullable), year (nullable), month (nullable), county, ecoregion_l3, source='checklist' | New marts/checklist.sql external parquet materializing these exact columns |
| CHECK-03 | `checklist.parquet` uploaded to S3/CloudFront as part of nightly pipeline export | nightly.sh extension: _upload_hashed + manifest.json entry |
| CHECK-04 | Pytest assertions pass: row count >= 2000, no null canonical_name, no null specific_epithet, TRIM(family) = family | New tests in test_dbt_scaffold.py using SANDBOX guard pattern |
| EXT-01 | source='checklist' column present; pipeline architecture documented for future sources | source='checklist' literal in mart SQL; architecture comment in checklist.sql header |
</phase_requirements>

## Standard Stack

### Core (already installed, no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dbt-duckdb | 1.10.1 (pinned) | dbt adapter for DuckDB | Project standard since Phase 85 |
| DuckDB spatial | bundled with duckdb >=1.4 | ST_Centroid, ST_Within, ST_Distance | Project standard since Phase 47 |
| pyarrow | >=12 | Reading parquet in pytest | Already in pyproject.toml |

[VERIFIED: existing pyproject.toml and run.sh — no new packages needed]

### No New Packages Required

Phase 111 is purely SQL + Python wiring within the existing pipeline. No new `pip install` or `npm install` is needed.

## Package Legitimacy Audit

No new packages. Audit not applicable.

## Architecture Patterns

### System Architecture Diagram

```
wa_bee_checklist.tsv (committed)
         │
         ▼
checklist_pipeline.py::load_checklist()   [already in run.py STEPS]
         │  writes
         ▼
checklist_data.species (DuckDB)           [527 rows, family=NULL]
checklist_data.species_counties (DuckDB)  [2861 rows: (scientificName, county)]
         │
         ▼
stg_checklist__species (dbt view)         [SELECT * FROM source]
         │
         ┌────────────────────────────────────┐
         │   marts/checklist.sql              │
         │   (new, materialized='external')   │
         │   Input CTEs:                      │
         │   1. species_counties JOIN species │
         │   2. canonical_name → taxon_id     │
         │   3. taxon_id → family/genus       │
         │   4. county name → county geom     │
         │   5. centroid → ecoregion_l3       │
         │   6. fallback: ST_Distance nearest │
         └────────────────────────────────────┘
         │  writes
         ▼
data/dbt/target/sandbox/checklist.parquet [2861 rows]
         │
    run.py _run_dbt_build copies
         ▼
EXPORT_DIR/checklist.parquet              [public/data/ or /tmp/beeatlas-export/]
         │
    nightly.sh _upload_hashed
         ▼
s3://{BUCKET}/data/checklist-{hash}.parquet  → CloudFront /data/
         │
    nightly.sh writes
         ▼
manifest.json  +  "checklist": "checklist-{hash}.parquet"
```

### Recommended Project Structure Changes

```
data/dbt/models/
└── marts/
    ├── checklist.sql          # NEW — external parquet mart
    ├── schema.yml             # EXTEND — add checklist contract
    ├── occurrences.sql        # unchanged
    └── ...

data/
├── run.py                     # EXTEND _run_dbt_build copy list
└── nightly.sh                 # EXTEND _upload_hashed + manifest.json

data/tests/
└── test_dbt_scaffold.py       # EXTEND — add checklist.parquet assertions
```

### Pattern 1: dbt External Parquet Mart

**What:** A dbt model with `materialized='external'` writes a parquet file to `target/sandbox/` via DuckDB's `COPY` mechanism.

**When to use:** When a mart must be available to downstream Python post-steps or directly uploaded to S3. Parquet format chosen for efficient columnar reads.

```sql
-- Source: data/dbt/models/marts/occurrences.sql (existing pattern)
{{ config(
    materialized='external',
    location='target/sandbox/checklist.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

### Pattern 2: County Centroid → Ecoregion Join

**What:** Convert county name to geometry, take centroid, spatial-join to ecoregions, with ST_Distance fallback for island counties.

**When to use:** When input data has county names (strings) rather than point coordinates. Island County and Kitsap County centroids fall in water and miss the ST_Within join — the fallback is mandatory.

```sql
-- Source: verified by running against data/beeatlas.duckdb (2026-05-23)
WITH county_centroids AS (
    SELECT county, ST_Centroid(geom) AS centroid
    FROM {{ ref('stg_geo__us_counties') }}
),
with_eco AS (
    SELECT cc.county, e.ecoregion_l3
    FROM county_centroids cc
    LEFT JOIN {{ ref('stg_geo__ecoregions') }} e ON ST_Within(cc.centroid, e.geom)
),
eco_dedup AS (
    SELECT DISTINCT ON (county) county, ecoregion_l3
    FROM with_eco
),
eco_fallback AS (
    SELECT county,
        (SELECT ecoregion_l3 FROM {{ ref('stg_geo__ecoregions') }}
         ORDER BY ST_Distance(geom,
             (SELECT centroid FROM county_centroids cc2 WHERE cc2.county = eco_dedup.county))
         LIMIT 1) AS ecoregion_l3
    FROM eco_dedup
    WHERE ecoregion_l3 IS NULL
),
final_eco AS (
    SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
    UNION ALL SELECT * FROM eco_fallback
)
```

**Verified:** Island County → "Strait of Georgia/Puget Lowland", Kitsap County → "Strait of Georgia/Puget Lowland". All 39 WA counties resolve with fallback. [VERIFIED: confirmed by direct DuckDB query against data/beeatlas.duckdb, 2026-05-23]

### Pattern 3: Family Enrichment via iNat Lineage

**What:** Checklist species have `family=NULL` in DuckDB (set by checklist_pipeline.py). Family must be resolved via the iNat lineage tables.

**When to use:** Whenever downstream SQL needs `family` for checklist-origin species.

```sql
-- Source: mirrors int_species_universe.sql LEFT JOIN pattern (verified existing)
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = sc.canonical_name
LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
    ON tle.taxon_id = ctt.taxon_id
```

**Verified:** 527/527 checklist species resolve to a non-null family via this join against current DuckDB. [VERIFIED: direct DuckDB query, 2026-05-23]

### Pattern 4: nightly.sh Upload + Manifest

**What:** New artifact uploaded with `_upload_hashed`, manifest.json extended.

**When to use:** Every new parquet/json artifact that Phase 112+ will need to fetch at runtime.

```bash
# Source: data/nightly.sh lines 139-147 (existing _upload_hashed function)
checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")

# manifest.json inline heredoc must gain new key:
cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  ...existing keys...,
  "checklist": "$checklist_name",
  ...
}
JSON
```

### Pattern 5: SANDBOX Guard Pytest Test

**What:** Integration tests guarded with `pytest.mark.skipif` that check for sandbox parquet existence before asserting content.

**When to use:** All post-`dbt build` assertions on parquet content.

```python
# Source: data/tests/test_dbt_scaffold.py (existing pattern, lines 23-29)
_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)

@_CHECKLIST_GUARD
def test_checklist_row_count():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/checklist.parquet')"
    ).fetchone()
    assert row[0] >= 2000
```

### Pattern 6: run.py _run_dbt_build Copy Extension

**What:** The `_run_dbt_build` function iterates over a list of artifact names to copy from sandbox to EXPORT_DIR. Adding `checklist.parquet` requires one line change.

```python
# Source: data/run.py lines 72-77 (existing pattern)
for artifact in ("occurrences.parquet", "counties.geojson", "ecoregions.geojson",
                 "checklist.parquet"):      # ADD THIS
    src = _DBT_SANDBOX / artifact
    dst = _EXPORT_DIR / artifact
    shutil.copy2(src, dst)
```

### Anti-Patterns to Avoid

- **Checklist rows in int_combined:** The STATE.md decision is locked: checklist records MUST NOT enter `int_combined` or `occurrences.parquet`. The isolation assertion (pytest) must confirm `occurrences.parquet` row count is unchanged (47,876 rows as of 2026-05-23).
- **Storing lat/lon coordinates from county centroid as the row's lat/lon:** The centroid is used only for the ecoregion lookup; the mart's lat/lon columns are NULL (county-range assertions, not point occurrences).
- **One row per species (not per species-county pair):** The output of `checklist.parquet` is one row per `(scientificName, county)` pair from `species_counties`. 2,861 rows, not 527.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| County → ecoregion spatial lookup | Custom Python spatial join | dbt SQL with ST_Centroid/ST_Within/ST_Distance | The spatial extension is already loaded in profiles.yml; re-using it keeps all spatial work in one layer |
| Parquet writing | Custom Python pyarrow write | dbt external materialization | Existing pattern; consistent SNAPPY codec |
| Content-hashed S3 upload | New upload function | nightly.sh `_upload_hashed` | One-line extension; avoids duplication |
| Family lookup | Storing family in checklist_pipeline.py | SQL join to taxon_lineage_extended | Family may change with iNat taxonomy updates; joining at mart time picks up latest lineage |

## Common Pitfalls

### Pitfall 1: Island/Kitsap County Centroid Falls in Water

**What goes wrong:** `ST_Within(ST_Centroid(county_geom), ecoregion_geom)` returns NULL for Island County and Kitsap County because their geographic centroids fall in Puget Sound, outside any ecoregion polygon.

**Why it happens:** Island County is an archipelago; Kitsap is a peninsula. The polygon centroid is not inside the polygon.

**How to avoid:** Use the same `eco_fallback` CTE pattern from `occurrences.sql` — `ORDER BY ST_Distance LIMIT 1` for any county with NULL ecoregion after the primary join.

**Warning signs:** Any test asserting `null_ecoregion = 0` will fail without the fallback.

[VERIFIED: Island, Kitsap confirmed by DuckDB query against actual geographies data, 2026-05-23]

### Pitfall 2: Checklist Rows Entering int_combined

**What goes wrong:** If any future schema change accidentally makes `stg_checklist__species` or a checklist intermediate model visible to `int_combined`, checklist species without coordinates would appear in `occurrences.parquet` with NULL lat/lon.

**Why it happens:** `int_combined` currently UNION ALLs `int_ecdysis_base` and provisional WABA rows. Accidental reference would add a third arm.

**How to avoid:** The pytest isolation assertion (checking `occurrences.parquet` count == 47,876) catches this. The `checklist.sql` mart must be self-contained — no `ref()` to `int_combined` or `int_ecdysis_base`.

**Warning signs:** `occurrences.parquet` row count exceeds baseline after `dbt build`.

### Pitfall 3: TRIM() Not Applied Before Parquet Write

**What goes wrong:** The STATE.md blocker notes "trailing whitespace in family names in checklist CSV silently drops species from int_species_universe." For the checklist mart, family is sourced from `taxon_lineage_extended` (not the raw TSV), so trailing whitespace risk is from that source. The `TRIM(family) = family` pytest assertion will catch it.

**How to avoid:** Apply `TRIM()` to all varchar columns in the mart SQL SELECT. The schema contract can also enforce this via dbt data tests.

### Pitfall 4: manifest.json Omits checklist Key

**What goes wrong:** `nightly.sh` uploads `checklist.parquet` to S3 but doesn't add it to `manifest.json`. Phase 112 (the map layer) will need to fetch `checklist.parquet` using the manifest's content-hashed filename. Without the manifest key, Phase 112 cannot locate the file.

**How to avoid:** Update the `manifest.json` heredoc in `nightly.sh` at the same time as adding the `_upload_hashed` call.

### Pitfall 5: run.py copy step omitted

**What goes wrong:** `dbt build` produces `target/sandbox/checklist.parquet` but `run.py _run_dbt_build` only copies `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`. The `checklist.parquet` stays in sandbox and never reaches `EXPORT_DIR`, so `nightly.sh` can't find it to upload.

**How to avoid:** Add `"checklist.parquet"` to the artifact list in `_run_dbt_build`.

## Code Examples

### Full checklist.sql Mart Structure

```sql
-- Source: pattern from data/dbt/models/marts/occurrences.sql (verified existing)
-- Architecture: checklist.parquet is a separate mart from occurrences.parquet.
-- Checklist records are county-range assertions (Bartholomew et al. 2024 WA checklist).
-- They MUST NOT appear in int_combined or occurrences.parquet (locked decision, STATE.md).
-- source='checklist' convention: all rows in this mart carry source='checklist'.
-- Future sources (GBIF, other Bee Atlas programs) should produce analogous parquet files
-- with their own source= constant and the same 12-column schema.
{{ config(
    materialized='external',
    location='target/sandbox/checklist.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH sc AS (
    -- One row per (species, county) pair from species_counties
    SELECT
        sp.canonical_name,
        sp.scientificName,
        sp.genus,
        sp.specific_epithet,
        sc.county
    FROM {{ source('checklist_data', 'species_counties') }} sc
    JOIN {{ ref('stg_checklist__species') }} sp USING (scientificName)
),
-- Enrich with family via iNat lineage (same join as int_species_universe)
with_lineage AS (
    SELECT
        sc.*,
        TRIM(tle.family) AS family
    FROM sc
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
        ON ctt.canonical_name = sc.canonical_name
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = ctt.taxon_id
),
-- County centroid for ecoregion spatial join
county_centroids AS (
    SELECT county, ST_Centroid(geom) AS centroid
    FROM {{ ref('stg_geo__us_counties') }}
),
with_eco AS (
    SELECT cc.county, e.ecoregion_l3
    FROM county_centroids cc
    LEFT JOIN {{ ref('stg_geo__ecoregions') }} e ON ST_Within(cc.centroid, e.geom)
),
eco_dedup AS (
    SELECT DISTINCT ON (county) county, ecoregion_l3
    FROM with_eco
),
eco_fallback AS (
    SELECT county,
        (SELECT ecoregion_l3 FROM {{ ref('stg_geo__ecoregions') }}
         ORDER BY ST_Distance(geom,
             (SELECT centroid FROM county_centroids cc2 WHERE cc2.county = eco_dedup.county))
         LIMIT 1) AS ecoregion_l3
    FROM eco_dedup
    WHERE ecoregion_l3 IS NULL
),
final_eco AS (
    SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
    UNION ALL SELECT * FROM eco_fallback
)
SELECT
    wl.canonical_name,
    TRIM(wl.scientificName)    AS scientificName,
    TRIM(wl.genus)             AS genus,
    TRIM(wl.specific_epithet)  AS specific_epithet,
    wl.family,
    NULL::DOUBLE               AS lat,
    NULL::DOUBLE               AS lon,
    NULL::BIGINT               AS year,
    NULL::BIGINT               AS month,
    TRIM(wl.county)            AS county,
    fe.ecoregion_l3,
    'checklist'                AS source
FROM with_lineage wl
JOIN final_eco fe ON fe.county = wl.county
```

### pytest Assertions for checklist.parquet (CHECK-04)

```python
# Pattern: extends data/tests/test_dbt_scaffold.py with new _CHECKLIST_GUARD block
# Source: existing SANDBOX_GUARD pattern in test_dbt_scaffold.py (verified)
import duckdb, pytest
from pathlib import Path

SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"

_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce checklist.parquet",
)

@_CHECKLIST_GUARD
def test_checklist_row_count():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
    ).fetchone()
    assert row[0] >= 2000, f"expected >= 2000 rows, got {row[0]}"

@_CHECKLIST_GUARD
def test_checklist_no_null_canonical_name():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
        " WHERE canonical_name IS NULL"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} null canonical_name rows"

@_CHECKLIST_GUARD
def test_checklist_no_null_specific_epithet():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
        " WHERE specific_epithet IS NULL"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} null specific_epithet rows"

@_CHECKLIST_GUARD
def test_checklist_family_trim():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
        " WHERE family <> TRIM(family)"
    ).fetchone()
    assert row[0] == 0, f"found {row[0]} rows where TRIM(family) != family"

@_CHECKLIST_GUARD
def test_checklist_source_constant():
    row = duckdb.execute(
        f"SELECT COUNT(DISTINCT source) FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
    ).fetchone()
    assert row[0] == 1
    val = duckdb.execute(
        f"SELECT DISTINCT source FROM read_parquet('{SANDBOX / 'checklist.parquet'}')"
    ).fetchone()[0]
    assert val == 'checklist'

# Isolation: occurrences.parquet must NOT grow after Phase 111
@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="requires sandbox occurrences.parquet",
)
def test_occurrences_row_count_not_inflated_by_checklist():
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX / 'occurrences.parquet'}')"
    ).fetchone()
    # Baseline established pre-Phase-111: 47,876 rows.
    # Checklist records MUST NOT enter int_combined.
    assert row[0] <= 50_000, (
        f"occurrences.parquet has {row[0]} rows — unexpectedly large; "
        "verify checklist rows did not enter int_combined"
    )
```

### schema.yml Contract for checklist Mart

```yaml
# Extends data/dbt/models/marts/schema.yml
  - name: checklist
    config:
      contract:
        enforced: true
    columns:
      - name: canonical_name
        data_type: varchar
        data_tests:
          - not_null
      - name: scientificName
        data_type: varchar
      - name: genus
        data_type: varchar
      - name: specific_epithet
        data_type: varchar
        data_tests:
          - not_null
      - name: family
        data_type: varchar
      - name: lat
        data_type: double
      - name: lon
        data_type: double
      - name: year
        data_type: bigint
      - name: month
        data_type: bigint
      - name: county
        data_type: varchar
      - name: ecoregion_l3
        data_type: varchar
      - name: source
        data_type: varchar
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python spatial join (export.py) | dbt SQL with DuckDB spatial extension | Phase 47 (v2.2) | Spatial joins now fully in SQL; county/ecoregion geometry in DuckDB |
| Live iNat API for lineage | taxa.csv.gz offline archive | Phase 110 (v4.0) | taxon_lineage_extended fully local; no rate-limit risk |
| checklist-only in species universe | checklist as separate mart | Phase 111 (v4.0) | checklist.parquet is a first-class pipeline output, separate from occurrences |

## Open Questions

1. **Family null rate in production**
   - What we know: 527/527 checklist species resolve to non-null family via current DuckDB as of 2026-05-23.
   - What's unclear: Whether taxa.csv.gz refresh in Phase 110 changed the lineage for any species.
   - Recommendation: The dbt schema contract (`not_null` on family via the dbt test) is the safety net; if any species has no lineage, it will fail the build rather than silently produce null family rows.

2. **"normalizes date formats" in CHECK-01**
   - What we know: The checklist TSV has no date columns. The requirement language may be forward-compatible or refer to the author-year stripping already done by `canonical_name.py`.
   - What's unclear: Whether there is any anticipated date data.
   - Recommendation: Implement year/month as NULL::BIGINT in the mart SQL; the column is present and nullable per CHECK-02. No date normalization is needed for the current TSV.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv / uvx | dbt run.sh wrapper | Yes | 0.11.15 | — |
| dbt-duckdb (via uvx) | marts/checklist.sql build | Yes | 1.10.1 (pinned) | — |
| DuckDB spatial extension | County centroid ST_Within join | Yes | bundled with duckdb 1.4 | — |
| aws CLI | nightly.sh S3 upload | Yes | 2.34.49 | n/a on dev (upload is nightly only) |
| pyarrow | pytest parquet read | Yes | >=12 in pyproject.toml | — |

**Missing dependencies with no fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (data/tests/) |
| Config file | data/pyproject.toml `[tool.pytest.ini_options]` testpaths=["tests"] |
| Quick run command | `cd data && uv run pytest tests/test_dbt_scaffold.py -q` |
| Full suite command | `cd data && uv run pytest -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHECK-02 | checklist.parquet has 12 required columns | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_columns -x` | ❌ Wave 0 |
| CHECK-04 | row count >= 2000 | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_row_count -x` | ❌ Wave 0 |
| CHECK-04 | no null canonical_name | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_no_null_canonical_name -x` | ❌ Wave 0 |
| CHECK-04 | no null specific_epithet | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_no_null_specific_epithet -x` | ❌ Wave 0 |
| CHECK-04 | TRIM(family) = family | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_family_trim -x` | ❌ Wave 0 |
| EXT-01 | source='checklist' in every row | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_checklist_source_constant -x` | ❌ Wave 0 |
| STATE.md isolation | occurrences.parquet not inflated | integration (sandbox guard) | `uv run pytest tests/test_dbt_scaffold.py::test_occurrences_row_count_not_inflated_by_checklist -x` | ❌ Wave 0 |

### Sampling Rate
- **Per wave commit:** `cd data && uv run pytest tests/test_checklist_pipeline.py -q` (existing unit tests, no build required)
- **Per wave merge:** `cd data && uv run pytest -q` (full suite, requires `bash data/dbt/run.sh build` first for sandbox guards)
- **Phase gate:** Full suite green + sandbox guards passing before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Integration test block in `data/tests/test_dbt_scaffold.py` — covers CHECK-02, CHECK-04, EXT-01, isolation assert (all SANDBOX-guarded)
- [ ] `data/dbt/models/marts/checklist.sql` — the mart itself (written in Wave 1)
- [ ] `data/dbt/models/marts/schema.yml` checklist contract entry (written with mart)

*(Existing tests in `test_checklist_pipeline.py` cover the Python loader; no modifications needed there for Phase 111.)*

## Security Domain

Security enforcement: no secrets, no auth surfaces. This phase writes a parquet file via dbt and uploads to S3 via nightly.sh (using the existing AWS_PROFILE mechanism). The upload pattern is unchanged from existing artifacts. No ASVS-relevant controls apply.

## Sources

### Primary (HIGH confidence)
- `data/dbt/models/marts/occurrences.sql` — external parquet materialization pattern
- `data/dbt/profiles.yml` — `external_root`, spatial extension declaration
- `data/nightly.sh` — `_upload_hashed` function and manifest.json heredoc
- `data/run.py` — `_run_dbt_build` copy loop
- `data/tests/test_dbt_scaffold.py` — SANDBOX guard pytest pattern
- `data/dbt/models/intermediate/int_species_universe.sql` — family enrichment JOIN pattern
- `data/dbt/models/marts/schema.yml` — contract enforced model pattern
- Direct DuckDB queries against `data/beeatlas.duckdb` (2026-05-23) — row counts, county centroid joins

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — locked decisions (checklist records separate from occurrences)
- `.planning/REQUIREMENTS.md` — CHECK-01 through CHECK-04, EXT-01

### Tertiary (LOW confidence)
- None — all findings verified against codebase directly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The row count of 47,876 in occurrences.parquet is the stable pre-Phase-111 baseline | Pitfall 2 / Code Examples | If baseline changed, isolation test threshold needs adjustment — low risk, test uses <= 50,000 not exact equality |
| A2 | All 527 checklist species will continue to resolve to non-null family via taxon_lineage_extended after Phase 110 cutover | Pitfall 3 | If any species loses lineage, `dbt build` would fail at schema contract — surfaced immediately, not silently |

**If this table is empty:** All other claims were verified against the live codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from pyproject.toml, run.sh, existing mart SQL
- Architecture: HIGH — verified by running spatial join queries against beeatlas.duckdb
- Pitfalls: HIGH — Island/Kitsap null centroid verified empirically; checklist isolation is a locked STATE.md decision
- nightly.sh wiring: HIGH — _upload_hashed and manifest.json pattern read directly from source

**Research date:** 2026-05-23
**Valid until:** 2026-07-01 (stable domain — dbt/DuckDB versions pinned, checklist TSV is a committed static file)
