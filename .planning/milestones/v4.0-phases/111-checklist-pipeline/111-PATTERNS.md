# Phase 111: Checklist Pipeline - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/marts/checklist.sql` | model (mart) | transform | `data/dbt/models/marts/occurrences.sql` | role-match (same external parquet materialization + spatial join, different input grain) |
| `data/dbt/models/marts/schema.yml` | config (contract) | — | `data/dbt/models/marts/schema.yml` (existing `occurrences` entry) | exact (appending model entry to same file) |
| `data/run.py` | config (pipeline orchestrator) | batch | `data/run.py` `_run_dbt_build` copy loop (lines 72-77) | exact (one-line addition to existing list) |
| `data/nightly.sh` | config (deployment wrapper) | batch | `data/nightly.sh` upload + manifest block (lines 150-169) | exact (one new `_upload_hashed` call + manifest key) |
| `data/tests/test_dbt_scaffold.py` | test | — | `data/tests/test_dbt_scaffold.py` occurrences guard block (lines 31-60) | exact (new `_CHECKLIST_GUARD` block following same skipif pattern) |

---

## Pattern Assignments

### `data/dbt/models/marts/checklist.sql` (mart, transform)

**Analog:** `data/dbt/models/marts/occurrences.sql`

**Config/materialization pattern** (`occurrences.sql` lines 12-17):
```sql
{{ config(
    materialized='external',
    location='target/sandbox/checklist.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```
Note: `location` is relative so `external_root` in `profiles.yml` (`target/sandbox`) applies. The filename in `location` must match the artifact name used in `run.py` and `nightly.sh`.

**Spatial join core pattern** (`occurrences.sql` lines 26-70 — county + eco pattern):
The checklist mart does not have point coordinates, so it uses county-centroid geometry instead of `ST_Point(lon, lat)`. The fallback `eco_fallback` CTE is mandatory — Island County and Kitsap County centroids fall in Puget Sound and miss the primary `ST_Within` join.

```sql
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
```

**Family enrichment pattern** (`int_species_universe.sql` lines 58-63):
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
    ON tle.taxon_id = ctt.taxon_id
```
For checklist.sql, use `sc.canonical_name` directly (no COALESCE needed — input is always a checklist row).

**SELECT output columns — apply TRIM() to all varchar fields from raw source:**
```sql
SELECT
    wl.canonical_name,
    TRIM(wl.scientificName)    AS scientificName,
    TRIM(wl.genus)             AS genus,
    TRIM(wl.specific_epithet)  AS specific_epithet,
    wl.family,                 -- already TRIM(tle.family) from CTE
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
Key invariants:
- `lat`/`lon`/`year`/`month` are always `NULL` — these are county-range assertions, not point occurrences.
- `source='checklist'` literal on every row — the `source` column is load-bearing for Phase 112+ layer separation.
- Output grain is one row per `(scientificName, county)` pair from `species_counties` (2,861 rows), not one per species (527).
- This mart MUST NOT `ref('int_combined')` or `ref('int_ecdysis_base')`.

**Header comment pattern** (`occurrences.sql` lines 1-11):
```sql
-- Checklist parquet mart: county-range assertions from Bartholomew et al. 2024 WA checklist.
-- Architecture: checklist.parquet is a separate mart from occurrences.parquet.
-- Checklist records are county-range assertions (no point coordinates).
-- They MUST NOT appear in int_combined or occurrences.parquet (locked decision, STATE.md).
-- source='checklist' convention: all rows carry source='checklist'.
-- Future sources (GBIF, other Bee Atlas programs) should produce analogous parquet files
-- with their own source= constant and the same 12-column schema.
```

---

### `data/dbt/models/marts/schema.yml` (config, contract extension)

**Analog:** `data/dbt/models/marts/schema.yml` existing `occurrences` model entry (lines 4-70)

**Contract block pattern** (lines 4-8 — replicate for checklist):
```yaml
  - name: checklist
    config:
      contract:
        enforced: true
    columns:
```

**Column entry pattern** (lines 9-70 — one entry per output column):
```yaml
      - name: canonical_name
        data_type: varchar
        data_tests:
          - not_null
      - name: lat
        data_type: double
      - name: year
        data_type: bigint
```
All 12 output columns must be declared. `canonical_name` and `specific_epithet` carry `data_tests: [not_null]`. The `source` column is `data_type: varchar` with no not_null test (contract enforces type; pytest enforces value).

**Placement:** Append the `checklist` model entry after the `species` entry at the bottom of the existing file.

---

### `data/run.py` (pipeline orchestrator, one-line change)

**Analog:** `data/run.py` `_run_dbt_build` function (lines 56-77)

**Artifact copy loop** (lines 74-77):
```python
for artifact in ("occurrences.parquet", "counties.geojson", "ecoregions.geojson"):
    src = _DBT_SANDBOX / artifact
    dst = _EXPORT_DIR / artifact
    shutil.copy2(src, dst)
```

**Change:** Add `"checklist.parquet"` to the tuple:
```python
for artifact in ("occurrences.parquet", "counties.geojson", "ecoregions.geojson",
                 "checklist.parquet"):
```

No other changes to `run.py`. The `checklist` STEP in `STEPS` (line 87) already exists and loads the raw TSV — it is unrelated to this copy step.

---

### `data/nightly.sh` (deployment wrapper, two additions)

**Analog:** `data/nightly.sh` upload block (lines 139-169)

**`_upload_hashed` function** (lines 139-148 — read-only reference):
```bash
_upload_hashed() {
    local src="$1" basename="$2"; shift 2
    local ext="${src##*.}"
    local hash; hash=$(sha256sum "$src" | awk '{print $1}' | cut -c1-12)
    local hashed_name="${basename}-${hash}.${ext}"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        "$@" "$src" "s3://$BUCKET/data/$hashed_name" >&2
    echo "$hashed_name"
}
```

**Existing upload calls pattern** (lines 150-155):
```bash
occ_name=$(_upload_hashed "$EXPORT_DIR/occurrences.parquet" "occurrences")
species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")
```

**Change 1 — add upload call** after `places_meta_name` line (line 155), before the `manifest.json` heredoc:
```bash
checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")
```

**Change 2 — extend manifest.json heredoc** (lines 158-169):
```bash
cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  "occurrences": "$occ_name",
  "species": "$species_name",
  "seasonality": "$seasonality_name",
  "counties": "$counties_name",
  "ecoregions": "$ecoregions_name",
  "places": "$places_name",
  "places_meta": "$places_meta_name",
  "checklist": "$checklist_name",
  "generated_at": "$(_ts)"
}
JSON
```
Note: `"checklist"` key must be present before `"generated_at"` (trailing comma rules in JSON do not apply — each key except the last has a comma; `generated_at` remains the final key with no trailing comma).

---

### `data/tests/test_dbt_scaffold.py` (test, new guard block)

**Analog:** `data/tests/test_dbt_scaffold.py` occurrences guard block (lines 31-60)

**SANDBOX path constant** (line 24 — already present, reuse):
```python
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
```

**skipif guard pattern** (lines 31-34):
```python
@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
```

**Multi-column assertion pattern** (lines 44-60):
```python
def test_occurrences_has_rows_and_zero_null_county_or_eco():
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            ...
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 2, ...
    assert null_county == 0, ...
```

**New checklist guard block — use a module-level guard variable** (RESEARCH.md Pattern 5):
```python
_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce checklist.parquet",
)
```
Decorate each checklist test with `@_CHECKLIST_GUARD` rather than repeating the `skipif` inline.

**Tests to add** (one function per assertion, matching CHECK-04 + EXT-01 + isolation):
- `test_checklist_row_count` — `COUNT(*) >= 2000`
- `test_checklist_no_null_canonical_name` — `WHERE canonical_name IS NULL == 0`
- `test_checklist_no_null_specific_epithet` — `WHERE specific_epithet IS NULL == 0`
- `test_checklist_family_trim` — `WHERE family <> TRIM(family) == 0`
- `test_checklist_source_constant` — `DISTINCT source == {'checklist'}`
- `test_occurrences_row_count_not_inflated_by_checklist` — `COUNT(*) <= 50_000` (isolation guard; uses its own inline `skipif` on `occurrences.parquet`, not `_CHECKLIST_GUARD`)

**f-string path pattern** (used throughout existing tests):
```python
parquet_path = str(SANDBOX / "checklist.parquet")
duckdb.execute(f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')").fetchone()
```

---

## Shared Patterns

### dbt External Parquet Materialization
**Source:** `data/dbt/models/marts/occurrences.sql` lines 12-17
**Apply to:** `checklist.sql`
```sql
{{ config(
    materialized='external',
    location='target/sandbox/checklist.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```
The `location` path is relative; `external_root` in `data/dbt/profiles.yml` resolves it to `data/dbt/target/sandbox/`.

### ST_Distance Fallback for Island Geometry
**Source:** `data/dbt/models/marts/occurrences.sql` lines 59-70 (eco_fallback CTE)
**Apply to:** `checklist.sql` (county-centroid variant)
The fallback is mandatory for Island County and Kitsap County, whose polygon centroids fall in Puget Sound. Any test asserting zero null ecoregion rows will fail without it.

### iNat Lineage Family Join
**Source:** `data/dbt/models/intermediate/int_species_universe.sql` lines 58-63
**Apply to:** `checklist.sql` `with_lineage` CTE
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = sc.canonical_name
LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
    ON tle.taxon_id = ctt.taxon_id
```

### SANDBOX Guard skipif
**Source:** `data/tests/test_dbt_scaffold.py` lines 31-34
**Apply to:** All new checklist test functions in `test_dbt_scaffold.py`
Declare a single `_CHECKLIST_GUARD` module-level variable and decorate every checklist test with it. The isolation test (`test_occurrences_row_count_not_inflated_by_checklist`) uses its own inline guard keyed on `occurrences.parquet` instead.

### Content-Hashed S3 Upload
**Source:** `data/nightly.sh` `_upload_hashed` function (lines 139-148)
**Apply to:** `checklist_name` upload call in `nightly.sh`
Plain parquet files (no `--content-type` override needed — S3 default `application/octet-stream` is fine for parquet). Only GeoJSON files need `--content-type application/json`.

---

## No Analog Found

All five files have close analogs. No entries here.

---

## Metadata

**Analog search scope:** `data/dbt/models/marts/`, `data/dbt/models/intermediate/`, `data/tests/`, `data/run.py`, `data/nightly.sh`
**Files read:** 6 source files
**Pattern extraction date:** 2026-05-23
