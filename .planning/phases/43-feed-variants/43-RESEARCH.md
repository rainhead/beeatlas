# Phase 43: Feed Variants - Research

**Researched:** 2026-04-10
**Domain:** Python Atom feed generation — variant-per-filter pattern, slugification, index.json
**Confidence:** HIGH

## Summary

Phase 43 extends `data/feeds.py` to produce four families of variant Atom feeds — one file per unique collector, genus, county, and ecoregion — plus a machine-readable `index.json` listing all generated feeds. The existing `write_determinations_feed` from Phase 42 is the template; variant writers follow the same signature and Atom structure, differing only in their filter SQL clause and feed title/id.

The key architectural discovery: `county` and `ecoregion_l3` are **not stored columns** in `ecdysis_data.occurrences`. They are computed by spatial join against `geographies.us_counties` and `geographies.ecoregions` at export time. Variant feed queries for county and ecoregion must replicate the spatial join CTE pattern from `export.py`. The `recorded_by` (collector) and `genus` columns are direct on `ecdysis_data.occurrences` and require no join.

Per locked decision D-01, variant feed files are **always** written even when 0 entries match. This is the inverse of Phase 42's `write_determinations_feed` behavior, which skips on empty results. New variant writers must not inherit the skip-on-empty guard.

**Primary recommendation:** Implement one generic `write_variant_feed(con, out_dir, variant_type, filter_value, slug, rows, run_time)` function plus a `write_all_variants(con, out_dir)` driver that enumerates distinct filter values per type, writes each feed, collects metadata, and writes `index.json`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Write a variant feed file even when 0 entries match the 90-day window — do not skip
- **D-02:** For empty feeds, use pipeline run time (`datetime.now(tz=UTC)`) as the feed-level `<updated>` timestamp
- **D-03:** Empty feeds are valid Atom: feed element + title + id + self-link + updated, zero `<entry>` children
- **D-04:** index.json includes empty feeds with `entry_count: 0`

### Claude's Discretion
- Slug generation algorithm (standard: lowercase, spaces/underscores → hyphens, strip non-ASCII or transliterate)
- Slug collision policy (reasonable default: append a numeric suffix or log a warning)
- Code organization within feeds.py (one generic writer vs per-type functions)
- Exact index.json field names beyond title, filter_type, and entry_count
- Whether index.json includes the main determinations.xml or only variant feeds

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEED-05 | Per-collector feeds at `/data/feeds/collector-{slug}.xml` — one file per unique collector with determinations in the 90-day window | `recorded_by` is a direct column on `ecdysis_data.occurrences`; distinct values via SELECT DISTINCT |
| FEED-06 | Per-genus feeds at `/data/feeds/genus-{slug}.xml` — one file per unique genus with determinations in the window | `genus` is a direct column on `ecdysis_data.occurrences`; same pattern as FEED-05 |
| FEED-07 | Per-county feeds at `/data/feeds/county-{slug}.xml` — one file per unique county | County requires spatial join against `geographies.us_counties`; no stored county column in occurrences |
| FEED-08 | Per-ecoregion feeds at `/data/feeds/ecoregion-{slug}.xml` — one file per unique ecoregion | Ecoregion requires spatial join against `geographies.ecoregions`; no stored ecoregion column in occurrences |
| PIPE-03 | `/data/feeds/index.json` lists all generated feed URLs with title, filter type, and entry count | Written after all variant feeds are generated; includes empty feeds (D-04) |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xml.etree.ElementTree` | stdlib | Atom XML generation | Already used in feeds.py; no new dependency |
| `duckdb` | 1.4.4 [VERIFIED: uv run] | Variant queries + spatial joins | Already in use; supports spatial extension |
| `json` | stdlib | Write index.json | No new dependency |
| `datetime` | stdlib | UTC timestamps for empty feeds | Already imported in feeds.py |
| `pathlib.Path` | stdlib | File path construction | Already used in feeds.py |
| `unicodedata` | stdlib | Slug transliteration (NFKD normalization) | Standard Python approach for ASCII normalization |
| `re` | stdlib | Slug character replacement | Already used in Python ecosystem slugify patterns |

### No New Dependencies
All tools needed are already in the project. No `pyproject.toml` changes required.

[VERIFIED: data/feeds.py — all core imports already present; unicodedata, json, re are stdlib]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pytest` | 9.0.2 [VERIFIED: uv run pytest --version] | Test framework | Variant feed tests extend `data/tests/test_feeds.py` |

---

## Architecture Patterns

### Recommended Code Organization

```
data/feeds.py
  ├── _atom(tag)                        existing helper — unchanged
  ├── _build_entry(feed, row)           existing helper — unchanged
  ├── _QUERY                            existing base query — unchanged
  ├── _slugify(value) -> str            NEW: stdlib slugification
  ├── _VARIANT_COLLECTORS_QUERY         NEW: WHERE o.recorded_by = ?
  ├── _VARIANT_GENUS_QUERY              NEW: WHERE o.genus = ?
  ├── _VARIANT_COUNTY_QUERY             NEW: spatial join + WHERE c.name = ?
  ├── _VARIANT_ECOREGION_QUERY          NEW: spatial join + WHERE e.name = ?
  ├── write_determinations_feed(con, out_dir)   existing — unchanged
  ├── write_variant_feed(con, out_dir, variant_type, filter_value, slug, rows, run_time) -> dict
  │                                     NEW: generic writer; returns index entry dict
  ├── write_all_variants(con, out_dir) -> list[dict]
  │                                     NEW: enumerates all filter values, calls write_variant_feed
  ├── write_index_json(out_dir, entries)
  │                                     NEW: serializes list[dict] to index.json
  └── main()                            EXTENDED: call write_all_variants, write_index_json
```

### Variant Query — Direct Columns (collector, genus)

For `recorded_by` (collector) and `genus` these are direct columns on `ecdysis_data.occurrences`:

```python
# Source: data/feeds.py _QUERY pattern + conftest.py column verification
_COLLECTOR_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND o.recorded_by = ?
    ORDER BY i.modified DESC
"""
# Same structure for genus: AND o.genus = ?
```

[VERIFIED: data/feeds.py _QUERY; data/tests/conftest.py occurrences schema — recorded_by and genus are direct columns]

### Variant Query — Spatial Join (county)

`ecdysis_data.occurrences` has NO `county` column. County filtering requires an inline spatial join:

```python
# Source: data/export.py spatial join pattern (verified)
_COUNTY_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    JOIN geographies.us_counties c
        ON c.state_fips = '53'
       AND ST_Within(
               ST_Point(CAST(o.decimal_longitude AS DOUBLE),
                        CAST(o.decimal_latitude AS DOUBLE)),
               ST_GeomFromText(c.geometry_wkt)
           )
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND c.name = ?
    ORDER BY i.modified DESC
"""
```

[VERIFIED: data/export.py uses identical ST_Within + ST_Point + ST_GeomFromText pattern; data/tests/conftest.py confirms us_counties table has name, state_fips, geometry_wkt columns]

### Variant Query — Spatial Join (ecoregion)

Same spatial pattern using `geographies.ecoregions`:

```python
# Source: data/export.py lines 35-42 pattern
_ECOREGION_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    JOIN geographies.ecoregions e
        ON ST_Intersects(
               ST_GeomFromText(e.geometry_wkt),
               (SELECT ST_GeomFromText(geometry_wkt)
                FROM geographies.us_states WHERE abbreviation = 'WA')
           )
       AND ST_Within(
               ST_Point(CAST(o.decimal_longitude AS DOUBLE),
                        CAST(o.decimal_latitude AS DOUBLE)),
               ST_GeomFromText(e.geometry_wkt)
           )
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND e.name = ?
    ORDER BY i.modified DESC
"""
```

[VERIFIED: data/export.py lines 35-42 ecoregion filter pattern; conftest.py confirms ecoregions table has name, geometry_wkt columns]

### Enumerating Distinct Filter Values

```python
# Collector — direct column, enumerate from occurrences
collectors = [row[0] for row in con.execute("""
    SELECT DISTINCT o.recorded_by
    FROM ecdysis_data.occurrences o
    WHERE o.recorded_by IS NOT NULL AND o.recorded_by != ''
    ORDER BY o.recorded_by
""").fetchall()]

# Genus — direct column
genera = [row[0] for row in con.execute("""
    SELECT DISTINCT o.genus
    FROM ecdysis_data.occurrences o
    WHERE o.genus IS NOT NULL AND o.genus != ''
    ORDER BY o.genus
""").fetchall()]

# County — enumerate from geographies table (WA only)
# Note: enumerate from geographies, NOT from the 90-day window,
# so all known counties get a feed (D-01 always-write intent).
counties = [row[0] for row in con.execute("""
    SELECT DISTINCT name FROM geographies.us_counties
    WHERE state_fips = '53' ORDER BY name
""").fetchall()]

# Ecoregion — enumerate from geographies table (WA-intersecting only)
ecoregions = [row[0] for row in con.execute("""
    SELECT name FROM geographies.ecoregions
    WHERE ST_Intersects(
        ST_GeomFromText(geometry_wkt),
        (SELECT ST_GeomFromText(geometry_wkt)
         FROM geographies.us_states WHERE abbreviation = 'WA')
    )
    ORDER BY name
""").fetchall()]
```

[ASSUMED — enumeration strategy; individual column names verified from conftest.py; WA filter verified from export.py]

### Pattern: Slugification

```python
import unicodedata
import re

def _slugify(value: str) -> str:
    """Convert human name or place name to URL-safe ASCII slug."""
    # Transliterate accented characters to ASCII equivalents
    value = unicodedata.normalize('NFKD', value)
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = value.lower()
    # Spaces, underscores, dots, commas -> hyphen
    value = re.sub(r'[\s_\.,]+', '-', value)
    # Strip remaining non-alphanumeric-hyphen characters
    value = re.sub(r'[^a-z0-9-]', '', value)
    # Collapse runs of hyphens
    value = re.sub(r'-+', '-', value)
    return value.strip('-') or 'unknown'
```

[ASSUMED — standard Python slugify pattern; unicodedata.normalize is stdlib, well-established approach]

**Slug collision handling:** Track `seen_slugs: dict[str, int]` per variant_type. If slug already seen, append `-2`, `-3`, etc. Log warning.

### Pattern: Variant Feed XML Structure

```python
import datetime

UTC = datetime.timezone.utc
run_time = datetime.datetime.now(tz=UTC)

# Feed title per type examples (FEED-03: title describes filter variant):
TITLE_TEMPLATES = {
    'collector':  'Washington Bee Atlas \u2014 Collector: {value}',
    'genus':      'Washington Bee Atlas \u2014 Genus: {value}',
    'county':     'Washington Bee Atlas \u2014 County: {value}',
    'ecoregion':  'Washington Bee Atlas \u2014 Ecoregion: {value}',
}

# Feed-level updated: most recent entry if rows exist, else run_time (D-02)
if rows:
    updated_ts = rows[0][0].astimezone(UTC).isoformat()
else:
    updated_ts = run_time.isoformat()
```

[VERIFIED: D-02 locked decision; feeds.py updated pattern for non-empty case]

### Pattern: index.json Entry Structure

```json
{
  "filename": "collector-jane-smith.xml",
  "url": "/data/feeds/collector-jane-smith.xml",
  "title": "Washington Bee Atlas \u2014 Collector: Jane Smith",
  "filter_type": "collector",
  "filter_value": "Jane Smith",
  "entry_count": 7
}
```

Required fields per PIPE-03: `title`, `filter_type`, `entry_count`. Additional fields (`filename`, `url`, `filter_value`) recommended for programmatic discovery consumers.

[VERIFIED: REQUIREMENTS.md PIPE-03 mandatory fields; additional fields at Claude's discretion per CONTEXT.md]

### Pattern: main() Extension

```python
def main() -> None:
    """Connect to beeatlas.duckdb and write all feeds."""
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute("LOAD spatial;")  # Required for county/ecoregion spatial queries
    run_time = datetime.datetime.now(tz=datetime.timezone.utc)
    write_determinations_feed(con, ASSETS_DIR)
    entries = write_all_variants(con, ASSETS_DIR, run_time)
    write_index_json(ASSETS_DIR, entries)
    con.close()
```

[VERIFIED: data/run.py shows `feeds.main` is called; data/feeds.py main() pattern]

### Anti-Patterns to Avoid

- **Skip on empty in variant writers:** `write_determinations_feed` skips on empty — do NOT copy this guard into variant writers (contradicts D-01).
- **`WHERE o.county = ?`:** The `county` column does not exist on `ecdysis_data.occurrences`. Query will fail.
- **Enumerating counties from 90-day window occurrences:** Would miss counties with zero recent determinations. The always-write intent (D-01) is better served by enumerating from the geographies table.
- **Opening DB inside variant writer:** Connection opened once in `main()` and passed down — do not open per-writer (established pattern from Phase 42).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spatial county/ecoregion lookup | Python-side point-in-polygon | DuckDB `ST_Within` + geographies tables | DuckDB spatial already installed and used in export.py; consistent with production data |
| XML namespace handling | Manual string concatenation | `ET.register_namespace` + `_atom()` helper | Already established in feeds.py; avoids xmlns prefix drift |
| Atom feed structure | Custom serializer | `xml.etree.ElementTree` + `ET.indent` | Already verified correct by Phase 42 tests |
| JSON serialization | Manual string building | `json.dump` with `indent=2` | Correctness, proper escaping |

---

## Common Pitfalls

### Pitfall 1: Assuming county/ecoregion are stored columns
**What goes wrong:** Writing `WHERE o.county = ?` or `WHERE o.ecoregion_l3 = ?` — those columns do not exist on `ecdysis_data.occurrences`. DuckDB raises `BinderException`.
**Why it happens:** The phase additional_context says "Occurrences have county, ecoregion_l3 columns" — this is misleading. The actual table schema (confirmed in conftest.py `_create_tables`) has no such columns.
**How to avoid:** Use spatial join against `geographies.us_counties` / `geographies.ecoregions`, matching `export.py`.
**Warning signs:** `BinderException: Referenced column "county" not found` at runtime.

### Pitfall 2: Forgetting to LOAD spatial before county/ecoregion queries
**What goes wrong:** `ST_Within`, `ST_Point`, `ST_GeomFromText` raise `Catalog Error: Scalar Function with name st_within does not exist`.
**Why it happens:** DuckDB spatial functions are an extension; they must be loaded per connection session.
**How to avoid:** Call `con.execute("LOAD spatial;")` in `feeds.main()` before any variant queries. The existing `main()` does NOT load spatial — it only accesses direct columns.
**Warning signs:** DuckDB catalog error on `ST_` functions when running county/ecoregion feeds.

### Pitfall 3: Copying skip-on-empty guard from write_determinations_feed
**What goes wrong:** Variant writer returns early when `rows` is empty, no file written — violates D-01.
**Why it happens:** `write_determinations_feed` explicitly does `if not rows: print("skipping"); return`. Copying this to variant writers contradicts the locked decision.
**How to avoid:** Variant writers always write a file. Empty check only controls `<updated>` timestamp (D-02).

### Pitfall 4: Slug collisions silently overwrite feed files
**What goes wrong:** Two filter values map to the same slug (e.g., "J. Smith" and "j smith" → "j-smith"). Second write silently overwrites first.
**How to avoid:** Track seen slugs per variant type; append `-2`, `-3`, etc.; log a warning. Collisions are unlikely in real data but must be handled.

### Pitfall 5: Non-WA counties included
**What goes wrong:** `geographies.us_counties` is a national table (TIGER 2024 — all US counties). Without `WHERE state_fips = '53'`, the county enumeration returns thousands of counties, generating thousands of spurious feed files.
**How to avoid:** Always filter `WHERE state_fips = '53'` when enumerating Washington counties.
**Warning signs:** Unexpectedly large number of county feed files; non-WA county names in output.

[VERIFIED: data/export.py line 31: `WHERE state_fips = '53'`; geographies_pipeline.py confirms national TIGER source]

### Pitfall 6: index.json written before all feeds are complete
**What goes wrong:** An exception mid-generation leaves index.json listing feeds that don't exist on disk.
**How to avoid:** Collect all index metadata in memory during generation; write `index.json` as the last step after all feeds succeed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | `data/pyproject.toml` (or `data/pytest.ini` — check) |
| Quick run command | `cd data && uv run pytest tests/test_feeds.py -x -q` |
| Full suite command | `cd data && uv run pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEED-05 | `collector-{slug}.xml` written per unique collector; filtered to matching entries only | unit | `cd data && uv run pytest tests/test_feeds.py -k collector -x` | ❌ Wave 0 |
| FEED-06 | `genus-{slug}.xml` written per unique genus; filtered to matching entries only | unit | `cd data && uv run pytest tests/test_feeds.py -k genus -x` | ❌ Wave 0 |
| FEED-07 | `county-{slug}.xml` written per unique WA county; spatial filter correct | unit | `cd data && uv run pytest tests/test_feeds.py -k county -x` | ❌ Wave 0 |
| FEED-08 | `ecoregion-{slug}.xml` written per unique WA ecoregion; spatial filter correct | unit | `cd data && uv run pytest tests/test_feeds.py -k ecoregion -x` | ❌ Wave 0 |
| PIPE-03 | `index.json` exists, is valid JSON, lists all feeds with required fields, includes empty feeds | unit | `cd data && uv run pytest tests/test_feeds.py -k index -x` | ❌ Wave 0 |

**Additional test behaviors needed:**
- Empty variant feed (0 entries): file written, uses run_time for `<updated>`, zero `<entry>` children (D-01, D-02, D-03)
- Slug generation: correct mapping for names with spaces, accents, punctuation
- Variant title: confirms filter-specific title in `<title>` element (FEED-03)

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_feeds.py -x -q`
- **Per wave merge:** `cd data && uv run pytest -x -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_feeds.py` — add variant feed tests (extend existing file, do not replace)
- [ ] Fixture data: existing `fixture_con` already has one occurrence with `recorded_by='Test Collector'`, `genus='Eucera'`, inside Chelan county and North Cascades ecoregion — sufficient for testing all four variant types
- [ ] Empty feed test: use `tmp_path` + minimal duckdb with zero rows (pattern from existing `test_empty_window`)

---

## Security Domain

This phase writes static XML and JSON files to a local filesystem directory, then the files are uploaded to S3 by `nightly.sh`. No authentication, user input processing, or network requests occur within `feeds.py`.

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V2 Authentication | No | No auth — data pipeline script |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | File system write; controlled by OS permissions |
| V5 Input Validation | Minimal | Filter values come from database, not user input; slugify strips problematic chars |
| V6 Cryptography | No | No secrets or encryption involved |

**Threat: Path traversal via slug.** If a slug contained `../` sequences, a crafted filter value from the database could write outside `feeds/`. The `_slugify` function strips all non-alphanumeric-hyphen characters, preventing this.

[VERIFIED: slug pattern strips `/`, `.`, and all non-`[a-z0-9-]` characters]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Enumeration of counties/ecoregions from geographies table (rather than 90-day window occurrences) is the intended approach for always-write behavior | Architecture Patterns — Enumerating | If wrong: county/ecoregion feeds only exist for filter values that appear in the window; empty feeds for other regions are not generated — contradicts spirit of D-01 |
| A2 | `_slugify` stdlib implementation is sufficient; no third-party library needed | Standard Stack | If wrong: edge cases in real collector names (CJK, Arabic, etc.) may produce empty slugs; low risk for WA bees dataset |
| A3 | index.json should list ONLY variant feeds, not the main `determinations.xml` | Architecture — index.json | If wrong: planner includes main feed in index; low impact either way per CONTEXT.md |
| A4 | Generic `write_variant_feed` function is preferable to four separate per-type functions | Architecture — Code Organization | If wrong: planner uses four separate functions; both produce correct output |
| A5 | `LOAD spatial;` is not yet called in `feeds.main()` and must be added | Common Pitfalls | If wrong: spatial is already loaded somewhere and call is redundant but harmless |

---

## Open Questions

1. **Should index.json include the main `determinations.xml`?**
   - What we know: CONTEXT.md says this is Claude's discretion
   - What's unclear: Whether the index is intended as a "discovery document for all feeds" or just "variant feeds catalog"
   - Recommendation: Exclude from index.json by default (simpler); the main feed URL is fixed and always exists

2. **What happens if `decimal_latitude`/`decimal_longitude` is NULL or empty for an occurrence in the county/ecoregion query?**
   - What we know: `export.py` uses `WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''` in its occ CTE
   - What's unclear: Whether the feeds spatial query needs the same guard
   - Recommendation: Add `AND o.decimal_latitude IS NOT NULL AND o.decimal_latitude != '' AND o.decimal_longitude IS NOT NULL AND o.decimal_longitude != ''` to the spatial join to prevent CAST errors

3. **Ecoregion: use ST_Intersects WA filter or enumerate all ecoregions globally?**
   - What we know: `export.py` filters ecoregions to those intersecting WA state boundary
   - What's unclear: Whether a global ecoregion enumeration is intended (very large set)
   - Recommendation: Filter to WA-intersecting ecoregions only, matching export.py

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (uv) | feeds.py execution | Yes | 3.14.3 | — |
| DuckDB | variant queries | Yes | 1.4.4 | — |
| DuckDB spatial extension | county/ecoregion queries | Yes (installed in fixture_con) | bundled with 1.4.4 | — |
| pytest | test execution | Yes | 9.0.2 | — |
| `unicodedata` / `re` / `json` | slugification, index | Yes | stdlib | — |

**Missing dependencies with no fallback:** None — all dependencies confirmed available.

---

## Sources

### Primary (HIGH confidence)
- `data/feeds.py` — Phase 42 implementation; all Atom patterns verified directly
- `data/tests/conftest.py` — `ecdysis_data.occurrences` and `ecdysis_data.identifications` table schemas verified; seed data verified
- `data/export.py` — Spatial join patterns for county and ecoregion verified directly
- `data/tests/test_feeds.py` — Existing test patterns verified
- `data/run.py` — `feeds.main` wiring verified
- `.planning/phases/43-feed-variants/43-CONTEXT.md` — Locked decisions D-01 through D-04

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — FEED-05 through FEED-08, PIPE-03 requirements
- `data/geographies_pipeline.py` — Confirmed national TIGER county source (non-WA counties present)

### Tertiary (LOW confidence / ASSUMED)
- Slug generation algorithm — standard Python community pattern, stdlib-only
- Generic vs per-type function organization — architectural recommendation based on DRY principle
- index.json field names beyond required three — best-practice recommendation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed present in project; versions verified via uv run
- Architecture (collector/genus): HIGH — direct column access verified in schema and existing query
- Architecture (county/ecoregion): HIGH — spatial join pattern verified against export.py
- Slugification: MEDIUM — stdlib approach well-established but specific edge cases assumed
- index.json structure: MEDIUM — required fields from REQUIREMENTS.md; extras assumed

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase; DuckDB version pinned by uv)
