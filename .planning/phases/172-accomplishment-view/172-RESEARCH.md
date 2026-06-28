# Phase 172: Accomplishment View - Research

**Researched:** 2026-06-28
**Domain:** Python SVG generation, DuckDB/Parquet aggregation, Eleventy/Nunjucks templating
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All four aggregations over WABA-contribution rows only — predicate verbatim:
  `o.collector_inat_login IS NOT NULL AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))`.
- **D-02:** County map = binary fill per-collector `.svg` at `ASSETS_DIR/collector-maps/{login}.svg`. Reuse `.checklist-county` class. No choropleth, no dots. S3 stable-URL delivery (`data/nightly.sh` recursive `aws s3 cp` + CloudFront), NOT committed to git, NOT in `manifest.json`.
- **D-03:** Ecoregion map = second coverage SVG (`/data/collector-maps/{login}-eco.svg`), binary fill, EPA L3 polygons from `public/data/ecoregions.geojson`. Same S3 delivery as D-02. Count caption beside/below map.
- **D-04:** Taxonomic list = flat species list grouped by genus, each species linked to `/species/{slug}/`. Species-rank only (`sp.specific_epithet IS NOT NULL`). Pre-computed into `collectors.json` as genus-grouped structure. Genera alphabetical, species alphabetical within genus.
- **D-05:** Badge = "Active since {MIN(year)} ({COUNT(DISTINCT year)} seasons)". Column `year` (NOT `id_date`, NOT `collection_date`). No streaks.
- **D-06:** All pre-aggregated in pipeline. SVG generator + export read `occurrences.parquet` from `EXPORT_DIR`. No browser GROUP BY.

### Claude's Discretion
- Exact file layout for the two SVGs (two files confirmed: `{login}.svg` and `{login}-eco.svg`).
- SVG generator module name (recommendation: `data/collector_maps.py`).
- Whether per-species counts appear in the taxonomic list (lean: yes, small).
- On-page placement/order and section CSS.
- Exact SQL shape of the new aggregations.

### Deferred Ideas (OUT OF SCOPE)
- Graduated choropleth / per-occurrence dots on county map.
- Ecoregion named list (superseded by map + count caption).
- Seasonality/phenology charts (Phase 166).
- Cross-collector ranking / streaks / leaderboards.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCOM-01 | County coverage SVG map | D-02 locked; `species_maps.py` + `.checklist-county` pattern confirmed |
| ACCOM-02 | Taxonomic-breadth species list linked to taxon pages | D-04 locked; `species.parquet` carries `slug`, `genus`, `specific_epithet`; existing JOIN pattern confirmed |
| ACCOM-03 | Ecoregion breadth as second SVG map | D-03 locked; `ecoregions.geojson` carries `NA_L3NAME` = `occurrences.ecoregion_l3`; polygon-loader generalization path confirmed |
| ACCOM-04 | "Active since YYYY (N seasons)" badge | D-05 locked; `occurrences.parquet` carries `year`; `COUNT(DISTINCT year)` confirmed |
</phase_requirements>

---

## Summary

Phase 172 is a data-pipeline extension and frontend-template extension — no new dbt models, no new SQL contracts, no new Eleventy infrastructure. The four new features slot into the existing species-maps / places-maps SVG delivery pattern and the existing `collectors_export.py` → `collectors.json` → `_data/collectors.js` → template chain.

The primary implementation work splits into three areas: (1) a new `data/collector_maps.py` module that generalizes the `species_maps.py` polygon-loader to produce binary-fill county and ecoregion SVGs per collector; (2) extensions to `collectors_export.py` `_QUERY` (badge and count fields) plus a companion species-list query; and (3) additions to `_pages/collector-detail.njk` to render the two maps, the badge, and the genus-grouped species list.

The ecoregion polygon source is `ASSETS_DIR/ecoregions.geojson` (already produced by `dbt-build` + `topology-postprocess`), loaded via plain `json.load`. The join key between `occurrences.ecoregion_l3` and `ecoregions.geojson` features is the name string stored in the GeoJSON property `NA_L3NAME`. The `collectors.json` fixture at `src/tests/fixtures/collectors.fixture.json` already exists with the Phase 171 shape — Phase 172 must extend it with five new fields.

**Primary recommendation:** Create `data/collector_maps.py` as a sibling to `species_maps.py`, importing shared geometry primitives from `species_maps.py`. Extend `collectors_export.py` with a second species-list query. Do not modify `species_maps.py` structure; import only what is needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| County/ecoregion SVG generation | Data pipeline (`data/collector_maps.py`) | — | Pre-generated static files; no browser computation |
| Aggregation (badge, counts, species list) | Data pipeline (`data/collectors_export.py`) | — | Pre-computed into `collectors.json`; D-06 no browser GROUP BY |
| Polygon geometry loading | Data pipeline (DuckDB for counties; JSON for ecoregions) | — | Counties from DuckDB `geographies.us_counties`; ecoregions from `ASSETS_DIR/ecoregions.geojson` |
| SVG delivery to browser | S3 + CloudFront (stable URL) | nightly.sh recursive cp | Same mechanism as `species-maps/` and `place-maps/` |
| Page rendering | Eleventy SSG (build time) | — | Static per-collector page; `collectors.json` data cascade |
| Count-noun copy | `src/lib/quantify.js` Eleventy filter | — | Existing `quantify` filter handles "N seasons", "N ecoregions", "N counties" |

---

## Standard Stack

### Core (verified — all already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` | existing | Query `occurrences.parquet` + `species.parquet` | Already used in every export step |
| `xml.etree.ElementTree` | stdlib | SVG generation | Existing pattern in `species_maps.py` |
| `json` | stdlib | Load `ecoregions.geojson` | No spatial extension needed for polygon drawing |
| `copy` | stdlib | `deepcopy` backdrop per collector | Established pattern in `species_maps.py` |

No new package dependencies. [VERIFIED: codebase grep]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pyarrow.parquet` | existing | Write test fixture parquets in pytest | In test helpers only (mirrors `test_collectors_export.py` pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `json.load(ecoregions.geojson)` | `con.execute("ST_AsGeoJSON(...) FROM geographies.ecoregions")` | DuckDB approach needs spatial extension + per-feature simplification; GeoJSON already simplified by mapshaper. Use GeoJSON file. |
| Separate `collector-maps/` dir | Single `collector-maps/{login}.svg` + `collector-maps/{login}-eco.svg` | Two-file approach mirrors the two maps (county + ecoregion) cleanly; consistent naming with a `-eco` suffix. |
| Extend `species_maps.py` | New `collector_maps.py` | New module is cleaner: different inputs, different output scheme, different polygon-loading path for ecoregions. |

**Installation:** No new packages required.

---

## Package Legitimacy Audit

No new external packages are introduced. This section is not applicable — all dependencies are existing project libraries or Python stdlib. [VERIFIED: codebase analysis]

---

## Architecture Patterns

### System Architecture Diagram

```
nightly.sh
  └── run.py STEPS (sequential)
        ├── dbt-build → EXPORT_DIR/occurrences.parquet
        │                 EXPORT_DIR/ecoregions.geojson   (clipped to WA)
        │                 EXPORT_DIR/ecoregions.geojson   (+ mapshaper clean+simplify via topology-postprocess)
        ├── species-export → EXPORT_DIR/species.parquet   (with slug column)
        ├── collectors-export → EXPORT_DIR/collectors.json  [EXTENDED with badge/counts/species list]
        ├── collectors-events-export → extends collectors.json with event fields
        ├── collector-maps [NEW] → EXPORT_DIR/collector-maps/{login}.svg
        │                          EXPORT_DIR/collector-maps/{login}-eco.svg
        └── feeds
  └── aws s3 cp --recursive $EXPORT_DIR/collector-maps/ s3://$BUCKET/data/collector-maps/
  └── cloudfront invalidate /data/collector-maps/*

Eleventy build (GitHub Actions, triggered by nightly dispatch)
  └── _data/collectors.js  reads collectors.json (no code change)
  └── _pages/collector-detail.njk  [EXTENDED]
        ├── <img src="/data/collector-maps/{login}.svg">
        ├── <img src="/data/collector-maps/{login}-eco.svg">
        ├── badge: active_since + seasons_count
        └── species_by_genus list → /species/{slug}/ links
```

### Recommended Project Structure
```
data/
├── collector_maps.py   [NEW] — binary-fill SVG generator for collector county + ecoregion maps
├── collectors_export.py  [EXTENDED] — adds badge, count, species-list fields to _QUERY
├── run.py              [EXTENDED] — adds "collector-maps" STEPS entry
├── nightly.sh          [EXTENDED] — adds collector-maps/ S3 cp + CloudFront path
├── tests/
│   ├── test_collector_maps.py      [NEW] — SVG shape + determinism tests
│   └── test_collectors_export.py   [EXTENDED] — new field assertions
_pages/
└── collector-detail.njk  [EXTENDED] — two map imgs, badge, species list
src/tests/
├── fixtures/
│   └── collectors.fixture.json     [EXTENDED] — add five new fields to both entries
└── data-collectors.test.ts         [EXTENDED] — assert new field shapes
```

### Pattern 1: Binary-Fill SVG Generation (county map)
**What:** Deepcopy county backdrop; for each county name in the collector's contributed set, add a `<path class="checklist-county">` path element. No occurrence dots.
**When to use:** ACCOM-01 county map, ACCOM-03 ecoregion map.

```python
# Source: data/species_maps.py — _write_species_svg (generalised here for coverage maps)
def _write_coverage_svg(
    out_path: Path,
    filled_names: set[str],
    polygon_geojsons: dict[str, dict],
    backdrop: ET.Element,
) -> None:
    root = copy.deepcopy(backdrop)
    for name, geom in polygon_geojsons.items():
        if name not in filled_names:
            continue
        gtype = geom.get("type")
        if gtype == "Polygon":
            d = " ".join(_ring_to_path(ring) for ring in geom["coordinates"])
        elif gtype == "MultiPolygon":
            d = " ".join(
                _ring_to_path(ring)
                for poly in geom["coordinates"]
                for ring in poly
            )
        else:
            continue
        ET.SubElement(root, f"{{{SVG_NS}}}path", attrib={"class": "checklist-county", "d": d})
    # Determinism: sort attribs
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(ET.tostring(root, xml_declaration=True, encoding="unicode"), encoding="utf-8")
```
[VERIFIED: codebase — adapted from `_write_species_svg` in `data/species_maps.py`]

### Pattern 2: Ecoregion GeoJSON Loading
**What:** Load `ecoregions.geojson` from `ASSETS_DIR` via `json.load`. Key by `NA_L3NAME` property.
**When to use:** Building the ecoregion polygon backdrop and coverage map.

```python
# Source: ecoregions_geo.sql comment + topology_postprocess.py + ecoregions.geojson inspection
def _load_ecoregion_geojsons(assets_dir: Path) -> dict[str, dict]:
    """Load WA L3 ecoregion polygons from ecoregions.geojson.

    Key: NA_L3NAME property (= occurrences.ecoregion_l3 column value).
    9 distinct L3 names in WA (64 features after sliver removal).
    No spatial extension needed — pure JSON deserialization.
    """
    eco_path = assets_dir / "ecoregions.geojson"
    if not eco_path.exists():
        raise FileNotFoundError(f"{eco_path} not found — run dbt build first")
    fc = json.loads(eco_path.read_text())
    result: dict[str, dict] = {}
    for feature in fc["features"]:
        name = feature["properties"]["NA_L3NAME"]
        result[name] = feature["geometry"]
    return result
```
[VERIFIED: codebase — confirmed `NA_L3NAME` from `ecoregions.geojson` inspection + `ecoregions_geo.sql` + `stg_geo__ecoregions.sql`]

### Pattern 3: Extended collectors_export.py Query
**What:** Add scalar aggregate columns to `_QUERY` + a companion per-species query for the genus-grouped list.
**When to use:** ACCOM-02, ACCOM-04, plus ecoregion/county counts for captions.

```python
# Extended _QUERY SELECT additions (all within the same D-01 WHERE predicate):
"""
    -- ACCOM-04: active-seasons badge
    MIN(o.year)                                                          AS active_since,
    COUNT(DISTINCT o.year)                                               AS seasons_count,
    -- ACCOM-01/03: caption counts
    COUNT(DISTINCT o.county) FILTER (WHERE o.county IS NOT NULL)         AS county_count,
    COUNT(DISTINCT o.ecoregion_l3) FILTER (WHERE o.ecoregion_l3 IS NOT NULL)
                                                                         AS ecoregion_count,
"""
# Separate species-list query (runs after the main _QUERY; same parquet inputs):
_SPECIES_QUERY = """
    SELECT
        o.collector_inat_login                                           AS login,
        sp.genus,
        sp.canonical_name,
        sp.slug,
        COUNT(*)                                                         AS occ_count
    FROM read_parquet(?) o
    LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
      AND sp.specific_epithet IS NOT NULL
    GROUP BY o.collector_inat_login, sp.genus, sp.canonical_name, sp.slug
    ORDER BY o.collector_inat_login, sp.genus, sp.canonical_name
"""
# Python post-processing: group by login -> genus -> species list
```
[VERIFIED: codebase — matches existing _QUERY pattern in `data/collectors_export.py`; `year`, `county`, `ecoregion_l3` confirmed in `data/dbt/models/marts/occurrences.sql`; `genus`, `specific_epithet`, `slug` confirmed in `data/species_export.py`]

### Pattern 4: Nunjucks Map Embed
**What:** `<img loading="lazy" src="/data/collector-maps/{login}.svg">` — mirrors species-detail.njk line 25.
**When to use:** Both county and ecoregion maps in `collector-detail.njk`.

```html
{# Source: _pages/species-detail.njk line 24-26 #}
{%- if collector.county_count > 0 -%}
  <img loading="lazy"
       src="/data/collector-maps/{{ collector.login }}.svg"
       alt="County coverage map for {{ collector.display_name }}">
{%- endif -%}
{%- if collector.ecoregion_count > 0 -%}
  <img loading="lazy"
       src="/data/collector-maps/{{ collector.login }}-eco.svg"
       alt="Ecoregion coverage map for {{ collector.display_name }}">
  <p class="metadata">{{ collector.ecoregion_count | quantify("ecoregion") }}</p>
{%- endif -%}
```

### Anti-Patterns to Avoid
- **Loading ecoregion polygons from DuckDB `geographies.ecoregions`:** The `geographies.ecoregions` table contains unclipped NA-wide polygons (extends into BC/OR). Use `ASSETS_DIR/ecoregions.geojson` which has already been WA-clipped by `ecoregions_geo.sql` and mapshaper-cleaned by `topology_postprocess.py`.
- **Reusing `_write_species_svg` for collector maps:** That function appends occurrence dots. Define a new `_write_coverage_svg` that does binary polygon fill only.
- **Wiping only the county or ecoregion sub-directory:** Wipe the entire `collector-maps/` directory at the start of `generate_collector_maps()` for idempotency — mirrors `species_maps.py` D-04 idempotency pattern.
- **Storing county/ecoregion lists in `collectors.json` for the SVG generator to read:** The SVG generator should query `occurrences.parquet` directly, not parse `collectors.json`. `collectors.json` carries only scalar counts (for captions) and the species list.
- **Committing SVGs to git:** The `collector-maps/` directory must be gitignored. SVGs are S3-delivered (D-02).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG path from GeoJSON polygon | Custom coordinate serializer | `_ring_to_path` from `species_maps.py` | Already handles Polygon + MultiPolygon; WA_BBOX validated |
| Linear lon/lat → SVG coordinate | Custom projection | `_project` from `species_maps.py` | Already calibrated to 600×320 viewBox and WA_BBOX |
| SVG backdrop element | New ET.Element factory | `_build_county_backdrop` (counties) + generic backdrop (ecoregions) | Established single-`<style>` block convention (CONTEXT D-03) |
| County geometry loading | Re-implement spatial query | `_load_county_geojsons(con)` from `species_maps.py` | Uses `ST_SimplifyPreserveTopology(0.005)` appropriate for 600×320 |
| Count-noun pluralization | Custom pluralize | `quantify` Eleventy filter | Already handles "season(s)", "ecoregion(s)", "count(y/ies)" |
| Species slug computation | Re-derive from canonical_name | `sp.slug` from `species.parquet` | `species_export.py` already computes slug = `"{Genus}/{epithet}"` |

**Key insight:** The SVG generation infrastructure is entirely reusable. `collector_maps.py` is primarily a thin driver over existing `species_maps.py` primitives.

---

## Common Pitfalls

### Pitfall 1: Wrong ecoregion geometry source
**What goes wrong:** Loading from `geographies.ecoregions` in DuckDB yields unclipped NA-wide polygons (spans BC/OR, ~6 MB). SVG will render polygons far outside WA bbox and they will all be dropped by the bbox guard.
**Why it happens:** `geographies.ecoregions` is the raw source; `ecoregions.geojson` is the WA-clipped, mapshaper-simplified output.
**How to avoid:** Always load from `ASSETS_DIR / "ecoregions.geojson"`. Require it to exist (raise `FileNotFoundError` if absent, like all other `occurrences.parquet` guards).
**Warning signs:** No ecoregion polygons rendered; large GeoJSON loaded slowly.

### Pitfall 2: Wrong ecoregion key name
**What goes wrong:** Using `feature["properties"]["name"]` instead of `feature["properties"]["NA_L3NAME"]` yields `KeyError`.
**Why it happens:** The `ecoregions_geo.sql` mart uses column alias `name`, but the `emit_feature_collection` macro writes it into the GeoJSON with the original property name `NA_L3NAME` from the EPA source.
**How to avoid:** Key on `"NA_L3NAME"`. Confirmed in `ecoregions.geojson` first-feature inspection.
**Warning signs:** `KeyError: 'name'` in the SVG generator.

### Pitfall 3: EXPORT_DIR vs dbt sandbox confusion (Pitfall 5 in established convention)
**What goes wrong:** SVG generator reads from `data/dbt/target/sandbox/` instead of `EXPORT_DIR`. In production nightly.sh sets `EXPORT_DIR=/tmp/beeatlas-export`; the dbt sandbox is at `data/dbt/target/sandbox/` which is a different path.
**Why it happens:** `run.py`'s `_run_dbt_build()` copies artifacts to `EXPORT_DIR`; post-steps should read from `EXPORT_DIR`, not the sandbox.
**How to avoid:** `collector_maps.py` uses `ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", ...))` exactly like `species_maps.py` and `collectors_export.py`.
**Warning signs:** `FileNotFoundError` for `occurrences.parquet` when `EXPORT_DIR` is set to `/tmp/beeatlas-export`.

### Pitfall 4: Missing county or ecoregion columns in occurrences.parquet
**What goes wrong:** Querying `o.county` or `o.ecoregion_l3` on the parquet yields NULL for all rows.
**Why it happens:** Would happen if `EXPORT_DIR/occurrences.parquet` predates the spatial join. In production, these columns are always present (confirmed in `occurrences.sql`).
**How to avoid:** Confirmed both columns are in the `SELECT` of `occurrences.sql` lines 87–88: `fc.county, fe.ecoregion_l3`. Per CONTEXT.md: "county/ecoregion_l3 are populated on every occurrence row by the occurrences.sql spatial join + nearest-fallback (no NULL-county gaps to special-case)."
**Warning signs:** All `county_count` and `ecoregion_count` values are 0 in `collectors.json`.

### Pitfall 5: iNat login characters in SVG file paths
**What goes wrong:** If a collector login contains URL-unsafe characters, the file path `collector-maps/{login}.svg` could be malformed.
**Why it happens:** iNat logins are typically alphanumeric + underscores, but the pipeline should be defensive.
**How to avoid:** iNat logins are already used as keys in `collectors.json` and as URL path segments in `permalink: "/collectors/{{ collector.login | urlencode }}/"`. The SVG filename uses the raw login (same as what species-maps uses for slugs). In practice, iNat logins are safe for filenames. No additional sanitization required, but the S3 upload uses `aws s3 cp --recursive` which handles the paths correctly.
**Warning signs:** No practical risk with current WA collector cohort.

### Pitfall 6: `collectors.json` fixture not updated for Phase 172 fields
**What goes wrong:** `npm test` green but fixture lacks `active_since`, `seasons_count`, `county_count`, `ecoregion_count`, `species_by_genus` fields. The Vitest shape test only asserts what it checks.
**Why it happens:** Phase 171 created the fixture with 14 fields; Phase 172 adds 5 more.
**How to avoid:** Phase 172 Wave 0 task must update `src/tests/fixtures/collectors.fixture.json` with the new fields, and `data-collectors.test.ts` must assert their presence.
**Warning signs:** `npm test` passes but new fields are absent from fixture.

### Pitfall 7: species_by_genus ordering not enforced
**What goes wrong:** Template renders genera or species in inconsistent order across pipeline runs.
**Why it happens:** `GROUP BY` results are unordered; Python dict iteration order is insertion-order (3.7+) but that depends on query order.
**How to avoid:** The species-list query uses `ORDER BY o.collector_inat_login, sp.genus, sp.canonical_name`. Python grouping preserves this insertion order. The final `species_by_genus` list is already in alphabetical genus + species order.
**Warning signs:** Flickering/differing `collectors.json` on repeated pipeline runs.

---

## Code Examples

### ecoregion GeoJSON structure (confirmed from file inspection)
```json
// Source: public/data/ecoregions.geojson first feature
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {"NA_L3NAME": "Columbia Plateau"},
    "geometry": {"type": "Polygon", "coordinates": [...]}
  }]
}
```
Key: `NA_L3NAME` matches `occurrences.ecoregion_l3` column value. [VERIFIED: codebase file inspection]

### `occurrences.sql` relevant columns (confirmed)
```sql
-- Source: data/dbt/models/marts/occurrences.sql lines 87-94
SELECT
    ...
    j.date, j.year, j.month,
    ...
    j.collector_inat_login,
    j.id_date,
    fc.county, fe.ecoregion_l3,
    ...
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
```
[VERIFIED: codebase — `data/dbt/models/marts/occurrences.sql` lines 76–97]

### `species.parquet` slug format (confirmed)
```python
# Source: data/species_export.py lines 227-233
for r in species_rows:
    genus = r.get('genus') or ''
    epithet = r.get('specific_epithet') or ''
    if genus and epithet:
        r['slug'] = f"{genus}/{epithet}"  # e.g. "Andrena/milwaukeensis"
    else:
        r['slug'] = genus if genus else slugify(r['scientificName'])
```
For species-rank rows: `slug = "{Genus}/{epithet}"`. This is what `/species/{slug}/` URLs use. [VERIFIED: codebase — `data/species_export.py` lines 226–236]

### nightly.sh S3 upload pattern to mirror (confirmed lines 348–361)
```bash
# Source: data/nightly.sh lines 349-361
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/place-maps/" "s3://$BUCKET/data/place-maps/"
# ADD for Phase 172:
# aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/collector-maps/" "s3://$BUCKET/data/collector-maps/"

# CloudFront invalidation (lines 357-361):
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/manifest.json" "/data/feeds/*" "/data/species-maps/*" "/data/place-maps/*"
    # ADD: "/data/collector-maps/*"
```
[VERIFIED: codebase — `data/nightly.sh` lines 348–361]

### run.py STEPS current order (confirmed)
```python
# Source: data/run.py lines 91-132
STEPS = [
    ...
    ("species-maps", generate_species_maps),
    ("places-export", export_places_step),
    ("collectors-export", export_collectors_step),         # writes collectors.json base
    ("collectors-events-export", export_collectors_events_step),  # extends collectors.json
    ("places-maps", generate_place_maps_step),
    ("feeds", generate_feeds),
]
# INSERT after collectors-events-export:
# ("collector-maps", generate_collector_maps_step),
```
[VERIFIED: codebase — `data/run.py` lines 128–132]

### `collectors.json` extended entry shape
```json
{
  "login": "alice_collector",
  "display_name": "Alice A",
  "recordedBy": "Alice A",
  "host_inat_login": "alice_collector",
  "atom_feed_url": "/data/feeds/collector-alice-a.xml",
  "specimen_count": 42,
  "sample_count": 18,
  "species_count": 12,
  "status_denominator": 42,
  "status_identified": 35,
  "status_awaiting": 7,
  "first_page_events": [...],
  "total_event_pages": 1,
  "total_event_count": 42,
  "active_since": 2019,
  "seasons_count": 3,
  "county_count": 5,
  "ecoregion_count": 2,
  "species_by_genus": [
    {
      "genus": "Andrena",
      "species": [
        {"canonical_name": "Andrena milwaukeensis", "slug": "Andrena/milwaukeensis", "count": 8},
        {"canonical_name": "Andrena prunorum",      "slug": "Andrena/prunorum",      "count": 3}
      ]
    },
    {
      "genus": "Bombus",
      "species": [
        {"canonical_name": "Bombus mixtus", "slug": "Bombus/mixtus", "count": 5}
      ]
    }
  ]
}
```

### Existing `collectors.fixture.json` shape (Phase 171 — must be extended)
```python
# Source: python3 -c "import json; d=json.load(open('src/tests/fixtures/collectors.fixture.json')); print(list(d[0].keys()))"
['login', 'display_name', 'recordedBy', 'host_inat_login', 'atom_feed_url',
 'specimen_count', 'sample_count', 'species_count',
 'status_denominator', 'status_identified', 'status_awaiting',
 'first_page_events', 'total_event_pages', 'total_event_count']
# Phase 172 must add: active_since, seasons_count, county_count, ecoregion_count, species_by_genus
```
[VERIFIED: codebase — fixture file inspection]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `data/svg_map.py` (ROADMAP citation) | `data/species_maps.py` (actual file) | Pre-Phase 172 | ROADMAP stale ref; do not create `svg_map.py` |
| `collection_date` column (ROADMAP citation) | `year` / `date` columns in `occurrences.parquet` | Phase 168 | Badge source is `o.year`; D-05 locked |
| `place_slug` scalar on occurrences | `occurrence_places` bridge table | Phase 160 | Collector maps do NOT need the bridge; they use `county`/`ecoregion_l3` direct on occurrences |

**Deprecated/outdated:**
- `data/svg_map.py`: Does not exist. Stale ROADMAP reference.
- `collection_date` column: Does not exist. Phase 168 narrowed to `year`/`date`. Confirmed in `occurrences.sql`.

---

## 171.1 Coordination Note

**Current delivery state:** `collectors.json` is still committed to git (Phase 171.1 is unplanned). `src/tests/fixtures/collectors.fixture.json` already exists with the Phase 171 shape (14 fields per entry).

**Phase 172 obligations regarding 171.1:**
1. Phase 172 adds five new fields to `collectors.json`. These fields must also be added to `src/tests/fixtures/collectors.fixture.json` in the Phase 172 Wave 0 task (else the fixture is stale and Vitest field-assertion tests will fail).
2. Phase 172 must update `src/tests/data-collectors.test.ts` to assert the new field shapes on the fixture.
3. When 171.1 eventually ships, it creates a new fixture from the live `collectors.json`. That fixture will already include Phase 172 fields (because 172 will have shipped first). No 171.1-specific fixture work is needed at that point.
4. If 171.1 ships BEFORE 172 (possible if 171.1 is planned and executed first), then 171.1's fixture will NOT include Phase 172 fields, and the 172 Wave 0 task must update it.

**Safe sequencing:** Phase 172 can ship first. The fixture update is entirely within Phase 172's Wave 0.

**SVG delivery is independent of 171.1:** `collector-maps/*.svg` files use the stable-URL S3 path (same as `species-maps/`), completely separate from the 171.1 manifest/content-hash path. No coordination needed for SVG delivery.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iNat login characters are filesystem-safe (alphanumeric + underscore) | Common Pitfalls 5 | SVG filenames could be malformed for edge-case logins; add sanitization if needed |
| A2 | There are exactly 9 distinct L3 ecoregion names in WA | Summary | SVG generation would still be correct; only the count mentioned here would be wrong |

---

## Open Questions

1. **Per-species count in the species list?**
   - What we know: CONTEXT.md says "lean: yes, small" (Claude's Discretion).
   - What's unclear: Whether the count should be occurrence count, specimen count, or sample count.
   - Recommendation: Use occurrence count (consistent with `species_count` metric; simplest aggregate). Show as a small parenthetical `(N)` after species name, or as a separate column. Planner decides; the data is already computed in `_SPECIES_QUERY`.

2. **County count caption on the county map?**
   - What we know: `county_count` is being added to `collectors.json`; `ecoregion_count` has an explicit count caption requirement (D-03). D-02 doesn't require a county count caption.
   - What's unclear: Whether a "5 counties" caption is also desired under the county map.
   - Recommendation: Add it symmetrically — if ecoregion map shows "N ecoregions", county map shows "N counties". Planner decides.

3. **`collector-maps/` gitignore entry?**
   - What we know: `species-maps/` and `place-maps/` are in `public/data/` and gitignored (per `public/data/*` gitignore rule). `collector-maps/` would be at `public/data/collector-maps/` and therefore already gitignored.
   - What's unclear: Whether a `public/data/collector-maps/` directory line needs to be explicitly added.
   - Recommendation: No explicit gitignore line needed — the `public/data/*` wildcard already covers it. Add a comment in `nightly.sh` noting this. Planner to verify gitignore.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB | `collector_maps.py` county geometry loading | ✓ | existing | — |
| `xml.etree.ElementTree` | SVG generation | ✓ | stdlib | — |
| `json` | ecoregion GeoJSON loading | ✓ | stdlib | — |
| `aws` CLI | nightly.sh S3 upload | ✓ | existing | — (production only) |
| `public/data/ecoregions.geojson` | ecoregion polygon loading | ✓ after dbt-build | built per run | — |
| `public/data/occurrences.parquet` | aggregation queries | ✓ after dbt-build | built per run | — |
| `public/data/species.parquet` | species-list JOIN | ✓ after species-export | built per run | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Python) | pytest via `uv run pytest` |
| Framework (JS) | Vitest via `npm test` |
| Config file | `data/pyproject.toml` (pytest) / `vitest.config.ts` (Vitest) |
| Quick run command (Python) | `cd data && uv run pytest tests/test_collector_maps.py tests/test_collectors_export.py -x -m "not integration"` |
| Full suite command | `cd data && uv run pytest -m "not integration"` + `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCOM-01 | County coverage SVG written per collector login | unit | `cd data && uv run pytest tests/test_collector_maps.py -x -k county` | ❌ Wave 0 |
| ACCOM-01 | County SVG contains `class="checklist-county"` paths for contributed counties | unit | `cd data && uv run pytest tests/test_collector_maps.py -x -k county_fill` | ❌ Wave 0 |
| ACCOM-01 | County SVG output is deterministic (idempotent across two runs) | unit | `cd data && uv run pytest tests/test_collector_maps.py -x -k determinism` | ❌ Wave 0 |
| ACCOM-02 | `collectors.json` entries have `species_by_genus` array with genus/species/slug fields | unit | `cd data && uv run pytest tests/test_collectors_export.py -x -k species_by_genus` | ❌ Wave 0 |
| ACCOM-02 | Species list excludes genus-only determinations (`specific_epithet IS NULL`) | unit | `cd data && uv run pytest tests/test_collectors_export.py -x -k species_rank_gate` | ❌ Wave 0 |
| ACCOM-03 | Ecoregion SVG written per collector login | unit | `cd data && uv run pytest tests/test_collector_maps.py -x -k ecoregion` | ❌ Wave 0 |
| ACCOM-03 | Ecoregion SVG contains filled polygons for contributed ecoregions | unit | `cd data && uv run pytest tests/test_collector_maps.py -x -k ecoregion_fill` | ❌ Wave 0 |
| ACCOM-04 | `collectors.json` entries have `active_since` (int) and `seasons_count` (int) | unit | `cd data && uv run pytest tests/test_collectors_export.py -x -k badge` | ❌ Wave 0 |
| ACCOM-04 | `seasons_count` = COUNT(DISTINCT year), not max-min span | unit | `cd data && uv run pytest tests/test_collectors_export.py -x -k seasons_distinct` | ❌ Wave 0 |
| D-01 gate | D-01 row predicate still excludes inat-only collectors after query extension | unit | `cd data && uv run pytest tests/test_collectors_export.py -x -k gate_excludes` | ✅ (existing; must pass with extended query) |
| Frontend shape | `collectors.fixture.json` entries have new fields with correct types | unit | `npm test -- --reporter verbose` | ❌ Wave 0 (fixture update required) |

### Existing Tests to Extend
- `data/tests/test_collectors_export.py`: Add tests for `active_since`, `seasons_count`, `county_count`, `ecoregion_count`, `species_by_genus` fields. Extend `_write_test_occurrences_parquet` fixture to include `year`, `county`, `ecoregion_l3` columns (currently absent from fixture schema).
- `src/tests/data-collectors.test.ts`: Add field-presence assertions for five new fields on fixture entries.
- `src/tests/fixtures/collectors.fixture.json`: Add the five new fields to both existing fixture entries.

### Wave 0 Gaps
- [ ] `data/tests/test_collector_maps.py` — covers ACCOM-01, ACCOM-03 (county + ecoregion SVG generation)
- [ ] `data/tests/test_collector_maps.py` — determinism tests (two-run byte-identical output)
- [ ] Extend `data/tests/test_collectors_export.py` — new field tests for ACCOM-02, ACCOM-04
- [ ] Extend `data/tests/test_collectors_export.py` — fixture `_write_test_occurrences_parquet` to add `year`, `county`, `ecoregion_l3` columns
- [ ] Extend `src/tests/fixtures/collectors.fixture.json` — add five new fields per entry
- [ ] Extend `src/tests/data-collectors.test.ts` — assert new field types/presence

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_collector_maps.py tests/test_collectors_export.py -x -m "not integration"` + `npm test`
- **Per wave merge:** `cd data && uv run pytest -m "not integration"` + `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Security Domain

Security enforcement is enabled (not explicitly disabled). This phase is pipeline-internal and UI-read-only — no auth, no user input processing, no cryptography.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Static pages, no auth |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | All collector pages are public (Phase 169 operator decision) |
| V5 Input Validation | minimal | SVG generator reads only from trusted pipeline-written parquet/GeoJSON; no user-supplied input |
| V6 Cryptography | no | No secrets handled |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via login in SVG filename | Tampering | iNat logins are alphanumeric+underscore; S3 `aws s3 cp --recursive` handles paths correctly. Add an assertion in `generate_collector_maps()` if needed. |
| Stale SVGs for renamed/removed collectors | Information Disclosure | Wipe-and-recreate `collector-maps/` each nightly run (D-04 idempotency pattern). |

---

## Sources

### Primary (HIGH confidence)
- `data/species_maps.py` — full read; SVG generation patterns, `_load_county_geojsons`, `_build_county_backdrop`, `_write_species_svg`, `STYLE_CSS`, `VIEWBOX`, `WA_BBOX`, `_project`, `_ring_to_path` [VERIFIED: codebase]
- `data/collectors_export.py` — full read; `_QUERY` D-01 predicate, existing aggregations, JOIN to `species.parquet` [VERIFIED: codebase]
- `data/places_maps.py` — full read; sibling module import pattern [VERIFIED: codebase]
- `data/dbt/models/marts/occurrences.sql` — full read; confirms `county`, `ecoregion_l3`, `year`, `date`, `collector_inat_login` columns [VERIFIED: codebase]
- `data/dbt/models/marts/ecoregions_geo.sql` — full read; confirms `NA_L3NAME` property and WA-clip logic [VERIFIED: codebase]
- `data/topology_postprocess.py` — full read; confirms mapshaper clean+simplify step and 9 ecoregion names preserved [VERIFIED: codebase]
- `data/geographies_pipeline.py` — partial read; confirms `geographies.ecoregions` column `name` (unclipped NA-wide) [VERIFIED: codebase]
- `data/dbt/models/staging/stg_geo__ecoregions.sql` — full read; confirms `name AS ecoregion_l3`, WA filter [VERIFIED: codebase]
- `data/species_export.py` — partial read; confirms slug format `"{Genus}/{epithet}"` [VERIFIED: codebase]
- `data/domain.py` — full read; `slugify` function [VERIFIED: codebase]
- `data/run.py` — full read; STEPS order, import pattern [VERIFIED: codebase]
- `data/nightly.sh` — lines 330–384 read; S3 copy + CloudFront invalidation pattern [VERIFIED: codebase]
- `_pages/collector-detail.njk` — full read; current template structure [VERIFIED: codebase]
- `_pages/species-detail.njk` — full read; map `<img>` embed pattern + `quantify` usage [VERIFIED: codebase]
- `_data/collectors.js` — full read; loader contract (Pitfall 8) [VERIFIED: codebase]
- `src/lib/quantify.js` — full read; `quantify` filter API [VERIFIED: codebase]
- `src/tests/data-collectors.test.ts` — full read; existing Vitest assertions + fixture path [VERIFIED: codebase]
- `src/tests/fixtures/collectors.fixture.json` — keys inspected; 14-field Phase 171 shape [VERIFIED: codebase]
- `data/tests/test_collectors_export.py` — full read; test patterns + fixture helpers [VERIFIED: codebase]
- `data/tests/test_species_maps.py` — full read; SVG test patterns to mirror [VERIFIED: codebase]
- `data/tests/conftest.py` — full read; fixture DB patterns, `_guard_real_db_path` autouse fixture [VERIFIED: codebase]
- `public/data/ecoregions.geojson` — first-feature preview; confirmed `NA_L3NAME` property key [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `.planning/phases/172-accomplishment-view/172-CONTEXT.md` — authoritative locked decisions D-01 through D-06 [CITED]
- `.planning/phases/171.1-collector-data-delivery-rebuild/171.1-CONTEXT.md` — fixture coordination decisions D-05/D-06 [CITED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all reused from existing project code, no new packages
- Architecture: HIGH — direct read of all relevant source files; no inference required
- SVG generation pattern: HIGH — `species_maps.py` fully read; collector-maps pattern is a clean specialization
- Ecoregion geometry source: HIGH — `NA_L3NAME` confirmed from file + SQL; loading path confirmed
- Pitfalls: HIGH — derived from existing code comments (Pitfall 5, MAP-04, D-04 idempotency) and file inspection

**Research date:** 2026-06-28
**Valid until:** 2026-09-28 (stable — no external dependencies; all findings from in-repo source)
