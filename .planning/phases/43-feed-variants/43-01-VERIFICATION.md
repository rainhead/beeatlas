---
phase: 43-feed-variants
verified: 2026-04-10T00:00:00Z
status: passed
score: 8/8
overrides_applied: 0
---

# Phase 43: Feed Variants Verification Report

**Phase Goal:** All four filter-variant feed families are generated and an index lists them all
**Verified:** 2026-04-10T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One collector-{slug}.xml file exists per unique collector in occurrences | VERIFIED | test_collector_variant passes; write_all_variants enumerates DISTINCT recorded_by from ecdysis_data.occurrences |
| 2 | One genus-{slug}.xml file exists per unique genus in occurrences | VERIFIED | test_genus_variant passes; write_all_variants enumerates DISTINCT genus from ecdysis_data.occurrences |
| 3 | One county-{slug}.xml file exists per WA county in geographies table | VERIFIED | test_county_variant passes; enumerates from geographies.us_counties WHERE state_fips='53' |
| 4 | One ecoregion-{slug}.xml file exists per WA-intersecting ecoregion in geographies table | VERIFIED | test_ecoregion_variant passes; enumerates via ST_Intersects WA filter |
| 5 | Empty variant feeds (0 matching entries) are still written as valid Atom with 0 entry children | VERIFIED | test_empty_variant_feed passes; write_variant_feed has no skip-on-empty guard (D-01) |
| 6 | Empty feeds use pipeline run_time as feed-level updated timestamp | VERIFIED | test_empty_variant_feed asserts '2026-01-15' in updated.text; write_variant_feed uses run_time.isoformat() when rows empty (D-02) |
| 7 | index.json lists every variant feed with title, filter_type, and entry_count including empty feeds | VERIFIED | test_index_json passes; write_index_json writes json.dumps(entries) with all required fields |
| 8 | Each variant feed title describes its specific filter | VERIFIED | All four variant tests assert correct title text (e.g., 'Collector: Test Collector', 'Genus: Eucera', 'County: Chelan', 'Ecoregion: North Cascades') |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/feeds.py` | _slugify, variant queries, write_variant_feed, write_all_variants, write_index_json, extended main() | VERIFIED | All functions present, substantive implementations, wired in main() |
| `data/tests/test_feeds.py` | Tests for all variant feed types, empty feed behavior, index.json | VERIFIED | 14 tests collected and passing |
| `frontend/public/data/feeds/index.json` | Machine-readable feed index | VERIFIED (runtime) | This is a pipeline runtime output, not a committed artifact. write_index_json is implemented and tested via test_index_json. Only determinations.xml exists in the directory currently (written during previous pipeline run). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `feeds.py::write_all_variants` | `feeds.py::write_variant_feed` | iterates over distinct filter values per type | WIRED | Line 383: `entry = write_variant_feed(out_dir, variant_type, filter_value, slug, rows, run_time)` |
| `feeds.py::main` | `feeds.py::write_all_variants` | called after write_determinations_feed | WIRED | Lines 405-406: `entries = write_all_variants(...)` then `write_index_json(...)` |
| `feeds.py::_COUNTY_QUERY` | `geographies.us_counties` | spatial join ST_Within | WIRED | Lines 209-215: `JOIN geographies.us_counties c ON c.state_fips = '53' AND ST_Within(...)` |
| `feeds.py::_ECOREGION_QUERY` | `geographies.ecoregions` | spatial join ST_Within + ST_Intersects WA filter | WIRED | Lines 237-246: `JOIN geographies.ecoregions e ON ST_Intersects(...) AND ST_Within(...)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `write_variant_feed` | `rows` | `con.execute(_VARIANT_QUERIES[variant_type], [filter_value]).fetchall()` in write_all_variants | Yes — live DuckDB query with parameterized filter | FLOWING |
| `write_index_json` | `entries` | return value of write_all_variants (list of dicts from write_variant_feed) | Yes — populated from real query results | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 14 feed tests pass | `cd data && uv run pytest tests/test_feeds.py -q` | 14 passed in 1.31s | PASS |
| _slugify prevents path traversal | test_slugify assertions | '/' and '.' not in _slugify("../../etc/passwd") | PASS |
| Empty variant feeds written as valid Atom | test_empty_variant_feed | 0 entries, run_time in updated | PASS |
| index.json has all required fields | test_index_json | filename, url, title, filter_type, filter_value, entry_count present | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FEED-05 | 43-01 | Per-collector feeds at /data/feeds/collector-{slug}.xml | SATISFIED | write_all_variants enumerates collectors from occurrences; test_collector_variant verifies output |
| FEED-06 | 43-01 | Per-genus feeds at /data/feeds/genus-{slug}.xml | SATISFIED | write_all_variants enumerates genera from occurrences; test_genus_variant verifies output |
| FEED-07 | 43-01 | Per-county feeds at /data/feeds/county-{slug}.xml | SATISFIED | write_all_variants enumerates from geographies.us_counties WHERE state_fips='53'; test_county_variant verifies spatial join |
| FEED-08 | 43-01 | Per-ecoregion feeds at /data/feeds/ecoregion-{slug}.xml | SATISFIED | write_all_variants enumerates via ST_Intersects WA; test_ecoregion_variant verifies spatial join |
| PIPE-03 | 43-01 | /data/feeds/index.json lists all generated feed URLs with title, filter type, and entry count | SATISFIED | write_index_json writes entries with all required fields; test_index_json verifies all fields present including entry_count |

### Anti-Patterns Found

No anti-patterns found. Key confirmations:

- No skip-on-empty guard in write_variant_feed (D-01 honored)
- No hardcoded empty returns in variant writers
- No TODO/FIXME/placeholder comments
- Coordinate NULL guards present in both _COUNTY_QUERY and _ECOREGION_QUERY
- _slugify correctly strips `/`, `.`, and all non-[a-z0-9-] characters

### Human Verification Required

None. All success criteria are verifiable programmatically via the test suite.

### Gaps Summary

No gaps. All 8 must-have truths verified, all key links wired, all 14 tests passing, all requirements satisfied.

**Note on `frontend/public/data/feeds/index.json`:** The PLAN listed this as an artifact but it is a pipeline runtime output (not committed to the repository). The write_index_json function is implemented and tested — the file will be written when `main()` runs during the nightly pipeline. This is correct behavior for a static-hosting data pipeline. The directory currently contains only `determinations.xml` from a previous pipeline run.

---

_Verified: 2026-04-10T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
