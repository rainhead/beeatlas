# Phase 1: Pipeline - Research

**Researched:** 2026-02-18
**Domain:** Python data pipeline — Ecdysis DarwinCore download + Parquet output
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PIPE-01 | Download script (`data/ecdysis/download.py`) runs end-to-end with `db=164` — main block calls `make_dump`, `argparse` fixed, db parameter passed | Bugs catalogued: two argparse bugs, missing `make_dump` call — exact fixes identified |
| PIPE-02 | Occurrences processor (`data/ecdysis/occurrences.py`) produces valid Parquet — `pdb.set_trace()` removed, `__main__` block receives zip path correctly | Bugs catalogued: pdb trap, `Path(zip)` builtin error, missing `to_parquet` call — exact fixes identified |
| PIPE-03 | Parquet output includes all fields required for popup and filters — `scientificName`, `family`, `genus`, `specificEpithet`, `year`, `month`, `recordedBy`, `fieldNumber` | All 8 columns confirmed present in source data; current `to_parquet()` selects only 4 columns; rename strategy researched |
</phase_requirements>

---

## Summary

This phase is pure bug-fixing. There are no new libraries to add and no architectural decisions to make. The stack is locked (Python 3.14, pandas 3.0, geopandas 1.1, pyarrow 22, requests). All required columns exist in the source data. Every bug has a small, isolated fix.

The two scripts need a combined total of about 20 lines changed. `download.py` needs two argparse fixes and a `make_dump` call wired to the new `--db` argument. `occurrences.py` needs the `pdb.set_trace()` removed, the `__main__` block corrected to use `sys.argv[1]` and call `to_parquet`, and the `to_parquet` function's column selection expanded to include all PIPE-03 required fields.

The null-coordinate success criterion (records with null lat/lon excluded without crashing) requires one `dropna` filter added to `to_parquet` before writing. Geopandas constructs `POINT(NaN, NaN)` geometries silently for null-coord rows rather than crashing, so there is no crash to prevent on read — but those rows must be filtered before output. Filtering on the original `ecdysis_decimalLatitude.notna()` column is more reliable than filtering on geometry validity.

**Primary recommendation:** Fix the six identified bugs in isolation, verify against the existing `ecdysis_2026-02-16_1.zip`, confirm Parquet output columns match what `frontend/src/parquet.ts` expects.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pandas | 3.0.0 | DataFrame I/O, column manipulation | Already in pyproject.toml; lockfile pinned |
| geopandas | 1.1.2 | GeoDataFrame for geometry-aware Parquet | Already used in read_occurrences(); needed for CRS-aware output |
| pyarrow | 22.0.0 | Parquet write engine | Already in pyproject.toml; `df.to_parquet(engine='pyarrow')` |
| requests | (in lockfile) | HTTP POST to Ecdysis download endpoint | Already used in download.py |

### No new dependencies

All required functionality is already installed. Do not add new packages.

**Verification:**
```bash
cd data && uv run python -c "import pandas, geopandas, pyarrow, requests; print('OK')"
```

---

## Architecture Patterns

### Recommended Project Structure (no changes needed)

```
data/ecdysis/
├── __init__.py          # entry point: python data/ecdysis (has correct main block)
├── download.py          # PIPE-01: download Ecdysis zip from API
└── occurrences.py       # PIPE-02/03: read zip, write Parquet
```

### Pattern 1: argparse Correct Invocation

**What:** `argparse.ArgumentParser.parse_args()` with no arguments automatically uses `sys.argv[1:]`. Passing `sys.argv` (which includes the script name at index 0) causes argparse to try to parse the script path as an argument and fail.

**Fix:**
```python
# WRONG (current):
args = parser.parse_args(sys.argv)

# CORRECT:
args = parser.parse_args()
# or equivalently:
args = parser.parse_args(sys.argv[1:])
```

### Pattern 2: `__main__` Block with sys.argv

**What:** `Path(zip)` in the current `occurrences.py` line 99 references Python's builtin `zip` class, not a CLI argument. This raises `TypeError: argument should be a str or an os.PathLike object`.

**Fix:**
```python
# WRONG (current — line 99):
df = from_zipfile(Path(zip))

# CORRECT:
zip_path = Path(sys.argv[1])
df = from_zipfile(zip_path)
```

### Pattern 3: Null Coordinate Filtering

**What:** Geopandas `points_from_xy()` silently produces `POINT(NaN, NaN)` geometry for null lat/lon rows — it does not crash. The geometry's `is_empty` returns `False` and `is_valid` returns `False` for these rows. The correct filter is on the source columns, done after `add_prefix`:

```python
# In to_parquet(), before selecting output columns:
df = df[df['ecdysis_decimalLatitude'].notna() & df['ecdysis_decimalLongitude'].notna()]
```

Confirmed with actual data: 564 of 46,318 rows (1.2%) have null coordinates.

### Pattern 4: GeoDataFrame to Plain Parquet

**What:** `GeoDataFrame.to_parquet()` writes GeoParquet (includes geometry column and CRS metadata). The frontend (`hyparquet` library) reads plain Parquet and expects `longitude`/`latitude` float columns, not a geometry column. Convert to plain `DataFrame` before writing by selecting only the needed columns.

```python
# CORRECT — select columns, which drops geometry, producing a plain DataFrame:
output_cols = [
    'ecdysis_id', 'ecdysis_decimalLongitude', 'ecdysis_decimalLatitude',
    'ecdysis_scientificName', 'ecdysis_family', 'ecdysis_genus',
    'ecdysis_specificEpithet', 'ecdysis_year', 'ecdysis_month',
    'ecdysis_recordedBy', 'ecdysis_fieldNumber',
]
df = df[output_cols].rename(columns={
    'ecdysis_decimalLatitude': 'latitude',
    'ecdysis_decimalLongitude': 'longitude',
    # Keep the remaining required columns with ecdysis_ prefix (frontend expects ecdysis_id, ecdysis_fieldNumber)
    # Strip prefix from the semantic fields required by PIPE-03
    'ecdysis_scientificName': 'scientificName',
    'ecdysis_family': 'family',
    'ecdysis_genus': 'genus',
    'ecdysis_specificEpithet': 'specificEpithet',
    'ecdysis_year': 'year',
    'ecdysis_month': 'month',
    'ecdysis_recordedBy': 'recordedBy',
    'ecdysis_fieldNumber': 'fieldNumber',
})
df.to_parquet(out, engine='pyarrow', index=False)
```

**Note on `ecdysis_id`:** The frontend currently uses `ecdysis_id` as the feature ID key (`feature.setId('ecdysis:${obj.ecdysis_id}')`). Keep `ecdysis_id` with the prefix.

**Note on `ecdysis_fieldNumber`:** The frontend currently reads `ecdysis_fieldNumber`. PIPE-03 requires the output column be named `fieldNumber`. These conflict. Resolution: the Parquet should output `fieldNumber` (per PIPE-03). The frontend's `parquet.ts` column list will need updating in Phase 3 when the sidebar is built — Phase 1 only delivers the Parquet schema, not the frontend display.

### Anti-Patterns to Avoid

- **Using `geometry.is_empty` to detect null coords:** Returns `False` for `POINT(NaN, NaN)` — not a reliable filter. Use `.notna()` on source columns.
- **Calling `GeoDataFrame.to_parquet()` with all columns:** Writes GeoParquet with geometry column; hyparquet cannot read geometry columns correctly.
- **Keeping `ecdysis_` prefix on semantic output columns:** Frontend needs column names to match what the map/sidebar reads; output should be clean names per PIPE-03.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet write | Custom serializer | `df.to_parquet(engine='pyarrow')` | Handles nullable Int64, StringDtype, compression — already installed |
| HTTP POST download | Custom multipart | `requests.post(url, data=...)` | Already used in download.py; handles content-type, encoding |
| Null filtering | Custom loop | `df.dropna(subset=['decimalLatitude', 'decimalLongitude'])` or boolean mask | Vectorized, handles NaN/NA across pandas nullable types |

**Key insight:** This phase is all bug fixes in ~20 lines. Do not refactor, do not add abstractions.

---

## Common Pitfalls

### Pitfall 1: `parse_args(sys.argv)` — argparse script-name poisoning

**What goes wrong:** `argparse` tries to parse `sys.argv[0]` (the script path, e.g. `download.py`) as an argument. With `add_argument('-s', '--state')`, it would interpret `download.py` as an unrecognized positional and fail.

**Why it happens:** `parse_args()` defaults to `sys.argv[1:]` but `parse_args(sys.argv)` overrides with the full list including `argv[0]`.

**How to avoid:** Call `parse_args()` with no arguments (the standard Python idiom).

**Warning signs:** `error: unrecognized arguments: download.py` in output.

### Pitfall 2: `Path(zip)` — shadowing builtin

**What goes wrong:** Python's builtin `zip` is a class. `Path(zip)` raises `TypeError: argument should be a str or an os.PathLike object where __fspath__ returns a str, not 'type'`. The script exits immediately.

**Why it happens:** The variable name `zip` was intended to hold `sys.argv[1]` but was never assigned.

**How to avoid:** Use a different variable name (e.g. `zip_path`) and assign from `sys.argv[1]`.

**Warning signs:** `TypeError` on first line of `__main__`.

### Pitfall 3: `pdb.set_trace()` hanging in non-interactive context

**What goes wrong:** In CI or when piped, `pdb.set_trace()` blocks waiting for input on stdin. The process hangs indefinitely rather than failing.

**Why it happens:** Debug code accidentally committed.

**How to avoid:** Remove the line. One-line fix.

**Warning signs:** Script hangs with no output after "Loaded N occurrences".

### Pitfall 4: Missing columns in `to_parquet()` column selection

**What goes wrong:** The current `to_parquet()` selects only `['ecdysis_id', 'ecdysis_decimalLongitude', 'ecdysis_decimalLatitude', 'ecdysis_fieldNumber']`. The 7 required semantic columns (`scientificName`, `family`, `genus`, `specificEpithet`, `year`, `month`, `recordedBy`) are absent from the output Parquet.

**Why it happens:** The column selection was written as a stub for map display only, before the sidebar/filter requirements were defined.

**How to avoid:** Expand the column list to include all PIPE-03 required columns before calling `to_parquet`.

**Warning signs:** `KeyError` when frontend tries to read `scientificName` from the Parquet.

### Pitfall 5: `from occurrences import` — Python 3 implicit relative import

**What goes wrong:** `data/ecdysis/__init__.py` uses `from occurrences import from_zipfile, to_parquet` (Python 2-style implicit relative). This fails when the package is imported via `from ecdysis import ...` because Python 3 requires explicit relative imports (`from .occurrences import ...`) inside packages.

**Why it happens:** The file was written as a standalone script that runs with `data/ecdysis/` in sys.path, not as a proper package import.

**How to avoid:** If `occurrences.py` is the intended CLI entry point (per PIPE-02 success criteria `python data/ecdysis/occurrences.py <zip>`), then `__init__.py` is not the CLI entry and its import style only matters if used as a library. For Phase 1, fix the `occurrences.py` `__main__` block and do not call through `__init__.py`.

**Warning signs:** `ModuleNotFoundError: No module named 'occurrences'` when running from outside the `ecdysis/` directory.

### Pitfall 6: GeoParquet vs. Plain Parquet

**What goes wrong:** `GeoDataFrame.to_parquet()` writes GeoParquet format with geometry stored as WKB binary and CRS metadata in file metadata. `hyparquet` (the frontend reader) does not understand GeoParquet — it reads geometry as raw binary bytes, not as lat/lon coordinates.

**Why it happens:** `to_parquet()` on a GeoDataFrame calls geopandas' version, not pandas'.

**How to avoid:** Convert to plain `DataFrame` via column selection (which drops the geometry column) before writing. Then call `pd.DataFrame.to_parquet()`.

**Warning signs:** Frontend loads Parquet but features render at (0, 0) or throw errors reading lat/lon.

---

## Code Examples

### download.py — correct `__main__` block

```python
# Source: standard argparse pattern (Python docs)
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(prog='download.py', description='Download archives from Ecdysis')
    parser.add_argument('-d', '--db', required=True, help='Ecdysis database ID (e.g. 164)')
    parser.add_argument('-s', '--state')
    args = parser.parse_args()   # no argument = sys.argv[1:]
    make_dump({'db': args.db})
```

### occurrences.py — correct `__main__` block

```python
# Source: standard sys.argv pattern
if __name__ == '__main__':
    zip_path = Path(sys.argv[1])
    df = from_zipfile(zip_path)
    print(f"Loaded {len(df)} occurrences")
    to_parquet(df, Path("ecdysis.parquet"))
```

### occurrences.py — corrected `to_parquet()` function

```python
# Source: direct analysis of existing code + PIPE-03 requirements
def to_parquet(df: pd.DataFrame, out: Path | IO[bytes]):
    # Filter out records with null coordinates
    df = df[df['ecdysis_decimalLatitude'].notna() & df['ecdysis_decimalLongitude'].notna()]
    # Select and rename required columns for Parquet output
    df = df[[
        'ecdysis_id',
        'ecdysis_decimalLongitude',
        'ecdysis_decimalLatitude',
        'ecdysis_scientificName',
        'ecdysis_family',
        'ecdysis_genus',
        'ecdysis_specificEpithet',
        'ecdysis_year',
        'ecdysis_month',
        'ecdysis_recordedBy',
        'ecdysis_fieldNumber',
    ]].rename(columns={
        'ecdysis_decimalLatitude': 'latitude',
        'ecdysis_decimalLongitude': 'longitude',
        'ecdysis_scientificName': 'scientificName',
        'ecdysis_family': 'family',
        'ecdysis_genus': 'genus',
        'ecdysis_specificEpithet': 'specificEpithet',
        'ecdysis_year': 'year',
        'ecdysis_month': 'month',
        'ecdysis_recordedBy': 'recordedBy',
        'ecdysis_fieldNumber': 'fieldNumber',
    })
    # Convert to plain DataFrame (drops GeoDataFrame geometry column, avoids GeoParquet)
    pd.DataFrame(df).to_parquet(out, engine='pyarrow', index=False)
```

### Verification command

```bash
# Verify required columns in output
cd data
uv run python ecdysis/occurrences.py ecdysis_2026-02-16_1.zip
uv run python -c "
import pyarrow.parquet as pq
f = pq.read_table('ecdysis.parquet')
print('Columns:', f.schema.names)
required = ['scientificName','family','genus','specificEpithet','year','month','recordedBy','fieldNumber','latitude','longitude']
missing = [c for c in required if c not in f.schema.names]
print('Missing:', missing or 'none')
print('Rows:', f.num_rows)
"
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `parse_args(sys.argv)` | `parse_args()` (no arg) | argparse defaults to `sys.argv[1:]` — script name not passed |
| `Path(zip)` (builtin) | `Path(sys.argv[1])` | Reads actual CLI argument |
| `pdb.set_trace()` | (removed) | No more interactive debugger hang |
| 4 output columns | 11 output columns, renamed | Includes all PIPE-03 required fields |

---

## Open Questions

1. **Frontend column name alignment: `ecdysis_fieldNumber` vs `fieldNumber`**
   - What we know: `parquet.ts` currently reads `ecdysis_fieldNumber`; PIPE-03 requires output column named `fieldNumber`
   - What's unclear: Does Phase 1 update `parquet.ts` to match the new Parquet schema, or does Phase 3 (sidebar work) own that change?
   - Recommendation: Phase 1 delivers the correct Parquet schema (per requirements: `fieldNumber`). Leave `parquet.ts` untouched — it will break when loaded against the new Parquet, but Phase 3 is where the sidebar is built and `parquet.ts` updated. The Phase 1 success criterion is about the Parquet file contents, not frontend display.

2. **`make_dump` output path: does the caller need the zip path returned?**
   - What we know: `make_dump` writes `ecdysis_{ts}_.zip` to CWD but returns `None`. The `__main__` block just calls it — no further use of the path.
   - What's unclear: The success criterion says "produces a DarwinCore zip file" — no requirement to print or return the path.
   - Recommendation: No change needed; the file on disk is sufficient for success criterion 1.

3. **`__init__.py` implicit relative import**
   - What we know: `from occurrences import ...` in `__init__.py` fails when imported as a package. But the PIPE-02 success criterion targets `occurrences.py` directly, not `__init__.py`.
   - What's unclear: Is `__init__.py` meant to be used? Its `__main__` block has correct `sys.argv[1]` handling.
   - Recommendation: Fix `occurrences.py` per requirements; leave `__init__.py` import issue as a separate concern (not blocking PIPE-02). If `__init__.py` is the intended entry point, change `from occurrences import` to `from .occurrences import` — but that's out of scope for these three requirements.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/Users/rainhead/dev/beeatlas/data/ecdysis/download.py` — bugs at lines 47, 54, missing call
- Direct code inspection of `/Users/rainhead/dev/beeatlas/data/ecdysis/occurrences.py` — bugs at lines 95, 99, 91-94
- Direct code inspection of `/Users/rainhead/dev/beeatlas/data/ecdysis/__init__.py` — import issue
- Direct data inspection of `/Users/rainhead/dev/beeatlas/data/ecdysis_2026-02-16_1.zip` — 46,318 rows, 104 columns, all required columns present, 564 null-coord rows confirmed
- `/Users/rainhead/dev/beeatlas/data/pyproject.toml` + `uv.lock` — pandas 3.0.0, geopandas 1.1.2, pyarrow 22.0.0 confirmed
- Live Python tests of geopandas NaN geometry behavior, filter methods, parquet output
- `/Users/rainhead/dev/beeatlas/frontend/src/parquet.ts` — frontend column expectations confirmed (`ecdysis_id`, `longitude`, `latitude`)

### Secondary (MEDIUM confidence)
- Python argparse official docs — `parse_args()` defaults to `sys.argv[1:]`

---

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — all bugs confirmed by direct code/data inspection and live tests
- Fix correctness: HIGH — each fix verified in Python REPL against actual data
- Column naming: HIGH — both source data and frontend code inspected directly
- Null coord behavior: HIGH — geopandas behavior verified with live test

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (stable libraries; Ecdysis API format could change but unlikely)
