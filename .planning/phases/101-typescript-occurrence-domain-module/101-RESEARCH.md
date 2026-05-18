# Phase 101: TypeScript Occurrence Domain Module - Research

**Researched:** 2026-05-18
**Domain:** TypeScript module extraction / pure-function refactoring
**Confidence:** HIGH

---

## Summary

Phase 101 is a pure refactoring: extract occurrence ID construction, ID parsing, and occurrence
type predicates from six scattered call sites into a single authoritative module `src/occurrence.ts`,
then cover that module with Vitest unit tests.

`src/occurrence.ts` does not yet exist. The logic being centralized is currently inlined across
`src/bee-atlas.ts`, `src/bee-table.ts`, `src/features.ts`, `src/filter.ts`, `src/bee-map.ts`,
and `src/bee-occurrence-detail.ts`. There are no abstract type predicates (`isSpecimenBacked`,
`isSampleOnly`, `isProvisional`) anywhere in the codebase — all three conditions are expressed
as raw field comparisons inline.

The `OccurrenceRow` interface (the input type for all functions) lives in `src/filter.ts` and
is already imported by most call-site files. The new `src/occurrence.ts` will import that type
from `filter.ts` to avoid circular dependencies.

**Primary recommendation:** Create `src/occurrence.ts` exporting five pure functions
(`occIdFromRow`, `parseOccId`, `isSpecimenBacked`, `isSampleOnly`, `isProvisional`), update
all six caller files to import from it, and add a `src/tests/occurrence.test.ts` covering all
five exports.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS-01 | `src/occurrence.ts` exports `occIdFromRow(row): string` and `parseOccId(id: string)`; all call sites updated; no inline construction remains | Six call-site locations identified below; exact patterns documented |
| TS-02 | `src/occurrence.ts` exports `isSpecimenBacked`, `isSampleOnly`, `isProvisional` predicates; inline discriminant conditions replaced | All three predicate patterns identified; `is_provisional` field is already on `OccurrenceRow` |
| TS-03 | Vitest unit tests cover all exports; inline-tested logic updated or removed | Vitest 4.1.2 in use; test infrastructure is established; no existing `occurrence.test.ts` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Occurrence ID construction | Frontend module (`occurrence.ts`) | — | Pure function from row data; no I/O |
| Occurrence ID parsing | Frontend module (`occurrence.ts`) | — | Pure function from string; no I/O |
| Occurrence type predicates | Frontend module (`occurrence.ts`) | — | Pure boolean from row fields; no I/O |
| `OccurrenceRow` type definition | `filter.ts` (owner) | consumed by `occurrence.ts` | Already authoritative; importing avoids circular dep |
| Vitest tests | `src/tests/occurrence.test.ts` | — | Per project convention for unit tests |

---

## Current Code Inventory

### `src/occurrence.ts` — Does Not Exist

`occurrence.ts` must be created from scratch. It has no current content.

### Inline ID construction call sites [VERIFIED: grep]

All patterns that must be replaced by `occIdFromRow(row)`:

| File | Line(s) | Current Pattern |
|------|---------|-----------------|
| `src/bee-atlas.ts` | 748 | `r.ecdysis_id != null ? \`ecdysis:${r.ecdysis_id}\` : \`inat:${Number(r.observation_id)}\`` |
| `src/bee-atlas.ts` | 1006 | same pattern (cluster restore path) |
| `src/bee-atlas.ts` | 1026 | same pattern (bounds restore path) |
| `src/bee-table.ts` | 40–41 | `if (row.ecdysis_id != null) return \`ecdysis:${row.ecdysis_id}\`; if (row.observation_id != null) return \`inat:${row.observation_id}\`;` |
| `src/features.ts` | 46–48 | `obj.ecdysis_id != null ? 'ecdysis:' + obj.ecdysis_id : 'inat:' + Number(obj.observation_id)` |
| `src/filter.ts` | 323–324 | `ids.add(\`ecdysis:${Number(ecdysisId)}\`); ... ids.add(\`inat:${Number(obsId)}\`)` (in `queryVisibleIds`) |

Note: `src/bee-table.ts:40–41` is a standalone helper function `rowOccId(row)` — this function
should be replaced by importing `occIdFromRow` from `occurrence.ts`.

### Inline ID parsing call sites [VERIFIED: grep]

All patterns that must be replaced by `parseOccId(id)`:

| File | Line(s) | Current Pattern |
|------|---------|-----------------|
| `src/bee-atlas.ts` | 473–479 | `id.startsWith('ecdysis:')` then `id.slice('ecdysis:'.length)`, same for `inat:` (in `_runTableQuery`) |
| `src/bee-atlas.ts` | 932–938 | `.filter(id => id.startsWith('ecdysis:')).map(id => id.slice('ecdysis:'.length))` and same for `inat:` (in `_restoreSelectionOccurrences`) |

Validation-only uses of `startsWith` (not ID construction/parsing) that can remain as-is:
- `src/url-state.ts:192` — validation filter for URL parsing; this is guard logic, not domain parsing
- `src/features.ts:81` — `totalSpecimens` count via `occId.startsWith('ecdysis:')` — this can be
  replaced by `isSpecimenBacked` on the row before the occId string is produced, or kept as a
  `startsWith` guard on the already-constructed string (see Open Questions)
- `src/bee-map.ts:966` — same pattern on `f.properties.occId.startsWith('ecdysis:')` — operates
  on the `occId` string (already constructed), not a raw row

### Inline predicate call sites [VERIFIED: grep]

All patterns being replaced by named predicates:

**`isSpecimenBacked(row)`** — replaces `r.ecdysis_id != null` used as a discriminant:
- `src/bee-occurrence-detail.ts:247` — `this.occurrences.filter(r => r.ecdysis_id != null)`
- `src/features.ts:55` — `if (obj.ecdysis_id != null)` (summary stats block for specimens only)

**`isSampleOnly(row)`** — replaces `r.ecdysis_id == null && !r.is_provisional` pattern:
- `src/bee-occurrence-detail.ts:248` — `this.occurrences.filter(r => r.ecdysis_id == null)` followed
  by checking `row.is_provisional` in the render loop — the filter at line 248 captures both
  sample-only AND provisional rows; the `is_provisional` branch is chosen inside the `.map()`

**`isProvisional(row)`** — replaces `row.is_provisional` used as a discriminant:
- `src/bee-occurrence-detail.ts:256` — `row.is_provisional ? this._renderProvisional(row) : this._renderSampleOnly(row)`

Note: SQL-layer uses of `ecdysis_id IS NOT NULL` in query strings (e.g. `bee-atlas.ts:356`,
`bee-atlas.ts:373`, `bee-atlas.ts:426`, `filter.ts:297`) are SQL predicates, not TypeScript
discriminants. They stay as SQL strings — the requirement is specifically about TypeScript
discriminant conditions, not SQL.

### `OccurrenceRow` type [VERIFIED: codebase]

The `OccurrenceRow` interface is defined in `src/filter.ts` and includes all fields needed
for the new predicates:

```typescript
// src/filter.ts
export interface OccurrenceRow {
  ecdysis_id: number | null;
  observation_id: number | null;
  is_provisional: boolean;
  // ... 25+ other fields
}
```

`occurrence.ts` will import `OccurrenceRow` from `./filter.ts`.

---

## Standard Stack

No new packages are needed. This is a pure TypeScript extraction.

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | project version | Module authoring |
| Vitest | ^4.1.2 | Unit testing |

**Installation:** none required.

## Package Legitimacy Audit

No new packages are installed in this phase. Section not applicable.

---

## Architecture Patterns

### New Module: `src/occurrence.ts`

```typescript
// Source: [VERIFIED: codebase patterns in filter.ts, bee-atlas.ts, features.ts]

import type { OccurrenceRow } from './filter.ts';

/** Construct a prefixed occurrence ID from a row. */
export function occIdFromRow(row: OccurrenceRow): string {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  return `inat:${Number(row.observation_id)}`;
}

/** Parse a prefixed occurrence ID into source and numeric ID. */
export function parseOccId(id: string): { source: 'ecdysis' | 'inat'; numericId: number } | null {
  if (id.startsWith('ecdysis:')) {
    const n = parseInt(id.slice('ecdysis:'.length), 10);
    return isNaN(n) ? null : { source: 'ecdysis', numericId: n };
  }
  if (id.startsWith('inat:')) {
    const n = parseInt(id.slice('inat:'.length), 10);
    return isNaN(n) ? null : { source: 'inat', numericId: n };
  }
  return null;
}

/** True when the occurrence has an Ecdysis specimen record. */
export function isSpecimenBacked(row: OccurrenceRow): boolean {
  return row.ecdysis_id != null;
}

/** True when the occurrence is an iNat-only sample with no Ecdysis record and not provisional. */
export function isSampleOnly(row: OccurrenceRow): boolean {
  return row.ecdysis_id == null && !row.is_provisional;
}

/** True when the occurrence is a provisional WABA iNat record awaiting Ecdysis match. */
export function isProvisional(row: OccurrenceRow): boolean {
  return row.is_provisional;
}
```

**Key design decisions:**
- `occIdFromRow` assumes `observation_id` is non-null when `ecdysis_id` is null. This mirrors
  the existing inline pattern in `bee-atlas.ts:748` and `features.ts:47`. If both could be null
  (no evidence in the current data), the function should throw or return a fallback — existing
  code does `Number(null)` which yields `0`, making `inat:0` (see Open Questions below).
- `parseOccId` returns a structured result (not just the numeric ID string). The `_runTableQuery`
  and `_restoreSelectionOccurrences` methods in `bee-atlas.ts` both need both the source and the
  number — a structured return avoids callers re-splitting.
- The three predicates encode the three-way occurrence type taxonomy documented in CLAUDE.md.

### Recommended Project Structure (no change)

```
src/
├── occurrence.ts        # NEW — extracted domain module
├── filter.ts            # unchanged type owner; occurrence.ts imports from here
├── features.ts          # updated to import occIdFromRow, isSpecimenBacked
├── bee-atlas.ts         # updated to import occIdFromRow, parseOccId
├── bee-table.ts         # updated to import occIdFromRow (replaces rowOccId fn)
├── bee-occurrence-detail.ts  # updated to import isSpecimenBacked, isSampleOnly, isProvisional
├── tests/
│   └── occurrence.test.ts   # NEW — unit tests for all five exports
```

### Anti-Patterns to Avoid

- **Circular import:** `occurrence.ts` importing from `bee-atlas.ts`, `features.ts`, or any
  component file. Only import from `filter.ts` (type) — no runtime deps.
- **Moving `OccurrenceRow`:** Do not move the type from `filter.ts`. Many files import it there.
  The refactoring goal is to extract functions, not restructure types.
- **SQL string replacement:** Do not replace `ecdysis_id IS NOT NULL` in SQL template strings
  with TypeScript function calls. SQL strings are not in scope.
- **Changing `occIdFromRow` output format:** The string format `ecdysis:N` / `inat:N` is
  load-bearing in URL state (url-state.ts), localStorage, and Mapbox layer IDs. Do not alter it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| ID prefix constant | `const ECDYSIS_PREFIX = 'ecdysis:'` | Inline string literals in occurrence.ts are clear enough; a constants object adds indirection without benefit |
| ID validation regex | Custom regex | The existing `/^\d+$/.test(id)` guard in `_restoreSelectionOccurrences` can stay there — it's a safety invariant on the caller side, not domain logic |

---

## Common Pitfalls

### Pitfall 1: `null` observation_id when ecdysis_id is also null

**What goes wrong:** `occIdFromRow` produces `inat:0` (or `inat:NaN`) if both `ecdysis_id` and
`observation_id` are null. This can happen for provisional rows where `observation_id` is null
(see `bee-sidebar.test.ts:222` — the `provisionalRow` fixture has `observation_id: null`).

**Why it happens:** The current inline pattern `inat:${Number(r.observation_id)}` does `Number(null) = 0`
silently. The existing code paths in `bee-atlas.ts` only call the ID-construction expression on
rows retrieved from the database, so `observation_id` is always non-null in practice. But the
test fixture for provisional rows has it null.

**How to avoid:** Add a guard or explicit handling:
```typescript
export function occIdFromRow(row: OccurrenceRow): string {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  throw new Error(`OccurrenceRow has no ID: ecdysis_id=${row.ecdysis_id}, observation_id=${row.observation_id}`);
}
```
Or match the current silent behavior and document it. Either way, the test file must assert
the chosen behavior.

**Warning signs:** Tests passing `provisionalRow` fixture to `occIdFromRow` return `inat:0`.

### Pitfall 2: `bee-occurrence-detail.ts` sampleOnly split includes provisional rows

**What goes wrong:** The current line 248 filters `r.ecdysis_id == null` to get `sampleOnly` —
but this set includes provisional rows. The subsequent `.map()` at line 255–259 dispatches on
`row.is_provisional`. If `isSampleOnly` is defined as `ecdysis_id == null && !is_provisional`,
the planner must NOT replace line 248's filter with `isSampleOnly` — it must replace the full
two-step pattern (filter at 248 + render dispatch at 255–259) with a single filtering step
using both `isSampleOnly` and `isProvisional` as alternatives.

**How to avoid:** In `bee-occurrence-detail.ts`, replace lines 247–259 with:
```typescript
const specimenBacked = this.occurrences.filter(isSpecimenBacked);
const nonSpecimen = this.occurrences.filter(r => !isSpecimenBacked(r)).sort(...);
// ...
${nonSpecimen.map(row =>
  isProvisional(row) ? this._renderProvisional(row) : this._renderSampleOnly(row)
)}
```

### Pitfall 3: Breaking `rowOccId` in bee-table.ts

**What goes wrong:** `bee-table.ts` has a local `rowOccId(row)` helper function (lines 39–43)
that returns `string | null` (it can return `null` if both IDs are null). The new `occIdFromRow`
in `occurrence.ts` returns `string` (or throws). The planner must handle this divergence —
either make `occIdFromRow` return `string | null`, or keep a thin local wrapper.

**How to avoid:** Either make `occIdFromRow` match the `string | null` contract, or replace the
call sites in `bee-table.ts` individually after checking the context.

### Pitfall 4: Vitest test for `parseOccId` must cover the regex guard path

**What goes wrong:** The existing `_restoreSelectionOccurrences` method in `bee-atlas.ts` has a
`/^\d+$/.test(id)` guard after slicing the prefix. If `parseOccId` returns the numeric ID as a
number (not a string), this guard is no longer applicable in the caller — callers that use
`parseOccId` do not need to re-validate.

**How to avoid:** The unit tests for `parseOccId` must cover: valid ecdysis ID, valid inat ID,
invalid prefix, non-numeric suffix. Return `null` for malformed inputs.

---

## Code Examples

### Calling `occIdFromRow` in `features.ts`

Current (lines 46–48):
```typescript
const occId = obj.ecdysis_id != null
  ? 'ecdysis:' + obj.ecdysis_id
  : 'inat:' + Number(obj.observation_id);
```

After:
```typescript
import { occIdFromRow } from './occurrence.ts';
// ...
const occId = occIdFromRow(obj as OccurrenceRow);
```

Note: `features.ts` uses `obj: Record<string, unknown>` (not `OccurrenceRow`) — a cast or type
assertion will be needed, or the function signature can accept the looser type.

### Calling `parseOccId` in `bee-atlas.ts` `_runTableQuery`

Current (lines 472–479):
```typescript
for (const id of this._selectedOccIds ?? []) {
  if (id.startsWith('ecdysis:')) {
    const n = parseInt(id.slice('ecdysis:'.length), 10);
    if (!isNaN(n)) selEcdysisIds.push(n);
  } else if (id.startsWith('inat:')) {
    const n = parseInt(id.slice('inat:'.length), 10);
    if (!isNaN(n)) selInatIds.push(n);
  }
}
```

After:
```typescript
import { parseOccId } from './occurrence.ts';
// ...
for (const id of this._selectedOccIds ?? []) {
  const parsed = parseOccId(id);
  if (!parsed) continue;
  if (parsed.source === 'ecdysis') selEcdysisIds.push(parsed.numericId);
  else selInatIds.push(parsed.numericId);
}
```

### Vitest test pattern

```typescript
// src/tests/occurrence.test.ts
import { describe, test, expect } from 'vitest';
import { occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional } from '../occurrence.ts';
import type { OccurrenceRow } from '../filter.ts';

// Minimal row factories
const specimenRow = (overrides = {}): OccurrenceRow => ({
  lat: 47, lon: -122, date: '2024-06-01', county: null, ecoregion_l3: null, place_slug: null,
  ecdysis_id: 42, catalog_number: null, scientificName: null, recordedBy: null, fieldNumber: null,
  genus: null, family: null, floralHost: null, host_observation_id: null, inat_host: null,
  inat_quality_grade: null, modified: null, specimen_observation_id: null, elevation_m: null,
  year: 2024, month: 6, observation_id: 99, host_inat_login: null, is_provisional: false,
  specimen_inat_taxon_name: null, specimen_inat_quality_grade: null, specimen_count: null,
  sample_id: null, sample_host: null,
  ...overrides,
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vite.config.ts` (test section inlined) or project root |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TS-01 | `occIdFromRow` produces `ecdysis:N` for specimen row | unit | `npm test -- --reporter=verbose` | Wave 0 — create `src/tests/occurrence.test.ts` |
| TS-01 | `occIdFromRow` produces `inat:N` for sample row | unit | same | Wave 0 |
| TS-01 | `parseOccId` parses `ecdysis:123` correctly | unit | same | Wave 0 |
| TS-01 | `parseOccId` parses `inat:456` correctly | unit | same | Wave 0 |
| TS-01 | `parseOccId` returns null for invalid input | unit | same | Wave 0 |
| TS-02 | `isSpecimenBacked` true when ecdysis_id non-null | unit | same | Wave 0 |
| TS-02 | `isSampleOnly` true when ecdysis_id null + not provisional | unit | same | Wave 0 |
| TS-02 | `isProvisional` true when is_provisional true | unit | same | Wave 0 |
| TS-03 | All existing tests pass after refactoring | regression | `npm test` | Exists |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/occurrence.test.ts` — covers TS-01, TS-02, TS-03 (create in Wave 0)

---

## Security Domain

This phase has no security surface: it is a pure module extraction with no I/O, no authentication,
no input from external sources beyond the already-loaded SQLite row. ASVS categories V2–V6 do not
apply. V5 (input validation) is not applicable since `OccurrenceRow` is typed and comes from
trusted internal SQLite queries.

---

## Open Questions (RESOLVED)

1. **`occIdFromRow` return type: `string` or `string | null`?**
   - What we know: Current inline patterns produce `inat:0` when `observation_id` is null (via `Number(null)`). The `bee-table.ts` `rowOccId` function explicitly returns `string | null`.
   - What's unclear: Should the new function throw, return null, or silently produce `inat:0`?
   - Recommendation: Return `string | null` to match `bee-table.ts` semantics and avoid silent
     `inat:0` bugs. Document that `inat:0` is a sentinel that means "no ID available".
   - **RESOLVED: `string | null` — matches `bee-table.ts` `rowOccId` contract; avoids silent `inat:0` bug for null `observation_id` rows.**

2. **`features.ts` uses `obj: Record<string, unknown>`, not `OccurrenceRow`**
   - What we know: `loadOccurrenceGeoJSON` builds rows from raw SQLite callbacks and never
     calls `Object.assign<OccurrenceRow>`.
   - What's unclear: Should `occIdFromRow` accept `Record<string, unknown>` or should `features.ts`
     cast to `OccurrenceRow` before calling?
   - Recommendation: Cast to `OccurrenceRow` at the call site in `features.ts` — this is the
     pattern used in `bee-atlas.ts:965` and elsewhere.
   - **RESOLVED: Cast to `OccurrenceRow` at the call site in `features.ts` — consistent with `bee-atlas.ts:965` pattern.**

3. **`url-state.ts:192` startsWith guard — replace or keep?**
   - What we know: The filter is validation logic to reject garbage URL values, not ID construction.
     It checks that incoming URL param segments look like valid IDs.
   - Recommendation: Keep as-is — this is validation, not domain parsing. The success criteria
     only requires that no file *constructs* the prefixed ID inline; validation predicates on
     pre-existing strings are not in scope.
   - **RESOLVED: Keep as-is — URL input validation, not domain parsing. Out of scope for success-criteria greps.**

4. **`bee-map.ts:966` and `features.ts:81` startsWith — replace or keep?**
   - What we know: Both operate on `occId: string` (already constructed) to count specimens.
     They are not constructing IDs from rows.
   - Recommendation: The success criteria (`grep -r '"ecdysis:"'`) checks for the string literal
     `"ecdysis:"` — the `startsWith('ecdysis:')` calls use single quotes in JS/TS and may or may
     not match depending on the grep. Verify this with the actual grep before claiming success.
     Alternatively, introduce a helper `isSpecimenId(occId: string): boolean` in `occurrence.ts`
     to replace these `startsWith` guards — this would make them domain-aware even when operating
     on strings rather than rows.
   - **RESOLVED: Export `isSpecimenId(occId: string): boolean` from `occurrence.ts`; replace `startsWith('ecdysis:')` guards in `features.ts:81` and `bee-map.ts:966` with it.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The six caller files are exactly the ones identified by grep; no other files construct prefixed occurrence IDs | Current Code Inventory | A missed file would fail the success-criteria grep after the refactor |
| A2 | `filter.ts` is the stable home for `OccurrenceRow`; it will not be moved in a parallel phase | Architecture | Circular import if `occurrence.ts` imports from a file that imports from `occurrence.ts` |

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — pure TypeScript module extraction).

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Inline `ecdysis:${id}` string templates | Centralized `occIdFromRow` | Eliminates 6 duplication sites |
| Inline `ecdysis_id != null` discriminant | Named predicate functions | Makes occurrence type taxonomy explicit and testable |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: grep] — All call sites identified by direct grep of `/Users/rainhead/dev/beeatlas/src/`
- [VERIFIED: codebase] — `OccurrenceRow` interface in `src/filter.ts`
- [VERIFIED: codebase] — `src/occurrence.ts` does not exist (`ls src/` output)
- [VERIFIED: codebase] — Vitest version from `package.json`: `^4.1.2`

### Secondary (MEDIUM confidence)
- [ASSUMED] — The `place_slug` field added by v3.7 Places is in `OccurrenceRow` — confirmed in `filter.ts:31` and `filter.ts:59`; `bee-table.test.ts:12` fixture does not include it, which may indicate the test fixture is stale (low risk: fixture is test-only)

---

## Metadata

**Confidence breakdown:**
- Call site inventory: HIGH — verified by grep against live codebase
- Predicate semantics: HIGH — verified against render logic in `bee-occurrence-detail.ts` and test fixtures in `bee-sidebar.test.ts`
- New module design: HIGH — follows established project patterns (see `src/url-state.ts` as analogous pure-function module)
- Pitfall about null observation_id: HIGH — confirmed by test fixture `provisionalRow` having `observation_id: null`

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable domain; only at risk if `OccurrenceRow` is restructured)
