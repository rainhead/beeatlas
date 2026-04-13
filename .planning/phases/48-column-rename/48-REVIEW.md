---
phase: 48-column-rename
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - data/ecdysis_pipeline.py
  - data/export.py
  - data/tests/conftest.py
  - data/tests/test_export.py
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-map.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/bee-specimen-detail.ts
  - frontend/src/features.ts
  - frontend/src/filter.ts
  - frontend/src/tests/bee-sidebar.test.ts
  - scripts/validate-schema.mjs
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

The phase introduces a column rename (likely `lat`/`lon` and related) that touches the full pipeline from DuckDB export through frontend feature loading. The column schema is consistent across `export.py`, `validate-schema.mjs`, `test_export.py`'s `EXPECTED_ECDYSIS_COLS`/`EXPECTED_SAMPLES_COLS`, and the DuckDB queries in `features.ts` and `filter.ts`. No critical issues found.

Three warnings are present: a logic bug in `_pushUrlState` that creates spurious browser history entries on every non-map-move action, a duplicate collector query between `_loadSummaryFromDuckDB` and `_loadCollectorOptions`, and an unchecked SQL CAST in the export that will throw on non-numeric IDs. Four info items cover stale docstrings, a silently-swallowed exception, and minor code quality notes.

---

## Warnings

### WR-01: `_pushUrlState` schedules a spurious `pushState` on every call, not just map moves

**File:** `frontend/src/bee-atlas.ts:442-455`

**Issue:** `_pushUrlState` always calls `replaceState` immediately and then schedules a `pushState` via `setTimeout(..., 500)`. This is appropriate for map pan/zoom (where you want to debounce navigation entries), but `_pushUrlState` is also called directly from filter changes, layer changes, selection changes, and closes. Each of those non-map-move calls will create a spurious history entry 500 ms later. For example, selecting a filter and then doing nothing results in two history entries for the same state, causing an extra Back-button press to get to the previous state.

**Fix:** Separate map-move URL updates from other URL updates. Add a boolean parameter or a separate `_pushUrlStateImmediate()` method for non-map-move callers:
```typescript
private _pushUrlState(pushHistory = false) {
  const params = buildParams(/* ... */);
  window.history.replaceState({}, '', '?' + params.toString());
  if (pushHistory) {
    if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = setTimeout(() => {
      window.history.pushState({}, '', '?' + params.toString());
      this._mapMoveDebounce = null;
    }, 500);
  }
}
```
Then call `this._pushUrlState()` from filter/selection handlers and `this._pushUrlState(true)` from `_onViewMoved`.

---

### WR-02: Duplicate collector query between `_loadSummaryFromDuckDB` and `_loadCollectorOptions`

**File:** `frontend/src/bee-atlas.ts:369-382` and `391-415`

**Issue:** The collector query (`SELECT e.recordedBy, MIN(s.observer) AS observer FROM ecdysis e LEFT JOIN samples s...`) appears identically in both `_loadSummaryFromDuckDB` (lines 369–382) and `_loadCollectorOptions` (lines 391–415). `_loadCollectorOptions` is called from `_onDataLoaded` (line 738), which fires when the map path loads data. `_loadSummaryFromDuckDB` is called in the table-view path and also builds `_collectorOptions`. If both code paths run (e.g., user switches to table view after map loads), the collector query executes twice and `_collectorOptions` is set twice. The duplication is a maintenance hazard: a schema change in the query must be made in two places.

**Fix:** Remove the inline collector query from `_loadSummaryFromDuckDB` and instead call `_loadCollectorOptions()` at the end of that method, so the logic lives in one place.

---

### WR-03: `CAST(o.id AS INTEGER)` in `export_ecdysis_parquet` will raise on non-numeric IDs

**File:** `data/export.py:94`

**Issue:** The export query casts the raw string `id` column from `ecdysis_data.occurrences` to `INTEGER` with no fallback:
```sql
CAST(o.id AS INTEGER) AS ecdysis_id,
```
The conftest schema defines `id` as `VARCHAR`. If upstream Symbiota data ever includes a non-numeric occurrence ID (or a blank row), the entire export fails with a DuckDB cast error and no diagnostic message. `TRY_CAST` is used elsewhere in the same file (line 165) to handle exactly this pattern.

**Fix:** Use `TRY_CAST` and add an assertion in the verification step:
```sql
TRY_CAST(o.id AS INTEGER) AS ecdysis_id,
```
Then add to the post-export verification block:
```python
null_id = con.execute(f"SELECT COUNT(*) FROM read_parquet('{out}') WHERE ecdysis_id IS NULL").fetchone()[0]
assert null_id == 0, f"ecdysis.parquet has {null_id} rows with non-integer id"
```

---

## Info

### IN-01: Stale module docstring in `export.py`

**File:** `data/export.py:3`

**Issue:** The module docstring says output goes to `frontend/src/assets/` but the code writes to `frontend/public/data/` (line 20, `_default_assets`). The path was updated in phase 36 (per project memory) but the docstring was not.

**Fix:** Update the docstring:
```python
"""Export frontend assets from data/beeatlas.duckdb.

Produces four files in frontend/public/data/:
```

---

### IN-02: Stale column count in test docstring

**File:** `data/tests/test_export.py:35`

**Issue:** `test_ecdysis_parquet_schema` has the docstring "writes file with all 15 expected columns." but `EXPECTED_ECDYSIS_COLS` contains 18 columns.

**Fix:** Update the docstring to say "18 expected columns."

---

### IN-03: Silenced exception in `occurrence_links` with no log

**File:** `data/ecdysis_pipeline.py:137-144`

**Issue:** The bare `except Exception` that catches a missing `occurrence_links` table swallows the error silently. If the failure is something other than a non-existent table (e.g., a DuckDB connection issue or a schema mismatch), the pipeline will continue with `already_done = set()`, re-processing all occurrences and producing incorrect or duplicate data.

**Fix:** At minimum, log the exception so it is observable:
```python
except Exception as exc:
    already_done = set()
    print(f"[ecdysis_links] could not read occurrence_links (assuming empty): {exc}")  # noqa: T201
```
Optionally narrow the catch to check for the specific "Table not found" error string.

---

### IN-04: `_formatSampleDate` in `bee-sidebar.ts` handles numeric strings unnecessarily

**File:** `frontend/src/bee-sidebar.ts:326-333`

**Issue:** `_formatSampleDate` checks `Number.isFinite(Number(dateStr))` and if so interprets the string as a Unix timestamp in seconds. The `date` property on `SampleEvent` is always a `YYYY-MM-DD` string (set in `_buildRecentSampleEvents` at `bee-map.ts:318-321`), so the numeric path is dead code. A date string like `"20231015"` would be mistakenly parsed as a Unix timestamp (year ~1970).

**Fix:** Remove the numeric branch:
```typescript
private _formatSampleDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);
}
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
