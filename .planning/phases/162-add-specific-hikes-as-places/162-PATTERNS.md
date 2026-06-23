# Phase 162: Add specific hikes as places - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 3 (2 new, 1 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/add_hikes_as_places.py` | utility (curation script) | file-I/O + transform | `data/add_wdfw_wildlife_areas.py` | exact (same script pattern, same pipeline, same TOML writer) |
| `data/tests/test_add_hikes_as_places.py` | test | transform | `data/tests/test_add_wdfw_wildlife_areas.py` | exact |
| `content/places.toml` | config | batch append | `content/places.toml` (existing MULTIPOLYGON entries) | self-match |

## Pattern Assignments

### `data/add_hikes_as_places.py` (utility, transform)

**Analog:** `data/add_wdfw_wildlife_areas.py`

**Imports pattern** (`data/add_wdfw_wildlife_areas.py` lines 21-27):
```python
import json
import re
import tomllib
from pathlib import Path

import duckdb
import requests
```

**Module-level constants pattern** (lines 29-36):
```python
WDFW_URL = (
    "https://geodataservices.wdfw.wa.gov/arcgis/rest/services/"
    "MapServices/WildlifeAreas/MapServer/0/query"
)
TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
TOL = 0.0005  # ST_SimplifyPreserveTopology tolerance in degrees
LAND_OWNER = "Washington Department of Fish & Wildlife"
```

For Phase 162, adapt as:
```python
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
BUFFER_M = 250.0
TOL_DEG = 0.0002   # ~22 m; keeps 14 corridors under ~61 KB total
METRIC_CRS = "EPSG:32610"  # UTM Zone 10N (meters); all 14 WTA hikes lon < -120°
```

**Geometry fetch + DuckDB transform pattern** — the analog fetches pre-projected WGS84 GeoJSON directly from ArcGIS; Phase 162 must add a `ST_Transform` buffer chain. Use this function signature (from RESEARCH.md verified code):
```python
def linestring_to_corridor_wkt(
    linestring_wkt: str,
    buffer_m: float = BUFFER_M,
    tol_deg: float = TOL_DEG,
    metric_crs: str = METRIC_CRS,
) -> str:
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
    is_valid = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()[0]
    if not is_valid:
        raise ValueError(f"Buffer result is geometrically invalid: {wkt[:80]!r}")
    return wkt
```

**CRITICAL:** The fourth `true` argument (`always_xy=true`) is REQUIRED in both `ST_Transform` calls. Without it, DuckDB 1.5.3 produces `(inf, inf)` silently.

**TOML block writer pattern** (`data/add_wdfw_wildlife_areas.py` lines 142-176) — copy verbatim:
```python
def _toml_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

def toml_block(slug: str, name: str, land_owner: str, wkt: str, permits: list[dict]) -> str:
    if permits:
        parts = []
        for p in permits:
            kv = ", ".join(f'{k} = "{v}"' for k, v in p.items())
            parts.append(f"  {{ {kv} }}")
        permits_line = "permits = [\n" + "\n".join(parts) + "\n]"
    else:
        permits_line = "permits = []"

    return f"""
[[places]]
slug        = "{slug}"
name        = "{_toml_escape(name)}"
land_owner  = "{_toml_escape(land_owner)}"
geometry_wkt = \"\"\"
{wkt}
\"\"\"
{permits_line}
"""
```

**Main function pattern** (`data/add_wdfw_wildlife_areas.py` lines 179-232) — the idempotent append pattern:
```python
existing_text = TOML_PATH.read_text(encoding="utf-8")
added = 0
skipped = 0
blocks = []
slugs_added = []

for hike in HIKES:
    slug = hike["slug"]
    if f'slug        = "{slug}"' in existing_text:
        print(f"  SKIP {slug} (already present)")
        skipped += 1
        continue
    # ... fetch geometry, compute wkt ...
    blocks.append(toml_block(slug, hike["name"], hike["land_owner"], wkt, []))
    print(f"  ADD {slug}")
    slugs_added.append(slug)
    added += 1

if blocks:
    with open(TOML_PATH, "a", encoding="utf-8") as f:
        for block in blocks:
            f.write(block)
    # Defense in depth: round-trip validate with tomllib
    tomllib.loads(TOML_PATH.read_text(encoding="utf-8"))

print(f"\nDone: {added} added, {skipped} skipped")
```

**List-driven hike data structure** (from RESEARCH.md pattern):
```python
HIKES = [
    {
        "slug": "boulder-de-roux-trail",
        "name": "Boulder–De Roux",
        "land_owner": "USDA Forest Service — Okanogan-Wenatchee National Forest",
        "osm_relation_id": 5634553,
    },
    # ... one entry per hike; gpx_path key instead of osm_relation_id for fallbacks
    {
        "slug": "snoqualmie-pass-to-olallie-meadow-trail",
        "name": "Snoqualmie Pass to Olallie Meadow",
        "land_owner": "USDA Forest Service — Mt. Baker-Snoqualmie National Forest",
        "gpx_path": "data/fixtures/hike-gpx/snoqualmie-pass-to-olallie-meadow.gpx",
    },
]
```

**Error handling pattern** (lines 62-65 and 109-117 of analog) — explicit raises, no bare excepts:
```python
if not features:
    raise RuntimeError("WDFW service returned zero features; aborting.")

for wla, wkt in rows:
    if not (wkt and wkt.startswith("MULTIPOLYGON")):
        raise ValueError(
            f"Dissolve produced non-MULTIPOLYGON geometry for {wla!r}: "
            f"{wkt!r}. Likely over-simplified at tol={tol}; ..."
        )
```

**Overpass fetch pattern** (from RESEARCH.md, verified against live API):
```python
def fetch_osm_relation_geometry(relation_id: int) -> dict:
    query = f"""
    [out:json][timeout:30];
    relation({relation_id});
    (._;>;);
    out geom;
    """
    r = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
    r.raise_for_status()
    return r.json()
```

---

### `data/tests/test_add_hikes_as_places.py` (test, transform)

**Analog:** `data/tests/test_add_wdfw_wildlife_areas.py`

**File header pattern** (lines 1-11):
```python
"""Golden-fixture tests for add_hikes_as_places.py.

Tests linestring_to_corridor_wkt on a small in-memory fixture LineString.
No network access (fetch_osm_relation_geometry is NOT invoked).

Covers:
  - linestring_to_corridor_wkt: result starts with 'MULTIPOLYGON', is
    DuckDB-loadable, ST_IsValid, bounding box sanity, area sanity.
  - Slug regex: all 14 HIKE slugs match ^[a-z0-9-]+$ and end with '-trail'.
"""
```

**Imports pattern** (lines 13-18):
```python
import re

import duckdb
import pytest

from add_hikes_as_places import linestring_to_corridor_wkt, HIKES
```

**DuckDB loadability assert pattern** (lines 113-122):
```python
def test_corridor_wkt_loadable_by_duckdb():
    """WKT must be parseable by DuckDB ST_GeomFromText."""
    wkt = linestring_to_corridor_wkt(FIXTURE_LINESTRING)
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    row = con.execute("SELECT ST_IsValid(ST_GeomFromText(?))", [wkt]).fetchone()
    assert row is not None and row[0] is True, (
        "Buffer result must be geometrically valid"
    )
```

**Fixture geometry pattern** (lines 27-38 of analog — minimal synthetic geometry):
```python
# Fixture: a short WGS84 LineString in western WA (within UTM Zone 10N)
FIXTURE_LINESTRING = "LINESTRING(-121.5 47.0, -121.4 47.05, -121.45 47.1)"
```

**Slug regex test pattern** (lines 147-166 of analog):
```python
SLUG_RE = re.compile(r"^[a-z0-9-]+$")

def test_all_hike_slugs_match_regex():
    """Every hike slug must match ^[a-z0-9-]+$ and end with '-trail'."""
    for hike in HIKES:
        slug = hike["slug"]
        assert SLUG_RE.match(slug), f"slug {slug!r} is not [a-z0-9-]+"
        assert slug.endswith("-trail"), f"slug {slug!r} must end with '-trail'"
```

---

### `content/places.toml` (config, batch append)

**Analog:** existing entries in `content/places.toml` (lines 10-19, rattlesnake-ledge)

**Schema pattern** (lines 1-9, header comment):
```toml
# places.toml — WA Bee Atlas named collecting locations
#
# Schema rules:
#   slug       Immutable after first publish. Use [a-z0-9-] only.
#   geometry_wkt
#              WGS84 (EPSG:4326) WKT polygon/multipolygon from authoritative GIS sources.
#   permits[].type
#              "project-level" or "site-level"
```

**Entry pattern** (lines 10-19):
```toml
[[places]]
slug        = "rattlesnake-ledge"
name        = "Rattlesnake Ledge Recreation Area"
land_owner  = "Washington Department of Natural Resources"
geometry_wkt = """
MULTIPOLYGON (((...)))
"""
permits = []
```

Key constraints for hike entries:
- `slug` — WTA URL slug + `-trail` suffix (e.g. `boulder-de-roux-trail`); immutable after publish
- `land_owner` — REQUIRED (hard key access in `places_export.py` line 134); set to primary managing agency
- `geometry_wkt` — MULTIPOLYGON WKT (output of `linestring_to_corridor_wkt`); triple-quoted
- `permits = []` — omit permit entries for the POC

---

## Shared Patterns

### DuckDB spatial connection
**Source:** `data/add_wdfw_wildlife_areas.py` lines 77-79
**Apply to:** `data/add_hikes_as_places.py`
```python
con = duckdb.connect(":memory:")
con.execute("LOAD spatial")
```
Note: `LOAD spatial` (not `INSTALL spatial`) — the extension is already installed in the project venv.

### TOML round-trip validation
**Source:** `data/add_wdfw_wildlife_areas.py` lines 221-222
**Apply to:** `data/add_hikes_as_places.py` main(), after appending blocks
```python
tomllib.loads(TOML_PATH.read_text(encoding="utf-8"))
```

### `requests.post` with timeout
**Source:** `data/add_wdfw_wildlife_areas.py` lines 44-55 (GET variant)
**Apply to:** Overpass API calls in `data/add_hikes_as_places.py`
```python
r = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
r.raise_for_status()
```

### Idempotent slug-presence check
**Source:** `data/add_wdfw_wildlife_areas.py` lines 207-210
**Apply to:** `data/add_hikes_as_places.py` main()
```python
if f'slug        = "{slug}"' in existing_text:
    print(f"  SKIP {slug} (already present)")
    skipped += 1
    continue
```

## No Analog Found

All three artifacts have strong analogs. No files in scope lack a codebase match.

## Metadata

**Analog search scope:** `data/`, `data/tests/`, `content/`
**Files scanned:** `data/add_wdfw_wildlife_areas.py` (233 lines), `data/tests/test_add_wdfw_wildlife_areas.py` (167 lines), `content/places.toml` (first 40 lines)
**Pattern extraction date:** 2026-06-23
