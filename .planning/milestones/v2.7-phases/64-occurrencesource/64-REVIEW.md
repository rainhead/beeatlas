---
phase: 64-occurrencesource
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - frontend/src/features.ts
  - frontend/src/url-state.ts
  - frontend/src/style.ts
  - frontend/src/bee-map.ts
  - frontend/src/bee-atlas.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed: the new `OccurrenceSource` class, URL state encode/decode, OL style factories, the `bee-map` presenter, and `bee-atlas` orchestrator. The `OccurrenceSource` introduction is clean. The main concern is one SQL injection vector in `bee-atlas.ts` where float values from URL params are interpolated directly into a SQL query without parameterization. Several warnings relate to subtle edge cases in event handling, stale module-level date computation, and a type escape hatch (`as any`) that signals a missing type declaration.

## Critical Issues

### CR-01: SQL injection via direct interpolation of URL-derived floats in `_restoreClusterSelection`

**File:** `frontend/src/bee-atlas.ts:815-816`
**Issue:** `lat`, `lon`, `dLat`, and `dLon` are computed from parsed URL params and then interpolated directly into the SQL string:
```sql
WHERE lat BETWEEN ${lat - dLat} AND ${lat + dLat}
  AND lon BETWEEN ${lon - dLon} AND ${lon + dLon}
```
While `lat`/`lon` are range-validated in `parseParams` (±90/±180), `dLat`/`dLon` are derived from `radiusM` which has a max-value guard of 100,000 in `parseParams` (line 154) but no NaN guard. `Math.cos(lat * Math.PI / 180)` returns a valid float for all valid latitudes, but if any upstream value is `NaN` (e.g., due to future parser changes), SQLite would receive `NaN` which serializes as the string `"NaN"` in a template literal — producing a malformed query that may error or, in certain SQLite wrappers, be treated as `0`. The more durable fix is to validate all computed floats before interpolation and add an explicit NaN guard.

**Fix:**
```typescript
// At the top of _restoreClusterSelection, after computing dLat/dLon:
const latMin = lat - dLat;
const latMax = lat + dLat;
const lonMin = lon - dLon;
const lonMax = lon + dLon;
if (!isFinite(latMin) || !isFinite(latMax) || !isFinite(lonMin) || !isFinite(lonMax)) {
  console.error('_restoreClusterSelection: degenerate bounding box, skipping query');
  return;
}
// Then use latMin/latMax/lonMin/lonMax in the query
```

## Warnings

### WR-01: `occurrenceSource.once('change')` may fire before features load and never retry

**File:** `frontend/src/bee-map.ts:407-416`
**Issue:** `VectorSource` emits `change` events during loading (when the state transitions to `loading`). The handler guards with `if (features.length === 0) return` — but this silently drops the event if features haven't arrived yet. If the `change` event fires in the `loading` state, `data-loaded` is never emitted and the app stays in the loading overlay indefinitely.

**Fix:** Listen for the `featuresloadend` event instead, which fires specifically when the loader callback calls `success()`:
```typescript
this.occurrenceSource.once('featuresloadend', () => {
  const features = this.occurrenceSource.getFeatures();
  // features will be populated at this point
  ...
});
```

### WR-02: Module-level `Temporal.Now.plainDateISO()` is stale after midnight

**File:** `frontend/src/style.ts:16-17`
**Issue:** `today` and `sixWeeksAgo` are computed once at module import time. If the page remains open past midnight (common during field work), `recencyTier` will use the wrong date, classifying newly-fresh observations as stale.

**Fix:** Move date computation inside `recencyTier` so it is evaluated per-call:
```typescript
function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  const today = Temporal.Now.plainDateISO();
  const sixWeeksAgo = today.subtract({ weeks: 6 });
  const sampleDate = Temporal.PlainDate.from({ year, month, day: 1 });
  if (Temporal.PlainDate.compare(sampleDate, sixWeeksAgo) >= 0) return 'fresh';
  if (year >= today.year) return 'thisYear';
  return 'older';
}
```
(The style cache will naturally serve cached styles for existing features; only new features or a forced repaint will re-evaluate. If precision matters, `styleCache.clear()` can be called on a daily timer.)

### WR-03: `(detail as any).elevMin` escapes type safety in `_onFilterChanged`

**File:** `frontend/src/bee-atlas.ts:625-626`
**Issue:** `elevMin` and `elevMax` are accessed via `(detail as any)` because `FilterChangedEvent` apparently does not declare these fields. If the event type is updated but the accessor spelling differs, or if `elevMin`/`elevMax` are removed from the emitted event, this silently becomes `undefined` rather than `null`, producing subtle filter state bugs.

**Fix:** Add `elevMin` and `elevMax` to the `FilterChangedEvent` type in `bee-sidebar.ts` (or wherever the type is declared) so the access can be typed directly:
```typescript
// In FilterChangedEvent interface:
elevMin: number | null;
elevMax: number | null;

// In _onFilterChanged:
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

### WR-04: Duplicate `/^\d+$/` validation in `_restoreSelectionSamples`

**File:** `frontend/src/bee-atlas.ts:752-762`
**Issue:** The regex `/^\d+$/` is applied twice to the same `ecdysisIds` array — once at line 755 and again at line 762 (`safeIds`). The comment on line 761 says "belt-and-suspenders" but both filters operate on the already-filtered array, so the second pass is unreachable dead code. This is harmless but obscures the intent and makes readers wonder if there's a threat model requiring two passes.

**Fix:** Remove the redundant second filter. If the belt-and-suspenders intent is meaningful, add a comment explaining what attack it guards against after the first filter has already run:
```typescript
const safeIds = ecdysisIds; // already validated by filter above
```

### WR-05: `buildSamples` strips `ecdysis:` prefix, storing bare integer `occid`

**File:** `frontend/src/bee-map.ts:42`
**Issue:** `const occid = (f.getId() as string).replace('ecdysis:', '');` strips the ID prefix before pushing to `Sample.species`. CLAUDE.md states that IDs are load-bearing for source disambiguation; if any downstream consumer of `occid` compares against the prefixed form (e.g., `visibleEcdysisIds` or `selectedOccIds` which use the `ecdysis:` prefix), the comparison will silently fail.

Meanwhile `_restoreSelectionSamples` stores `occid: String(obj.ecdysis_id)` (also bare integer), so both paths agree — but this diverges from the prefixed canonical form referenced everywhere else. The inconsistency is a latent bug risk.

**Fix:** Decide on one canonical form. If sidebar consumers expect bare integers, document it explicitly. If the canonical form should be `ecdysis:<integer>`, change line 42:
```typescript
const occid = f.getId() as string; // keep full prefixed form
```

## Info

### IN-01: `SELECT *` in `OccurrenceSource` fetches all columns unconditionally

**File:** `frontend/src/features.ts:17`
**Issue:** `SELECT * FROM occurrences` retrieves all columns for every row, including any future columns added to the table. This makes the feature properties non-deterministic as the schema evolves, and may transfer unnecessary data.

**Fix:** Enumerate only the columns consumed by the application. This also makes the data contract explicit and aids future schema changes.

### IN-02: `parseInt(...) || null` coerces `0` to `null`

**File:** `frontend/src/url-state.ts:93-95`
**Issue:** `parseInt(p.get('yr0') ?? '') || null` — the `||` operator treats `0` as falsy. Year `0` is not a real collection year, so this is not a current bug, but `elevMin`/`elevMax` on lines 95-96 could legitimately be `0` (sea level) and would be coerced to `null`.

**Fix:** Use an explicit null check:
```typescript
const elevMin = p.has('elev_min') ? (parseInt(p.get('elev_min')!, 10) || null) : null;
// Or more explicitly:
const rawElevMin = p.get('elev_min');
const elevMin = rawElevMin !== null && rawElevMin !== '' ? parseInt(rawElevMin, 10) : null;
```

### IN-03: `console.debug` left in production path

**File:** `frontend/src/features.ts:38`
**Issue:** `console.debug(\`Adding ${features.length} occurrence features from SQLite\`)` will emit to the browser console in production builds unless the bundler strips `console.debug` calls.

**Fix:** Either remove the log or guard it behind `import.meta.env.DEV`:
```typescript
if (import.meta.env.DEV) console.debug(`Adding ${features.length} occurrence features from SQLite`);
```

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
