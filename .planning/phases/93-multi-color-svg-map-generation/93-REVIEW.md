---
phase: 93
status: findings
depth: standard
reviewed_files:
  - data/species_maps.py
  - data/tests/test_species_maps.py
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
---

# Phase 93: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** findings

## Summary

Phase 93 adds `_group_colors`, `_write_group_svg`, and `_generate_group_maps` to `data/species_maps.py`, and expands the test suite. The core SVG-writing logic is sound, the determinism story is solid, and the null/empty-string guard for subgenus is correct. Four issues warrant attention before this ships.

## Critical Issues

### CR-01: SQL injection via f-string path interpolation in `_generate_group_maps`

**File:** `data/species_maps.py:283-290`
**Issue:** `_generate_group_maps` constructs a DuckDB query with an f-string that interpolates `species_parquet` (a `Path` derived from `ASSETS_DIR`, which is itself taken from the `EXPORT_DIR` environment variable). If an attacker controls the deployment environment variable, they can inject arbitrary SQL. The same pattern exists for `occurrences_parquet` in `generate_species_maps` (lines 411-419) — but the `_generate_group_maps` case was introduced in this phase.

While the practical threat in a static pipeline context is low, the pattern is unsafe and inconsistent: `_load_county_geojsons` uses a parameterised query for its dynamic value (line 92), establishing the correct precedent that this phase then violates.

```python
# Current — unsafe interpolation
rows = con.execute(
    f"""
    SELECT canonical_name, genus, subgenus, tribe, specific_epithet
    FROM read_parquet('{species_parquet}')
    WHERE occurrence_count > 0
    ORDER BY canonical_name
    """
).fetchall()

# Fix — use DuckDB's parameter syntax for the path
rows = con.execute(
    """
    SELECT canonical_name, genus, subgenus, tribe, specific_epithet
    FROM read_parquet(?)
    WHERE occurrence_count > 0
    ORDER BY canonical_name
    """,
    [str(species_parquet)],
).fetchall()
```

Apply the same fix to the `occurrences_parquet` query in `generate_species_maps` (line 411) — that pre-existing instance was not introduced in this phase but is the same class of defect.

---

## Warnings

### WR-01: `unresolved` set is populated but its members are never excluded from group maps

**File:** `data/species_maps.py:299-308`
**Issue:** The code builds the `unresolved` set (canonical names where `specific_epithet IS NULL`) and then overrides their color to `_UNRESOLVED_COLOR` — but these entries still appear as members of genus, subgenus, and tribe maps. The query at line 393-401 in `generate_species_maps` already filters `specific_epithet IS NOT NULL` for per-species maps, so unresolved entries never receive a per-species SVG. However, `_generate_group_maps` fetches from `species.parquet` with only `occurrence_count > 0` (no `specific_epithet IS NOT NULL` filter), so genus/tribe maps may include occurrence dots for records that were intentionally excluded from the per-species map layer.

Whether this is intended behavior (show unresolved occurrences in group maps with grey dots) or an oversight (they should be excluded entirely) is ambiguous — the code comment says "unresolved: canonical_names with no species epithet (genus/subgenus/tribe-only IDs)" but doesn't state the intended visual semantics. If the intent is to include them with a grey color, add a comment explaining the design choice. If they should be excluded, add `AND specific_epithet IS NOT NULL` to the query at line 285.

**Fix (if intended exclusion):**
```python
rows = con.execute(
    """
    SELECT canonical_name, genus, subgenus, tribe, specific_epithet
    FROM read_parquet(?)
    WHERE occurrence_count > 0
      AND specific_epithet IS NOT NULL
    ORDER BY canonical_name
    """,
    [str(species_parquet)],
).fetchall()
```

**Fix (if grey-dot behavior is intentional):** Add a comment:
```python
# Unresolved entries (specific_epithet IS NULL) are intentionally included
# in group maps with _UNRESOLVED_COLOR (#aaaaaa) dots — they represent
# genus/subgenus-level IDs whose occurrences still belong to the group.
```

### WR-02: `_write_group_svg` does not guard against a `canon` key missing from `colors`

**File:** `data/species_maps.py:237`
**Issue:** `colors[canon]` (line 237) will raise `KeyError` if `canon` is not in the `colors` dict returned by `_group_colors`. This cannot happen when `_generate_group_maps` is the sole caller — `_group_colors(members)` is called with the exact `members` list, so every member has a key. However, the override loop (`for c in members: if c in unresolved: colors[c] = _UNRESOLVED_COLOR`) sets color for unresolved members after the fact; if `c` were somehow absent from `colors`, the override would silently add it with grey and the next iteration would then succeed. The real risk is: `_write_group_svg` is a public function whose signature accepts `colors: dict[str, str]` and `species_points: dict[str, list[...]]` independently — a future caller could pass mismatched dicts.

The fix is a defensive guard at the call site in `_write_group_svg`:

```python
color = colors.get(canon, '#aaaaaa')  # fallback if caller passes mismatched dicts
g = ET.SubElement(root, f"{{{SVG_NS}}}g", attrib={"fill": color})
```

### WR-03: `total_size` stat walk counts only pre-group files but runs before group maps are written

**File:** `data/species_maps.py:438-442`
**Issue:** The `total_size` calculation at line 438 runs `maps_dir.rglob('*.svg')` after per-species SVGs are written but *before* `_generate_group_maps` (line 444) writes the genus/subgenus/tribe SVGs. The printed byte total and file count therefore exclude all group map files. This is a reporting inaccuracy — the pipeline print statement claims to account for `species-maps/` but misses the group subdirectory output.

**Fix:** Move the size/count reporting to after `_generate_group_maps`, or let `_generate_group_maps` return its file count and byte total so the final summary can be accurate.

```python
_generate_group_maps(con, occ_by_canon, backdrop, maps_dir)

# Moved after group maps are written
total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
print(
    f"  species-maps/: {written:,} species files, {total_size:,} total bytes, "
    f"{total_clipped:,} total points clipped"
)
```

---

## Info

### IN-01: Redundant `None` check after SQL `WHERE` already excludes nulls

**File:** `data/species_maps.py:422-424`
**Issue:** The query at lines 414-419 already filters `lat IS NOT NULL AND lon IS NOT NULL`, but the Python loop at lines 422-424 re-checks `if lon is None or lat is None: continue`. The inner guard is dead code. This is harmless but adds noise.

```python
# The WHERE clause already guarantees non-null; remove the redundant guard:
occ_by_canon: dict[str, list[tuple[float, float]]] = defaultdict(list)
for canon, lon, lat in occ_rows:
    occ_by_canon[canon].append((lon, lat))
```

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
