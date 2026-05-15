---
phase: 92-slug-migration-pipeline-prep
plan: "02"
subsystem: data-pipeline
tags: [slug-migration, species-export, species-maps, PIPE-03]
requirements-completed: [PIPE-03]
dependency-graph:
  requires: [92-01]
  provides: [hierarchical-slug-emission, subdirectory-svg-layout]
  affects: [public/data/species.json, public/data/species.parquet, public/data/species-maps/]
tech-stack:
  added: []
  patterns:
    - "f\"{genus}/{epithet}\" slug construction bypassing _slugify for species rows"
    - "out_path.parent.mkdir(parents=True, exist_ok=True) before write_text"
    - "rglob('*.svg') for recursive directory size accounting"
key-files:
  created:
    - data/tests/test_species_export.py
    - data/tests/test_species_maps.py
  modified:
    - data/species_export.py
    - data/species_maps.py
    - src/tests/validate-species.test.ts
decisions:
  - "Use NOT LIKE '%/%' (absence of slash) not LIKE '%-%' (dash presence) to detect old flat slugs — Andrena/w-scripta has a hyphen in the epithet itself"
  - "geometry_wkt column no longer exists after quick task 260514-fp3 — use geom (GEOMETRY) directly"
metrics:
  duration: "~11 minutes"
  completed: "2026-05-15"
  tasks-completed: 3
  files-modified: 5
---

# Phase 92 Plan 02: Slug Migration Code Changes Summary

Hierarchical `Genus/specificEpithet` slug format implemented in `species_export.py` and `species_maps.py`. Wave 0 tests transitioned from RED to GREEN. Pipeline verified end-to-end with 630 species rows, 349 species-level SVGs in per-genus subdirectories.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| W0 | Create wave-0 failing tests (prerequisite) | 36a0678 | data/tests/test_species_export.py, data/tests/test_species_maps.py |
| 1 | Edit species_export.py slug-assignment loop | 85f68e1 | data/species_export.py |
| 2 | Edit species_maps.py subdir writes + rglob | 190af63 | data/species_maps.py |
| 3 | Run pipeline + fix deviations + verify | 146f859 | data/species_maps.py, data/tests/test_species_export.py, src/tests/validate-species.test.ts |

## Exact Diff Hunks Applied

### data/species_export.py (Task 1)

Lines 140-143 before:
```python
for r in species_rows:
    r['slug'] = _slugify(r['scientificName'])
    if r.get('month_histogram') is None:
        r['month_histogram'] = list(_ZERO_HIST)
```

Lines 140-149 after:
```python
for r in species_rows:
    genus = r.get('genus') or ''
    epithet = r.get('specific_epithet') or ''
    if genus and epithet:
        r['slug'] = f"{genus}/{epithet}"
    else:
        # Genus-only rows (102 rows in production, none on_checklist)
        r['slug'] = genus if genus else _slugify(r['scientificName'])
    if r.get('month_histogram') is None:
        r['month_histogram'] = list(_ZERO_HIST)
```

`from feeds import _slugify` import at line 30 retained for the fallback branch.

### data/species_maps.py (Task 2 + Rule 1 bug fix)

**Edit 1 — mkdir before write_text** (line 167-168):
```python
# Before:
    out_path = out_dir / f"{slug}.svg"
    out_path.write_text(

# After:
    out_path = out_dir / f"{slug}.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)  # NEW: create Genus/ subdir
    out_path.write_text(
```

**Edit 2 — rglob for total_size** (line 246):
```python
# Before:
    total_size = sum(p.stat().st_size for p in maps_dir.glob('*.svg'))

# After:
    total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
```

**Edit 3 (deviation) — geometry_wkt → geom** (lines 85-93):
```python
# Before:
    ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.005)
# After:
    ST_SimplifyPreserveTopology(geom, 0.005)
```

## Regenerated Artifact Counts

| Artifact | Count | Notes |
|----------|-------|-------|
| species.json | 630 rows | All species with slug in Genus/epithet or bare genus |
| species.parquet | 630 rows, 44,769 bytes | Same schema as before (slug column remains VARCHAR) |
| species-maps/ genus subdirs | 39 | One per genus with at least one species with occurrences |
| species-level SVGs (in subdirs) | 349 | e.g. Andrena/milwaukeensis.svg |
| genus-only SVGs (top-level) | 40 | e.g. Agapostemon.svg — genus-only rows get bare genus slug |
| Total SVGs | 389 | script reports 452 writes (genus slugs are rewritten per multi-epithet overlap) |

## Test Suite Pass Evidence

```
cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -q
3 passed in 0.46s
```

- `test_slug_hierarchical` — PASS: all species-level rows have slug == f"{genus}/{epithet}"
- `test_no_old_slug_format` — PASS: zero species-level slugs without slash separator
- `test_write_species_svg_creates_subdir` — PASS: Andrena/milwaukeensis.svg created correctly

Full Python suite: `119 passed, 1 failed (pre-existing test_run_py_integration), 2 skipped`

Frontend: `npm run validate-species` exits 0 ("ok content/species-photos.toml (735 species, 106 warning(s))")
validate-species.test.ts: 16 passed (fixture slug updated to 'Osmia/lignaria')

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Wave-0 test files missing (Plan 01 not yet executed)**
- **Found during:** Plan startup
- **Issue:** Plan 02 depends on Plan 01 (wave: 0) having created test files, but Plan 01 had not executed. The test files `test_species_export.py` and `test_species_maps.py` did not exist.
- **Fix:** Created both test files matching the Plan 01 specification before implementing code changes. Committed in RED state (test_species_maps fails with FileNotFoundError; test_species_export skips due to missing sandbox).
- **Files modified:** data/tests/test_species_export.py (created), data/tests/test_species_maps.py (created)
- **Commit:** 36a0678

**2. [Rule 1 - Bug] species_maps.py used deprecated geometry_wkt column**
- **Found during:** Task 3 pipeline run
- **Issue:** `_load_county_geojsons` queried `ST_GeomFromText(geometry_wkt)` but quick task `260514-fp3` (2026-05-14) switched the county source to CB 5m and the `us_counties` schema now has `geom` (GEOMETRY type) instead of `geometry_wkt` (VARCHAR WKT). The species_maps.py had not been updated for this schema change.
- **Fix:** Changed query to `ST_SimplifyPreserveTopology(geom, 0.005)` — no `ST_GeomFromText()` wrapper needed since the column is already GEOMETRY.
- **Files modified:** data/species_maps.py (one-line change in `_load_county_geojsons`)
- **Commit:** 146f859

**3. [Rule 1 - Bug] test_no_old_slug_format assertion false positive for hyphenated epithets**
- **Found during:** Task 3 wave-0 test run (after sandbox was built)
- **Issue:** The test used `WHERE slug LIKE '%-%' AND specific_epithet IS NOT NULL` to detect old flat slugs, but `Andrena/w-scripta` (specific_epithet = 'w-scripta') legitimately contains a hyphen and triggered the assertion.
- **Fix:** Changed assertion to `WHERE slug NOT LIKE '%/%' AND specific_epithet IS NOT NULL` — detects absence of slash (the defining feature of old flat format) rather than presence of dash (which can appear in epithets).
- **Files modified:** data/tests/test_species_export.py
- **Commit:** 146f859

## Known Stubs

None — plan goal fully achieved. All species-level slugs use `Genus/epithet` format.

## Threat Flags

None — changes are within existing trust boundaries documented in the plan's threat model.

## Self-Check: PASSED

All files exist, all commits found, key content verified:
- `data/species_export.py` contains `f"{genus}/{epithet}"` slug f-string
- `data/species_maps.py` contains `out_path.parent.mkdir(parents=True, exist_ok=True)` and `rglob('*.svg')`
- `data/species_maps.py` invariant comment "NEVER recompute slug from scientificName here" preserved
- `src/tests/validate-species.test.ts` fixture slug updated to `'Osmia/lignaria'`
- Wave-0 tests pass: 3/3 GREEN
- Commits: 36a0678, 85f68e1, 190af63, 146f859 all present
