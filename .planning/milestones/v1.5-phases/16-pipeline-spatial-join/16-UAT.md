---
status: complete
phase: 16-pipeline-spatial-join
source: 16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md, 16-05-SUMMARY.md, 16-06-SUMMARY.md, 16-07-SUMMARY.md
started: 2026-03-14T19:40:16Z
updated: 2026-03-14T19:45:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. GeoJSON boundary files exist in frontend assets
expected: |
  Both boundary files are present in frontend/src/assets/ and within size limits.
  Run: ls -lh frontend/src/assets/wa_counties.geojson frontend/src/assets/epa_l3_ecoregions_wa.geojson
  Expected: wa_counties.geojson ~56 KB, epa_l3_ecoregions_wa.geojson ~357 KB (both under 400 KB)
result: pass

### 2. Spatial tests all pass
expected: |
  All 9 spatial join tests pass GREEN.
  Run: cd data && uv run python -m pytest tests/test_spatial.py -v
  Expected: 9 passed, 0 failed across TestAddRegionColumns, TestEcdysisIntegration, TestInatIntegration, TestBuildGeoJSON
result: pass

### 3. Schema validation gate enforces new columns
expected: |
  validate-schema.mjs requires county and ecoregion_l3 in both parquet files, and fails if absent.
  Run: node scripts/validate-schema.mjs (with stale/missing parquets OR check the script directly)
  Expected: script exits 1 with message "missing columns: county, ecoregion_l3" when columns are absent,
  exits 0 when fresh parquets with the new columns are present (confirmed by last CI run).
result: pass

### 4. fetch-data CI workflow produces parquets with region columns
expected: |
  The last fetch-data run completed successfully with the boundary download + pipeline fix.
  Run: gh run list --workflow=fetch-data.yml --limit=1
  Expected: status=completed, conclusion=success (confirming ecdysis.parquet and samples.parquet
  were generated with county and ecoregion_l3 columns and uploaded to S3)
result: pass

### 5. GeoJSON files have correct geographic content
expected: |
  wa_counties.geojson contains 39 WA county polygons with NAME property.
  epa_l3_ecoregions_wa.geojson contains WA-clipped ecoregions with NA_L3NAME property.
  Quick check: python3 -c "import json; d=json.load(open('frontend/src/assets/wa_counties.geojson')); print(len(d['features']), 'features,', d['features'][0]['properties'])"
  Expected: 39 features, properties show NAME key with a WA county name (e.g. 'King')
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
