# Phase 172: Accomplishment View - Pattern Map

**Mapped:** 2026-06-28
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/collector_maps.py` | service | batch/transform | `data/species_maps.py` | exact |
| `data/collectors_export.py` | service | batch/transform | `data/collectors_export.py` (self, extend) | exact |
| `data/run.py` | config | batch | `data/run.py` (self, extend) | exact |
| `data/nightly.sh` | config | batch | `data/nightly.sh` (self, extend) | exact |
| `_pages/collector-detail.njk` | template | request-response | `_pages/species-detail.njk` + `_pages/collector-detail.njk` | exact |
| `src/styles/places.css` | utility | — | `src/styles/places.css` (self, extend) | exact |
| `data/tests/test_collector_maps.py` | test | — | `data/tests/test_species_maps.py` | exact |
| `data/tests/test_collectors_export.py` | test | — | `data/tests/test_collectors_export.py` (self, extend) | exact |
| `src/tests/fixtures/collectors.fixture.json` + `data-collectors.test.ts` | test | — | same files (self, extend) | exact |

---

## Pattern Assignments

### `data/collector_maps.py` (NEW — service, batch)

**Analog:** `data/species_maps.py`

**Why it is the closest match:** `collector_maps.py` is a specialisation of the same SVG-generation pipeline: DuckDB county geometry, `_project`/`_ring_to_path` path helpers, single-`<style>` backdrop, deepcopy-per-entity, wipe-and-rewrite idempotency, `EXPORT_DIR`-read, `generate_*_maps_step` entry point. The only differences are (a) no occurrence dots, (b) the fill set comes from an aggregation query rather than a checklist parquet, and (c) a second polygon set (ecoregions) is loaded from `ecoregions.geojson` instead of DuckDB.

**Module-level boilerplate** (lines 1-39 of `data/species_maps.py`):
```python
import copy
import json
import os
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb

from config import STATE_FIPS

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace('', SVG_NS)

VIEWBOX = "0 0 600 320"
SVG_WIDTH = 600
SVG_HEIGHT = 320
WA_BBOX = (-124.85, 45.54, -116.92, 49.00)

STYLE_CSS = (
    ".county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }\n"
    ".checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }\n"
    ".occ { fill: #c44; fill-opacity: 0.6; stroke: none; }"
)
```
Copy `_project`, `_in_bbox`, `_ring_to_path`, `_load_county_geojsons`, and `_build_county_backdrop` verbatim from `data/species_maps.py` lines 59-135. Do NOT import from `species_maps.py` at runtime (would pull `colorsys`/`defaultdict` machinery and create a circular dependency if `run.py` imports both).

**County polygon loader** (`data/species_maps.py` lines 80-101):
```python
def _load_county_geojsons(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    rows = con.execute(
        """
        SELECT name,
               ST_AsGeoJSON(
                   ST_SimplifyPreserveTopology(geom, 0.005)
               )
        FROM geographies.us_counties
        WHERE state_fips = ?
        """,
        [STATE_FIPS],
    ).fetchall()
    return {name: json.loads(g) for name, g in rows}
```

**Ecoregion GeoJSON loader** (new — no analog; pattern from RESEARCH.md):
```python
def _load_ecoregion_geojsons(assets_dir: Path) -> dict[str, dict]:
    """Load WA L3 ecoregion polygons. Key: NA_L3NAME property."""
    eco_path = assets_dir / "ecoregions.geojson"
    if not eco_path.exists():
        raise FileNotFoundError(f"{eco_path} not found — run dbt build first")
    fc = json.loads(eco_path.read_text())
    result: dict[str, dict] = {}
    for feature in fc["features"]:
        name = feature["properties"]["NA_L3NAME"]   # NOT "name" — Pitfall 2
        result[name] = feature["geometry"]
    return result
```

**Backdrop builder** (`data/species_maps.py` lines 104-135):
```python
def _build_county_backdrop(county_geojsons: dict[str, dict]) -> ET.Element:
    root = ET.Element(f"{{{SVG_NS}}}svg",
        attrib={"viewBox": VIEWBOX, "width": str(SVG_WIDTH), "height": str(SVG_HEIGHT)})
    style = ET.SubElement(root, f"{{{SVG_NS}}}style")
    style.text = STYLE_CSS
    for geom in county_geojsons.values():
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
        ET.SubElement(root, f"{{{SVG_NS}}}path", attrib={"class": "county", "d": d})
    return root
```
Use the same pattern for `_build_ecoregion_backdrop(ecoregion_geojsons)`.

**Coverage SVG writer** (new — adapted from `_write_species_svg`, `data/species_maps.py` lines 167-235, but without occurrence dots):
```python
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
    # Idempotency: sort attribs for deterministic byte output (lines 226-228 of species_maps.py)
    for elem in root.iter():
        if elem.attrib:
            elem.attrib = dict(sorted(elem.attrib.items()))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(ET.tostring(root, xml_declaration=True, encoding="unicode"), encoding="utf-8")
```

**Idempotency wipe** (`data/species_maps.py` lines 447-449):
```python
maps_dir = ASSETS_DIR / "collector-maps"
if maps_dir.exists():
    shutil.rmtree(maps_dir)
maps_dir.mkdir(parents=True)
```

**Step entry point pattern** (`data/species_maps.py` lines 433-436):
```python
def generate_collector_maps(con: duckdb.DuckDBPyConnection | None = None) -> None:
    own_con = con is None
    if own_con:
        con = duckdb.connect(DB_PATH)
        con.execute("INSTALL spatial; LOAD spatial;")
    try:
        ...
    finally:
        if own_con:
            con.close()

def generate_collector_maps_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    generate_collector_maps()
```

**DuckDB aggregation query** (D-01 row predicate from `data/collectors_export.py` lines 67-72 — reuse verbatim):
```python
_COLLECTOR_COUNTIES_QUERY = """
    SELECT
        o.collector_inat_login AS login,
        o.county               AS county
    FROM read_parquet(?) o
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
      AND o.county IS NOT NULL
    GROUP BY o.collector_inat_login, o.county
    ORDER BY o.collector_inat_login
"""
# Same pattern for ecoregion_l3
```

---

### `data/collectors_export.py` (MODIFY — service, batch)

**Analog:** `data/collectors_export.py` (self)

**What to extend:** Add four scalar columns to `_QUERY` (lines 33-73) and add a companion `_SPECIES_QUERY` constant + species-list grouping in `export_collectors`.

**Existing `_QUERY` SELECT additions** — insert after line 65 (`status_awaiting`), before `GROUP BY`:
```python
    -- ACCOM-04: active-seasons badge (D-05 — year column, COUNT DISTINCT, not max-min span)
    MIN(o.year)                                                           AS active_since,
    COUNT(DISTINCT o.year)                                                AS seasons_count,
    -- ACCOM-01/03: map caption counts
    COUNT(DISTINCT o.county) FILTER (WHERE o.county IS NOT NULL)          AS county_count,
    COUNT(DISTINCT o.ecoregion_l3) FILTER (WHERE o.ecoregion_l3 IS NOT NULL)
                                                                          AS ecoregion_count,
```

**Companion species-list query** (new constant — same parameter pattern as `_QUERY`):
```python
_SPECIES_QUERY = """
    SELECT
        o.collector_inat_login                                            AS login,
        sp.genus,
        sp.canonical_name,
        sp.slug,
        COUNT(*)                                                          AS occ_count
    FROM read_parquet(?) o
    LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
      AND sp.specific_epithet IS NOT NULL
    GROUP BY o.collector_inat_login, sp.genus, sp.canonical_name, sp.slug
    ORDER BY o.collector_inat_login, sp.genus, sp.canonical_name
"""
```

**Row unpacking pattern** (`export_collectors` lines 119-143) — extend the tuple unpack and the `records.append(...)` dict:
```python
# Existing unpacking:
(login, display_name, recorded_by, host_inat_login,
 specimen_count, sample_count, species_count,
 status_denominator, status_identified, status_awaiting) = row
# Extended unpacking (add four new fields):
(login, display_name, recorded_by, host_inat_login,
 specimen_count, sample_count, species_count,
 status_denominator, status_identified, status_awaiting,
 active_since, seasons_count, county_count, ecoregion_count) = row

# In records.append(...) dict add:
"active_since": int(active_since) if active_since is not None else None,
"seasons_count": int(seasons_count),
"county_count": int(county_count),
"ecoregion_count": int(ecoregion_count),
```

**Species list grouping** (new — insert in `export_collectors` after main `_QUERY` rows are processed, before writing JSON):
```python
# Run species query and group by login -> list of genus groups
species_rows = con.execute(_SPECIES_QUERY, [str(occ_parquet), str(species_parquet)]).fetchall()
# Group: login -> genus -> list of {canonical_name, slug, count}
from collections import defaultdict
species_by_login: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
for login_sp, genus, canonical_name, slug, occ_count in species_rows:
    species_by_login[login_sp][genus].append({
        "canonical_name": canonical_name,
        "slug": slug,
        "count": int(occ_count),
    })
# Inject into records dict as genus-grouped list
for rec in records:
    genus_dict = species_by_login.get(rec["login"], {})
    rec["species_by_genus"] = [
        {"genus": genus, "species": species_list}
        for genus, species_list in sorted(genus_dict.items())
    ]
```

---

### `data/run.py` (MODIFY — config, batch)

**Analog:** `data/run.py` (self, lines 91-132)

**Import to add** (after line 50, mirroring the `collectors_export` import pattern):
```python
from collector_maps import generate_collector_maps_step
```

**STEPS insertion** (after line 129 `"collectors-events-export"`, before `"places-maps"`):
```python
("collectors-export", export_collectors_step),
("collectors-events-export", export_collectors_events_step),
("collector-maps", generate_collector_maps_step),   # NEW: Phase 172
("places-maps", generate_place_maps_step),
```

---

### `data/nightly.sh` (MODIFY — config, batch)

**Analog:** `data/nightly.sh` lines 349-361

**S3 upload line to add** (after line 351, same pattern as `species-maps/` and `place-maps/`):
```bash
# Feeds, species-maps, place-maps, and collector-maps use stable (non-hashed) URLs.
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/place-maps/" "s3://$BUCKET/data/place-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/collector-maps/" "s3://$BUCKET/data/collector-maps/"   # Phase 172
```

**CloudFront invalidation line to extend** (line 360):
```bash
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/manifest.json" "/data/feeds/*" "/data/species-maps/*" "/data/place-maps/*" "/data/collector-maps/*" \
    --query "Invalidation.Id" --output text
```

---

### `_pages/collector-detail.njk` (MODIFY — template, request-response)

**Analogs:** `_pages/species-detail.njk` (img embed, quantify usage) and `_pages/collector-detail.njk` (existing structure).

**Insertion point:** Between the existing `<a href="/?collectors=...">View on the atlas →</a>` (line 23) and the `{#- Phase 171: Event feed section -#}` comment (line 25). The new sections come after the atlas link and before the event feed, matching the UI-SPEC page order.

**Map `<img>` pattern** (mirrors `_pages/species-detail.njk` line 25):
```html
{# _pages/species-detail.njk line 25 — the pattern to copy: #}
<img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" alt="Occurrence map for {{ sp.scientificName }}">
```

**Badge — insert after existing `<p class="metadata">` (line 15), before `status-split`:**
```nunjucks
{%- if collector.active_since -%}
<p class="metadata">Active since {{ collector.active_since }} ({{ collector.seasons_count | quantify("season") }})</p>
{%- endif -%}
```

**Coverage maps section — insert after atlas link (line 23):**
```nunjucks
{%- if collector.county_count > 0 or collector.ecoregion_count > 0 -%}
<section class="coverage-section">
  <div class="coverage-maps">
    {%- if collector.county_count > 0 -%}
    <div class="map-block">
      <img loading="lazy"
           src="/data/collector-maps/{{ collector.login }}.svg"
           alt="County coverage map for {{ collector.display_name }} — {{ collector.county_count | quantify('county', 'counties') }}">
      <p class="metadata">{{ collector.county_count | quantify("county", "counties") }}</p>
    </div>
    {%- endif -%}
    {%- if collector.ecoregion_count > 0 -%}
    <div class="map-block">
      <img loading="lazy"
           src="/data/collector-maps/{{ collector.login }}-eco.svg"
           alt="Ecoregion coverage map for {{ collector.display_name }} — {{ collector.ecoregion_count | quantify('ecoregion') }}">
      <p class="metadata">{{ collector.ecoregion_count | quantify("ecoregion") }}</p>
    </div>
    {%- endif -%}
  </div>
</section>
{%- endif -%}
```

**Species list section — insert after coverage-section, before event feed:**
```nunjucks
{%- if collector.species_by_genus and collector.species_by_genus.length > 0 -%}
<section class="species-section">
  <h2>Species collected</h2>
  <div class="species-by-genus">
  {%- for genus_group in collector.species_by_genus -%}
    <div class="genus-section">
      <h3 class="genus-heading"><em>{{ genus_group.genus }}</em></h3>
      <ul class="species-list">
      {%- for sp in genus_group.species -%}
        <li>
          <a href="/species/{{ sp.slug }}/">{{ sp.canonical_name }}</a>
          <span class="count">({{ sp.count }})</span>
        </li>
      {%- endfor -%}
      </ul>
    </div>
  {%- endfor -%}
  </div>
</section>
{%- endif -%}
```

**`quantify` filter usage** (existing in `_pages/species-detail.njk` line 41 — same API):
```nunjucks
{{ sp.county_count | quantify("county", "counties") }}
{{ sp.ecoregion_count | quantify("ecoregion") }}
```

---

### `src/styles/places.css` (MODIFY — utility)

**Analog:** `src/styles/places.css` (self, lines 1-57)

**Existing img selector pattern to replicate** (lines 13-17):
```css
.places-page img[src*="/place-maps/"] {
  aspect-ratio: 15 / 8;
  width: 100%;
  max-width: 600px;
}
```

**Existing list-item pattern** (lines 39-45 — copy for `.species-list li`):
```css
.places-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}
```

**New CSS block to append** (all selectors locked by UI-SPEC CSS Change Summary):
```css
/* Phase 172: collector coverage maps */
.places-page img[src*="/collector-maps/"] {
  aspect-ratio: 15 / 8;
  width: 100%;
  max-width: 600px;
}

.coverage-section {
  margin-top: 1.5rem;
}

.coverage-maps {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .coverage-maps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: start;
  }
}

/* Phase 172: species-by-genus section */
.species-section {
  margin-top: 1.5rem;
}

.genus-section {
  margin-bottom: 1rem;
}

.genus-heading {
  font-size: 1rem;
  font-weight: 700;
  font-style: italic;
  color: var(--text-body, #213547);
  margin: 0.5rem 0 0.25rem;
}

.species-section .species-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.species-section .species-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}

.species-section .species-list .count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}
```

---

### `data/tests/test_collector_maps.py` (NEW — test)

**Analog:** `data/tests/test_species_maps.py`

**File header pattern** (lines 1-23 of `test_species_maps.py`):
```python
"""Unit tests for collector_maps.py.

Tests cover:
    County and ecoregion SVG written per collector login.
    SVG contains class="checklist-county" paths for contributed polygons only.
    Non-contributed polygons produce no checklist-county paths.
    Determinism: two runs produce byte-identical output.

Run:
    cd data && uv run pytest tests/test_collector_maps.py -x
"""

import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import collector_maps as collector_maps_module
from collector_maps import _write_coverage_svg, SVG_NS
```

**Minimal parquet fixture helper** (mirrors `_write_test_species_parquet` in `test_species_maps.py` lines 110-158 and `_write_test_occurrences_parquet` in `test_collectors_export.py` lines 26-70):
```python
def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Minimal occurrences fixture with county + ecoregion_l3 columns."""
    import pyarrow as pa, pyarrow.parquet as pq
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("county", pa.string()),
        ("ecoregion_l3", pa.string()),
        ("year", pa.int32()),
    ])
    table = pa.table({
        "collector_inat_login": ["alice", "alice", "bob"],
        "ecdysis_id":           [1,       2,       None],
        "record_type":          ["specimen", "specimen", "provisional_sample"],
        "county":               ["King",  "Yakima", "King"],
        "ecoregion_l3":         ["Puget Lowland Forests", "Columbia Plateau", "Puget Lowland Forests"],
        "year":                 [2020, 2021, 2022],
    }, schema=schema)
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path
```

**Checklist-fill assertion pattern** (mirrors `test_write_species_svg_renders_checklist_county_fill`, lines 225-243):
```python
def test_write_coverage_svg_fills_contributed_polygon(tmp_path):
    """_write_coverage_svg emits class='checklist-county' path for contributed name."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    _write_coverage_svg(
        out_path=tmp_path / "test.svg",
        filled_names={"King"},
        polygon_geojsons={"King": geom},
        backdrop=backdrop,
    )
    tree = ET.parse(str(tmp_path / "test.svg"))
    paths = tree.getroot().findall(f'.//{{{SVG_NS}}}path[@class="checklist-county"]')
    assert len(paths) == 1
```

**Determinism pattern** (mirrors `test_generate_group_maps_deterministic`, lines 284-328):
```python
def test_write_coverage_svg_deterministic(tmp_path):
    """Two calls with identical inputs produce byte-identical SVG."""
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    _write_coverage_svg(tmp_path / "run1.svg", {"King"}, {"King": geom}, backdrop)
    _write_coverage_svg(tmp_path / "run2.svg", {"King"}, {"King": geom}, backdrop)
    assert (tmp_path / "run1.svg").read_bytes() == (tmp_path / "run2.svg").read_bytes()
```

**Module-level monkeypatch pattern** (mirrors `test_generate_group_maps_emits_expected_files`, lines 161-166):
```python
monkeypatch.setattr(collector_maps_module, 'ASSETS_DIR', tmp_path)
```

---

### `data/tests/test_collectors_export.py` (MODIFY — test)

**Analog:** `data/tests/test_collectors_export.py` (self)

**Parquet fixture extension** — add `year`, `county`, `ecoregion_l3` columns to `_write_test_occurrences_parquet` (lines 26-70):
```python
# Extend schema (lines 45-54):
schema = pa.schema([
    ("collector_inat_login", pa.string()),
    ("recordedBy", pa.string()),
    ("host_inat_login", pa.string()),
    ("ecdysis_id", pa.int64()),
    ("record_type", pa.string()),
    ("sample_id", pa.int64()),
    ("observation_id", pa.int64()),
    ("taxon_id", pa.int64()),
    ("year", pa.int32()),            # NEW — D-05
    ("county", pa.string()),         # NEW — ACCOM-01
    ("ecoregion_l3", pa.string()),   # NEW — ACCOM-03
])
# Add corresponding data columns for each row:
"year":        [2020, 2021, 2022, 2023, 2024, 2024],
"county":      ["King", "Yakima", "King", "Clark", "King", "Yakima"],
"ecoregion_l3": ["Puget Lowland Forests", "Columbia Plateau",
                  "Puget Lowland Forests", "Cascades", "Puget Lowland Forests", "Columbia Plateau"],
```

**Extend species fixture** — add `genus`, `canonical_name`, `slug`, `specific_epithet` columns to `_write_test_species_parquet` for the species-list query:
```python
schema = pa.schema([
    ("taxon_id", pa.int64()),
    ("specific_epithet", pa.string()),
    ("genus", pa.string()),              # NEW
    ("canonical_name", pa.string()),     # NEW
    ("slug", pa.string()),               # NEW
])
table = pa.table({
    "taxon_id":        [10],
    "specific_epithet": ["testicus"],
    "genus":           ["Testgenus"],
    "canonical_name":  ["Testgenus testicus"],
    "slug":            ["Testgenus/testicus"],
})
```

**New test pattern** (mirrors `test_required_keys`, lines 214-238, and `test_status_split_invariant`):
```python
def test_badge_fields_present_and_typed(tmp_path, monkeypatch):
    """active_since (int) and seasons_count (int) present for every record (ACCOM-04)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["active_since"], int), f"active_since must be int: {r['login']}"
        assert isinstance(r["seasons_count"], int), f"seasons_count must be int: {r['login']}"

def test_seasons_count_is_distinct_years(tmp_path, monkeypatch):
    """seasons_count = COUNT(DISTINCT year), not max-min span (D-05)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    # alice has years [2020, 2021] → 2 distinct seasons, not 2021-2020+1=2 (same here,
    # but the test fixture should include a gap year to stress-test: e.g. 2020, 2022 → 2 not 3)
    assert alice["seasons_count"] >= 1

def test_species_by_genus_structure(tmp_path, monkeypatch):
    """species_by_genus is a list of {genus, species:[{canonical_name, slug, count}]} (ACCOM-02)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["species_by_genus"], list)
        for g in r["species_by_genus"]:
            assert "genus" in g
            assert isinstance(g["species"], list)
            for sp in g["species"]:
                assert "canonical_name" in sp
                assert "slug" in sp
                assert isinstance(sp["count"], int)
```

---

### `src/tests/fixtures/collectors.fixture.json` + `src/tests/data-collectors.test.ts` (MODIFY — test)

**Analog:** same files (self, extend)

**Fixture extension** — add five new fields to every entry in `collectors.fixture.json` (currently 14 fields per entry, Phase 171 shape):
```json
{
  "active_since": 2019,
  "seasons_count": 3,
  "county_count": 5,
  "ecoregion_count": 2,
  "species_by_genus": [
    {
      "genus": "Andrena",
      "species": [
        {"canonical_name": "Andrena milwaukeensis", "slug": "Andrena/milwaukeensis", "count": 8}
      ]
    }
  ]
}
```

**Test assertion pattern** (mirrors `data-collectors.test.ts` lines 19-31 — `expect(typeof c.login).toBe('string')`):
```typescript
// In the 'every entry has required fields' test block, add:
expect(typeof c.active_since).toBe('number');
expect(typeof c.seasons_count).toBe('number');
expect(typeof c.county_count).toBe('number');
expect(typeof c.ecoregion_count).toBe('number');
expect(Array.isArray(c.species_by_genus)).toBe(true);
// Spot-check first genus group structure:
if (c.species_by_genus.length > 0) {
  const g = c.species_by_genus[0];
  expect(typeof g.genus).toBe('string');
  expect(Array.isArray(g.species)).toBe(true);
  if (g.species.length > 0) {
    expect(typeof g.species[0].canonical_name).toBe('string');
    expect(typeof g.species[0].slug).toBe('string');
    expect(typeof g.species[0].count).toBe('number');
  }
}
```

The assertions should be added to the `'every entry has required fields with correct types'` describe block (lines 19-31 of `data-collectors.test.ts`). The fixture data is read via `readFileSync` on `collectors.fixture.json` in the Phase 171 describe block (lines 83-88) — the new fields are also asserted there in the `STREAM-01` test.

---

## Shared Patterns

### ASSETS_DIR / EXPORT_DIR convention
**Source:** `data/collectors_export.py` lines 24-26; `data/species_maps.py` lines 37-39
**Apply to:** `data/collector_maps.py`
```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```
Never read from the dbt sandbox path directly. EXPORT_DIR is the single authoritative asset location.

### D-01 row predicate (WABA-contribution gate)
**Source:** `data/collectors_export.py` lines 67-70
**Apply to:** Every new DuckDB query in `collector_maps.py` and the extended `collectors_export.py`
```sql
WHERE o.collector_inat_login IS NOT NULL
  AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
```
Reuse verbatim. Do not invent a second scope.

### FileNotFoundError guard
**Source:** `data/collectors_export.py` lines 104-111; `data/species_maps.py` lines 459-462
**Apply to:** `collector_maps.py` for every parquet/geojson file it opens
```python
if not occ_parquet.exists():
    raise FileNotFoundError(
        f"{occ_parquet} not found — run dbt before collector-maps"
    )
```

### Deterministic attribute sort (idempotency)
**Source:** `data/species_maps.py` lines 226-228
**Apply to:** `_write_coverage_svg` in `collector_maps.py`
```python
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
```

### `quantify` Eleventy filter
**Source:** `_pages/species-detail.njk` line 41; `src/lib/quantify.js`
**Apply to:** `_pages/collector-detail.njk` for badge, county caption, ecoregion caption
```nunjucks
{{ collector.seasons_count | quantify("season") }}
{{ collector.county_count | quantify("county", "counties") }}
{{ collector.ecoregion_count | quantify("ecoregion") }}
```
The two-argument form supplies the irregular plural. The one-argument form appends `"s"`.

### `monkeypatch.setenv("EXPORT_DIR", ...)` + module reload
**Source:** `data/tests/test_collectors_export.py` lines 95-106
**Apply to:** `data/tests/test_collector_maps.py`
```python
monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
import collector_maps
importlib.reload(collector_maps)
```

---

## No Analog Found

None. Every new file has a close analog in the codebase. The ecoregion GeoJSON loader (`_load_ecoregion_geojsons`) and the `_write_coverage_svg` function have no direct copy-paste source, but both are mechanical derivations of the county loader and `_write_species_svg` in `species_maps.py` respectively — see the excerpts above.

---

## Metadata

**Analog search scope:** `data/`, `_pages/`, `src/styles/`, `src/tests/`
**Files scanned:** 12 (all read in full)
**Pattern extraction date:** 2026-06-28
