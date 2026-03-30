---
phase: 21-parquet-and-geojson-export
verified: 2026-03-27T22:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 21: Parquet and GeoJSON Export Verification Report

**Phase Goal:** A single export script produces ecdysis.parquet, samples.parquet, counties.geojson, and ecoregions.geojson from DuckDB, passing schema validation
**Verified:** 2026-03-27T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                               | Status     | Evidence                                                                               |
|----|-------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------|
| 1  | ecdysis.parquet has 15 columns including inat_observation_id, county, ecoregion_l3  | ✓ VERIFIED | validate-schema.mjs passes with all 15 columns; COPY TO selects exactly 15             |
| 2  | Every row in ecdysis.parquet has non-null county and ecoregion_l3                   | ✓ VERIFIED | export.py asserts null_county == 0 and null_eco == 0 after write; SUMMARY confirms 0   |
| 3  | samples.parquet has 9 columns including specimen_count sourced from field_id=8338   | ✓ VERIFIED | validate-schema.mjs passes; field_id=8338 in export.py line 156                        |
| 4  | counties.geojson contains 39 WA county features with NAME property                  | ✓ VERIFIED | node check: 39 features, first NAME = "Wahkiakum"; file size 170,214 bytes             |
| 5  | ecoregions.geojson contains features with NA_L3NAME property filtered via ST_Intersects | ✓ VERIFIED | node check: 66 features, first NA_L3NAME = "Columbia Plateau"; ST_Intersects in export.py |
| 6  | GeoJSON files are simplified (counties < 500KB, ecoregions < 1.5MB)                | ✓ VERIFIED | counties: 170,214 bytes; ecoregions: 1,021,619 bytes; ST_SimplifyPreserveTopology used |
| 7  | validate-schema.mjs includes inat_observation_id in ecdysis.parquet expected columns | ✓ VERIFIED | Line 22 of validate-schema.mjs: 'inat_observation_id' present; npm run validate-schema exits 0 |
| 8  | validate-schema.mjs no longer validates links.parquet                               | ✓ VERIFIED | grep for 'links.parquet' in validate-schema.mjs returns NOT FOUND                     |
| 9  | region-layer.ts imports counties.geojson and ecoregions.geojson (new filenames)     | ✓ VERIFIED | Lines 8-9 of region-layer.ts import from './assets/counties.geojson' and './assets/ecoregions.geojson'; no old filenames present |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                               | Expected                                          | Status     | Details                                    |
|----------------------------------------|---------------------------------------------------|------------|--------------------------------------------|
| `data/export.py`                       | Single export script producing all frontend outputs from DuckDB | ✓ VERIFIED | 284 lines; defines main(), export_ecdysis_parquet(), export_samples_parquet(), export_counties_geojson(), export_ecoregions_geojson() |
| `frontend/src/assets/ecdysis.parquet`  | Specimen data with spatial columns and inat_observation_id | ✓ VERIFIED | Gitignored build artifact; validated by validate-schema.mjs passing |
| `frontend/src/assets/samples.parquet`  | Sample data with spatial columns and specimen_count | ✓ VERIFIED | Gitignored build artifact; validated by validate-schema.mjs passing |
| `frontend/src/assets/counties.geojson` | WA county boundaries for map display              | ✓ VERIFIED | 170,214 bytes; 39 features; NAME property confirmed |
| `frontend/src/assets/ecoregions.geojson` | WA ecoregion boundaries for map display         | ✓ VERIFIED | 1,021,619 bytes; 66 features; NA_L3NAME property confirmed |
| `scripts/validate-schema.mjs`          | Updated schema validation gate                    | ✓ VERIFIED | inat_observation_id present; links.parquet entry absent |
| `frontend/src/region-layer.ts`         | Updated GeoJSON imports                           | ✓ VERIFIED | Imports from counties.geojson and ecoregions.geojson; old filenames absent |

### Key Link Verification

| From                      | To                                   | Via                                           | Status     | Details                                                         |
|---------------------------|--------------------------------------|-----------------------------------------------|------------|-----------------------------------------------------------------|
| `data/export.py`          | `data/beeatlas.duckdb`               | `duckdb.connect(DB_PATH, read_only=True)`     | ✓ WIRED    | Line 271 of export.py; DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb") |
| `data/export.py`          | `frontend/src/assets/`               | COPY TO and json.dumps writes                 | ✓ WIRED    | ASSETS_DIR defined line 19; used in all four export functions   |
| `scripts/validate-schema.mjs` | `frontend/src/assets/ecdysis.parquet` | EXPECTED column list                      | ✓ WIRED    | 'inat_observation_id' present in ecdysis.parquet array, line 22 |
| `frontend/src/region-layer.ts` | `frontend/src/assets/counties.geojson` | import statement                        | ✓ WIRED    | Line 8: `import countiesJson from './assets/counties.geojson'` |
| `frontend/src/region-layer.ts` | `frontend/src/assets/ecoregions.geojson` | import statement                    | ✓ WIRED    | Line 9: `import ecoregionsJson from './assets/ecoregions.geojson'` |

### Data-Flow Trace (Level 4)

| Artifact                        | Data Variable    | Source                                      | Produces Real Data | Status      |
|---------------------------------|------------------|---------------------------------------------|--------------------|-------------|
| `data/export.py` → ecdysis.parquet | 46,090 rows   | ecdysis_data.occurrences + occurrence_links | Yes                | ✓ FLOWING   |
| `data/export.py` → samples.parquet | 9,663 rows   | inaturalist_data.observations + ofvs         | Yes                | ✓ FLOWING   |
| `data/export.py` → counties.geojson | 39 features | geographies.us_counties WHERE state_fips='53' | Yes              | ✓ FLOWING   |
| `data/export.py` → ecoregions.geojson | 66 features | geographies.ecoregions via ST_Intersects    | Yes               | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                     | Command                                           | Result                         | Status  |
|----------------------------------------------|---------------------------------------------------|--------------------------------|---------|
| Schema validation passes for both parquet files | `npm run validate-schema`                        | ✓ ecdysis.parquet, ✓ samples.parquet | ✓ PASS |
| counties.geojson has 39 features with NAME   | node JSON parse + assert                          | 39 features, NAME="Wahkiakum"  | ✓ PASS  |
| ecoregions.geojson has features with NA_L3NAME | node JSON parse + assert                         | 66 features, NA_L3NAME="Columbia Plateau" | ✓ PASS |
| counties.geojson < 500KB                     | `ls -la` size check                               | 170,214 bytes                  | ✓ PASS  |
| ecoregions.geojson < 1.5MB                   | `ls -la` size check                               | 1,021,619 bytes                | ✓ PASS  |
| Stale files deleted                          | `ls` for wa_counties.geojson, epa_l3_ecoregions_wa.geojson, links.parquet | "No such file or directory" x3 | ✓ PASS |
| links.parquet absent from validate-schema.mjs | grep for 'links.parquet'                         | NOT FOUND                      | ✓ PASS  |
| Old GeoJSON names absent from region-layer.ts | grep for 'wa_counties\|epa_l3_ecoregions_wa'    | NO OLD REFS                    | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                               | Status      | Evidence                                                                              |
|-------------|-------------|-----------------------------------------------------------------------------------------------------------|-------------|---------------------------------------------------------------------------------------|
| EXP-01      | 21-01       | ecdysis.parquet with current frontend schema plus inat_observation_id; county/ecoregion_l3 via ST_Within  | ✓ SATISFIED | export.py SELECT includes inat_observation_id (line 101); validate-schema passes      |
| EXP-02      | 21-01       | Nearest-polygon fallback (ST_Distance ORDER BY LIMIT 1) handles specimens outside polygon boundaries      | ✓ SATISFIED | county_fallback and eco_fallback CTEs use ST_Distance; asserts 0 null rows            |
| EXP-03      | 21-01       | samples.parquet with county/ecoregion_l3 from spatial join; specimen_count from field_id=8338            | ✓ SATISFIED | field_id=8338 in export.py line 156; validate-schema passes for samples.parquet       |
| EXP-04      | 21-02       | All exports pass validate-schema.mjs (inat_observation_id added; links.parquet removed)                   | ✓ SATISFIED | npm run validate-schema exits 0; inat_observation_id in EXPECTED; links.parquet absent |
| GEO-01      | 21-01, 21-02 | frontend/src/assets/counties.geojson from geographies.us_counties WHERE state_fips='53'                  | ✓ SATISFIED | File exists, 39 features, NAME property; region-layer.ts imports it                  |
| GEO-02      | 21-01, 21-02 | frontend/src/assets/ecoregions.geojson from geographies.ecoregions filtered via ST_Intersects to WA       | ✓ SATISFIED | File exists, 66 features, NA_L3NAME property; region-layer.ts imports it             |

All 6 requirements from REQUIREMENTS.md (EXP-01 through EXP-04, GEO-01, GEO-02) are satisfied. No orphaned requirements — REQUIREMENTS.md traceability table maps all 6 to Phase 21 with status "Complete".

### Anti-Patterns Found

No blockers or warnings found.

| File              | Pattern Checked                    | Result                     |
|-------------------|------------------------------------|----------------------------|
| `data/export.py`  | TODO/FIXME/placeholder             | None found                 |
| `data/export.py`  | Empty implementations (return [])  | None — all functions write real data |
| `data/export.py`  | Hardcoded empty state              | None — all data from DuckDB queries |
| `scripts/validate-schema.mjs` | Stub patterns          | None — full column validation loop |
| `frontend/src/region-layer.ts` | Placeholder returns   | None — fully wired to GeoJSON sources |

Notable deviation from plan (documented in SUMMARY, not a gap): parquet files remain gitignored per project convention. The plan listed them in `files_modified` but the gitignore constraint correctly takes precedence. The files are generated at build time and validated via `npm run validate-schema`.

### Human Verification Required

None. All verifiable goals are confirmed programmatically.

### Gaps Summary

No gaps. All must-haves verified.

---

_Verified: 2026-03-27T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
