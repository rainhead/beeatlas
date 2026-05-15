# Phase 92: Slug Migration & Pipeline Prep - Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 5 modified files + 2 new test files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/species_export.py` | transform | batch (read parquet → compute → write parquet+json) | `data/species_export.py` itself (self-edit) | exact |
| `data/species_maps.py` | transform | batch (read parquet → write SVG files) | `data/species_maps.py` itself (self-edit) | exact |
| `data/tests/test_species_export.py` | test | batch | `data/tests/test_dbt_diff.py` | role-match |
| `data/tests/test_species_maps.py` | test | batch | `data/tests/test_feeds.py` | role-match |
| `content/species-photos.toml` | config | — | none (data audit/cleanup) | no analog |
| `src/tests/validate-species.test.ts` | test | request-response (execSync) | `src/tests/validate-species.test.ts` itself (self-edit) | exact |
| `_pages/species.njk` | template | transform | `_pages/species.njk` itself | exact (no change needed per RESEARCH) |

## Pattern Assignments

### `data/species_export.py` (transform, batch — self-edit at line 141)

**Analog:** `data/species_export.py` (reading the file as-is)

**Edit target** (lines 140–143):
```python
# CURRENT (line 141):
for r in species_rows:
    r['slug'] = _slugify(r['scientificName'])
    if r.get('month_histogram') is None:
        r['month_histogram'] = list(_ZERO_HIST)

# NEW — replace only the slug assignment line:
for r in species_rows:
    genus = r.get('genus') or ''
    epithet = r.get('specific_epithet') or ''
    if genus and epithet:
        r['slug'] = f"{genus}/{epithet}"
    else:
        # Genus-only rows (102 rows in production, none on_checklist)
        r['slug'] = genus if genus else _slugify(r['scientificName'])
    if r.get('month_histogram') is None:
        r['month_histogram'] = list(_ZERO_HIST)
```

**Key invariants to preserve:**
- The `from feeds import _slugify` import at line 30 stays — it is still used by the genus-only fallback branch above
- `SPECIES_COLUMNS` list (lines 59–65) is unchanged — `slug` is already last
- `pa.schema` definition (lines 153–173) is unchanged — `('slug', pa.string())` already at end
- Post-write verify block (lines 180–188) is unchanged

---

### `data/species_maps.py` (transform, batch — self-edit at lines 167–168 and 246)

**Analog:** `data/species_maps.py` (reading the file as-is)

**Edit 1 — `_write_species_svg` function, add `mkdir` before `write_text`** (lines 167–171):
```python
# CURRENT (lines 167–171):
    out_path = out_dir / f"{slug}.svg"
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )

# NEW — add one line before write_text:
    out_path = out_dir / f"{slug}.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)  # NEW: create Genus/ subdir
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding="unicode"),
        encoding="utf-8",
    )
```

**Edit 2 — `generate_species_maps` function, change `glob` to `rglob`** (line 246):
```python
# CURRENT (line 246):
        total_size = sum(p.stat().st_size for p in maps_dir.glob('*.svg'))

# NEW:
        total_size = sum(p.stat().st_size for p in maps_dir.rglob('*.svg'))
```

**Key invariants to preserve (per documented pitfalls in source):**
- Pitfall #3 comment at line 199 stays: "NEVER recompute slug from scientificName here" — slug still comes from `species.parquet`
- D-04 wipe-and-rewrite at lines 189–192 is unchanged
- The `occ_by_canon` grouping at lines 229–233 is unchanged

---

### `data/tests/test_species_export.py` (new test file — Wave 0 gap)

**Analog:** `data/tests/test_dbt_diff.py` for parquet-reading test structure; `data/tests/test_feeds.py` for monkeypatching + module import pattern.

**Imports pattern** (copy from `test_feeds.py` lines 1–14):
```python
import os
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import species_export as se_mod
from species_export import export_species_parquet, SPECIES_COLUMNS
```

**Skip guard pattern** (copy from `test_dbt_diff.py` lines 27–30):
```python
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"

_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)
```

**Monkeypatch + call pattern** (copy from `test_feeds.py` lines 38–46):
```python
def test_slug_hierarchical(tmp_path, monkeypatch):
    """species_export.py writes Genus/specificEpithet slug for species rows (PIPE-03a)."""
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    rows = duckdb.execute(
        f"SELECT slug, genus, specific_epithet FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE specific_epithet IS NOT NULL LIMIT 20"
    ).fetchall()
    for slug, genus, epithet in rows:
        assert slug == f"{genus}/{epithet}", f"Expected {genus}/{epithet!r}, got {slug!r}"
```

**Negative assertion pattern** (copy from `test_dbt_diff.py` anti-join style, lines 103–115):
```python
@_SANDBOX_GUARD
def test_no_old_slug_format(tmp_path, monkeypatch):
    """No slug contains the old lowercase-dash format (PIPE-03b)."""
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    con = duckdb.connect()
    export_species_parquet(con)
    old_pattern_count = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE slug LIKE '%-%' AND specific_epithet IS NOT NULL"
    ).fetchone()[0]
    assert old_pattern_count == 0, (
        f"Found {old_pattern_count} slugs with old genus-epithet flat format"
    )
```

---

### `data/tests/test_species_maps.py` (new test file — Wave 0 gap)

**Analog:** `data/tests/test_feeds.py` for monkeypatching a module-level `ASSETS_DIR` and calling a function with a fixture connection.

**Imports pattern** (copy from `test_feeds.py` lines 1–14):
```python
from pathlib import Path

import duckdb
import pytest

import species_maps as sm_mod
from species_maps import generate_species_maps, _write_species_svg
```

**Monkeypatch + call pattern** (copy from `test_feeds.py` lines 38–46):
```python
def test_svg_hierarchical_path(tmp_path, fixture_con, monkeypatch):
    """SVG files are written at Genus/epithet.svg subdirectory paths (PIPE-03c)."""
    monkeypatch.setattr(sm_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setattr(sm_mod, 'DB_PATH', 'unused')
    # Must have a species.parquet with new slug format in ASSETS_DIR first
    # ... (copy species.parquet with hierarchical slugs to tmp_path) ...
    generate_species_maps(fixture_con)
    # Assert at least one SVG is in a subdirectory
    svgs = list((tmp_path / "species-maps").rglob("*.svg"))
    for svg in svgs:
        parts = svg.relative_to(tmp_path / "species-maps").parts
        # Hierarchical: (Genus, epithet.svg) — two path parts
        assert len(parts) == 2, f"Expected Genus/epithet.svg layout, got {svg}"
```

**`_write_species_svg` unit test pattern** (copy `_in_bbox` / pure-function test pattern from `test_transforms.py`):
```python
def test_write_species_svg_creates_subdir(tmp_path):
    """_write_species_svg creates the parent subdirectory if it doesn't exist."""
    import xml.etree.ElementTree as ET
    SVG_NS = "http://www.w3.org/2000/svg"
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    _write_species_svg(slug, [], backdrop, tmp_path)
    out = tmp_path / "Andrena" / "milwaukeensis.svg"
    assert out.exists(), f"Expected {out} to exist"
```

---

### `src/tests/validate-species.test.ts` (self-edit — update fixture slug value)

**Analog:** `src/tests/validate-species.test.ts` itself (line 14).

**Edit target** (line 14):
```typescript
// CURRENT:
{ scientificName: 'Osmia lignaria', canonical_name: 'osmia lignaria', on_checklist: true, occurrence_count: 5, slug: 'osmia-lignaria' },

// NEW (conceptual correctness — test still passes either way per RESEARCH Pitfall 3):
{ scientificName: 'Osmia lignaria', canonical_name: 'osmia lignaria', on_checklist: true, occurrence_count: 5, slug: 'Osmia/lignaria' },
```

Note: This fixture slug value is never validated against a format pattern in the test. The change is for consistency, not correctness.

---

## Shared Patterns

### Module-level path config (DB_PATH + ASSETS_DIR)
**Source:** `data/species_export.py` lines 33–44, `data/species_maps.py` lines 36–38
**Apply to:** All new Python test files (use `monkeypatch.setattr(mod, 'ASSETS_DIR', tmp_path)`)
```python
# Canonical form — both species_export.py and species_maps.py follow this:
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

### Test skip guard for sandbox parquet
**Source:** `data/tests/test_dbt_diff.py` lines 27–30
**Apply to:** `test_species_export.py` integration tests (those reading from `SANDBOX/species.parquet`)
```python
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)
```

### Parquet column assertion pattern
**Source:** `data/tests/test_dbt_diff.py` lines 334–348
**Apply to:** `test_species_export.py` slug column type check
```python
p_cols = [(r[0], r[1]) for r in duckdb.execute(
    f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
).fetchall()]
assert p_cols[-1] == ('slug', 'VARCHAR'), (
    f"Expected last public column to be ('slug', 'VARCHAR'); got {p_cols[-1]!r}"
)
```

### Monkeypatch ASSETS_DIR pattern
**Source:** `data/tests/test_feeds.py` lines 42–43
**Apply to:** All new Python test functions that call export functions
```python
monkeypatch.setattr(feeds_mod, 'ASSETS_DIR', export_dir)
monkeypatch.setattr(feeds_mod, 'DB_PATH', 'unused')
```

### `_slugify` must NOT be called for species rows
**Source:** `data/feeds.py` lines 132–148 — shows what `_slugify` does (strips `/` and uppercase)
**Apply to:** `species_export.py` edit — the new f-string path bypasses `_slugify` entirely
```python
def _slugify(value: str) -> str:
    value = re.sub(r'[^a-z0-9-]', '', value)  # strips / and uppercase — wrong for new format
    ...
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `content/species-photos.toml` | config data | — | Data audit/cleanup task — no code analog; requires manual inspection of 106 bare-word keys against `species.json` `scientificName` values using `npm run validate-species` |

## Critical Anti-Patterns (from RESEARCH.md)

These patterns from existing code must NOT be followed for the new slug:

1. **Do not call `_slugify()` on the new slug** — `_slugify` strips `/` (line 145 of `feeds.py`: `re.sub(r'[^a-z0-9-]', '', value)`) and lowercases, destroying both the slash separator and genus capitalization.

2. **Do not recompute slug in `species_maps.py`** — The Pitfall #3 comment at `species_maps.py` line 199 is an invariant. Only `species_export.py` computes slugs; `species_maps.py` reads them from `species.parquet`.

3. **Do not use `glob('*.svg')`** after migration — `maps_dir.glob('*.svg')` at line 246 misses files in subdirectories. Change to `rglob`.

## Metadata

**Analog search scope:** `data/`, `data/tests/`, `src/tests/`, `_pages/`
**Files scanned:** 8
**Pattern extraction date:** 2026-05-15
