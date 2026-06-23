# Phase 161: Add WDFW wildlife areas as places — Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 2 (1 new, 1 modified)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/add_wdfw_wildlife_areas.py` | utility (one-time curation script) | file-I/O + batch transform | `data/add_new_places.py` | exact |
| `content/places.toml` | config/content | batch append | existing `rattlesnake-ledge` + `tiger-mountain` entries (lines 10–30) | exact |

## Pattern Assignments

### `data/add_wdfw_wildlife_areas.py` (utility, batch transform)

**Analog:** `data/add_new_places.py`

**Module docstring pattern** (lines 1–15):
```python
"""Add <N> new <source> places to content/places.toml.

Sources:
  - <agency> ArcGIS REST service: <URL>

<Optional notes on permits, geometry source, etc.>

Run: cd data && uv run python add_wdfw_wildlife_areas.py
"""
```

**Imports pattern** — replace shapely with duckdb; keep requests and pathlib (analog lines 16–21, upgraded):
```python
import json
import tomllib
from pathlib import Path

import duckdb
import requests
```

**Constants pattern** (analog lines 23–26):
```python
TOML_PATH = Path(__file__).parent.parent / "content" / "places.toml"
WDFW_URL = (
    "https://geodataservices.wdfw.wa.gov/arcgis/rest/services/"
    "MapServices/WildlifeAreas/MapServer/0/query"
)
TOL = 0.0002   # ST_SimplifyPreserveTopology tolerance in degrees (~22 m)
LAND_OWNER = "Washington Department of Fish & Wildlife"
```

**Fetch pattern** (analog lines 29–57, adapted for GeoJSON + DuckDB path):
```python
def fetch_wdfw_features() -> list[dict]:
    """Return all 220 unit features from the WDFW MapServer as GeoJSON features."""
    r = requests.get(WDFW_URL, params={
        "where": "1=1",
        "outFields": "WLA_Name,WLAU_Name",
        "returnGeometry": "true",
        "outSR": "4326",   # server-side WGS84 reproject; no client transform needed
        "f": "geojson",
    }, timeout=120)
    r.raise_for_status()
    return r.json()["features"]
```

**Dissolve pattern** (RESEARCH.md §Code Examples; DuckDB path preferred over shapely):
```python
def dissolve_to_wkt(features: list[dict], tol: float) -> list[tuple[str, str]]:
    """Dissolve units by WLA_Name → (wla_name, MULTIPOLYGON WKT) per area."""
    con = duckdb.connect(":memory:")
    con.execute("LOAD spatial")
    con.execute("CREATE TABLE u(wla VARCHAR, g GEOMETRY)")
    for f in features:
        con.execute(
            "INSERT INTO u VALUES (?, ST_GeomFromGeoJSON(?))",
            [f["properties"]["WLA_Name"], json.dumps(f["geometry"])],
        )
    rows = con.execute("""
        SELECT
            wla,
            ST_AsText(
                ST_Multi(
                    ST_SimplifyPreserveTopology(
                        ST_MakeValid(ST_Union_Agg(ST_MakeValid(g))),
                        ?
                    )
                )
            ) AS wkt
        FROM u
        GROUP BY wla
        ORDER BY wla
    """, [tol]).fetchall()
    # Assert validity after simplification
    for wla, wkt in rows:
        assert wkt and wkt.startswith("MULTIPOLYGON"), f"Unexpected geometry for {wla!r}"
    return rows
```

**Overlap pre-check pattern** (RESEARCH.md §Code Examples — mandatory D-04 step):
```python
def check_overlaps(con: duckdb.DuckDBPyConnection) -> list[tuple[str, str]]:
    """Pre-check WDFW areas against existing places for ST_Overlaps collisions.

    Returns list of (wdfw_wla_name, existing_slug) pairs.
    Per D-04: caller must STOP and raise collisions to the user — never auto-clip/skip.
    """
    existing = tomllib.load(open(TOML_PATH, "rb"))["places"]
    con.execute("CREATE TABLE IF NOT EXISTS existing(slug VARCHAR, g GEOMETRY)")
    for p in existing:
        con.execute(
            "INSERT INTO existing VALUES (?, ST_GeomFromText(?))",
            [p["slug"], p["geometry_wkt"].strip()],
        )
    return con.execute(
        "SELECT w.slug, e.slug FROM wdfw w, existing e WHERE ST_Overlaps(w.g, e.g)"
    ).fetchall()
```

**TOML block writer** — reuse verbatim from analog (analog lines 78–97):
```python
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
name        = "{name}"
land_owner  = "{land_owner}"
geometry_wkt = \"\"\"
{wkt}
\"\"\"
{permits_line}
"""
```

**Duplicate-skip guard** (analog lines 178–185):
```python
existing_text = TOML_PATH.read_text(encoding="utf-8")
if f'slug        = "{slug}"' in existing_text:
    print(f"  SKIP {slug} (already present)")
    continue
```

**Append pattern** (analog lines 191–194):
```python
if blocks:
    with open(TOML_PATH, "a", encoding="utf-8") as f:
        for block in blocks:
            f.write(block)
```

**Main flow** (analog lines 100–199, adapted):
```python
def main() -> None:
    print("Fetching WDFW boundary features...")
    features = fetch_wdfw_features()
    print(f"  {len(features)} unit features fetched")

    print(f"Dissolving to MultiPolygon WKT (tol={TOL}°)...")
    areas = dissolve_to_wkt(features, TOL)
    print(f"  {len(areas)} wildlife areas dissolved")

    # D-04: overlap pre-check — STOP and raise to user if any found
    # (build wdfw table for overlap check while dissolve results are in memory)
    ...
    collisions = check_overlaps(con)
    if collisions:
        print("OVERLAP COLLISIONS FOUND — resolve with user before committing TOML:")
        for wla, slug in collisions:
            print(f"  WDFW '{wla}' overlaps existing '{slug}'")
        raise SystemExit(1)

    # Emit [[places]] blocks for areas not already present
    ...
    print(f"\nDone: {added} added, {skipped} skipped")
    print(f"places.geojson delta: measure after next pipeline run")

if __name__ == "__main__":
    main()
```

---

### `content/places.toml` — 33–34 new `[[places]]` entries

**Analog:** existing entries lines 10–39, particularly `rattlesnake-ledge` (line 10) for MultiPolygon and `tiger-mountain` (line 21) for a simpler MultiPolygon with `permit_number` + `expiry_date`.

**Entry schema** (copy from lines 10–19):
```toml
[[places]]
slug        = "oak-creek-wildlife-area"
name        = "Oak Creek Wildlife Area"
land_owner  = "Washington Department of Fish & Wildlife"
geometry_wkt = """
MULTIPOLYGON (((…)))
"""
permits = [
  { issuing_authority = "Washington Department of Fish & Wildlife", type = "project-level" }
]
```

**Key conventions:**
- `slug`: lowercase `[a-z0-9-]`; derived from area name (planner decides exact form — see Discretion note in CONTEXT.md); **immutable after first publish**
- `name`: exact wildlife-area name as in `WLA_Name` field (WDFW GIS layer)
- `land_owner`: hardcoded `"Washington Department of Fish & Wildlife"` (D-02; note ampersand matches existing "US Fish & Wildlife Service" style)
- `geometry_wkt`: triple-quoted `MULTIPOLYGON` WKT from the curation script; always `MULTIPOLYGON` even for single-polygon areas (via `ST_Multi`)
- `permits`: optional; if populated use `{ issuing_authority = "Washington Department of Fish & Wildlife", type = "project-level" }`

---

## Shared Patterns

### Validation gate
**Source:** `data/places_validation.py` (read-only; not modified this phase)
**Apply to:** `content/places.toml` before any commit

Checks enforced (lines 44–106):
1. Slug regex `[a-z0-9-]`
2. No duplicate slugs
3. Permit fields `issuing_authority` + `type` present for each permit
4. WKT validity via `ST_GeomFromText`
5. WGS84 coordinate bounds (lon −180..180, lat −90..90)

Note: the former `ST_Overlaps` pairwise rejection (step 6) was **removed in Phase 160** (see docstring lines 13–16). The curation script must implement its own overlap pre-check instead.

### DuckDB spatial idioms
**Source:** RESEARCH.md §Code Examples (all verified against repo DuckDB 1.5.3)

| Operation | DuckDB expression |
|-----------|-------------------|
| Ingest GeoJSON feature | `ST_GeomFromGeoJSON(json_string)` |
| Dissolve group of polygons | `ST_Union_Agg(g)` in GROUP BY |
| Repair validity | `ST_MakeValid(g)` |
| Force MultiPolygon type | `ST_Multi(g)` |
| Simplify preserving topology | `ST_SimplifyPreserveTopology(g, tol)` |
| Emit WKT | `ST_AsText(g)` |
| Check validity | `ST_IsValid(g)` |
| Partial overlap test | `ST_Overlaps(a, b)` |

**Load spatial:** `con.execute("LOAD spatial")` — extension already installed in repo; no `INSTALL spatial` needed in pipeline, but safe to include in one-off script.

### Pipeline integration points (read-only context)
These files are unchanged this phase; the curation script only appends to `places.toml`.

| File | Role |
|------|------|
| `data/places_validation.py` | Sole validation gatekeeper; run after editing TOML |
| `data/places_load.py` | TOML → `geographies.places` table (slug, name, land_owner, geom) |
| `data/dbt/models/marts/occurrences.sql` | `ST_Within` assigns `place_slugs[]` to occurrences |
| `data/places_export.py` | Writes `public/data/places.geojson` + `places.json` |
| `data/run.py` | Pipeline orchestrator; STEPS order: places-validation → places-load → dbt-build → … → places-export → places-maps |

### Test commands
```bash
# Unit tests (keep green after TOML edit)
cd data && uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py

# Direct validation gate (run before committing TOML)
cd data && uv run python -c "from places_validation import validate_places_step; validate_places_step()"

# Full pipeline
cd data && uv run python run.py
```

## No Analog Found

None. Both artifacts have direct analogs in the codebase.

## Metadata

**Analog search scope:** `data/`, `content/places.toml`
**Files read:** `data/add_new_places.py`, `data/places_validation.py`, `content/places.toml` (header + first two entries)
**Pattern extraction date:** 2026-06-23
