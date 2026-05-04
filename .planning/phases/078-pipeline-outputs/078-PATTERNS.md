# Phase 78: Pipeline Outputs — Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 8 (2 new modules, 2 new test files, 4 extensions)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/species_export.py` | service | CRUD (read DB → write parquet + JSON) | `data/export.py` | exact |
| `data/species_maps.py` | service | transform (read parquet + DB → write SVG files) | `data/feeds.py` | exact (ET XML idiom) |
| `data/tests/test_species_export.py` | test | batch | `data/tests/test_export.py` | exact |
| `data/tests/test_species_maps.py` | test | batch | `data/tests/test_export.py` | role-match |
| `data/run.py` (extension) | config/orchestrator | event-driven (step list) | `data/run.py` lines 39–51 | self-referential |
| `data/export.py` (extension) | service | CRUD | `data/export.py` lines 23–60 | self-referential |
| `scripts/validate-schema.mjs` (extension) | utility | request-response | `scripts/validate-schema.mjs` lines 22–41 | self-referential |
| `data/tests/conftest.py` (extension) | test | batch | `data/tests/conftest.py` lines 309–489 | self-referential |

---

## Pattern Assignments

### `data/species_export.py` (service, CRUD)

**Analog:** `data/export.py`

**Imports pattern** (`data/export.py` lines 1–21):
```python
import json
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```
`species_export.py` adds: `from feeds import _slugify` and `from collections import defaultdict`.

**DB connection + spatial extension pattern** (`data/export.py` lines 313–318):
```python
def main() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    export_occurrences_parquet(con)
    ...
    con.close()
```
`species_export.py::main()` opens in read-write mode (writes `canonical_name` to occurrences CTE), calls `export_species_parquet(con)` and friends.

**COPY TO PARQUET idiom** (`data/export.py` lines 26–258):
```python
def export_occurrences_parquet(con: duckdb.DuckDBPyConnection) -> None:
    out = str(ASSETS_DIR / "occurrences.parquet")
    con.execute(f"""
    COPY (
    WITH cte1 AS (
        ...
    )
    SELECT ...
    FROM ...
    ) TO '{out}' (FORMAT PARQUET, CODEC 'SNAPPY')
    """)
    # Verify: post-write assertion
    row = con.execute(f"SELECT COUNT(*) ... FROM read_parquet('{out}')").fetchone()
    print(f"  occurrences.parquet: {total:,} rows, ...")
    assert null_county == 0, ...
```
`species_export.py` uses this shape verbatim: `COPY (WITH ... SELECT ...) TO '{out}' (FORMAT PARQUET, CODEC 'SNAPPY')`.

**ST_AsGeoJSON + ST_SimplifyPreserveTopology pattern** (`data/export.py` lines 278–289):
```python
rows = con.execute("""
SELECT name AS NAME,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001))
FROM geographies.us_counties
WHERE state_fips = '53'
""").fetchall()
```
`species_export.py` / `species_maps.py` uses tolerance `0.005` (per MAP-03) instead of `0.001`.

**FULL OUTER + LEFT lineage query shape** (RESEARCH.md Pattern 1):
```sql
WITH occurrences_agg AS (
    SELECT canonical_name, COUNT(*) AS occurrence_count, ...
        list_value(
            SUM(CASE WHEN month::INT = 1  THEN 1 ELSE 0 END),
            ...
            SUM(CASE WHEN month::INT = 12 THEN 1 ELSE 0 END)
        )::INTEGER[12] AS month_histogram
    FROM ecdysis_data.occurrences
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
name_to_taxon AS (
    SELECT lower(trim(taxon__name)) AS canonical_name, MIN(taxon__id) AS taxon_id
    FROM inaturalist_waba_data.observations
    WHERE taxon__id IS NOT NULL AND taxon__rank = 'species'
    GROUP BY lower(trim(taxon__name))
),
species_universe AS (
    SELECT
        COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
        COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
        c.scientificName IS NOT NULL AS on_checklist,
        COALESCE(c.family, tle.family) AS family,
        COALESCE(c.genus, tle.genus, split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 1)) AS genus,
        ...
    FROM checklist_data.species c
    FULL OUTER JOIN occurrences_agg oa ON oa.canonical_name = c.canonical_name
    LEFT JOIN name_to_taxon n ON n.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = n.taxon_id
)
SELECT * FROM species_universe ORDER BY canonical_name
```
Slug computation happens in Python AFTER the fetch — never inside SQL.

**`_slugify` import and application** (`data/feeds.py` lines 132–148):
```python
# In species_export.py — import the function; do NOT duplicate it
from feeds import _slugify

# After fetching rows from DuckDB, add slug column in Python:
rows = con.execute("SELECT * FROM species_universe").fetchall()
species_rows = [dict(zip(col_names, row)) for row in rows]
for r in species_rows:
    r['slug'] = _slugify(r['scientificName'])
```
`_slugify` must never be redefined; always `from feeds import _slugify`.

**`seasonality.json` emission pattern** (RESEARCH.md Pattern 3):
```python
import json
from collections import defaultdict

seasonality: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0]*12))

rows = con.execute("""
    SELECT canonical_name, county, ecoregion_l3, month::INT - 1 AS m_idx
    FROM read_parquet(?)
    WHERE canonical_name IS NOT NULL AND month IS NOT NULL
""", [str(ASSETS_DIR / "occurrences.parquet")]).fetchall()

for canon, county, eco, m in rows:
    if m is None or not (0 <= m < 12):
        continue
    seasonality[canon]["_total"][m] += 1
    if county:
        seasonality[canon][f"county:{county}"][m] += 1
    if eco:
        seasonality[canon][f"ecoregion_l3:{eco}"][m] += 1

out = {k: dict(sorted(v.items())) for k, v in sorted(seasonality.items())}
(ASSETS_DIR / "seasonality.json").write_text(
    json.dumps(out, sort_keys=True, separators=(',', ':')),
    encoding='utf-8'
)
```

**Print-then-assert verify pattern** (`data/export.py` lines 262–273):
```python
row = con.execute(f"""
SELECT COUNT(*) AS total,
       SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county
FROM read_parquet('{out}')
""").fetchone()
total, null_county = row
print(f"  species.parquet: {total:,} rows, {(ASSETS_DIR / 'species.parquet').stat().st_size:,} bytes")
assert total > 0, "species.parquet must be non-empty"
```

---

### `data/species_maps.py` (service, transform)

**Analog:** `data/feeds.py` (ET XML emission + directory creation idiom)

**Imports pattern** (`data/feeds.py` lines 1–28 + RESEARCH.md Pattern 4):
```python
import copy
import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb

from feeds import _slugify  # NOT re-imported here; slug read from parquet

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace('', SVG_NS)
VIEWBOX = "0 0 600 320"
WA_BBOX = (-124.848974, 45.543541, -116.916071, 49.002072)  # (minlon, minlat, maxlon, maxlat)
```

**ET.register_namespace + ET.tostring pattern** (`data/feeds.py` lines 31, 122–124):
```python
ET.register_namespace('', ATOM_NS)
...
result = ET.tostring(feed, xml_declaration=True, encoding='unicode')
out_path.write_text(result, encoding='utf-8')
print(f"  feeds/{filename}: {len(rows):,} entries, {out_path.stat().st_size:,} bytes")
```
`species_maps.py` uses the same `ET.tostring(..., xml_declaration=True, encoding='unicode')` + `.write_text(..., encoding='utf-8')` sequence.

**Directory mkdir(parents=True) pattern** (`data/feeds.py` lines 120–121):
```python
out_path = out_dir / 'feeds' / filename
out_path.parent.mkdir(parents=True, exist_ok=True)
```

**SVG generation core** (RESEARCH.md Pattern 4 — `data/species_maps.py` planned shape):
```python
def _project(lon: float, lat: float) -> tuple[float, float]:
    minx, miny, maxx, maxy = WA_BBOX
    x = (lon - minx) / (maxx - minx) * 600.0
    y = 320.0 - (lat - miny) / (maxy - miny) * 320.0
    return x, y

def _in_bbox(lon: float, lat: float) -> bool:
    minx, miny, maxx, maxy = WA_BBOX
    return minx <= lon <= maxx and miny <= lat <= maxy

def _ring_to_path(coords: list[list[float]]) -> str:
    pts = [_project(lon, lat) for lon, lat in coords]
    head = f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"
    tail = "".join(f"L{x:.2f},{y:.2f}" for x, y in pts[1:])
    return head + tail + "Z"

def write_species_svg(slug: str, points: list[tuple[float, float]], backdrop: ET.Element, out_dir: Path) -> int:
    """Returns count of clipped points. Never raises on non-zero clip count."""
    root = copy.deepcopy(backdrop)
    pts_g = ET.SubElement(root, f"{{{SVG_NS}}}g", attrib={
        "fill": "#c44", "fill-opacity": "0.6", "stroke": "none",
    })
    clipped = 0
    for lon, lat in points:
        if not _in_bbox(lon, lat):
            clipped += 1
            continue
        x, y = _project(lon, lat)
        ET.SubElement(pts_g, f"{{{SVG_NS}}}circle", attrib={
            "cx": f"{x:.2f}", "cy": f"{y:.2f}", "r": "2.5",
        })
    out_path = out_dir / f"{slug}.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(ET.tostring(root, xml_declaration=True, encoding='unicode'), encoding='utf-8')
    return clipped
```

**Wipe-and-recreate directory (D-04):**
```python
import shutil
def generate_species_maps() -> None:
    maps_dir = ASSETS_DIR / "species-maps"
    if maps_dir.exists():
        shutil.rmtree(maps_dir)
    maps_dir.mkdir(parents=True)
    ...
```

**Off-bbox clip logging** (MAP-04 — silent + log, never raise):
```python
if clipped:
    print(f"  species-maps/{slug}.svg: {clipped} points clipped")
```

---

### `data/tests/test_species_export.py` (test, batch)

**Analog:** `data/tests/test_export.py`

**Test file structure** (`data/tests/test_export.py` lines 1–31):
```python
"""Integration tests for export.py functions.

Each test calls an export function with the fixture DuckDB connection and verifies
that the output has the correct schema and non-empty, valid data.
"""
import json
import duckdb
import species_export as export_mod

EXPECTED_SPECIES_COLS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'slug',
]
```

**Schema assertion pattern** (`data/tests/test_export.py` lines 38–50):
```python
def test_species_parquet_schema(fixture_con, export_dir, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)

    parquet_path = str(export_dir / 'species.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    for col in EXPECTED_SPECIES_COLS:
        assert col in actual_cols, f"Missing column: {col}"
```

**FULL OUTER fixture arm assertion** (AGG-07 — three-arm test):
```python
def test_species_full_outer_all_arms(fixture_con, export_dir, monkeypatch):
    """All three FULL OUTER arms appear: checklist-only, occurrence-only, matched."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    parquet_path = str(export_dir / 'species.parquet')

    rows = duckdb.execute(f"""
        SELECT on_checklist, occurrence_count
        FROM read_parquet('{parquet_path}')
        WHERE canonical_name = 'zzzzz nonexistensia'  -- occurrence-only (conftest LIN05-08)
    """).fetchall()
    assert len(rows) == 1
    assert rows[0][0] is False  # not on checklist
    assert rows[0][1] > 0       # has occurrences
```

**`monkeypatch.setattr(mod, 'ASSETS_DIR', export_dir)` is required on every test** — mirrors `test_export.py` lines 41, 57, etc.

---

### `data/tests/test_species_maps.py` (test, batch)

**Analog:** `data/tests/test_export.py` (structure); `data/tests/test_taxon_lineage_extended.py` (isolated fixture DB approach)

**SVG well-formedness assertion** (MAP-06):
```python
import xml.etree.ElementTree as ET

def test_species_map_svg_wellformed(fixture_con, export_dir, monkeypatch):
    monkeypatch.setattr(species_maps_mod, 'ASSETS_DIR', export_dir)
    species_maps_mod.generate_species_maps(fixture_con)

    # At least one SVG should exist for species with occurrences
    svgs = list((export_dir / 'species-maps').glob('*.svg'))
    assert len(svgs) > 0

    for svg_path in svgs:
        content = svg_path.read_text(encoding='utf-8')
        root = ET.fromstring(content)  # raises if not well-formed
        assert root.get('viewBox') == '0 0 600 320'
```

**Off-bbox clipping test** (Pitfall 5 — asserts clip counter increments, NOT that count is zero):
```python
def test_off_bbox_point_is_clipped_not_raised(fixture_con, export_dir, monkeypatch, capsys):
    """Off-WA-bbox occurrence is silently dropped; clipped count is printed, not raised."""
    # conftest extension adds one off-bbox occurrence for a test species
    monkeypatch.setattr(species_maps_mod, 'ASSETS_DIR', export_dir)
    species_maps_mod.generate_species_maps(fixture_con)
    captured = capsys.readouterr()
    assert "points clipped" in captured.out
```

---

### `data/run.py` extension (config/orchestrator, event-driven)

**Analog:** `data/run.py` lines 25–51 (self-referential)

**STEPS tuple format** (`data/run.py` lines 25–51):
```python
from species_export import export_species_parquet
from species_maps import generate_species_maps

STEPS: list[tuple[str, Callable]] = [
    ...
    ("export", export_all),
    ("species-export", export_species_parquet),   # INSERT AFTER export
    ("species-maps", generate_species_maps),       # INSERT BEFORE feeds
    ("feeds", generate_feeds),
]
```
Step names are kebab-case strings. Each callable takes zero arguments (module-level `main()` convention) OR is a bare function reference. Mirrors the existing pattern: `("taxon-lineage-extended", enrich_taxon_lineage_extended)` and `("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE))`.

**Runner loop** (`data/run.py` lines 104–118) — no changes needed:
```python
for name, fn in STEPS:
    print(f"--- {name} ---")
    step_start = time.monotonic()
    try:
        fn()
    except Exception:
        traceback.print_exc()
        raise
    elapsed = time.monotonic() - step_start
    print(f"--- {name} done in {elapsed:.1f}s ---")
```

---

### `data/export.py` extension (service, CRUD — Pitfall #6)

**Analog:** `data/export.py` lines 60–84 (ecdysis_base CTE)

**Materialized `canonical_name` column** — add one line to the `ecdysis_base` CTE SELECT and the final `SELECT` in `export_occurrences_parquet`:
```python
# In the ecdysis_base CTE (data/export.py ~line 60):
#   Add after the existing columns:
o.canonical_name,

# In the combined ARM 1 SELECT (data/export.py ~line 136):
#   Add to the explicit column list:
e.canonical_name,

# In ARM 2 (provisional, data/export.py ~line 162):
#   Add:
NULL AS canonical_name,

# In the final SELECT (data/export.py ~line 243):
j.canonical_name,
```
This follows the exact same pattern as every other column added to the FULL OUTER combined output.

---

### `scripts/validate-schema.mjs` extension (utility, request-response)

**Analog:** `scripts/validate-schema.mjs` lines 22–41 (EXPECTED map) and lines 50–80 (validation loop)

**EXPECTED entry extension** (`scripts/validate-schema.mjs` lines 22–41):
```js
const EXPECTED = {
  'occurrences.parquet': [
    // ... existing list unchanged ...
  ],
  'species.parquet': [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date',
    'month_histogram',   // LIST<INT32> in parquet — do NOT assert [12] suffix
    'county_count', 'ecoregion_count', 'slug',
  ],
};
```

**JSON shape check** — append AFTER the existing parquet loop (RESEARCH.md Pattern 5):
```js
// After the `if (failed)` block, add species.json shape check:
const speciesJsonPath = join(ASSETS_DIR, 'species.json');
if (useLocal && existsSync(speciesJsonPath)) {
  const speciesJson = JSON.parse(readFileSync(speciesJsonPath, 'utf-8'));
  if (!Array.isArray(speciesJson)) {
    console.error('x species.json: expected top-level array');
    failed = true;
  } else if (speciesJson.length > 0) {
    const required = ['scientificName', 'canonical_name', 'on_checklist', 'occurrence_count', 'slug'];
    const missing = required.filter(k => !(k in speciesJson[0]));
    if (missing.length) {
      console.error(`x species.json: row[0] missing keys: ${missing.join(', ')}`);
      failed = true;
    } else {
      console.log('ok species.json');
    }
  }
}
```

---

### `data/tests/conftest.py` extension (test, batch)

**Analog:** `data/tests/conftest.py` lines 309–489 (Phase 76/77 LIN-05 fixture blocks)

**Third FULL OUTER arm: occurrence-only species** (AGG-07 — the arm currently missing):
The LIN-05 block at lines 412–435 already seeds `zzzzz nonexistensia` (an occurrence-only species with no checklist row and no bridge entry). This species is the third FULL OUTER arm. Confirm it is present in `conftest.py` and document it as the canonical test case for occurrence-only species.

**Off-bbox occurrence point** (MAP-04 / Pitfall 5 — add one occurrence row):
```python
# In _seed_data() — add after the LIN-05 block:
# Off-bbox point for MAP-04 clipping test (lon=-117.5, lat=44.8 = eastern Oregon, outside WA)
con.execute("""
    INSERT INTO ecdysis_data.occurrences (
        id, scientific_name, canonical_name,
        decimal_latitude, decimal_longitude,
        year, month, event_date,
        _dlt_load_id, _dlt_id
    ) VALUES (
        'OFFBBOX-01', 'Andrena anograe', 'andrena anograe',
        '44.8', '-117.5',
        '2024', '5', '2024-05-10',
        'load-offbbox', 'off-1'
    )
""")
# No checklist row for andrena anograe — occurrence-only, off-WA bbox
```

**`export_dir` fixture already exists** (`data/tests/conftest.py` lines 538–540):
```python
@pytest.fixture
def export_dir(tmp_path):
    """Temporary directory for export output files."""
    return tmp_path
```
New tests for `species_export` and `species_maps` use this fixture directly — no duplication needed.

---

## Shared Patterns

### DB_PATH + ASSETS_DIR env-override pattern
**Source:** `data/export.py` lines 18–20; `data/feeds.py` lines 26–28
**Apply to:** `data/species_export.py`, `data/species_maps.py`
```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```
Tests override `ASSETS_DIR` via `monkeypatch.setattr(mod, 'ASSETS_DIR', export_dir)` — same pattern as `test_export.py`.

### Print progress + byte count pattern
**Source:** `data/export.py` lines 271, 289–290, 309–310; `data/feeds.py` lines 126–129
**Apply to:** Every output function in `species_export.py` and `species_maps.py`
```python
print(f"  {filename}: {count:,} rows, {out_path.stat().st_size:,} bytes")
```

### `monkeypatch.setattr(mod, 'ASSETS_DIR', export_dir)` test isolation
**Source:** `data/tests/test_export.py` lines 41, 57, 73, etc.
**Apply to:** Every test in `test_species_export.py` and `test_species_maps.py`
Always use `monkeypatch.setattr` (not env var patching) to redirect output; ensures parallel test isolation.

### `fixture_con` session-scoped DuckDB connection
**Source:** `data/tests/conftest.py` lines 492–510
**Apply to:** All tests in `test_species_export.py` and `test_species_maps.py`
```python
def test_foo(fixture_con, export_dir, monkeypatch):
    ...
```
The `fixture_con` is already seeded with all schemas, geographies, checklist rows, ecdysis occurrences, LIN-05 extended seeds, and `taxon_lineage_extended` rows needed for species aggregation. The conftest extension (off-bbox row) adds the final piece for MAP-04 tests.

### `sort_keys=True` in all `json.dumps` calls
**Source:** `data/feeds.py` line 315 (`json.dumps(entries, indent=2)`)
**Apply to:** All JSON emit calls in `species_export.py`
For idempotency across runs (Pitfall 6): `json.dumps(rows, sort_keys=True, indent=2)` for `species.json`; `json.dumps(out, sort_keys=True, separators=(',', ':'))` for `seasonality.json`.

### `ET.register_namespace` + `ET.tostring(xml_declaration=True, encoding='unicode')` write pattern
**Source:** `data/feeds.py` lines 31, 122–124
**Apply to:** `data/species_maps.py` SVG write
```python
ET.register_namespace('', SVG_NS)
...
result = ET.tostring(root, xml_declaration=True, encoding='unicode')
out_path.write_text(result, encoding='utf-8')
```

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Critical Invariants (not patterns — must NOT be violated)

| Invariant | Source | Risk if broken |
|---|---|---|
| `_slugify` must be IMPORTED from `feeds.py`, never redefined | `data/feeds.py` lines 132–148 | SVG filename / parquet `slug` / URL slug drift → silent 404 |
| `species_maps.py` reads `slug` from `species.parquet`; never recomputes from `scientificName` | RESEARCH.md Pitfall 3 | Same slug-drift risk as above |
| `("species-export", ...)` lands AFTER `("export", ...)` in STEPS | `data/run.py` lines 39–51 | `species_export.py` reads `occurrences.parquet` which export writes |
| `("species-maps", ...)` lands AFTER `("species-export", ...)` in STEPS | RESEARCH.md architecture | `species_maps.py` reads `species.parquet` (slug column) |
| Single `<style>` block with `.county`/`.occ` classes — no per-element `fill=`/`stroke=` attributes. `<img src=.svg>` blocks external CSS but honors inline `<style>` blocks. | D-03 + RESEARCH.md Pitfall 4 | Per-element styling bloats file size for high-occurrence species; missing `<style>` block renders un-styled in `<img>` mode |
| Off-WA bbox clipping is SILENT + logged — never raises | MAP-04 + RESEARCH.md Pitfall 5 | Build fails on first real production run |
| `canonical_name` must be added to `occurrences.parquet` before species aggregation | CONTEXT.md Specifics + RESEARCH.md Pitfall #6 | FULL OUTER join key is absent; all species → occurrence-only arm |

---

## Metadata

**Analog search scope:** `data/*.py`, `data/tests/*.py`, `scripts/validate-schema.mjs`
**Files scanned:** 14
**Pattern extraction date:** 2026-05-03
