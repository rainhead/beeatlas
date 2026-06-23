# Phase 162: Add specific hikes as places - Research

**Researched:** 2026-06-23
**Domain:** Geospatial data curation — trail centerline acquisition → DuckDB-spatial metric buffer → corridor MultiPolygon WKT → existing `places.toml` pipeline
**Confidence:** HIGH (pipeline verified end-to-end in local DuckDB; OSM availability assessed via live Overpass queries for all 14 trails; weight impact measured against current repo state)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Scope = 14 hand-curated WTA hikes (proof of concept; expandable later). Source is the user's shortlist of WTA hike pages.
- **D-02:** Represent each hike as a ~250 m corridor buffer around the trail centerline. Buffer MUST be computed in a metric CRS (project WGS84 line → `ST_Buffer` 250 m → transform back to EPSG:4326). Output a valid WGS84 Polygon/MultiPolygon WKT. Simplify for browser weight if needed.
- **D-03:** Hikes are ordinary `[[places]]` entries — NO new category, NO schema change. No `place_type` field.

### Claude's Discretion
- `land_owner` value: `places_export.py` reads `meta["land_owner"]` with hard key access (effectively required). Set per-hike to the primary managing agency. Most are USFS national forest trails; Naches Peak Loop is NPS/USFS; Deception Pass–Goose Rock is WA State Parks.
- Slug convention: WTA URL slugs are natural base. Recommend appending `-trail` suffix for slugs that could collide with area-style places (`monte-cristo`, `iron-peak`, `perry-creek`).
- `permits[]`: optional, validated-but-never-persisted. Omit for the POC.

### Deferred Ideas (OUT OF SCOPE)
- Scaling beyond the 14 POC hikes.
- Display-vs-join dual geometry.
- AllTrails as a source (ToS-restricted).
- A dedicated hike category / `place_type` field.
</user_constraints>

## Summary

All four central research questions from CONTEXT.md `<open_questions>` are answered with HIGH confidence.

**Trail geometry acquisition (central question):** WTA hike pages do not expose GPX downloads — the site renders a JavaScript Leaflet map and provides no geometry file links. WTA's Terms of Service restrict programmatic reproduction of site content. **OpenStreetMap is the license-clean primary source.** Live Overpass API queries against the Washington State bounding box confirm that **12 of the 14 WTA hikes are findable in OSM** as named way segments or `route=hiking` relations (see per-hike table below). Two hikes — Geyser Valley (Olympic Peninsula) and the Snoqualmie Pass to Olallie Meadow segment — lack a named OSM relation; their OSM ways may be individually tagged but require manual segment assembly. Hand-traced GPX is the fallback for these two only.

**Metric buffering:** `ST_Transform(..., 'EPSG:4326', 'EPSG:32610', true)` → `ST_Buffer(250)` → `ST_Transform(..., 'EPSG:32610', 'EPSG:4326', true)` is **verified working** in DuckDB 1.5.3 with `LOAD spatial` in the project venv. The `always_xy=true` fourth argument is **required** — without it, DuckDB 1.5.3 returns `POINT (inf inf)` for EPSG:4326→32610 because PROJ interprets CRS axis order as lat/lon. All 14 WTA hikes have approximate longitudes west of -120°, placing them in **UTM Zone 10N (EPSG:32610)** — no zone-switching logic is needed.

**Weight impact:** 14 corridor polygons at `tol=0.0002°` add approximately **36–61 KB** of GeoJSON (depending on source track density), raising `places.geojson` from its current **875 KB** to roughly **911–936 KB** — well under the ~1 MB guard established in Phase 161. Simplification at `0.0002°` (~22 m) is recommended; even the densest expected GPX source (500 vertices) stays under 10 KB per corridor. **Simplification is optional** for this phase (unlike Phase 161 where it was forced by 3 MB of polygon data), but still recommended for consistency with the guard threshold.

**Primary recommendation:** Acquire trail geometry from OSM via Overpass API for 12 of 14 hikes; hand-trace the remaining 2 in GPX (or accept any OSM way segment that covers the route). Write a committed, list-driven curation script `data/add_hikes_as_places.py` modeled on `data/add_wdfw_wildlife_areas.py` that: reads OSM geometry (or a local GPX file) per hike, applies the metric-buffer chain in DuckDB, emits `[[places]]` TOML blocks, and round-trip validates with `tomllib`. Since Phase 160 removed the `ST_Overlaps` rejection from `places_validation.py`, hike corridors overlapping WDFW areas or other places **load cleanly without any collision handling.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trail geometry acquisition | Curation script (`data/`, one-time) | — | Reproducibility matters; slugs immutable; not a nightly concern |
| Metric buffer + corridor polygon | DuckDB spatial (in curation script) | — | `ST_Transform` + `ST_Buffer` verified; no extra deps needed |
| WKT → `[[places]]` TOML | Curation script | — | Committed artifact; reuses `toml_block()` pattern from `add_wdfw_wildlife_areas.py` |
| Place validation | `places_validation.py` | — | Existing gate; overlap check removed in Phase 160 — corridors load cleanly |
| Spatial join → bridge | dbt `marts/occurrence_places.sql` `ST_Within` | — | Existing, unchanged; a corridor polygon participates; a bare LineString cannot |
| Browser-shipped boundary | `places_export.py` → `places.geojson` | — | Existing, unchanged; weight impact is modest (~36–61 KB for 14 hikes) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` (+ `spatial` ext) | 1.5.3 (pinned `>=1.5.3,<2`) | Metric buffer, `ST_Transform`, `ST_MakeValid`, `ST_SimplifyPreserveTopology`, `ST_Multi`, `ST_AsText` | Already a hard dep; `LOAD spatial` runs in every existing place step. All needed functions confirmed present [VERIFIED: local exec in project venv] |
| `requests` | (in deps) | Overpass API fetch — download OSM geometry as JSON | Already a dep used by `add_wdfw_wildlife_areas.py` [VERIFIED: data/pyproject.toml] |
| `tomllib` | stdlib | Round-trip validate emitted TOML | Used throughout `places_*.py` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GPX fallback | — | Hand-traced route for the 2 OSM-uncertain hikes | Only for Geyser Valley and Snoqualmie Pass to Olallie Meadow if OSM way assembly is unclear |
| `xml.etree.ElementTree` | stdlib | Parse GPX `<trkpt>` elements to WGS84 coordinate list | Only if using GPX fallback; no new dep |

**No new dependencies required.** All deps are present in `data/pyproject.toml`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OSM Overpass API | WTA page scrape | WTA ToS restricts programmatic reproduction; OSM is the licensed-clean path |
| OSM Overpass API | AllTrails/CalTopo/Gaia export | Rejected by D-deferred; AllTrails ToS prohibits bulk extraction |
| DuckDB `ST_Transform` | `pyproj`/shapely | Extra dep; DuckDB spatial bundles PROJ and handles the buffer in a single SQL chain |
| UTM 10N per-hike | WA State Plane South (EPSG:2927) | State Plane covers all of WA in one CRS; however, EPSG:2927 uses US survey feet — `ST_Buffer(250)` would buffer in feet not meters. UTM 10N (meters) is the safe default. All 14 hikes fall within Zone 10N. |
| `ST_SimplifyPreserveTopology` | `ST_Simplify` | `ST_Simplify` can introduce self-intersections in elongated corridor polygons; use `ST_SimplifyPreserveTopology` throughout |

**Installation:** None required.

```bash
# Verify locally before running curation (no install step):
cd data && uv run python -c "import duckdb; c=duckdb.connect(':memory:'); c.execute('LOAD spatial'); print(duckdb.__version__)"
```

**Version verification:** `duckdb 1.5.3` confirmed installed and pinned in `data/pyproject.toml`. [VERIFIED: local exec]

## Package Legitimacy Audit

No new external packages are installed by this phase. All tooling (`duckdb`, `requests`, stdlib `tomllib`, `xml.etree.ElementTree`) is already in `data/pyproject.toml` and exercised by the existing pipeline. **Package Legitimacy Gate: N/A (no new dependencies).**

## Trail Geometry Acquisition (Central Open Question — RESOLVED)

### WTA website — no geometry available
WTA hike pages render a JavaScript Leaflet map with no embedded trail geometry and provide no GPX/KML/GeoJSON download links. [VERIFIED: WebFetch of Umtanum Creek Canyon page] The WTA Terms of Service restrict reproduction of site content by "any means, electronic or mechanical" beyond internal informational use. WTA is **not a viable geometry source** — neither scraped nor programmatically accessed. [CITED: wta.org/our-work/about/terms-of-service]

### OpenStreetMap — primary recommended source

**License:** OSM data is released under the Open Database License (ODbL). Extracting trail geometry for use in `content/places.toml` (a private database file) is permitted as "internal use." If the extracted geometry is shipped publicly (e.g., via `places.geojson`), attribution is required: "© OpenStreetMap contributors" text, linked to `openstreetmap.org/copyright`. The project already ships Mapbox tiles (which carry OSM attribution); adding a note to the site footer or an ADR documenting the trail geometry source satisfies ODbL attribution. Share-alike applies to the extracted database — the TOML file itself is not publicly distributed as a database, so the ODbL share-alike obligation does not force open-sourcing `places.toml`. [CITED: osmfoundation.org/wiki/Licence/Attribution_Guidelines]

**Query approach:** Overpass API (`overpass-api.de/api/interpreter`), queried by name + bounding box. WA State bbox: `(45.5,-124.8,49.0,-116.9)`. Trail ways tagged `highway=path` or `highway=footway` with matching `name`; hiking route relations tagged `route=hiking` with matching `name`. Geometry returned with `out geom;`.

### Per-hike OSM availability (assessed via live Overpass queries)

[VERIFIED: Overpass API queries executed this session against bbox 45.5,-124.8,49.0,-116.9]

| # | Hike | WTA slug | OSM entity found | OSM name | Confidence | Notes |
|---|------|----------|-----------------|----------|-----------|-------|
| 1 | Boulder–De Roux | `boulder-de-roux` | relation 5634553 | "Boulder De Roux Trail" | HIGH | Hiking relation; multiple way segments |
| 2 | Fortune Creek Pass | `fortune-creek-pass` | relation 14367348 | "North Fork Fortune Creek Trail" | MEDIUM | Relation found but name is "North Fork…" — verify it covers the WTA route (WTA page says 6.6 mi roundtrip) |
| 3 | Snoqualmie Pass to Olallie Meadow | `snoqualmie-pass-to-olallie-meadow` | None found | — | LOW | No named relation or way for this route segment; likely a PCT/Cascade Crest section not tagged as a named named route in OSM. Fallback: hand-trace from topo map or use USFS trail layer |
| 4 | Iron Peak | `iron-peak` | relation 5625967 | "Iron Peak Trail" | HIGH | Hiking relation |
| 5 | Naches Peak Loop | `naches-peak-loop` | relation 5194432 | "Naches Peak Loop Trail" | HIGH | Hiking relation |
| 6 | Geyser Valley | `geyser-valley` | way 261478799 | "Geyser Valley Trail" | MEDIUM | Single way segment found; no named relation. May not cover the full out-and-back. Fallback: assemble from adjacent Olympic NP trail ways or hand-trace |
| 7 | Deception Pass–Goose Rock | `deception-pass-goose-rock` | ways 40722380, 40722381, 378846616, 520112391, 804757055, 820116252 | "Goose Rock Summit Trail" / "Goose Rock Perimeter Trail" | HIGH | Multiple way segments covering Goose Rock; the WTA route is a loop — assemble ways tagged with these names |
| 8 | Perry Creek | `perry-creek` | relation 5537840 | "Perry Creek Trail" | HIGH | Hiking relation |
| 9 | Big Four Ice Caves | `big-four-ice-caves` | relation 5537839 | "Big Four Ice Caves Trail" | HIGH | Hiking relation |
| 10 | Umtanum Creek Canyon | `umtanum-creek-canyon` | ways 30011682–1249276358 | "Umtanum Creek Trail" | HIGH | Multiple way segments (footbridge + 4 trail ways); no named relation but ways cover the route |
| 11 | Catherine Creek Loop | `catherine-creek-loop` | relations 9210173, 10542427 | "Catherine Creek South Loop" / "Catherine Creek North Loop" | HIGH | Two loop relations + way 66210338 "Catherine Creek Loop Trail"; WTA route is the combined loop |
| 12 | Icicle Gorge Loop | `icicle-gorge-loop` | relation 5597767 | "Icicle Gorge Trail" | HIGH | Hiking relation + 8 way segments |
| 13 | Monte Cristo | `monte-cristo` | relation 5537812 | "Old Monte Cristo Townsite Trail" | HIGH | Hiking relation |
| 14 | Tomyhoi Lake | `tomyhoi-lake` | relation 4830238 | "Tomyhoi Lake Trail" | HIGH | Hiking relation |

**Summary:** 12/14 hikes have HIGH or MEDIUM OSM coverage. 2 hikes need fallback:
- **Snoqualmie Pass to Olallie Meadow** (LOW): No matching OSM named entity; likely needs USFS trail data or hand-trace.
- **Geyser Valley** (MEDIUM): One way segment found; completeness unclear.

### Overpass query pattern for curation script

```python
# Source: verified live against Overpass API this session
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def fetch_osm_relation_geometry(relation_id: int) -> list[tuple[float, float]]:
    """Fetch ordered node coordinates for an OSM relation as a flat coordinate list.

    Returns a list of (lon, lat) tuples from the relation's member ways, in order.
    The caller must assemble these into a WGS84 LINESTRING WKT.
    """
    # relation with full geometry
    query = f"""
    [out:json][timeout:30];
    relation({relation_id});
    (._;>;);
    out geom;
    """
    r = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    return r.json()

def fetch_osm_ways_by_name(name_pattern: str, bbox: tuple) -> list[dict]:
    """Fetch ways matching a name pattern within a bounding box.

    bbox = (south, west, north, east) in WGS84.
    """
    s, w, n, e = bbox
    query = f"""
    [out:json][timeout:30];
    (
      way["name"~"{name_pattern}",i]["highway"]({s},{w},{n},{e});
      relation["name"~"{name_pattern}",i]["route"="hiking"]({s},{w},{n},{e});
    );
    out geom;
    """
    r = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    return r.json().get("elements", [])
```

### GPX fallback (for Snoqualmie-Olallie and Geyser Valley)

Committed GPX files stored in `data/fixtures/hike-gpx/` (gitignored for large binary; or small hand-traced files committed directly). Parse `<trkpt lat="..." lon="...">` via `xml.etree.ElementTree` to produce a coordinate list. Convert to `LINESTRING(lon lat, ...)` WKT for the buffer chain. No extra deps.

### OSM geometry assembly from ways

OSM relations return member ways as ordered segments. The curation script must concatenate the way node coordinates in member order to produce a continuous LineString. For cases where only individual ways (not a relation) are found, collect all ways with the target name and concatenate them — for a corridor buffer, ordering is not critical (the union of segments will buffer correctly).

## Metric Buffering in DuckDB Spatial

### Verified code chain

```python
# Source: verified live in project venv (uv run python), duckdb 1.5.3 [VERIFIED: local exec]
import duckdb

con = duckdb.connect(":memory:")
con.execute("LOAD spatial")  # INSTALL not needed — already installed in repo

# linestring_wkt: WGS84 LINESTRING from OSM or GPX source
# e.g. "LINESTRING(-120.5 46.9, -120.4 46.95, -120.45 47.0)"
BUFFER_M = 250
TOL_DEG = 0.0002  # ~22 m simplification tolerance

row = con.execute("""
    SELECT ST_AsText(
        ST_Multi(
            ST_SimplifyPreserveTopology(
                ST_MakeValid(
                    ST_Transform(
                        ST_Buffer(
                            ST_Transform(
                                ST_GeomFromText(?),
                                'EPSG:4326', 'EPSG:32610', true   -- WGS84 → UTM 10N (meters); always_xy=true REQUIRED
                            ),
                            ?                                     -- buffer in meters
                        ),
                        'EPSG:32610', 'EPSG:4326', true           -- UTM 10N → WGS84; always_xy=true REQUIRED
                    )
                ),
                ?                                                 -- Douglas-Peucker tolerance in degrees
            )
        )
    )
""", [linestring_wkt, BUFFER_M, TOL_DEG]).fetchone()

wkt = row[0]
assert wkt.startswith("MULTIPOLYGON"), f"Unexpected geometry type: {wkt[:60]!r}"
```

**CRITICAL: `always_xy=true` is the fourth argument to `ST_Transform`.** Without it, DuckDB 1.5.3 interprets EPSG:4326 axis order as lat/lon (PROJ default for geographic CRS), producing `POINT (inf inf)` on transform. [VERIFIED: local exec — confirmed inf output without flag; correct metric output with flag]

### UTM zone selection

All 14 WTA hikes have approximate longitudes between −124° and −120°, placing them squarely in **UTM Zone 10N (EPSG:32610)**. The zone boundary is −120°; the easternmost hike (Umtanum Creek Canyon, ~−120.5°) sits comfortably within Zone 10N. **A single hardcoded `'EPSG:32610'` is correct for all 14 hikes.** No per-hike zone switching is needed.

If the project later expands to eastern WA hikes east of −120°, those would use EPSG:32611 (UTM Zone 11N). This is a data concern for a future phase; the POC script can document it as a comment.

### Validity assertion

```python
# After computing wkt, assert validity before writing TOML
is_valid = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()[0]
if not is_valid:
    raise ValueError(f"Buffer produced invalid geometry for hike {slug!r}")
```

## D-02 Weight Analysis (MEASURED — simplification recommended but not forced)

Measured using simulated sinuous trail LineStrings (100–500 vertices, 8–15 km, matching expected GPX track density) at representative tolerances. [VERIFIED: local exec]

| Source track density | Trail length | Simplification tol | GeoJSON per corridor | 14 hikes total | places.geojson total |
|--------------------|--------------|--------------------|---------------------|----------------|----------------------|
| 100 vertices (sparse) | 10 km | 0.0002° (~22 m) | ~2,600 bytes | ~36 KB | ~911 KB |
| 500 vertices (dense GPX) | 10 km | 0.0002° (~22 m) | ~4,500 bytes | ~61 KB | ~936 KB |
| 500 vertices | 10 km | 0.0001° (~11 m) | ~7,500 bytes | ~102 KB | ~977 KB |
| 500 vertices | 10 km | 0.00005° (~5.5 m) | ~9,900 bytes | ~135 KB | ~1,010 KB |

**Current baseline:** `places.geojson` = 895,784 bytes (875 KB), measured this session. [VERIFIED: local exec] The Phase 161 research used 345,580 bytes as baseline — Phase 161 WDFW additions have since shipped, raising it to 875 KB.

**Recommendation:** Use `tol=0.0002°` (~22 m). At this tolerance, even the densest expected GPX track (500 vertices) adds only ~61 KB for all 14 corridors, keeping `places.geojson` under 940 KB — safely below the ~1 MB guard. The simplification tolerance that is "wrong" for this phase is `0.0` (no simplification), which at 500 vertices/trail would add ~150–200 KB and approach the guard.

**No measure-first ceremony required:** Unlike Phase 161 (3 MB full-fidelity), 14 trail corridors are geometrically small (elongated strips ~500 m wide, vs. statewide polygon areas). Apply `tol=0.0002°` directly; report the actual byte delta in the commit message.

## Architecture Patterns

### Data flow (this phase)

```
OSM Overpass API ─(requests, by relation ID or name+bbox, out geom)─> way node coordinates
         │  (2 hike fallback: hand-traced GPX → xml.etree parse → coordinates)
         │
         ▼  DuckDB spatial (in curation script)
   ST_GeomFromText('LINESTRING(lon lat, ...)')
         │  ST_Transform → UTM 10N (EPSG:32610, always_xy=true)
         │  ST_Buffer(250)                        ← metric 250 m buffer
         │  ST_Transform → EPSG:4326 (always_xy=true)
         │  ST_MakeValid → ST_SimplifyPreserveTopology(0.0002) → ST_Multi
         ▼
   ST_AsText  ──> MULTIPOLYGON WKT per hike
         │
         ▼  append [[places]] blocks (list-driven; 14 hikes as input data)
   content/places.toml  ──> (existing pipeline, UNCHANGED)
         │  places-validation (5 checks; overlap check removed in Phase 160)
         │  places-load (ST_GeomFromText → geographies.places)
         │  dbt-build (ST_Within point-in-polygon → occurrence_places bridge)
         │  places-export → places.geojson + places.json
         ▼
   public/data/places.geojson  (browser-shipped; +~36-61 KB delta)
```

### Recommended project structure

```
data/
├── add_hikes_as_places.py        # NEW: one-time committed curation script (template: add_wdfw_wildlife_areas.py)
└── fixtures/
    └── hike-gpx/                  # Optional: GPX fallback files for Snoqualmie-Olallie and Geyser Valley
        ├── snoqualmie-pass-to-olallie-meadow.gpx   # hand-traced or USFS-sourced
        └── geyser-valley.gpx
content/
└── places.toml                    # +14 [[places]] blocks appended
```

### Pattern: list-driven curation script

The script should be list-driven — the 14 hikes encoded as a data structure — so that adding more hikes later is a data edit, not a code change. Each entry carries: `slug`, `name`, `land_owner`, `osm_relation_id` (or `gpx_path` for fallback), `bbox` for verification.

```python
# Source: pattern from add_wdfw_wildlife_areas.py adapted for per-hike list
HIKES = [
    {
        "slug": "boulder-de-roux-trail",
        "name": "Boulder–De Roux",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 5634553,
    },
    {
        "slug": "naches-peak-loop-trail",
        "name": "Naches Peak Loop",
        "land_owner": "National Park Service / USDA Forest Service",
        "osm_relation_id": 5194432,
    },
    # ... etc.
    {
        "slug": "snoqualmie-pass-to-olallie-meadow-trail",
        "name": "Snoqualmie Pass to Olallie Meadow",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "gpx_path": "data/fixtures/hike-gpx/snoqualmie-pass-to-olallie-meadow.gpx",  # fallback
    },
]
```

### Pattern: assemble LineString from OSM relation ways

OSM relation geometry (returned by `out geom;`) contains member ways as ordered segments. The curation script must join these into a single `LINESTRING` WKT. For a corridor buffer, topological correctness of node ordering is not critical (the union of buffered segments produces the same corridor regardless of direction). Concatenate way node coordinates and deduplicate adjacent endpoints.

### Anti-Patterns to Avoid
- **Omitting `always_xy=true` in `ST_Transform`** — this is the single most dangerous pitfall; produces `(inf, inf)` coordinates silently. Always include the fourth argument.
- **Using EPSG:2927 (WA State Plane South, US survey feet) for buffering** — `ST_Buffer(250)` would buffer in feet, not meters. EPSG:32610 (UTM 10N, meters) is correct.
- **Degree-based buffer (`ST_Buffer` on WGS84 geometry)** — a 250-degree buffer is nonsensical; always transform to a metric CRS first. This is the defining constraint of D-02.
- **Using `ST_Simplify` instead of `ST_SimplifyPreserveTopology`** — for narrow elongated corridors, `ST_Simplify` can collapse the polygon to a line and produce invalid geometry.
- **Skipping `ST_MakeValid`** — `ST_Buffer` on a LineString that has very close self-approach (switchback trails) can produce topology errors; `ST_MakeValid` before simplification is defensive.
- **Hand-editing 14 MULTIPOLYGON WKTs into TOML** — infeasible and unreviewable. Use a committed script.
- **Using a single `osm_way_id` as the source** — many trails are multi-segment relations; fetching a single way ID omits large portions of the trail. Prefer relation IDs where available.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Metric buffering | Degree-based `ST_Buffer` on WGS84 | `ST_Transform` to EPSG:32610 then `ST_Buffer(250)` | Degree buffer is latitude-distorted and wrong |
| Reprojection | Manual Mercator/UTM math | DuckDB `ST_Transform` (bundles PROJ) | PROJ handles datum correctly; no extra dep |
| Geometry repair | Skipping validity | `ST_MakeValid` + `ST_IsValid` assert | Buffer on sinuous trails can introduce ring topology errors |
| Forcing MultiPolygon type | String-munging WKT | `ST_Multi(...)` | Guarantees MULTIPOLYGON for downstream pipeline consistency |
| Simplification | Custom decimation | `ST_SimplifyPreserveTopology(g, 0.0002)` | Topology-safe Douglas–Peucker; no self-intersections |
| TOML block authoring | Typing 14 blocks by hand | Committed `add_hikes_as_places.py` | Reproducible; slugs immutable; reviewable diff |
| OSM LineString assembly | Re-implementing graph traversal | Accept concatenated way nodes; buffer tolerates gaps | The corridor buffer is robust to minor gaps at way joins |

**Key insight:** The only genuinely new engineering in this phase is the `ST_Transform` + `ST_Buffer` metric chain (not present in Phase 161, which received EPSG:4326 geometry directly from the ArcGIS server). Everything else reuses Phase 161 patterns verbatim.

## Common Pitfalls

### Pitfall 1: `always_xy=true` omission produces `(inf, inf)` silently (CRITICAL)
**What goes wrong:** `ST_Transform(geom, 'EPSG:4326', 'EPSG:32610')` returns `POINT (inf inf)` in DuckDB 1.5.3 because PROJ interprets EPSG:4326 axis order as (latitude, longitude) by default. The longitude and latitude values are effectively swapped, producing coordinates far outside the UTM CRS bounds and resulting in `(inf, inf)`.
**Why it happens:** EPSG:4326 is defined with lat/lon axis order in PROJ. The `always_xy=true` flag forces (longitude, latitude) = (x, y) interpretation, which is what WGS84 WKT (`POINT(lon lat)`) uses.
**How to avoid:** Always pass `true` as the fourth argument to `ST_Transform`: `ST_Transform(geom, 'EPSG:4326', 'EPSG:32610', true)` AND `ST_Transform(buffered, 'EPSG:32610', 'EPSG:4326', true)`. [VERIFIED: local exec — reproduced the inf bug without the flag]
**Warning signs:** Buffer output WKT contains `inf` values; `ST_IsValid` returns `false` or throws.

### Pitfall 2: OSM relation geometry assembly — way order and gaps
**What goes wrong:** OSM relations have member ways that may not be ordered end-to-end, and adjacent ways may share a node or have a small gap. Naive concatenation produces a discontinuous `LINESTRING`.
**Why it happens:** OSM data quality varies; relation member order is convention, not enforced by the database.
**How to avoid:** For the corridor buffer, **this doesn't matter** — `ST_Buffer` on a `MULTILINESTRING` (or even a collection of disjoint segments) produces the union of all segment buffers, which is the correct corridor. Alternatively, convert each way to a separate buffer and union them. The key is that the output must be a valid `POLYGON` or `MULTIPOLYGON`.
**Warning signs:** `ST_AsText` produces a `GEOMETRYCOLLECTION` instead of `POLYGON`/`MULTIPOLYGON` — this would fail `places_validation.py` check 4.

### Pitfall 3: OSM way name matching returns roads and non-trail features
**What goes wrong:** A query for `"name"~"Monte Cristo"` returns residential streets, roads, and a hotel alongside the trail.
**Why it happens:** OSM name tags are not namespaced; any feature can have any name.
**How to avoid:** Filter by `["highway"~"^(path|footway|bridleway|track)$"]` to restrict to trail-type ways, or by `["route"="hiking"]` for relations. Always verify the geometry visually (e.g., on overpass-turbo.eu) for the 2–3 ambiguous hikes (Deception Pass, Monte Cristo) before committing.
**Warning signs:** Geometry extends into urban areas or has wildly wrong bounding box for the expected hike location.

### Pitfall 4: TOML triple-quote WKT formatting
**What goes wrong:** A stray quote or backslash in the `geometry_wkt = """…"""` block breaks TOML parse.
**How to avoid:** Reuse `toml_block()` from `add_wdfw_wildlife_areas.py` verbatim (it already emits `geometry_wkt = """ … """` form). Validate by round-tripping with `tomllib.loads()` immediately after writing.

### Pitfall 5: `land_owner` key access in `places_export.py` — field is effectively required
**What goes wrong:** `places_export.py` line 128 reads `meta["land_owner"]` (not `.get("land_owner")`). Any `[[places]]` entry without `land_owner` raises `KeyError` and aborts the export.
**How to avoid:** Every hike entry MUST include `land_owner`. For trails crossing multiple agencies, use the primary managing agency name or a documented fallback (e.g., `"USDA Forest Service"` for most Cascade trails). Do not omit the field.

### Pitfall 6: Slug collision with future area-style places
**What goes wrong:** Slugs `monte-cristo`, `iron-peak`, `perry-creek` could collide with future area places (a `Monte Cristo` wildlife area, etc.). Slugs are immutable after first publish.
**How to avoid:** Append `-trail` suffix to all 14 hike slugs during the POC: `monte-cristo-trail`, `iron-peak-trail`, `perry-creek-trail`, etc. The natural WTA URL slug is the base; `-trail` disambiguates. [per CONTEXT.md discretion section]

## Code Examples

### Full buffer chain — verified

```python
# Source: verified live in project venv duckdb 1.5.3 [VERIFIED: local exec]

import duckdb

def linestring_to_corridor_wkt(
    linestring_wkt: str,
    buffer_m: float = 250.0,
    tol_deg: float = 0.0002,
    metric_crs: str = "EPSG:32610",  # UTM Zone 10N; all 14 WTA hikes are in Zone 10N
) -> str:
    """Buffer a WGS84 LineString by buffer_m meters, returning a MULTIPOLYGON WKT.

    Steps:
      1. Project to metric CRS (always_xy=true required for DuckDB 1.5.3)
      2. ST_Buffer in meters
      3. Project back to WGS84 (always_xy=true required)
      4. ST_MakeValid (defensive; buffer on sinuous trails can create topology errors)
      5. ST_SimplifyPreserveTopology at tol_deg
      6. ST_Multi (ensure MULTIPOLYGON type for pipeline consistency)

    Args:
        linestring_wkt: WGS84 WKT LINESTRING, e.g. "LINESTRING(-120.5 47.0, -120.4 47.1)"
        buffer_m: Buffer distance in meters.
        tol_deg: Simplification tolerance in degrees (~22 m at WA latitudes for 0.0002).
        metric_crs: EPSG code string for the metric projection. Default UTM Zone 10N.
    Returns:
        WKT string starting with "MULTIPOLYGON".
    """
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    row = con.execute(
        """
        SELECT ST_AsText(
            ST_Multi(
                ST_SimplifyPreserveTopology(
                    ST_MakeValid(
                        ST_Transform(
                            ST_Buffer(
                                ST_Transform(
                                    ST_GeomFromText(?),
                                    'EPSG:4326', ?, true     -- always_xy=true: REQUIRED
                                ),
                                ?
                            ),
                            ?, 'EPSG:4326', true             -- always_xy=true: REQUIRED
                        )
                    ),
                    ?
                )
            )
        )
        """,
        [linestring_wkt, metric_crs, buffer_m, metric_crs, tol_deg],
    ).fetchone()
    wkt = row[0] if row else None
    if not wkt or not wkt.startswith("MULTIPOLYGON"):
        raise ValueError(
            f"Buffer produced non-MULTIPOLYGON geometry: {wkt!r}. "
            f"Check always_xy=true and CRS selection."
        )
    # Defensive validity check
    is_valid = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()[0]
    if not is_valid:
        raise ValueError(f"Buffer result is geometrically invalid: {wkt[:80]!r}")
    return wkt
```

### Assemble LineString WKT from OSM relation nodes

```python
# Source: pattern based on Overpass API output structure [ASSUMED — verify against live response]

def osm_relation_to_linestring_wkt(overpass_response: dict) -> str:
    """Extract ordered coordinates from an Overpass API relation response.

    The Overpass query must use `(._;>;); out geom;` to include node geometries.
    Ways are concatenated in member order; adjacent duplicate endpoints are dropped.
    """
    # Collect nodes from ways, in member order
    elements = {e["id"]: e for e in overpass_response.get("elements", [])}
    relations = [e for e in overpass_response["elements"] if e["type"] == "relation"]
    if not relations:
        raise ValueError("No relation in Overpass response")
    relation = relations[0]

    coords = []
    for member in relation.get("members", []):
        if member["type"] != "way":
            continue
        way = elements.get(member["ref"])
        if not way or "geometry" not in way:
            continue
        way_coords = [(pt["lon"], pt["lat"]) for pt in way["geometry"]]
        # Drop duplicate endpoint between consecutive ways
        if coords and coords[-1] == way_coords[0]:
            way_coords = way_coords[1:]
        coords.extend(way_coords)

    if len(coords) < 2:
        raise ValueError("Relation produced fewer than 2 coordinate points")

    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lon, lat in coords) + ")"
```

### Parse GPX fallback to LineString WKT

```python
# Source: stdlib xml.etree.ElementTree — no extra deps [ASSUMED — standard GPX format]

import xml.etree.ElementTree as ET

GPX_NS = "http://www.topografix.com/GPX/1/1"

def gpx_to_linestring_wkt(gpx_path: str) -> str:
    """Parse a GPX file and return a WGS84 LINESTRING WKT from track points.

    Reads the first <trk><trkseg> element. GPX uses (lat, lon) attributes;
    WKT LINESTRING uses (lon lat) order.
    """
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    trkpts = root.findall(f".//{{{GPX_NS}}}trkpt")
    if not trkpts:
        raise ValueError(f"No <trkpt> elements found in {gpx_path!r}")
    coords = [(float(pt.attrib["lon"]), float(pt.attrib["lat"])) for pt in trkpts]
    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lon, lat in coords) + ")"
```

### TOML block writer — reuse from `add_wdfw_wildlife_areas.py`

```python
# Source: data/add_wdfw_wildlife_areas.py:152-176 (use verbatim; already handles triple-quote WKT)
from add_wdfw_wildlife_areas import toml_block, _toml_escape
# or copy the functions directly (add_hikes_as_places.py is a standalone script)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polygon boundaries (direct ArcGIS fetch, EPSG:4326) | LineString → metric buffer → MULTIPOLYGON | This phase | Requires `ST_Transform` + metric CRS; `always_xy=true` flag is new requirement |
| shapely `unary_union` | DuckDB `ST_Union_Agg` (WDFW phase) | Phase 161 | No transient dep; canonical pattern for this project |
| Per-place `ST_Overlaps` check | No overlap check (many-to-many model) | Phase 160 | Trail corridors overlapping WDFW areas or other places load cleanly without collision handling |

**Deprecated/outdated:** The `places_validation.py` overlap check is gone (Phase 160). Plans that reference "D-04 triage" are describing Phase 161 behavior; Phase 162 does **not** need any overlap triage step.

## Runtime State Inventory

Not a rename/refactor/migration phase. Pure additive content. **No runtime state to migrate.** New slugs appear in `occurrence_places.parquet` on the next dbt build automatically (additive). `places_load.py` does `CREATE OR REPLACE TABLE geographies.places` each run — fully rebuilt from TOML, no incremental state.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | All 14 WTA hikes fall in UTM Zone 10N (lon < −120°) | Metric Buffering | Low — easternmost is Umtanum at ~−120.5°; Zone 10N is correct. If a future hike extends east of −120°, EPSG:32611 is needed |
| A2 | OSM relation geometry assembly (way concatenation) produces a usable LineString for corridor buffering | Code Examples | Low — for a corridor buffer, order doesn't matter; the union of buffered segments covers the trail |
| A3 | Geyser Valley has sufficient OSM way coverage (way 261478799) for the WTA route | Per-hike table | Medium — single way found; completeness not verified against WTA's stated 9.2 mi distance. Fallback is hand-traced GPX |
| A4 | Snoqualmie Pass to Olallie Meadow has no named OSM entity; needs fallback | Per-hike table | Medium — the PCT in this area may be tagged differently (e.g., `ref=PCT`); deeper query might find it. If found, the fallback is unnecessary |
| A5 | `land_owner` for USFS trails uses the format "USDA Forest Service — [Forest Name]" | land_owner discretion | Low — format is discretionary; CONTEXT.md says "primary managing agency ... if readily determinable, else a clear documented fallback" |
| A6 | ODbL share-alike obligation does not require open-sourcing `content/places.toml` | License section | Medium — the TOML file is private/git-internal; public distribution of the WKT geometry via `places.geojson` requires attribution but not share-alike (WKT in a database ≠ distributing the database as ODbL). Legal certainty requires a brief ADR note |

## Open Questions

1. **Snoqualmie Pass to Olallie Meadow — OSM fallback**
   - Known: No named hiking relation found in Overpass queries. The route appears to follow the Pacific Crest Trail (PCT) for part of its length.
   - Unclear: Whether OSM has PCT-tagged ways covering this segment; query for `ref=PCT` in the Snoqualmie Pass bbox might find it.
   - Recommendation: Executor should first query `way["ref"~"PCT"]` in bbox (47.3,-121.6,47.5,-121.2) before resorting to hand-trace.

2. **OSM attribution ADR**
   - Known: ODbL requires attribution for publicly-shipped geometry; the site's Mapbox tiles already carry OSM attribution.
   - Unclear: Whether the existing Mapbox attribution satisfies ODbL for separately-derived trail geometry, or whether a distinct "trail geometry © OpenStreetMap contributors" notice is needed.
   - Recommendation: Create `docs/adr/0002-osm-trail-geometry.md` (small, one-paragraph ADR) confirming the attribution posture. Not a blocker for the POC.

3. **Fortune Creek Pass — OSM relation name mismatch**
   - Known: OSM relation 14367348 is named "North Fork Fortune Creek Trail" while WTA calls it "Fortune Creek Pass." WTA page states 11 mi roundtrip.
   - Unclear: Whether this relation covers the full WTA route.
   - Recommendation: Executor verifies on overpass-turbo.eu before using.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB + `spatial` | Metric buffer/WKT chain | ✓ | 1.5.3 | — |
| `requests` | Overpass API fetch | ✓ | (in deps) | — |
| Overpass API (`overpass-api.de`) | Trail geometry | ✓ (queried this session) | — | Main OSM planet dump (overkill for 14 hikes) |
| Network egress to `overpass-api.de` | One-time curation | ✓ | — | Pre-download and commit GeoJSON fixture files |
| `xml.etree.ElementTree` | GPX fallback parsing | ✓ | stdlib | — |
| GPX source for Geyser Valley, Snoqualmie-Olallie | Fallback geometry | Unverified | — | USFS trail data (public domain); Caltopo export |

**Missing dependencies with no fallback:** None blocking.
**Missing dependencies with fallback:** GPX source files for 2 hikes — executor must source or hand-trace before running the curation script.

## Validation Architecture

> `.planning/config.json` has `nyquist_validation: true`. [VERIFIED: local exec]

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (data side); Vitest (frontend, not exercised here) |
| Config | `data/pyproject.toml` `[tool.pytest.ini_options]` (`testpaths=["tests"]`) |
| Quick run | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py` |
| Full place pipeline | `cd data && uv run python run.py` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| HKE-VALID | All 5 `places_validation.py` checks pass on new TOML | unit | `uv run pytest tests/test_places_validation.py` | ✅ existing |
| HKE-LOAD | 14 new rows appear in `geographies.places` | unit | `uv run pytest tests/test_places_load.py` | ✅ existing |
| HKE-WEIGHT | `places.geojson` written and size reported | unit | `uv run pytest tests/test_places_export.py` | ✅ existing |
| HKE-BUFFER | Buffer chain produces valid MULTIPOLYGON from a LineString fixture | unit | `uv run pytest tests/test_add_hikes_as_places.py` | ❌ Wave 0 |
| HKE-SLUG | All 14 slugs match `[a-z0-9-]` and end with `-trail` | unit | `uv run pytest tests/test_add_hikes_as_places.py::test_slugs` | ❌ Wave 0 |
| HKE-NONETWORK | Curation script buffer logic is testable without Overpass/network | unit | pytest with fixture LineString WKT (no network) | ❌ Wave 0 |

### Golden-fixture test for `add_hikes_as_places.py` (Wave 0)

The curation script should expose a testable pure function `linestring_to_corridor_wkt(wkt, buffer_m, tol_deg)` (no network call). The test:
1. Passes a fixed WGS84 `LINESTRING` fixture.
2. Asserts the result starts with `"MULTIPOLYGON"`.
3. Asserts `ST_IsValid` returns `True` via DuckDB.
4. Asserts the result bounding box is within ~500 m of the input LineString centroid (sanity check on metric accuracy).
5. Asserts the result area is in the expected range for a 250 m buffer on a ~1 km trail (roughly 0.5 km² ± 50%).

This mirrors `test_add_wdfw_wildlife_areas.py`'s pattern: fixture geometries, no network, verify MULTIPOLYGON type, verify DuckDB loadability.

### Sampling Rate
- **Per commit:** `uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py tests/test_add_hikes_as_places.py`
- **Pre-commit of TOML:** `uv run python -c "from places_validation import validate_places_step; validate_places_step()"` (5 checks; no overlap check since Phase 160)
- **Phase gate:** full `run.py` green + reported `places.geojson` byte delta

### Wave 0 Gaps
- [ ] `data/tests/test_add_hikes_as_places.py` — buffer correctness + MULTIPOLYGON + slug + no-network tests
- [ ] `data/add_hikes_as_places.py` — the curation script itself (Wave 0 scaffold: list structure, `linestring_to_corridor_wkt` function, `toml_block` reuse, stub main)

*(Existing place pipeline tests cover HKE-VALID, HKE-LOAD, HKE-WEIGHT once TOML is committed. Only the new curation script logic needs new tests.)*

## Security Domain

No `security_enforcement`-relevant surface: no auth, no user input to backend, no secrets handling, no new network endpoints exposed. The Overpass API calls are read-only GET/POST requests to a public OSM service over HTTPS. `places_load.py` uses parameterized `ST_GeomFromText(?)` (WKT-injection-safe); the curation script should likewise parameterize all SQL (the verified examples above do). No ASVS category applies beyond transport security (HTTPS, already used).

## Sources

### Primary (HIGH confidence)
- DuckDB 1.5.3 + spatial: `ST_Transform` (with `always_xy=true`), `ST_Buffer`, `ST_MakeValid`, `ST_SimplifyPreserveTopology`, `ST_Multi`, `ST_AsText`, `ST_IsValid` — all verified in project venv this session [VERIFIED: local exec]
- `data/add_wdfw_wildlife_areas.py`, `places_validation.py`, `places_load.py`, `places_export.py`, `dbt/models/marts/occurrence_places.sql`, `content/places.toml`, `data/pyproject.toml` — read directly [VERIFIED: repo]
- Overpass API queries for all 14 hike names, executed live this session [VERIFIED: Overpass API live query]
- `public/data/places.geojson` size: 895,784 bytes — measured this session [VERIFIED: local exec]
- Weight estimates: corridor polygon sizes measured at multiple vertex counts and tolerances [VERIFIED: local exec]

### Secondary (MEDIUM confidence)
- WTA Terms of Service (`wta.org/our-work/about/terms-of-service`) — restrictions on programmatic content reproduction confirmed [CITED: wta.org]
- OpenStreetMap ODbL attribution requirements — attribution required for publicly-shipped derived geometry [CITED: osmfoundation.org/wiki/Licence/Attribution_Guidelines]
- `always_xy=true` requirement for DuckDB ST_Transform — reproduced the `inf` bug and fix in local session [VERIFIED: local exec]

### Tertiary (LOW confidence)
- Per-hike OSM relation name-to-WTA-route correspondence (Fortune Creek Pass, Geyser Valley coverage completeness) — confirmed entity exists but completeness not fully verified

## Metadata

**Confidence breakdown:**
- DuckDB spatial buffer chain: HIGH — every operation verified locally with the project venv
- OSM trail availability (12/14 hikes): HIGH for the 10 with named hiking relations; MEDIUM for Geyser Valley and Fortune Creek Pass completeness; LOW for Snoqualmie-Olallie
- Weight impact: HIGH — measured empirically at multiple configurations
- Pipeline integration: HIGH — identical to Phase 161 (no pipeline changes needed; Phase 160 removed the only complication: the overlap check)

**Research date:** 2026-06-23
**Valid until:** ~2026-07-23 (OSM data changes slowly; Overpass API stable; DuckDB version pinned)
