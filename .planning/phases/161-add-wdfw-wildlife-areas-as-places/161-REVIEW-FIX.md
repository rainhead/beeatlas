---
phase: 161-add-wdfw-wildlife-areas-as-places
fixed_at: 2026-06-23T00:00:00Z
review_path: .planning/phases/161-add-wdfw-wildlife-areas-as-places/161-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 161: Code Review Fix Report

**Fixed at:** 2026-06-23T00:00:00Z
**Source review:** .planning/phases/161-add-wdfw-wildlife-areas-as-places/161-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (Warnings WR-01, WR-02, WR-03)
- Fixed: 3
- Skipped: 0

All fixes verified by Python `ast.parse` syntax check plus the golden-fixture
test suite (`data/tests/test_add_wdfw_wildlife_areas.py`, 9 passed) after the
final fix. The ratified D-05 simplification tolerance (`TOL=0.0005`) was left
unchanged, and no overlap-handling code was added (intentionally absent for the
many-to-many place model).

## Fixed Issues

### WR-01: `WLA_Name` interpolated into TOML without escaping — quote/backslash corrupts `places.toml`

**Files modified:** `data/add_wdfw_wildlife_areas.py`
**Commit:** 2eabc707
**Applied fix:** Added a `_toml_escape(s)` helper (escapes `\` then `"`) and
routed both `name` and `land_owner` through it in `toml_block`. Also wired up
the previously-unused `tomllib` import to round-trip-validate the file with
`tomllib.loads(...)` immediately after the appended blocks are written, so a
corrupt emission fails loudly rather than silently corrupting `places.toml`.
This additionally resolves Info finding IN-01 (unused `tomllib` import) as a
side effect.

### WR-02: Degenerate-geometry path raises a bare `AssertionError` instead of an actionable error

**Files modified:** `data/add_wdfw_wildlife_areas.py`
**Commit:** 7cf3b697
**Applied fix:** Replaced the bare `assert wkt and wkt.startswith("MULTIPOLYGON")`
guard with an explicit `raise ValueError(...)` that names the offending area
(`{wla!r}`), shows the actual WKT, and points to the likely cause (over-
simplification at the current tolerance). This survives `python -O` (asserts are
stripped under `-O`) and gives the maintainer actionable guidance.

### WR-03: No detection of empty/zero-area dissolve result; `fetchall()` over external data is unvalidated

**Files modified:** `data/add_wdfw_wildlife_areas.py`
**Commit:** a77d189a
**Applied fix:** In `fetch_wdfw_features()`, parse the JSON body once and (a)
raise `RuntimeError` if it is an ArcGIS `{"error": {...}}` payload (returned with
HTTP 200, so `raise_for_status()` misses it), and (b) raise `RuntimeError` if the
`features` array is empty/missing. In `main()`, raise `RuntimeError` if the
dissolve produced zero areas, converting the prior silent "0 added" exit-0 no-op
into a loud failure.

---

_Fixed: 2026-06-23T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
