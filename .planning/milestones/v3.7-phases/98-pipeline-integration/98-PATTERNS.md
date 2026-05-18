# Phase 98: Pipeline Integration - Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/places_load.py` | pipeline step | CRUD (TOML→DuckDB) | `data/geographies_pipeline.py` + `data/places_validation.py` | role-match |
| `data/dbt/models/marts/occurrences.sql` | dbt mart | transform/spatial join | self (existing county/eco CTE pattern) | exact |
| `data/dbt/models/marts/schema.yml` | config | — | self (existing 30-col contract) | exact |
| `data/dbt/models/sources.yml` | config | — | self (existing geographies source block) | exact |
| `data/places_export.py` | pipeline step | batch (DuckDB→JSON/GeoJSON) | `data/species_export.py` | role-match |
| `data/places_maps.py` | pipeline step | batch (DuckDB→SVG) | `data/species_maps.py` | exact |
| `data/run.py` | orchestrator | — | self (existing STEPS list) | exact |
| `.gitignore` | config | — | self (existing `/public/data/` block) | exact |
| `public/data/places.geojson` | artifact | — | `public/data/counties.geojson` (pattern) | role-match |
| `public/data/places.json` | artifact | — | `public/data/species.json` (pattern) | role-match |
| `data/tests/test_places_load.py` | test | — | `data/tests/test_places_validation.py` | exact |
| `data/tests/test_places_export.py` | test | — | `data/tests/test_species_export.py` | role-match |
| `data/tests/test_places_maps.py` | test | — | `data/tests/test_species_maps.py` | exact |

---

## Pattern Assignments

### `data/places_load.py` (pipeline step, CRUD)

**Analogs:**
- `data/geographies_pipeline.py` — `CREATE OR REPLACE TABLE geographies.*` + DuckDB connect pattern
- `data/places_validation.py` — `LOAD spatial` (not INSTALL), TOML loading, zero-arg step wrapper

**CRITICAL DIVERGENCE from geographies_pipeline.py:**
- `geographies_pipeline.py` line 99 uses `"INSTALL spatial; LOAD spatial;"` — do NOT copy this.
- `places_load.py` must use `"LOAD spatial"` only, per decision 97-01. Follow `places_validation.py` line 57.

**DB_PATH pattern** (`geographies_pipeline.py` lines 27-28, `places_validation.py` uses in-memory):
```python
import os
from pathlib import Path
import duckdb
import tomllib

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

**TOML loading pattern** (`places_validation.py` lines 32-35):
```python
toml_path = Path(toml_path)
with open(toml_path, "rb") as f:
    data = tomllib.load(f)
places = data.get("places", [])
```

**CREATE OR REPLACE TABLE pattern** (`geographies_pipeline.py` lines 120-124, adapted):
```python
con = duckdb.connect(DB_PATH)
con.execute("LOAD spatial")
con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
con.execute("""
    CREATE OR REPLACE TABLE geographies.places (
        slug VARCHAR,
        name VARCHAR,
        land_owner VARCHAR,
        geom GEOMETRY
    )
""")
for p in places:
    con.execute(
        "INSERT INTO geographies.places VALUES (?, ?, ?, ST_GeomFromText(?))",
        [p["slug"], p["name"], p["land_owner"], p["geometry_wkt"].strip()],
    )
print(f"  geographies.places: {len(places)} row(s) loaded")
con.close()
```

**Step wrapper pattern** (`places_validation.py` lines 121-128, `run.py` line 41):
```python
def load_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    toml_path = Path(__file__).parent.parent / "content" / "places.toml"
    load_places(toml_path)
```

**Print pattern** (`geographies_pipeline.py` line 115, all pipeline steps):
```python
print(f"  geographies.places: {len(places)} row(s) loaded")  # noqa: T201
```

---

### `data/dbt/models/marts/occurrences.sql` (dbt mart, spatial join modification)

**Analog:** self — existing county/ecoregion CTE pattern in the same file

**Current file structure** (`occurrences.sql` lines 26-83):
- CTEs: `joined`, `occ_pt`, `wa_counties`, `wa_eco`, `with_county`, `county_fallback`, `final_county`, `with_eco`, `eco_dedup`, `eco_fallback`, `final_eco`
- Final SELECT references `fc.county, fe.ecoregion_l3` (lines 79)

**New CTEs to insert after `final_eco` and before the final SELECT:**

Source CTE (parallel to `wa_counties` at line 26, `wa_eco` at line 27):
```sql
wa_places AS (SELECT * FROM {{ source('geographies', 'places') }}),
```

Spatial join CTE (parallel to `with_eco` lines 47-50, but no fallback):
```sql
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    LEFT JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)
),
place_dedup AS (
    SELECT DISTINCT ON (_row_id) _row_id, place_slug
    FROM with_place
),
```
Note: `DISTINCT ON` follows `eco_dedup` pattern (line 52). No fallback CTE — `place_slug IS NULL` is correct for occurrences outside all named places.

**Final SELECT addition** (lines 80-83 currently, add after `fe.ecoregion_l3`):
```sql
-- in column list, append after fe.ecoregion_l3:
    fp.place_slug
-- in JOIN clause, append after JOIN final_eco:
LEFT JOIN place_dedup fp ON fp._row_id = j._row_id
```

**CRITICAL:** Use `LEFT JOIN place_dedup` (not `JOIN`). The existing `JOIN final_county` (line 81) works because county has a fallback; places have no fallback. Using `JOIN` would silently drop all occurrences outside any place polygon.

---

### `data/dbt/models/sources.yml` (config modification)

**Analog:** self — existing `geographies` source block (lines 31-37)

**Current `geographies` source block** (lines 31-37):
```yaml
  - name: geographies
    schema: geographies
    tables:
      - name: us_counties
      - name: us_states
      - name: ecoregions
```

**Addition:** append `- name: places` to the tables list:
```yaml
      - name: places          # ADD — geographies.places loaded by places_load.py
```

---

### `data/dbt/models/marts/schema.yml` (config modification, 30→31 columns)

**Analog:** self — column entry pattern in the `occurrences` model

**Column entry pattern** (lines 60-67, last two columns):
```yaml
      - name: is_provisional
        data_type: boolean
      - name: canonical_name
        data_type: varchar
      - name: county
        data_type: varchar
      - name: ecoregion_l3
        data_type: varchar
```

**Append after `ecoregion_l3`:**
```yaml
      - name: place_slug
        data_type: varchar
```

**CRITICAL:** Must be committed atomically with `occurrences.sql`. If schema.yml is updated but occurrences.sql is not (or vice versa), `dbt build` immediately fails the contract check.

---

### `data/places_export.py` (pipeline step, batch export)

**Analog:** `data/species_export.py` — env var pattern, ASSETS_DIR, DuckDB connection, JSON write

**ASSETS_DIR / DB_PATH pattern** (`species_export.py` lines 33-44):
```python
import json
import os
from pathlib import Path
import duckdb
import tomllib

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

**Read path for occurrences** — CRITICAL DIVERGENCE from `species_export.py`:
- `species_export.py` reads from `DBT_SANDBOX_DIR / 'occurrences.parquet'` (lines 116-121)
- `places_export.py` must read from `ASSETS_DIR / "occurrences.parquet"` (the copy made by `_run_dbt_build()` in `run.py` lines 70-73)
- Reason: `places-export` runs after `topology-postprocess` and `species-export`, by which time the sandbox copy is already in EXPORT_DIR. Reading from sandbox risks stale data.

**Parquet count query pattern** (`species_export.py` lines 218-227, adapted):
```python
occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
counts = con.execute(f"""
    SELECT
        place_slug,
        COUNT(CASE WHEN is_provisional = false OR is_provisional IS NULL THEN 1 END) AS specimen_count,
        COUNT(DISTINCT CASE WHEN sample_id IS NOT NULL THEN sample_id END) AS sample_count
    FROM read_parquet('{occurrences_parquet}')
    WHERE place_slug IS NOT NULL
    GROUP BY place_slug
""").fetchall()
count_by_slug = {row[0]: {"specimen_count": row[1], "sample_count": row[2]} for row in counts}
```

**GeoJSON write pattern** (adapted from `emit_feature_collection` macro structure):
```python
def _write_places_geojson(con, out_path: Path) -> None:
    rows = con.execute(
        "SELECT slug, ST_AsGeoJSON(geom) FROM geographies.places ORDER BY slug"
    ).fetchall()
    features = [
        {
            "type": "Feature",
            "properties": {"slug": slug},
            "geometry": json.loads(geom_json),
        }
        for slug, geom_json in rows
    ]
    fc = {"type": "FeatureCollection", "features": features}
    out_path.write_text(json.dumps(fc, separators=(',', ':')), encoding="utf-8")
```
Use `separators=(',', ':')` (compact, no spaces) — matches `counties.geojson` format, suitable for Mapbox source. Not `indent=2` (that is the `species.json` format).

**TOML metadata read for places.json** — read permits directly from TOML (not from DuckDB):
```python
toml_path = Path(__file__).parent.parent / "content" / "places.toml"
with open(toml_path, "rb") as f:
    data = tomllib.load(f)
places_meta = {p["slug"]: p for p in data.get("places", [])}
```

**places.json write pattern** (`species_export.py` lines 200-207, adapted):
```python
records = []
for slug, meta in sorted(places_meta.items()):
    c = count_by_slug.get(slug, {"specimen_count": 0, "sample_count": 0})
    records.append({
        "slug": slug,
        "name": meta["name"],
        "land_owner": meta["land_owner"],
        "permits": meta.get("permits", []),
        "specimen_count": c["specimen_count"],
        "sample_count": c["sample_count"],
    })
places_json_out = ASSETS_DIR / "places.json"
places_json_out.write_text(
    json.dumps(records, indent=2),
    encoding="utf-8",
)
print(f"  places.json: {len(records):,} places, {places_json_out.stat().st_size:,} bytes")  # noqa: T201
```

**Step wrapper pattern** (`run.py` lines 36-41):
```python
def main() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    export_places(con)
    con.close()

def export_places_step() -> None:
    main()
```

---

### `data/places_maps.py` (pipeline step, SVG generation)

**Analog:** `data/species_maps.py` — exact pattern; reuse helpers by importing them

**Module-level setup** (`species_maps.py` lines 37-55):
```python
import copy
import json
import os
import shutil
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
import duckdb
from config import STATE_FIPS

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

**Import helpers from species_maps** (species_maps.py private functions):
```python
from species_maps import (
    _load_county_geojsons,
    _build_county_backdrop,
    _in_bbox,
    _project,
    _write_species_svg,
)
```
These are private by naming convention but import is acceptable since `places_maps.py` is tightly coupled to the same SVG pattern.

**Output directory** — use `ASSETS_DIR / "place-maps"` (NOT `species-maps/`). Sharing the species-maps directory risks the wipe-and-rewrite in `generate_species_maps` clearing place SVGs. Do NOT wipe-and-rewrite for `place-maps/`; only create idempotently:
```python
maps_dir = ASSETS_DIR / "place-maps"
maps_dir.mkdir(parents=True, exist_ok=True)
```

**County backdrop pattern** (`species_maps.py` lines 386-387):
```python
county_geojsons = _load_county_geojsons(con)
backdrop = _build_county_backdrop(county_geojsons)
```

**Occurrence query pattern** (`species_maps.py` lines 415-423, adapted for place_slug):
```python
occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
if not occurrences_parquet.exists():
    raise FileNotFoundError(
        f"{occurrences_parquet} not found — run dbt before places-maps"
    )
occ_rows = con.execute(f"""
    SELECT place_slug, lon, lat
    FROM read_parquet('{occurrences_parquet}')
    WHERE place_slug IS NOT NULL AND lon IS NOT NULL AND lat IS NOT NULL
""").fetchall()
```

**Group-by-slug then write loop** (`species_maps.py` lines 424-440, adapted):
```python
by_slug: dict[str, list[tuple[float, float]]] = defaultdict(list)
for slug, lon, lat in occ_rows:
    by_slug[slug].append((lon, lat))

total_clipped = 0
for slug, points in sorted(by_slug.items()):
    clipped = _write_species_svg(slug, points, backdrop, maps_dir)
    if clipped:
        print(f"  place-maps/{slug}.svg: {clipped} points clipped")  # noqa: T201
    total_clipped += clipped
print(f"  place-maps/: {len(by_slug):,} files, {total_clipped:,} total points clipped")  # noqa: T201
```

**Byte-stability** is inherited from `_write_species_svg` lines 194-196:
```python
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
```
No additional work needed — `_write_species_svg` handles it.

---

### `data/run.py` (orchestrator modification)

**Analog:** self — STEPS list (lines 76-92) and import block (lines 27-41)

**Current STEPS order** (lines 76-92):
```python
STEPS: list[tuple[str, Callable]] = [
    ...
    ("places-validation", validate_places_step),
    ("dbt-build", _run_dbt_build),
    ("topology-postprocess", clean_region_topology),
    ("species-export", export_species_parquet),
    ("species-maps", generate_species_maps),
    ("feeds", generate_feeds),
]
```

**Required STEPS order after Phase 98:**
```python
    ("places-validation", validate_places_step),
    ("places-load", load_places_step),         # NEW — must be before dbt-build
    ("dbt-build", _run_dbt_build),
    ("topology-postprocess", clean_region_topology),
    ("species-export", export_species_parquet),
    ("species-maps", generate_species_maps),
    ("places-export", export_places_step),     # NEW — must be after dbt-build
    ("places-maps", generate_place_maps_step), # NEW — must be after dbt-build
    ("feeds", generate_feeds),
```

**Import pattern** (`run.py` lines 27-41, add two new imports):
```python
from places_load import load_places_step
from places_export import export_places_step
from places_maps import main as generate_place_maps_step
```

---

### `.gitignore` (config modification)

**Analog:** self — existing `/public/data/` block at line 141

**Current block** (lines 140-141):
```
*.parquet
/public/data/
```

**Addition** — append negation rules AFTER the blanket `/public/data/` line:
```
!/public/data/places.geojson
!/public/data/places.json
```

**CRITICAL:** Negation rules placed before `/public/data/` have no effect. Git processes rules top-to-bottom; the later blanket rule re-ignores them. The negations must come after line 141.

---

### `data/tests/test_places_load.py` (test, unit)

**Analog:** `data/tests/test_places_validation.py` — TOML helper + `duckdb.connect(":memory:")` pattern

**TOML test helper pattern** (`test_places_validation.py` lines 22-43):
```python
def write_toml(tmp_path: Path, places: list[dict]) -> Path:
    """Write a minimal TOML file with the given places list."""
    lines = []
    for p in places:
        lines.append("[[places]]")
        lines.append(f'slug = {p["slug"]!r}')
        lines.append(f'name = {p["name"]!r}')
        lines.append(f'land_owner = {p["land_owner"]!r}')
        lines.append(f'geometry_wkt = {p["geometry_wkt"]!r}')
        # permits omitted for load tests — not stored in DuckDB
        lines.append("")
    path = tmp_path / "places.toml"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
```

**Test pattern** — call `load_places(toml_path, db_path)` against a temp DuckDB:
```python
import duckdb
import pytest
from pathlib import Path
from places_load import load_places

def test_load_creates_table(tmp_path):
    """load_places creates geographies.places with correct row count."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    load_places(toml_path, db_path)
    count = duckdb.connect(db_path).execute(
        "SELECT COUNT(*) FROM geographies.places"
    ).fetchone()[0]
    assert count == 1
```

**Geometry usability test pattern** (tests that `ST_Within` works):
```python
def test_places_geometry_usable(tmp_path):
    """geographies.places rows have valid GEOMETRY column (ST_Within works)."""
    toml_path = write_toml(tmp_path, [_VALID_PLACE])
    db_path = str(tmp_path / "test.duckdb")
    load_places(toml_path, db_path)
    con = duckdb.connect(db_path)
    con.execute("LOAD spatial")
    # Point known to be inside the test polygon
    result = con.execute("""
        SELECT slug FROM geographies.places
        WHERE ST_Within(ST_Point(-120.95, 47.05), geom)
    """).fetchone()
    assert result is not None
    assert result[0] == "test-place"
```

---

### `data/tests/test_places_export.py` (test, unit)

**Analog:** `data/tests/test_species_export.py` — `monkeypatch.setattr(module, 'ASSETS_DIR', tmp_path)` pattern

**Module-level monkeypatch pattern** (`test_species_export.py` lines 33-35):
```python
def test_places_geojson_structure(tmp_path, monkeypatch):
    import places_export as pe_mod
    monkeypatch.setattr(pe_mod, 'ASSETS_DIR', tmp_path)
    # ... set up DuckDB in-memory with geographies.places ...
    # call export function
    # assert output file structure
```

**GeoJSON structure assertion pattern:**
```python
    import json
    out = tmp_path / "places.geojson"
    assert out.exists()
    fc = json.loads(out.read_text())
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1
    feat = fc["features"][0]
    assert feat["type"] == "Feature"
    assert "slug" in feat["properties"]
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
```

**places.json structure assertion pattern:**
```python
    records = json.loads((tmp_path / "places.json").read_text())
    assert isinstance(records, list)
    assert len(records) == 1
    r = records[0]
    assert {"slug", "name", "land_owner", "permits", "specimen_count", "sample_count"} <= r.keys()
```

---

### `data/tests/test_places_maps.py` (test, unit)

**Analog:** `data/tests/test_species_maps.py` — `_write_species_svg` call + SVG parse pattern

**SVG file existence pattern** (`test_species_maps.py` lines 25-34):
```python
import xml.etree.ElementTree as ET
from places_maps import generate_place_maps   # or import _write_species_svg from species_maps

def test_place_svg_files_exist(tmp_path):
    """Per-place SVG files exist for each slug from places.toml."""
    maps_dir = tmp_path / "place-maps"
    maps_dir.mkdir()
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    _write_species_svg("rattlesnake-ledge", [((-120.95, 47.05))], backdrop, maps_dir)
    assert (maps_dir / "rattlesnake-ledge.svg").exists()
```

**Byte-stability test pattern** (`test_species_maps.py` pattern, run _write_species_svg twice):
```python
def test_place_svg_byte_stable(tmp_path):
    """Per-place SVG files are byte-stable across two runs."""
    maps_dir = tmp_path / "place-maps"
    maps_dir.mkdir()
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    points = [(-120.95, 47.05), (-120.90, 47.08)]
    _write_species_svg("test-place", points, backdrop, maps_dir)
    content_a = (maps_dir / "test-place.svg").read_text()
    _write_species_svg("test-place", points, backdrop, maps_dir)
    content_b = (maps_dir / "test-place.svg").read_text()
    assert content_a == content_b, "SVG output must be byte-stable across runs"
```

---

## Shared Patterns

### DuckDB Connection + LOAD spatial
**Source:** `data/places_validation.py` lines 55-57
**Apply to:** `places_load.py`, `places_export.py`, `places_maps.py`
```python
con = duckdb.connect(DB_PATH)   # or ":memory:" for tests
con.execute("LOAD spatial")     # NOT "INSTALL spatial; LOAD spatial;" — decision 97-01
```

### Step Wrapper (zero-arg callable for STEPS list)
**Source:** `data/places_validation.py` lines 121-128
**Apply to:** `places_load.py`, `places_export.py`, `places_maps.py`
```python
def <name>_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    <main_function>()
```
The STEPS entry: `("<step-name>", <name>_step)`

### print() with `# noqa: T201`
**Source:** `data/geographies_pipeline.py` line 55, `species_maps.py` lines 438, 444
**Apply to:** all pipeline step files
```python
print(f"  <step>: {count:,} ...")  # noqa: T201
```

### ASSETS_DIR / EXPORT_DIR env var
**Source:** `data/species_export.py` lines 34-35, `data/species_maps.py` lines 38-39
**Apply to:** `places_export.py`, `places_maps.py`
```python
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

### Parquet existence guard before read
**Source:** `data/species_maps.py` lines 411-414
**Apply to:** `places_export.py`, `places_maps.py`
```python
occurrences_parquet = ASSETS_DIR / "occurrences.parquet"
if not occurrences_parquet.exists():
    raise FileNotFoundError(
        f"{occurrences_parquet} not found — run dbt before <step-name>"
    )
```

### FileNotFoundError (not RuntimeError or SystemExit)
**Source:** `data/species_maps.py` lines 278-281, 393-395
**Apply to:** all pipeline step files that read prerequisite files

### conftest.py fixture extension for geographies.places
**Source:** `data/tests/conftest.py` lines 19-38 (`_create_tables`) and 156-178 (`_seed_data`)
**Apply to:** `data/tests/conftest.py` extension (not a new file — extend `_create_tables` and `_seed_data`)
```python
# In _create_tables, add:
con.execute("""
    CREATE TABLE geographies.places (
        slug VARCHAR,
        name VARCHAR,
        land_owner VARCHAR,
        geom GEOMETRY
    )
""")

# In _seed_data, add a polygon that contains the canonical test coordinate (lat=47.608, lon=-120.912):
con.execute("""
    INSERT INTO geographies.places VALUES (
        'test-place', 'Test Place', 'DNR',
        ST_GeomFromText('POLYGON((-121.1 47.5, -120.7 47.5, -120.7 47.8, -121.1 47.8, -121.1 47.5))')
    )
""")
```
This polygon covers lat=47.608, lon=-120.912 (the Ecdysis test specimen) AND lat=47.5, lon=-120.8 (the iNat test observation), enabling PPIPE-02 integration tests.

---

## No Analog Found

All files in this phase have analogs in the existing codebase. No entries in this section.

---

## Anti-Patterns (Copy With Care)

These patterns exist in the codebase but must NOT be copied for Phase 98:

| Anti-Pattern | Source Location | Correct Pattern |
|---|---|---|
| `"INSTALL spatial; LOAD spatial;"` | `geographies_pipeline.py` line 99 | `"LOAD spatial"` only (decision 97-01) |
| `county_fallback` / `eco_fallback` CTEs | `occurrences.sql` lines 33-65 | No fallback for places — NULL is correct |
| `JOIN final_county` (inner join) | `occurrences.sql` line 81 | `LEFT JOIN place_dedup` for places |
| `DBT_SANDBOX_DIR / 'occurrences.parquet'` | `species_export.py` lines 116-121 | `ASSETS_DIR / 'occurrences.parquet'` in places_export.py |
| wipe-and-rewrite `shutil.rmtree(maps_dir)` | `species_maps.py` lines 380-382 | `maps_dir.mkdir(parents=True, exist_ok=True)` for place-maps |

---

## Metadata

**Analog search scope:** `data/`, `data/dbt/models/`, `data/tests/`, `.gitignore`
**Files scanned:** 9 source files read in full
**Pattern extraction date:** 2026-05-17
