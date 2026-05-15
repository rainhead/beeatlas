# Phase 93: Multi-Color SVG Map Generation - Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 1 modified (data/species_maps.py) + 1 integration point (data/run.py)
**Analogs found:** 1 / 1 (exact — extending the file itself)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/species_maps.py` | pipeline transform | batch, file-I/O | itself (existing `generate_species_maps`) | exact — extending same file |

## Pattern Assignments

### `data/species_maps.py` — new `generate_group_maps()` function

**Analog:** existing `generate_species_maps()` in the same file.

**Imports pattern** (`data/species_maps.py` lines 24–34):
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
```

**DB connection + own_con guard pattern** (lines 183–187):
```python
own_con = con is None
if own_con:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
```

**D-04 wipe-and-rewrite pattern** (lines 189–193):
```python
# D-04 — wipe-and-rewrite for idempotency.
maps_dir = ASSETS_DIR / "species-maps"
if maps_dir.exists():
    shutil.rmtree(maps_dir)
maps_dir.mkdir(parents=True)
```
Note: for Phase 93 the new function must NOT wipe `maps_dir` — that is owned by `generate_species_maps`. It only creates subdirectories (`genus/`, `subgenus/`, `tribe/`) under the already-recreated `maps_dir`. The wipe happens once, in `generate_species_maps`, before all map generation runs.

**County backdrop reuse pattern** (lines 196–197):
```python
county_geojsons = _load_county_geojsons(con)
backdrop = _build_county_backdrop(county_geojsons)
```

**species.parquet read pattern** (lines 201–214):
```python
species_parquet = ASSETS_DIR / "species.parquet"
if not species_parquet.exists():
    raise FileNotFoundError(
        f"{species_parquet} not found — run species-export STEP first"
    )

species_rows = con.execute(
    f"""
    SELECT canonical_name, slug
    FROM read_parquet('{species_parquet}')
    WHERE occurrence_count > 0
    ORDER BY canonical_name
    """
).fetchall()
```
For group maps, extend this query to also `SELECT genus, subgenus, tribe` to build group membership.

**occ_by_canon single-sweep pattern** (lines 218–234):
```python
occ_rows = con.execute(
    """
    SELECT canonical_name,
           CAST(decimal_longitude AS DOUBLE),
           CAST(decimal_latitude  AS DOUBLE)
    FROM ecdysis_data.occurrences
    WHERE canonical_name IS NOT NULL
      AND decimal_latitude IS NOT NULL AND decimal_latitude != ''
      AND decimal_longitude IS NOT NULL AND decimal_longitude != ''
    """
).fetchall()

occ_by_canon: dict[str, list[tuple[float, float]]] = defaultdict(list)
for canon, lon, lat in occ_rows:
    if lon is None or lat is None:
        continue
    occ_by_canon[canon].append((lon, lat))
```
Reuse `occ_by_canon` directly — pass it into `generate_group_maps()` to avoid a second DB sweep.

**`_write_species_svg` core pattern — circle emission + sorted attribs + mkdir** (lines 143–173):
```python
root = copy.deepcopy(backdrop)
clipped = 0
for lon, lat in points:
    if not _in_bbox(lon, lat):
        clipped += 1
        continue
    x, y = _project(lon, lat)
    ET.SubElement(
        root,
        f"{{{SVG_NS}}}circle",
        attrib={
            "class": "occ",
            "cx": f"{x:.2f}",
            "cy": f"{y:.2f}",
            "r": "2.5",
        },
    )
# Idempotency: sort attribute dicts so ET.tostring emits stable byte output.
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
out_path = out_dir / f"{slug}.svg"
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(
    ET.tostring(root, xml_declaration=True, encoding="unicode"),
    encoding="utf-8",
)
```
For multi-color maps: replace `"class": "occ"` with `"fill": hex_color` (per-element fill). Wrap per-species circles in a `<g fill="{hex}">` group or emit fill directly on each circle. Both are valid; `<g>` grouping is cleaner for readability. Do NOT use `class="occ"` for group maps — that would fight the shared CSS rule.

**Color assignment formula** (from D-01, no existing code — new logic):
```python
# Sort species alphabetically within group (D-01), then assign evenly-spaced HSL hues.
species_in_group = sorted(group_members, key=lambda c: c)  # canonical_name
n = len(species_in_group)
for i, canon in enumerate(species_in_group):
    hue = int(i * 360 / n)
    # HSL(hue, 70%, 50%) → hex conversion needed
    # Use colorsys.hls_to_rgb(hue/360, 0.5, 0.7) → (r, g, b) floats → hex string
```
`colorsys` is stdlib — no new dependency.

**MAP-04 clipped-count logging pattern** (lines 242–244):
```python
if clipped:
    # MAP-04 + Pitfall #5: log silently, NEVER raise.
    print(f"  species-maps/{slug}.svg: {clipped} points clipped")
    total_clipped += clipped
```

**Summary print pattern** (lines 247–250):
```python
total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
print(
    f"  species-maps/: {written:,} files, {total_size:,} bytes, "
    f"{total_clipped:,} total points clipped"
)
```

**finally / own_con close pattern** (lines 252–254):
```python
finally:
    if own_con:
        con.close()
```

---

### `data/run.py` — STEPS list integration

**Existing step line** (`data/run.py` line 88):
```python
("species-maps", generate_species_maps),
```

**Integration choice:** The new group-map generation should be merged into the existing `generate_species_maps` call rather than added as a separate STEPS entry. `run.py` already imports `from species_maps import main as generate_species_maps`. If kept as a single unified pipeline step, the `main()` function in `species_maps.py` calls both per-species and group generation, sharing a single DB connection and a single wipe of `species-maps/`. No import change in `run.py` needed.

If a separate STEPS entry is preferred, add after line 88:
```python
("species-maps-groups", generate_group_maps),
```
and add the corresponding import at `run.py` line 37.

---

## Shared Patterns

### Sorted attribute dict (idempotency)
**Source:** `data/species_maps.py` lines 164–166
**Apply to:** Every new SVG-emitting function in Phase 93
```python
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
```

### out_path.parent.mkdir (nested subdirs)
**Source:** `data/species_maps.py` line 168
**Apply to:** All new output paths (`genus/<G>.svg`, `subgenus/<G>/<S>.svg`, `tribe/<T>.svg`)
```python
out_path.parent.mkdir(parents=True, exist_ok=True)
```
`_write_species_svg` already does this, so reusing it or its logic covers the nested subgenus path automatically.

### MAP-04 — silent clip, never raise
**Source:** `data/species_maps.py` lines 242–244
**Apply to:** All per-group SVG writers; log per-group total, not per-species, to avoid log spam for large genera.

### FileNotFoundError guard for species.parquet
**Source:** `data/species_maps.py` lines 203–206
**Apply to:** `generate_group_maps()` (or the shared setup in `generate_species_maps` if unified).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| HSL→hex color helper | utility | transform | No color math exists in the codebase; use stdlib `colorsys.hls_to_rgb` |

---

## Key Observations for Planner

1. **Single wipe:** `shutil.rmtree(maps_dir)` must run exactly once per pipeline run, before any SVG is written. If group-map generation is a separate function called after `generate_species_maps`, it must NOT wipe again — the directory is already clean and contains the per-species SVGs.

2. **Shared `occ_by_canon`:** The occurrences sweep is the most expensive query. Pass the already-built `occ_by_canon` dict into the group-map function rather than querying again. This implies either (a) one unified `generate_species_maps()` that does both, or (b) `generate_group_maps(con, occ_by_canon, backdrop, county_geojsons)` called from within the unified entry point.

3. **Subgenus null guard:** Filter out rows where `subgenus IS NULL OR subgenus = ''` in the parquet query before building the subgenus group map. The CONTEXT decision explicitly requires this.

4. **D-02 coordination:** Alphabetical sort by `canonical_name` within each group is the canonical ordering. This must be documented/commented in the new function so Phase 94's Eleventy template can match it without guesswork.

5. **`colorsys.hls_to_rgb` argument order:** Python's `colorsys` uses HLS (hue, lightness, saturation) not HSL. Call as `colorsys.hls_to_rgb(hue/360, 0.5, 0.7)` → (r, g, b) floats in [0,1] → `'#{:02x}{:02x}{:02x}'.format(int(r*255), int(g*255), int(b*255))`.

## Metadata

**Analog search scope:** `data/` directory
**Files scanned:** `data/species_maps.py` (266 lines, full read), `data/run.py` (111 lines, full read), `data/species_export.py` lines 55–74
**Pattern extraction date:** 2026-05-15
