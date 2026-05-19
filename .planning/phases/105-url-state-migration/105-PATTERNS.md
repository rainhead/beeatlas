# Phase 105: URL State Migration - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/url-state.ts` | utility | request-response | `src/url-state.ts` (self — surgical edit) | exact |
| `src/bee-atlas.ts` | component (LitElement) | request-response | `src/bee-atlas.ts` (self — call-site updates) | exact |
| `src/tests/url-state.test.ts` | test | — | `src/tests/url-state.test.ts` (self — new describe block) | exact |
| `src/tests/bee-atlas.test.ts` | test | — | `src/tests/bee-atlas.test.ts` (self — regex update) | exact |

## Pattern Assignments

### `src/url-state.ts` — UiState rename + buildParams + parseParams

**Analog:** `src/url-state.ts` (self)

**Current UiState** (lines 29-32) — DELETE `viewMode`, ADD `paneState`:
```typescript
// BEFORE (delete viewMode field):
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  viewMode: 'map' | 'table';
}

// AFTER:
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
}
```

**buildParams omit-when-default pattern** (lines 72-74) — the existing `boundaryMode` pattern is the model:
```typescript
// EXISTING (line 73) — model to copy:
if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);

// REPLACE line 74 with (remove old view= write, add pane= write):
// OLD: if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
// NEW:
if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);
```

**parseParams UI section** (lines 217-229) — replace the `viewMode` block entirely:
```typescript
// EXISTING (lines 224-229) — REPLACE this block:
const viewRaw = p.get('view') ?? '';
const viewMode: 'map' | 'table' = viewRaw === 'table' ? 'table' : 'map';
// Include UI when non-default values present
if (boundaryMode !== 'off' || viewMode !== 'map') {
  result.ui = { boundaryMode, viewMode };
}

// NEW — Option A from RESEARCH.md (pane= takes precedence, view= is legacy alias):
const paneRaw = p.get('pane') ?? '';
const viewRaw = p.get('view') ?? '';   // legacy — read but not written (URL-02)
const paneState: 'list' | 'table' | 'collapsed' =
  paneRaw === 'list'   ? 'list'   :
  paneRaw === 'table'  ? 'table'  :
  viewRaw === 'table'  ? 'table'  :   // URL-02 backward compat
  'collapsed';
if (boundaryMode !== 'off' || paneState !== 'collapsed') {
  result.ui = { boundaryMode, paneState };
}
```

---

### `src/bee-atlas.ts` — 4 call site updates

**Analog:** `src/bee-atlas.ts` (self)

**Call site 1 — `firstUpdated` restore** (line 244):
```typescript
// EXISTING (line 244):
const initViewMode = initialParams.ui?.viewMode ?? 'map';

// NEW — temporary Phase-105 adapter (Phase 106 removes _viewMode entirely):
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
// pane=list treated as map mode in Phase 105 (no dedicated list state yet)
```

**Call site 2 — `firstUpdated` buildParams** (line 299):
```typescript
// EXISTING (line 299):
{ boundaryMode: initBoundaryMode, viewMode: initViewMode }

// NEW:
{ boundaryMode: initBoundaryMode, paneState }
```
Note: `initViewMode` variable is no longer needed after the call site 1 change; `paneState` comes from the new adapter above.

**Call site 3 — `_pushUrlState`** (line 509):
```typescript
// EXISTING (lines 500-510):
private _pushUrlState() {
  const params = buildParams(
    this._currentView,
    this._filterState,
    this._selectionBounds && this._sidebarOpen
      ? { type: 'bounds' as const, ...this._selectionBounds }
      : this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
    { boundaryMode: this._boundaryMode, viewMode: this._viewMode }   // <-- line 509
  );

// NEW — temporary adapter derives paneState from existing _viewMode + _sidebarOpen:
  const paneState: 'list' | 'table' | 'collapsed' =
    this._viewMode === 'table' ? 'table'
    : this._sidebarOpen ? 'list'
    : 'collapsed';
  const params = buildParams(
    this._currentView,
    this._filterState,
    this._selectionBounds && this._sidebarOpen
      ? { type: 'bounds' as const, ...this._selectionBounds }
      : this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
    { boundaryMode: this._boundaryMode, paneState }
  );
```

**Call site 4 — `_onPopState` restore** (line 551):
```typescript
// EXISTING (line 551):
this._viewMode = parsed.ui?.viewMode ?? 'map';

// NEW — same adapter pattern as firstUpdated:
const paneState = parsed.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
```

---

### `src/tests/url-state.test.ts` — new describe block

**Analog:** `src/tests/url-state.test.ts` (self — copy the `boundaryMode` test pattern)

**Test fixture pattern** (lines 22-24) — `defaultUi` will need updating since `viewMode` is gone:
```typescript
// EXISTING line 24:
const defaultUi = { boundaryMode: 'off' as const, viewMode: 'map' as const };

// NEW (collapsed is the default):
const defaultUi = { boundaryMode: 'off' as const, paneState: 'collapsed' as const };
```

**Existing tests that reference `viewMode` must be updated.** Affected tests (lines 80, 93-98, 100-103, 188, 207-208, 351-355):
- Line 80: `{ boundaryMode: 'counties' as const, viewMode: 'map' as const }` → `paneState: 'collapsed'`
- Lines 93-98: `viewMode: 'table' as const` → `paneState: 'table' as const`; `result.ui?.viewMode` → `result.ui?.paneState`; `params.get('view')` → `params.get('pane')`; `params.has('view')` → `params.has('pane')`
- Lines 100-103: `viewMode=map (default): view param is absent` → update description; `params.has('view')` → `params.has('pane')`
- Lines 188, 207-208: combined round-trip test — `viewMode: 'table' as const` → `paneState: 'table' as const`; `result.ui!.viewMode` → `result.ui!.paneState`
- Lines 351-355: place filter test — `viewMode: 'map' as const` → `paneState: 'collapsed' as const`

**New describe block pattern** (copy from existing `boundaryMode` tests at lines 79-90):
```typescript
describe('pane state param (URL-01, URL-02)', () => {
  test('pane=table: buildParams emits pane=table', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'table' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('pane')).toBe('table');
    expect(params.has('view')).toBe(false);   // old param not emitted
  });

  test('pane=list: buildParams emits pane=list', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'list' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.get('pane')).toBe('list');
  });

  test('pane=collapsed (default): pane param absent', () => {
    const ui = { boundaryMode: 'off' as const, paneState: 'collapsed' as const };
    const params = buildParams(defaultView, emptyFilter(), defaultSelection, ui);
    expect(params.has('pane')).toBe(false);
  });

  test('legacy view=table: parsed as pane=table (URL-02)', () => {
    const result = parseParams('view=table');
    expect(result.ui?.paneState).toBe('table');
  });

  test('pane=table takes precedence over view=table', () => {
    const result = parseParams('pane=table&view=table');
    expect(result.ui?.paneState).toBe('table');
  });

  test('pane=list round-trips', () => {
    const result = parseParams('pane=list');
    expect(result.ui?.paneState).toBe('list');
  });
});
```

---

### `src/tests/bee-atlas.test.ts` — VIEW-02 text-scan assertion updates

**Analog:** `src/tests/bee-atlas.test.ts` (self)

**Test pattern** (lines 163-181) — these two regex-against-source tests must be updated:
```typescript
// EXISTING (lines 174-179) — both regexes will fail after Phase 105 renames:
test('bee-atlas.ts declares _viewMode as @state field', () => {
  expect(src).toMatch(/@state\(\)\s+private\s+_viewMode/);
});

test('bee-atlas.ts _onPopState restores _viewMode from URL', () => {
  expect(src).toMatch(/this\._viewMode\s*=\s*parsed\.ui\?\.viewMode\s*\?\?\s*'map'/);
});

// NEW — Phase 105 keeps _viewMode as the internal field name (paneState is the URL
// param name only); the @state declaration test stays valid. Only the _onPopState
// restore assertion changes because parsed.ui?.viewMode is replaced by parsed.ui?.paneState:
test('bee-atlas.ts declares _viewMode as @state field', () => {
  expect(src).toMatch(/@state\(\)\s+private\s+_viewMode/);   // unchanged — field name not renamed
});

test('bee-atlas.ts _onPopState reads paneState from URL (Phase 105)', () => {
  expect(src).toMatch(/parsed\.ui\?\.paneState/);
});
```

Note: `_viewMode` the field is NOT renamed in Phase 105 (that is Phase 106's job). Only `parsed.ui?.viewMode` → `parsed.ui?.paneState` changes in the restore logic, so the first assertion remains valid. Only the second assertion regex changes.

---

## Shared Patterns

### Default-omission in buildParams
**Source:** `src/url-state.ts` line 73
**Apply to:** pane state serialization
```typescript
// Pattern: only write param when value is non-default
if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);
// Mirror for paneState:
if (ui.paneState !== 'collapsed') params.set('pane', ui.paneState);
```

### Strict-allowlist enum parsing in parseParams
**Source:** `src/url-state.ts` lines 111-112, 221-223
**Apply to:** `paneRaw` validation in the new pane block
```typescript
// Pattern: ternary chain with explicit valid values, fallback to default
const taxonRank = (['family', 'genus', 'species'] as const).includes(rawRank as any)
  ? rawRank as 'family' | 'genus' | 'species' : null;
// Mirror for paneState:
const paneState: 'list' | 'table' | 'collapsed' =
  paneRaw === 'list' ? 'list' : paneRaw === 'table' ? 'table' : ...
```

### Include-when-non-default guard for result.ui
**Source:** `src/url-state.ts` lines 227-229
**Apply to:** Updated UI section in parseParams
```typescript
// Pattern: populate result sub-object only when something is non-default
if (boundaryMode !== 'off' || viewMode !== 'map') {
  result.ui = { boundaryMode, viewMode };
}
// Replace with:
if (boundaryMode !== 'off' || paneState !== 'collapsed') {
  result.ui = { boundaryMode, paneState };
}
```

### Temporary adapter pattern in bee-atlas.ts call sites
**Source:** RESEARCH.md code examples
**Apply to:** All three `_viewMode`/`buildParams` call sites in bee-atlas.ts
```typescript
// Pattern: derive paneState from existing _viewMode + _sidebarOpen for _pushUrlState
const paneState: 'list' | 'table' | 'collapsed' =
  this._viewMode === 'table' ? 'table'
  : this._sidebarOpen ? 'list'
  : 'collapsed';

// Pattern: derive _viewMode from paneState for firstUpdated + _onPopState
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
```

## No Analog Found

None — all four files are self-referential modifications. No new files are created.

## Metadata

**Analog search scope:** `src/url-state.ts`, `src/bee-atlas.ts`, `src/tests/url-state.test.ts`, `src/tests/bee-atlas.test.ts`
**Files scanned:** 4
**Pattern extraction date:** 2026-05-19
