---
phase: 45-sidebar-feed-discovery
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/src/bee-atlas.ts
  - frontend/src/tests/bee-atlas.test.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/tests/bee-sidebar.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 45: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The four files implement the sidebar feed discovery feature (Phase 45): `bee-atlas` fetches a feed index, computes active entries by matching the current collector filter, and passes them as a property to `bee-sidebar`, which renders a feeds section. The coordinator pattern (state owned by `bee-atlas`, pure presenter `bee-sidebar`) is correctly maintained.

Three issues require attention before shipping:

1. A test for `BeeFilterControls` asserts a `boundaryMode` property that the component does not declare — the test will fail.
2. `bee-sidebar` never passes `boundaryMode` to `bee-filter-controls`, so if `BeeFilterControls` ever depends on that property it will silently receive the default.
3. The `FeedEntry` interface is duplicated between `bee-atlas.ts` and `bee-sidebar.ts` without a shared source of truth, creating a maintenance hazard.

No security vulnerabilities were found. The SQL injection mitigation in `_restoreSelectionSamples` (integer-only guard at line 757) is correct and sufficient.

---

## Warnings

### WR-01: Test asserts `boundaryMode` property on `BeeFilterControls` — property does not exist

**File:** `frontend/src/tests/bee-sidebar.test.ts:61`

**Issue:** The `DECOMP-01` test suite checks that `BeeFilterControls.elementProperties` contains `'boundaryMode'`:

```ts
expect(props.has('boundaryMode')).toBe(true);
```

`bee-filter-controls.ts` declares only `filterState`, `taxaOptions`, `countyOptions`, `ecoregionOptions`, `collectorOptions`, and `summary` as `@property` fields. `boundaryMode` is absent. This test will fail when the suite is run, producing a false-red signal that hides real failures.

**Fix:** Remove the `expect(props.has('boundaryMode')).toBe(true)` assertion from the `DECOMP-01` describe block. If `boundaryMode` is a planned future input to `bee-filter-controls`, add the `@property` declaration to that component first, then re-enable the test assertion.

---

### WR-02: `bee-sidebar` does not pass `boundaryMode` to `bee-filter-controls`

**File:** `frontend/src/bee-sidebar.ts:442-449`

**Issue:** `bee-atlas` owns `_boundaryMode` and passes it to `bee-map`, but it is not included in the properties forwarded to `bee-sidebar`, and `bee-sidebar` does not forward it to `bee-filter-controls`:

```ts
<bee-filter-controls
  .filterState=${this.filterState}
  .taxaOptions=${this.taxaOptions}
  .countyOptions=${this.countyOptions}
  .ecoregionOptions=${this.ecoregionOptions}
  .collectorOptions=${this.collectorOptions}
  .summary=${this.summary}
></bee-filter-controls>
```

If `bee-filter-controls` is ever extended to show or use `boundaryMode` (e.g., to contextualise the county/ecoregion filter UI), the wiring will be silently absent and the component will use its default. The `DECOMP-01` test in WR-01 was likely written anticipating this wiring.

**Fix:** Either (a) add `boundaryMode` as a `@property` to both `bee-sidebar` and `bee-filter-controls` and wire it through (matching the pattern used for `countyOptions`/`ecoregionOptions`), or (b) confirm that `boundaryMode` is intentionally not needed in `bee-filter-controls` and remove the dead test assertion (see WR-01). Option (b) is lower risk for Phase 45 scope.

---

### WR-03: Duplicate `FeedEntry` interface in `bee-atlas.ts` and `bee-sidebar.ts`

**File:** `frontend/src/bee-atlas.ts:11-18` and `frontend/src/bee-sidebar.ts:8-15`

**Issue:** `FeedEntry` is declared identically in both files. `bee-atlas.ts` does not import the one from `bee-sidebar.ts` even though it already imports other types from there (line 6). Both declarations must be manually kept in sync; a field rename or addition in one will silently diverge from the other. TypeScript's structural typing means a mismatch will only be caught at the call site where values flow from one to the other.

**Fix:** Remove the `FeedEntry` declaration from `bee-atlas.ts` and import it from `bee-sidebar.ts`:

```ts
// bee-atlas.ts line 6 — add FeedEntry to the existing import
import type { Sample, Specimen, DataSummary, TaxonOption, FilteredSummary, FilterChangedEvent, SampleEvent, FeedEntry } from './bee-sidebar.ts';
```

Then delete lines 11-18 from `bee-atlas.ts`.

---

## Info

### IN-01: Collector options query is duplicated between `_loadSummaryFromDuckDB` and `_loadCollectorOptions`

**File:** `frontend/src/bee-atlas.ts:375-388` and `frontend/src/bee-atlas.ts:397-421`

**Issue:** The SQL that populates `_collectorOptions` appears twice. `_loadSummaryFromDuckDB` runs it when `viewMode === 'table'`, and `_loadCollectorOptions` runs it again when `_onDataLoaded` fires (map mode). When a user starts in table mode, DuckDB runs the collector query twice: once inside `_loadSummaryFromDuckDB` and once when `bee-map` fires `data-loaded`. The results are identical, so correctness is unaffected, but the second open connection and query are wasted.

**Fix:** Have `_loadSummaryFromDuckDB` set a flag (`_collectorOptionsLoaded`) after populating, and have `_onDataLoaded` skip calling `_loadCollectorOptions` if the flag is set. Alternatively, extract the collector query into a single shared method that is idempotent.

---

### IN-02: Feed index fetch uses a path literal that may not survive sub-path deployments

**File:** `frontend/src/bee-atlas.ts:286`

**Issue:**
```ts
fetch('/data/feeds/index.json')
```

This root-relative path works correctly for the current static deployment at `beeatlas.net`. However, if the app is ever served from a sub-path (e.g., `/atlas/`), the fetch will 404 silently. The `DATA_BASE_URL` constant at line 20 is already designed to be configurable via `VITE_DATA_BASE_URL`; the feed index URL could use the same constant for consistency.

**Fix:** Replace the literal path with one derived from `DATA_BASE_URL`:
```ts
fetch(`${DATA_BASE_URL}/feeds/index.json`)
```

This is a low-priority consistency improvement given the current static-only hosting constraint.

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
