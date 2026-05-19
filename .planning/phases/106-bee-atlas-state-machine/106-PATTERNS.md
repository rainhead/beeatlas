# Phase 106: bee-atlas State Machine - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 2 (1 modified source + 1 modified test)
**Analogs found:** 2 / 2 (both files are modified in place; the files themselves are the analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-atlas.ts` | component (coordinator) | event-driven | `src/bee-atlas.ts` (current state) | exact — in-place refactor |
| `src/tests/bee-atlas.test.ts` | test | — | `src/tests/bee-atlas.test.ts` (current state) | exact — in-place update |

## Pattern Assignments

### `src/bee-atlas.ts` (LitElement coordinator, event-driven)

**Analog:** `src/bee-atlas.ts` (current file — this is a pure in-place refactor)

---

**State field declaration pattern** (`src/bee-atlas.ts` lines 19–55):

The existing `@state()` field convention to follow:

```typescript
// CURRENT (lines 36, 53–54) — three fields to DELETE:
@state() private _viewMode: 'map' | 'table' = 'map';
@state() private _sidebarOpen = false;
@state() private _tableFilterOpen = false;

// TARGET — one field to ADD (replaces all three):
@state() private _paneState: 'collapsed' | 'list' | 'table' = 'collapsed';
// _tableFilterOpen becomes a plain private field (non-@state):
private _tableFilterOpen = false;
```

---

**render() — CSS class expression** (`src/bee-atlas.ts` lines 173–177):

```typescript
// CURRENT:
<div class=${[
  'content',
  this._viewMode === 'table' ? 'table-mode' : '',
  this._viewMode === 'map' && this._sidebarOpen ? 'sidebar-open' : '',
].filter(Boolean).join(' ')}>

// TARGET:
<div class=${[
  'content',
  this._paneState === 'table' ? 'table-mode' : '',
  this._paneState === 'list'  ? 'sidebar-open' : '',
].filter(Boolean).join(' ')}>
```

---

**render() — bee-header binding** (`src/bee-atlas.ts` lines 166–169):

```typescript
// CURRENT:
<bee-header
  .viewMode=${this._viewMode}
  @view-changed=${this._onViewChanged}
></bee-header>

// TARGET (Option A — derive value; keep bee-header API unchanged):
<bee-header
  .viewMode=${this._paneState === 'table' ? 'table' : 'map'}
  @view-changed=${this._onViewChanged}
></bee-header>
```

---

**render() — conditional bee-table** (`src/bee-atlas.ts` line 196):

```typescript
// CURRENT:
${this._viewMode === 'table' ? html`<bee-table ...>` : nothing}

// TARGET:
${this._paneState === 'table' ? html`<bee-table ...>` : nothing}
```

---

**render() — bee-filter-panel props** (`src/bee-atlas.ts` lines 218–220):

```typescript
// CURRENT:
.hideButton=${this._viewMode === 'table'}
.externalOpen=${this._tableFilterOpen}
.openUpward=${this._viewMode === 'table'}

// TARGET (drop externalOpen binding; keep imperative setOpen() in _onToggleFilter):
.hideButton=${this._paneState === 'table'}
.openUpward=${this._paneState === 'table'}
```

---

**render() — conditional bee-sidebar** (`src/bee-atlas.ts` line 223):

```typescript
// CURRENT:
${this._viewMode === 'map' && this._sidebarOpen ? html`<bee-sidebar ...>` : nothing}

// TARGET:
${this._paneState === 'list' ? html`<bee-sidebar ...>` : nothing}
```

---

**firstUpdated — paneState restore** (`src/bee-atlas.ts` lines 244–247):

```typescript
// CURRENT:
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._boundaryMode = initBoundaryMode;
this._viewMode = paneState === 'table' ? 'table' : 'map';
if (paneState === 'table') import('./bee-table.ts');

// TARGET (adapter removed; direct assignment):
const paneState = initialParams.ui?.paneState ?? 'collapsed';
this._boundaryMode = initBoundaryMode;
this._paneState = paneState;
if (paneState === 'table') import('./bee-table.ts');
```

---

**_onPopState — paneState restore** (`src/bee-atlas.ts` lines 554–558):

```typescript
// CURRENT:
const paneState = parsed.ui?.paneState ?? 'collapsed';
this._viewMode = paneState === 'table' ? 'table' : 'map';
this._tablePage = 1;
if (this._viewMode === 'table') {
  this._runTableQuery();
}

// TARGET (adapter removed):
const paneState = parsed.ui?.paneState ?? 'collapsed';
this._paneState = paneState;
this._tablePage = 1;
if (this._paneState === 'table') {
  this._runTableQuery();
}
```

The `_sidebarOpen` assignments in `_onPopState` (lines 568, 575, 583, 590) follow the same
`_paneState = 'list'` / `_paneState = 'collapsed'` substitution.

---

**_pushUrlState — adapter removal** (`src/bee-atlas.ts` lines 500–514):

```typescript
// CURRENT:
private _pushUrlState() {
  const paneState: 'list' | 'table' | 'collapsed' =
    this._viewMode === 'table' ? 'table'
    : this._sidebarOpen ? 'list'
    : 'collapsed';
  const params = buildParams(
    this._currentView,
    this._filterState,
    this._selectionBounds && this._sidebarOpen
      ? { type: 'bounds' as const, ...this._selectionBounds }
      : ...

// TARGET (paneState IS _paneState; adapter deleted):
private _pushUrlState() {
  const params = buildParams(
    this._currentView,
    this._filterState,
    this._selectionBounds && this._paneState === 'list'
      ? { type: 'bounds' as const, ...this._selectionBounds }
      : this._selectedCluster
        ? { type: 'cluster' as const, ...this._selectedCluster }
        : { type: 'ids' as const, ids: this._selectedOccIds ?? [] },
    { boundaryMode: this._boundaryMode, paneState: this._paneState }
  );
  // rest unchanged
}
```

---

**_onViewChanged** (`src/bee-atlas.ts` lines 832–847):

```typescript
// CURRENT:
private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
  this._viewMode = e.detail;
  if (this._viewMode === 'table') {
    import('./bee-table.ts');
    this._tableLoading = true;
    this._runTableQuery();
    if (this._loading) { this._loadSummaryFromSQLite(); }
    this._sidebarOpen = false;  // D-08
  } else {
    this._tableFilterOpen = false;
  }
  this._pushUrlState();
}

// TARGET:
private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
  if (e.detail === 'table') {
    this._paneState = 'table';
    import('./bee-table.ts');
    this._tableLoading = true;
    this._runTableQuery();
    if (this._loading) { this._loadSummaryFromSQLite(); }
    this._tableFilterOpen = false;
  } else {
    this._paneState = 'collapsed';   // D-08: sidebar was closed on enter; stays closed on exit
  }
  this._pushUrlState();
}
```

---

**_runTableQuery guard** (`src/bee-atlas.ts` line 467):

```typescript
// CURRENT:
if (this._viewMode !== 'table') return;

// TARGET:
if (this._paneState !== 'table') return;
```

Same substitution applies to the guard at line 929 (`_onDataLoaded`).

---

**_onClose** (`src/bee-atlas.ts` lines 903–910):

```typescript
// CURRENT:
private _onClose() {
  this._selectedOccurrences = null;
  this._selectedOccIds = null;
  this._selectedCluster = null;
  this._selectionBounds = null;
  this._sidebarOpen = false;
  this._pushUrlState();
}

// TARGET:
private _onClose() {
  this._selectedOccurrences = null;
  this._selectedOccIds = null;
  this._selectedCluster = null;
  this._selectionBounds = null;
  this._paneState = 'collapsed';
  this._pushUrlState();
}
```

---

**All `_sidebarOpen = true` sites** (lines 283, 287, 289, 568, 575, 583, 624, 724, 755, 1036):

```typescript
// CURRENT (any of these):
this._sidebarOpen = true;

// TARGET:
this._paneState = 'list';
```

**All `_sidebarOpen = false` sites** (lines 590, 685, 710, 737, 774, 786, 823, 908 — excluding
line 842 which becomes implicit via `_paneState = 'table'`):

```typescript
// CURRENT:
this._sidebarOpen = false;

// TARGET:
this._paneState = 'collapsed';
```

---

**_onToggleFilter** (`src/bee-atlas.ts` lines 849–852) — `_tableFilterOpen` kept as plain field:

```typescript
// CURRENT:
private _onToggleFilter() {
  this._tableFilterOpen = !this._tableFilterOpen;
  (this.shadowRoot?.querySelector('bee-filter-panel') as any)?.setOpen(this._tableFilterOpen);
}

// TARGET (unchanged — _tableFilterOpen is now a plain non-@state field; still drives setOpen):
private _onToggleFilter() {
  this._tableFilterOpen = !this._tableFilterOpen;
  (this.shadowRoot?.querySelector('bee-filter-panel') as any)?.setOpen(this._tableFilterOpen);
}
```

---

### `src/tests/bee-atlas.test.ts` (test, source-scan pattern)

**Analog:** `src/tests/bee-atlas.test.ts` (current file — same structural pattern throughout)

---

**Existing test pattern to copy for new SM-01 block** (`src/tests/bee-atlas.test.ts` lines 131–161
show the SIDE-01 pattern; lines 392–444 show the SEL-06 method-body extraction pattern):

```typescript
// Module-level readFileSync at describe block top (pattern from SIDE-01, line 132):
describe('SM-01: bee-atlas pane state machine (Phase 106)', () => {
  const src = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

  // Simple regex presence test (pattern from SIDE-01 lines 134–136):
  test('bee-atlas.ts declares _paneState as @state() with three-state type', () => {
    expect(src).toMatch(/@state\(\)\s+private\s+_paneState/);
    expect(src).toMatch(/'collapsed'\s*\|\s*'list'\s*\|\s*'table'/);
  });

  // Negation test (pattern from ARCH-02 lines 90–95):
  test('bee-atlas.ts does NOT contain _viewMode field', () => {
    expect(src).not.toMatch(/@state\(\)\s+private\s+_viewMode/);
    expect(src).not.toMatch(/this\._viewMode\s*=/);
  });

  // Method-body extraction test (pattern from SEL-06, lines 439–444):
  test('_onClose sets _paneState = collapsed', () => {
    const methodStart = src.indexOf('private _onClose()');
    const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
    const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
    expect(body).toContain("this._paneState = 'collapsed'");
  });
});
```

---

**Tests to update in SIDE-01 block** (`src/tests/bee-atlas.test.ts` lines 134–143):

```typescript
// CURRENT (lines 134–143) — REPLACE these three tests:
test('bee-atlas.ts declares _sidebarOpen as @state()', () => {
  expect(src).toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
});
test('bee-atlas.ts sets _sidebarOpen = true in _onSpecimenClick', () => {
  expect(src).toMatch(/this\._sidebarOpen\s*=\s*true/);
});
test('bee-atlas.ts sets _sidebarOpen = false in _onClose', () => {
  expect(src).toMatch(/this\._sidebarOpen\s*=\s*false/);
});

// TARGET — same assertions, updated to _paneState:
test('bee-atlas.ts does NOT declare _sidebarOpen as @state()', () => {
  expect(src).not.toMatch(/@state\(\)\s+private\s+_sidebarOpen/);
});
test('bee-atlas.ts sets _paneState = list in occurrence click handler', () => {
  expect(src).toMatch(/this\._paneState\s*=\s*'list'/);
});
test('bee-atlas.ts sets _paneState = collapsed in _onClose', () => {
  const methodStart = src.indexOf('private _onClose()');
  const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
  const body = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
  expect(body).toContain("this._paneState = 'collapsed'");
});
```

---

**Test to update in VIEW-02 block** (`src/tests/bee-atlas.test.ts` line 174–176):

```typescript
// CURRENT (line 174–176):
test('bee-atlas.ts declares _viewMode as @state field', () => {
  expect(src).toMatch(/@state\(\)\s+private\s+_viewMode/);
});

// TARGET:
test('bee-atlas.ts declares _paneState as @state field (replaces _viewMode)', () => {
  expect(src).toMatch(/@state\(\)\s+private\s+_paneState/);
  expect(src).not.toMatch(/@state\(\)\s+private\s+_viewMode/);
});
```

---

**Test to update in SEL-06 block** (`src/tests/bee-atlas.test.ts` line 396):

```typescript
// CURRENT (line 396):
test('SEL-06: _pushUrlState gives _selectionBounds precedence over cluster/ids', () => {
  expect(src).toContain('this._selectionBounds && this._sidebarOpen');
});

// TARGET:
test('SEL-06: _pushUrlState gives _selectionBounds precedence over cluster/ids', () => {
  expect(src).toContain("this._selectionBounds && this._paneState === 'list'");
});
```

---

## Shared Patterns

### @state() field declaration convention
**Source:** `src/bee-atlas.ts` lines 19–55
**Apply to:** The new `_paneState` field declaration

All reactive properties use `@state() private _fieldName: Type = defaultValue;` on a single line.
Non-reactive private fields (like the demoted `_tableFilterOpen`) use `private _fieldName = value;`
without the decorator.

### Method-body extraction pattern for tests
**Source:** `src/tests/bee-atlas.test.ts` lines 428–436 (SEL-06 method body extraction)
**Apply to:** All SM-01 tests that verify specific method behavior

```typescript
const methodStart = src.indexOf('private _methodName(');
const nextPrivate = src.indexOf('\n  private ', methodStart + 1);
const methodBody = src.slice(methodStart, nextPrivate > methodStart ? nextPrivate : undefined);
expect(methodBody).toContain('expected string');
```

### Dynamic import guard
**Source:** `src/bee-atlas.ts` lines 247, 835 (two existing occurrences)
**Apply to:** All paths that set `_paneState = 'table'` — must include `import('./bee-table.ts')`

The dynamic import must fire in: `firstUpdated`, `_onViewChanged`, and `_onPopState` (when
restoring table mode from URL).

## No Analog Found

None — this phase modifies two existing files only. No new files are created.

## Metadata

**Analog search scope:** `src/bee-atlas.ts` (1067 lines, full read), `src/tests/bee-atlas.test.ts`
(552 lines, full read)
**Files scanned:** 2
**Pattern extraction date:** 2026-05-19
