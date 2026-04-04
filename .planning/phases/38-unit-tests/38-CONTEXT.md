# Phase 38: Unit Tests - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add automated unit tests for critical pure logic (url-state.ts, filter.ts) and at least one decomposed Lit component render test. `npm test` must run all test suites and exit non-zero on failure. Creating new production features or modifying existing behavior is out of scope.

</domain>

<decisions>
## Implementation Decisions

### url-state test scope
- **D-01:** Test round-trip (`buildParams` → `parseParams`) for each URL field independently: view (x/y/z), taxon+rank, yearFrom, yearTo, months, occurrenceIds, layerMode, boundaryMode, counties, ecoregions.
- **D-02:** Test one fully-combined case (all fields set simultaneously).
- **D-03:** Test key rejection/validation cases: invalid coordinates (out-of-range lon/lat/zoom) → `view` absent from result; `taxon` param present without `taxonRank` → both treated as absent (null); out-of-range month values → filtered out.
- **D-04:** New file: `src/tests/url-state.test.ts`. No mocking needed — `buildParams`/`parseParams` are pure functions with no imports.

### buildFilterSQL test scope
- **D-05:** Test each filter field individually: taxon at family/genus/species rank, yearFrom, yearTo, months (single and multiple), selectedCounties, selectedEcoregions.
- **D-06:** Test combined case (all fields set simultaneously) — assert both `ecdysisWhere` and `samplesWhere` contain all expected clauses.
- **D-07:** Test empty FilterState → both where clauses equal `'1 = 1'`.
- **D-08:** Test single-quote escaping: a taxon name containing `'` must appear as `''` in the SQL output.
- **D-09:** Test taxon filter ghosts samples: when taxon filter active, `samplesWhere` contains `'1 = 0'`.
- **D-10:** New file: `src/tests/filter.test.ts`. No mocking needed — `buildFilterSQL` is a pure synchronous function.

### Component render test
- **D-11:** Render test targets `bee-specimen-detail` — pure display component with a flat `samples: Sample[]` prop, no `@state`, no side effects.
- **D-12:** Test: mount with a non-empty `samples` fixture → assert `shadowRoot` contains expected text (e.g., `recordedBy` value appears in rendered output). Also mount with empty `samples` → assert no specimen rows rendered.
- **D-13:** Render test added as a new `describe` block in existing `src/tests/bee-sidebar.test.ts` — keeps component structural tests and render tests co-located. Requires the same `vi.mock` setup already present in that file.

### Test runner
- **D-14:** `npm test` (i.e., `vitest`) discovers all three test files automatically — no vite.config.ts changes needed.
- **D-15:** `isFilterActive` is NOT explicitly tested — covered implicitly by `queryVisibleIds` callers, and not listed in success criteria.

### Claude's Discretion
- Exact fixture values for `Sample` records (year, month, recordedBy, fieldNumber, species)
- Whether to use `describe.each` or individual test cases for filter field coverage
- Assertion depth beyond "text appears in shadowRoot" for render test

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source under test
- `frontend/src/url-state.ts` — `buildParams` and `parseParams` — the two functions under test; full interface types defined here
- `frontend/src/filter.ts` — `buildFilterSQL` and `isFilterActive` — pure functions; `FilterState` interface defined here
- `frontend/src/bee-specimen-detail.ts` — component under render test; `@property samples: Sample[]`
- `frontend/src/bee-sidebar.ts` — defines `Sample`, `SampleEvent`, `DataSummary`, `TaxonOption`, `FilterChangedEvent` interfaces

### Existing test infrastructure
- `frontend/src/tests/bee-atlas.test.ts` — established `vi.mock` patterns for duckdb/features/region-layer
- `frontend/src/tests/bee-sidebar.test.ts` — same mock setup; render test goes here as new `describe` block
- `frontend/vite.config.ts` — test config: `environment: 'happy-dom'`, `passWithNoTests: true`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vi.mock('../duckdb.ts', ...)` pattern from both existing test files — required for any test that imports bee-* components (transitive duckdb import). Render test for `bee-specimen-detail` will need it.
- `import { test, expect, describe, vi } from 'vitest'` — explicit import pattern (Phase 33 decision).

### Established Patterns
- Source analysis tests using `readFileSync` — already in use and proven compatible with happy-dom
- Lit property interface tests via `elementProperties` Map — already in use for DECOMP-01/02/03 tests
- `await element.updateComplete` — standard Lit pattern to flush render in tests; not yet used but applicable for render test

### Integration Points
- `buildFilterSQL` returns `{ ecdysisWhere: string; samplesWhere: string }` — assert string content in both fields
- `buildParams` returns `URLSearchParams` — serialize with `.toString()` then pass to `parseParams` for round-trip
- `bee-specimen-detail` uses ShadowDOM — render assertions must use `element.shadowRoot.querySelector(...)` or `element.shadowRoot.textContent`

</code_context>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope.

</deferred>

---

*Phase: 38-unit-tests*
*Context gathered: 2026-04-04*
