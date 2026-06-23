---
phase: 161-add-wdfw-wildlife-areas-as-places
reviewed: 2026-06-23T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - data/add_wdfw_wildlife_areas.py
  - data/tests/test_add_wdfw_wildlife_areas.py
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 161: Code Review Report

**Reviewed:** 2026-06-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the one-time maintainer curation script `add_wdfw_wildlife_areas.py` (fetches WDFW ArcGIS GeoJSON, dissolves units into MultiPolygons via DuckDB-spatial, simplifies, and appends `[[places]]` blocks to `content/places.toml`) and its golden-fixture test.

The script is well-structured and the test coverage of `dissolve_to_wkt` and `slug_for` is solid (exclusion, count, MULTIPOLYGON guarantee, single-unit wrap, DuckDB-loadability, slug regex). The dissolve/simplify SQL is sound and defensively wraps inputs in `ST_MakeValid`.

The main correctness concern is the lack of TOML-string escaping when interpolating `WLA_Name` into the generated block: a name containing a double-quote or backslash would emit invalid TOML and silently corrupt `places.toml`. There is also an unhandled failure mode where the simplification tolerance collapses a small area to a degenerate (non-MULTIPOLYGON or empty) geometry, which trips an `assert` rather than producing an actionable message. Per instructions, the intentional absence of an overlap guard (many-to-many place model post-Phase 160) was NOT flagged.

## Warnings

### WR-01: `WLA_Name` interpolated into TOML without escaping — quote/backslash corrupts `places.toml`

**File:** `data/add_wdfw_wildlife_areas.py:131-154` (`toml_block`), reached via `main()` line 186
**Issue:** `name` is interpolated raw into a TOML basic string: `name        = "{name}"`. WLA_Name comes from an external ArcGIS service and is fully outside the script's control. If any name contains a `"` (e.g. an apostrophe-as-quote, a quoted nickname) or a `\`, the emitted line becomes invalid TOML and the appended block silently corrupts `content/places.toml` — which is then consumed downstream by the data pipeline / site build. The same risk applies to `land_owner`, though that is a constant here. `tomllib` is imported but never used, so there is currently no round-trip validation that the appended block re-parses.

This is inherited from `add_new_places.py`, but there the names are hardcoded constants the author controls; here they are remote, attacker-influenceable (or at least change-without-notice) data. The bug is latent today only because the current 34 WLA names happen to be clean.

**Fix:** Escape TOML basic-string special characters before interpolation, and/or validate the appended text re-parses with the already-imported `tomllib`:
```python
def _toml_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

# in toml_block:
name        = "{_toml_escape(name)}"
land_owner  = "{_toml_escape(land_owner)}"

# after writing, before exit (defense in depth):
import tomllib
tomllib.loads(TOML_PATH.read_text(encoding="utf-8"))  # raises on corruption
```

### WR-02: Degenerate-geometry path raises a bare `AssertionError` instead of an actionable error

**File:** `data/add_wdfw_wildlife_areas.py:101-104`
**Issue:** After dissolve + simplify, each WKT is checked with `assert wkt and wkt.startswith("MULTIPOLYGON")`. `ST_SimplifyPreserveTopology` at `TOL=0.0005` (~55 m) can over-simplify a small/thin wildlife-area unit down to an empty geometry or a `GEOMETRYCOLLECTION EMPTY` / `POLYGON EMPTY`, in which case `ST_Multi` does not yield a `MULTIPOLYGON` prefix and the assert fires with only the truncated WKT. Two problems: (a) `assert` is stripped under `python -O`, so the guard can silently vanish; (b) the failure gives the maintainer no guidance (which area, why empty, what tolerance to try). Because this is the gate that decides whether bad geometry reaches `places.toml`, it should be a real, explanatory error.

**Fix:** Replace the assert with an explicit raise that names the offending area and the likely cause:
```python
for wla, wkt in rows:
    if not (wkt and wkt.startswith("MULTIPOLYGON")):
        raise ValueError(
            f"Dissolve produced non-MULTIPOLYGON geometry for {wla!r}: "
            f"{wkt!r}. Likely over-simplified at tol={tol}; lower TOL or inspect source units."
        )
```

### WR-03: No detection of empty/zero-area dissolve result; `fetchall()` over external data is unvalidated

**File:** `data/add_wdfw_wildlife_areas.py:39-57, 82-106`
**Issue:** `fetch_wdfw_features()` does `r.json()["features"]` with no check that `features` is non-empty or that the response shape is as expected (ArcGIS can return an `{"error": {...}}` body with HTTP 200, in which case `["features"]` raises `KeyError` with no context, or `raise_for_status()` passes but the payload is an error object). Likewise `dissolve_to_wkt` will happily return `[]` if every feature was excluded or the table is empty, and `main()` then prints "0 wildlife areas dissolved" and exits 0 — a silent no-op the maintainer may mistake for success. The docstring asserts "All 220 features are returned in a single request" but nothing verifies the server did not paginate/truncate.

**Fix:** Validate the response and fail loudly on an empty or error payload:
```python
body = r.json()
if "error" in body:
    raise RuntimeError(f"WDFW service returned an error: {body['error']}")
features = body.get("features", [])
if not features:
    raise RuntimeError("WDFW service returned zero features; aborting.")
# and in main(), after dissolve:
if not areas:
    raise RuntimeError("Dissolve produced no wildlife areas; check EXCLUDE / source data.")
```

## Info

### IN-01: Unused import `tomllib`

**File:** `data/add_wdfw_wildlife_areas.py:23`
**Issue:** `import tomllib` is never referenced anywhere in the module. Dead import (likely intended for the validation suggested in WR-01).
**Fix:** Either remove the import, or wire it up to round-trip-validate the appended TOML (see WR-01) — the latter is preferable.

### IN-02: Brittle skip-detection relies on exact whitespace match

**File:** `data/add_wdfw_wildlife_areas.py:182`
**Issue:** Idempotency is implemented via the substring test `f'slug        = "{slug}"' in existing_text`, which depends on the exact 8-space alignment that `toml_block` happens to emit. If `places.toml` is ever reformatted (e.g. a formatter normalizes the spacing to `slug = "..."`), this check silently fails to detect the existing slug and appends a duplicate `[[places]]` block. The constant is also duplicated between this script and `add_new_places.py:178`.
**Fix:** Parse existing slugs structurally rather than by formatted-string match:
```python
import tomllib
existing = tomllib.loads(TOML_PATH.read_text(encoding="utf-8"))
existing_slugs = {p["slug"] for p in existing.get("places", [])}
...
if slug in existing_slugs:
    ...
```

### IN-03: `WLAU_Name` is requested and tested but never used

**File:** `data/add_wdfw_wildlife_areas.py:49` (outFields) and `data/tests/test_add_wdfw_wildlife_areas.py:45`
**Issue:** `WLAU_Name` is fetched in `outFields` and carried in the test fixture's properties, but `dissolve_to_wkt` only ever reads `WLA_Name`. The extra field is harmless but increases payload size and implies a use that does not exist, which can mislead a future maintainer.
**Fix:** Drop `WLAU_Name` from `outFields` (and the fixture), or add a comment explaining why it is retained (e.g. for future per-unit breakdown).

---

_Reviewed: 2026-06-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
