# Phase 58: Elevation Filter - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 4 (2 modified source + 2 modified tests)
**Analogs found:** 4 / 4 (all are the files themselves — additions within existing files)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `frontend/src/filter.ts` | service/model | CRUD / transform | itself — `yearFrom`/`yearTo` clauses | exact |
| `frontend/src/url-state.ts` | utility | request-response | itself — `yr0`/`yr1` param pattern | exact |
| `frontend/src/bee-filter-controls.ts` | component | event-driven | itself — token state sync in `updated` | exact |
| `frontend/src/tests/filter.test.ts` | test | — | itself — `emptyFilter()` + SQL clause tests | exact |
| `frontend/src/tests/url-state.test.ts` | test | — | itself — `buildParams`/`parseParams` round-trip tests | exact |

All five targets are modifications to existing files. No new files are created. Every analog is the target file itself — the existing pattern for years/months/counties is the direct template for elevation.

---

## Pattern Assignments

### `frontend/src/filter.ts` — FilterState extension + isFilterActive + buildFilterSQL

**Analog:** Same file, `yearFrom`/`yearTo` and county patterns.

**FilterState interface** (lines 11–20) — add two fields at the end of the interface:
```typescript
export interface FilterState {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  // ADD after selectedCollectors:
  elevMin: number | null;
  elevMax: number | null;
}
```

**isFilterActive** (lines 207–215) — copy the `|| f.yearFrom !== null` pattern and extend:
```typescript
export function isFilterActive(f: FilterState): boolean {
  return f.taxonName !== null
    || f.yearFrom !== null
    || f.yearTo !== null
    || f.months.size > 0
    || f.selectedCounties.size > 0
    || f.selectedEcoregions.size > 0
    || f.selectedCollectors.length > 0
    || f.elevMin !== null      // ADD
    || f.elevMax !== null;     // ADD
}
```

**buildFilterSQL elevation block** — copy the year-range pattern (lines 236–243) for structure; use the NULL semantics from D-06:
```typescript
// Elevation filter — ecdysis has elevation_m; samples always null per D-07
// Only elevMin set: null records included (unknown elevation passes)
// Only elevMax set: null records included
// Both set: NULL excluded (BETWEEN semantics)
if (f.elevMin !== null && f.elevMax !== null) {
  ecdysisClauses.push(`elevation_m IS NOT NULL AND elevation_m BETWEEN ${f.elevMin} AND ${f.elevMax}`);
  samplesClauses.push(`elevation_m IS NOT NULL AND elevation_m BETWEEN ${f.elevMin} AND ${f.elevMax}`);
} else if (f.elevMin !== null) {
  ecdysisClauses.push(`(elevation_m IS NULL OR elevation_m >= ${f.elevMin})`);
  samplesClauses.push(`(elevation_m IS NULL OR elevation_m >= ${f.elevMin})`);
} else if (f.elevMax !== null) {
  ecdysisClauses.push(`(elevation_m IS NULL OR elevation_m <= ${f.elevMax})`);
  samplesClauses.push(`(elevation_m IS NULL OR elevation_m <= ${f.elevMax})`);
}
```
Insert this block after the collector filter block (before line 278).

**All sites constructing a `FilterState` literal in this file** — add `elevMin: null, elevMax: null` to every object literal. The only such site in `filter.ts` is inside `tokensToFilterState` in `bee-filter-controls.ts` (see below).

---

### `frontend/src/url-state.ts` — buildParams + parseParams + hasFilter

**Analog:** Same file, `yr0`/`yr1` pattern (lines 40–41 for encode; lines 89–90 for decode).

**buildParams — encode** (after line 41, same conditional pattern):
```typescript
// Existing year pattern to copy:
if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));

// New elevation params (same pattern):
if (filter.elevMin !== null) params.set('elev_min', String(filter.elevMin));
if (filter.elevMax !== null) params.set('elev_max', String(filter.elevMax));
```

**parseParams — decode** (after line 90, same `parseInt(...) || null` pattern):
```typescript
// Existing year pattern to copy:
const yearFrom = parseInt(p.get('yr0') ?? '') || null;
const yearTo   = parseInt(p.get('yr1') ?? '') || null;

// New elevation params (same pattern):
const elevMin = parseInt(p.get('elev_min') ?? '') || null;
const elevMax = parseInt(p.get('elev_max') ?? '') || null;
```

**hasFilter condition** (line 120–122) — extend the existing boolean:
```typescript
// Existing:
const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
  || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
  || selectedCollectors.length > 0;

// Extended:
const hasFilter = resolvedTaxonName !== null || yearFrom !== null || yearTo !== null
  || months.size > 0 || selectedCounties.size > 0 || selectedEcoregions.size > 0
  || selectedCollectors.length > 0
  || elevMin !== null || elevMax !== null;   // ADD
```

**result.filter object** (lines 124–134) — add two fields at the end of the object literal:
```typescript
result.filter = {
  taxonName: resolvedTaxonName,
  taxonRank: resolvedTaxonRank,
  yearFrom,
  yearTo,
  months,
  selectedCounties,
  selectedEcoregions,
  selectedCollectors,
  elevMin,    // ADD
  elevMax,    // ADD
};
```

---

### `frontend/src/bee-filter-controls.ts` — state, willUpdate/updated sync, emit, render

**Analog:** Same file, `_tokens` sync in `updated` (lines 347–355) and `_emitTokens` (lines 357–363).

**New @state fields** — add after `_open` (line 247), following the same `@state() private _field: Type` pattern:
```typescript
@state() private _elevMin: number | null = null;
@state() private _elevMax: number | null = null;
```

**tokensToFilterState** (lines 38–60) — add elevation fields to the returned object literal (both null, since elevation is not a token):
```typescript
function tokensToFilterState(tokens: Token[]): FilterState {
  const f: FilterState = {
    taxonName: null, taxonRank: null,
    yearFrom: null, yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,    // ADD
    elevMax: null,    // ADD
  };
  // ... rest unchanged
```

**updated sync** (lines 347–355) — elevation sync follows the same guard pattern as token sync. Elevation is separate from the token equality check because it is not encoded as a token:
```typescript
updated(changedProperties: PropertyValues) {
  if (changedProperties.has('filterState') && this.filterState) {
    // Existing token sync — unchanged:
    if (!filterStatesEqual(tokensToFilterState(this._tokens), this.filterState)) {
      this._tokens = filterStateToTokens(this.filterState);
    }
    // ADD — elevation sync with same guard pattern:
    if (this._elevMin !== this.filterState.elevMin) {
      this._elevMin = this.filterState.elevMin;
    }
    if (this._elevMax !== this.filterState.elevMax) {
      this._elevMax = this.filterState.elevMax;
    }
  }
}
```

**_emitTokens** (lines 357–363) — merge elevation into the dispatched FilterState:
```typescript
private _emitTokens(tokens: Token[]) {
  const f = tokensToFilterState(tokens);
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true, composed: true,
    detail: { ...f, elevMin: this._elevMin, elevMax: this._elevMax },  // CHANGED: merge elev
  }));
}
```

**New elevation input handlers** — add alongside `_onInput`, `_removeToken`, etc.:
```typescript
private _onElevMinInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10);
  this._elevMin = isNaN(raw) ? null : raw;
  this._emitWithElev();
}

private _onElevMaxInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10);
  this._elevMax = isNaN(raw) ? null : raw;
  this._emitWithElev();
}

// Separate helper so elevation events also carry current tokens:
private _emitWithElev() {
  const f = tokensToFilterState(this._tokens);
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true, composed: true,
    detail: { ...f, elevMin: this._elevMin, elevMax: this._elevMax },
  }));
}
```
Note: `_emitTokens` and `_emitWithElev` share the same dispatch shape — consider unifying them if preferred, or simply inline `_emitWithElev` logic into the two handlers.

**render** (lines 457–498) — append `.elev-inputs` div as sibling of `.search-section`, inside the host, using the markup from UI-SPEC:
```typescript
render() {
  return html`
    <div class="search-section">
      <!-- existing token field + suggestions unchanged -->
    </div>
    <div class="elev-inputs">
      <input
        type="number"
        class="elev-input"
        placeholder="↑ min m"
        min="0"
        step="1"
        .value=${this._elevMin !== null ? String(this._elevMin) : ''}
        @input=${this._onElevMinInput}
        aria-label="Minimum elevation in meters"
      />
      <input
        type="number"
        class="elev-input"
        placeholder="max m"
        min="0"
        step="1"
        .value=${this._elevMax !== null ? String(this._elevMax) : ''}
        @input=${this._onElevMaxInput}
        aria-label="Maximum elevation in meters"
      />
    </div>
  `;
}
```

**Static styles** — append to `static styles = css\`...\`` block after the `.suggestion` rules (line 343):
```css
.elev-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-top: 8px;
}
.elev-input {
  width: 72px;
  height: 36px;
  padding: 0 0.4rem;
  border: 1px solid var(--border-input);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-body);
  background: var(--surface);
  box-sizing: border-box;
  -moz-appearance: textfield;
}
.elev-input::-webkit-outer-spin-button,
.elev-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.elev-input::placeholder { color: var(--text-hint); }
.elev-input:focus {
  outline: 1px solid var(--accent);
  border-color: var(--accent);
}
```

---

### `frontend/src/tests/filter.test.ts` — emptyFilter + elevation SQL tests

**Analog:** Same file, `yearFrom`/`yearTo` test pattern (lines 61–73).

**emptyFilter() helper** (lines 18–29) — add two fields:
```typescript
function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,    // ADD
    elevMax: null,    // ADD
  };
}
```

**New describe block for elevation SQL** — copy structure from the `yearFrom`/`yearTo` tests:
```typescript
describe('elevation filter', () => {
  test('elevMin only: both clauses use IS NULL OR >= pattern', () => {
    const f = { ...emptyFilter(), elevMin: 500 };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('(elevation_m IS NULL OR elevation_m >= 500)');
    expect(samplesWhere).toBe('(elevation_m IS NULL OR elevation_m >= 500)');
  });

  test('elevMax only: both clauses use IS NULL OR <= pattern', () => {
    const f = { ...emptyFilter(), elevMax: 1500 };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('(elevation_m IS NULL OR elevation_m <= 1500)');
    expect(samplesWhere).toBe('(elevation_m IS NULL OR elevation_m <= 1500)');
  });

  test('both set: both clauses use BETWEEN (nulls excluded)', () => {
    const f = { ...emptyFilter(), elevMin: 500, elevMax: 1500 };
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(f);
    expect(ecdysisWhere).toBe('elevation_m IS NOT NULL AND elevation_m BETWEEN 500 AND 1500');
    expect(samplesWhere).toBe('elevation_m IS NOT NULL AND elevation_m BETWEEN 500 AND 1500');
  });

  test('neither set: no elevation clause; both return 1 = 1', () => {
    const { ecdysisWhere, samplesWhere } = buildFilterSQL(emptyFilter());
    expect(ecdysisWhere).toBe('1 = 1');
    expect(samplesWhere).toBe('1 = 1');
  });
});
```

**Also update the combined-filters test** (lines 111–143): the `FilterState` object literal there must include `elevMin: null, elevMax: null`.

**isFilterActive tests** — add cases alongside the existing field-check tests or in a new describe block:
```typescript
describe('isFilterActive — elevation', () => {
  test('elevMin set: isFilterActive returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), elevMin: 100 })).toBe(true);
  });
  test('elevMax set: isFilterActive returns true', () => {
    expect(isFilterActive({ ...emptyFilter(), elevMax: 2000 })).toBe(true);
  });
  test('both null: isFilterActive returns false (no other active fields)', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
  });
});
```
Remember to add `isFilterActive` to the import on line 2.

---

### `frontend/src/tests/url-state.test.ts` — emptyFilter + elevation round-trip tests

**Analog:** Same file, `yearFrom`/`yearTo` round-trip tests (lines 43–57).

**emptyFilter() helper** (lines 5–16) — add two fields (same as filter.test.ts):
```typescript
function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,    // ADD
    elevMax: null,    // ADD
  };
}
```

**Also update the combined round-trip test** (lines 129–166): the `filter` object literal must include `elevMin: null, elevMax: null`, and the assertions at the bottom must check `result.filter!.elevMin` and `result.filter!.elevMax` are `null`.

**New describe block** — copy the `yearFrom`/`yearTo` round-trip pattern:
```typescript
describe('elevation param round-trip', () => {
  test('elevMin: round-trips as elev_min', () => {
    const filter = { ...emptyFilter(), elevMin: 500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_min')).toBe('500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMin).toBe(500);
  });

  test('elevMax: round-trips as elev_max', () => {
    const filter = { ...emptyFilter(), elevMax: 1500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_max')).toBe('1500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMax).toBe(1500);
  });

  test('both set: both params present and round-trip', () => {
    const filter = { ...emptyFilter(), elevMin: 500, elevMax: 1500 };
    const params = buildParams(defaultView, filter, defaultSelection, defaultUi);
    expect(params.get('elev_min')).toBe('500');
    expect(params.get('elev_max')).toBe('1500');
    const result = parseParams(params.toString());
    expect(result.filter?.elevMin).toBe(500);
    expect(result.filter?.elevMax).toBe(1500);
  });

  test('neither set: elev_min and elev_max params absent', () => {
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, defaultUi);
    expect(params.has('elev_min')).toBe(false);
    expect(params.has('elev_max')).toBe(false);
  });

  test('invalid elev_min (non-numeric): parses to null, filter absent', () => {
    const result = parseParams('elev_min=abc');
    expect(result.filter?.elevMin ?? null).toBeNull();
  });

  test('elevMin alone triggers hasFilter: result.filter is defined', () => {
    const result = parseParams('elev_min=500');
    expect(result.filter).toBeDefined();
    expect(result.filter!.elevMin).toBe(500);
    expect(result.filter!.elevMax).toBeNull();
  });
});
```

---

## Shared Patterns

### FilterState object literal update sites

Every place a `FilterState` object literal is constructed must gain `elevMin: null, elevMax: null`. Known sites across the phase scope:

| File | Site | Lines |
|------|------|-------|
| `bee-filter-controls.ts` | `tokensToFilterState()` return | ~39–59 |
| `filter.test.ts` | `emptyFilter()` | ~18–29 |
| `filter.test.ts` | combined-filters test literal | ~113–122 |
| `url-state.test.ts` | `emptyFilter()` | ~5–16 |
| `url-state.test.ts` | combined round-trip `filter` literal | ~132–142 |
| `url-state.ts` | `result.filter = { ... }` | ~124–134 |

### parseInt with || null fallback

Used throughout `url-state.ts` for numeric URL params:
```typescript
// Source: url-state.ts lines 89–90
const yearFrom = parseInt(p.get('yr0') ?? '') || null;
const yearTo   = parseInt(p.get('yr1') ?? '') || null;
```
Elevation uses the exact same idiom — `parseInt(p.get('elev_min') ?? '') || null`. Note: `parseInt('') === NaN` and `NaN || null === null`, so absence and non-numeric both yield `null` correctly.

### Conditional absent-when-null URL encoding

```typescript
// Source: url-state.ts lines 40–41
if (filter.yearFrom !== null) params.set('yr0', String(filter.yearFrom));
if (filter.yearTo   !== null) params.set('yr1', String(filter.yearTo));
```
Elevation encodes the same way. Absence from the URL string means the field is unset.

### @state private field + updated guard sync

```typescript
// Source: bee-filter-controls.ts lines 347–355
updated(changedProperties: PropertyValues) {
  if (changedProperties.has('filterState') && this.filterState) {
    if (!filterStatesEqual(tokensToFilterState(this._tokens), this.filterState)) {
      this._tokens = filterStateToTokens(this.filterState);
    }
  }
}
```
Elevation extends this block with simple `!==` guards (no equality helper needed for scalar nullables).

### filter-changed CustomEvent dispatch shape

```typescript
// Source: bee-filter-controls.ts lines 357–363
this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
  bubbles: true, composed: true,
  detail: { ...f },
}));
```
Elevation handlers use the same event name, same bubbles/composed flags, same `FilterChangedEvent` type. The spread `{ ...f }` becomes `{ ...f, elevMin: this._elevMin, elevMax: this._elevMax }` to merge elevation into the token-derived state.

---

## No Analog Found

None. All changes are extensions to existing files following patterns already present in those files.

---

## Metadata

**Analog search scope:** `frontend/src/` (filter.ts, url-state.ts, bee-filter-controls.ts, tests/)
**Files read:** 5
**Pattern extraction date:** 2026-04-15
