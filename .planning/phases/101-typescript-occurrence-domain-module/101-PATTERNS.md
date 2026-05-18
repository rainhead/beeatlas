# Phase 101: TypeScript Occurrence Domain Module - Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 8 (2 create, 6 modify)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/occurrence.ts` | utility (pure-function domain module) | transform | `src/url-state.ts` | role-match (same: pure functions, typed input, no I/O) |
| `src/tests/occurrence.test.ts` | test | transform | `src/tests/url-state.test.ts` | exact (same: pure-function unit tests, factory helpers, describe/test/expect) |
| `src/bee-atlas.ts` | component | request-response | self (modify) | — (import addition + inline replacement) |
| `src/bee-table.ts` | component | request-response | self (modify) | — (local helper deletion + import addition) |
| `src/features.ts` | service | transform | self (modify) | — (import addition + inline replacement) |
| `src/filter.ts` | service | CRUD | self (modify) | — (import addition + inline replacement) |
| `src/bee-occurrence-detail.ts` | component | request-response | self (modify) | — (import addition + inline predicate replacement) |
| `src/bee-map.ts` | component | request-response | self (if in scope) | — (startsWith guard review only) |

## Pattern Assignments

### `src/occurrence.ts` (utility, transform)

**Analog:** `src/url-state.ts`

**Imports pattern** (`src/url-state.ts` lines 16–16):
```typescript
import type { FilterState, CollectorEntry } from './filter.ts';
```
Apply: `occurrence.ts` follows identical convention — `import type` for the input type, relative `.ts` extension.

**Core pattern** (`src/url-state.ts` lines 41–91 and 93–232):
```typescript
// Pure exported functions; no classes, no side effects, no module-level mutable state.
// Each function takes typed inputs and returns typed outputs.
export function buildParams(
  view: ViewState,
  filter: FilterState,
  selection: SelectionState,
  ui: UiState
): URLSearchParams { ... }

export function parseParams(search: string): Partial<AppState> { ... }
```
Apply: `occurrence.ts` exports five pure functions in the same style. No default export; all named exports.

**Error handling pattern** (`src/url-state.ts` lines 97–106, 117–124):
```typescript
// Defensive parsing: return null / undefined on invalid input rather than throwing.
const x = parseFloat(p.get('x') ?? '');
const lonValid = isFinite(x) && x >= -180 && x <= 180;
if (lonValid && latValid && zoomValid) {
  result.view = { lon: x, lat: y, zoom: z };
}
```
Apply: `parseOccId` returns `null` for invalid/unrecognized input. `occIdFromRow` should throw (or return `null`) when both IDs are null — see Pitfall 1 in RESEARCH.md. The RESEARCH recommends a guard + throw:
```typescript
export function occIdFromRow(row: OccurrenceRow): string {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  throw new Error(`OccurrenceRow has no ID: ecdysis_id=${row.ecdysis_id}, observation_id=${row.observation_id}`);
}
```
Note: `bee-table.ts`'s local `rowOccId` returns `string | null`. The planner must decide whether `occIdFromRow` throws or returns null — and handle the `bee-table.ts` divergence accordingly (either match `string | null` or keep a thin wrapper there).

**Type definition pattern** (`src/url-state.ts` lines 18–39):
```typescript
export interface ViewState {
  lon: number;
  lat: number;
  zoom: number;
}
export type SelectionState =
  | { type: 'ids'; ids: string[] }
  | { type: 'cluster'; lon: number; lat: number; radiusM: number }
  | { type: 'bounds'; west: number; south: number; east: number; north: number };
```
Apply: `parseOccId` returns a structured type. Define it inline:
```typescript
export function parseOccId(id: string): { source: 'ecdysis' | 'inat'; numericId: number } | null
```
No need to export the return type as a named interface unless callers need to annotate variables.

---

### `src/tests/occurrence.test.ts` (test, transform)

**Analog:** `src/tests/url-state.test.ts`

**Imports pattern** (`src/tests/url-state.test.ts` lines 1–4):
```typescript
import { test, expect, describe } from 'vitest';
import { buildParams, parseParams } from '../url-state.ts';
import type { FilterState } from '../filter.ts';
import type { SelectionState } from '../url-state.ts';
```
Apply for `occurrence.test.ts`:
```typescript
import { describe, test, expect } from 'vitest';
import { occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional } from '../occurrence.ts';
import type { OccurrenceRow } from '../filter.ts';
```
No mocking needed — `occurrence.ts` has no I/O or module-level side effects.

**Factory helper pattern** (`src/tests/url-state.test.ts` lines 6–24):
```typescript
function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    // ... all fields with defaults
  };
}
const defaultView = { lon: -120.5, lat: 47.3, zoom: 8 };
```
Apply: Define minimal row factories for each occurrence type. The `OccurrenceRow` has 30 fields — use spread overrides:
```typescript
const BASE_ROW: OccurrenceRow = {
  lat: 47, lon: -122, date: '2024-06-01', county: null, ecoregion_l3: null, place_slug: null,
  ecdysis_id: null, catalog_number: null, scientificName: null, recordedBy: null, fieldNumber: null,
  genus: null, family: null, floralHost: null, host_observation_id: null, inat_host: null,
  inat_quality_grade: null, modified: null, specimen_observation_id: null, elevation_m: null,
  year: 2024, month: 6, observation_id: null, host_inat_login: null, is_provisional: false,
  specimen_inat_taxon_name: null, specimen_inat_quality_grade: null, specimen_count: null,
  sample_id: null, sample_host: null,
};

const specimenRow = (overrides: Partial<OccurrenceRow> = {}): OccurrenceRow =>
  ({ ...BASE_ROW, ecdysis_id: 42, observation_id: 99, ...overrides });
const sampleRow = (overrides: Partial<OccurrenceRow> = {}): OccurrenceRow =>
  ({ ...BASE_ROW, observation_id: 456, ...overrides });
const provisionalRow = (overrides: Partial<OccurrenceRow> = {}): OccurrenceRow =>
  ({ ...BASE_ROW, observation_id: null, is_provisional: true, ...overrides });
```

**Test structure pattern** (`src/tests/url-state.test.ts` lines 26–169):
```typescript
describe('buildParams -> parseParams round-trip', () => {
  test('view: lon/lat/zoom round-trips within toFixed precision', () => {
    // Arrange
    const view = { lon: -120.5, lat: 47.3, zoom: 8 };
    // Act
    const params = buildParams(view, emptyFilter(), defaultSelection, defaultUi);
    const result = parseParams(params.toString());
    // Assert
    expect(result.view).toBeDefined();
  });
  // ...
  test('invalid @lon,lat,r with out-of-range lon: selection undefined', () => {
    const result = parseParams('o=@999,47,100');
    expect(result.selection).toBeUndefined();
  });
});
```
Apply: Group tests by function under `describe` blocks. Test both happy path and invalid inputs. Use plain `test` (not `it`). No `beforeEach`/`afterEach` needed for pure functions.

---

### `src/bee-atlas.ts` (modify — import addition + inline replacement)

**Current imports** (`src/bee-atlas.ts` lines 1–9):
```typescript
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { type FilterState, type CollectorEntry, isFilterActive, queryVisibleIds, queryTablePage, buildCsvFilename, type OccurrenceRow, OCCURRENCE_COLUMNS, type SpecimenSortBy, queryOccurrencesByBounds } from './filter.ts';
import { buildParams, parseParams } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
```
Pattern to follow: Add `occurrence.ts` import on a new line after the `filter.ts` import line:
```typescript
import { occIdFromRow, parseOccId } from './occurrence.ts';
```

**Replacement site 1 — `_runTableQuery` (lines 472–480):**
```typescript
// Current:
for (const id of this._selectedOccIds ?? []) {
  if (id.startsWith('ecdysis:')) {
    const n = parseInt(id.slice('ecdysis:'.length), 10);
    if (!isNaN(n)) selEcdysisIds.push(n);
  } else if (id.startsWith('inat:')) {
    const n = parseInt(id.slice('inat:'.length), 10);
    if (!isNaN(n)) selInatIds.push(n);
  }
}
// After:
for (const id of this._selectedOccIds ?? []) {
  const parsed = parseOccId(id);
  if (!parsed) continue;
  if (parsed.source === 'ecdysis') selEcdysisIds.push(parsed.numericId);
  else selInatIds.push(parsed.numericId);
}
```

**Replacement sites 2–4 (lines 748, 1006, 1026) — occIdFromRow:**
```typescript
// Current pattern (three sites):
r.ecdysis_id != null ? `ecdysis:${r.ecdysis_id}` : `inat:${Number(r.observation_id)}`
// After:
occIdFromRow(r)
```

---

### `src/bee-table.ts` (modify — delete local helper + import)

**Current local helper** (`src/bee-table.ts` lines 39–43):
```typescript
function rowOccId(row: OccurrenceRow): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  return null;
}
```
**Action:** Delete this function. Add import at line 3 alongside existing filter import:
```typescript
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';
import { occIdFromRow } from './occurrence.ts';
```
**Note:** `rowOccId` returns `string | null`. If `occIdFromRow` throws on both-null rows, callers that previously handled `null` must be updated. Grep `bee-table.ts` for `rowOccId(` call sites and check whether the `null` return was handled before replacing.

---

### `src/features.ts` (modify — import addition + inline replacement)

**Current imports** (`src/features.ts` lines 1–3):
```typescript
import type { FeatureCollection, Point, Feature } from 'geojson';
import { getDB, tablesReady } from './sqlite.ts';
import { recencyTier } from './style.ts';
```
**Action:** Add import:
```typescript
import { occIdFromRow, isSpecimenBacked } from './occurrence.ts';
import type { OccurrenceRow } from './filter.ts';
```

**Replacement site (lines 46–48):**
```typescript
// Current:
const occId = obj.ecdysis_id != null
  ? 'ecdysis:' + obj.ecdysis_id
  : 'inat:' + Number(obj.observation_id);

// After:
const occId = occIdFromRow(obj as OccurrenceRow);
```

**Replacement site (line 55):**
```typescript
// Current:
if (obj.ecdysis_id != null) {
// After:
if (isSpecimenBacked(obj as OccurrenceRow)) {
```

---

### `src/filter.ts` (modify — import addition + inline replacement)

**Replacement site** (`src/filter.ts` lines 323–324):
```typescript
// Current:
if (ecdysisId != null) ids.add(`ecdysis:${Number(ecdysisId)}`);
if (obsId != null) ids.add(`inat:${Number(obsId)}`);
```
Note: This site does NOT have a typed `OccurrenceRow` — it receives raw SQLite column values. The planner must decide whether to construct a partial row object and call `occIdFromRow`, or keep inline construction here. The RESEARCH marks this as a call site to replace, but the data is raw primitives, not a row. A minimal inline reconstruction approach:
```typescript
// Possible after (if occIdFromRow is called):
const partialRow = { ecdysis_id: ecdysisId as number | null, observation_id: obsId as number | null, is_provisional: false } as OccurrenceRow;
ids.add(occIdFromRow(partialRow));
// OR: keep inline for this site since it's raw SQL data, not a typed row.
```
The planner should prefer keeping inline here if `occIdFromRow` requires a full `OccurrenceRow`.

**Import to add** (top of `src/filter.ts`):
```typescript
import { occIdFromRow } from './occurrence.ts';
```
Warning: `filter.ts` defines `OccurrenceRow`. `occurrence.ts` imports from `filter.ts`. A circular import results if `filter.ts` imports from `occurrence.ts`. If the planner opts to use `occIdFromRow` in `filter.ts`, verify this is not circular — it is NOT circular because `occurrence.ts` only imports the TYPE (`import type`), which is erased at runtime, and TypeScript does allow type-only circular imports in some cases. However, to be safe, the inline pattern can stay in `filter.ts` since it's raw primitives, not a typed row.

---

### `src/bee-occurrence-detail.ts` (modify — import addition + predicate replacement)

**Current imports** (`src/bee-occurrence-detail.ts` lines 1–3):
```typescript
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow } from './filter.ts';
```
**Action:** Add import:
```typescript
import { isSpecimenBacked, isSampleOnly, isProvisional } from './occurrence.ts';
```

**Replacement site** (`src/bee-occurrence-detail.ts` lines 247–259):
```typescript
// Current (lines 247–259):
const specimenBacked = this.occurrences.filter(r => r.ecdysis_id != null);
const sampleOnly = this.occurrences.filter(r => r.ecdysis_id == null)
  .sort((a, b) => b.date.localeCompare(a.date));
// ...
${sampleOnly.map(row =>
  row.is_provisional
    ? this._renderProvisional(row)
    : this._renderSampleOnly(row)
)}

// After (per RESEARCH Pitfall 2 — the filter at line 248 captures both sample-only AND provisional):
const specimenBacked = this.occurrences.filter(isSpecimenBacked);
const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r))
  .sort((a, b) => b.date.localeCompare(a.date));
// ...
${nonSpecimen.map(row =>
  isProvisional(row)
    ? this._renderProvisional(row)
    : this._renderSampleOnly(row)
)}
```
Note: `isSampleOnly` is NOT used as the non-specimen filter because it excludes provisional rows. The non-specimen partition is `!isSpecimenBacked`, and then `isProvisional` dispatches within it.

---

## Shared Patterns

### Pure-function module structure
**Source:** `src/url-state.ts` (entire file)
**Apply to:** `src/occurrence.ts`

- File begins with a comment block or reference link if needed (see `url-state.ts` lines 1–14)
- Named `import type` for input types; no default export
- All functions exported individually
- No module-level mutable state
- No classes

### Test file structure
**Source:** `src/tests/url-state.test.ts` (entire file)
**Apply to:** `src/tests/occurrence.test.ts`

- Import `{ describe, test, expect }` from `'vitest'` — no `it`, no `beforeEach` for pure functions
- Import the module under test with relative path and `.ts` extension
- Define factory helpers (not class instances) for test inputs
- Group tests by function name using `describe`
- Test both valid and invalid/edge inputs

### Relative import convention with `.ts` extension
**Source:** `src/url-state.ts` line 16, `src/bee-atlas.ts` lines 3–5
```typescript
import type { FilterState } from './filter.ts';
import { buildParams, parseParams } from './url-state.ts';
```
**Apply to:** All new imports in `src/occurrence.ts` and all call-site modifications. Always use explicit `.ts` extension in import paths — the project does not use path aliases or barrel files.

### `import type` for cross-module types
**Source:** `src/bee-table.ts` line 3, `src/bee-occurrence-detail.ts` line 3
```typescript
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';
```
**Apply to:** `src/occurrence.ts` — use `import type { OccurrenceRow }` since the type is erased at runtime.

---

## No Analog Found

No files in this phase lack an analog. All files either have a clear existing analog or are modifications to existing files.

---

## Circular Import Warning

`src/occurrence.ts` imports `OccurrenceRow` from `src/filter.ts` (type-only). If `src/filter.ts` were to import from `src/occurrence.ts` at runtime, a circular dependency would be created. The safest resolution: keep the two raw string constructions in `filter.ts:queryVisibleIds` (lines 323–324) as inline patterns rather than importing `occIdFromRow`. This keeps `filter.ts` free of any import from `occurrence.ts` and eliminates the circular risk entirely.

---

## Metadata

**Analog search scope:** `src/`, `src/tests/`
**Files read:** `src/url-state.ts`, `src/tests/url-state.test.ts`, `src/tests/bee-sidebar.test.ts`, `src/tests/bee-table.test.ts`, `src/tests/filter.test.ts`, `src/bee-table.ts`, `src/bee-occurrence-detail.ts`, `src/features.ts`, `src/filter.ts`, `src/bee-atlas.ts` (imports + two target sections), `vite.config.ts`
**Pattern extraction date:** 2026-05-18
